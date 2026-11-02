-- Roadmap 7.1 (02.11.2026), Entscheidung I: Spotify-Quiz als neuer Modus in Music Battle.
-- Ein Quiz-Raum ist ein normaler mb_rooms-Eintrag mit game = 'quiz'; Mitspielende haben die Rolle 'quizzer'
-- (beliebig viele, ohne Spielerplatz). Das Battle bleibt unverändert (game = 'battle' ist der Standard).
-- Fairness: Fragen sind erst sichtbar, wenn sie laufen; die Lösung erst nach dem Aufdecken (eigene Tabelle);
-- fremde Antworten erst nach dem Aufdecken; der Song-Pool nur für die Person, die ihn geliefert hat.
-- Antwortzeit und Frist misst der Server. Fragen erzeugen, aufdecken und Punkte vergeben folgt in 7.3/7.4.

-- Räume: Spielart, Quiz-Art (B „Musikwissen“ = music, A „Unter Freunden“ = friends), Länge, laufendes Quiz
alter table public.mb_rooms
  add column game text not null default 'battle' check (game in ('battle', 'quiz')),
  add column quiz_kind text check (quiz_kind in ('music', 'friends')),
  add column quiz_length integer check (quiz_length in (10, 15, 20)),
  add column quiz_game_no integer not null default 0 check (quiz_game_no between 0 and 1000),
  add column quiz_question_no integer not null default 0 check (quiz_question_no between 0 and 20),
  add constraint mb_rooms_quiz_fields check (
    (game = 'battle' and quiz_kind is null and quiz_length is null)
    or (game = 'quiz' and quiz_kind is not null and quiz_length is not null)
  );

-- neuer Status 'quiz' (lobby → quiz → finished; „Nochmal“ startet ein weiteres Quiz im selben Raum)
alter table public.mb_rooms drop constraint mb_rooms_status_check;
alter table public.mb_rooms add constraint mb_rooms_status_check
  check (status in ('lobby', 'draft', 'battle', 'tiebreak', 'sudden_draft', 'quiz', 'finished', 'closed'));

-- Mitglieder: neue Rolle 'quizzer' ohne Spielerplatz; Anzahl Songs, die die Person in den Pool geliefert hat
alter table public.mb_members drop constraint mb_members_role_check;
alter table public.mb_members add constraint mb_members_role_check
  check (role in ('player', 'juror', 'quizzer'));
alter table public.mb_members drop constraint mb_members_check;
alter table public.mb_members add constraint mb_members_check
  check ((role = 'player' and player_slot is not null) or (role in ('juror', 'quizzer') and player_slot is null));
alter table public.mb_members
  add column quiz_track_count integer not null default 0 check (quiz_track_count between 0 and 500);

-- Song-Pool: Metadaten der Songs der Verbundenen (keine Tokens, keine Hörerzahlen)
create table public.mb_quiz_pool (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.mb_rooms(id) on delete cascade,
  member_id uuid references public.mb_members(id) on delete set null,
  user_id uuid not null,
  spotify_track_id text not null check (spotify_track_id ~ '^[A-Za-z0-9]{10,40}$'),
  title text not null check (char_length(title) between 1 and 300),
  artist text not null check (char_length(artist) between 1 and 300),
  album text not null default '' check (char_length(album) <= 300),
  spotify_album_id text check (spotify_album_id is null or spotify_album_id ~ '^[A-Za-z0-9]{10,40}$'),
  album_type text check (album_type is null or album_type in ('album', 'single', 'compilation')),
  release_date text check (release_date is null or release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  release_year integer check (release_year is null or release_year between 1900 and 2100),
  cover_url text check (cover_url is null or cover_url ~ '^https://i\.scdn\.co/image/[A-Za-z0-9]+$'),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 7200000),
  source text not null check (source in ('top_short', 'top_medium', 'top_long', 'saved')),
  rank integer check (rank is null or rank between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint mb_quiz_pool_one_per_member unique (room_id, member_id, spotify_track_id)
);
create index mb_quiz_pool_room_idx on public.mb_quiz_pool (room_id);

-- Fragen: erst sichtbar, sobald sie laufen (status open/revealed)
create table public.mb_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.mb_rooms(id) on delete cascade,
  game_no integer not null check (game_no between 1 and 1000),
  question_no integer not null check (question_no between 1 and 20),
  kind text not null check (kind in ('year', 'older', 'cover', 'whose')),
  prompt jsonb not null default '{}'::jsonb check (jsonb_typeof(prompt) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'open', 'revealed')),
  started_at timestamptz,
  deadline_at timestamptz,
  revealed_at timestamptz,
  answer_count integer not null default 0 check (answer_count >= 0),
  created_at timestamptz not null default now(),
  constraint mb_quiz_questions_no unique (room_id, game_no, question_no),
  check (status = 'pending' or (started_at is not null and deadline_at is not null))
);

-- Lösung getrennt, lesbar erst nach dem Aufdecken
create table public.mb_quiz_solutions (
  question_id uuid primary key references public.mb_quiz_questions(id) on delete cascade,
  room_id uuid not null references public.mb_rooms(id) on delete cascade,
  solution jsonb not null check (jsonb_typeof(solution) = 'object')
);
create index mb_quiz_solutions_room_idx on public.mb_quiz_solutions (room_id);

-- Antworten: eine pro Person und Frage; Punkte setzt das Aufdecken (7.4)
create table public.mb_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.mb_rooms(id) on delete cascade,
  question_id uuid not null references public.mb_quiz_questions(id) on delete cascade,
  member_id uuid references public.mb_members(id) on delete set null,
  user_id uuid not null,
  member_name text not null default '' check (char_length(member_name) <= 60),
  answer jsonb not null check (jsonb_typeof(answer) = 'object'),
  answered_at timestamptz not null default now(),
  answer_ms integer not null check (answer_ms >= 0),
  points integer check (points is null or points between 0 and 2000),
  constraint mb_quiz_answers_one_per_member unique (question_id, member_id)
);
create index mb_quiz_answers_room_idx on public.mb_quiz_answers (room_id);

comment on table public.mb_quiz_pool is 'Song-Pool je Quiz-Raum (Roadmap 7.1). Lesen nur eigene Zeilen, schreiben nur über mb_quiz_set_pool.';
comment on table public.mb_quiz_questions is 'Quiz-Fragen (Roadmap 7.1). Sichtbar ab status open; schreiben nur serverseitig.';
comment on table public.mb_quiz_solutions is 'Lösungen der Quiz-Fragen (Roadmap 7.1). Lesbar erst nach dem Aufdecken.';
comment on table public.mb_quiz_answers is 'Quiz-Antworten (Roadmap 7.1). Eigene sofort, fremde nach dem Aufdecken; schreiben nur über mb_quiz_answer.';

alter table public.mb_quiz_pool enable row level security;
alter table public.mb_quiz_questions enable row level security;
alter table public.mb_quiz_solutions enable row level security;
alter table public.mb_quiz_answers enable row level security;

create policy mb_quiz_pool_select_own on public.mb_quiz_pool
for select to authenticated using (user_id = auth.uid());

create policy mb_quiz_questions_select_members on public.mb_quiz_questions
for select to authenticated using (status <> 'pending' and public.mb_is_room_member(room_id));

create policy mb_quiz_solutions_select_revealed on public.mb_quiz_solutions
for select to authenticated using (
  public.mb_is_room_member(room_id)
  and exists (select 1 from public.mb_quiz_questions q where q.id = question_id and q.status = 'revealed')
);

create policy mb_quiz_answers_select on public.mb_quiz_answers
for select to authenticated using (
  user_id = auth.uid()
  or (public.mb_is_room_member(room_id)
      and exists (select 1 from public.mb_quiz_questions q where q.id = question_id and q.status = 'revealed'))
);

revoke all on table public.mb_quiz_pool, public.mb_quiz_questions, public.mb_quiz_solutions, public.mb_quiz_answers from anon, authenticated;
grant select on table public.mb_quiz_pool, public.mb_quiz_questions, public.mb_quiz_solutions, public.mb_quiz_answers to authenticated;

-- Quiz-Raum erstellen: Host ist der erste Mitspieler
create or replace function public.mb_create_quiz_room(p_display_name text, p_kind text, p_length integer default 10)
returns table(room_id uuid, room_code text, member_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_member_id uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 40 then raise exception 'invalid display name'; end if;
  if p_kind not in ('music', 'friends') then raise exception 'invalid quiz kind'; end if;
  if p_length not in (10, 15, 20) then raise exception 'invalid quiz length'; end if;

  loop
    v_code := public.mb_make_room_code();
    exit when not exists (select 1 from public.mb_rooms r where r.code = v_code);
  end loop;

  insert into public.mb_rooms (code, host_user_id, device_mode, game, quiz_kind, quiz_length)
  values (v_code, v_uid, 'two', 'quiz', p_kind, p_length)
  returning id into v_room_id;

  insert into public.mb_members (room_id, user_id, display_name, role, player_slot)
  values (v_room_id, v_uid, trim(p_display_name), 'quizzer', null)
  returning id into v_member_id;

  return query select v_room_id, v_code, v_member_id;
end;
$$;

-- Beitritt: Quiz-Räume nehmen nur 'quizzer' (höchstens 20), Battle-Räume wie bisher nur 'player'/'juror'
create or replace function public.mb_join_room(p_room_code text, p_display_name text, p_role text)
returns table(room_id uuid, member_id uuid, role text, player_slot integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_room_id uuid;
  v_member_id uuid;
  v_slot integer;
  v_device_mode text;
  v_game text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_display_name)) not between 1 and 40 then raise exception 'invalid display name'; end if;
  if p_role not in ('player','juror','quizzer') then raise exception 'invalid role'; end if;

  select r.id,r.device_mode,r.game into v_room_id,v_device_mode,v_game
  from public.mb_rooms r
  where upper(r.code)=upper(trim(p_room_code)) and r.status<>'closed';

  if v_room_id is null then raise exception 'room not found'; end if;

  if exists(select 1 from public.mb_members m where m.room_id=v_room_id and m.user_id=v_uid) then
    return query
      select m.room_id,m.id,m.role,m.player_slot
      from public.mb_members m
      where m.room_id=v_room_id and m.user_id=v_uid
      limit 1;
    return;
  end if;

  if v_game='quiz' then
    if p_role<>'quizzer' then raise exception 'this room is a quiz'; end if;
    if (select count(*) from public.mb_members m where m.room_id=v_room_id)>=20 then raise exception 'quiz full'; end if;
    v_slot:=null;
  elsif p_role='quizzer' then
    raise exception 'this room is a battle';
  elsif p_role='player' then
    if v_device_mode <> 'two' then
      raise exception 'this room uses one-device pass & play';
    end if;
    if not exists(select 1 from public.mb_members m where m.room_id=v_room_id and m.role='player' and m.player_slot=1) then
      v_slot:=1;
    elsif not exists(select 1 from public.mb_members m where m.room_id=v_room_id and m.role='player' and m.player_slot=2) then
      v_slot:=2;
    else
      raise exception 'player slots full';
    end if;
  else
    v_slot:=null;
  end if;

  insert into public.mb_members(room_id,user_id,display_name,role,player_slot)
  values(v_room_id,v_uid,trim(p_display_name),p_role,v_slot)
  returning id into v_member_id;

  return query select v_room_id,v_member_id,p_role,v_slot;
end;
$$;

-- Song-Pool einer Person setzen (ersetzt den bisherigen Pool dieser Person), nur in der Lobby.
-- p_tracks: [{"spotify_track_id","title","artist","album","spotify_album_id","album_type","release_date",
--             "release_year","cover_url","duration_ms","source","rank"}, …] (höchstens 300)
create or replace function public.mb_quiz_set_pool(p_room_id uuid, p_member_id uuid, p_tracks jsonb)
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
  if v_room.status not in ('lobby', 'finished') then raise exception 'quiz running'; end if;
  if not exists (select 1 from public.mb_members m where m.id = p_member_id and m.room_id = p_room_id and m.user_id = v_uid and m.role = 'quizzer') then
    raise exception 'not a room member';
  end if;
  if jsonb_typeof(p_tracks) <> 'array' then raise exception 'invalid tracks'; end if;
  if jsonb_array_length(p_tracks) > 300 then raise exception 'too many tracks'; end if;

  delete from public.mb_quiz_pool where room_id = p_room_id and member_id = p_member_id;

  insert into public.mb_quiz_pool (room_id, member_id, user_id, spotify_track_id, title, artist, album, spotify_album_id,
    album_type, release_date, release_year, cover_url, duration_ms, source, rank)
  select p_room_id, p_member_id, v_uid, t->>'spotify_track_id', left(t->>'title', 300), left(t->>'artist', 300),
    left(coalesce(t->>'album', ''), 300), nullif(t->>'spotify_album_id', ''), nullif(t->>'album_type', ''),
    nullif(t->>'release_date', ''), (t->>'release_year')::integer, nullif(t->>'cover_url', ''),
    (t->>'duration_ms')::integer, t->>'source', (t->>'rank')::integer
  from jsonb_array_elements(p_tracks) t
  on conflict on constraint mb_quiz_pool_one_per_member do nothing;

  select count(*) into v_count from public.mb_quiz_pool where room_id = p_room_id and member_id = p_member_id;
  update public.mb_members set quiz_track_count = v_count where id = p_member_id;
  return v_count;
end;
$$;

-- Antwort abgeben: nur Mitspielende, nur solange die Frage läuft (Frist + 1 s Netz-Toleranz), nur einmal.
-- p_answer: year → {"year": 1999}; older → {"choice": 1|2}; cover/whose → {"choice": 1..4} bzw. {"member_id": "…"}
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

revoke execute on function public.mb_create_quiz_room(text, text, integer) from public, anon;
revoke execute on function public.mb_join_room(text, text, text) from public, anon;
revoke execute on function public.mb_quiz_set_pool(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.mb_quiz_answer(uuid, uuid, jsonb) from public, anon;
grant execute on function public.mb_create_quiz_room(text, text, integer) to authenticated;
grant execute on function public.mb_join_room(text, text, text) to authenticated;
grant execute on function public.mb_quiz_set_pool(uuid, uuid, jsonb) to authenticated;
grant execute on function public.mb_quiz_answer(uuid, uuid, jsonb) to authenticated;

-- Realtime: laufende Frage, Antwortzähler und (nach dem Aufdecken) Antworten der anderen
alter publication supabase_realtime add table public.mb_quiz_questions;
alter publication supabase_realtime add table public.mb_quiz_answers;
