-- Roadmap 7.4 (09.11.2026): Ablauf einer Quiz-Frage. Der Host öffnet die nächste Frage (20 s ab Serveruhr),
-- danach deckt die Edge Function mb-quiz-reveal auf und vergibt die Punkte (Berechnung in _shared/quiz-engine.mjs).
-- Nach der letzten Frage beendet „nächste Frage“ das Quiz (Status finished).

create or replace function public.mb_quiz_open_next(p_room_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.mb_rooms%rowtype;
  v_next integer;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select * into v_room from public.mb_rooms where id = p_room_id for update;
  if not found or v_room.game <> 'quiz' then raise exception 'quiz not found'; end if;
  if v_room.host_user_id <> v_uid then raise exception 'only host'; end if;
  if v_room.status <> 'quiz' then raise exception 'quiz not running'; end if;
  if v_room.quiz_question_no > 0 and exists (
    select 1 from public.mb_quiz_questions q
    where q.room_id = p_room_id and q.game_no = v_room.quiz_game_no and q.question_no = v_room.quiz_question_no and q.status <> 'revealed'
  ) then raise exception 'question still open'; end if;

  v_next := v_room.quiz_question_no + 1;
  update public.mb_quiz_questions
  set status = 'open', started_at = now(), deadline_at = now() + interval '20 seconds'
  where room_id = p_room_id and game_no = v_room.quiz_game_no and question_no = v_next and status = 'pending';

  if found then
    update public.mb_rooms set quiz_question_no = v_next, updated_at = now() where id = p_room_id;
    return v_next;
  end if;
  -- keine Frage mehr → Quiz beendet
  update public.mb_rooms set status = 'finished', updated_at = now() where id = p_room_id;
  return 0;
end;
$$;

-- Aufdecken speichern (nur Service-Rolle, aus mb-quiz-reveal): Punkte je Antwort + Frage auf „revealed“.
-- p_points: {"<answer-id>": 730, …}; Antworten ohne Eintrag bekommen 0. Zweiter Aufruf ändert nichts.
create or replace function public.mb_quiz_store_reveal(p_question_id uuid, p_points jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q public.mb_quiz_questions%rowtype;
  v_count integer;
begin
  select * into v_q from public.mb_quiz_questions where id = p_question_id for update;
  if not found then raise exception 'question not found'; end if;
  if v_q.status = 'revealed' then return -1; end if;
  if v_q.status <> 'open' then raise exception 'question not open'; end if;
  if jsonb_typeof(p_points) <> 'object' then raise exception 'invalid points'; end if;

  update public.mb_quiz_answers a
  set points = least(2000, greatest(0, coalesce((p_points ->> a.id::text)::integer, 0)))
  where a.question_id = p_question_id;
  get diagnostics v_count = row_count;

  update public.mb_quiz_questions set status = 'revealed', revealed_at = now() where id = p_question_id;
  return v_count;
end;
$$;

revoke execute on function public.mb_quiz_open_next(uuid) from public, anon;
grant execute on function public.mb_quiz_open_next(uuid) to authenticated;
revoke execute on function public.mb_quiz_store_reveal(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.mb_quiz_store_reveal(uuid, jsonb) to service_role;
