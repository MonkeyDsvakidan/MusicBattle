-- Roadmap 7.12 „Fragen schwieriger“: neue Fragetypen „Intro erraten“ (intro) und „Welches Album?“ (album).
-- mb_quiz_answer braucht keine Änderung: alle Typen ausser year/whose/older erwarten {"choice": 1..4}.

-- Erlaubte Typen erweitern (die Prüfung wird ersetzt, keine Daten betroffen)
alter table public.mb_quiz_questions drop constraint mb_quiz_questions_kind_check;
alter table public.mb_quiz_questions add constraint mb_quiz_questions_kind_check
  check (kind in ('year', 'older', 'cover', 'whose', 'intro', 'album'));

-- Intro erraten: Die Song-ID steht nur in der Lösung (sonst könnte man sie im öffentlichen Teil nachschlagen).
-- Das Host-Gerät spielt die Musik und holt sich dafür nur die Abspiel-Info der laufenden Intro-Frage.
-- Ergebnis: {"track_id": "…", "start_ms": 0} oder null (keine laufende Intro-Frage).
create or replace function public.mb_quiz_host_play(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.mb_rooms%rowtype;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select * into v_room from public.mb_rooms where id = p_room_id;
  if not found or v_room.game <> 'quiz' then raise exception 'quiz not found'; end if;
  if v_room.host_user_id <> v_uid then raise exception 'only host'; end if;
  return (
    select s.solution -> 'play'
    from public.mb_quiz_questions q
    join public.mb_quiz_solutions s on s.question_id = q.id
    where q.room_id = p_room_id and q.game_no = v_room.quiz_game_no and q.question_no = v_room.quiz_question_no
      and q.status = 'open' and q.kind = 'intro'
  );
end;
$$;

revoke execute on function public.mb_quiz_host_play(uuid) from public, anon;
grant execute on function public.mb_quiz_host_play(uuid) to authenticated;
