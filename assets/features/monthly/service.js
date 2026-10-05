import { profileName as appProfileName } from '../../shared/profile-display.js';
import { TrainingStore } from '../training/index.js';
import { FootprintsStore } from '../footprints/index.js';
import { BodyweightStore } from '../bodyweight/index.js';
import { MonthlyStore } from './repository.js';
import { MonthlyMetrics } from './metrics.js';
 async function ensure(app,payload){
  const event=FootprintsStore.fromAttendance(app.session.user.id,'in',payload),month=MonthlyMetrics.previousMonth(event.date),userId=app.session.user.id;
  const existing=await MonthlyStore.getCard(userId,month);if(existing)return {card:existing,created:false};
  const [training,weights,stamps]=await Promise.all([TrainingStore.all(),BodyweightStore.weights(),FootprintsStore.all(userId)]);
  return MonthlyStore.addCard({userId,month,name:appProfileName(app.profile,app.session).slice(0,200),createdAt:Date.now(),triggerDate:event.date,summary:MonthlyMetrics.summary(month,training,weights,stamps)});
 }

export const MonthlyCards={ensure};
