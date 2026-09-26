-- All signed-in users may view issue reports.
-- Status changes remain protected by admin_set_issue_status(), which performs
-- its own active-admin check before updating any row.

drop policy if exists
  "Users can read their own reports and admins can read all"
on public.issue_reports;

drop policy if exists
  "Authenticated users can read all issue reports"
on public.issue_reports;

create policy "Authenticated users can read all issue reports"
on public.issue_reports
for select
to authenticated
using (true);

comment on policy "Authenticated users can read all issue reports"
on public.issue_reports is
  'Allows every Google-authenticated app user to view the shared issue list';
