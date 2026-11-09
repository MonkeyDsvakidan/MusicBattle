// mb-quiz-reveal (Roadmap 7.4): Host deckt die laufende Quiz-Frage auf. Erst wenn die Zeit abgelaufen ist
// (Frist + 1 s Toleranz wie in mb_quiz_answer) oder alle Mitspieler geantwortet haben. Punkte berechnet die
// Quiz-Engine (scoreAnswer, mit node --test geprüft); gespeichert wird über mb_quiz_store_reveal in einem Schritt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scoreAnswer } from "../_shared/quiz-engine.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function out(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
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
    const roomId = String(body?.room_id || "");
    if (!roomId) return out({ error: "room_id required" }, 400);

    const { data: room } = await admin.from("mb_rooms").select("id,host_user_id,game,status,quiz_game_no,quiz_question_no").eq("id", roomId).maybeSingle();
    if (!room || room.game !== "quiz") return out({ error: "quiz not found" }, 404);
    if (room.host_user_id !== userData.user.id) return out({ error: "only host" }, 403);

    const { data: q } = await admin.from("mb_quiz_questions").select("id,kind,status,started_at,deadline_at,answer_count")
      .eq("room_id", roomId).eq("game_no", room.quiz_game_no).eq("question_no", room.quiz_question_no).maybeSingle();
    if (!q) return out({ error: "no question" }, 409);
    if (q.status === "revealed") return out({ ok: true, duplicate: true, question_id: q.id });
    if (q.status !== "open") return out({ error: "question not open" }, 409);

    const { count: players } = await admin.from("mb_members").select("id", { count: "exact", head: true }).eq("room_id", roomId).eq("role", "quizzer");
    const remaining = new Date(q.deadline_at).getTime() + 1000 - Date.now();
    if (remaining > 0 && Number(q.answer_count) < Number(players || 0)) return out({ error: "still running", remaining_ms: remaining }, 409);

    const [{ data: sol }, { data: answers }] = await Promise.all([
      admin.from("mb_quiz_solutions").select("solution").eq("question_id", q.id).maybeSingle(),
      admin.from("mb_quiz_answers").select("id,answer,answer_ms").eq("question_id", q.id),
    ]);
    const limitMs = new Date(q.deadline_at).getTime() - new Date(q.started_at).getTime();
    const points: Record<string, number> = {};
    for (const a of answers ?? []) points[a.id] = scoreAnswer(q.kind, a.answer, sol?.solution, a.answer_ms, limitMs);

    const { data: stored, error } = await admin.rpc("mb_quiz_store_reveal", { p_question_id: q.id, p_points: points });
    if (error) return out({ error: "failed to reveal", detail: error.message }, 500);
    return out({ ok: true, question_id: q.id, answers: stored, points });
  } catch (e) {
    return out({ error: "quiz reveal exception", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
