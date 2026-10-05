import { FootprintsUI } from '../features/footprints/index.js';
import { MonthlyNotice } from '../features/monthly/index.js';
export async function afterAttendance(kind,app,data){await FootprintsUI.present(kind,app,data);if(kind==='in')await MonthlyNotice.afterCheckIn(app,data)}
