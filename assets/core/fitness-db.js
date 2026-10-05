let database;
const DB='gym-fitness-v19:'+new URL('.',location.href).pathname;
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

export {tx};
