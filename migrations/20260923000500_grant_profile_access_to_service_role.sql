-- Edge Functions using the server-only secret key need profile names when
-- composing issue notification emails. This does not grant browser access.
grant select
on table public.profiles
to service_role;
