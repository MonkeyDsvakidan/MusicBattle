alter table public.mb_rooms
  add column if not exists device_mode text not null default 'single'
  check (device_mode in ('single','two'));

create or replace function public.mb_create_room(
  p_display_name text,
  p_jury_mode text default 'auto'::text,
  p_device_mode text default 'single'::text
)
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
  if char_length(trim(p_display_name)) not between 1 and 40 then raise exception 'invalid display name'; end if;
  if p_jury_mode not in ('auto','human','ai','hybrid') then raise exception 'invalid jury mode'; end if;
  if p_device_mode not in ('single','two') then raise exception 'invalid device mode'; end if;

  loop
    v_code := public.mb_make_room_code();
    exit when not exists(select 1 from public.mb_rooms r where r.code=v_code);
  end loop;

  insert into public.mb_rooms(code,host_user_id,jury_mode,device_mode)
  values(v_code,v_uid,p_jury_mode,p_device_mode)
  returning id into v_room_id;

  insert into public.mb_members(room_id,user_id,display_name,role,player_slot)
  values(v_room_id,v_uid,trim(p_display_name),'player',1)
  returning id into v_member_id;

  return query select v_room_id,v_code,v_member_id,1;
end;
$$;

grant execute on function public.mb_create_room(text,text,text) to authenticated;

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
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_display_name)) not between 1 and 40 then raise exception 'invalid display name'; end if;
  if p_role not in ('player','juror') then raise exception 'invalid role'; end if;

  select r.id,r.device_mode into v_room_id,v_device_mode
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

  if p_role='player' then
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

grant execute on function public.mb_join_room(text,text,text) to authenticated;

create or replace function public.mb_add_local_player2(p_room_id uuid, p_display_name text)
returns table(room_id uuid, member_id uuid, role text, player_slot integer)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_display_name)) not between 1 and 40 then raise exception 'invalid display name'; end if;
  if not exists(
    select 1 from public.mb_rooms r
    where r.id=p_room_id
      and r.host_user_id=v_uid
      and r.status='lobby'
      and r.device_mode='single'
  ) then
    raise exception 'local player 2 is only available in one-device lobby';
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
