import { tx } from '../../core/fitness-db.js';
import { mergeRecords } from '../../core/merge-backup.js';
import { weight } from './validation.js';
 const weights=()=>tx('weights','readonly',(s,done)=>{s.getAll().onsuccess=e=>done(e.target.result)});
 function saveWeight(r,expected=null){const clean=weight(r);return tx('weights','readwrite',(s,done,fail)=>{
  s.get(clean.date).onsuccess=e=>{const old=e.target.result;if((expected===null&&old)||(expected!==null&&old?.updatedAt!==expected)){fail(Error('此日期已在另一分頁變更，請重新讀取再修改。'));return}
   s.count().onsuccess=e=>{if(!old&&e.target.result>=10000){fail(Error('已達 10,000 筆，請先備份並整理。'));return}s.put(clean);done(clean)};
  };
 })}
 function removeWeight(date,expected){return tx('weights','readwrite',(s,done,fail)=>{s.get(date).onsuccess=e=>{if(e.target.result?.updatedAt!==expected){fail(Error('紀錄已變更，請重新讀取。'));return}s.delete(date);done(true)}})}

function merge(data){return mergeRecords({data,table:'weights',format:'gym-bodyweight-backup',validate:weight,key:r=>r.date,max:10000})}
export const BodyweightStore={weights,saveWeight,removeWeight,merge};
