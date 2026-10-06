create or replace function public.mb_leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_is_host boolean;
  v_other_members integer;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select exists(
    select 1 from public.mb_rooms r
    where r.id = p_room_id and r.host_user_id = v_uid
  ) into v_is_host;

  if not exists(
    select 1 from public.mb_members m
    where m.room_id = p_room_id and m.user_id = v_uid
  ) then
    return;
  end if;

  delete from public.mb_members
  where room_id = p_room_id and user_id = v_uid;

  select count(*) into v_other_members
  from public.mb_members
  where room_id = p_room_id;

  if v_is_host then
    if v_other_members = 0 then
      update public.mb_rooms set status='closed', updated_at=now() where id=p_room_id;
    else
      update public.mb_rooms set status='closed', updated_at=now() where id=p_room_id;
    end if;
  end if;
end;
$$;

grant execute on function public.mb_leave_room(uuid) to authenticated;
