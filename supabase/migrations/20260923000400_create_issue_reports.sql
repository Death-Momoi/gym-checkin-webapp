create table public.issue_reports (
  id uuid primary key default gen_random_uuid(),

  reporter_id uuid not null
    references public.profiles(id) on delete restrict,

  description text not null
    check (char_length(description) between 5 and 1000),

  status text not null default 'open'
    check (status in ('open', 'resolved')),

  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'failed')),

  notified_at timestamptz,
  notification_error text
    check (
      notification_error is null
      or char_length(notification_error) <= 500
    ),

  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
    references public.profiles(id) on delete restrict,

  constraint issue_resolution_state_is_consistent
    check (
      (
        status = 'open'
        and resolved_at is null
        and resolved_by is null
      )
      or
      (
        status = 'resolved'
        and resolved_at is not null
        and resolved_by is not null
      )
    ),

  constraint issue_notification_state_is_consistent
    check (
      (
        notification_status = 'sent'
        and notified_at is not null
      )
      or
      (
        notification_status <> 'sent'
        and notified_at is null
      )
    )
);

comment on table public.issue_reports is
  'Problems reported by authenticated gym users';

create index issue_reports_created_at
on public.issue_reports (created_at desc);

create index issue_reports_open
on public.issue_reports (created_at desc)
where status = 'open';

alter table public.issue_reports enable row level security;

revoke all
on table public.issue_reports
from anon, authenticated;

grant select
on table public.issue_reports
to authenticated;

grant select, update
on table public.issue_reports
to service_role;

create policy "Users can read their own reports and admins can read all"
on public.issue_reports
for select
to authenticated
using (
  reporter_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and app_role = 'admin'
      and status = 'active'
  )
);

create or replace function public.report_issue(
  issue_text text
)
returns public.issue_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  cleaned_issue text;
  created_report public.issue_reports;
begin
  if current_user_id is null then
    raise exception '請先登入 Google 帳號';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = current_user_id
      and status = 'active'
  ) then
    raise exception '使用者不存在或已停用';
  end if;

  cleaned_issue := regexp_replace(
    btrim(coalesce(issue_text, '')),
    '\s+',
    ' ',
    'g'
  );

  if char_length(cleaned_issue) < 5 then
    raise exception '問題描述至少需要 5 個字元';
  end if;

  if char_length(cleaned_issue) > 1000 then
    raise exception '問題描述不可超過 1000 個字元';
  end if;

  insert into public.issue_reports (
    reporter_id,
    description
  )
  values (
    current_user_id,
    cleaned_issue
  )
  returning * into created_report;

  return created_report;
end;
$$;

revoke all
on function public.report_issue(text)
from public;

grant execute
on function public.report_issue(text)
to authenticated;
