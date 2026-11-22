export const REFRESH_INTERVAL_MS = 60_000;
export const STALE_AFTER_MS = 150_000;
export function metric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';
}
export function readingState(row, now = Date.now()) {
  const received = Date.parse(row?.received_at), sampled = Date.parse(row?.sampled_at);
  if (!Number.isFinite(received) || !Number.isFinite(sampled) || received > now + 30_000 || sampled > now + 30_000) return 'stale';
  if (now - Math.min(received, sampled) > STALE_AFTER_MS) return 'stale';
  if (metric(row.temperature_c) === '—' || metric(row.humidity_pct) === '—' || row.light_status !== 'ok' || metric(row.illuminance_lux) === '—') return 'partial';
  return 'fresh';
}
export function ageText(value, now = Date.now()) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now + 30_000) return '時間不明';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小時 ${Math.floor(seconds % 3600 / 60)} 分`;
  return `${Math.floor(seconds / 86400)} 天`;
}
