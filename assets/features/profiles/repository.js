import { client } from '../../core/client.js';
export async function fetchProfile(session) {
    if (!session) return null;

    const { data, error } = await client
      .from('profiles')
      .select('id, display_name, avatar_url, status, app_role, name_confirmed')
      .eq('id', session.user.id)
      .single();

    if (error) throw error;
    return data;
  }

export async function loadProfiles(profileIds) {
    const ids = [...new Set((profileIds || []).filter(Boolean))];
    if (ids.length === 0) return new Map();

    const { data, error } = await client
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', ids);

    if (error) throw error;
    return new Map((data || []).map(profile => [profile.id, profile]));
  }

export const confirmName=name=>client.rpc('update_my_display_name',{new_display_name:name});