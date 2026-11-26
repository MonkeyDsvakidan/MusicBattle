-- Roadmap 7.11 (26.11.2026), Entscheid J: Im Musik-Quiz beantwortet man Fragen zu Songs aus dem eigenen Pool nicht –
-- man ist ausgesetzt («Deine Frage – schau zu»), bekommt keine Punkte, und die Frage wartet nicht auf einen.
-- Wer bei welcher Frage ausgesetzt ist, bestimmt die Quiz-Engine (sitting_out je Frage); mb_quiz_store_game legt es
-- hier ab. Gedacht auch für 7.10 «Unter Freunden» (Fragen über eine Person → diese Person ist ausgesetzt).
-- Sichtbar: die eigene Zeile ab dem Öffnen der Frage, alle Zeilen der Frage erst nach dem Aufdecken
-- (sonst verriete «X ist ausgesetzt» bei 7.10 die Antwort). sitout_count ist öffentlich (nur die Anzahl).

create table public.mb_quiz_sitouts (
  question_id uuid not null references public.mb_quiz_questions(id) on delete cascade,
  room_id uuid not null references public.mb_rooms(id) on delete cascade,
  member_id uuid not null references public.mb_members(id) on delete cascade,
  primary key (question_id, member_id)
);
create index mb_quiz_sitouts_room_idx on public.mb_quiz_sitouts (room_id);
create index mb_quiz_sitouts_member_idx on public.mb_quiz_sitouts (member_id);
comment on table public.mb_quiz_sitouts is 'Quiz (Roadmap 7.11): wer bei welcher Frage ausgesetzt ist. Eigene ab open, alle ab revealed; schreiben nur über mb_quiz_store_game.';

alter table public.mb_quiz_sitouts enable row level security;
create policy mb_quiz_sitouts_select on public.mb_quiz_sitouts
for select to authenticated using (
  exists (
    select 1 from public.mb_quiz_questions q
    where q.id = mb_quiz_sitouts.question_id
      and ((q.status = 'revealed' and public.mb_is_room_member(mb_quiz_sitouts.room_id))
        or (q.status = 'open' and exists (select 1 from public.mb_members m where m.id = mb_quiz_sitouts.member_id and m.user_id = (select auth.uid()))))
  )
);
revoke all on table public.mb_quiz_sitouts from anon, authenticated;
grant select on table public.mb_quiz_sitouts to authenticated;

-- Anzahl Ausgesetzter je Frage (für «x von y haben geantwortet» und das automatische Aufdecken auf dem Host-Gerät)
alter table public.mb_quiz_questions
  add column sitout_count integer not null default 0 check (sitout_count >= 0);

-- Quiz speichern: wie bisher, zusätzlich sitting_out je Frage (Liste von Mitglieds-IDs, nur Mitspielende des Raums)
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
  v_out integer;
begin
  select * into v_room from public.mb_rooms where id = p_room_id for update;
  if not found or v_room.game <> 'quiz' then raise exception 'quiz not found'; end if;
  if v_room.status not in ('lobby', 'finished') or v_room.quiz_game_no + 1 <> p_game_no then raise exception 'already started'; end if;
  if jsonb_typeof(p_questions) <> 'array' then raise exception 'invalid questions'; end if;
  v_count := jsonb_array_length(p_questions);
  if v_count < 1 or v_count > 20 then raise exception 'invalid question count'; end if;

  for v_q in select * from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(coalesce(v_q->'sitting_out', '[]'::jsonb)) <> 'array' then raise exception 'invalid questions'; end if;
    insert into public.mb_quiz_questions (room_id, game_no, question_no, kind, prompt)
    values (p_room_id, p_game_no, (v_q->>'question_no')::integer, v_q->>'kind', v_q->'prompt')
    returning id into v_id;
    insert into public.mb_quiz_solutions (question_id, room_id, solution) values (v_id, p_room_id, v_q->'solution');

    insert into public.mb_quiz_sitouts (question_id, room_id, member_id)
    select v_id, p_room_id, m.id from public.mb_members m
    where m.room_id = p_room_id and m.role = 'quizzer'
      and m.id::text in (select jsonb_array_elements_text(coalesce(v_q->'sitting_out', '[]'::jsonb)));
    get diagnostics v_out = row_count;
    if v_out > 0 then update public.mb_quiz_questions set sitout_count = v_out where id = v_id; end if;
  end loop;

  update public.mb_rooms
  set status = 'quiz', quiz_game_no = p_game_no, quiz_question_no = 0, updated_at = now()
  where id = p_room_id;
  return v_count;
end;
$$;

-- Antwort abgeben: wie bisher, zusätzlich «sitting out» für Ausgesetzte
create or replace function public.mb_quiz_answer(p_question_id uuid, p_member_id uuid, p_answer jsonb)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_q public.mb_quiz_questions%rowtype;
  v_member public.mb_members%rowtype;
  v_now timestamptz := clock_timestamp();
  v_val integer;
  v_ms integer;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select * into v_q from public.mb_quiz_questions where id = p_question_id for update;
  if not found then raise exception 'question not found'; end if;
  if v_q.status <> 'open' or v_now > v_q.deadline_at + interval '1 second' then raise exception 'answer closed'; end if;

  select * into v_member from public.mb_members where id = p_member_id and room_id = v_q.room_id and user_id = v_uid and role = 'quizzer';
  if not found then raise exception 'not a room member'; end if;
  if exists (select 1 from public.mb_quiz_sitouts s where s.question_id = p_question_id and s.member_id = p_member_id) then
    raise exception 'sitting out';
  end if;

  if jsonb_typeof(p_answer) <> 'object' or (select count(*) from jsonb_object_keys(p_answer)) <> 1 then raise exception 'invalid answer'; end if;
  if v_q.kind = 'year' then
    if jsonb_typeof(p_answer -> 'year') is distinct from 'number' then raise exception 'invalid answer'; end if;
    v_val := (p_answer ->> 'year')::integer;
    if v_val not between 1900 and extract(year from v_now)::integer + 1 then raise exception 'invalid answer'; end if;
  elsif v_q.kind = 'whose' then
    if not exists (select 1 from public.mb_members m where m.room_id = v_q.room_id and m.id::text = p_answer ->> 'member_id') then raise exception 'invalid answer'; end if;
  else
    if jsonb_typeof(p_answer -> 'choice') is distinct from 'number' then raise exception 'invalid answer'; end if;
    v_val := (p_answer ->> 'choice')::integer;
    if v_val not between 1 and (case when v_q.kind = 'older' then 2 else 4 end) then raise exception 'invalid answer'; end if;
  end if;

  v_ms := greatest(0, (extract(epoch from (v_now - v_q.started_at)) * 1000)::integer);
  insert into public.mb_quiz_answers (room_id, question_id, member_id, user_id, member_name, answer, answered_at, answer_ms)
  values (v_q.room_id, p_question_id, p_member_id, v_uid, left(v_member.display_name, 60), p_answer, v_now, v_ms);

  update public.mb_quiz_questions set answer_count = answer_count + 1 where id = p_question_id;
  return v_ms;
exception
  when unique_violation then raise exception 'already answered';
end;
$$;

-- Rechte wie bisher (create or replace behält sie; zur Sicherheit nochmals gesetzt)
revoke execute on function public.mb_quiz_store_game(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.mb_quiz_store_game(uuid, integer, jsonb) to service_role;
revoke execute on function public.mb_quiz_answer(uuid, uuid, jsonb) from public, anon;
grant execute on function public.mb_quiz_answer(uuid, uuid, jsonb) to authenticated;
