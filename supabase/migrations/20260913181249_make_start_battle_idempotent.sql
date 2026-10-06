create or replace function public.mb_start_battle(p_room_id uuid, p_rounds jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  item jsonb;
  n integer := 0;
  v_status text;
  v_round_count integer;
begin
  -- Serialize concurrent/repeated host calls for the same room.
  select r.status into v_status
  from public.mb_rooms r
  where r.id = p_room_id and r.host_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'host only';
  end if;

  select count(*) into v_round_count
  from public.mb_rounds
  where room_id = p_room_id;

  -- Once the five rounds exist, repeated render/realtime calls are harmless.
  if v_round_count = 5 then
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

  if jsonb_array_length(p_rounds) <> 5 then
    raise exception 'five rounds required';
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

grant execute on function public.mb_start_battle(uuid,jsonb) to authenticated;
