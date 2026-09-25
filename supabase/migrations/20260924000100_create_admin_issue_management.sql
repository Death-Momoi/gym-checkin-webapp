create or replace function public.admin_set_issue_status(
  target_report_id uuid,
  target_status text
)
returns public.issue_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  cleaned_status text := lower(btrim(coalesce(target_status, '')));
  updated_report public.issue_reports;
begin
  if current_user_id is null then
    raise exception '請先登入 Google 帳號';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = current_user_id
      and app_role = 'admin'
      and status = 'active'
  ) then
    raise exception '僅限管理員更新問題狀態';
  end if;

  if cleaned_status not in ('open', 'resolved') then
    raise exception '不支援的問題狀態';
  end if;

  update public.issue_reports
  set
    status = cleaned_status,
    resolved_at = case
      when cleaned_status = 'resolved' then now()
      else null
    end,
    resolved_by = case
      when cleaned_status = 'resolved' then current_user_id
      else null
    end
  where id = target_report_id
  returning * into updated_report;

  if updated_report.id is null then
    raise exception '找不到指定的問題回報';
  end if;

  return updated_report;
end;
$$;

comment on function public.admin_set_issue_status(uuid, text) is
  'Allows active administrators to resolve or reopen an issue report';

revoke all
on function public.admin_set_issue_status(uuid, text)
from public;

grant execute
on function public.admin_set_issue_status(uuid, text)
to authenticated;
