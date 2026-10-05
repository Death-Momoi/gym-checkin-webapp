export function formatTime(value) {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(value));
  }

export function formatDateTime(value) {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(value));
  }

export function taipeiDateString(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(value);
    const partMap = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${partMap.year}-${partMap.month}-${partMap.day}`;
  }

export function nextDateString(dateString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));

    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }

    return new Date(Date.UTC(year, month - 1, day + 1))
      .toISOString()
      .slice(0, 10);
  }
