-- M.1 Mehrspieler: Datenmodell + RPCs für den Gruppenmodus (3–6 Ecken, optional Teams).
-- Grundidee «Ecke» (Plan M.0): Picks, Songs, Stimmen und Sieger zeigen auf die Ecke 1–6
-- (Spalten behalten ihren Namen: player_slot in Picks/Songs = Ecke, voter_slot/choice = Ecke).
-- mb_members.player_slot bleibt der Sitzplatz der Person, neu mb_members.corner = ihre Ecke.
-- Im 1v1 (game_mode = 'duel') ist Ecke = Platz, alle Abläufe bleiben unverändert
-- (Test: supabase/tests/duel_regression.sql).

-- ---------- Räume ----------
alter table public.mb_rooms
  add column game_mode text not null default 'duel',
  add column team_mode boolean not null default false,
  add column round_count integer not null default 5,
  add column corner_count integer,
  add column sudden_corners integer[];

alter table public.mb_rooms
  add constraint mb_rooms_game_mode_check check (game_mode in ('duel', 'group')),
  add constraint mb_rooms_round_count_check check (round_count in (3, 5)),
  add constraint mb_rooms_corner_count_check check (corner_count between 2 and 6),
  add constraint mb_rooms_group_fields check (
    (game_mode = 'duel' and not team_mode and round_count = 5)
    or (game_mode = 'group' and game = 'battle' and device_mode = 'two')),
  add constraint mb_rooms_sudden_corners_check check (
    sudden_corners is null
    or (cardinality(sudden_corners) between 2 and 6 and sudden_corners <@ array[1, 2, 3, 4, 5, 6]));

-- ---------- Mitglieder ----------
alter table public.mb_members add column corner integer;
update public.mb_members set corner = player_slot where role = 'player';

alter table public.mb_members drop constraint mb_members_player_slot_check;
alter table public.mb_members
  add constraint mb_members_player_slot_check check (player_slot between 1 and 6),
  add constraint mb_members_corner_check check (corner between 1 and 6),
  add constraint mb_members_corner_role check ((role = 'player') = (corner is not null));

-- Ecke setzt immer der Server: ohne Teams = Platz, mit Teams = gewähltes Team (sonst das kleinere von 1/2).
create or replace function public.mb_members_set_corner()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_team boolean;
begin
  if new.role <> 'player' then
    new.corner := null;
    return new;
  end if;
  select r.team_mode into v_team from public.mb_rooms r where r.id = new.room_id;
  if not coalesce(v_team, false) then
    new.corner := new.player_slot;
  elsif new.corner is null then
    select t.c into new.corner
    from (values (1), (2)) t(c)
    order by (select count(*) from public.mb_members m
              where m.room_id = new.room_id and m.role = 'player' and m.corner = t.c and m.id <> new.id), t.c
    limit 1;
  end if;
  return new;
end;
$$;
revoke all on function public.mb_members_set_corner() from public, anon, authenticated;

create trigger mb_members_set_corner_trg
before insert or update of role, player_slot, corner on public.mb_members
for each row execute function public.mb_members_set_corner();

-- ---------- Picks, Runden, Songs, Stimmen: Ecke 1–6 ----------
alter table public.mb_draft_picks drop constraint mb_draft_picks_player_slot_check;
alter table public.mb_draft_picks add constraint mb_draft_picks_player_slot_check check (player_slot between 1 and 6);

alter table public.mb_submissions drop constraint mb_submissions_player_slot_check;
alter table public.mb_submissions add constraint mb_submissions_player_slot_check check (player_slot between 1 and 6);

alter table public.mb_rounds drop constraint mb_rounds_winner_slot_check;
alter table public.mb_rounds add constraint mb_rounds_winner_slot_check check (winner_slot between 1 and 6);
-- Punkte je Ecke in dieser Runde (Anzahl Stimmen, ohne Verdoppelung), nur im Gruppenmodus, nur serverseitig
alter table public.mb_rounds add column points jsonb;
alter table public.mb_rounds add constraint mb_rounds_points_check check (points is null or jsonb_typeof(points) = 'object');

alter table public.mb_category_votes drop constraint mb_category_votes_choice_check;
alter table public.mb_category_votes add constraint mb_category_votes_choice_check check (choice between 1 and 6);
alter table public.mb_category_votes drop constraint mb_category_votes_voter_slot_check;
alter table public.mb_category_votes add constraint mb_category_votes_voter_slot_check check (voter_slot is null or voter_slot between 1 and 6);

-- Gruppenräume: Status ändert nur der Server (mb_start_draft usw.), nie der Client direkt.
create or replace function public.mb_rooms_guard_group_status()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.game_mode = 'group' and new.status is distinct from old.status and current_user in ('authenticated', 'anon') then
    raise exception 'use mb_start_draft';
  end if;
  return new;
end;
$$;
revoke all on function public.mb_rooms_guard_group_status() from public, anon, authenticated;

create trigger mb_rooms_guard_group_status_trg
before update of status on public.mb_rooms
for each row execute function public.mb_rooms_guard_group_status();

-- Ecken, die in einer Runde spielen: Sudden Death (Runde 6) nur die Punktgleichen, sonst alle.
create or replace function public.mb_corners_in_play(p_room public.mb_rooms, p_round integer)
returns integer[]
language sql
immutable
set search_path to 'public'
as $$
  select case when p_round = 6 then coalesce(p_room.sudden_corners, array[1, 2])
              else array(select generate_series(1, coalesce(p_room.corner_count, 2))) end;
$$;
revoke all on function public.mb_corners_in_play(public.mb_rooms, integer) from public, anon, authenticated;

-- ---------- RLS: «Pick/Song gehört zu meiner Ecke» statt eigener Platz ----------
alter policy mb_draft_insert_player on public.mb_draft_picks
  with check (
    player_user_id = (select auth.uid())
    and exists (select 1 from public.mb_members m
                where m.room_id = mb_draft_picks.room_id and m.user_id = (select auth.uid())
                  and m.role = 'player' and m.corner = mb_draft_picks.player_slot)
    and exists (select 1 from public.mb_rooms r
                where r.id = mb_draft_picks.room_id
                  and (mb_draft_picks.round_number <= r.round_count
                       or (mb_draft_picks.round_number = 6
                           and mb_draft_picks.player_slot = any (coalesce(r.sudden_corners, array[1, 2]))))));

alter policy mb_draft_select_room on public.mb_draft_picks
  using (
    exists (select 1 from public.mb_members m
            where m.room_id = mb_draft_picks.room_id and m.user_id = (select auth.uid()))
    and (player_user_id = (select auth.uid())
         or exists (select 1 from public.mb_members m
                    where m.room_id = mb_draft_picks.room_id and m.user_id = (select auth.uid())
                      and m.role = 'player' and m.corner = mb_draft_picks.player_slot)
         or public.mb_draft_pick_public(room_id, round_number)));

alter policy mb_submissions_insert_player on public.mb_submissions
  with check (
    player_user_id = (select auth.uid())
    and exists (select 1 from public.mb_members m
                where m.room_id = mb_submissions.room_id and m.user_id = (select auth.uid())
                  and m.role = 'player' and m.corner = mb_submissions.player_slot));

-- ---------- Verdeckter Draft: Anzahl Picks aus Runden × Ecken ----------
create or replace function public.mb_draft_pick_public(p_room_id uuid, p_round integer)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select not r.draft_hidden
      or (p_round <= r.current_round
          and (select count(*) from public.mb_draft_picks q
               where q.room_id = p_room_id and (q.round_number = 6) = (p_round = 6))
              >= case when p_round = 6 then coalesce(cardinality(r.sudden_corners), 2)
                      else r.round_count * coalesce(r.corner_count, 2) end)
  from public.mb_rooms r where r.id = p_room_id;
$$;

-- ---------- Zugreihenfolge: reihum Ecke 1, 2, 3 …; Sudden Death in der Reihenfolge der Punktgleichen ----------
create or replace function public.mb_draft_turn_slot(p_room_id uuid, p_status text)
returns integer
language sql
stable security definer
set search_path to 'public'
as $$
  select case
    when p_status = 'draft' then
      ((select count(*) from public.mb_draft_picks where room_id = p_room_id and round_number between 1 and 5)
        % coalesce(r.corner_count, 2))::integer + 1
    else
      coalesce(
        (select u.c from unnest(coalesce(r.sudden_corners, array[1, 2])) with ordinality u(c, i)
         where not exists (select 1 from public.mb_draft_picks p
                           where p.room_id = p_room_id and p.round_number = 6 and p.player_slot = u.c)
         order by u.i limit 1),
        (coalesce(r.sudden_corners, array[1, 2]))[cardinality(coalesce(r.sudden_corners, array[1, 2]))])
  end
  from public.mb_rooms r where r.id = p_room_id;
$$;

-- ---------- Gruppenraum erstellen ----------
create or replace function public.mb_create_group_room(p_display_name text, p_team_mode boolean default false, p_round_count integer default 5, p_draft_hidden boolean default false)
returns table(room_id uuid, room_code text, member_id uuid, player_slot integer)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_member_id uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 40 then raise exception 'invalid display name'; end if;
  if p_round_count is null or p_round_count not in (3, 5) then raise exception 'invalid round count'; end if;

  loop
    v_code := public.mb_make_room_code();
    exit when not exists (select 1 from public.mb_rooms r where r.code = v_code);
  end loop;

  insert into public.mb_rooms (code, host_user_id, device_mode, draft_hidden, game_mode, team_mode, round_count)
  values (v_code, v_uid, 'two', coalesce(p_draft_hidden, false), 'group', coalesce(p_team_mode, false), p_round_count)
  returning id into v_room_id;

  insert into public.mb_members (room_id, user_id, display_name, role, player_slot)
  values (v_room_id, v_uid, trim(p_display_name), 'player', 1)
  returning id into v_member_id;

  return query select v_room_id, v_code, v_member_id, 1;
end;
$$;
revoke execute on function public.mb_create_group_room(text, boolean, integer, boolean) from public, anon;
grant execute on function public.mb_create_group_room(text, boolean, integer, boolean) to authenticated;

-- ---------- Beitreten: im Gruppenraum freier Platz 1–6, nur in der Lobby ----------
create or replace function public.mb_join_room(p_room_code text, p_display_name text, p_role text)
returns table(room_id uuid, member_id uuid, role text, player_slot integer)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid:=auth.uid();
  v_room_id uuid;
  v_member_id uuid;
  v_slot integer;
  v_device_mode text;
  v_game text;
  v_game_mode text;
  v_status text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_display_name)) not between 1 and 40 then raise exception 'invalid display name'; end if;
  if p_role not in ('player','juror','quizzer') then raise exception 'invalid role'; end if;

  select r.id,r.device_mode,r.game,r.game_mode,r.status into v_room_id,v_device_mode,v_game,v_game_mode,v_status
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
  elsif p_role='player' and v_game_mode='group' then
    select r.status into v_status from public.mb_rooms r where r.id=v_room_id for update;
    if v_status<>'lobby' then raise exception 'already started'; end if;
    select min(s) into v_slot from generate_series(1,6) s
    where not exists(select 1 from public.mb_members m where m.room_id=v_room_id and m.player_slot=s);
    if v_slot is null then raise exception 'group full'; end if;
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

-- ---------- Teams einteilen (Host, Lobby, nur mit Teams) ----------
create or replace function public.mb_set_member_corner(p_room_id uuid, p_member_id uuid, p_corner integer)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_room public.mb_rooms%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_corner is null or p_corner not between 1 and 6 then raise exception 'invalid corner'; end if;
  select * into v_room from public.mb_rooms where id = p_room_id for update;
  if not found then raise exception 'room not found'; end if;
  if v_room.host_user_id <> auth.uid() then raise exception 'host only'; end if;
  if v_room.game_mode <> 'group' or not v_room.team_mode then raise exception 'teams not enabled'; end if;
  if v_room.status <> 'lobby' then raise exception 'already started'; end if;
  update public.mb_members set corner = p_corner
  where id = p_member_id and room_id = p_room_id and role = 'player';
  if not found then raise exception 'player membership not found'; end if;
  update public.mb_rooms set updated_at = now() where id = p_room_id;
end;
$$;
revoke execute on function public.mb_set_member_corner(uuid, uuid, integer) from public, anon;
grant execute on function public.mb_set_member_corner(uuid, uuid, integer) to authenticated;

-- ---------- Draft starten (Host): prüft Spieler, friert die Ecken ein ----------
-- 1v1: genau 2 Spotify-bereite Spieler. Gruppe: alle Spotify-bereit; ohne Teams 3–6 Personen,
-- mit Teams mindestens 2 Teams. Plätze und Teams werden lückenlos auf 1…n nummeriert.
create or replace function public.mb_start_draft(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_room public.mb_rooms%rowtype;
  v_players integer;
  v_corners integer;
  v_row record;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into v_room from public.mb_rooms where id = p_room_id for update;
  if not found then raise exception 'room not found'; end if;
  if v_room.host_user_id <> auth.uid() then raise exception 'host only'; end if;
  if v_room.game <> 'battle' then raise exception 'this room is a quiz'; end if;
  if v_room.status <> 'lobby' then raise exception 'already started'; end if;

  select count(*) into v_players from public.mb_members where room_id = p_room_id and role = 'player';

  if v_room.game_mode = 'duel' then
    if v_players <> 2 or exists (select 1 from public.mb_members where room_id = p_room_id and role = 'player' and not spotify_ready) then
      raise exception 'players missing';
    end if;
    update public.mb_rooms set status = 'draft', corner_count = 2, updated_at = now() where id = p_room_id;
    return;
  end if;

  if exists (select 1 from public.mb_members where room_id = p_room_id and role = 'player' and not spotify_ready) then
    raise exception 'spotify not ready';
  end if;

  -- Plätze lückenlos 1…n (aufsteigend: das Ziel ist jeweils frei)
  for v_row in
    select id, player_slot, row_number() over (order by player_slot) as rn
    from public.mb_members where room_id = p_room_id and role = 'player' order by player_slot
  loop
    if v_row.player_slot <> v_row.rn then
      update public.mb_members set player_slot = v_row.rn where id = v_row.id;
    end if;
  end loop;

  if v_room.team_mode then
    update public.mb_members m set corner = d.rk
    from (select id, dense_rank() over (order by corner) as rk
          from public.mb_members where room_id = p_room_id and role = 'player') d
    where m.id = d.id and m.corner <> d.rk;
  end if;

  select count(distinct corner) into v_corners from public.mb_members where room_id = p_room_id and role = 'player';
  if v_room.team_mode and v_corners < 2 then raise exception 'not enough teams'; end if;
  if not v_room.team_mode and v_players < 3 then raise exception 'not enough players'; end if;

  update public.mb_rooms set status = 'draft', corner_count = v_corners, updated_at = now() where id = p_room_id;
end;
$$;
revoke execute on function public.mb_start_draft(uuid) from public, anon;
grant execute on function public.mb_start_draft(uuid) to authenticated;

-- ---------- Spotify-Status je Platz: Platz 1–6 ----------
create or replace function public.mb_set_spotify_ready_for_slot(p_room_id uuid, p_slot integer, p_ready boolean, p_display_name text, p_artist_count integer)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_slot not between 1 and 6 then raise exception 'invalid player slot'; end if;
  if not exists(
    select 1 from public.mb_members m
    where m.room_id=p_room_id and m.user_id=auth.uid() and m.role='player' and m.player_slot=p_slot
  ) then
    raise exception 'player slot not owned by user';
  end if;

  update public.mb_members
  set spotify_ready=p_ready,
      spotify_display_name=left(coalesce(p_display_name,''),120),
      artist_count=greatest(coalesce(p_artist_count,0),0),
      last_seen_at=now()
  where room_id=p_room_id and user_id=auth.uid() and role='player' and player_slot=p_slot;
end;
$$;

-- ---------- Eigener Skip: 1 pro Ecke (p_slot = Ecke) ----------
create or replace function public.mb_use_draft_skip(p_room_id uuid, p_slot integer, p_artist_id text)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  if p_slot not between 1 and 6 then raise exception 'invalid slot'; end if;
  if p_artist_id is null or length(trim(p_artist_id))=0 then raise exception 'artist required'; end if;

  update public.mb_members me
  set draft_skip_used=true,
      draft_skipped_artist_id=p_artist_id
  where me.room_id=p_room_id
    and me.user_id=auth.uid()
    and me.role='player'
    and me.corner=p_slot
    and me.draft_skip_used=false
    and not exists(select 1 from public.mb_members o
                   where o.room_id=p_room_id and o.role='player' and o.corner=p_slot and o.draft_skip_used);

  if not found then
    raise exception 'draft skip unavailable';
  end if;
end;
$$;

-- ---------- Gemeinsamer Skip: alle anderen Ecken müssen zustimmen, ein Nein lehnt ab ----------
create or replace function public.mb_propose_shared_skip(p_room_id uuid, p_slot integer, p_artist_id text, p_artist_name text, p_artist_image text)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_room public.mb_rooms%rowtype;
begin
  if p_slot not between 1 and 6 then raise exception 'invalid slot'; end if;
  if p_artist_id is null or length(trim(p_artist_id))=0 or p_artist_name is null or length(trim(p_artist_name))=0 then
    raise exception 'artist required';
  end if;
  if p_artist_image is not null and p_artist_image !~ '^https://i\.scdn\.co/image/[A-Za-z0-9]+$' then p_artist_image:=null; end if;

  select * into v_room from public.mb_rooms where id=p_room_id for update;
  if not found or v_room.status not in ('draft','sudden_draft') then raise exception 'shared skip unavailable'; end if;
  if not exists(select 1 from public.mb_members where room_id=p_room_id and user_id=auth.uid() and role='player' and corner=p_slot) then
    raise exception 'shared skip unavailable';
  end if;
  if public.mb_draft_turn_slot(p_room_id,v_room.status)<>p_slot then raise exception 'shared skip unavailable'; end if;
  if v_room.draft_skip_proposal is not null then raise exception 'shared skip pending'; end if;
  if exists(select 1 from public.mb_draft_picks where room_id=p_room_id and spotify_artist_id=p_artist_id) then
    raise exception 'shared skip unavailable';
  end if;

  update public.mb_rooms
  set draft_skip_proposal=jsonb_build_object('slot',p_slot,'artist_id',p_artist_id,'artist_name',left(trim(p_artist_name),200),'artist_image',p_artist_image),
      updated_at=now()
  where id=p_room_id;
end;
$$;

create or replace function public.mb_answer_shared_skip(p_room_id uuid, p_slot integer, p_accept boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_room public.mb_rooms%rowtype;
  v_from integer;
  v_yes integer[];
  v_others integer[];
begin
  if p_slot not between 1 and 6 then raise exception 'invalid slot'; end if;
  select * into v_room from public.mb_rooms where id=p_room_id for update;
  if not found or v_room.draft_skip_proposal is null then raise exception 'no shared skip pending'; end if;
  if not exists(select 1 from public.mb_members where room_id=p_room_id and user_id=auth.uid() and role='player' and corner=p_slot) then
    raise exception 'shared skip unavailable';
  end if;
  v_from:=(v_room.draft_skip_proposal->>'slot')::integer;
  v_others:=array(select c from unnest(public.mb_corners_in_play(v_room, case when v_room.status='sudden_draft' then 6 else 1 end)) c where c<>v_from);
  if p_slot<>v_from and not (p_slot = any(v_others)) then raise exception 'shared skip unavailable'; end if;

  if p_slot<>v_from and coalesce(p_accept,false) and v_room.status in ('draft','sudden_draft') then
    v_yes:=array(select distinct x from (
      select jsonb_array_elements_text(coalesce(v_room.draft_skip_proposal->'yes','[]'::jsonb))::integer as x
      union select p_slot) s order by x);
    if v_others <@ v_yes then
      update public.mb_rooms
      set draft_shared_skips=array_append(draft_shared_skips,v_room.draft_skip_proposal->>'artist_id'),
          draft_skip_proposal=null,
          updated_at=now()
      where id=p_room_id;
    else
      update public.mb_rooms
      set draft_skip_proposal=v_room.draft_skip_proposal || jsonb_build_object('yes', to_jsonb(v_yes)),
          updated_at=now()
      where id=p_room_id;
    end if;
  else
    update public.mb_rooms set draft_skip_proposal=null, updated_at=now() where id=p_room_id;
  end if;
end;
$$;

-- ---------- Battle starten: 3 oder 5 Runden ----------
create or replace function public.mb_start_battle(p_room_id uuid, p_rounds jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  item jsonb;
  n integer := 0;
  v_status text;
  v_rc integer;
  v_round_count integer;
begin
  -- Serialize concurrent/repeated host calls for the same room.
  select r.status, r.round_count into v_status, v_rc
  from public.mb_rooms r
  where r.id = p_room_id and r.host_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'host only';
  end if;

  select count(*) into v_round_count
  from public.mb_rounds
  where room_id = p_room_id;

  -- Once all rounds exist, repeated render/realtime calls are harmless.
  if v_round_count = v_rc then
    if v_status <> 'battle' then
      update public.mb_rooms
      set status='battle', current_round=1, updated_at=now()
      where id=p_room_id;
    end if;
    return;
  end if;

  if v_round_count <> 0 then
    raise exception 'room has incomplete round setup';
  end if;

  if jsonb_array_length(p_rounds) <> v_rc then
    if v_rc = 5 then raise exception 'five rounds required'; else raise exception 'three rounds required'; end if;
  end if;

  for item in select * from jsonb_array_elements(p_rounds) loop
    n := n + 1;
    insert into public.mb_rounds(room_id, round_number, theme, category, status)
    values(
      p_room_id,
      coalesce((item->>'round_number')::int, n),
      item->>'theme',
      item->>'category',
      case when n=1 then 'song_selection' else 'pending' end
    )
    on conflict (room_id, round_number) do nothing;
  end loop;

  update public.mb_rooms
  set status='battle', current_round=1, updated_at=now()
  where id=p_room_id;
end;
$$;

-- ---------- Abstimmen: Ecken in der Runde; ab 3 Ecken nicht für die eigene;
--            Sudden Death in der Gruppe: die Punktgleichen stimmen nicht ab (ausser es gibt sonst niemanden) ----------
create or replace function public.mb_cast_category_votes(p_round_id uuid, p_member_id uuid, p_votes jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_round public.mb_rounds%rowtype;
  v_room public.mb_rooms%rowtype;
  v_member public.mb_members%rowtype;
  v_has_jurors boolean;
  v_subs integer;
  v_key text;
  v_choice integer;
  v_keys text[] := array['theme', 'vibe', 'lyrics', 'surprise', 'connoisseur'];
  v_in_play integer[];
  v_group boolean;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_round from public.mb_rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  select * into v_room from public.mb_rooms where id = v_round.room_id;
  if v_room.status <> 'battle' or v_round.round_number <> v_room.current_round or v_round.status = 'complete' then
    raise exception 'voting closed';
  end if;
  v_group := v_room.game_mode = 'group';
  v_in_play := public.mb_corners_in_play(v_room, v_round.round_number);

  select count(*) into v_subs from public.mb_submissions where round_id = p_round_id;
  if v_subs < cardinality(v_in_play) then raise exception 'songs not revealed'; end if;

  select * into v_member from public.mb_members where id = p_member_id and room_id = v_round.room_id and user_id = v_uid;
  if not found then raise exception 'not a room member'; end if;

  select exists(select 1 from public.mb_members where room_id = v_round.room_id and role = 'juror') into v_has_jurors;
  if v_has_jurors and v_member.role <> 'juror' then raise exception 'only jurors vote'; end if;
  if not v_has_jurors and v_member.role <> 'player' then raise exception 'only players vote'; end if;
  if v_group and v_member.role = 'player' and v_round.round_number = 6 and v_member.corner = any(v_in_play)
     and exists(select 1 from public.mb_members o where o.room_id = v_round.room_id and o.role = 'player' and not (o.corner = any(v_in_play))) then
    raise exception 'tied corners do not vote';
  end if;

  if jsonb_typeof(p_votes) <> 'object' then raise exception 'invalid votes'; end if;
  foreach v_key in array v_keys loop
    if not (p_votes ? v_key) or jsonb_typeof(p_votes -> v_key) <> 'number' then raise exception 'missing vote: %', v_key; end if;
    v_choice := (p_votes ->> v_key)::integer;
    if not (v_choice = any(v_in_play)) then raise exception 'invalid vote: %', v_key; end if;
    if v_group and v_member.role = 'player' and cardinality(v_in_play) >= 3 and v_choice = v_member.corner then
      raise exception 'no vote for own song';
    end if;
  end loop;
  if (select count(*) from jsonb_object_keys(p_votes)) <> 5 then raise exception 'invalid votes'; end if;

  foreach v_key in array v_keys loop
    insert into public.mb_category_votes (room_id, round_id, voter_member_id, voter_user_id, voter_role, voter_slot, voter_name, category, choice)
    values (v_round.room_id, p_round_id, v_member.id, v_uid, v_member.role, v_member.corner, left(coalesce(v_member.display_name, ''), 60), v_key, (p_votes ->> v_key)::integer)
    on conflict on constraint mb_category_votes_one_per_member
    do update set choice = excluded.choice, updated_at = now();
  end loop;

  return 5;
end;
$$;

-- ---------- Runde abschliessen ----------
-- 1v1 unverändert (Sieger vom Client). Gruppe: Punkte = Stimmen je Ecke (serverseitig), letzte Runde zählt doppelt;
-- Gleichstand an der Spitze nach der letzten Runde → tiebreak mit sudden_corners; in Runde 6 entscheidet bei
-- Gleichstand der Host (p_winner_slot muss eine der Gleichen sein).
create or replace function public.mb_advance_round(p_room_id uuid, p_round_number integer, p_winner_slot integer)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  next_round integer;
  score_1 integer;
  score_2 integer;
  v_room public.mb_rooms%rowtype;
  v_round public.mb_rounds%rowtype;
  v_in_play integer[];
  v_role text;
  v_points jsonb;
  v_top integer[];
  v_winner integer;
begin
  select * into v_room from public.mb_rooms r where r.id = p_room_id;

  if coalesce(v_room.game_mode, 'duel') = 'duel' then
    if p_winner_slot not in (1,2) then raise exception 'invalid winner'; end if;
    if not exists(select 1 from public.mb_rooms r where r.id=p_room_id and r.host_user_id=auth.uid()) then
      raise exception 'host only';
    end if;

    update public.mb_rounds
    set winner_slot=p_winner_slot,status='complete'
    where room_id=p_room_id and round_number=p_round_number;

    if p_round_number < 5 then
      next_round:=p_round_number+1;
      update public.mb_rounds set status='song_selection'
      where room_id=p_room_id and round_number=next_round;
      update public.mb_rooms set current_round=next_round,updated_at=now()
      where id=p_room_id;
      return;
    end if;

    if p_round_number = 5 then
      select
        coalesce(sum(case when winner_slot=1 then case when round_number=5 then 2 else 1 end else 0 end),0),
        coalesce(sum(case when winner_slot=2 then case when round_number=5 then 2 else 1 end else 0 end),0)
      into score_1,score_2
      from public.mb_rounds
      where room_id=p_room_id and round_number between 1 and 5 and status='complete';

      if score_1 = score_2 then
        update public.mb_rooms
        set status='tiebreak',current_round=5,updated_at=now()
        where id=p_room_id;
      else
        update public.mb_rooms
        set status='finished',current_round=5,updated_at=now()
        where id=p_room_id;
      end if;
      return;
    end if;

    update public.mb_rooms
    set status='finished',current_round=6,updated_at=now()
    where id=p_room_id;
    return;
  end if;

  -- Gruppe
  select * into v_room from public.mb_rooms r where r.id = p_room_id for update;
  if v_room.host_user_id is distinct from auth.uid() then raise exception 'host only'; end if;
  select * into v_round from public.mb_rounds where room_id = p_room_id and round_number = p_round_number for update;
  if not found then raise exception 'round not found'; end if;
  if v_round.status = 'complete' then return; end if; -- wiederholter Aufruf
  if v_room.status <> 'battle' or p_round_number <> v_room.current_round then raise exception 'voting closed'; end if;

  v_in_play := public.mb_corners_in_play(v_room, p_round_number);
  v_role := case when exists(select 1 from public.mb_members where room_id = p_room_id and role = 'juror') then 'juror' else 'player' end;
  select jsonb_object_agg(c::text, (select count(*) from public.mb_category_votes v
                                    where v.round_id = v_round.id and v.voter_role = v_role and v.choice = c))
  into v_points from unnest(v_in_play) c;
  v_top := array(select key::integer from jsonb_each_text(v_points)
                 where value::integer = (select max(value::integer) from jsonb_each_text(v_points)) order by 1);

  if cardinality(v_top) = 1 then
    v_winner := v_top[1];
  elsif p_round_number = 6 then
    if p_winner_slot is null or not (p_winner_slot = any(v_top)) then raise exception 'host decision required'; end if;
    v_winner := p_winner_slot;
  else
    v_winner := null;
  end if;

  update public.mb_rounds set points = v_points, winner_slot = v_winner, status = 'complete' where id = v_round.id;

  if p_round_number < v_room.round_count then
    update public.mb_rounds set status = 'song_selection' where room_id = p_room_id and round_number = p_round_number + 1;
    update public.mb_rooms set current_round = p_round_number + 1, updated_at = now() where id = p_room_id;
    return;
  end if;

  if p_round_number = v_room.round_count then
    with totals as (
      select c, coalesce((select sum(coalesce((r.points ->> c::text)::integer, 0) * case when r.round_number = v_room.round_count then 2 else 1 end)
                          from public.mb_rounds r
                          where r.room_id = p_room_id and r.round_number between 1 and v_room.round_count and r.status = 'complete'), 0) as pts
      from generate_series(1, v_room.corner_count) c
    )
    select array_agg(c order by c) into v_top from totals where pts = (select max(pts) from totals);

    if cardinality(v_top) = 1 then
      update public.mb_rooms set status = 'finished', current_round = p_round_number, updated_at = now() where id = p_room_id;
    else
      update public.mb_rooms set status = 'tiebreak', current_round = p_round_number, sudden_corners = v_top, updated_at = now() where id = p_room_id;
    end if;
    return;
  end if;

  update public.mb_rooms set status = 'finished', current_round = 6, updated_at = now() where id = p_room_id;
end;
$$;

-- ---------- Sudden Death: so viele Künstler wie Punktgleiche ----------
create or replace function public.mb_begin_sudden_battle(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_need integer;
begin
  select coalesce(cardinality(sudden_corners), 2) into v_need from public.mb_rooms
  where id=p_room_id and host_user_id=auth.uid() and status='sudden_draft';
  if not found then raise exception 'host only or invalid state'; end if;

  if (select count(*) from public.mb_draft_picks where room_id=p_room_id and round_number=6) <> v_need then
    if v_need = 2 then raise exception 'two sudden death artists required'; else raise exception 'sudden death artists missing'; end if;
  end if;

  update public.mb_rounds
  set status='song_selection'
  where room_id=p_room_id and round_number=6;

  update public.mb_rooms
  set status='battle', current_round=6, updated_at=now()
  where id=p_room_id;
end;
$$;

-- ---------- Rematch: 1v1 unverändert; Gruppe mit denselben Leuten/Teams, Start über mb_start_draft ----------
create or replace function public.mb_rematch(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.mb_rooms%rowtype;
  v_new uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select * into v_room from public.mb_rooms where id = p_room_id for update;
  if not found then raise exception 'room not found'; end if;
  if v_room.host_user_id <> v_uid then raise exception 'only host'; end if;
  if v_room.game <> 'battle' or v_room.status <> 'finished' then raise exception 'match not finished'; end if;
  if v_room.rematch_room_id is not null then return v_room.rematch_room_id; end if;
  if v_room.game_mode = 'duel'
     and (select count(*) from public.mb_members m where m.room_id = p_room_id and m.role = 'player' and m.spotify_ready) <> 2 then
    raise exception 'players missing';
  end if;

  loop
    v_code := public.mb_make_room_code();
    exit when not exists (select 1 from public.mb_rooms r where r.code = v_code);
  end loop;

  insert into public.mb_rooms (code, host_user_id, jury_mode, device_mode, status, draft_hidden, game_mode, team_mode, round_count, corner_count)
  values (v_code, v_uid, v_room.jury_mode, v_room.device_mode,
          case when v_room.game_mode = 'group' then 'lobby' else 'draft' end,
          v_room.draft_hidden, v_room.game_mode, v_room.team_mode, v_room.round_count,
          case when v_room.game_mode = 'group' then null else v_room.corner_count end)
  returning id into v_new;

  insert into public.mb_members (room_id, user_id, display_name, role, player_slot, corner, spotify_ready, spotify_display_name, artist_count, joined_at)
  select v_new, m.user_id, m.display_name, m.role, m.player_slot, m.corner, m.spotify_ready, m.spotify_display_name, m.artist_count,
         now() + (row_number() over (order by m.joined_at, m.player_slot nulls last)) * interval '1 millisecond'
  from public.mb_members m
  where m.room_id = p_room_id;

  if v_room.game_mode = 'group' then
    perform public.mb_start_draft(v_new);
  end if;

  update public.mb_rooms set rematch_room_id = v_new, updated_at = now() where id = p_room_id;
  return v_new;
end;
$$;
