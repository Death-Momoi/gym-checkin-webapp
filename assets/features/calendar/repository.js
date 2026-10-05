import { invokeUserFunction } from '../../services/user-functions.js';
export const loadCalendarEvents=body=>invokeUserFunction('get-calendar-events',body);
