-- Roadmap 6.3.4 (18.10.2026), Entscheidung G: Steht die Kategorie-Abstimmung der Juroren unentschieden,
-- entscheidet der Host – auch mit Juroren im Raum. Bisher erlaubte die Regel den eigenen Entscheid
-- (mb_jury_scores, details.kind = 'self_decision') nur ohne Juroren (Entscheid 1.1).
-- Nur Erweiterung: alle übrigen Bedingungen der Regel bleiben unverändert (ALTER POLICY, kein DROP).

-- true, wenn alle Juroren des Raums in allen fünf Kategorien abgestimmt haben und die gewonnenen
-- Kategorien gleich verteilt sind (Kategorie-Gleichstand zählt für keinen)
create or replace function public.mb_round_vote_tie(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select room_id from public.mb_rounds where id = p_round_id
  ), jur as (
    select m.id from public.mb_members m join r on m.room_id = r.room_id where m.role = 'juror'
  ), done as (
    select count(*) as total,
           count(*) filter (where (select count(distinct v.category) from public.mb_category_votes v
                                   where v.round_id = p_round_id and v.voter_member_id = jur.id) = 5) as complete
    from jur
  ), cats as (
    select category,
           count(*) filter (where choice = 1) as a,
           count(*) filter (where choice = 2) as b
    from public.mb_category_votes
    where round_id = p_round_id and voter_role = 'juror'
    group by category
  ), won as (
    select count(*) filter (where a > b) as wa, count(*) filter (where b > a) as wb from cats
  )
  select coalesce((select total > 0 and complete = total from done), false)
     and coalesce((select wa = wb from won), false);
$$;

revoke execute on function public.mb_round_vote_tie(uuid) from public, anon;
grant execute on function public.mb_round_vote_tie(uuid) to authenticated;

alter policy mb_scores_insert_host_self_decision on public.mb_jury_scores
with check (
  source = 'human'
  and juror_user_id = (select auth.uid())
  and coalesce(details ->> 'kind', '') = 'self_decision'
  and exists (select 1 from public.mb_rooms r where r.id = mb_jury_scores.room_id and r.host_user_id = (select auth.uid()))
  and exists (select 1 from public.mb_rounds rr where rr.id = mb_jury_scores.round_id and rr.room_id = mb_jury_scores.room_id)
  and (
    not exists (select 1 from public.mb_members m where m.room_id = mb_jury_scores.room_id and m.role = 'juror')
    or public.mb_round_vote_tie(mb_jury_scores.round_id)
  )
);
