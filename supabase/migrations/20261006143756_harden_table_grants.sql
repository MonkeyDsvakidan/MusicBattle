-- Roadmap 0.3 (06.10.2026): Tabellen- und Funktionsrechte härten.
-- Supabase vergibt per Default-Privileges ALL auf neue Tabellen und EXECUTE auf neue
-- Funktionen an anon/authenticated. Die Core-Migration hat nur gezielte Grants ergänzt,
-- die Defaults aber nie entzogen. Hier wird exakt der Stand der Core-Migration
-- hergestellt. RLS-Policies bleiben unverändert; service_role (Edge Functions) ist
-- nicht betroffen.

-- Tabellen: alles entziehen, dann die Grants der Core-Migration neu vergeben
revoke all on table
  public.mb_rooms,
  public.mb_members,
  public.mb_draft_picks,
  public.mb_rounds,
  public.mb_submissions,
  public.mb_jury_scores
from anon, authenticated;

grant select, update on public.mb_rooms to authenticated;
grant select, update on public.mb_members to authenticated;
grant select, insert on public.mb_draft_picks to authenticated;
grant select, insert, update on public.mb_rounds to authenticated;
grant select, insert, update on public.mb_submissions to authenticated;
grant select, insert on public.mb_jury_scores to authenticated;

-- Funktionen: kein Zugriff ohne Anmeldung (anon / public)
revoke execute on function
  public.mb_add_local_player2(uuid, text),
  public.mb_advance_round(uuid, integer, integer),
  public.mb_begin_sudden_battle(uuid),
  public.mb_create_room(text, text, text),
  public.mb_is_room_host(uuid),
  public.mb_is_room_member(uuid),
  public.mb_join_room(text, text, text),
  public.mb_leave_room(uuid),
  public.mb_lock_submission_identity(),
  public.mb_make_room_code(),
  public.mb_set_spotify_ready(uuid, boolean, text, integer),
  public.mb_set_spotify_ready_for_slot(uuid, integer, boolean, text, integer),
  public.mb_start_battle(uuid, jsonb),
  public.mb_start_sudden_death(uuid, text),
  public.mb_use_draft_skip(uuid, integer, text)
from public, anon;

-- Interne Hilfsfunktionen: nur innerhalb von SECURITY-DEFINER-Funktionen bzw. als Trigger
revoke execute on function
  public.mb_make_room_code(),
  public.mb_lock_submission_identity()
from authenticated;

-- RPCs der App und Helfer der RLS-Policies bleiben für angemeldete Nutzer ausführbar
grant execute on function
  public.mb_add_local_player2(uuid, text),
  public.mb_advance_round(uuid, integer, integer),
  public.mb_begin_sudden_battle(uuid),
  public.mb_create_room(text, text, text),
  public.mb_is_room_host(uuid),
  public.mb_is_room_member(uuid),
  public.mb_join_room(text, text, text),
  public.mb_leave_room(uuid),
  public.mb_set_spotify_ready(uuid, boolean, text, integer),
  public.mb_set_spotify_ready_for_slot(uuid, integer, boolean, text, integer),
  public.mb_start_battle(uuid, jsonb),
  public.mb_start_sudden_death(uuid, text),
  public.mb_use_draft_skip(uuid, integer, text)
to authenticated;
