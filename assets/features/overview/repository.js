import { client } from '../../core/client.js';
export function loadOverviewAttendance(bounds){return client
        .from('attendance_sessions')
        .select(
          'id, user_id, gym_role, checked_in_at, checked_out_at, ' +
          'checked_out_by, checkout_method, transferred_to, ' +
          'trash_checked, ac_lights_checked, dehumidifier_checked, note'
        )
        .gte('checked_in_at', bounds.start)
        .lt('checked_in_at', bounds.end)
        .order('checked_in_at', { ascending: true })
        .limit(500);}
