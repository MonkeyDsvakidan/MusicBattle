-- 6.7 Gemeinsamer Skip im Draft (Entscheidung 16.11.2026): Zusätzlich zum einmaligen, einseitigen Skip kann ein gezogener
-- Künstler beliebig oft übersprungen werden, wenn beide Spieler einverstanden sind. Gilt auch im Sudden-Death-Draft,
-- der Vorschlag läuft nicht ab (bleibt offen bis Ja/Nein oder Zurückziehen).
-- mb_rooms.draft_skip_proposal: offener Vorschlag {slot, artist_id, artist_name, artist_image} (sonst null).
-- mb_rooms.draft_shared_skips: gemeinsam übersprungene Künstler-IDs dieses Raums (werden nicht mehr gezogen).
-- Beide Spalten nur über die RPCs schreibbar (Clients haben seit 20261115220000 nur Spalten-Rechte auf status/quiz_length/updated_at).

begin;

alter table public.mb_rooms
  add column if not exists draft_skip_proposal jsonb,
  add column if not exists draft_shared_skips text[] not null default '{}';

-- Wer ist gerade am Ziehen? Draft: gerade Anzahl Picks (Runde 1–5) → Platz 1. Sudden Death: Platz 1, bis er fixiert hat.
create or replace function public.mb_draft_turn_slot(p_room_id uuid, p_status text)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p_status='draft' then
      case when (select count(*) from public.mb_draft_picks where room_id=p_room_id and round_number between 1 and 5)%2=0 then 1 else 2 end
    else
      case when exists(select 1 from public.mb_draft_picks where room_id=p_room_id and round_number=6 and player_slot=1) then 2 else 1 end
  end;
$$;
revoke all on function public.mb_draft_turn_slot(uuid,text) from public, anon, authenticated;

create or replace function public.mb_propose_shared_skip(
  p_room_id uuid,
  p_slot integer,
  p_artist_id text,
  p_artist_name text,
  p_artist_image text
)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_room public.mb_rooms%rowtype;
begin
  if p_slot not in (1,2) then raise exception 'invalid slot'; end if;
  if p_artist_id is null or length(trim(p_artist_id))=0 or p_artist_name is null or length(trim(p_artist_name))=0 then
    raise exception 'artist required';
  end if;
  if p_artist_image is not null and p_artist_image !~ '^https://i\.scdn\.co/image/[A-Za-z0-9]+$' then p_artist_image:=null; end if;

  select * into v_room from public.mb_rooms where id=p_room_id for update;
  if not found or v_room.status not in ('draft','sudden_draft') then raise exception 'shared skip unavailable'; end if;
  if not exists(select 1 from public.mb_members where room_id=p_room_id and user_id=auth.uid() and role='player' and player_slot=p_slot) then
    raise exception 'shared skip unavailable';
  end if;
  if public.mb_draft_turn_slot(p_room_id,v_room.status)<>p_slot then raise exception 'shared skip unavailable'; end if;
  if v_room.draft_skip_proposal is not null then raise exception 'shared skip pending'; end if;
  if exists(select 1 from public.mb_draft_picks where room_id=p_room_id and spotify_artist_id=p_artist_id) then
    raise exception 'shared skip unavailable';
  end if;

  update public.mb_rooms
  set draft_skip_proposal=jsonb_build_object('slot',p_slot,'artist_id',p_artist_id,'artist_name',left(trim(p_artist_name),200),'artist_image',p_artist_image),
      updated_at=now()
  where id=p_room_id;
end;
$$;
revoke all on function public.mb_propose_shared_skip(uuid,integer,text,text,text) from public, anon;
grant execute on function public.mb_propose_shared_skip(uuid,integer,text,text,text) to authenticated;

-- Antwort auf den Vorschlag: der andere Platz sagt Ja (überspringen) oder Nein (behalten);
-- der vorschlagende Platz kann nur zurückziehen (p_accept wird dann ignoriert).
create or replace function public.mb_answer_shared_skip(
  p_room_id uuid,
  p_slot integer,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_room public.mb_rooms%rowtype;
  v_from integer;
begin
  if p_slot not in (1,2) then raise exception 'invalid slot'; end if;
  select * into v_room from public.mb_rooms where id=p_room_id for update;
  if not found or v_room.draft_skip_proposal is null then raise exception 'no shared skip pending'; end if;
  if not exists(select 1 from public.mb_members where room_id=p_room_id and user_id=auth.uid() and role='player' and player_slot=p_slot) then
    raise exception 'shared skip unavailable';
  end if;
  v_from:=(v_room.draft_skip_proposal->>'slot')::integer;

  if p_slot<>v_from and coalesce(p_accept,false) and v_room.status in ('draft','sudden_draft') then
    update public.mb_rooms
    set draft_shared_skips=array_append(draft_shared_skips,v_room.draft_skip_proposal->>'artist_id'),
        draft_skip_proposal=null,
        updated_at=now()
    where id=p_room_id;
  else
    update public.mb_rooms set draft_skip_proposal=null, updated_at=now() where id=p_room_id;
  end if;
end;
$$;
revoke all on function public.mb_answer_shared_skip(uuid,integer,boolean) from public, anon;
grant execute on function public.mb_answer_shared_skip(uuid,integer,boolean) to authenticated;

-- Wird der vorgeschlagene Künstler trotzdem eingesetzt (oder einseitig übersprungen), ist der Vorschlag erledigt.
create or replace function public.mb_clear_skip_proposal_on_pick()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.mb_rooms set draft_skip_proposal=null
  where id=new.room_id and draft_skip_proposal->>'artist_id'=new.spotify_artist_id;
  return new;
end;
$$;
revoke all on function public.mb_clear_skip_proposal_on_pick() from public, anon, authenticated;
create or replace trigger mb_clear_skip_proposal_on_pick after insert on public.mb_draft_picks
for each row execute function public.mb_clear_skip_proposal_on_pick();

commit;
