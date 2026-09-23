create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
    check (char_length(display_name) between 1 and 80),
  avatar_url text,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  app_role text not null default 'member'
    check (app_role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Application profiles linked one-to-one with Supabase Auth users';

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.profiles to authenticated;

create policy "Authenticated users can read active profiles"
on public.profiles
for select
to authenticated
using (
  status = 'active'
  or id = (select auth.uid())
);

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_profile_updated_at() from public;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_profile_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inferred_name text;
  inferred_avatar text;
begin
  inferred_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '未命名使用者'
    ),
    80
  );

  inferred_avatar := coalesce(
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'picture', '')
  );

  insert into public.profiles (
    id,
    display_name,
    avatar_url
  )
  values (
    new.id,
    inferred_name,
    inferred_avatar
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;

create trigger create_profile_after_auth_signup
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

insert into public.profiles (
  id,
  display_name,
  avatar_url
)
select
  auth_user.id,
  left(
    coalesce(
      nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(auth_user.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(auth_user.email, ''), '@', 1), ''),
      '未命名使用者'
    ),
    80
  ),
  coalesce(
    nullif(auth_user.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(auth_user.raw_user_meta_data ->> 'picture', '')
  )
from auth.users as auth_user
on conflict (id) do nothing;

create or replace function public.update_my_display_name(
  new_display_name text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_name text;
  updated_profile public.profiles;
begin
  cleaned_name := regexp_replace(
    btrim(coalesce(new_display_name, '')),
    '\s+',
    ' ',
    'g'
  );

  if char_length(cleaned_name) < 2
     or char_length(cleaned_name) > 80 then
    raise exception '姓名必須為 2 至 80 個字元';
  end if;

  update public.profiles
  set display_name = cleaned_name
  where id = (select auth.uid())
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception '找不到目前登入者的個人資料';
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.update_my_display_name(text) from public;
grant execute
on function public.update_my_display_name(text)
to authenticated;
