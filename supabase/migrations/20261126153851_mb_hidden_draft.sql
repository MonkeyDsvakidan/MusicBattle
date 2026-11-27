-- 4.7 Verdeckter Draft (Entscheid 26.11.2026): Schalter beim Raum-Erstellen, Standard offen.
-- Verdeckt = die Künstler des Gegners sind bis zum Battle unlesbar – auch per API, nicht nur in der Oberfläche.
-- Jeder liest nur die eigenen Picks; Juroren sehen keine. Aufgedeckt wird, wenn alle 10 Picks (Runde 1–5) bzw.
-- beide Sudden-Death-Picks (Runde 6) gesetzt sind – nicht über mb_rooms.status, den der Host direkt ändern kann.
-- Pass & Play: beide Plätze gehören demselben Konto, dort verdeckt nur die Oberfläche (Entscheid Aladin 26.11.2026).
-- Belegte Runden (ohne Namen) liefert mb_draft_board, damit Zugreihenfolge und Fortschritt stimmen.
-- Keine Doppelten (Entscheid Aladin): mb_draft_artist_taken prüft beim Ziehen, ob ein Künstler schon vergeben ist.

begin;

alter table public.mb_rooms
  add column if not exists draft_hidden boolean not null default false;

-- mb_create_room bekommt den Schalter. Alte Variante (3 Parameter) entfernen, sonst gäbe es zwei Varianten derselben RPC.
drop function if exists public.mb_create_room(text, text, text);

create function public.mb_create_room(
  p_display_name text,
  p_jury_mode text default 'auto'::text,
  p_device_mode text default 'single'::text,
  p_draft_hidden boolean default false
)
returns table(room_id uuid, room_code text, member_id uuid, player_slot integer)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_member_id uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_display_name)) not between 1 and 40 then raise exception 'invalid display name'; end if;
  if p_jury_mode not in ('auto','human','ai','hybrid') then raise exception 'invalid jury mode'; end if;
  if p_device_mode not in ('single','two') then raise exception 'invalid device mode'; end if;

  loop
    v_code := public.mb_make_room_code();
    exit when not exists(select 1 from public.mb_rooms r where r.code=v_code);
  end loop;

  insert into public.mb_rooms(code,host_user_id,jury_mode,device_mode,draft_hidden)
  values(v_code,v_uid,p_jury_mode,p_device_mode,coalesce(p_draft_hidden,false))
  returning id into v_room_id;

  insert into public.mb_members(room_id,user_id,display_name,role,player_slot)
  values(v_room_id,v_uid,trim(p_display_name),'player',1)
  returning id into v_member_id;

  return query select v_room_id,v_code,v_member_id,1;
end;
$$;
revoke execute on function public.mb_create_room(text,text,text,boolean) from public, anon;
grant execute on function public.mb_create_room(text,text,text,boolean) to authenticated;

-- Rematch übernimmt die Einstellung (sonst unverändert wie 20261109214912_mb_rematch.sql)
create or replace function public.mb_rematch(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.mb_rooms%rowtype;
  v_new uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select * into v_room from public.mb_rooms where id = p_room_id for update;
  if not found then raise exception 'room not found'; end if;
  if v_room.host_user_id <> v_uid then raise exception 'only host'; end if;
  if v_room.game <> 'battle' or v_room.status <> 'finished' then raise exception 'match not finished'; end if;
  if v_room.rematch_room_id is not null then return v_room.rematch_room_id; end if;
  if (select count(*) from public.mb_members m where m.room_id = p_room_id and m.role = 'player' and m.spotify_ready) <> 2 then
    raise exception 'players missing';
  end if;

  loop
    v_code := public.mb_make_room_code();
    exit when not exists (select 1 from public.mb_rooms r where r.code = v_code);
  end loop;

  insert into public.mb_rooms (code, host_user_id, jury_mode, device_mode, status, draft_hidden)
  values (v_code, v_uid, v_room.jury_mode, v_room.device_mode, 'draft', v_room.draft_hidden)
  returning id into v_new;

  insert into public.mb_members (room_id, user_id, display_name, role, player_slot, spotify_ready, spotify_display_name, artist_count, joined_at)
  select v_new, m.user_id, m.display_name, m.role, m.player_slot, m.spotify_ready, m.spotify_display_name, m.artist_count,
         now() + (row_number() over (order by m.joined_at, m.player_slot nulls last)) * interval '1 millisecond'
  from public.mb_members m
  where m.room_id = p_room_id;

  update public.mb_rooms set rematch_room_id = v_new, updated_at = now() where id = p_room_id;
  return v_new;
end;
$$;
revoke execute on function public.mb_rematch(uuid) from public, anon;
grant execute on function public.mb_rematch(uuid) to authenticated;

-- Ist ein Pick für alle Mitglieder lesbar? Offener Draft immer; verdeckt erst, wenn die Runden 1–5 (10 Picks)
-- bzw. Runde 6 (2 Picks) komplett sind. SECURITY DEFINER, weil die Policy sonst mb_draft_picks rekursiv abfragt.
create or replace function public.mb_draft_pick_public(p_room_id uuid, p_round integer)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select not r.draft_hidden
      or (select count(*) from public.mb_draft_picks q
          where q.room_id = p_room_id and (q.round_number = 6) = (p_round = 6))
         >= case when p_round = 6 then 2 else 10 end
  from public.mb_rooms r where r.id = p_room_id;
$$;
revoke all on function public.mb_draft_pick_public(uuid,integer) from public, anon;
grant execute on function public.mb_draft_pick_public(uuid,integer) to authenticated; -- nötig für die Policy, verrät nur ja/nein

alter policy mb_draft_select_room on public.mb_draft_picks
  using (
    exists (select 1 from public.mb_members m where m.room_id = mb_draft_picks.room_id and m.user_id = (select auth.uid()))
    and (player_user_id = (select auth.uid()) or public.mb_draft_pick_public(room_id, round_number))
  );

-- Belegte Runden ohne Künstler: für Zugreihenfolge, Fortschritt und «verdeckt»-Felder
create or replace function public.mb_draft_board(p_room_id uuid)
returns table(round_number integer, player_slot integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.round_number, p.player_slot
  from public.mb_draft_picks p
  where p.room_id = p_room_id
    and exists (select 1 from public.mb_members m where m.room_id = p_room_id and m.user_id = auth.uid())
  order by p.created_at;
$$;
revoke all on function public.mb_draft_board(uuid) from public, anon;
grant execute on function public.mb_draft_board(uuid) to authenticated;

-- Keine Doppelten: Ist dieser Künstler im Raum schon vergeben? Nur für Spieler des Raums.
-- Verrät bewusst ja/nein für einen einzelnen Künstler (sonst würde der Gegner-Künstler gezogen und beim Einsetzen abgelehnt).
create or replace function public.mb_draft_artist_taken(p_room_id uuid, p_artist_id text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.mb_members m where m.room_id = p_room_id and m.user_id = auth.uid() and m.role = 'player') then
    raise exception 'player membership not found';
  end if;
  return exists (select 1 from public.mb_draft_picks p where p.room_id = p_room_id and p.spotify_artist_id = p_artist_id);
end;
$$;
revoke all on function public.mb_draft_artist_taken(uuid,text) from public, anon;
grant execute on function public.mb_draft_artist_taken(uuid,text) to authenticated;

-- Realtime: Verdeckte Picks erreichen den Gegner nicht (RLS). Der Raum meldet deshalb jeden neuen Pick über mb_rooms.
create or replace function public.mb_touch_room_on_hidden_pick()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.mb_rooms set updated_at = now() where id = new.room_id and draft_hidden;
  return new;
end;
$$;
revoke all on function public.mb_touch_room_on_hidden_pick() from public, anon, authenticated;
create or replace trigger mb_touch_room_on_hidden_pick after insert on public.mb_draft_picks
for each row execute function public.mb_touch_room_on_hidden_pick();

commit;
