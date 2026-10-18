-- Roadmap 6.3.1 (18.10.2026), Entscheidung G: Rundensieger per Abstimmung in fünf Kategorien.
-- Sind Juroren im Raum, stimmen nur Juroren ab, sonst die Spieler (bei Pass & Play beide Spielerplätze
-- mit derselben Anmeldung → die Stimme gehört zum Mitglied/Platz, nicht nur zur Anmeldung).
-- Schreiben nur über mb_cast_category_votes (prüft die Regeln); lesen dürfen alle Mitglieder des Raums.
-- Bestehende Tabellen (mb_jury_scores usw.) bleiben unverändert.

create table public.mb_category_votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.mb_rooms(id) on delete cascade,
  round_id uuid not null references public.mb_rounds(id) on delete cascade,
  -- Mitglied, das abgestimmt hat; bleibt null, falls das Mitglied später den Raum verlässt
  voter_member_id uuid references public.mb_members(id) on delete set null,
  voter_user_id uuid not null,
  voter_role text not null check (voter_role in ('player', 'juror')),
  voter_slot integer check (voter_slot is null or voter_slot in (1, 2)),
  voter_name text not null default '' check (char_length(voter_name) <= 60),
  category text not null check (category in ('theme', 'vibe', 'lyrics', 'surprise', 'connoisseur')),
  choice integer not null check (choice in (1, 2)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mb_category_votes_one_per_member unique (round_id, voter_member_id, category)
);

create index mb_category_votes_round_idx on public.mb_category_votes (round_id);
create index mb_category_votes_room_idx on public.mb_category_votes (room_id);

comment on table public.mb_category_votes is 'Kategorie-Stimmen je Runde (Roadmap 6.3, Entscheidung G). Schreiben nur über mb_cast_category_votes.';

alter table public.mb_category_votes enable row level security;

create policy mb_category_votes_select_members on public.mb_category_votes
for select to authenticated
using (public.mb_is_room_member(room_id));

revoke all on table public.mb_category_votes from anon, authenticated;
grant select on table public.mb_category_votes to authenticated;

-- Stimmen eines Mitglieds für alle fünf Kategorien abgeben (oder bis zur Wertung ändern).
-- p_votes: {"theme":1,"vibe":2,"lyrics":1,"surprise":2,"connoisseur":1}
create or replace function public.mb_cast_category_votes(p_round_id uuid, p_member_id uuid, p_votes jsonb)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_round public.mb_rounds%rowtype;
  v_room public.mb_rooms%rowtype;
  v_member public.mb_members%rowtype;
  v_has_jurors boolean;
  v_subs integer;
  v_key text;
  v_choice integer;
  v_keys text[] := array['theme', 'vibe', 'lyrics', 'surprise', 'connoisseur'];
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_round from public.mb_rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  select * into v_room from public.mb_rooms where id = v_round.room_id;
  if v_room.status <> 'battle' or v_round.round_number <> v_room.current_round or v_round.status = 'complete' then
    raise exception 'voting closed';
  end if;

  select count(*) into v_subs from public.mb_submissions where round_id = p_round_id;
  if v_subs < 2 then raise exception 'songs not revealed'; end if;

  select * into v_member from public.mb_members where id = p_member_id and room_id = v_round.room_id and user_id = v_uid;
  if not found then raise exception 'not a room member'; end if;

  select exists(select 1 from public.mb_members where room_id = v_round.room_id and role = 'juror') into v_has_jurors;
  if v_has_jurors and v_member.role <> 'juror' then raise exception 'only jurors vote'; end if;
  if not v_has_jurors and v_member.role <> 'player' then raise exception 'only players vote'; end if;

  if jsonb_typeof(p_votes) <> 'object' then raise exception 'invalid votes'; end if;
  foreach v_key in array v_keys loop
    if not (p_votes ? v_key) or jsonb_typeof(p_votes -> v_key) <> 'number' then raise exception 'missing vote: %', v_key; end if;
    v_choice := (p_votes ->> v_key)::integer;
    if v_choice not in (1, 2) then raise exception 'invalid vote: %', v_key; end if;
  end loop;
  if (select count(*) from jsonb_object_keys(p_votes)) <> 5 then raise exception 'invalid votes'; end if;

  foreach v_key in array v_keys loop
    insert into public.mb_category_votes (room_id, round_id, voter_member_id, voter_user_id, voter_role, voter_slot, voter_name, category, choice)
    values (v_round.room_id, p_round_id, v_member.id, v_uid, v_member.role, v_member.player_slot, left(coalesce(v_member.display_name, ''), 60), v_key, (p_votes ->> v_key)::integer)
    on conflict on constraint mb_category_votes_one_per_member
    do update set choice = excluded.choice, updated_at = now();
  end loop;

  return 5;
end;
$$;

revoke execute on function public.mb_cast_category_votes(uuid, uuid, jsonb) from public, anon;
grant execute on function public.mb_cast_category_votes(uuid, uuid, jsonb) to authenticated;

-- Realtime: alle Geräte sehen sofort, wer schon abgestimmt hat
alter publication supabase_realtime add table public.mb_category_votes;
