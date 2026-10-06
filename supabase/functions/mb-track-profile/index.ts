// mb-track-profile (Roadmap 3.3): sammelt einmal pro Song die Daten für die Jury und speichert
// sie in mb_track_profiles. Wird nach dem Einreichen im Hintergrund aufgerufen; Fehler einzelner
// Quellen blockieren nichts. Lyrics werden nur ausgewertet, nie gespeichert.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import themes from "../_shared/themes.json" with { type: "json" };
import { PROFILE_VERSION, lyricsFeatures, earliestYear, mergeTags, normalizeText, cleanTitle, primaryArtist, sameArtist } from "../_shared/track-features.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UA = "MusicBattle/2.0 (https://monkeydsvakidan.github.io/MusicBattle/)";

function out(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function timedFetch(input: string, init: RequestInit = {}, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(input, { ...init, signal: ctrl.signal }); } finally { clearTimeout(timer); }
}

// MusicBrainz/ListenBrainz drosseln bei mehreren gleichzeitigen Anfragen (ca. 1/s) → bei 429/503
// kurz warten und erneut versuchen, statt die Quelle als „nicht gefunden“ zu werten
async function politeFetch(input: string, init: RequestInit = {}, timeoutMs = 4500, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    const r = await timedFetch(input, init, timeoutMs);
    if ((r.status !== 429 && r.status !== 503) || attempt >= retries) return r;
    await new Promise((res) => setTimeout(res, 1100 * (attempt + 1) + Math.floor(Math.random() * 400)));
  }
}

// --- Quellen (jede liefert {found:false} statt zu werfen) ---

async function lrclib(title: string, artist: string, album: string | null, durationMs: number | null) {
  const headers = { "User-Agent": UA };
  const pick = (h: any) => ({ found: true, plainLyrics: String(h?.plainLyrics || ""), instrumental: Boolean(h?.instrumental) });
  try {
    const q = new URLSearchParams({ track_name: title, artist_name: artist });
    if (album) q.set("album_name", album);
    if (durationMs) q.set("duration", String(Math.round(durationMs / 1000)));
    const r = await timedFetch("https://lrclib.net/api/get?" + q, { headers }, 4000);
    if (r.ok) return pick(await r.json());
    if (r.status !== 404) return { found: false };
    const s = await timedFetch("https://lrclib.net/api/search?" + new URLSearchParams({ track_name: title, artist_name: artist }), { headers }, 4000);
    if (!s.ok) return { found: false };
    const rows = await s.json();
    const list = Array.isArray(rows) ? rows : [];
    const hit = list.find((x: any) => normalizeText(x?.trackName) === normalizeText(title) && normalizeText(x?.artistName).includes(normalizeText(artist))) || list[0];
    return hit ? pick(hit) : { found: false };
  } catch { return { found: false }; }
}

async function musicBrainz(title: string, artist: string, isrc: string | null) {
  try {
    const query = isrc
      ? `isrc:${isrc.replace(/[^A-Za-z0-9]/g, "")}`
      : `recording:"${title.replace(/"/g, "")}" AND artist:"${artist.replace(/"/g, "")}"`;
    const r = await politeFetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=3`, { headers: { "User-Agent": UA, Accept: "application/json" } }, 4500);
    if (!r.ok) return { found: false };
    const rows = (await r.json())?.recordings ?? [];
    const hit = rows.find((x: any) => normalizeText(x?.title).includes(normalizeText(title)) || normalizeText(title).includes(normalizeText(x?.title))) || rows[0];
    if (!hit?.id) return { found: false };
    return { found: true, mbid: String(hit.id), firstReleaseDate: hit["first-release-date"] || null };
  } catch { return { found: false }; }
}

async function listenBrainz(mbid: string | null) {
  if (!mbid) return { found: false };
  try {
    const headers = { Accept: "application/json", "User-Agent": UA };
    const [metaRes, popRes] = await Promise.all([
      politeFetch(`https://api.listenbrainz.org/1/metadata/recording/?recording_mbids=${encodeURIComponent(mbid)}&inc=tag`, { headers }, 4000),
      politeFetch("https://api.listenbrainz.org/1/popularity/recording", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ recording_mbids: [mbid] }) }, 4000),
    ]);
    const meta = metaRes.ok ? await metaRes.json() : {};
    const pop = popRes.ok ? await popRes.json() : [];
    const raw = meta?.[mbid]?.tag?.recording ?? [];
    const tags = (Array.isArray(raw) ? raw : []).map((t: any) => ({ name: t?.tag, count: t?.count, source: "listenbrainz" }));
    const p = (Array.isArray(pop) ? pop : []).find((x: any) => x?.recording_mbid === mbid) ?? {};
    const listens = p.total_listen_count ?? null, users = p.total_user_count ?? null;
    return { found: Boolean(tags.length || listens !== null || users !== null), tags, listens, users };
  } catch { return { found: false }; }
}

async function lastFm(title: string, artist: string) {
  const key = Deno.env.get("LASTFM_API_KEY");
  if (!key) return { found: false, setup_missing: true };
  const get = async (method: string, extra: Record<string, string>) => {
    const q = new URLSearchParams({ method, api_key: key, format: "json", autocorrect: "1", ...extra });
    const r = await timedFetch("https://ws.audioscrobbler.com/2.0/?" + q, {}, 4000);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.error ? null : j;
  };
  try {
    const [info, trackTags, artistTags] = await Promise.all([
      get("track.getInfo", { artist, track: title }),
      get("track.getTopTags", { artist, track: title }),
      get("artist.getTopTags", { artist }),
    ]);
    // Namensvettern verwerfen: Last.fm korrigiert Namen automatisch und landet sonst beim falschen Künstler
    const t = sameArtist(info?.track?.artist?.name, artist) ? info?.track : null;
    const ttOk = sameArtist(trackTags?.toptags?.["@attr"]?.artist, artist);
    const atOk = sameArtist(artistTags?.toptags?.["@attr"]?.artist, artist);
    const tt = ttOk ? (trackTags?.toptags?.tag ?? []).slice(0, 15).map((x: any) => ({ name: x?.name, count: x?.count, source: "lastfm" })) : [];
    const at = atOk ? (artistTags?.toptags?.tag ?? []).slice(0, 10).map((x: any) => ({ name: x?.name, count: x?.count, source: "lastfm_artist" })) : [];
    const num = (v: any) => (v === undefined || v === null || v === "" ? null : Number(v));
    return { found: Boolean(t || tt.length || at.length), listeners: num(t?.listeners), playcount: num(t?.playcount), tags: [...tt, ...at] };
  } catch { return { found: false }; }
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return out({ error: "POST required" }, 405);

    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const admin = createClient(url, service);
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return out({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const submissionId = String(body?.submission_id || "");
    if (!submissionId) return out({ error: "submission_id required" }, 400);

    const { data: sub } = await admin.from("mb_submissions")
      .select("room_id,round_id,player_slot,spotify_track_id,song_name,artist_name,album_name,spotify_release_date,spotify_duration_ms,spotify_album_type,spotify_isrc,spotify_explicit")
      .eq("id", submissionId).maybeSingle();
    if (!sub) return out({ error: "submission not found" }, 404);
    if (!sub.spotify_track_id) return out({ error: "submission has no spotify track" }, 400);

    const { data: member } = await admin.from("mb_members").select("id").eq("room_id", sub.room_id).eq("user_id", userData.user.id).limit(1);
    if (!member?.length) return out({ error: "not a room member" }, 403);

    const { data: existing } = await admin.from("mb_track_profiles").select("profile_version,data_coverage").eq("spotify_track_id", sub.spotify_track_id).maybeSingle();
    if (existing && existing.profile_version >= PROFILE_VERSION && !body?.force) {
      return out({ ok: true, cached: true, spotify_track_id: sub.spotify_track_id, coverage: existing.data_coverage });
    }

    // Suchbegriffe: gedrafteter Hauptkünstler (Feld artist_name enthält oft „A, B, C“) und Titel ohne „(feat. …)“
    const { data: round } = await admin.from("mb_rounds").select("round_number").eq("id", sub.round_id).maybeSingle();
    const { data: pick } = round
      ? await admin.from("mb_draft_picks").select("artist_name").eq("room_id", sub.room_id).eq("round_number", round.round_number).eq("player_slot", sub.player_slot).maybeSingle()
      : { data: null };
    const artist = pick?.artist_name && sameArtist(sub.artist_name, pick.artist_name) ? pick.artist_name : primaryArtist(sub.artist_name);
    const title = cleanTitle(sub.song_name) || sub.song_name;

    const started = Date.now();
    const [lyrClean, mb, lfm] = await Promise.all([
      lrclib(title, artist, sub.album_name, sub.spotify_duration_ms),
      musicBrainz(title, artist, sub.spotify_isrc),
      lastFm(title, artist),
    ]);
    // Rückfall: Original-Titel und -Künstler, falls der bereinigte Titel keine Lyrics findet
    const lyr = (lyrClean as any).found || (title === sub.song_name && artist === sub.artist_name)
      ? lyrClean
      : await lrclib(sub.song_name, sub.artist_name, sub.album_name, sub.spotify_duration_ms);
    const lb = await listenBrainz((mb as any).found ? (mb as any).mbid : null);

    const coverage = {
      spotify: true,
      lrclib: (lyr as any).found === true,
      lyrics: Boolean((lyr as any).plainLyrics),
      musicbrainz: (mb as any).found === true,
      listenbrainz: (lb as any).found === true,
      lastfm: (lfm as any).found === true,
      ...((lfm as any).setup_missing ? { lastfm_key_missing: true } : {}),
    };
    const row = {
      spotify_track_id: sub.spotify_track_id,
      isrc: sub.spotify_isrc || null,
      title: sub.song_name,
      artist_name: sub.artist_name,
      album_name: sub.album_name || null,
      musicbrainz_id: (mb as any).mbid || null,
      release_date: sub.spotify_release_date || null,
      release_year: earliestYear(sub.spotify_release_date, (mb as any).firstReleaseDate),
      duration_ms: sub.spotify_duration_ms ?? null,
      explicit: sub.spotify_explicit ?? null,
      album_type: sub.spotify_album_type || null,
      artist_genres: [],
      lastfm_listeners: (lfm as any).listeners ?? null,
      lastfm_playcount: (lfm as any).playcount ?? null,
      lb_listen_count: (lb as any).listens ?? null,
      lb_user_count: (lb as any).users ?? null,
      tags: mergeTags((lfm as any).tags, (lb as any).tags),
      lyrics_features: lyricsFeatures({ plainLyrics: (lyr as any).plainLyrics, instrumental: (lyr as any).instrumental }, themes),
      data_coverage: coverage,
      profile_version: PROFILE_VERSION,
      fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("mb_track_profiles").upsert(row, { onConflict: "spotify_track_id" });
    if (error) return out({ error: "save failed", detail: error.message }, 500);
    console.log("profile:saved", sub.spotify_track_id, artist, "|", title, "ms", Date.now() - started, JSON.stringify(coverage));
    return out({ ok: true, cached: false, spotify_track_id: sub.spotify_track_id, coverage });
  } catch (e) {
    return out({ error: "profile exception", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
