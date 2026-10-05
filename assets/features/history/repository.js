import { client } from '../../core/client.js';
export function loadHistory(selectedDate,nextDate){return client
        .from('attendance_sessions')
        .select(
          'id, user_id, gym_role, checked_in_at, checked_out_at, ' +
          'checked_out_by, checkout_method, transferred_to'
        )
        .gte('checked_in_at', `${selectedDate}T00:00:00+08:00`)
        .lt('checked_in_at', `${nextDate}T00:00:00+08:00`)
        .order('checked_in_at', { ascending: false })
        .limit(200);}
