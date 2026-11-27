-- Roadmap 7.10 (27.11.2026), Entscheid J: Quiz-Art A «Unter Freunden» (quiz_kind = 'friends').
-- Neue Fragetypen über die Personen, gemischt mit den Musikwissen-Fragen:
--   whose  – Wessen Song ist das? (gibt es seit 7.1, jetzt mit Prüfung der Auswahl)
--   rank   – Wer hat X auf Platz N seiner Top-Künstler? (Antwort: eine Person)
--   fans   – Wer hört alles X? (Antwort: mehrere Personen, Teilpunkte)
--   common – Welchen Künstler haben A und B beide in den Top 20? (Antwort: einer von 4 Künstlern)
-- Dafür speichert jede Person mit Spotify ihre Top-50-Künstler (ca. letzte 6 Monate) im Raum. Wie der Song-Pool:
-- nur die eigenen Zeilen lesbar, schreiben nur über mb_quiz_set_artists, Fragen erzeugt mb-quiz-start (Service-Rolle).
-- Wer bei einer Frage ausgesetzt ist (Frage über einen selbst), regelt mb_quiz_sitouts aus 7.11.

create table public.mb_quiz_artists (
  room_id uuid not null references public.mb_rooms(id) on delete cascade,
  member_id uuid not null references public.mb_members(id) on delete cascade,
  user_id uuid not null,
  spotify_artist_id text not null check (spotify_artist_id ~ '^[A-Za-z0-9]{10,40}$'),
  name text not null check (char_length(name) between 1 and 300),
  rank integer not null check (rank between 1 and 50),
  image_url text check (image_url is null or image_url ~ '^https://i\.scdn\.co/image/[A-Za-z0-9]+$'),
  primary key (room_id, member_id, spotify_artist_id),
  constraint mb_quiz_artists_rank unique (room_id, member_id, rank)
);
create index mb_quiz_artists_member_idx on public.mb_quiz_artists (member_id);
comment on table public.mb_quiz_artists is 'Quiz «Unter Freunden» (Roadmap 7.10): Top-50-Künstler je Person und Raum. Lesen nur eigene Zeilen, schreiben nur über mb_quiz_set_artists.';

alter table public.mb_quiz_artists enable row level security;
create policy mb_quiz_artists_select_own on public.mb_quiz_artists
for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.mb_quiz_artists from anon, authenticated;
grant select on table public.mb_quiz_artists to authenticated;

-- Top-Künstler einer Person setzen (ersetzt die bisherigen), nur in der Lobby und nur in «Unter Freunden».
-- p_artists: [{"spotify_artist_id","name","rank","image_url"}, …] (höchstens 50)
create or replace function public.mb_quiz_set_artists(p_room_id uuid, p_member_id uuid, p_artists jsonb)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.mb_rooms%rowtype;
  v_count integer;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select * into v_room from public.mb_rooms where id = p_room_id;
  if not found or v_room.game <> 'quiz' then raise exception 'quiz not found'; end if;
  if v_room.quiz_kind <> 'friends' then raise exception 'invalid quiz kind'; end if;
  if v_room.status not in ('lobby', 'finished') then raise exception 'quiz running'; end if;
  if not exists (select 1 from public.mb_members m where m.id = p_member_id and m.room_id = p_room_id and m.user_id = v_uid and m.role = 'quizzer') then
    raise exception 'not a room member';
  end if;
  if jsonb_typeof(p_artists) <> 'array' then raise exception 'invalid artists'; end if;
  if jsonb_array_length(p_artists) > 50 then raise exception 'too many artists'; end if;

  delete from public.mb_quiz_artists where room_id = p_room_id and member_id = p_member_id;

  insert into public.mb_quiz_artists (room_id, member_id, user_id, spotify_artist_id, name, rank, image_url)
  select p_room_id, p_member_id, v_uid, a->>'spotify_artist_id', left(a->>'name', 300), (a->>'rank')::integer, nullif(a->>'image_url', '')
  from jsonb_array_elements(p_artists) a
  on conflict do nothing;

  select count(*) into v_count from public.mb_quiz_artists where room_id = p_room_id and member_id = p_member_id;
  return v_count;
end;
$$;

-- neue Fragetypen
alter table public.mb_quiz_questions drop constraint mb_quiz_questions_kind_check;
alter table public.mb_quiz_questions add constraint mb_quiz_questions_kind_check
  check (kind in ('year', 'older', 'cover', 'whose', 'intro', 'album', 'rank', 'fans', 'common'));

-- Antwort abgeben: wie in 7.11 (Ausgesetzte abgelehnt), dazu die Personen-Fragen.
-- whose/rank → {"member_id": "…"}: eine der angebotenen Personen, nie man selbst.
-- fans → {"member_ids": ["…", …]}: angebotene Personen, ohne Doppelte, nie man selbst (leer = «niemand von den anderen»).
-- common → {"choice": 1..4} wie die übrigen Auswahl-Fragen.
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
  v_options text[];
  v_picked text[];
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
  if v_q.kind in ('whose', 'rank', 'fans') then
    v_options := array(select o->>'member_id' from jsonb_array_elements(coalesce(v_q.prompt->'options', '[]'::jsonb)) o where o->>'member_id' <> p_member_id::text);
  end if;
  if v_q.kind = 'year' then
    if jsonb_typeof(p_answer -> 'year') is distinct from 'number' then raise exception 'invalid answer'; end if;
    v_val := (p_answer ->> 'year')::integer;
    if v_val not between 1900 and extract(year from v_now)::integer + 1 then raise exception 'invalid answer'; end if;
  elsif v_q.kind in ('whose', 'rank') then
    if jsonb_typeof(p_answer -> 'member_id') is distinct from 'string' or not ((p_answer ->> 'member_id') = any (v_options)) then raise exception 'invalid answer'; end if;
  elsif v_q.kind = 'fans' then
    if jsonb_typeof(p_answer -> 'member_ids') is distinct from 'array'
       or exists (select 1 from jsonb_array_elements(p_answer -> 'member_ids') x where jsonb_typeof(x) <> 'string') then raise exception 'invalid answer'; end if;
    v_picked := array(select jsonb_array_elements_text(p_answer -> 'member_ids'));
    if cardinality(v_picked) <> (select count(distinct x) from unnest(v_picked) x) or not (v_picked <@ v_options) then raise exception 'invalid answer'; end if;
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

revoke execute on function public.mb_quiz_set_artists(uuid, uuid, jsonb) from public, anon;
grant execute on function public.mb_quiz_set_artists(uuid, uuid, jsonb) to authenticated;
revoke execute on function public.mb_quiz_answer(uuid, uuid, jsonb) from public, anon;
grant execute on function public.mb_quiz_answer(uuid, uuid, jsonb) to authenticated;
