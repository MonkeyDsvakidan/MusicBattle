// mb-rad (Roadmap W.5/W.7/W.8/W.9): Protokoll und Farb-Rad-Verschiebungen des Albumrads. Kein Supabase-Login – wer aufruft, weist sich mit seinem
// Spotify-Token aus: die Function fragt Spotify (GET /me), wem das Token gehört, und liest/schreibt nur
// die Zeilen dieses Spotify-Kontos (Service-Rolle; die Tabelle mb_rad_events ist für Clients gesperrt).
// Darum verify_jwt = false. Aktionen: "state" (Zähler, letzte Einträge, Verschiebungen), "log" (gehört/abgelehnt/
// behalten speichern), "move" (Album von Hand einem Farb-Rad zuteilen; "auto" = wieder die berechnete Farbe),
// "auto" (im Browser aus „zuletzt gespielt“ erkannte Alben als gehört eintragen, höchstens einmal pro Album und Tag).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function out(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const MAX_PER_HOUR = 300; // Schutz vor Dauerfeuer: so viele Einträge pro Konto und Stunde
const RECENT = 100;       // so viele letzte Einträge liefert "state" fürs Protokoll
const MOVES_PER_HOUR = 500; // so viele Verschiebungen pro Konto und Stunde
// Kalendertag in der Schweiz – „am selben Tag“ (W.9) meint den Tag des Nutzers, nicht UTC
const zurichDay = (d: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date(d));
const WHEELS = ["auto", "warm", "cold", "dark", "light"]; // „pink“ seit 20.11.2026 in „cold“ aufgegangen

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
      if (!/^[A-Za-z0-9]{1,64}$/.test(albumId)) return out({ error: "album_id invalid" }, 400);
      if (!["listen", "reject", "keep"].includes(kind)) return out({ error: "kind invalid" }, 400);
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await admin.from("mb_rad_events").select("id", { count: "exact", head: true }).eq("spotify_user", user).gte("created_at", since);
      if (Number(count || 0) >= MAX_PER_HOUR) return out({ error: "too many entries" }, 429);
      // Tippen auf „Hören“ nach einem erkannten „gehört“ am selben Tag zählt nicht nochmals (W.9)
      if (kind === "listen") {
        const { data: autos } = await admin.from("mb_rad_events").select("created_at").eq("spotify_user", user).eq("album_id", albumId)
          .eq("kind", "listen").eq("source", "auto").gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString());
        const today = zurichDay(new Date());
        if ((autos ?? []).some((e: any) => zurichDay(e.created_at) === today)) return out({ ok: true, duplicate: true });
      }
      const { data, error } = await admin.from("mb_rad_events").insert({ spotify_user: user, album_id: albumId, kind, source: "tap" }).select("id,album_id,kind,source,created_at").single();
      if (error) return out({ error: "failed to store", detail: error.message }, 500);
      return out({ ok: true, event: data });
    }

    if (action === "state") {
      const [counts, events] = await Promise.all([
        admin.rpc("mb_rad_stats", { p_user: user }),
        admin.from("mb_rad_events").select("id,album_id,kind,source,created_at").eq("spotify_user", user).order("created_at", { ascending: false }).limit(RECENT),
      ]);
      if (counts.error || events.error) return out({ error: "failed to load", detail: (counts.error || events.error)?.message }, 500);
      // Verschiebungen seitenweise (PostgREST liefert höchstens 1000 Zeilen pro Abfrage)
      const moves: unknown[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        const page = await admin.from("mb_rad_moves").select("album_id,wheel").eq("spotify_user", user).order("album_id").range(from, from + 999);
        if (page.error) return out({ error: "failed to load", detail: page.error.message }, 500);
        moves.push(...(page.data ?? []));
        if ((page.data ?? []).length < 1000) break;
      }
      return out({ ok: true, counts: counts.data ?? [], events: events.data ?? [], moves });
    }

    if (action === "auto") {
      const items = (Array.isArray(body?.items) ? body.items : []).slice(0, 50)
        .map((x: any) => ({ album_id: String(x?.album_id || ""), at: String(x?.at || "") }))
        .filter((x: any) => /^[A-Za-z0-9]{1,64}$/.test(x.album_id) && !Number.isNaN(Date.parse(x.at)));
      if (!items.length) return out({ ok: true, events: [] });
      const { data, error } = await admin.rpc("mb_rad_add_auto_listens", { p_user: user, p_items: items });
      if (error) return out({ error: "failed to store", detail: error.message }, 500);
      return out({ ok: true, events: data ?? [] });
    }

    if (action === "move") {
      const albumId = String(body?.album_id || ""), wheel = String(body?.wheel || "");
      if (!/^[A-Za-z0-9]{1,64}$/.test(albumId)) return out({ error: "album_id invalid" }, 400);
      if (!WHEELS.includes(wheel)) return out({ error: "wheel invalid" }, 400);
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await admin.from("mb_rad_moves").select("album_id", { count: "exact", head: true }).eq("spotify_user", user).gte("updated_at", since);
      if (Number(count || 0) >= MOVES_PER_HOUR) return out({ error: "too many entries" }, 429);
      const { error } = await admin.from("mb_rad_moves").upsert({ spotify_user: user, album_id: albumId, wheel, updated_at: new Date().toISOString() }, { onConflict: "spotify_user,album_id" });
      if (error) return out({ error: "failed to store", detail: error.message }, 500);
      return out({ ok: true, move: { album_id: albumId, wheel } });
    }

    return out({ error: "unknown action" }, 400);
  } catch (e) {
    return out({ error: "rad exception", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
