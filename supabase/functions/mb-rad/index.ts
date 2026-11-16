// mb-rad (Roadmap W.5/W.6): Protokoll und Tags des Albumrads. Kein Supabase-Login – wer aufruft, weist sich mit
// seinem Spotify-Token aus: die Function fragt Spotify (GET /me), wem das Token gehört, und liest/schreibt nur
// die Zeilen dieses Spotify-Kontos (Service-Rolle; die Tabellen mb_rad_* sind für Clients gesperrt).
// Darum verify_jwt = false. Aktionen:
//   "state"      Zähler, letzte Protokoll-Einträge und alle Tags
//   "log"        gehört/abgelehnt speichern
//   "tags_fetch" für bis zu 8 Alben die Tags von Last.fm holen und speichern (Secret LASTFM_API_KEY)
//   "tag_set"    eigenen Tag hinzufügen/entfernen bzw. automatischen Tag aus-/einblenden
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chooseAuto, pickTags, lookupAlbumName, sameName, applyTagChange, tagView, MIN_ALBUM_TAGS } from "../_shared/rad-tags.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function out(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const MAX_PER_HOUR = 300;  // Schutz vor Dauerfeuer: so viele Protokoll-Einträge pro Konto und Stunde
const RECENT = 100;        // so viele letzte Einträge liefert "state" fürs Protokoll
const FETCH_BATCH = 8;     // so viele Alben pro "tags_fetch"
const FETCH_PER_HOUR = 3000; // Schutz fürs Last.fm-Kontingent: so viele frisch geholte Alben pro Konto und Stunde
const TAG_MAX_AGE_MS = 30 * 24 * 3600_000; // geholte Tags gelten 30 Tage
const ALBUM_ID = /^[A-Za-z0-9]{1,64}$/;
const TAG_COLS = "album_id,auto,added,hidden,fetched_at";

async function timedFetch(input: string, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(input, { signal: ctrl.signal }); } finally { clearTimeout(timer); }
}

// Last.fm-Aufruf: {ok:true, data} – data null heisst „nichts gefunden“; {ok:false} heisst „später nochmals“
async function lastFm(key: string, method: string, extra: Record<string, string>) {
  try {
    const q = new URLSearchParams({ method, api_key: key, format: "json", autocorrect: "1", ...extra });
    const r = await timedFetch("https://ws.audioscrobbler.com/2.0/?" + q);
    if (r.status === 429 || r.status >= 500) return { ok: false, data: null };
    const j = await r.json().catch(() => null);
    if (!j) return { ok: false, data: null };
    if (j.error) return { ok: ![8, 11, 16, 29].includes(Number(j.error)), data: null }; // 6 = nicht gefunden; 8/11/16/29 = Störung/Limit
    return { ok: true, data: j };
  } catch { return { ok: false, data: null }; }
}

// Tags für ein Album: zuerst das Album (auch ohne Zusatz wie „Deluxe Edition“), bei zu wenigen der Künstler
async function fetchAuto(key: string, name: string, artist: string) {
  const ctx = { artist, album: name };
  const albumTags = async (album: string) => {
    const r = await lastFm(key, "album.getTopTags", { artist, album });
    if (!r.ok) return null;
    const tt = (r.data as any)?.toptags;
    return sameName(tt?.["@attr"]?.artist, artist) ? (tt?.tag ?? []) : [];
  };
  let raw = await albumTags(name);
  if (raw === null) return null;
  const short = lookupAlbumName(name);
  if (pickTags(raw, ctx).length < MIN_ALBUM_TAGS && short !== name) {
    const again = await albumTags(short);
    if (again === null) return null;
    if (pickTags(again, ctx).length > pickTags(raw, ctx).length) raw = again;
  }
  let artistRaw: unknown = [];
  if (pickTags(raw, ctx).length < MIN_ALBUM_TAGS) {
    const r = await lastFm(key, "artist.getTopTags", { artist });
    if (!r.ok) return null;
    const tt = (r.data as any)?.toptags;
    artistRaw = sameName(tt?.["@attr"]?.artist, artist) ? (tt?.tag ?? []) : [];
  }
  return chooseAuto(raw, artistRaw, ctx);
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return out({ error: "POST required" }, 405);

    const body = await req.json().catch(() => ({}));
    const token = String(body?.spotify_token || "");
    if (!token || token.length > 2000) return out({ error: "spotify token required" }, 401);

    const me = await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${token}` } });
    if (me.status === 401 || me.status === 403) return out({ error: "spotify token invalid" }, 401);
    if (me.status === 429) return out({ error: "spotify busy" }, 503);
    if (!me.ok) return out({ error: "spotify error", status: me.status }, 502);
    const user = String((await me.json())?.id || "");
    if (!user) return out({ error: "spotify user missing" }, 502);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const action = String(body?.action || "");

    if (action === "log") {
      const albumId = String(body?.album_id || ""), kind = String(body?.kind || "");
      if (!ALBUM_ID.test(albumId)) return out({ error: "album_id invalid" }, 400);
      if (kind !== "listen" && kind !== "reject") return out({ error: "kind invalid" }, 400);
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await admin.from("mb_rad_events").select("id", { count: "exact", head: true }).eq("spotify_user", user).gte("created_at", since);
      if (Number(count || 0) >= MAX_PER_HOUR) return out({ error: "too many entries" }, 429);
      const { data, error } = await admin.from("mb_rad_events").insert({ spotify_user: user, album_id: albumId, kind, source: "tap" }).select("id,album_id,kind,source,created_at").single();
      if (error) return out({ error: "failed to store", detail: error.message }, 500);
      return out({ ok: true, event: data });
    }

    if (action === "state") {
      const [counts, events] = await Promise.all([
        admin.rpc("mb_rad_counts", { p_user: user }),
        admin.from("mb_rad_events").select("id,album_id,kind,source,created_at").eq("spotify_user", user).order("created_at", { ascending: false }).limit(RECENT),
      ]);
      if (counts.error || events.error) return out({ error: "failed to load", detail: (counts.error || events.error)?.message }, 500);
      // Tags seitenweise (PostgREST liefert höchstens 1000 Zeilen pro Abfrage)
      const tags: unknown[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        const page = await admin.from("mb_rad_tags").select(TAG_COLS).eq("spotify_user", user).order("album_id").range(from, from + 999);
        if (page.error) return out({ error: "failed to load", detail: page.error.message }, 500);
        tags.push(...(page.data ?? []).map(tagView));
        if ((page.data ?? []).length < 1000) break;
      }
      return out({ ok: true, counts: counts.data ?? [], events: events.data ?? [], tags });
    }

    if (action === "tags_fetch") {
      const key = Deno.env.get("LASTFM_API_KEY");
      if (!key) return out({ error: "lastfm key missing" }, 503);
      const wanted = (Array.isArray(body?.albums) ? body.albums : []).slice(0, FETCH_BATCH)
        .map((a: any) => ({ id: String(a?.id || ""), name: String(a?.name || "").slice(0, 200), artist: String(a?.artist || "").slice(0, 200) }))
        .filter((a: any) => ALBUM_ID.test(a.id) && a.name && a.artist);
      if (!wanted.length) return out({ error: "albums required" }, 400);
      const existing = await admin.from("mb_rad_tags").select(TAG_COLS).eq("spotify_user", user).in("album_id", wanted.map((a: any) => a.id));
      if (existing.error) return out({ error: "failed to load", detail: existing.error.message }, 500);
      const { count: fresh } = await admin.from("mb_rad_tags").select("album_id", { count: "exact", head: true }).eq("spotify_user", user).gte("fetched_at", new Date(Date.now() - 3600_000).toISOString());
      if (Number(fresh || 0) >= FETCH_PER_HOUR) return out({ error: "too many tag fetches" }, 429);
      const have = new Map((existing.data ?? []).map((r: any) => [r.album_id, r]));
      const failed: string[] = [];
      const rows = await Promise.all(wanted.map(async (a: any) => {
        const old: any = have.get(a.id);
        if (old?.fetched_at && Date.now() - new Date(old.fetched_at).getTime() < TAG_MAX_AGE_MS) return old;
        const auto = await fetchAuto(key, a.name, a.artist);
        if (!auto) { failed.push(a.id); return old ?? null; }
        const now = new Date().toISOString();
        // Nur die automatischen Spalten setzen – eigene Tags (added/hidden) einer bestehenden Zeile bleiben
        const up = await admin.from("mb_rad_tags").upsert({ spotify_user: user, album_id: a.id, auto: auto.tags, auto_source: auto.source, fetched_at: now, updated_at: now }, { onConflict: "spotify_user,album_id" }).select(TAG_COLS).single();
        if (up.error) { failed.push(a.id); return old ?? null; }
        return up.data;
      }));
      return out({ ok: true, tags: rows.filter(Boolean).map(tagView), failed });
    }

    if (action === "tag_set") {
      const albumId = String(body?.album_id || "");
      if (!ALBUM_ID.test(albumId)) return out({ error: "album_id invalid" }, 400);
      const cur = await admin.from("mb_rad_tags").select(TAG_COLS).eq("spotify_user", user).eq("album_id", albumId).maybeSingle();
      if (cur.error) return out({ error: "failed to load", detail: cur.error.message }, 500);
      const change = applyTagChange(cur.data ?? { auto: [], added: [], hidden: [] }, body?.tag, body?.on === true);
      if ("error" in change) return out({ error: change.error }, 400);
      const up = await admin.from("mb_rad_tags").upsert({ spotify_user: user, album_id: albumId, added: change.added, hidden: change.hidden, updated_at: new Date().toISOString() }, { onConflict: "spotify_user,album_id" }).select(TAG_COLS).single();
      if (up.error) return out({ error: "failed to store", detail: up.error.message }, 500);
      return out({ ok: true, tags: [tagView(up.data)] });
    }

    return out({ error: "unknown action" }, 400);
  } catch (e) {
    return out({ error: "rad exception", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
