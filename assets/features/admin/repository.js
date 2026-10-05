import { client } from '../../core/client.js';
export const AdminRepository={setStatus:args=>client.rpc('admin_set_issue_status',args)};

export function loadReports({isAdmin,status,selectedDate,nextDate}){
      const columns = isAdmin
        ? 'id, reporter_id, description, status, notification_status, ' +
          'notified_at, notification_error, created_at, resolved_at, resolved_by'
        : 'id, reporter_id, description, status, created_at, resolved_at, resolved_by';
      let query = client
        .from('issue_reports')
        .select(columns)
        .order('created_at', { ascending: false })
        .limit(200);

      if (status !== 'all') {
        query = query.eq('status', status);
      }
      if (selectedDate) {
        query = query
          .gte('created_at', `${selectedDate}T00:00:00+08:00`)
          .lt('created_at', `${nextDate}T00:00:00+08:00`);
      }


return query;
}