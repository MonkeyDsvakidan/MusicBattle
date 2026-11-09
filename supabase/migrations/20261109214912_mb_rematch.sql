-- Roadmap 6.6 (09.11.2026), Entscheidung K: Rematch direkt vom Endstand.
-- Der Host startet ein neues Match mit denselben Mitgliedern (Spieler und Juroren, gleicher Modus, Spotify-Status
-- bleibt) direkt im Draft. Der alte Raum zeigt per rematch_room_id auf den neuen; alle Geräte folgen automatisch.
-- Das alte Match bleibt unverändert als Verlauf erhalten (nichts wird gelöscht).

alter table public.mb_rooms
  add column rematch_room_id uuid references public.mb_rooms(id) on delete set null;

create or replace function public.mb_rematch(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
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
  -- doppelter Klick oder zweites Gerät: dasselbe Rematch zurückgeben
  if v_room.rematch_room_id is not null then return v_room.rematch_room_id; end if;
  if (select count(*) from public.mb_members m where m.room_id = p_room_id and m.role = 'player' and m.spotify_ready) <> 2 then
    raise exception 'players missing';
  end if;

  loop
    v_code := public.mb_make_room_code();
    exit when not exists (select 1 from public.mb_rooms r where r.code = v_code);
  end loop;

  insert into public.mb_rooms (code, host_user_id, jury_mode, device_mode, status)
  values (v_code, v_uid, v_room.jury_mode, v_room.device_mode, 'draft')
  returning id into v_new;

  -- gleiche Reihenfolge wie im alten Raum (die App nimmt bei Pass & Play die erste Mitgliedschaft)
  insert into public.mb_members (room_id, user_id, display_name, role, player_slot, spotify_ready, spotify_display_name, artist_count, joined_at)
  select v_new, m.user_id, m.display_name, m.role, m.player_slot, m.spotify_ready, m.spotify_display_name, m.artist_count,
         now() + (row_number() over (order by m.joined_at, m.player_slot nulls last)) * interval '1 millisecond'
  from public.mb_members m
  where m.room_id = p_room_id;

  update public.mb_rooms set rematch_room_id = v_new, updated_at = now() where id = p_room_id;
  return v_new;
end;
$$;

revoke execute on function public.mb_rematch(uuid) from public, anon;
grant execute on function public.mb_rematch(uuid) to authenticated;
