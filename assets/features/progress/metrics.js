import { taipeiDateString as appTaipeiDateString } from '../../shared/time.js';
import { round } from '../../shared/numbers.js';
import { normalized, volume } from '../training/index.js';
 function progress(records,exercise,today=appTaipeiDateString()){
  const days=new Map();
  records.filter(r=>normalized(r.exercise)===normalized(exercise)&&r.date<=today).forEach(r=>{
   const d=days.get(r.date)||{date:r.date,max:0,volume:0};d.max=Math.max(d.max,r.weight);d.volume+=volume(r);days.set(r.date,d);
  });
  return [...days.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-10).map(d=>({...d,volume:round(d.volume)}));
 }

export const ProgressMetrics={progress,normalized};
