-- OPTIONAL: use only if the original device ID/secret is unavailable.
-- Updating an existing device secret also changes its QR credentials.
do $$
declare
  wanted_code text := 'CHANGE_ME_DEVICE_ID';
  wanted_secret text := 'CHANGE_ME_DEVICE_SECRET';
begin
  if wanted_code like 'CHANGE_ME%' or wanted_secret like 'CHANGE_ME%' then
    raise exception 'Fill wanted_code and wanted_secret before running';
  end if;
  if wanted_code !~ '^[a-z0-9][a-z0-9_-]{2,63}$' then
    raise exception 'Device ID: 3-64 lowercase letters/digits/underscore/hyphen';
  end if;
  if length(wanted_secret)<32 or wanted_secret<>btrim(wanted_secret) then
    raise exception 'Use a random secret of 32+ characters with no surrounding spaces';
  end if;
  insert into public.presence_devices (device_code,display_name,secret_hash,enabled)
  values (wanted_code,'運動科學實驗室',encode(extensions.digest(convert_to(wanted_secret,'UTF8'),'sha256'),'hex'),true)
  on conflict(device_code) do update set secret_hash=excluded.secret_hash,display_name=excluded.display_name,enabled=true;
end $$;
