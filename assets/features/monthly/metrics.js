import { round } from '../../shared/numbers.js';
import { volume } from '../training/index.js';
 function previousMonth(date){const d=new Date(date+'T00:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7)}
 function summary(month,training,weights,stamps){
  const t=training.filter(r=>r.date.startsWith(month));
  const w=weights.filter(r=>r.date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date));
  return {volume:round(t.reduce((sum,r)=>sum+volume(r),0)),trainingDays:new Set(t.map(r=>r.date)).size,
   sets:t.reduce((sum,r)=>sum+r.sets,0),visits:new Set(stamps.filter(r=>r.kind==='in'&&r.date.startsWith(month)).map(r=>r.date)).size,
   weightDays:w.length,weightStart:w.length?{date:w[0].date,kg:w[0].kg}:null,weightEnd:w.length?{date:w.at(-1).date,kg:w.at(-1).kg}:null,
   weightChange:w.length>=2?round(w.at(-1).kg-w[0].kg):null};
 }
 function weightText(s){return s.weightChange===null?'體重資料不足':s.weightChange===0?'體重持平':`${s.weightChange>0?'增重':'減重'} ${Math.abs(s.weightChange)} kg`}

export const MonthlyMetrics={previousMonth,summary,weightText};
