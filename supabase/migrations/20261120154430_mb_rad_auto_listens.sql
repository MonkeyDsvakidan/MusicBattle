-- Albumrad (Roadmap W.9): automatisch erkannte „gehört“-Einträge speichern, ohne Doppelte.
-- Pro Spotify-Konto, Album und Kalendertag (Zeitzone Europe/Zurich) höchstens ein „gehört“: hat das Album an diesem Tag
-- schon einen (getippt oder erkannt), wird nichts eingetragen. So zählt mehrfaches Öffnen nicht doppelt, und Tippen
-- und Erkennen am selben Tag zählen einmal (Entscheid des Nutzers 17.11.2026).
-- Nur die Service-Rolle (Edge Function mb-rad) ruft das auf.
create function public.mb_rad_add_auto_listens(p_user text, p_items jsonb)
returns setof public.mb_rad_events
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_album text;
  v_at timestamptz;
  v_row public.mb_rad_events;
begin
  if jsonb_typeof(p_items) <> 'array' then return; end if;
  -- gleichzeitige Abgleiche desselben Kontos (zwei Geräte) nacheinander, sonst könnten beide eintragen
  perform pg_advisory_xact_lock(hashtext('mb_rad_auto:' || p_user));
  for v_item in select value from jsonb_array_elements(p_items) limit 50 loop
    v_album := v_item ->> 'album_id';
    begin
      v_at := (v_item ->> 'at')::timestamptz;
    exception when others then
      continue;
    end;
    if v_album is null or v_album !~ '^[A-Za-z0-9]{1,64}$' or v_at is null
       or v_at > now() + interval '5 minutes' or v_at < now() - interval '30 days' then
      continue;
    end if;
    if exists (
      select 1 from public.mb_rad_events e
      where e.spotify_user = p_user and e.album_id = v_album and e.kind = 'listen'
        and (e.created_at at time zone 'Europe/Zurich')::date = (v_at at time zone 'Europe/Zurich')::date
    ) then
      continue;
    end if;
    insert into public.mb_rad_events (spotify_user, album_id, kind, source, created_at)
    values (p_user, v_album, 'listen', 'auto', v_at)
    returning * into v_row;
    return next v_row;
  end loop;
end;
$$;

revoke execute on function public.mb_rad_add_auto_listens(text, jsonb) from public, anon, authenticated;
grant execute on function public.mb_rad_add_auto_listens(text, jsonb) to service_role;
