(async function () {
  'use strict';

  const app = await GymApp.init();
  if (!app) return;

  const dateInput = document.getElementById('calendar-date');
  const refreshButton = document.getElementById('calendar-refresh-button');
  const status = document.getElementById('calendar-status');
  const list = document.getElementById('calendar-list');

  function setStatus(text, type = '') {
    status.textContent = text;
    status.className = `section-status${type ? ` ${type}` : ''}`;
  }

  function setBusy(isBusy) {
    dateInput.disabled = isBusy;
    refreshButton.disabled = isBusy;
    refreshButton.textContent = isBusy ? '讀取中……' : '查看預約';
  }

  function renderEvents(events) {
    list.replaceChildren();

    for (const calendarEvent of events) {
      const row = document.createElement('li');
      const time = document.createElement('div');
      const details = document.createElement('div');
      const title = document.createElement('strong');

      row.className = 'calendar-event';
      time.className = 'calendar-event-time';
      details.className = 'calendar-event-title';
      time.textContent = calendarEvent.all_day
        ? '全天'
        : `${calendarEvent.start_label}–${calendarEvent.end_label}`;
      title.textContent = calendarEvent.title || '未命名預約';
      details.appendChild(title);

      if (calendarEvent.all_day) {
        const badge = document.createElement('span');
        badge.textContent = '全天活動';
        details.appendChild(document.createElement('br'));
        details.appendChild(badge);
      }

      row.append(time, details);
      list.appendChild(row);
    }
  }

  async function loadEvents() {
    const selectedDate = dateInput.value;
    if (!GymApp.nextDateString(selectedDate)) {
      setStatus('請先選擇有效日期。', 'error');
      return;
    }

    setBusy(true);
    setStatus('正在讀取 Google Calendar……');

    try {
      const { data, error } = await app.client.functions.invoke(
        'get-calendar-events',
        { body: { date: selectedDate } }
      );

      if (error) throw error;
      if (!data?.ok || !Array.isArray(data.events)) {
        throw new Error(data?.error || 'Calendar Function 回傳格式不正確');
      }

      renderEvents(data.events);
      setStatus(
        data.events.length > 0
          ? `已讀取 ${data.events.length} 筆預約。`
          : '此日期沒有預約。',
        data.events.length > 0 ? 'success' : ''
      );
    } catch (error) {
      list.replaceChildren();
      console.error('Calendar loading failed', error);
      const message = await GymApp.functionErrorMessage(
        error,
        '暫時無法讀取 Google Calendar'
      );
      setStatus(`讀取失敗：${message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  dateInput.value = GymApp.taipeiDateString();
  refreshButton.addEventListener('click', loadEvents);
  dateInput.addEventListener('change', loadEvents);
  await loadEvents();
})();
