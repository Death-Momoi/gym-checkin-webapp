(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const store = window.TrainingStore, timer = window.RestTimer;
  let records = [], editing = null, busy = false, limit = 30, importPending = null;
  const today = () => GymApp.taipeiDateString();
  const normalized = name => name.trim().toLocaleLowerCase();
  const order = (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
  const notice = (text, error = false) => GymApp.setMessage(text, error ? 'error' : 'success');
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function control(label, action) {
    const node = element('button', label, 'secondary-button'); node.type = 'button'; node.disabled = busy;
    node.addEventListener('click', action); return node;
  }
  function setBusy(value) {
    busy = value; $('training-fields').disabled = value;
    $('training-export').disabled = value; $('training-import').disabled = value;
    document.querySelectorAll('#training-history button').forEach(b => { b.disabled = value; });
  }
  function resetForm() {
    editing = null; $('training-save').textContent = '儲存紀錄'; $('training-cancel').classList.add('hidden');
    $('record-title').textContent = '記下這次訓練'; previous();
  }
  function fill(record, edit = false) {
    editing = edit ? { ...record } : null;
    $('training-date').value = edit ? record.date : today();
    $('training-exercise').value = record.exercise; $('training-weight').value = record.weight;
    $('training-reps').value = record.reps; $('training-sets').value = record.sets; $('training-note').value = record.note;
    $('training-save').textContent = edit ? '儲存修改' : '儲存紀錄';
    $('training-cancel').classList.toggle('hidden', !edit);
    $('record-title').textContent = edit ? '編輯訓練紀錄' : '記下這次訓練';
    previous(); $('training-exercise').focus(); $('training-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function previous() {
    const box = $('last-training'); box.replaceChildren();
    const exercise = normalized($('training-exercise').value), date = $('training-date').value;
    if (!exercise) { box.textContent = '輸入動作名稱，即可查看之前的紀錄。'; return; }
    const matches = records.filter(r => normalized(r.exercise) === exercise && r.date <= date && r.id !== editing?.id).sort(order);
    if (!matches.length) { box.textContent = '這個動作還沒有之前的紀錄，從今天開始累積。'; return; }
    const last = matches[0];
    box.append(element('span', `最近一筆 · ${last.date}　${last.weight} kg × ${last.reps} 次 × ${last.sets} 組`));
    box.append(control('帶入數值', () => {
      $('training-weight').value = last.weight; $('training-reps').value = last.reps; $('training-sets').value = last.sets;
    }));
  }
  function render() {
    const options = $('exercise-options'); options.replaceChildren();
    const names = [...new Set(records.map(r => r.exercise))].sort((a, b) => a.localeCompare(b, 'zh-TW'));
    names.forEach(name => { const opt = element('option'); opt.value = name; options.append(opt); });
    $('training-total').textContent = `${records.length} 筆 · ${new Set(records.map(r => r.date)).size} 天`;
    const date = $('history-date').value, term = normalized($('history-exercise').value);
    const filtered = records.filter(r => (!date || r.date === date) && normalized(r.exercise).includes(term)).sort(order);
    const groups = filtered.reduce((sum, r) => sum + r.sets, 0);
    $('history-summary').textContent = `${date || '全部日期'} · ${filtered.length} 筆 · ${groups} 組`;
    const history = $('training-history'); history.replaceChildren();
    if (!filtered.length) history.append(element('p', records.length ? '沒有符合條件的紀錄。' : '還沒有紀錄。完成一組後，把成果記下來吧。', 'training-empty'));
    filtered.slice(0, limit).forEach(record => {
      const article = element('article', undefined, 'training-record');
      const heading = element('div', undefined, 'training-heading');
      heading.append(element('h3', record.exercise), element('time', record.date));
      heading.lastChild.dateTime = record.date;
      article.append(heading, element('p', `${record.weight} kg × ${record.reps} 次 × ${record.sets} 組`, 'training-record-numbers'));
      if (record.note) article.append(element('p', record.note, 'hint'));
      const actions = element('div', undefined, 'training-row');
      actions.append(control('再記一次', () => fill(record)), control('編輯', () => fill(record, true)), control('刪除', async () => {
        if (busy || !confirm(`刪除 ${record.date} 的「${record.exercise}」這筆紀錄？`)) return;
        await mutate(async () => { await store.remove(record.id, record.updatedAt); if (editing?.id === record.id) resetForm(); }, '紀錄已刪除。');
      }));
      article.append(actions); history.append(article);
    });
    $('history-more').classList.toggle('hidden', filtered.length <= limit); previous();
  }
  async function refresh() { records = await store.all(); render(); }
  async function mutate(action, success) {
    if (busy) return;
    setBusy(true);
    try { await action(); await refresh(); notice(typeof success === 'function' ? success() : success); }
    catch (error) { notice(`操作未完成：${error.message || '請確認瀏覽器允許儲存資料，並保留足夠空間。'}`, true); }
    finally { setBusy(false); }
  }
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
  document.addEventListener('DOMContentLoaded', async () => {
    // Mount navigation only. Deliberately do not initialize auth, Supabase or profiles.
    GymApp.mountShell();
    $('training-date').value = today(); $('history-date').value = today();
    $('rest-seconds').value = timer.snapshot().duration;
    document.addEventListener('rest-timer-change', renderTimer); renderTimer();
    document.querySelectorAll('[data-rest-seconds]').forEach(button => button.addEventListener('click', () => chooseDuration(Number(button.dataset.restSeconds))));
    $('rest-apply').addEventListener('click', () => chooseDuration(Number($('rest-seconds').value)));
    $('rest-start').addEventListener('click', () => timer.snapshot().state === 'running' ? timer.pause() : timer.start());
    $('rest-add').addEventListener('click', timer.add); $('rest-reset').addEventListener('click', timer.reset);
    $('rest-sound').addEventListener('change', () => timer.sound($('rest-sound').checked));
    $('training-exercise').addEventListener('input', previous); $('training-date').addEventListener('change', previous);
    $('training-cancel').addEventListener('click', () => { $('training-form').reset(); $('training-date').value = today(); resetForm(); });
    for (const id of ['history-date', 'history-exercise']) $(id).addEventListener('input', () => { limit = 30; render(); });
    $('history-today').addEventListener('click', () => { $('history-date').value = today(); limit = 30; render(); });
    $('history-all').addEventListener('click', () => { $('history-date').value = ''; $('history-exercise').value = ''; limit = 30; render(); });
    $('history-more').addEventListener('click', () => { limit += 30; render(); });
    $('training-form').addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !$('training-form').reportValidity()) return;
      const exercise = $('training-exercise').value.trim();
      if (!exercise) { notice('請填寫動作名稱。', true); return; }
      const old = editing;
      const now = Math.max(Date.now(), (old?.updatedAt || 0) + 1);
      const record = { id: old?.id || crypto.randomUUID(), date: $('training-date').value, exercise,
        weight: Number($('training-weight').value), reps: Number($('training-reps').value), sets: Number($('training-sets').value),
        note: $('training-note').value, createdAt: old?.createdAt || now, updatedAt: now };
      const startRest = $('save-and-rest').checked;
      if (startRest) timer.unlockAudio();
      await mutate(async () => {
        await store.save(record, old?.updatedAt ?? null);
        resetForm(); $('history-date').value = record.date; $('history-exercise').value = ''; limit = 30;
        if (startRest) timer.start(true);
      }, old ? '修改已存入本機。' : '已存入本機，可繼續記錄下一組。');
    });
    $('training-export').addEventListener('click', async () => {
      if (busy) return;
      try {
        const current = await store.all();
        const data = JSON.stringify({ format: 'gym-training-backup', version: 1, exportedAt: new Date().toISOString(), records: current }, null, 2);
        const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        const a = element('a'); a.href = url; a.download = `訓練紀錄_${today()}_${Date.now()}.json`;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
        notice(`已產生 ${current.length} 筆紀錄的備份，請確認手機已下載檔案。`);
      } catch (error) { notice(`備份失敗：${error.message}`, true); }
    });
    $('training-import').addEventListener('click', () => $('training-import-file').click());
    $('training-import-file').addEventListener('change', async event => {
      const file = event.target.files[0]; event.target.value = ''; if (!file || busy || importPending) return;
      importPending = file;
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error('檔案超過 20 MB，未匯入。');
        const imported = store.parseBackup(JSON.parse(await file.text()));
        if (!confirm(`將合併 ${imported.length} 筆備份紀錄；相同編號保留手機現有資料，是否繼續？`)) return;
        let result;
        await mutate(async () => { result = await store.merge(imported); $('history-date').value = ''; $('history-exercise').value = ''; limit = 30; },
          () => `匯入完成：新增 ${result.added} 筆，保留 ${result.skipped} 筆現有紀錄。`);
      } catch (error) { notice(`匯入失敗：${error.message}`, true); }
      finally { importPending = null; }
    });
    $('training-persist').addEventListener('click', async () => {
      try {
        const allowed = await navigator.storage?.persist?.();
        $('persist-status').textContent = allowed ? '瀏覽器已同意持續保留資料；手動清除網站資料仍會刪除紀錄，請繼續定期備份。' : '瀏覽器未同意或不支援保留請求；紀錄仍可使用，請定期備份。';
      } catch { $('persist-status').textContent = '目前無法申請保留，請使用下載備份。'; }
    });
    try { await refresh(); setBusy(false); }
    catch { $('training-total').textContent = '儲存空間無法開啟'; notice('無法開啟手機儲存空間，訓練紀錄暫時無法使用。請確認瀏覽器允許網站儲存資料後重新整理；計時器仍可使用。', true); }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !busy) refresh().catch(() => notice('無法重新讀取本機紀錄，請重新整理。', true));
    });
  });
})();
