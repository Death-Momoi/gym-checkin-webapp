import { taipeiDateString as appTaipeiDateString } from '../../shared/time.js';
import { validDate } from '../../shared/validation.js';
import { round } from '../../shared/numbers.js';
export function weight(r){
  if(!r||!validDate(r.date)||r.date>appTaipeiDateString()||!Number.isFinite(r.kg)||r.kg<=0||r.kg>1000||!Number.isSafeInteger(r.updatedAt)||r.updatedAt<0)throw Error('體重格式不正確；日期不可在未來，重量須介於 0 與 1,000 kg 之間。');
  const kg=round(r.kg);if(kg<=0)throw Error('體重至少為 0.01 kg。');
  return {date:r.date,kg,updatedAt:r.updatedAt};
 }
