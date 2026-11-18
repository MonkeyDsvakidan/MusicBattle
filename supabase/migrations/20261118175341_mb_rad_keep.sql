-- Albumrad (Roadmap W.8): „Behalten“ für oft abgelehnte Alben.
-- Neuer Eintrag kind = 'keep' im Protokoll; er setzt wie ein 'listen' die Zählung „Ablehnungen seit dem letzten Hören“ zurück.
-- Nur die Prüfregel der Spalte wird ersetzt (keine Daten betroffen).
alter table public.mb_rad_events drop constraint mb_rad_events_kind_check;
alter table public.mb_rad_events add constraint mb_rad_events_kind_check check (kind in ('listen', 'reject', 'keep'));

-- Zähler je Album, zusätzlich rejects_since = Ablehnungen nach dem letzten 'listen' oder 'keep'.
-- Ersetzt mb_rad_counts (die bleibt vorerst bestehen, wird aber nicht mehr aufgerufen).
create function public.mb_rad_stats(p_user text)
returns table (album_id text, listens bigint, rejects bigint, rejects_since bigint, last_listen timestamptz, last_reject timestamptz)
language sql
stable
set search_path = ''
as $$
  with e as (
    select ev.album_id, ev.kind, ev.created_at,
           max(ev.created_at) filter (where ev.kind in ('listen', 'keep')) over (partition by ev.album_id) as reset_at
    from public.mb_rad_events ev
    where ev.spotify_user = p_user
  )
  select e.album_id,
         count(*) filter (where e.kind = 'listen'),
         count(*) filter (where e.kind = 'reject'),
         count(*) filter (where e.kind = 'reject' and (e.reset_at is null or e.created_at > e.reset_at)),
         max(e.created_at) filter (where e.kind = 'listen'),
         max(e.created_at) filter (where e.kind = 'reject')
  from e
  group by e.album_id;
$$;

revoke execute on function public.mb_rad_stats(text) from public, anon, authenticated;
grant execute on function public.mb_rad_stats(text) to service_role;
