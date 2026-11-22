-- Aufräumen (22.11.2026, OK des Nutzers): ungenutzte Teile aus der Anfangszeit entfernen.
-- mb_set_spotify_ready: ersetzt durch mb_set_spotify_ready_for_slot, von App und Functions nicht mehr aufgerufen.
drop function if exists public.mb_set_spotify_ready(uuid, boolean, text, integer);
-- mb_rooms.game_state: nie benutzt, in allen Räumen leer ('{}').
alter table public.mb_rooms drop column if exists game_state;
-- mb_rooms.jury_mode bleibt: mb_create_room und mb_rematch schreiben die Spalte noch (alle Räume 'auto').
