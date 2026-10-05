import { mount } from '../features/history/controller.js';
import { startRestTimer } from '../features/rest-timer/index.js';
import { renderMini } from '../features/rest-timer/index.js';
import { setMessage } from '../shared/ui/messages.js';
import { loadDatePicker } from '../core/vendor-loader.js';
startRestTimer(renderMini);
loadDatePicker().then(()=>mount()).then(()=>{document.body.dataset.pageReady='true'}).catch(error=>{document.body.dataset.pageReady='error';console.error(error);setMessage('頁面載入失敗：'+error.message,'error')});
