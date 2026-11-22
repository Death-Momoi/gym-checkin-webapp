import { init } from '../auth/index.js';
import { setMessage, hideMessage } from '../../shared/ui/messages.js';
import { loadEnvironment } from './repository.js';
import { REFRESH_INTERVAL_MS, metric, readingState, ageText } from './model.js';
export async function mount() {
  if (!await init()) return;
  const byId = id => document.getElementById(`environment-${id}`);
  const refresh = byId('refresh'), select = byId('device');
  let rows = [], busy = false, fetchFailed = false, stopped = false, abort = null;
  function render() {
    const row = rows.find(item => item.device_id === select.value) || rows[0];
    byId('content').classList.toggle('hidden', !row);
    byId('empty').classList.toggle('hidden', !!row || fetchFailed);
    if (!row) return;
    byId('device-name').textContent = row.display_name;
    byId('temperature').textContent = metric(row.temperature_c);
    byId('humidity').textContent = metric(row.humidity_pct);
    byId('light').textContent = row.light_status === 'ok' ? metric(row.illuminance_lux) : '—';
    byId('temperature-note').textContent = metric(row.temperature_c) === '—' ? '感測器未回傳有效溫度' : '室內空氣溫度';
    byId('humidity-note').textContent = metric(row.humidity_pct) === '—' ? '感測器未回傳有效濕度' : '室內相對濕度';
    byId('light-note').textContent = row.light_status === 'saturated' ? '光線超出目前感測範圍'
      : row.light_status !== 'ok' || metric(row.illuminance_lux) === '—' ? '感測器未回傳有效照度' : '感測器位置的照度';
    const received = Date.parse(row.received_at);
    byId('received').textContent = Number.isFinite(received) ? new Date(received).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '時間不明';
    byId('age').textContent = ageText(row.sampled_at);
    byId('rssi').textContent = typeof row.wifi_rssi === 'number' && Number.isFinite(row.wifi_rssi) ? `${row.wifi_rssi} dBm` : '—';
    const state = fetchFailed ? 'error' : readingState(row);
    const labels = { fresh: '持續更新中', partial: '部分感測異常', stale: '暫未更新', error: '讀取失敗' };
    byId('status').dataset.state = state; byId('status').textContent = labels[state];
    byId('freshness-note').textContent = state === 'stale'
      ? '超過 2 分 30 秒沒有新的數據；目前顯示上次結果，請確認裝置電源與網路。'
      : state === 'error' ? '目前無法確認最新數據；以上保留上次讀取結果，連線恢復後會自動重試。'
      : state === 'partial' ? '裝置仍有回傳數據；異常項目顯示「—」，其餘項目可正常查看。'
      : '顯示最近一次收到的感測結果。時間以台灣時間顯示。';
  }
  async function reload() {
    if (busy || stopped) return;
    busy = true; refresh.disabled = true; abort = new AbortController();
    const timeout = setTimeout(() => abort?.abort(), 12_000);
    try {
      const next = await loadEnvironment(abort.signal);
      if (stopped) return;
      const selected = select.value;
      rows = next; fetchFailed = false;
      select.replaceChildren(...rows.map(row => {
        const option = document.createElement('option'); option.value = row.device_id; option.textContent = row.display_name; return option;
      }));
      if (rows.some(row => row.device_id === selected)) select.value = selected;
      byId('device-control').classList.toggle('hidden', rows.length < 2);
      hideMessage(); render();
    } catch (error) {
      if (stopped) return;
      console.error('Environment loading failed', error); fetchFailed = true;
      setMessage('環境數據讀取失敗，請確認網路或稍後重新整理。', 'error'); render();
    } finally { clearTimeout(timeout); abort = null; busy = false; refresh.disabled = false; }
  }
  refresh.addEventListener('click', reload); select.addEventListener('change', render);
  const poll = setInterval(() => { if (!document.hidden) reload(); }, REFRESH_INTERVAL_MS);
  const clock = setInterval(() => { if (!document.hidden) render(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });
  window.addEventListener('pagehide', () => { stopped = true; clearInterval(poll); clearInterval(clock); abort?.abort(); });
  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
  await reload();
}
