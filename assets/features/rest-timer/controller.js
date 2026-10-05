import { RestTimer as timer } from './service.js';
import { setMessage } from '../../shared/ui/messages.js';
export function mountTimerControls(){
const $=id=>document.getElementById(id),notice=(text,error=false)=>setMessage(text,error?'error':'success');
  function renderTimer() {
    const t = timer.snapshot();
    $('rest-clock').textContent = t.formatted;
    $('rest-status').textContent = { idle: '準備開始', running: '休息中', paused: '已暫停', done: '休息結束 ✓' }[t.state];
    $('rest-start').textContent = { idle: '開始休息', running: '暫停', paused: '繼續倒數', done: '再休息一輪' }[t.state];
    $('rest-clock').classList.toggle('rest-done', t.state === 'done');
    $('rest-sound').checked = t.sound;
    $('rest-storage-error').textContent = t.storageError;
    document.querySelectorAll('[data-rest-seconds]').forEach(button => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.restSeconds) === t.duration));
    });
  }
  function chooseDuration(seconds) {
    const t = timer.snapshot();
    if (['running', 'paused'].includes(t.state) && !confirm('套用新秒數會重設目前倒數，是否繼續？')) return;
    try { timer.setDuration(seconds); $('rest-seconds').value = seconds; }
    catch (error) { notice(error.message, true); }
  }

    $('rest-seconds').value = timer.snapshot().duration;
    document.addEventListener('rest-timer-change', renderTimer); renderTimer();
    document.querySelectorAll('[data-rest-seconds]').forEach(button => button.addEventListener('click', () => chooseDuration(Number(button.dataset.restSeconds))));
    $('rest-apply').addEventListener('click', () => chooseDuration(Number($('rest-seconds').value)));
    $('rest-start').addEventListener('click', () => timer.snapshot().state === 'running' ? timer.pause() : timer.start());
    $('rest-add').addEventListener('click', timer.add); $('rest-reset').addEventListener('click', timer.reset);
    $('rest-sound').addEventListener('change', () => timer.sound($('rest-sound').checked));

}
