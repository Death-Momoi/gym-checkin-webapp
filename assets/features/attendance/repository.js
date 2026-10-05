import { client } from '../../core/client.js';
import { taipeiDateString } from '../../shared/time.js';
import { loadProfiles } from '../profiles/index.js';
export async function loadAttendanceActiveDates(startDate, endDate) {
    const { data, error } = await client
      .from('attendance_sessions')
      .select('checked_in_at')
      .gte('checked_in_at', `${startDate}T00:00:00+08:00`)
      .lt('checked_in_at', `${endDate}T00:00:00+08:00`)
      .order('checked_in_at', { ascending: true })
      .limit(5000);

    if (error) throw error;
    return [...new Set(
      (data || []).map(record => taipeiDateString(new Date(record.checked_in_at)))
    )];
  }

export async function loadOpenPeople() {
    const { data: sessions, error } = await client
      .from('attendance_sessions')
      .select('id, user_id, gym_role, checked_in_at')
      .is('checked_out_at', null)
      .order('checked_in_at', { ascending: true });

    if (error) throw error;

    const profileMap = await loadProfiles((sessions || []).map(item => item.user_id));
    return (sessions || []).map(session => ({
      ...session,
      profile: profileMap.get(session.user_id) || {
        display_name: '未知使用者',
        avatar_url: null
      }
    }));
  }

export const AttendanceRepository={presenceStatus:args=>client.rpc('presence_token_status',args),checkIn:args=>client.rpc('gym_check_in_with_presence',args),checkOut:args=>client.rpc('gym_check_out',args)};