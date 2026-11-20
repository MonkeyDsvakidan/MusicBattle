-- Albumrad: alte Zähl-Funktion entfernt (ersetzt durch mb_rad_stats seit W.8; Löschen vom Nutzer bestätigt 20.11.2026).
-- Wurde von nichts mehr aufgerufen (Repo und Edge Function mb-rad v7 geprüft), keine Abhängigkeiten in der Datenbank.
drop function public.mb_rad_counts(text);
