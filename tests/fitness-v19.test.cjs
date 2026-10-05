const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765',out=process.env.TEST_ARTIFACT_DIR||'/tmp';
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
// Reuse the v17 test-only SDK. No calls to production Supabase.
const sdk=Function('uid','other','return `'+fs.readFileSync(path.join(__dirname,'footprints.test.cjs'),'utf8').match(/const sdk=`([\s\S]*?)`;/)[1]+'`;')(uid,other);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-TW',timezoneId:'Asia/Taipei'});
 const errors=[],external=[];await context.route('**/*',r=>{const u=r.request().url();if(u.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2'))return r.fulfill({contentType:'text/javascript',body:sdk});if(u.startsWith(base+'/'))return r.continue();external.push(u);return r.abort()});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(base+'/progress.html');await page.waitForFunction(()=>!document.querySelector('#progress-refresh').disabled);
 const expected=await page.evaluate(async()=>{
  const records=Array.from({length:12},(_,i)=>({id:'training-'+String(i).padStart(3,'0'),date:'2026-09-'+String(i+19).padStart(2,'0'),exercise:'臥推',weight:20+i,reps:10,sets:3,note:'',createdAt:1,updatedAt:1}));
  records.push({...records[11],id:'training-extra',weight:35,reps:8,sets:2});
  records.push({...records[0],id:'training-other',exercise:'深蹲',weight:100});
  await TrainingStore.merge(records);
  return {volume:FitnessMetrics.round(records.reduce((s,r)=>s+r.weight*r.reps*r.sets,0)),lastVolume:31*30+35*16,sets:records.reduce((s,r)=>s+r.sets,0)};
 });
 await page.click('#progress-refresh');await page.waitForFunction(()=>document.querySelector('#progress-count').textContent.includes('訓練日'));await page.selectOption('#progress-exercise','臥推');
 assert.equal(await page.locator('#max-chart circle').count(),10);assert.equal(await page.locator('#volume-chart circle').count(),10);
 assert.match(await page.locator('#max-chart svg g').last().getAttribute('aria-label'),/2026-09-30：35 kg/);
 assert.match(await page.locator('#volume-chart svg g').last().getAttribute('aria-label'),new RegExp(expected.lastVolume.toLocaleString('zh-TW')+' kg'));
 await page.screenshot({path:path.join(out,'v19-progress-mobile.png'),fullPage:true});
 // Weight CRUD, one-per-day, date range, newest-first, local persistence and backup.
 await page.goto(base+'/bodyweight.html');await page.waitForFunction(()=>!document.querySelector('#weight-fields').disabled);
 const a=await page.inputValue('#weight-start'),b=await page.inputValue('#weight-end');assert.equal((Date.parse(b)-Date.parse(a))/86400000,6);
 async function save(date,kg){await page.fill('#weight-date',date);await page.fill('#weight-kg',String(kg));await page.click('#weight-save');await page.waitForFunction(()=>!document.querySelector('#weight-fields').disabled)}
 await save('2026-09-01',80);await save('2026-09-30',78.5);await save(b,78.2);await save(b,78.3);
 assert.equal(await page.locator('.weight-row').count(),3);assert.match(await page.locator('.weight-row').first().innerText(),/78.3 kg/);
 await page.reload();await page.waitForSelector('.weight-row');assert.equal(await page.locator('.weight-row').count(),3);
 await page.fill('#weight-start','2026-09-01');await page.fill('#weight-end','2026-09-30');assert.equal(await page.locator('#weight-chart circle').count(),2);
 await page.fill('#weight-start','2026-10-01');assert.match(await page.locator('#weight-chart').innerText(),/開始日不可晚於/);
 await page.fill('#weight-start','2026-09-01');await page.locator('.weight-row').first().getByRole('button',{name:'修改'}).click();assert(await page.locator('#weight-date').isDisabled());await page.fill('#weight-kg','78.4');await page.click('#weight-save');await page.waitForFunction(()=>!document.querySelector('#weight-fields').disabled);
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'v19-bodyweight-mobile.png'),fullPage:true});
 await page.locator('details').last().locator('summary').click();const downloading=page.waitForEvent('download');await page.click('#weight-export');const weightBackup=JSON.parse(fs.readFileSync(await(await downloading).path(),'utf8'));assert.equal(weightBackup.records.length,3);
 await page.setInputFiles('#weight-file',{name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(weightBackup))});await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('略過 3'));
 const bad=structuredClone(weightBackup);bad.records[0].kg=-1;await page.setInputFiles('#weight-file',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('匯入失敗'));assert.equal(await page.evaluate(async()=>(await FitnessStore.weights()).length),3);
 const conflict=await page.evaluate(async()=>{const old=(await FitnessStore.weights())[0];await FitnessStore.saveWeight({...old,updatedAt:old.updatedAt+1},old.updatedAt);try{await FitnessStore.saveWeight({...old,kg:90,updatedAt:old.updatedAt+2},old.updatedAt);return false}catch{return true}});assert(conflict);
 // Failed attendance cannot grant a card. Successful attendance grants September exactly once.
 await page.goto(base+'/index.html?presence_token=abcdefghijklmnop123456');await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled);
 await page.evaluate(()=>{localStorage.setItem('__test_now','2026-10-05T01:00:00Z');localStorage.setItem('__test_rpc_error','gym_check_in_with_presence')});await page.click('#check-in-button');await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('簽到失敗'));
 assert.equal(await page.evaluate(async id=>(await FitnessStore.cards(id)).length,uid),0);
 await page.evaluate(()=>localStorage.removeItem('__test_rpc_error'));await page.click('#check-in-button');await page.waitForSelector('.monthly-notice a');
 assert.match(await page.locator('.monthly-notice').innerText(),/2026-09 月度成果卡已收藏/);
 const card=await page.evaluate(async id=>(await FitnessStore.cards(id))[0],uid);assert.equal(card.month,'2026-09');assert.equal(card.summary.volume,expected.volume);assert.equal(card.summary.sets,expected.sets);assert.equal(card.summary.weightChange,-1.5);assert.equal(card.summary.trainingDays,12);
 await page.evaluate(async()=>{const old=(await FitnessStore.weights()).find(r=>r.date==='2026-09-30');await FitnessStore.saveWeight({...old,kg:77,updatedAt:old.updatedAt+1},old.updatedAt)});
 const repeat=await page.evaluate(async id=>{const app={session:{user:{id}},profile:{display_name:'測試使用者'}},payload=JSON.parse(localStorage.getItem('__test_sessions'))[0];return MonthlyCards.ensure(app,payload)},uid);assert.equal(repeat.created,false);assert.equal(repeat.card.summary.weightChange,-1.5);
 await page.goto(base+'/monthly.html?month=2026-09');await page.waitForSelector('.monthly-art');await page.screenshot({path:path.join(out,'v19-monthly-mobile.png'),fullPage:true});
 const pngPromise=page.waitForEvent('download');await page.getByRole('button',{name:'下載成果卡 PNG'}).click();const png=await pngPromise;fs.copyFileSync(await png.path(),path.join(out,'v19-monthly-sample.png'));const bytes=fs.readFileSync(await png.path());assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),1440);
 // Snapshot is immutable, monthly page is read-only; backup isolates accounts.
 assert(!await page.evaluate(()=>__calls.some(c=>c.rpc||c.table==='attendance_sessions')));
 await page.locator('details summary').click();const jsonPromise=page.waitForEvent('download');await page.click('#monthly-export');const backup=JSON.parse(fs.readFileSync(await(await jsonPromise).path(),'utf8'));
 await page.setInputFiles('#monthly-file',{name:'cards.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('略過 1'));
 await page.evaluate(id=>localStorage.setItem('__test_user',id),other);await page.reload();await page.waitForFunction(()=>document.querySelector('#monthly-count').textContent==='0 張收藏');
 await page.setInputFiles('#monthly-file',{name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('匯入失敗'));
 await page.evaluate(id=>localStorage.setItem('__test_user',id),uid);await page.goto(base+'/index.html');await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled);
 // Concurrent tabs generate a single snapshot for the next month; empty months are explicit.
 const tab=await context.newPage();await tab.goto(base+'/index.html');await tab.waitForFunction(()=>!document.querySelector('#refresh-button').disabled);
 const data={id:'33333333-3333-4333-8333-333333333333',user_id:uid,checked_in_at:'2026-10-31T16:01:00Z',checked_out_at:null};
 const invoke=d=>MonthlyCards.ensure({session:{user:{id:d.user_id}},profile:{display_name:'測試使用者'}},d);
 const race=await Promise.all([page.evaluate(invoke,data),tab.evaluate(invoke,data)]);assert.deepEqual(race.map(r=>r.created).sort(),[false,true]);assert.equal(race[0].card.month,'2026-10');assert.equal(race[0].card.summary.weightChange,null);await tab.close();
 const pure=await page.evaluate(()=>({jan:FitnessMetrics.previousMonth('2027-01-01'),leap:FitnessMetrics.previousMonth('2024-03-01'),empty:FitnessMetrics.summary('2026-08',[],[],[])}));assert.equal(pure.jan,'2026-12');assert.equal(pure.leap,'2024-02');assert.equal(pure.empty.weightChange,null);assert.equal(pure.empty.volume,0);
 // Local failure leaves successful attendance unchanged; retry creates only local card.
 await page.evaluate(async d=>{window.realAdd=FitnessStore.addCard;FitnessStore.addCard=async()=>{throw Error('測試空間不足')};await MonthlyCards.afterCheckIn({session:{user:{id:d.user_id}},profile:{}},{...d,checked_in_at:'2026-12-01T01:00:00Z'})},data);assert.match(await page.locator('.monthly-notice').innerText(),/簽到已成功，但月度卡尚未完成/);
 const rpcBefore=await page.evaluate(()=>__calls.filter(c=>c.rpc).length);await page.evaluate(()=>{FitnessStore.addCard=window.realAdd});await page.getByRole('button',{name:'重試產生月度卡'}).click();await page.waitForSelector('.monthly-notice a');assert.equal(await page.evaluate(()=>__calls.filter(c=>c.rpc).length),rpcBefore);
 for(const url of ['progress.html','bodyweight.html','monthly.html']){
  await page.goto(base+'/'+url);await page.waitForTimeout(250);for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+url+' '+width)}
 }
 await page.screenshot({path:path.join(out,'v19-monthly-desktop.png'),fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await browser.close();console.log('PASS v19: latest 10 dates, max/volume, weight CRUD/range/backup/conflict, monthly sign-in trigger/failure/dedup/account isolation/race/PNG/snapshots, timezone/year rollover, zero feature network calls, responsive layout.');
})().catch(e=>{console.error(e);process.exit(1)});
