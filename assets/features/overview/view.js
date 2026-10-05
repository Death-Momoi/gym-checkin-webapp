import { taipeiDateString as appTaipeiDateString } from '../../shared/time.js';
import { clamp, durationLabel, dateBounds, assignLanes, STATUS_META } from './model.js';
export function createOverviewView({emptyState,timeAxis,usageRows,reservationRows,dialog,dialogTitle,dialogBody}){
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

  function appendNowMarker(track, selectedDate) {
    if (selectedDate !== appTaipeiDateString()) return;
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

  function createBar(record) {
    const button = document.createElement('button');
    const meta = STATUS_META[record.status];
    const leftPercent = (record.start / 1440) * 100;
    const widthPercent = Math.max(0, ((record.end - record.start) / 1440) * 100);
    button.type = 'button';
    button.className = `timeline-bar ${meta.className}`;
    button.style.left = `${leftPercent}%`;
    button.style.width = `${widthPercent}%`;
    button.style.top = `${9 + record.lane * 31}px`;
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
    track.style.height = `${Math.max(48, 18 + laneCount * 31)}px`;
    appendNowMarker(track, selectedDate);
    recordsWithLanes.forEach(record => track.appendChild(createBar(record)));
    row.append(stickyLabel, track);
    return row;
  }

  function renderAxis(selectedDate) {
    timeAxis.replaceChildren();
    for (let minute = 0; minute <= 1440; minute += 60) {
      const label = document.createElement('span');
      const hour = minute / 60;
      label.textContent = String(hour).padStart(2, '0');
      label.style.left = `${(minute / 1440) * 100}%`;
      label.className = 'timeline-axis-tick';
      if (hour % 2 === 1) label.classList.add('timeline-axis-odd');
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
return {renderTimeline,closeDetails};
}
