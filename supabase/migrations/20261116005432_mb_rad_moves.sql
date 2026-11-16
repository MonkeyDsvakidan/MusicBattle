-- Albumrad (Roadmap W.7): von Hand gewähltes Farb-Rad je Spotify-Konto und Album.
-- wheel = Farbgruppe; 'auto' heisst „wieder die berechnete Farbe“ (statt die Zeile zu löschen).
-- Wie mb_rad_events: kein Zugriff für Clients, nur über die Edge Function mb-rad (Service-Rolle).

create table public.mb_rad_moves (
  spotify_user text not null check (char_length(spotify_user) between 1 and 200),
  album_id text not null check (char_length(album_id) between 1 and 64),
  wheel text not null check (wheel in ('auto', 'warm', 'cold', 'pink', 'dark', 'light')),
  updated_at timestamptz not null default now(),
  primary key (spotify_user, album_id)
);

alter table public.mb_rad_moves enable row level security;
revoke all on table public.mb_rad_moves from anon, authenticated;
grant select, insert, update on table public.mb_rad_moves to service_role;
