-- Roadmap 1.7 (06.10.2026): mb_leave_room bereinigen, Verhalten unverändert.
-- Regel (Entscheidung F):
--   * Host verlässt → Raum wird für alle geschlossen (status = 'closed'). Die übrigen
--     Mitglieder bleiben eingetragen, damit sie den Raum weiter lesen (RLS) und im
--     Frontend „Der Host hat das Match beendet“ sehen.
--   * Spieler 2 / Juror verlässt → nur die eigene Mitgliedschaft wird entfernt; der Raum
--     bleibt offen und der Platz kann per mb_join_room wieder besetzt werden.
-- Vorher waren beide Zweige des Host-Falls identisch (toter Code).
create or replace function public.mb_leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_is_host boolean;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  if not exists(
    select 1 from public.mb_members m
    where m.room_id = p_room_id and m.user_id = v_uid
  ) then
    return;
  end if;

  select exists(
    select 1 from public.mb_rooms r
    where r.id = p_room_id and r.host_user_id = v_uid
  ) into v_is_host;

  delete from public.mb_members
  where room_id = p_room_id and user_id = v_uid;

  if v_is_host then
    update public.mb_rooms set status = 'closed', updated_at = now() where id = p_room_id;
  end if;
end;
$$;
