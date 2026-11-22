-- Leistung (22.11.2026, Hinweise des Supabase-Advisors): Indizes für Fremdschlüssel und RLS-Regeln, die auth.uid()
-- nur einmal pro Abfrage statt pro Zeile auswerten. Gleiche Bedingungen wie vorher, nur (select auth.uid()).

create index if not exists mb_category_votes_voter_member_idx on public.mb_category_votes (voter_member_id);
create index if not exists mb_draft_picks_player_user_idx on public.mb_draft_picks (player_user_id);
create index if not exists mb_jury_scores_juror_user_idx on public.mb_jury_scores (juror_user_id);
create index if not exists mb_members_user_idx on public.mb_members (user_id);
create index if not exists mb_quiz_answers_member_idx on public.mb_quiz_answers (member_id);
create index if not exists mb_quiz_pool_member_idx on public.mb_quiz_pool (member_id);
create index if not exists mb_rooms_host_user_idx on public.mb_rooms (host_user_id);
create index if not exists mb_rooms_rematch_room_idx on public.mb_rooms (rematch_room_id);
create index if not exists mb_submissions_player_user_idx on public.mb_submissions (player_user_id);

alter policy mb_draft_select_room on public.mb_draft_picks
  using (exists (select 1 from public.mb_members m where m.room_id = mb_draft_picks.room_id and m.user_id = (select auth.uid())));
alter policy mb_draft_insert_player on public.mb_draft_picks
  with check (player_user_id = (select auth.uid()) and exists (select 1 from public.mb_members m
    where m.room_id = mb_draft_picks.room_id and m.user_id = (select auth.uid()) and m.role = 'player' and m.player_slot = mb_draft_picks.player_slot));
alter policy mb_rooms_update_host on public.mb_rooms
  using (host_user_id = (select auth.uid())) with check (host_user_id = (select auth.uid()));
alter policy mb_members_update_self on public.mb_members
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy mb_submissions_insert_player on public.mb_submissions
  with check (player_user_id = (select auth.uid()) and exists (select 1 from public.mb_members m
    where m.room_id = mb_submissions.room_id and m.user_id = (select auth.uid()) and m.role = 'player' and m.player_slot = mb_submissions.player_slot));
alter policy mb_submissions_update_player on public.mb_submissions
  using (player_user_id = (select auth.uid())) with check (player_user_id = (select auth.uid()));
alter policy mb_scores_insert_human_juror on public.mb_jury_scores
  with check (source = 'human' and juror_user_id = (select auth.uid()) and coalesce(details ->> 'kind', '') <> 'self_decision'
    and exists (select 1 from public.mb_members m where m.room_id = mb_jury_scores.room_id and m.user_id = (select auth.uid()) and m.role = 'juror'));
alter policy mb_quiz_pool_select_own on public.mb_quiz_pool
  using (user_id = (select auth.uid()));
alter policy mb_quiz_answers_select on public.mb_quiz_answers
  using (user_id = (select auth.uid()) or (public.mb_is_room_member(room_id)
    and exists (select 1 from public.mb_quiz_questions q where q.id = mb_quiz_answers.question_id and q.status = 'revealed')));
