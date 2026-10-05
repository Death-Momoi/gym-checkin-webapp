import { MonthlyMetrics } from './metrics.js';
import { validID, validDate, validMonth, nonnegative } from '../../shared/validation.js';
import { round } from '../../shared/numbers.js';
export function card(r,userId){
  if(!r||!validID(userId)||r.userId!==userId||!validMonth(r.month)||typeof r.name!=='string'||r.name.length>200||!Number.isSafeInteger(r.createdAt)||r.createdAt<0||!validDate(r.triggerDate)||MonthlyMetrics.previousMonth(r.triggerDate)!==r.month)throw Error('月度卡格式或帳號不符。');
  const s=r.summary;
  if(!s||!nonnegative(s.volume)||s.volume>2e12||!['trainingDays','visits','weightDays','sets'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)||s.trainingDays>31||s.visits>31||s.weightDays>31||s.sets>1000000)throw Error('成果統計格式不正確。');
  function point(p){if(!p||!validDate(p.date)||!p.date.startsWith(r.month)||!Number.isFinite(p.kg)||p.kg<=0||p.kg>1000)throw Error('體重成果格式不正確。');return {date:p.date,kg:p.kg}}
  const start=s.weightDays?point(s.weightStart):null,end=s.weightDays?point(s.weightEnd):null;
  if((s.weightDays===0&&(s.weightStart!==null||s.weightEnd!==null))||(s.weightDays===1&&(start.date!==end.date||start.kg!==end.kg))||(s.weightDays>=2&&start.date>=end.date))throw Error('體重日期不一致。');
  const delta=s.weightDays>=2?round(end.kg-start.kg):null;
  if(s.weightChange!==delta)throw Error('體重變化不一致。');
  return {userId,month:r.month,name:r.name,createdAt:r.createdAt,triggerDate:r.triggerDate,summary:{volume:s.volume,trainingDays:s.trainingDays,sets:s.sets,visits:s.visits,weightDays:s.weightDays,weightStart:start,weightEnd:end,weightChange:delta}};
 }
