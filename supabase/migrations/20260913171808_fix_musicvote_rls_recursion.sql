create or replace function public.mb_is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists(
    select 1
    from public.mb_members m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.mb_is_room_host(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists(
    select 1
    from public.mb_rooms r
    where r.id = p_room_id
      and r.host_user_id = auth.uid()
  );
$$;

grant execute on function public.mb_is_room_member(uuid) to authenticated;
grant execute on function public.mb_is_room_host(uuid) to authenticated;

drop policy if exists mb_rooms_select_member on public.mb_rooms;
create policy mb_rooms_select_member on public.mb_rooms
for select to authenticated
using (public.mb_is_room_member(id));

drop policy if exists mb_rooms_update_host on public.mb_rooms;
create policy mb_rooms_update_host on public.mb_rooms
for update to authenticated
using (host_user_id = auth.uid())
with check (host_user_id = auth.uid());

drop policy if exists mb_members_select_room on public.mb_members;
create policy mb_members_select_room on public.mb_members
for select to authenticated
using (public.mb_is_room_member(room_id));

drop policy if exists mb_members_update_self on public.mb_members;
create policy mb_members_update_self on public.mb_members
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists mb_rounds_select_room on public.mb_rounds;
create policy mb_rounds_select_room on public.mb_rounds
for select to authenticated
using (public.mb_is_room_member(room_id));

drop policy if exists mb_rounds_insert_host on public.mb_rounds;
create policy mb_rounds_insert_host on public.mb_rounds
for insert to authenticated
with check (public.mb_is_room_host(room_id));

drop policy if exists mb_rounds_update_host on public.mb_rounds;
create policy mb_rounds_update_host on public.mb_rounds
for update to authenticated
using (public.mb_is_room_host(room_id))
with check (public.mb_is_room_host(room_id));

drop policy if exists mb_submissions_select_room on public.mb_submissions;
create policy mb_submissions_select_room on public.mb_submissions
for select to authenticated
using (public.mb_is_room_member(room_id));

drop policy if exists mb_submissions_insert_player on public.mb_submissions;
create policy mb_submissions_insert_player on public.mb_submissions
for insert to authenticated
with check (
  player_user_id = auth.uid()
  and exists(
    select 1 from public.mb_members m
    where m.room_id = mb_submissions.room_id
      and m.user_id = auth.uid()
      and m.role = 'player'
      and m.player_slot = mb_submissions.player_slot
  )
);

drop policy if exists mb_submissions_update_player on public.mb_submissions;
create policy mb_submissions_update_player on public.mb_submissions
for update to authenticated
using (player_user_id = auth.uid())
with check (player_user_id = auth.uid());

drop policy if exists mb_scores_select_room on public.mb_jury_scores;
create policy mb_scores_select_room on public.mb_jury_scores
for select to authenticated
using (public.mb_is_room_member(room_id));

drop policy if exists mb_scores_insert_human_juror on public.mb_jury_scores;
create policy mb_scores_insert_human_juror on public.mb_jury_scores
for insert to authenticated
with check (
  source = 'human'
  and juror_user_id = auth.uid()
  and exists(
    select 1 from public.mb_members m
    where m.room_id = mb_jury_scores.room_id
      and m.user_id = auth.uid()
      and m.role = 'juror'
  )
);
