create extension if not exists pgcrypto with schema extensions;

create table public.presence_devices (
  id uuid primary key default gen_random_uuid(),
  device_code text not null unique
    check (device_code ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  display_name text not null
    check (char_length(display_name) between 1 and 80),
  secret_hash text not null
    check (secret_hash ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.presence_devices is
  'Trusted on-site devices that may request short-lived check-in QR tokens';

create trigger presence_devices_set_updated_at
before update on public.presence_devices
for each row
execute function public.set_profile_updated_at();

alter table public.presence_devices enable row level security;
revoke all on table public.presence_devices from anon, authenticated;


create table public.presence_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  device_id uuid not null
    references public.presence_devices(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint presence_qr_token_valid_lifetime
    check (
      expires_at > issued_at
      and expires_at <= issued_at + interval '2 minutes'
    )
);

comment on table public.presence_qr_tokens is
  'Hashed, reusable-within-lifetime tokens issued by an on-site QR device';

create index presence_qr_tokens_expiry
on public.presence_qr_tokens (expires_at);

alter table public.presence_qr_tokens enable row level security;
revoke all on table public.presence_qr_tokens from anon, authenticated;


create or replace function public.presence_token_status(
  presence_token text
)
returns table (
  is_valid boolean,
  expires_at timestamptz,
  message text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  token_record record;
begin
  if presence_token is null
     or char_length(presence_token) < 16
     or char_length(presence_token) > 200 then
    return query
    select false, null::timestamptz, 'QR Code 內沒有有效的現場認證碼';
    return;
  end if;

  select
    token.expires_at,
    device.enabled
  into token_record
  from public.presence_qr_tokens as token
  join public.presence_devices as device
    on device.id = token.device_id
  where token.token_hash = encode(
    extensions.digest(convert_to(presence_token, 'UTF8'), 'sha256'),
    'hex'
  )
  limit 1;

  if not found then
    return query
    select false, null::timestamptz, '找不到這組現場認證碼';
    return;
  end if;

  if not token_record.enabled then
    return query
    select false, token_record.expires_at, '現場 QR 裝置目前已停用';
    return;
  end if;

  if token_record.expires_at <= clock_timestamp() then
    return query
    select false, token_record.expires_at,
      '這個 QR Code 已過期，請在現場重新感應並掃描';
    return;
  end if;

  return query
  select true, token_record.expires_at,
    '現場認證有效，可以進行簽到';
end;
$$;


create or replace function public.gym_check_in_with_presence(
  presence_token text,
  requested_role text default 'member'
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_role text :=
    lower(btrim(coalesce(requested_role, 'member')));
  result public.attendance_sessions;
begin
  if current_user_id is null then
    raise exception '請先登入 Google 帳號';
  end if;

  if normalized_role not in ('primary', 'member') then
    raise exception '無效的簽到身分';
  end if;

  if presence_token is null
     or char_length(presence_token) < 16
     or char_length(presence_token) > 200
     or not exists (
       select 1
       from public.presence_qr_tokens as token
       join public.presence_devices as device
         on device.id = token.device_id
       where token.token_hash = encode(
         extensions.digest(convert_to(presence_token, 'UTF8'), 'sha256'),
         'hex'
       )
         and token.issued_at <= clock_timestamp() + interval '10 seconds'
         and token.expires_at > clock_timestamp()
         and device.enabled
     ) then
    raise exception '現場 QR Code 無效或已過期，請重新掃描';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = current_user_id
      and status = 'active'
  ) then
    raise exception '使用者不存在或已停用';
  end if;

  insert into public.attendance_sessions (
    user_id,
    gym_role
  )
  values (
    current_user_id,
    normalized_role
  )
  on conflict (user_id)
    where checked_out_at is null
  do nothing
  returning * into result;

  if result.id is null then
    select *
    into result
    from public.attendance_sessions
    where user_id = current_user_id
      and checked_out_at is null
    limit 1;
  end if;

  return result;
end;
$$;


-- Prevent clients from bypassing the on-site proof through the old RPC.
revoke all
on function public.gym_check_in(text)
from public, anon, authenticated;

revoke all
on function public.presence_token_status(text)
from public;

revoke all
on function public.gym_check_in_with_presence(text, text)
from public;

grant execute
on function public.presence_token_status(text)
to anon, authenticated;

grant execute
on function public.gym_check_in_with_presence(text, text)
to authenticated;
