-- Baseline-Abgleich (Roadmap 0.1, 06.10.2026)
-- Diese Objekte existieren in der Live-DB, wurden aber ausserhalb der Migrationen
-- (direkt im Dashboard bzw. per SQL) angelegt. Die Migration bildet den Live-Stand
-- exakt nach und ist idempotent: auf der Live-DB ändert sie nichts.

-- Draft: persönliches Hörgewicht des Künstlers (vom Frontend beim Ziehen gesetzt)
alter table public.mb_draft_picks
  add column if not exists artist_draft_weight numeric,
  add column if not exists artist_sources jsonb;

-- Submissions: Spotify-Metadaten für die Jury
alter table public.mb_submissions
  add column if not exists spotify_release_date text,
  add column if not exists spotify_duration_ms integer,
  add column if not exists spotify_album_type text,
  add column if not exists spotify_isrc text,
  add column if not exists spotify_explicit boolean;

-- Jury: Host darf einen eigenen Entscheid als Scorecard speichern,
-- solange kein menschlicher Juror im Raum ist (wird in Roadmap 1.4 angepasst).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mb_jury_scores'
      and policyname = 'mb_scores_insert_host_self_decision'
  ) then
    create policy mb_scores_insert_host_self_decision on public.mb_jury_scores
    for insert to authenticated
    with check (
      source = 'human'
      and juror_user_id = (select auth.uid())
      and coalesce(details ->> 'kind', '') = 'self_decision'
      and exists (
        select 1 from public.mb_rooms r
        where r.id = mb_jury_scores.room_id
          and r.host_user_id = (select auth.uid())
      )
      and exists (
        select 1 from public.mb_rounds rr
        where rr.id = mb_jury_scores.round_id
          and rr.room_id = mb_jury_scores.room_id
      )
      and not exists (
        select 1 from public.mb_members m
        where m.room_id = mb_jury_scores.room_id
          and m.role = 'juror'
      )
    );
  end if;
end $$;
