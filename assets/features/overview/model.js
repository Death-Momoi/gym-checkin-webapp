import { nextDateString as appNextDateString, taipeiDateString as appTaipeiDateString, formatTime as appFormatTime } from '../../shared/time.js';
import { roleLabel as appRoleLabel } from '../../shared/profile-display.js';
const OVERTIME_MINUTES=120;
  const STATUS_META = Object.freeze({
    completed: { label: '已簽退', className: 'status-completed' },
    ongoing: { label: '目前使用中', className: 'status-ongoing' },
    overtime: { label: '超時或續借，請確認', className: 'status-overtime' },
    forgotten: { label: '忘記簽退／跨日強制結算', className: 'status-forgotten' },
    reservation: { label: 'Google Calendar 預約', className: 'status-reservation' }
  });

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
    if (!appNextDateString(dateString)) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day - 1))
      .toISOString()
      .slice(0, 10);
  }

  function dateBounds(dateString) {
    const nextDate = appNextDateString(dateString);
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

  function usageStatus(record) {
    if (record.isForcedCheckout) return 'forgotten';
    if (record.duration > OVERTIME_MINUTES) return 'overtime';
    if (record.isOngoing) return 'ongoing';
    return 'completed';
  }

  function normalizeUsageRecord(session, profileMap, selectedDate, bounds) {
    const startMs = Date.parse(session.checked_in_at);
    const start = clamp((startMs - bounds.startMs) / 60000, 0, 1440);
    const selectedIsToday = selectedDate === appTaipeiDateString();
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
        endLabel = appFormatTime(session.checked_out_at);
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
      role: appRoleLabel(session.gym_role),
      start,
      end,
      startLabel: appFormatTime(session.checked_in_at),
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
export {clamp,minutesToLabel,durationLabel,previousDateString,dateBounds,usageStatus,normalizeUsageRecord,normalizeReservation,assignLanes,STATUS_META};
