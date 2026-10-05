import { tx } from '../../core/fitness-db.js';
import { mergeRecords } from '../../core/merge-backup.js';
import { validID } from '../../shared/validation.js';
import { card } from './validation.js';
 const cards=userId=>validID(userId)?tx('cards','readonly',(s,done)=>{s.index('byUser').getAll(userId).onsuccess=e=>done(e.target.result)}):Promise.reject(Error('請先登入。'));
 const getCard=(userId,month)=>tx('cards','readonly',(s,done)=>{s.get([userId,month]).onsuccess=e=>done(e.target.result)});
 function addCard(r){const clean=card(r,r.userId);return tx('cards','readwrite',(s,done,fail)=>{
  s.get([r.userId,r.month]).onsuccess=e=>{if(e.target.result){done({card:e.target.result,created:false});return}
   s.index('byUser').count(r.userId).onsuccess=e=>{if(e.target.result>=1200){fail(Error('月度卡已達本機容量上限。'));return}s.add(clean);done({card:clean,created:true})};
  };
 })}

function merge(data,userId){if(!validID(userId))throw Error('請先登入。');return mergeRecords({data,table:'cards',format:'gym-monthly-cards-backup',validate:r=>card(r,userId),key:r=>r.month,userId,max:1200})}
export const MonthlyStore={cards,getCard,addCard,merge};
