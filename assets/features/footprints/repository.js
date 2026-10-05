import { dateKey, validDate, validID, validate, fromAttendance, stats } from './model.js';
const DB_NAME = 'gym-footprints-v1:' + new URL('.', location.href).pathname;
  const MAX_ROWS = 20000;
  let database;
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
  export const FootprintsStore = {record,all,stats,fromAttendance,parseBackup,merge,dateKey,validDate};
