alter table public.mb_members drop constraint if exists mb_members_room_id_user_id_key;

create or replace function public.mb_add_local_player2(p_room_id uuid, p_display_name text)
returns table(room_id uuid, member_id uuid, role text, player_slot integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_display_name)) not between 1 and 40 then raise exception 'invalid display name'; end if;
  if not exists(select 1 from public.mb_rooms r where r.id=p_room_id and r.host_user_id=v_uid and r.status='lobby') then
    raise exception 'only host can add local player 2 in lobby';
  end if;
  if exists(select 1 from public.mb_members m where m.room_id=p_room_id and m.player_slot=2) then
    raise exception 'player 2 already exists';
  end if;

  insert into public.mb_members(room_id,user_id,display_name,role,player_slot)
  values(p_room_id,v_uid,trim(p_display_name),'player',2)
  returning id into v_member_id;

  return query select p_room_id,v_member_id,'player'::text,2;
end;
$$;

grant execute on function public.mb_add_local_player2(uuid,text) to authenticated;

create or replace function public.mb_set_spotify_ready_for_slot(
  p_room_id uuid,
  p_slot integer,
  p_ready boolean,
  p_display_name text,
  p_artist_count integer
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_slot not in (1,2) then raise exception 'invalid player slot'; end if;
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

grant execute on function public.mb_set_spotify_ready_for_slot(uuid,integer,boolean,text,integer) to authenticated;

-- Membership lookups must allow one authenticated host to own both local player seats.
create or replace function public.mb_is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists(
    select 1 from public.mb_members m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
  );
$$;
