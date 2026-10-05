import { client } from '../../core/client.js';
export const ReportRepository={create:args=>client.rpc('report_issue',args)};

import { invokeUserFunction } from '../../services/user-functions.js';
export const notifyReport=body=>invokeUserFunction('send-issue-email',body);