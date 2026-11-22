import { client } from '../../core/client.js';
export async function loadEnvironment(signal) {
  const { data, error } = await client.from('environment_latest')
    .select('device_id,device_code,display_name,temperature_c,humidity_pct,illuminance_lux,light_status,wifi_rssi,sampled_at,received_at')
    .order('display_name').abortSignal(signal);
  if (error) throw error;
  return data || [];
}
