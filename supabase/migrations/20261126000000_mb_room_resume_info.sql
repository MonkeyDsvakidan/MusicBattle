-- U.5: Die GameMaster-Startseite fragt, ob der gespeicherte Raum (localStorage mb_online_room) noch läuft.
-- Liefert nur Status, Spielart und Runde – und nur, wenn der Aufrufer Mitglied des Raums ist (sonst keine Zeile).
-- Dateiname ist ein Platzhalter: nach apply_migration auf die vergebene Version umbenennen.
create or replace function public.mb_room_resume_info(p_room_id uuid)
returns table(status text, game text, current_round integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.status, r.game, r.current_round
  from public.mb_rooms r
  where r.id = p_room_id
    and exists (select 1 from public.mb_members m where m.room_id = r.id and m.user_id = (select auth.uid()));
$$;

revoke execute on function public.mb_room_resume_info(uuid) from public, anon;
grant execute on function public.mb_room_resume_info(uuid) to authenticated;
