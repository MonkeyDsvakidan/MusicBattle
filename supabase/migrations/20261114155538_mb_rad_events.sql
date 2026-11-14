-- Albumrad (Roadmap W.5): Protokoll „gehört“ / „abgelehnt“ je Spotify-Konto und Album.
-- Kein Zugriff für Clients: Lesen und Schreiben nur über die Edge Function mb-rad (Service-Rolle),
-- die das Spotify-Konto über das Spotify-Token prüft. Darum RLS ohne Policies und keine Rechte für anon/authenticated.

create table public.mb_rad_events (
  id bigint generated always as identity primary key,
  spotify_user text not null check (char_length(spotify_user) between 1 and 200),
  album_id text not null check (char_length(album_id) between 1 and 64),
  kind text not null check (kind in ('listen', 'reject')),
  source text not null default 'tap' check (source in ('tap', 'auto')),
  created_at timestamptz not null default now()
);

create index mb_rad_events_user_time on public.mb_rad_events (spotify_user, created_at desc);
create index mb_rad_events_user_album on public.mb_rad_events (spotify_user, album_id);

alter table public.mb_rad_events enable row level security;
revoke all on table public.mb_rad_events from anon, authenticated;
grant select, insert on table public.mb_rad_events to service_role;

-- Zähler je Album für ein Spotify-Konto
create function public.mb_rad_counts(p_user text)
returns table (album_id text, listens bigint, rejects bigint, last_listen timestamptz, last_reject timestamptz)
language sql
stable
set search_path = ''
as $$
  select e.album_id,
         count(*) filter (where e.kind = 'listen'),
         count(*) filter (where e.kind = 'reject'),
         max(e.created_at) filter (where e.kind = 'listen'),
         max(e.created_at) filter (where e.kind = 'reject')
  from public.mb_rad_events e
  where e.spotify_user = p_user
  group by e.album_id;
$$;

revoke execute on function public.mb_rad_counts(text) from public, anon, authenticated;
grant execute on function public.mb_rad_counts(text) to service_role;
