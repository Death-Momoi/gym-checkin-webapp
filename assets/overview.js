(async function () {
  'use strict';

  const app = await GymApp.init();
  if (!app) return;

  const OVERTIME_MINUTES = 120;
  const dateInput = document.getElementById('overview-date');
  const previousButton = document.getElementById('overview-previous-button');
  const nextButton = document.getElementById('overview-next-button');
  const refreshButton = document.getElementById('overview-refresh-button');
  const status = document.getElementById('overview-status');
  const emptyState = document.getElementById('overview-empty');
  const timeAxis = document.getElementById('overview-time-axis');
  const usageRows = document.getElementById('overview-usage-rows');
  const reservationRows = document.getElementById('overview-reservation-rows');
  const dialog = document.getElementById('overview-detail-dialog');
  const dialogTitle = document.getElementById('overview-dialog-title');
  const dialogBody = document.getElementById('overview-dialog-body');
  const dialogCloseIcon = document.getElementById('overview-dialog-close-icon');
  const dialogCloseButton = document.getElementById('overview-dialog-close-button');

  let requestSequence = 0;
  let datePicker = null;

  const STATUS_META = Object.freeze({
    completed: { label: '已簽退', className: 'status-completed' },
    ongoing: { label: '目前使用中', className: 'status-ongoing' },
    overtime: { label: '超時或續借，請確認', className: 'status-overtime' },
    forgotten: { label: '忘記簽退／跨日強制結算', className: 'status-forgotten' },
    reservation: { label: 'Google Calendar 預約', className: 'status-reservation' }
  });

  function setStatus(text, type = '') {
    status.textContent = text;
    status.className = `section-status${type ? ` ${type}` : ''}`;
  }

  function setBusy(isBusy) {
    dateInput.disabled = isBusy;
    previousButton.disabled = isBusy;
    nextButton.disabled = isBusy;
    refreshButton.disabled = isBusy;
    refreshButton.textContent = isBusy ? '讀取中……' : '重新讀取';
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function minutesToLabel(value) {
    const minutes = clamp(Math.round(value), 0, 1440);
    if (minutes === 1440) return '24:00';
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  function durationLabel(minutes) {
    const safeMinutes = Math.max(0, Math.round(minutes));
    const hours = Math.floor(safeMinutes / 60);
    const remainingMinutes = safeMinutes % 60;
    return hours > 0
      ? `${hours} 小時 ${remainingMinutes} 分鐘`
      : `${remainingMinutes} 分鐘`;
  }

  function previousDateString(dateString) {
    if (!GymApp.nextDateString(dateString)) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day - 1))
      .toISOString()
      .slice(0, 10);
  }

  function dateBounds(dateString) {
    const nextDate = GymApp.nextDateString(dateString);
    if (!nextDate) return null;
    const start = `${dateString}T00:00:00+08:00`;
    const end = `${nextDate}T00:00:00+08:00`;
    return {
      start,
      end,
      startMs: Date.parse(start),
      endMs: Date.parse(end)
    };
  }

  function addDetail(term, description) {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    const value = document.createElement('dd');
    label.textContent = term;
    value.textContent = description || '—';
    row.append(label, value);
    return row;
  }

  function openDetails(title, meta, details) {
    dialogTitle.textContent = title;
    dialogBody.replaceChildren();

    const badge = document.createElement('div');
    badge.className = `timeline-dialog-status ${meta.className}`;
    badge.textContent = meta.label;

    const list = document.createElement('dl');
    list.className = 'timeline-detail-list';
    details.forEach(detail => list.appendChild(addDetail(detail[0], detail[1])));
    dialogBody.append(badge, list);

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDetails() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function usageStatus(record) {
    if (record.isForcedCheckout) return 'forgotten';
    if (record.duration > OVERTIME_MINUTES) return 'overtime';
    if (record.isOngoing) return 'ongoing';
    return 'completed';
  }

  function normalizeUsageRecord(session, profileMap, selectedDate, bounds) {
    const startMs = Date.parse(session.checked_in_at);
    const start = clamp((startMs - bounds.startMs) / 60000, 0, 1440);
    const selectedIsToday = selectedDate === GymApp.taipeiDateString();
    const checkedOutMs = session.checked_out_at
      ? Date.parse(session.checked_out_at)
      : null;
    let end;
    let endLabel;
    let isOngoing = false;
    let isForcedCheckout = false;

    if (Number.isFinite(checkedOutMs)) {
      if (checkedOutMs >= bounds.endMs) {
        end = 1440;
        endLabel = '24:00（跨日結算）';
        isForcedCheckout = true;
      } else {
        end = clamp((checkedOutMs - bounds.startMs) / 60000, start, 1440);
        endLabel = GymApp.formatTime(session.checked_out_at);
      }
    } else if (selectedIsToday) {
      end = clamp((Date.now() - bounds.startMs) / 60000, start, 1440);
      endLabel = `${minutesToLabel(end)}（尚未簽退）`;
      isOngoing = true;
    } else {
      end = 1440;
      endLabel = '24:00（強制結算）';
      isForcedCheckout = true;
    }

    const record = {
      kind: 'usage',
      id: session.id,
      userId: session.user_id,
      name: profileMap.get(session.user_id)?.display_name || '未知使用者',
      role: GymApp.roleLabel(session.gym_role),
      start,
      end,
      startLabel: GymApp.formatTime(session.checked_in_at),
      endLabel,
      duration: Math.max(0, end - start),
      isOngoing,
      isForcedCheckout,
      checkoutMethod: session.checkout_method,
      checkoutName:
        profileMap.get(session.checked_out_by)?.display_name || '未知使用者',
      transferName:
        profileMap.get(session.transferred_to)?.display_name || '',
      trashChecked: session.trash_checked,
      acLightsChecked: session.ac_lights_checked,
      dehumidifierChecked: session.dehumidifier_checked,
      note: session.note || ''
    };
    record.status = usageStatus(record);
    return record;
  }

  function normalizeReservation(calendarEvent) {
    return {
      kind: 'reservation',
      id: calendarEvent.id || '',
      name: calendarEvent.title || '未命名預約',
      start: clamp(Number(calendarEvent.start_minute) || 0, 0, 1440),
      end: clamp(Number(calendarEvent.end_minute) || 0, 0, 1440),
      startLabel: calendarEvent.start_label || '—',
      endLabel: calendarEvent.end_label || '—',
      allDay: Boolean(calendarEvent.all_day),
      status: 'reservation'
    };
  }

  function assignLanes(records) {
    const laneEnds = [];
    return records
      .slice()
      .sort((left, right) => left.start - right.start || left.end - right.end)
      .map(record => {
        let lane = laneEnds.findIndex(end => record.start >= end);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = record.end;
        return { ...record, lane, laneCount: 0 };
      })
      .map(record => ({ ...record, laneCount: Math.max(1, laneEnds.length) }));
  }

  function appendNowMarker(track, selectedDate) {
    if (selectedDate !== GymApp.taipeiDateString()) return;
    const bounds = dateBounds(selectedDate);
    const nowMinute = clamp((Date.now() - bounds.startMs) / 60000, 0, 1440);
    const marker = document.createElement('span');
    marker.className = 'timeline-now-marker';
    marker.style.left = `${(nowMinute / 1440) * 100}%`;
    marker.setAttribute('aria-hidden', 'true');
    track.appendChild(marker);
  }

  function showUsageDetails(record) {
    const meta = STATUS_META[record.status];
    const details = [
      ['使用身分', record.role],
      ['簽到時間', record.startLabel],
      ['簽退時間', record.endLabel],
      ['使用時長', durationLabel(record.duration)]
    ];

    if (record.checkoutMethod === 'assisted') {
      details.push(['簽退方式', `由「${record.checkoutName}」協助簽退`]);
    } else if (record.checkoutMethod === 'self') {
      details.push(['簽退方式', '本人簽退']);
    } else {
      details.push(['簽退方式', '尚未簽退']);
    }

    if (record.transferName) {
      details.push(['責任交接', `已交接給「${record.transferName}」`]);
    }

    if (
      record.trashChecked !== null ||
      record.acLightsChecked !== null ||
      record.dehumidifierChecked !== null
    ) {
      details.push([
        '設備檢查',
        `垃圾 ${record.trashChecked ? '✓' : '—'}｜` +
        `冷氣與電燈 ${record.acLightsChecked ? '✓' : '—'}｜` +
        `除濕機 ${record.dehumidifierChecked ? '✓' : '—'}`
      ]);
    }

    if (record.note) details.push(['備註', record.note]);
    openDetails(`使用者：${record.name}`, meta, details);
  }

  function showReservationDetails(record) {
    openDetails(`預約：${record.name}`, STATUS_META.reservation, [
      ['開始時間', record.allDay ? '當日 00:00' : record.startLabel],
      ['結束時間', record.allDay ? '當日 24:00' : record.endLabel],
      ['預約類型', record.allDay ? '全天活動' : '時段預約']
    ]);
  }

  function createBar(record, selectedDate) {
    const button = document.createElement('button');
    const meta = STATUS_META[record.status];
    const leftPercent = (record.start / 1440) * 100;
    const widthPercent = Math.max(0, ((record.end - record.start) / 1440) * 100);
    button.type = 'button';
    button.className = `timeline-bar ${meta.className}`;
    button.style.left = `${leftPercent}%`;
    button.style.width = `${widthPercent}%`;
    button.style.top = `${8 + record.lane * 34}px`;
    button.textContent = record.kind === 'reservation'
      ? record.name
      : `${record.startLabel}–${minutesToLabel(record.end)}`;
    button.title = `${record.name}｜${record.startLabel}–${record.endLabel}｜${meta.label}`;
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', () => {
      if (record.kind === 'reservation') showReservationDetails(record);
      else showUsageDetails(record);
    });
    return button;
  }

  function createTimelineRow(label, records, selectedDate, isReservation = false) {
    const row = document.createElement('div');
    const stickyLabel = document.createElement('div');
    const track = document.createElement('div');
    const recordsWithLanes = assignLanes(records);
    const laneCount = Math.max(1, ...recordsWithLanes.map(record => record.laneCount));

    row.className = `timeline-row${isReservation ? ' reservation-row' : ''}`;
    stickyLabel.className = 'timeline-sticky-label timeline-person-label';
    track.className = 'timeline-track';
    stickyLabel.textContent = label;
    stickyLabel.title = label;
    track.style.height = `${Math.max(50, 16 + laneCount * 34)}px`;
    appendNowMarker(track, selectedDate);
    recordsWithLanes.forEach(record => track.appendChild(createBar(record, selectedDate)));
    row.append(stickyLabel, track);
    return row;
  }

  function renderAxis(selectedDate) {
    timeAxis.replaceChildren();
    for (let minute = 0; minute <= 1440; minute += 120) {
      const label = document.createElement('span');
      label.textContent = minutesToLabel(minute);
      label.style.left = `${(minute / 1440) * 100}%`;
      if (minute === 0) label.classList.add('first');
      if (minute === 1440) label.classList.add('last');
      timeAxis.appendChild(label);
    }
    appendNowMarker(timeAxis, selectedDate);
  }

  function renderTimeline(usageRecords, reservations, selectedDate) {
    usageRows.replaceChildren();
    reservationRows.replaceChildren();
    renderAxis(selectedDate);

    const recordsByUser = new Map();
    usageRecords.forEach(record => {
      const key = record.userId || record.name;
      if (!recordsByUser.has(key)) {
        recordsByUser.set(key, { name: record.name, records: [] });
      }
      recordsByUser.get(key).records.push(record);
    });

    [...recordsByUser.values()]
      .sort((left, right) => {
        const leftStart = Math.min(...left.records.map(record => record.start));
        const rightStart = Math.min(...right.records.map(record => record.start));
        return leftStart - rightStart || left.name.localeCompare(right.name, 'zh-Hant');
      })
      .forEach(group => {
        usageRows.appendChild(
          createTimelineRow(group.name, group.records, selectedDate)
        );
      });

    if (usageRecords.length === 0) {
      const noUsage = document.createElement('p');
      noUsage.className = 'timeline-section-empty';
      noUsage.textContent = '當日沒有簽到紀錄。';
      usageRows.appendChild(noUsage);
    }

    if (reservations.length > 0) {
      reservationRows.appendChild(
        createTimelineRow('📍預約', reservations, selectedDate, true)
      );
    } else {
      const noReservations = document.createElement('p');
      noReservations.className = 'timeline-section-empty';
      noReservations.textContent = '當日沒有 Google Calendar 預約。';
      reservationRows.appendChild(noReservations);
    }

    emptyState.classList.toggle(
      'hidden',
      usageRecords.length > 0 || reservations.length > 0
    );
  }

  async function loadOverview() {
    const selectedDate = dateInput.value;
    const bounds = dateBounds(selectedDate);
    if (!bounds) {
      setStatus('請先選擇有效日期。', 'error');
      return;
    }

    const currentRequest = ++requestSequence;
    setBusy(true);
    GymApp.setMessage('正在同步簽到紀錄與 Google Calendar……');
    setStatus('讀取中……');

    try {
      const attendanceRequest = app.client
        .from('attendance_sessions')
        .select(
          'id, user_id, gym_role, checked_in_at, checked_out_at, ' +
          'checked_out_by, checkout_method, transferred_to, ' +
          'trash_checked, ac_lights_checked, dehumidifier_checked, note'
        )
        .gte('checked_in_at', bounds.start)
        .lt('checked_in_at', bounds.end)
        .order('checked_in_at', { ascending: true })
        .limit(500);

      const calendarRequest = GymApp.invokeUserFunction(
        'get-calendar-events',
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
      const profileMap = await GymApp.loadProfiles(profileIds);
      if (currentRequest !== requestSequence) return;

      const usageRecords = sessions.map(session =>
        normalizeUsageRecord(session, profileMap, selectedDate, bounds)
      );
      let reservations = [];
      let calendarWarning = '';

      if (calendarSettled.ok) {
        const { data, error } = calendarSettled.result;
        if (error) {
          calendarWarning = await GymApp.functionErrorMessage(
            error,
            '無法讀取 Google Calendar'
          );
        } else if (data?.ok && Array.isArray(data.events)) {
          reservations = data.events.map(normalizeReservation);
        } else {
          calendarWarning = data?.error || 'Calendar Function 回傳格式不正確';
        }
      } else {
        calendarWarning = await GymApp.functionErrorMessage(
          calendarSettled.error,
          '無法讀取 Google Calendar'
        );
      }

      renderTimeline(usageRecords, reservations, selectedDate);
      const summary = `簽到紀錄 ${usageRecords.length} 筆｜預約 ${reservations.length} 筆`;
      if (calendarWarning) {
        GymApp.setMessage(
          `已讀取簽到紀錄，但預約讀取失敗：${calendarWarning}`,
          'error'
        );
        setStatus(`${summary}｜預約資料暫時無法取得`, 'error');
      } else {
        GymApp.setMessage('借用狀態總覽已更新。', 'success');
        setStatus(summary, 'success');
      }
    } catch (error) {
      if (currentRequest !== requestSequence) return;
      usageRows.replaceChildren();
      reservationRows.replaceChildren();
      emptyState.classList.add('hidden');
      console.error('Overview loading failed', error);
      GymApp.setMessage(`圖表讀取失敗：${error.message}`, 'error');
      setStatus('讀取失敗，請稍後重試。', 'error');
    } finally {
      if (currentRequest === requestSequence) setBusy(false);
    }
  }

  async function loadOverviewActiveDates(range) {
    return GymApp.loadAttendanceActiveDates(range.start, range.end);
  }

  function changeDate(direction) {
    const changedDate = direction < 0
      ? previousDateString(dateInput.value)
      : GymApp.nextDateString(dateInput.value);
    if (!changedDate) return;
    if (datePicker) datePicker.setDate(changedDate, false);
    else dateInput.value = changedDate;
    loadOverview();
  }

  previousButton.addEventListener('click', () => changeDate(-1));
  nextButton.addEventListener('click', () => changeDate(1));
  refreshButton.addEventListener('click', loadOverview);
  dialogCloseIcon.addEventListener('click', closeDetails);
  dialogCloseButton.addEventListener('click', closeDetails);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) closeDetails();
  });

  const initialDate = GymApp.taipeiDateString();
  datePicker = GymApp.createRecordDatePicker({
    input: dateInput,
    initialDate,
    loadActiveDates: loadOverviewActiveDates,
    onChange: loadOverview
  });
  if (!datePicker) {
    dateInput.value = initialDate;
    dateInput.addEventListener('change', loadOverview);
  }
  await loadOverview();
})();
