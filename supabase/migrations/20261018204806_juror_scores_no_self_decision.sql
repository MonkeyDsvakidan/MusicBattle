-- Roadmap 6.3.4 (18.10.2026): Juroren dürfen keine Einträge als „eigener Entscheid“ (details.kind = 'self_decision')
-- anlegen. Die Regel für Juroren-Scorecards prüfte die Art nicht – ein Juror hätte so den Entscheid des Hosts
-- vortäuschen können, der seit Entscheidung G auch einen Gleichstand der Kategorie-Abstimmung entscheidet.
-- Nur zusätzliche Bedingung (ALTER POLICY, kein DROP); bestehende Zeilen bleiben unverändert.
alter policy mb_scores_insert_human_juror on public.mb_jury_scores
with check (
  source = 'human'
  and juror_user_id = auth.uid()
  and coalesce(details ->> 'kind', '') <> 'self_decision'
  and exists (
    select 1 from public.mb_members m
    where m.room_id = mb_jury_scores.room_id and m.user_id = auth.uid() and m.role = 'juror'
  )
);
