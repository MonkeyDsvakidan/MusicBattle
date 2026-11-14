-- Albumrad (Roadmap W.6): Tags je Spotify-Konto und Album.
-- auto = von Last.fm geholte Tags [{name, count}], added = eigene Tags, hidden = ausgeblendete automatische Tags.
-- Wie mb_rad_events: kein Zugriff für Clients, nur über die Edge Function mb-rad (Service-Rolle).

create table public.mb_rad_tags (
  spotify_user text not null check (char_length(spotify_user) between 1 and 200),
  album_id text not null check (char_length(album_id) between 1 and 64),
  auto jsonb not null default '[]'::jsonb check (jsonb_typeof(auto) = 'array'),
  auto_source text not null default 'none' check (auto_source in ('none', 'album', 'album+artist', 'artist')),
  fetched_at timestamptz,
  added text[] not null default '{}',
  hidden text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (spotify_user, album_id)
);

alter table public.mb_rad_tags enable row level security;
revoke all on table public.mb_rad_tags from anon, authenticated;
grant select, insert, update on table public.mb_rad_tags to service_role;
