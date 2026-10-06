
alter table public.mb_members
  add column if not exists draft_skip_used boolean not null default false,
  add column if not exists draft_skipped_artist_id text;

alter table public.mb_rooms drop constraint if exists mb_rooms_current_round_check;
alter table public.mb_rooms add constraint mb_rooms_current_round_check check (current_round between 0 and 6);

alter table public.mb_rooms drop constraint if exists mb_rooms_status_check;
alter table public.mb_rooms add constraint mb_rooms_status_check
  check (status = any (array['lobby'::text,'draft'::text,'battle'::text,'tiebreak'::text,'sudden_draft'::text,'finished'::text,'closed'::text]));

alter table public.mb_rounds drop constraint if exists mb_rounds_round_number_check;
alter table public.mb_rounds add constraint mb_rounds_round_number_check check (round_number between 1 and 6);

create or replace function public.mb_lock_submission_identity()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.round_id is distinct from old.round_id
    or new.room_id is distinct from old.room_id
    or new.player_user_id is distinct from old.player_user_id
    or new.player_slot is distinct from old.player_slot
    or new.spotify_track_id is distinct from old.spotify_track_id
    or new.spotify_uri is distinct from old.spotify_uri
    or new.song_name is distinct from old.song_name
    or new.artist_name is distinct from old.artist_name
    or new.album_name is distinct from old.album_name
    or new.album_image_url is distinct from old.album_image_url
  then
    raise exception 'song selection is locked';
  end if;
  return new;
end;
$$;

drop trigger if exists mb_lock_submission_identity_trg on public.mb_submissions;
create trigger mb_lock_submission_identity_trg
before update on public.mb_submissions
for each row execute function public.mb_lock_submission_identity();

create or replace function public.mb_use_draft_skip(
  p_room_id uuid,
  p_slot integer,
  p_artist_id text
)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $$
begin
  if p_slot not in (1,2) then raise exception 'invalid slot'; end if;
  if p_artist_id is null or length(trim(p_artist_id))=0 then raise exception 'artist required'; end if;

  update public.mb_members
  set draft_skip_used=true,
      draft_skipped_artist_id=p_artist_id
  where room_id=p_room_id
    and user_id=auth.uid()
    and role='player'
    and player_slot=p_slot
    and draft_skip_used=false;

  if not found then
    raise exception 'draft skip unavailable';
  end if;
end;
$$;
revoke all on function public.mb_use_draft_skip(uuid,integer,text) from public, anon;
grant execute on function public.mb_use_draft_skip(uuid,integer,text) to authenticated;

create or replace function public.mb_start_sudden_death(
  p_room_id uuid,
  p_theme text
)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.mb_rooms
  where id=p_room_id and host_user_id=auth.uid()
  for update;

  if not found then raise exception 'host only'; end if;
  if v_status <> 'tiebreak' then raise exception 'sudden death not available'; end if;

  insert into public.mb_rounds(room_id,round_number,theme,category,status)
  values(p_room_id,6,p_theme,'Sudden Death','pending')
  on conflict (room_id,round_number) do nothing;

  update public.mb_rooms
  set status='sudden_draft', current_round=6, updated_at=now()
  where id=p_room_id;
end;
$$;
revoke all on function public.mb_start_sudden_death(uuid,text) from public, anon;
grant execute on function public.mb_start_sudden_death(uuid,text) to authenticated;

create or replace function public.mb_begin_sudden_battle(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $$
begin
  if not exists(
    select 1 from public.mb_rooms
    where id=p_room_id and host_user_id=auth.uid() and status='sudden_draft'
  ) then raise exception 'host only or invalid state'; end if;

  if (select count(*) from public.mb_draft_picks where room_id=p_room_id and round_number=6) <> 2 then
    raise exception 'two sudden death artists required';
  end if;

  update public.mb_rounds
  set status='song_selection'
  where room_id=p_room_id and round_number=6;

  update public.mb_rooms
  set status='battle', current_round=6, updated_at=now()
  where id=p_room_id;
end;
$$;
revoke all on function public.mb_begin_sudden_battle(uuid) from public, anon;
grant execute on function public.mb_begin_sudden_battle(uuid) to authenticated;

create or replace function public.mb_advance_round(
  p_room_id uuid,
  p_round_number integer,
  p_winner_slot integer
)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  next_round integer;
  score_1 integer;
  score_2 integer;
begin
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
end;
$$;
revoke all on function public.mb_advance_round(uuid,integer,integer) from public, anon;
grant execute on function public.mb_advance_round(uuid,integer,integer) to authenticated;
