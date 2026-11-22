-- Requires the existing profiles and presence_devices migrations.
-- Retain only the most recent sample for each device.
create table if not exists public.environment_latest (
  device_id uuid primary key references public.presence_devices(id) on delete cascade,
  device_code text not null,
  display_name text not null,
  temperature_c double precision check (temperature_c between -40 and 80),
  humidity_pct double precision check (humidity_pct between 0 and 100),
  illuminance_lux double precision check (illuminance_lux between 0 and 200000),
  light_status text not null check (light_status in ('ok','error','saturated')),
  full_spectrum integer check (full_spectrum between 0 and 65535),
  infrared integer check (infrared between 0 and 65535),
  wifi_rssi integer check (wifi_rssi between -127 and 0),
  uptime_s bigint not null check (uptime_s between 0 and 4294967295),
  sampled_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint environment_light_consistency check (
    (light_status='ok' and illuminance_lux is not null and full_spectrum is not null and infrared is not null)
    or (light_status='saturated' and illuminance_lux is null and full_spectrum is not null and infrared is not null)
    or (light_status='error' and illuminance_lux is null and full_spectrum is null and infrared is null)
  )
);
comment on table public.environment_latest is 'Latest room environment reading per ESP32. Missing sensors use NULL, not zero.';
alter table public.environment_latest enable row level security;
revoke all on table public.environment_latest from anon, authenticated;
grant select on table public.environment_latest to authenticated;
grant select, insert, update on table public.environment_latest to service_role;
drop policy if exists environment_read_active_users
on public.environment_latest;
create policy environment_read_active_users on public.environment_latest
for select to authenticated using (
  exists (select 1 from public.profiles where id=(select auth.uid()) and status='active')
);
