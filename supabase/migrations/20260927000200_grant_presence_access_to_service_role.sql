grant usage
on schema public
to service_role;

grant select, update
on table public.presence_devices
to service_role;

grant select, insert, delete
on table public.presence_qr_tokens
to service_role;
