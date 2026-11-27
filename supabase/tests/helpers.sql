-- Test-Helfer: Schema tst (nur lokal). q() liest einen Wert, x() führt eine Anweisung aus;
-- beide geben bei einem Fehler «ERR: <Meldung>» zurück, damit der Ablauf weiterläuft.
create schema tst;
grant usage on schema tst to authenticated;
create table tst.v(k text primary key, v text);
grant all on tst.v to authenticated;
create function tst.r(p text) returns uuid language sql stable as $$ select v::uuid from tst.v where k = p $$;
create function tst.q(p_sql text) returns text language plpgsql as $$
declare r text;
begin execute 'select (' || p_sql || ')::text' into r; return coalesce(r, 'null');
exception when others then return 'ERR: ' || sqlerrm; end $$;
create function tst.x(p_sql text) returns text language plpgsql as $$
declare n integer;
begin execute p_sql; get diagnostics n = row_count; return 'rows=' || n;
exception when others then return 'ERR: ' || sqlerrm; end $$;
grant execute on all functions in schema tst to authenticated;
insert into auth.users(id) select ('00000000-0000-0000-0000-00000000000' || i)::uuid from generate_series(1,9) i;
create function tst.votes(a int, b int default null, c int default null, d int default null, e int default null) returns jsonb language sql immutable as $$
  select jsonb_build_object('theme', a, 'vibe', coalesce(b, a), 'lyrics', coalesce(c, a), 'surprise', coalesce(d, a), 'connoisseur', coalesce(e, a)) $$;
create function tst.mem(p_room uuid, p_slot int default null) returns uuid language sql stable as $$
  select id from public.mb_members where room_id = p_room and user_id = auth.uid() and (p_slot is null or player_slot = p_slot) order by player_slot nulls last limit 1 $$;
create function tst.rid(p_room uuid, p_no int) returns uuid language sql stable as $$
  select id from public.mb_rounds where room_id = p_room and round_number = p_no $$;
grant execute on all functions in schema tst to authenticated;
-- Zugreihenfolge (für Clients gesperrt) – nur im Test über einen Admin-Helfer lesen
create function tst.turn(p_room uuid, p_status text) returns integer language sql stable security definer as $$ select public.mb_draft_turn_slot(p_room, p_status) $$;
grant execute on function tst.turn(uuid, text) to authenticated;
