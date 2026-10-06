-- Roadmap 3.7 (06.10.2026), Entscheidung C: Ein automatischer Juror vergibt bei Gleichstand oder
-- fehlenden Daten 10–10 und sagt das offen. Menschliche Scorecards bleiben 10–8 oder 10–9.
-- Die bisherige Regel wird durch eine reine Erweiterung ersetzt (alle bestehenden Zeilen erfüllen sie).
alter table public.mb_jury_scores drop constraint mb_jury_scores_check;
alter table public.mb_jury_scores add constraint mb_jury_scores_check check (
  (score_a = 10 and score_b in (8, 9))
  or (score_b = 10 and score_a in (8, 9))
  or (source = 'ai' and score_a = 10 and score_b = 10)
);
