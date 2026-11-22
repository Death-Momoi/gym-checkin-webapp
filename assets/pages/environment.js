import { mount } from '../features/environment/controller.js';
import { startRestTimer, renderMini } from '../features/rest-timer/index.js';
import { setMessage } from '../shared/ui/messages.js';
startRestTimer(renderMini);
mount().then(() => { document.body.dataset.pageReady = 'true'; }).catch(error => {
  document.body.dataset.pageReady = 'error'; console.error(error);
  setMessage('頁面載入失敗，請重新整理後再試。', 'error');
});
