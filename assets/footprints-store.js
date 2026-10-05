/* Personal, local-only stamps. One row per account + Taiwan date + event kind. */
(function () {
  'use strict';
  const DB_NAME = 'gym-footprints-v1:' + new URL('.', location.href).pathname;
  const MAX_ROWS = 20000;
  let database;
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
  function open() {
    if (database) return database;
    database = new Promise((resolve,reject) => {
      const request = indexedDB.open(DB_NAME,1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('stamps',{keyPath:['userId','kind','date']});
        store.createIndex('byUser','userId');
      };
      request.onsuccess = () => { request.result.onversionchange = () => {request.result.close();database=null;};resolve(request.result); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('請先關閉其他健身足跡分頁後再試。'));
    }).catch(error => {database=null;throw error;}); return database;
  }
  async function transaction(mode, operation) {
    const db = await open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('stamps',mode); let result,failure;
      tx.oncomplete = () => resolve(result); tx.onerror = () => {};
      tx.onabort = () => reject(failure || tx.error || new Error('手機未能儲存印章，請確認空間或瀏覽器設定。'));
      try { operation(tx.objectStore('stamps'), value => {result=value;}, error => {failure=error;tx.abort();}); }
      catch(error) {failure=error;tx.abort();}
    });
  }
  function all(userId) {
    if (!validID(userId)) return Promise.reject(new Error('請先登入。'));
    return transaction('readonly',(store,done) => { store.index('byUser').getAll(userId).onsuccess = e => done(e.target.result); });
  }
  function record(userId,kind,payload) {
    const entry = fromAttendance(userId,kind,payload);
    return transaction('readwrite',(store,done,fail) => {
      store.get([userId,kind,entry.date]).onsuccess = e => {
        if (e.target.result) {done({entry:e.target.result,duplicate:true});return;}
        store.index('byUser').count(userId).onsuccess = e => {
          if(e.target.result >= MAX_ROWS) {fail(new Error('本機集章已達容量上限，請先備份。'));return;}
          store.add(entry); done({entry,duplicate:false});
        };
      };
    });
  }
  function stats(rows,kind,date) {
    const d = new Date(`${date}T00:00:00Z`), offset = (d.getUTCDay()+6)%7;
    d.setUTCDate(d.getUTCDate()-offset); const monday = d.toISOString().slice(0,10);
    const dates = [...new Set(rows.filter(r => r.kind === kind && r.date <= date).map(r => r.date))];
    return {total:dates.length,month:dates.filter(v => v.startsWith(date.slice(0,7))).length,week:dates.filter(v => v >= monday).length};
  }
  function parseBackup(data,userId) {
    if (!data || data.format !== 'gym-footprints-backup' || data.version !== 1 || data.userId !== userId ||
        !Array.isArray(data.stamps) || data.stamps.length > MAX_ROWS) throw new Error('請使用同一 Google 帳號匯出的健身足跡備份（版本 1）。');
    const rows = data.stamps.map(r => validate(r,userId));
    if (new Set(rows.map(r => `${r.kind}:${r.date}`)).size !== rows.length) throw new Error('備份包含重複日期印章，未匯入。');
    return rows;
  }
  function merge(userId,rows) {
    const clean = rows.map(r => validate(r,userId));
    return transaction('readwrite',(store,done,fail) => {
      store.index('byUser').getAll(userId).onsuccess = e => {
        const keys = new Set(e.target.result.map(r => `${r.kind}:${r.date}`));
        const added = clean.filter(r => !keys.has(`${r.kind}:${r.date}`));
        if (keys.size+added.length > MAX_ROWS) {fail(new Error('合併後超過本機容量上限，未匯入。'));return;}
        added.forEach(r => store.add(r));done({added:added.length,skipped:clean.length-added.length});
      };
    });
  }
  window.FootprintsStore = {record,all,stats,fromAttendance,parseBackup,merge,dateKey,validDate};
})();
