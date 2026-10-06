// mb-jury (Roadmap 3.8): die neue Jury. Liest die gespeicherten Song-Profile (mb_track_profiles),
// vergleicht sie mit dem Themen-Profil nach den fünf Juror-Profilen (jury-engine.mjs) und speichert
// fünf Scorecards. Keine Live-Abfragen externer Dienste, keine KI (Entscheidung D).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import themes from "../_shared/themes.json" with { type: "json" };
import jurors from "../_shared/jurors.json" with { type: "json" };
import { scoreRound, juryTotal, ENGINE_VERSION } from "../_shared/jury-engine.mjs";
import { normalizeText, releaseYear } from "../_shared/track-features.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function out(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const ALL_THEMES = (themes as any).categories.flatMap((c: any) => c.themes.map((t: any) => ({ ...t, category: c.name })));

// Themen-Profil zum Rundenthema; Notbehelf für unbekannte (ältere) Themen aus den Wörtern des Themas
function themeFor(round: any) {
  const found = ALL_THEMES.find((t: any) => t.theme === round.theme);
  if (found) return found;
  const words = normalizeText(`${round.theme || ""}`).split(" ").filter((w) => w.length > 3);
  const year = releaseYear(round.theme);
  return { id: "unbekannt", theme: round.theme, category: round.category, energy: "medium", era: year ? { from: year, to: year } : null, tags: [], keywords: { de: words, en: words } };
}

// Datenbasis eines Profils in Worten (für die Anzeige pro Juror)
function dataBasis(p: any) {
  if (!p) return [];
  const parts: string[] = [];
  if (p.lyrics_features?.has_lyrics) parts.push("Lyrics");
  if (Array.isArray(p.tags) && p.tags.length) parts.push("Tags");
  if (p.lastfm_listeners !== null && p.lastfm_listeners !== undefined || p.lb_user_count !== null && p.lb_user_count !== undefined) parts.push("Hörerzahlen");
  if (p.release_year) parts.push("Release-Jahr");
  return parts;
}

// Minimales Profil aus der Submission, falls die Datensammlung (noch) nichts liefern konnte
function fallbackSong(sub: any) {
  return {
    spotify_track_id: sub.spotify_track_id, title: sub.song_name, artist_name: sub.artist_name,
    release_year: releaseYear(sub.spotify_release_date), album_type: sub.spotify_album_type || null,
    lastfm_listeners: null, lb_user_count: null, tags: [], lyrics_features: {},
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return out({ error: "POST required" }, 405);

    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const admin = createClient(url, service);
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return out({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const roomId = String(body?.room_id || ""), roundId = String(body?.round_id || "");
    if (!roomId || !roundId) return out({ error: "room_id and round_id required" }, 400);

    const { data: member } = await admin.from("mb_members").select("id").eq("room_id", roomId).eq("user_id", userData.user.id).limit(1);
    if (!member?.length) return out({ error: "not a room member" }, 403);

    const [{ data: round }, { data: subs }] = await Promise.all([
      admin.from("mb_rounds").select("id,theme,category,round_number").eq("id", roundId).eq("room_id", roomId).maybeSingle(),
      admin.from("mb_submissions").select("id,player_slot,spotify_track_id,song_name,artist_name,spotify_release_date,spotify_album_type").eq("round_id", roundId).order("player_slot"),
    ]);
    if (!round) return out({ error: "round not found" }, 404);
    if (!subs || subs.length !== 2) return out({ error: "round requires two submissions" }, 409);

    const started = Date.now();
    const ids = subs.map((s: any) => s.spotify_track_id).filter(Boolean);
    const loadProfiles = async () => (await admin.from("mb_track_profiles").select("*").in("spotify_track_id", ids)).data ?? [];
    let profiles = await loadProfiles();

    // Fehlende Profile (z. B. Jury direkt nach dem Einreichen) zuerst erstellen – mit der Sitzung des Nutzers
    const missing = subs.filter((s: any) => s.spotify_track_id && !profiles.some((p: any) => p.spotify_track_id === s.spotify_track_id));
    if (missing.length) {
      await Promise.all(missing.map((s: any) =>
        fetch(`${url}/functions/v1/mb-track-profile`, { method: "POST", headers: { Authorization: auth, apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ submission_id: s.id }) })
          .then((r) => r.text()).catch(() => null)));
      profiles = await loadProfiles();
    }

    const songs = subs.map((s: any) => profiles.find((p: any) => p.spotify_track_id === s.spotify_track_id) ?? fallbackSong(s));
    const theme = themeFor(round);
    const cards = scoreRound(songs[0], songs[1], theme, jurors);
    const total = juryTotal(cards);
    const basis = { a: dataBasis(songs[0]), b: dataBasis(songs[1]) };

    const rows = cards.map((c: any) => ({
      round_id: roundId, room_id: roomId, source: "ai", juror_key: c.key, juror_name: c.name,
      score_a: c.score_a, score_b: c.score_b, reason: c.reason,
      details: {
        engine: "mb-jury", engine_version: ENGINE_VERSION, role: c.role, verdict: c.verdict, weak: c.weak,
        facts: c.facts, points: c.points, theme_id: theme.id, data_basis: basis,
        profile_versions: songs.map((s: any) => s.profile_version ?? null),
      },
    }));

    // Neu werten ersetzt eine frühere automatische Wertung derselben Runde
    await admin.from("mb_jury_scores").delete().eq("round_id", roundId).eq("source", "ai");
    const { data: inserted, error } = await admin.from("mb_jury_scores").insert(rows).select();
    if (error) {
      // Doppelklick: paralleler Lauf hat bereits gespeichert (Index mb_ai_score_once) → vorhandene Wertung zurückgeben
      if ((error as any).code === "23505") {
        const { data: existing } = await admin.from("mb_jury_scores").select().eq("round_id", roundId).eq("source", "ai");
        return out({ ok: true, jurors: existing, total, duplicate: true });
      }
      return out({ error: "failed to save jury", detail: error.message }, 500);
    }
    console.log("jury:ok", roundId, theme.id, `${total.a}:${total.b}`, "ms", Date.now() - started, "profiles", profiles.length, "created", missing.length);
    return out({ ok: true, jurors: inserted, total, ms: Date.now() - started });
  } catch (e) {
    return out({ error: "jury exception", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
