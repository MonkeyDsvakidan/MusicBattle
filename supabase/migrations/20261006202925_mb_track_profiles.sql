-- Roadmap 3.2 (06.10.2026): Song-Profile für die neue Jury.
-- Ein Profil pro Spotify-Track, wiederverwendbar über alle Räume. Die Daten werden einmal
-- gesammelt (Edge Function, Roadmap 3.3) und danach nur noch gelesen.
-- Lyrics werden NICHT gespeichert – nur daraus abgeleitete Merkmale (lyrics_features).
-- Schreiben ausschliesslich serverseitig (service_role); Clients dürfen nur lesen.

create table public.mb_track_profiles (
  spotify_track_id text primary key check (char_length(spotify_track_id) between 1 and 64),
  isrc text,
  title text not null,
  artist_name text not null,
  album_name text,
  musicbrainz_id text,

  -- Spotify
  release_date text,
  release_year integer check (release_year is null or release_year between 1900 and 2100),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  explicit boolean,
  album_type text,
  artist_genres text[] not null default '{}',

  -- Bekanntheit (null = Quelle hat nichts geliefert)
  lastfm_listeners bigint check (lastfm_listeners is null or lastfm_listeners >= 0),
  lastfm_playcount bigint check (lastfm_playcount is null or lastfm_playcount >= 0),
  lb_listen_count bigint check (lb_listen_count is null or lb_listen_count >= 0),
  lb_user_count bigint check (lb_user_count is null or lb_user_count >= 0),

  -- Stimmungs-/Genre-Tags: [{"name": "night", "count": 12, "source": "lastfm"}, ...]
  tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array'),

  -- Aus den Lyrics abgeleitet, ohne Text:
  -- {"has_lyrics": true, "instrumental": false, "language": "de", "word_count": 412,
  --  "keyword_hits": {"nacht": 3, "stadt": 1}}   (Schlüsselwörter aus themes.json)
  lyrics_features jsonb not null default '{}'::jsonb check (jsonb_typeof(lyrics_features) = 'object'),

  -- Welche Quelle hat geliefert: {"spotify": true, "lrclib": true, "lastfm": false, ...}
  data_coverage jsonb not null default '{}'::jsonb check (jsonb_typeof(data_coverage) = 'object'),

  -- Version der Profil-Logik/Schlüsselwortliste; ältere Profile werden bei Bedarf neu berechnet
  profile_version integer not null default 1,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mb_track_profiles_isrc_idx on public.mb_track_profiles (isrc) where isrc is not null;

comment on table public.mb_track_profiles is 'Song-Profile für die Jury (Roadmap 3.2). Keine Lyrics-Texte, nur abgeleitete Merkmale. Schreiben nur serverseitig.';

-- RLS: lesen für angemeldete Nutzer, keine Schreib-Policies (service_role umgeht RLS)
alter table public.mb_track_profiles enable row level security;

create policy mb_track_profiles_select_authenticated on public.mb_track_profiles
for select to authenticated
using (true);

-- Default-Privileges von Supabase entziehen (siehe CLAUDE.md), nur Lesen erlauben
revoke all on table public.mb_track_profiles from anon, authenticated;
grant select on table public.mb_track_profiles to authenticated;
