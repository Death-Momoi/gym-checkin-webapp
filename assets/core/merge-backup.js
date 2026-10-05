import { tx } from './fitness-db.js';
export function mergeRecords({data,table,format,validate,key,userId,max}){
 if(!data||data.format!==format||data.version!==1||(userId&&data.userId!==userId)||!Array.isArray(data.records)||data.records.length>max)throw Error('請使用正確的備份檔及帳號。');
 const clean=data.records.map(validate),keys=clean.map(key);if(new Set(keys).size!==keys.length)throw Error('備份中有重複日期或月份。');
 return tx(table,'readwrite',(s,done,fail)=>{const req=userId?s.index('byUser').getAll(userId):s.getAll();req.onsuccess=e=>{const existing=new Set(e.target.result.map(key)),added=clean.filter(r=>!existing.has(key(r)));if(existing.size+added.length>max){fail(Error('合併後超過本機筆數上限。'));return}added.forEach(r=>s.add(r));done({added:added.length,skipped:clean.length-added.length})}});
}
