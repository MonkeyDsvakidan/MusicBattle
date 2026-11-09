-- Roadmap 7.3 (09.11.2026): Ein erzeugtes Quiz (Fragen + Lösungen) in einem Schritt speichern und das Quiz starten.
-- Nur für die Edge Function mb-quiz-start (Service-Rolle); Clients können die Funktion nicht aufrufen.
-- p_game_no muss genau quiz_game_no + 1 sein (verhindert doppelte Starts bei Doppelklick).
-- p_questions: [{"question_no":1,"kind":"year","prompt":{…},"solution":{…}}, …]

create or replace function public.mb_quiz_store_game(p_room_id uuid, p_game_no integer, p_questions jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.mb_rooms%rowtype;
  v_q jsonb;
  v_id uuid;
  v_count integer;
begin
  select * into v_room from public.mb_rooms where id = p_room_id for update;
  if not found or v_room.game <> 'quiz' then raise exception 'quiz not found'; end if;
  if v_room.status not in ('lobby', 'finished') or v_room.quiz_game_no + 1 <> p_game_no then raise exception 'already started'; end if;
  if jsonb_typeof(p_questions) <> 'array' then raise exception 'invalid questions'; end if;
  v_count := jsonb_array_length(p_questions);
  if v_count < 1 or v_count > 20 then raise exception 'invalid question count'; end if;

  for v_q in select * from jsonb_array_elements(p_questions) loop
    insert into public.mb_quiz_questions (room_id, game_no, question_no, kind, prompt)
    values (p_room_id, p_game_no, (v_q->>'question_no')::integer, v_q->>'kind', v_q->'prompt')
    returning id into v_id;
    insert into public.mb_quiz_solutions (question_id, room_id, solution) values (v_id, p_room_id, v_q->'solution');
  end loop;

  update public.mb_rooms
  set status = 'quiz', quiz_game_no = p_game_no, quiz_question_no = 0, updated_at = now()
  where id = p_room_id;
  return v_count;
end;
$$;

revoke execute on function public.mb_quiz_store_game(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.mb_quiz_store_game(uuid, integer, jsonb) to service_role;
