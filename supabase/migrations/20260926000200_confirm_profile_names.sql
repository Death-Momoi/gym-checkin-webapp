-- Require each Google-authenticated account to confirm a recognizable name
-- once. Existing profiles intentionally start as unconfirmed and will be
-- prompted on their next visit.

alter table public.profiles
add column if not exists name_confirmed boolean not null default false;

comment on column public.profiles.name_confirmed is
  'True after the account owner confirms a display name in the app';

create or replace function public.update_my_display_name(
  new_display_name text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  cleaned_name text;
  updated_profile public.profiles;
begin
  if current_user_id is null then
    raise exception '請先登入 Google 帳號';
  end if;

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
  set
    display_name = cleaned_name,
    name_confirmed = true
  where id = current_user_id
    and name_confirmed = false
  returning * into updated_profile;

  if updated_profile.id is null then
    if exists (
      select 1
      from public.profiles
      where id = current_user_id
        and name_confirmed = true
    ) then
      raise exception '姓名已完成綁定，如需更正請聯絡管理員';
    end if;

    raise exception '找不到目前登入者的個人資料';
  end if;

  return updated_profile;
end;
$$;

revoke all
on function public.update_my_display_name(text)
from public;

grant execute
on function public.update_my_display_name(text)
to authenticated;
