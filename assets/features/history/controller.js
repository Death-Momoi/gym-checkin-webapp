import { loadHistory as queryHistory } from './repository.js';
import { createRecordDatePicker as appCreateRecordDatePicker } from '../../shared/ui/date-picker.js';
import { formatTime as appFormatTime } from '../../shared/time.js';
import { init as appInit } from '../auth/index.js';
import { loadAttendanceActiveDates as appLoadAttendanceActiveDates } from '../attendance/index.js';
import { loadProfiles as appLoadProfiles } from '../profiles/index.js';
import { nextDateString as appNextDateString } from '../../shared/time.js';
import { roleLabel as appRoleLabel } from '../../shared/profile-display.js';
import { taipeiDateString as appTaipeiDateString } from '../../shared/time.js';
export async function mount(){
const app = await appInit();
  if (!app) return;

  const dateInput = document.getElementById('history-date');
  const refreshButton = document.getElementById('history-refresh-button');
  const status = document.getElementById('history-status');
  const list = document.getElementById('history-list');
  let datePicker = null;

  function setStatus(text, type = '') {
    status.textContent = text;
    status.className = `section-status${type ? ` ${type}` : ''}`;
  }

  function setBusy(isBusy) {
    dateInput.disabled = isBusy;
    refreshButton.disabled = isBusy;
    refreshButton.textContent = isBusy ? '讀取中……' : '查詢紀錄';
  }

  function renderRecords(records) {
    list.replaceChildren();

    for (const record of records) {
      const row = document.createElement('li');
      const heading = document.createElement('div');
      const name = document.createElement('strong');
      const role = document.createElement('span');
      const time = document.createElement('div');
      const detail = document.createElement('div');

      row.className = 'history-row';
      heading.className = 'history-name-row';
      role.className = 'role-badge';
      time.className = 'history-time';
      detail.className = 'history-detail';

      name.textContent = record.user_name;
      role.textContent = appRoleLabel(record.gym_role);
      time.textContent = record.checked_out_at
        ? `${appFormatTime(record.checked_in_at)} 簽到 → ` +
          `${appFormatTime(record.checked_out_at)} 簽退`
        : `${appFormatTime(record.checked_in_at)} 簽到 → 尚未簽退`;

      const detailParts = [];
      if (!record.checked_out_at) {
        detailParts.push('目前仍在場');
      } else if (record.checkout_method === 'assisted') {
        detailParts.push(`由「${record.checkout_name}」協助簽退`);
      } else {
        detailParts.push('本人簽退');
      }

      if (record.transferred_to) {
        detailParts.push(`責任交接給「${record.transfer_name}」`);
      } else if (
        record.gym_role === 'primary' &&
        record.checked_out_at &&
        record.checkout_method === 'self'
      ) {
        detailParts.push('設備檢查完成');
      }

      detail.textContent = detailParts.join('｜');
      heading.append(name, role);
      row.append(heading, time, detail);
      list.appendChild(row);
    }
  }

  async function loadHistory() {
    const selectedDate = dateInput.value;
    const nextDate = appNextDateString(selectedDate);
    if (!nextDate) {
      setStatus('請先選擇有效日期。', 'error');
      return;
    }

    setBusy(true);
    setStatus('正在讀取簽到紀錄……');

    try {
      const { data: sessions, error } = await queryHistory(selectedDate,nextDate);

      if (error) throw error;

      const profileIds = (sessions || []).flatMap(session => [
        session.user_id,
        session.checked_out_by,
        session.transferred_to
      ]);
      const profileMap = await appLoadProfiles(profileIds);
      const records = (sessions || []).map(session => ({
        ...session,
        user_name: profileMap.get(session.user_id)?.display_name || '未知使用者',
        checkout_name:
          profileMap.get(session.checked_out_by)?.display_name || '未知使用者',
        transfer_name:
          profileMap.get(session.transferred_to)?.display_name || '未知使用者'
      }));

      renderRecords(records);
      setStatus(
        records.length > 0
          ? `已讀取 ${records.length} 筆簽到紀錄。`
          : '此日期沒有簽到紀錄。',
        records.length > 0 ? 'success' : ''
      );
    } catch (error) {
      list.replaceChildren();
      console.error('Attendance history loading failed', error);
      setStatus(`讀取失敗：${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function loadActiveDates({ start, end }) {
    return appLoadAttendanceActiveDates(start, end);
  }

  const initialDate = appTaipeiDateString();
  datePicker = appCreateRecordDatePicker({
    input: dateInput,
    initialDate,
    loadActiveDates,
    onChange: loadHistory
  });
  if (!datePicker) {
    dateInput.value = initialDate;
    dateInput.addEventListener('change', loadHistory);
  }
  refreshButton.addEventListener('click', loadHistory);
  await loadHistory();
}
