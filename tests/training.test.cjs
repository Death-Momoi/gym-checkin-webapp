/* Run against a local static server. Uses a disposable browser profile only. */
const assert = require('node:assert/strict');
const {chromium} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright' : 'playwright');
const artifacts = process.env.TEST_ARTIFACT_DIR || require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'gym-training-test-'));
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: {width:390,height:844}, isMobile:true, deviceScaleFactor:1 });
  const page = await context.newPage();
  const requests=[], errors=[];
  page.on('request', r => requests.push(r.url())); page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  page.on('dialog', dialog => dialog.accept());
  await page.goto(base+'/training.html');
  await page.waitForFunction(() => !document.querySelector('#training-fields').disabled);
  const today = await page.inputValue('#training-date');
  await page.fill('#training-exercise','啞鈴臥推'); await page.fill('#training-weight','17.5');
  await page.fill('#training-reps','12'); await page.fill('#training-sets','3');
  await page.fill('#training-note','單手重量'); await page.click('#training-save');
  await page.waitForFunction(() => document.querySelectorAll('.training-record').length === 1);
  assert.match(await page.locator('.training-record').innerText(), /17.5 kg × 12 次 × 3 組/);
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.training-record').length === 1);
  await page.fill('#training-exercise','啞鈴臥推'); assert.match(await page.locator('#last-training').innerText(), /17.5 kg/);
  await page.locator('#last-training button').click(); assert.equal(await page.inputValue('#training-weight'),'17.5');
  await page.locator('.training-record').getByRole('button',{name:'編輯',exact:true}).click();
  await page.fill('#training-weight','20'); await page.click('#training-save');
  await page.waitForFunction(() => document.querySelector('.training-record-numbers').textContent.includes('20 kg'));
  assert.equal(await page.locator('.training-record').count(),1);
  await page.locator('.training-record').getByRole('button',{name:'再記一次'}).click();
  await page.fill('#training-sets','1'); await page.click('#training-save');
  await page.waitForFunction(() => document.querySelectorAll('.training-record').length === 2);
  await page.fill('#history-exercise','深蹲'); assert.equal(await page.locator('.training-record').count(),0);
  await page.click('#history-all'); assert.equal(await page.locator('.training-record').count(),2);
  // Untrusted input must remain text, including imported records.
  const fixture = await page.evaluate(async () => {
    const list=await TrainingStore.all();
    const extra={...list[0],id:crypto.randomUUID(),exercise:'<img src=x onerror=alert(1)>',date:'2026-10-01'};
    await TrainingStore.merge([extra]); return {format:'gym-training-backup',version:1,records:[...list,extra]};
  });
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#training-fields').disabled); await page.click('#history-all');
  assert.equal(await page.locator('.training-record img').count(),0); assert.equal(await page.locator('.training-record').count(),3);
  await page.locator('.training-backup summary').click();
  const downloadEvent=page.waitForEvent('download'); await page.click('#training-export');
  const downloaded=await downloadEvent; const saved=await downloaded.path();
  const exported=JSON.parse(require('node:fs').readFileSync(saved,'utf8')); assert.equal(exported.records.length,3);
  await page.setInputFiles('#training-import-file',{name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await page.waitForFunction(() => document.querySelector('#message').textContent.includes('新增 0 筆'));
  assert.equal(await page.locator('.training-record').count(),3);
  const invalid=structuredClone(fixture); invalid.records[0].reps=-1;
  await page.setInputFiles('#training-import-file',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
  await page.waitForFunction(() => document.querySelector('#message').textContent.includes('匯入失敗'));
  assert.equal(await page.evaluate(async () => (await TrainingStore.all()).length),3);
  // Concurrent edits are rejected, preserving the most recently saved version.
  const conflict = await page.evaluate(async () => {
    const old=(await TrainingStore.all())[0], newer={...old,weight:25,updatedAt:old.updatedAt+1};
    await TrainingStore.save(newer,old.updatedAt);
    try { await TrainingStore.save({...old,weight:30,updatedAt:old.updatedAt+2},old.updatedAt); return false; }
    catch { return (await TrainingStore.all()).find(r=>r.id===old.id).weight===25; }
  }); assert.equal(conflict,true);
  // A new browser has no records until the local backup is imported.
  const other=await browser.newContext(); const second=await other.newPage();
  await second.goto(base+'/training.html'); await second.waitForFunction(() => !document.querySelector('#training-fields').disabled);
  assert.equal(await second.evaluate(async () => (await TrainingStore.all()).length),0);
  second.on('dialog',d=>d.accept()); await second.setInputFiles('#training-import-file',{name:'restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
  await second.waitForFunction(() => document.querySelector('#message').textContent.includes('新增 3 筆'));
  assert.equal(await second.locator('.training-record').count(),3); await other.close();
  // Saving after the page is loaded works with all network access disabled.
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#training-fields').disabled);
  await context.setOffline(true); await page.fill('#training-exercise','離線深蹲'); await page.click('#training-save');
  await page.waitForFunction(() => document.querySelector('#message').textContent.includes('已存入本機'));
  assert.equal(await page.evaluate(async () => (await TrainingStore.all()).length),4);
  await context.setOffline(false);
  // No API, CDN, authentication or other network request is made by the training page.
  assert(requests.every(url => url.startsWith(base+'/') && !/supabase|cdn\./.test(url)), requests.join('\n'));
  console.log('PASS records: create, reload, previous values, edit, repeat, filters, XSS, backup, import, conflict, offline, zero API');
  // Failed writes must not clear the form or claim success.
  await page.evaluate(() => { window.originalSave=TrainingStore.save; TrainingStore.save=async()=>{throw new Error('QuotaExceededError');}; });
  await page.fill('#training-exercise','儲存失敗保留輸入'); await page.click('#training-save');
  await page.waitForFunction(() => document.querySelector('#message').textContent.includes('QuotaExceededError'));
  assert.equal(await page.inputValue('#training-exercise'),'儲存失敗保留輸入');
  assert.equal(await page.evaluate(async () => (await TrainingStore.all()).length),4);
  await page.evaluate(() => {TrainingStore.save=window.originalSave;});
  console.log('PASS failed storage: input retained, no false success, existing records preserved');
  // Persistent timer uses a deadline instead of counting callbacks.
  await page.clock.install();
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#training-fields').disabled);
  await page.evaluate(() => {RestTimer.setDuration(60);RestTimer.start();});
  await page.clock.runFor(10000); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); assert.equal(await page.locator('#rest-clock').textContent(),'00:50');
  await page.click('#rest-start'); const paused=await page.locator('#rest-clock').textContent();
  await page.clock.runFor(5000); assert.equal(await page.locator('#rest-clock').textContent(),paused);
  await page.click('#rest-add'); assert.equal(await page.locator('#rest-clock').textContent(),'01:05');
  await page.reload(); assert.equal(await page.locator('#rest-clock').textContent(),'01:05');
  await page.click('#rest-start'); await page.clock.runFor(66000); assert.equal(await page.locator('#rest-status').textContent(),'休息結束 ✓');
  await page.click('#rest-reset'); assert.equal(await page.locator('#rest-clock').textContent(),'01:00');
  await page.click('#rest-add'); await page.click('#rest-start'); assert.equal(await page.locator('#rest-clock').textContent(),'01:15');
  await page.goto(base+'/guide.html'); assert.match(await page.locator('#rest-mini').innerText(),/休息/);
  await page.locator('#rest-mini button').click(); assert.match(await page.locator('#rest-mini').innerText(),/已暫停/);
  await page.goto(base+'/training.html'); assert.equal(await page.locator('#rest-status').textContent(),'已暫停');
  await page.evaluate(() => RestTimer.reset());
  // Screenshots with realistic records, plus narrow-screen overflow check.
  await page.click('#history-today'); await page.evaluate(() => window.scrollTo(0,0)); await page.screenshot({path:require('node:path').join(artifacts,'training-mobile.png'),fullPage:true});
  for (const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:900});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow at '+width);
  }
  await page.screenshot({path:require('node:path').join(artifacts,'training-desktop.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS timer: pause/resume, +15s, reload, expiry, cross-page; layout: 320/390/768/1280; no runtime errors');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
