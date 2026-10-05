import { mount } from '../features/monthly/controller.js';
import { startRestTimer } from '../features/rest-timer/index.js';
import { renderMini } from '../features/rest-timer/index.js';
import { setMessage } from '../shared/ui/messages.js';
startRestTimer(renderMini);
mount().then(()=>{document.body.dataset.pageReady='true'}).catch(error=>{document.body.dataset.pageReady='error';console.error(error);setMessage('頁面載入失敗：'+error.message,'error')});
