/* New local data only. Existing v17 databases are never upgraded or rewritten. */
(function(){
 'use strict';
 let database;
 const DB='gym-fitness-v19:'+new URL('.',location.href).pathname;
 const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const validID=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(v);
 const validMonth=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v)&&Number(v.slice(0,4))>=1970;
 const nonnegative=v=>Number.isFinite(v)&&v>=0;
 function weight(r){
  if(!r||!validDate(r.date)||r.date>GymApp.taipeiDateString()||!Number.isFinite(r.kg)||r.kg<=0||r.kg>1000||!Number.isSafeInteger(r.updatedAt)||r.updatedAt<0)throw Error('體重格式不正確；日期不可在未來，重量須介於 0 與 1,000 kg 之間。');
  const kg=FitnessMetrics.round(r.kg);if(kg<=0)throw Error('體重至少為 0.01 kg。');
  return {date:r.date,kg,updatedAt:r.updatedAt};
 }
 function card(r,userId){
  if(!r||!validID(userId)||r.userId!==userId||!validMonth(r.month)||typeof r.name!=='string'||r.name.length>200||!Number.isSafeInteger(r.createdAt)||r.createdAt<0||!validDate(r.triggerDate)||FitnessMetrics.previousMonth(r.triggerDate)!==r.month)throw Error('月度卡格式或帳號不符。');
  const s=r.summary;
  if(!s||!nonnegative(s.volume)||s.volume>2e12||!['trainingDays','visits','weightDays','sets'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)||s.trainingDays>31||s.visits>31||s.weightDays>31||s.sets>1000000)throw Error('成果統計格式不正確。');
  function point(p){if(!p||!validDate(p.date)||!p.date.startsWith(r.month)||!Number.isFinite(p.kg)||p.kg<=0||p.kg>1000)throw Error('體重成果格式不正確。');return {date:p.date,kg:p.kg}}
  const start=s.weightDays?point(s.weightStart):null,end=s.weightDays?point(s.weightEnd):null;
  if((s.weightDays===0&&(s.weightStart!==null||s.weightEnd!==null))||(s.weightDays===1&&(start.date!==end.date||start.kg!==end.kg))||(s.weightDays>=2&&start.date>=end.date))throw Error('體重日期不一致。');
  const delta=s.weightDays>=2?FitnessMetrics.round(end.kg-start.kg):null;
  if(s.weightChange!==delta)throw Error('體重變化不一致。');
  return {userId,month:r.month,name:r.name,createdAt:r.createdAt,triggerDate:r.triggerDate,summary:{volume:s.volume,trainingDays:s.trainingDays,sets:s.sets,visits:s.visits,weightDays:s.weightDays,weightStart:start,weightEnd:end,weightChange:delta}};
 }
 function open(){
  if(database)return database;
  database=new Promise((resolve,reject)=>{
   const req=indexedDB.open(DB,1);
   req.onupgradeneeded=()=>{req.result.createObjectStore('weights',{keyPath:'date'});req.result.createObjectStore('cards',{keyPath:['userId','month']}).createIndex('byUser','userId')};
   req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();database=null};resolve(req.result)};
   req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('請關閉其他分頁後再試。'));
  }).catch(e=>{database=null;throw e});return database;
 }
 async function tx(table,mode,op){
  const db=await open();return new Promise((resolve,reject)=>{
   const t=db.transaction(table,mode);let result,failure;
   t.oncomplete=()=>resolve(result);t.onerror=()=>{};t.onabort=()=>reject(failure||t.error||Error('本機儲存失敗，請確認瀏覽器空間。'));
   try{op(t.objectStore(table),v=>{result=v},e=>{failure=e;t.abort()})}catch(e){failure=e;t.abort()}
  });
 }
 const weights=()=>tx('weights','readonly',(s,done)=>{s.getAll().onsuccess=e=>done(e.target.result)});
 function saveWeight(r,expected=null){const clean=weight(r);return tx('weights','readwrite',(s,done,fail)=>{
  s.get(clean.date).onsuccess=e=>{const old=e.target.result;if((expected===null&&old)||(expected!==null&&old?.updatedAt!==expected)){fail(Error('此日期已在另一分頁變更，請重新讀取再修改。'));return}
   s.count().onsuccess=e=>{if(!old&&e.target.result>=10000){fail(Error('已達 10,000 筆，請先備份並整理。'));return}s.put(clean);done(clean)};
  };
 })}
 function removeWeight(date,expected){return tx('weights','readwrite',(s,done,fail)=>{s.get(date).onsuccess=e=>{if(e.target.result?.updatedAt!==expected){fail(Error('紀錄已變更，請重新讀取。'));return}s.delete(date);done(true)}})}
 const cards=userId=>validID(userId)?tx('cards','readonly',(s,done)=>{s.index('byUser').getAll(userId).onsuccess=e=>done(e.target.result)}):Promise.reject(Error('請先登入。'));
 const getCard=(userId,month)=>tx('cards','readonly',(s,done)=>{s.get([userId,month]).onsuccess=e=>done(e.target.result)});
 function addCard(r){const clean=card(r,r.userId);return tx('cards','readwrite',(s,done,fail)=>{
  s.get([r.userId,r.month]).onsuccess=e=>{if(e.target.result){done({card:e.target.result,created:false});return}
   s.index('byUser').count(r.userId).onsuccess=e=>{if(e.target.result>=1200){fail(Error('月度卡已達本機容量上限。'));return}s.add(clean);done({card:clean,created:true})};
  };
 })}
 function merge(data,type,userId){
  const isWeight=type==='weights',max=isWeight?10000:1200;
  if(!data||data.format!==(isWeight?'gym-bodyweight-backup':'gym-monthly-cards-backup')||data.version!==1||(!isWeight&&data.userId!==userId)||!Array.isArray(data.records)||data.records.length>max)throw Error('請使用正確的備份檔及帳號。');
  const clean=data.records.map(r=>isWeight?weight(r):card(r,userId)),keys=clean.map(r=>isWeight?r.date:r.month);
  if(new Set(keys).size!==keys.length)throw Error('備份中有重複日期或月份。');
  return tx(type,'readwrite',(s,done,fail)=>{
   const req=isWeight?s.getAll():s.index('byUser').getAll(userId);
   req.onsuccess=e=>{const existing=new Set(e.target.result.map(r=>isWeight?r.date:r.month));const added=clean.filter(r=>!existing.has(isWeight?r.date:r.month));
    if(existing.size+added.length>max){fail(Error('合併後超過本機筆數上限。'));return}added.forEach(r=>s.add(r));done({added:added.length,skipped:clean.length-added.length})};
  });
 }
 window.FitnessStore={weights,saveWeight,removeWeight,cards,getCard,addCard,merge,validDate};
})();
