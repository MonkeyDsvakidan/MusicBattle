-- S.1 Sicherheits-Check (15.11.2026): Clients dürfen nur noch die Spalten direkt schreiben, die die App wirklich braucht.
-- Vorher konnte jedes Raummitglied seine eigene Zeile in mb_members beliebig ändern (Rolle, Spielerplatz, room_id = fremder Raum,
-- draft_skip_used zurücksetzen), Spieler alle Spalten ihrer Einreichung ändern (die Songwahl selbst sperrt schon der Trigger mb_lock_submission_identity)
-- und der Host Runden direkt schreiben (winner_slot). Alle Spielabläufe laufen über SECURITY-DEFINER-RPCs und sind davon nicht betroffen.
-- Direkte Schreibzugriffe im Frontend (Stand BUILD 20261114-1):
--   mb_rooms.update({status, updated_at})            js/draft.js   (nur Host, Policy mb_rooms_update_host)
--   mb_rooms.update({quiz_length, updated_at})       js/quiz.js    (nur Host)
--   mb_submissions.update({start_ms})                js/battle.js  (nur eigene Einreichung)
--   mb_draft_picks.insert / mb_jury_scores.insert    unverändert (Policies prüfen Spieler bzw. Juror)

begin;

-- mb_members: kein direktes Update mehr (alles über RPCs wie mb_set_spotify_ready, mb_use_draft_skip, mb_leave_room)
revoke update on table public.mb_members from authenticated, anon;

-- mb_submissions: nur noch der Startpunkt
revoke update on table public.mb_submissions from authenticated, anon;
grant update (start_ms) on table public.mb_submissions to authenticated;

-- mb_rooms: nur Status, Quiz-Länge und Zeitstempel (Code, Host, Spielstand nicht mehr direkt änderbar)
revoke update on table public.mb_rooms from authenticated, anon;
grant update (status, quiz_length, updated_at) on table public.mb_rooms to authenticated;

-- mb_rounds: Runden entstehen und enden nur über RPCs (mb_start_battle, mb_advance_round, mb_start_sudden_death)
revoke insert, update on table public.mb_rounds from authenticated, anon;

commit;
