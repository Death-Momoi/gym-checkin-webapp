import { mount } from '../features/attendance/controller.js';
import { startRestTimer } from '../features/rest-timer/service.js';
import { renderMini } from '../features/rest-timer/view.js';
import { setMessage } from '../shared/ui/messages.js';
import { afterAttendance } from '../app/attendance-rewards.js';
startRestTimer(renderMini);
mount({afterAttendance}).then(()=>{document.body.dataset.pageReady='true'}).catch(error=>{document.body.dataset.pageReady='error';console.error(error);setMessage('頁面載入失敗：'+error.message,'error')});
