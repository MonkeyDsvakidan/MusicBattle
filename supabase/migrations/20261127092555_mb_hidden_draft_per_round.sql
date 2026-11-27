-- 4.7 Verdeckter Draft: pro Runde aufdecken (Entscheid Aladin 27.11.2026, ersetzt «alles nach dem letzten Pick»).
-- Fremde Picks einer Runde werden lesbar, wenn der Draft komplett ist (wie bisher) UND die Runde begonnen hat:
-- p_round <= mb_rooms.current_round. current_round setzen nur die RPCs (mb_start_battle, mb_advance_round,
-- mb_start_sudden_death) – Clients dürfen die Spalte nicht schreiben, der Host kann so nicht früher spicken.
-- Während des Drafts ist current_round 0, beim Battle-Start 1; nach Matchende ist alles bis zur letzten Runde offen.
-- Eigene Picks bleiben immer lesbar (Policy mb_draft_select_room unverändert).

create or replace function public.mb_draft_pick_public(p_room_id uuid, p_round integer)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select not r.draft_hidden
      or (p_round <= r.current_round
          and (select count(*) from public.mb_draft_picks q
               where q.room_id = p_room_id and (q.round_number = 6) = (p_round = 6))
              >= case when p_round = 6 then 2 else 10 end)
  from public.mb_rooms r where r.id = p_room_id;
$$;
revoke execute on function public.mb_draft_pick_public(uuid, integer) from public, anon;
grant execute on function public.mb_draft_pick_public(uuid, integer) to authenticated;
