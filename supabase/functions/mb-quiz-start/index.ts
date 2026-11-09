// mb-quiz-start (Roadmap 7.3): Host startet ein Quiz. Liest den Song-Pool des Raums (für Clients nicht lesbar),
// erzeugt die Fragen mit der Quiz-Engine und speichert Fragen + Lösungen über mb_quiz_store_game in einem Schritt.
// Die Fragen sind danach noch „pending“ (unsichtbar); geöffnet werden sie einzeln (7.6).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateQuiz, QUIZ_ENGINE_VERSION } from "../_shared/quiz-engine.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function out(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const POOL_COLUMNS = "spotify_track_id,title,artist,album,spotify_album_id,album_type,release_year,cover_url,duration_ms,member_id";

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
    const roomId = String(body?.room_id || "");
    if (!roomId) return out({ error: "room_id required" }, 400);

    const { data: room } = await admin.from("mb_rooms").select("id,host_user_id,game,quiz_kind,quiz_length,quiz_game_no,status").eq("id", roomId).maybeSingle();
    if (!room || room.game !== "quiz") return out({ error: "quiz not found" }, 404);
    if (room.host_user_id !== userData.user.id) return out({ error: "only host" }, 403);
    if (!["lobby", "finished"].includes(room.status)) return out({ error: "already started" }, 409);
    if (room.quiz_kind !== "music") return out({ error: "quiz kind not available yet" }, 409);   // „Unter Freunden“ folgt in 7.10

    const started = Date.now();
    // nur Songs von Personen, die noch im Raum sind
    const { data: pool } = await admin.from("mb_quiz_pool").select(POOL_COLUMNS).eq("room_id", roomId).not("member_id", "is", null).limit(6000);
    const ids = [...new Set((pool ?? []).map((t: any) => t.spotify_track_id))];
    // frühestes Jahr aus den Song-Profilen (MusicBrainz), wo vorhanden
    const years: Record<string, number> = {};
    for (let i = 0; i < ids.length; i += 300) {
      const { data: prof } = await admin.from("mb_track_profiles").select("spotify_track_id,release_year").in("spotify_track_id", ids.slice(i, i + 300)).not("release_year", "is", null);
      for (const p of prof ?? []) years[p.spotify_track_id] = p.release_year;
    }

    const gameNo = Number(room.quiz_game_no) + 1;
    const questions = generateQuiz(pool ?? [], { count: room.quiz_length, seed: `${roomId}:${gameNo}`, years });
    if (questions.length < room.quiz_length) {
      return out({ error: "pool too small", songs: ids.length, questions: questions.length, needed: room.quiz_length }, 409);
    }

    const payload = questions.map((q: any) => ({ question_no: q.question_no, kind: q.kind, prompt: q.prompt, solution: { ...q.solution, engine_version: QUIZ_ENGINE_VERSION } }));
    const { data: stored, error } = await admin.rpc("mb_quiz_store_game", { p_room_id: roomId, p_game_no: gameNo, p_questions: payload });
    if (error) {
      if (/already started/i.test(error.message)) return out({ ok: true, duplicate: true, game_no: gameNo });
      return out({ error: "failed to store quiz", detail: error.message }, 500);
    }
    console.log("quiz:start", roomId, "game", gameNo, "questions", stored, "songs", ids.length, "ms", Date.now() - started);
    return out({ ok: true, game_no: gameNo, questions: stored, kinds: questions.map((q: any) => q.kind), ms: Date.now() - started });
  } catch (e) {
    return out({ error: "quiz start exception", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
