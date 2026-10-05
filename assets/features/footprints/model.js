  function dateKey(value) {
    const parts = new Intl.DateTimeFormat('en', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
    const p = Object.fromEntries(parts.map(x => [x.type,x.value])); return `${p.year}-${p.month}-${p.day}`;
  }
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  const validID = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
  const validTime = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
  function validate(value, userId) {
    if (!value || !validID(userId) || value.userId !== userId || !validID(value.sessionId) ||
        !['in','out'].includes(value.kind) || !validDate(value.date) || !validTime(value.at) ||
        !validTime(value.checkedInAt) || (value.kind === 'out' && !validTime(value.checkedOutAt)) ||
        value.date !== dateKey(value.at) ||
        (value.kind === 'in' && value.at !== value.checkedInAt) ||
        (value.kind === 'out' && (value.at !== value.checkedOutAt || Date.parse(value.checkedOutAt) < Date.parse(value.checkedInAt)))) {
      throw new Error('蓋章資料格式不完整或帳號不符，未變更本機紀錄。');
    }
    return {userId,kind:value.kind,date:value.date,at:value.at,sessionId:value.sessionId,
      checkedInAt:value.checkedInAt,checkedOutAt:value.kind === 'out' ? value.checkedOutAt : null};
  }
  function fromAttendance(userId, kind, payload) {
    const row = Array.isArray(payload) ? payload[0] : payload;
    if (!row || row.user_id !== userId || !['in','out'].includes(kind)) throw new Error('簽到／簽退回傳資料不足，無法建立本機印章。');
    if (kind === 'out' && (row.checkout_method !== 'self' || row.checked_out_by !== userId)) {
      throw new Error('只有本人成功簽退才會產生成果卡；協助他人簽退不集章。');
    }
    const at = kind === 'in' ? row.checked_in_at : row.checked_out_at;
    if (!validTime(at)) throw new Error('缺少伺服器確認時間，未蓋章。');
    return validate({userId,kind,date:dateKey(at),at,sessionId:row.id,checkedInAt:row.checked_in_at,checkedOutAt:row.checked_out_at}, userId);
  }
  function stats(rows,kind,date) {
    const d = new Date(`${date}T00:00:00Z`), offset = (d.getUTCDay()+6)%7;
    d.setUTCDate(d.getUTCDate()-offset); const monday = d.toISOString().slice(0,10);
    const dates = [...new Set(rows.filter(r => r.kind === kind && r.date <= date).map(r => r.date))];
    return {total:dates.length,month:dates.filter(v => v.startsWith(date.slice(0,7))).length,week:dates.filter(v => v >= monday).length};
  }

export {dateKey,validDate,validID,validate,fromAttendance,stats};
