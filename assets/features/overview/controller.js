import { createOverviewView } from './view.js';
import { previousDateString, dateBounds, normalizeUsageRecord, normalizeReservation } from './model.js';
import { loadCalendarEvents } from '../calendar/index.js';
import { loadOverviewAttendance } from './repository.js';
import { createRecordDatePicker as appCreateRecordDatePicker } from '../../shared/ui/date-picker.js';

import { functionErrorMessage as appFunctionErrorMessage } from '../../services/user-functions.js';
import { init as appInit } from '../auth/index.js';
import { loadAttendanceActiveDates as appLoadAttendanceActiveDates } from '../attendance/index.js';
import { loadProfiles as appLoadProfiles } from '../profiles/index.js';
import { nextDateString as appNextDateString } from '../../shared/time.js';

import { setMessage as appSetMessage } from '../../shared/ui/messages.js';
import { taipeiDateString as appTaipeiDateString } from '../../shared/time.js';
export async function mount(){
const app = await appInit();
  if (!app) return;


  const dateInput = document.getElementById('overview-date');
  const previousButton = document.getElementById('overview-previous-button');
  const nextButton = document.getElementById('overview-next-button');
  const calendarButton = document.getElementById('overview-calendar-button');
  const emptyState = document.getElementById('overview-empty');
  const timeAxis = document.getElementById('overview-time-axis');
  const usageRows = document.getElementById('overview-usage-rows');
  const reservationRows = document.getElementById('overview-reservation-rows');
  const dialog = document.getElementById('overview-detail-dialog');
  const dialogTitle = document.getElementById('overview-dialog-title');
  const dialogBody = document.getElementById('overview-dialog-body');
  const dialogCloseIcon = document.getElementById('overview-dialog-close-icon');
  const dialogCloseButton = document.getElementById('overview-dialog-close-button');

  const {renderTimeline,closeDetails}=createOverviewView({emptyState,timeAxis,usageRows,reservationRows,dialog,dialogTitle,dialogBody});
  let requestSequence = 0;
  let datePicker = null;

  function setBusy(isBusy) {
    dateInput.disabled = isBusy;
    previousButton.disabled = isBusy;
    nextButton.disabled = isBusy;
    calendarButton.disabled = isBusy;
  }







































  async function loadOverview() {
    const selectedDate = dateInput.value;
    const bounds = dateBounds(selectedDate);
    if (!bounds) {
      appSetMessage('請選擇有效日期。', 'error');
      return;
    }

    const currentRequest = ++requestSequence;
    setBusy(true);
    appSetMessage('正在更新……');

    try {
      const attendanceRequest = loadOverviewAttendance(bounds);

      const calendarRequest = loadCalendarEvents(
        { date: selectedDate }
      );

      const [attendanceResult, calendarSettled] = await Promise.all([
        attendanceRequest,
        calendarRequest
          .then(result => ({ ok: true, result }))
          .catch(error => ({ ok: false, error }))
      ]);

      if (currentRequest !== requestSequence) return;
      if (attendanceResult.error) throw attendanceResult.error;

      const sessions = attendanceResult.data || [];
      const profileIds = sessions.flatMap(session => [
        session.user_id,
        session.checked_out_by,
        session.transferred_to
      ]);
      const profileMap = await appLoadProfiles(profileIds);
      if (currentRequest !== requestSequence) return;

      const usageRecords = sessions.map(session =>
        normalizeUsageRecord(session, profileMap, selectedDate, bounds)
      );
      let reservations = [];
      let calendarWarning = '';

      if (calendarSettled.ok) {
        const { data, error } = calendarSettled.result;
        if (error) {
          calendarWarning = await appFunctionErrorMessage(
            error,
            '無法讀取 Google Calendar'
          );
        } else if (data?.ok && Array.isArray(data.events)) {
          reservations = data.events.map(normalizeReservation);
        } else {
          calendarWarning = data?.error || 'Calendar Function 回傳格式不正確';
        }
      } else {
        calendarWarning = await appFunctionErrorMessage(
          calendarSettled.error,
          '無法讀取 Google Calendar'
        );
      }

      renderTimeline(usageRecords, reservations, selectedDate);
      if (calendarWarning) {
        appSetMessage(
          `已讀取簽到紀錄，但預約讀取失敗：${calendarWarning}`,
          'error'
        );
      } else {
        appSetMessage('資料已更新。', 'success');
      }
    } catch (error) {
      if (currentRequest !== requestSequence) return;
      usageRows.replaceChildren();
      reservationRows.replaceChildren();
      emptyState.classList.add('hidden');
      console.error('Overview loading failed', error);
      appSetMessage(`圖表讀取失敗：${error.message}`, 'error');
    } finally {
      if (currentRequest === requestSequence) setBusy(false);
    }
  }

  async function loadOverviewActiveDates(range) {
    return appLoadAttendanceActiveDates(range.start, range.end);
  }

  function changeDate(direction) {
    const changedDate = direction < 0
      ? previousDateString(dateInput.value)
      : appNextDateString(dateInput.value);
    if (!changedDate) return;
    if (datePicker) datePicker.setDate(changedDate, false);
    else dateInput.value = changedDate;
    loadOverview();
  }

  function openDatePicker() {
    if (datePicker && typeof datePicker.open === 'function') {
      datePicker.open();
      return;
    }

    if (typeof dateInput.showPicker === 'function') {
      try {
        dateInput.showPicker();
        return;
      } catch {
        // 較舊的瀏覽器改用原生 click 嘗試開啟日期選擇器。
      }
    }
    dateInput.click();
  }

  previousButton.addEventListener('click', () => changeDate(-1));
  nextButton.addEventListener('click', () => changeDate(1));
  calendarButton.addEventListener('click', openDatePicker);
  dialogCloseIcon.addEventListener('click', closeDetails);
  dialogCloseButton.addEventListener('click', closeDetails);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) closeDetails();
  });

  const initialDate = appTaipeiDateString();
  datePicker = appCreateRecordDatePicker({
    input: dateInput,
    initialDate,
    loadActiveDates: loadOverviewActiveDates,
    onChange: loadOverview,
    clickOpens: false
  });
  if (!datePicker) {
    dateInput.value = initialDate;
    dateInput.addEventListener('change', loadOverview);
  }
  await loadOverview();
}
