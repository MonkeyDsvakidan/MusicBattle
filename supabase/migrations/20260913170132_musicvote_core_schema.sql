create extension if not exists pgcrypto;

create table public.mb_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby','draft','battle','finished','closed')),
  jury_mode text not null default 'auto' check (jury_mode in ('auto','human','ai','hybrid')),
  game_state jsonb not null default '{}'::jsonb,
  current_round integer not null default 0 check (current_round between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mb_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.mb_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  role text not null check (role in ('player','juror')),
  player_slot integer check (player_slot in (1,2)),
  spotify_ready boolean not null default false,
  spotify_display_name text,
  artist_count integer not null default 0,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(room_id,user_id),
  unique(room_id,player_slot),
  check ((role='player' and player_slot is not null) or (role='juror' and player_slot is null))
);

create table public.mb_draft_picks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.mb_rooms(id) on delete cascade,
  player_user_id uuid not null references auth.users(id) on delete cascade,
  player_slot integer not null check (player_slot in (1,2)),
  round_number integer not null check (round_number between 1 and 5),
  spotify_artist_id text not null,
  artist_name text not null,
  artist_image_url text,
  created_at timestamptz not null default now(),
  unique(room_id,player_slot,round_number),
  unique(room_id,spotify_artist_id)
);

create table public.mb_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.mb_rooms(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 5),
  theme text not null,
  category text,
  status text not null default 'pending' check (status in ('pending','song_selection','listening','judging','complete')),
  winner_slot integer check (winner_slot in (1,2)),
  created_at timestamptz not null default now(),
  unique(room_id,round_number)
);

create table public.mb_submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.mb_rounds(id) on delete cascade,
  room_id uuid not null references public.mb_rooms(id) on delete cascade,
  player_user_id uuid not null references auth.users(id) on delete cascade,
  player_slot integer not null check (player_slot in (1,2)),
  spotify_track_id text,
  spotify_uri text,
  song_name text not null,
  artist_name text not null,
  album_name text,
  album_image_url text,
  start_ms integer not null default 25000 check (start_ms between 0 and 600000),
  genius_song_id text,
  genius_url text,
  lyrics_provider text,
  lyrics_reference text,
  created_at timestamptz not null default now(),
  unique(round_id,player_slot)
);

create table public.mb_jury_scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.mb_rounds(id) on delete cascade,
  room_id uuid not null references public.mb_rooms(id) on delete cascade,
  source text not null check (source in ('human','ai')),
  juror_user_id uuid references auth.users(id) on delete cascade,
  juror_key text,
  juror_name text not null,
  score_a integer not null check (score_a in (8,9,10)),
  score_b integer not null check (score_b in (8,9,10)),
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((score_a=10 and score_b in (8,9)) or (score_b=10 and score_a in (8,9))),
  check ((source='human' and juror_user_id is not null) or (source='ai' and juror_key is not null))
);

create unique index mb_human_score_once on public.mb_jury_scores(round_id,juror_user_id) where source='human';
create unique index mb_ai_score_once on public.mb_jury_scores(round_id,juror_key) where source='ai';
create index mb_members_room_idx on public.mb_members(room_id);
create index mb_draft_room_idx on public.mb_draft_picks(room_id);
create index mb_rounds_room_idx on public.mb_rounds(room_id);
create index mb_submissions_room_idx on public.mb_submissions(room_id);
create index mb_jury_scores_room_idx on public.mb_jury_scores(room_id);

create or replace function public.mb_make_room_code()
returns text language plpgsql security definer set search_path=public as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text := ''; i integer;
begin
  for i in 1..6 loop result := result || substr(alphabet,1+floor(random()*length(alphabet))::int,1); end loop;
  return result;
end $$;

create or replace function public.mb_create_room(p_display_name text,p_jury_mode text default 'auto')
returns table(room_id uuid,room_code text,member_id uuid,player_slot integer)
language plpgsql security definer set search_path=public,auth as $$
declare v_uid uuid:=auth.uid(); v_room_id uuid; v_member_id uuid; v_code text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_display_name)) not between 1 and 40 then raise exception 'invalid display name'; end if;
  if p_jury_mode not in ('auto','human','ai','hybrid') then raise exception 'invalid jury mode'; end if;
  loop v_code:=public.mb_make_room_code(); exit when not exists(select 1 from public.mb_rooms r where r.code=v_code); end loop;
  insert into public.mb_rooms(code,host_user_id,jury_mode) values(v_code,v_uid,p_jury_mode) returning id into v_room_id;
  insert into public.mb_members(room_id,user_id,display_name,role,player_slot) values(v_room_id,v_uid,trim(p_display_name),'player',1) returning id into v_member_id;
  return query select v_room_id,v_code,v_member_id,1;
end $$;

create or replace function public.mb_join_room(p_room_code text,p_display_name text,p_role text)
returns table(room_id uuid,member_id uuid,role text,player_slot integer)
language plpgsql security definer set search_path=public,auth as $$
declare v_uid uuid:=auth.uid(); v_room_id uuid; v_member_id uuid; v_slot integer;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_display_name)) not between 1 and 40 then raise exception 'invalid display name'; end if;
  if p_role not in ('player','juror') then raise exception 'invalid role'; end if;
  select r.id into v_room_id from public.mb_rooms r where upper(r.code)=upper(trim(p_room_code)) and r.status<>'closed';
  if v_room_id is null then raise exception 'room not found'; end if;
  if exists(select 1 from public.mb_members m where m.room_id=v_room_id and m.user_id=v_uid) then
    return query select m.room_id,m.id,m.role,m.player_slot from public.mb_members m where m.room_id=v_room_id and m.user_id=v_uid; return;
  end if;
  if p_role='player' then
    if not exists(select 1 from public.mb_members m where m.room_id=v_room_id and m.role='player' and m.player_slot=1) then v_slot:=1;
    elsif not exists(select 1 from public.mb_members m where m.room_id=v_room_id and m.role='player' and m.player_slot=2) then v_slot:=2;
    else raise exception 'player slots full'; end if;
  else v_slot:=null; end if;
  insert into public.mb_members(room_id,user_id,display_name,role,player_slot) values(v_room_id,v_uid,trim(p_display_name),p_role,v_slot) returning id into v_member_id;
  return query select v_room_id,v_member_id,p_role,v_slot;
end $$;

create or replace function public.mb_set_spotify_ready(p_room_id uuid,p_ready boolean,p_display_name text default null,p_artist_count integer default 0)
returns void language plpgsql security definer set search_path=public,auth as $$
begin
  update public.mb_members set spotify_ready=p_ready,spotify_display_name=coalesce(nullif(trim(p_display_name),''),spotify_display_name),artist_count=greatest(coalesce(p_artist_count,0),0),last_seen_at=now()
  where room_id=p_room_id and user_id=auth.uid() and role='player';
  if not found then raise exception 'player membership not found'; end if;
end $$;

create or replace function public.mb_start_battle(p_room_id uuid,p_rounds jsonb)
returns void language plpgsql security definer set search_path=public,auth as $$
declare item jsonb; n integer:=0;
begin
  if not exists(select 1 from public.mb_rooms r where r.id=p_room_id and r.host_user_id=auth.uid()) then raise exception 'host only'; end if;
  if jsonb_array_length(p_rounds)<>5 then raise exception 'five rounds required'; end if;
  delete from public.mb_rounds where room_id=p_room_id;
  for item in select * from jsonb_array_elements(p_rounds) loop
    n:=n+1;
    insert into public.mb_rounds(room_id,round_number,theme,category,status) values(p_room_id,coalesce((item->>'round_number')::int,n),item->>'theme',item->>'category',case when n=1 then 'song_selection' else 'pending' end);
  end loop;
  update public.mb_rooms set status='battle',current_round=1,updated_at=now() where id=p_room_id;
end $$;

create or replace function public.mb_advance_round(p_room_id uuid,p_round_number integer,p_winner_slot integer)
returns void language plpgsql security definer set search_path=public,auth as $$
declare next_round integer;
begin
  if p_winner_slot not in (1,2) then raise exception 'invalid winner'; end if;
  if not exists(select 1 from public.mb_rooms r where r.id=p_room_id and r.host_user_id=auth.uid()) then raise exception 'host only'; end if;
  update public.mb_rounds set winner_slot=p_winner_slot,status='complete' where room_id=p_room_id and round_number=p_round_number;
  if p_round_number>=5 then update public.mb_rooms set status='finished',current_round=5,updated_at=now() where id=p_room_id;
  else next_round:=p_round_number+1; update public.mb_rounds set status='song_selection' where room_id=p_room_id and round_number=next_round; update public.mb_rooms set current_round=next_round,updated_at=now() where id=p_room_id; end if;
end $$;

alter table public.mb_rooms enable row level security;
alter table public.mb_members enable row level security;
alter table public.mb_draft_picks enable row level security;
alter table public.mb_rounds enable row level security;
alter table public.mb_submissions enable row level security;
alter table public.mb_jury_scores enable row level security;

revoke all on public.mb_rooms,public.mb_members,public.mb_draft_picks,public.mb_rounds,public.mb_submissions,public.mb_jury_scores from anon;
grant select,update on public.mb_rooms to authenticated;
grant select,update on public.mb_members to authenticated;
grant select,insert on public.mb_draft_picks to authenticated;
grant select,insert,update on public.mb_rounds to authenticated;
grant select,insert,update on public.mb_submissions to authenticated;
grant select,insert on public.mb_jury_scores to authenticated;
grant execute on function public.mb_create_room(text,text) to authenticated;
grant execute on function public.mb_join_room(text,text,text) to authenticated;
grant execute on function public.mb_set_spotify_ready(uuid,boolean,text,integer) to authenticated;
grant execute on function public.mb_start_battle(uuid,jsonb) to authenticated;
grant execute on function public.mb_advance_round(uuid,integer,integer) to authenticated;

create policy mb_rooms_select_member on public.mb_rooms for select to authenticated using (exists(select 1 from public.mb_members m where m.room_id=mb_rooms.id and m.user_id=auth.uid()));
create policy mb_rooms_update_host on public.mb_rooms for update to authenticated using (host_user_id=auth.uid()) with check (host_user_id=auth.uid());
create policy mb_members_select_room on public.mb_members for select to authenticated using (exists(select 1 from public.mb_members me where me.room_id=mb_members.room_id and me.user_id=auth.uid()));
create policy mb_members_update_self on public.mb_members for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy mb_draft_select_room on public.mb_draft_picks for select to authenticated using (exists(select 1 from public.mb_members m where m.room_id=mb_draft_picks.room_id and m.user_id=auth.uid()));
create policy mb_draft_insert_player on public.mb_draft_picks for insert to authenticated with check (player_user_id=auth.uid() and exists(select 1 from public.mb_members m where m.room_id=mb_draft_picks.room_id and m.user_id=auth.uid() and m.role='player' and m.player_slot=mb_draft_picks.player_slot));
create policy mb_rounds_select_room on public.mb_rounds for select to authenticated using (exists(select 1 from public.mb_members m where m.room_id=mb_rounds.room_id and m.user_id=auth.uid()));
create policy mb_rounds_insert_host on public.mb_rounds for insert to authenticated with check (exists(select 1 from public.mb_rooms r where r.id=mb_rounds.room_id and r.host_user_id=auth.uid()));
create policy mb_rounds_update_host on public.mb_rounds for update to authenticated using (exists(select 1 from public.mb_rooms r where r.id=mb_rounds.room_id and r.host_user_id=auth.uid())) with check (exists(select 1 from public.mb_rooms r where r.id=mb_rounds.room_id and r.host_user_id=auth.uid()));
create policy mb_submissions_select_room on public.mb_submissions for select to authenticated using (exists(select 1 from public.mb_members m where m.room_id=mb_submissions.room_id and m.user_id=auth.uid()));
create policy mb_submissions_insert_player on public.mb_submissions for insert to authenticated with check (player_user_id=auth.uid() and exists(select 1 from public.mb_members m where m.room_id=mb_submissions.room_id and m.user_id=auth.uid() and m.role='player' and m.player_slot=mb_submissions.player_slot));
create policy mb_submissions_update_player on public.mb_submissions for update to authenticated using (player_user_id=auth.uid()) with check (player_user_id=auth.uid());
create policy mb_scores_select_room on public.mb_jury_scores for select to authenticated using (exists(select 1 from public.mb_members m where m.room_id=mb_jury_scores.room_id and m.user_id=auth.uid()));
create policy mb_scores_insert_human_juror on public.mb_jury_scores for insert to authenticated with check (source='human' and juror_user_id=auth.uid() and exists(select 1 from public.mb_members m where m.room_id=mb_jury_scores.room_id and m.user_id=auth.uid() and m.role='juror'));

alter publication supabase_realtime add table public.mb_rooms;
alter publication supabase_realtime add table public.mb_members;
alter publication supabase_realtime add table public.mb_draft_picks;
alter publication supabase_realtime add table public.mb_rounds;
alter publication supabase_realtime add table public.mb_submissions;
alter publication supabase_realtime add table public.mb_jury_scores;
