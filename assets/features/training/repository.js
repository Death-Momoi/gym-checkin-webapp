import { validDate, validate } from './validation.js';
const DB_NAME = 'gym-training-v1:' + new URL('.', location.href).pathname;
  const MAX_RECORDS = 10000;
  let database;
  function open() {
    if (database) return database;
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records', { keyPath: 'id' });
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); database = null; };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('請先關閉其他訓練助手分頁，再重新開啟。'));
    }).catch(error => { database = null; throw error; });
    return database;
  }
  async function transaction(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', mode);
      let result, failure;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => {}; // onabort owns the final failure, including quota errors.
      tx.onabort = () => reject(failure || tx.error || new Error('儲存失敗，請確認手機空間與瀏覽器設定。'));
      try { operation(tx.objectStore('records'), value => { result = value; }, error => { failure = error; tx.abort(); }); }
      catch (error) { failure = error; tx.abort(); }
    });
  }
  const all = () => transaction('readonly', (store, done) => { store.getAll().onsuccess = e => done(e.target.result); });
  function save(record, expectedUpdate = null) {
    const clean = validate(record);
    return transaction('readwrite', (store, done, fail) => {
      store.get(clean.id).onsuccess = event => {
        const old = event.target.result;
        if ((expectedUpdate !== null && (!old || old.updatedAt !== expectedUpdate)) || (expectedUpdate === null && old)) {
          fail(new Error('這筆紀錄已在另一分頁變更，請重新整理後再編輯。')); return;
        }
        store.count().onsuccess = event => {
          if (!old && event.target.result >= MAX_RECORDS) { fail(new Error('已達 10,000 筆，請先備份並整理紀錄。')); return; }
          store.put(clean); done(clean);
        };
      };
    });
  }
  function remove(id, expectedUpdate) {
    return transaction('readwrite', (store, done, fail) => {
      store.get(id).onsuccess = e => {
        if (!e.target.result || e.target.result.updatedAt !== expectedUpdate) {
          fail(new Error('這筆紀錄已變更，請重新整理後再刪除。')); return;
        }
        store.delete(id); done(true);
      };
    });
  }
  function parseBackup(data) {
    if (!data || data.format !== 'gym-training-backup' || data.version !== 1 ||
        !Array.isArray(data.records) || data.records.length > MAX_RECORDS) throw new Error('請選擇本系統匯出的有效 JSON 備份（版本 1）。');
    const records = data.records.map(validate);
    if (new Set(records.map(r => r.id)).size !== records.length) throw new Error('備份內有重複編號，未匯入。');
    return records;
  }
  function merge(records) {
    const clean = records.map(validate);
    return transaction('readwrite', (store, done, fail) => {
      store.getAllKeys().onsuccess = event => {
        const keys = new Set(event.target.result);
        const added = clean.filter(r => !keys.has(r.id));
        if (keys.size + added.length > MAX_RECORDS) { fail(new Error('合併後超過 10,000 筆上限，未匯入。')); return; }
        added.forEach(r => store.add(r));
        done({ added: added.length, skipped: clean.length - added.length });
      };
    });
  }
  export const TrainingStore = { all, save, remove, parseBackup, merge, validate, validDate };
