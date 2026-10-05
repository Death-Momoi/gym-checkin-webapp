const assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const fs=require('node:fs'),path=require('node:path');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
const artifacts=process.env.TEST_ARTIFACT_DIR||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'gym-footprints-test-'));
const uid='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
// Test-only SDK. The production auth/attendance flow is executed against deterministic responses.
const sdk=`(()=>{
  const uid='${uid}', other='${other}';
  const state=()=>JSON.parse(localStorage.getItem('__test_sessions')||'[]');
  const save=s=>localStorage.setItem('__test_sessions',JSON.stringify(s));
  const active=()=>localStorage.getItem('__test_user')||uid;
  const session=()=>active()==='signed-out'?null:{user:{id:active(),email:'test@example.invalid',user_metadata:{full_name:active()===uid?'測試使用者':'另一位使用者'}},access_token:'test-only'};
  const profile=id=>({id,display_name:id===uid?'測試使用者':'另一位使用者',name_confirmed:true,status:'active',app_role:'member'});
  window.__calls=[];window.__authCallbacks=[];
  const client={auth:{
    getSession:async()=>({data:{session:session()},error:null}),
    onAuthStateChange:cb=>{window.__authCallbacks.push(cb);return {data:{subscription:{unsubscribe(){}}}}},
    signOut:async()=>{localStorage.setItem('__test_user','signed-out');window.__authCallbacks.forEach(cb=>cb('SIGNED_OUT',null));return {error:null}},
    signInWithOAuth:async()=>({error:null})
  },from(table){
    window.__calls.push({table});let ids=[];
    const q={select(){return q},eq(_k,id){ids=[id];return q},in(_k,v){ids=v;return q},is(){return q},
      single:async()=>({data:profile(ids[0]),error:null}),
      order:async()=>({data:state().filter(r=>!r.checked_out_at),error:null}),
      then(resolve,reject){return Promise.resolve({data:ids.map(profile),error:null}).then(resolve,reject)}
    };return q;
  },async rpc(name,args){
    window.__calls.push({rpc:name,args});
    if(localStorage.getItem('__test_rpc_error')===name)return {data:null,error:{message:'模擬伺服器拒絕'}};
    const now=localStorage.getItem('__test_now')||'2026-10-05T01:00:00.000Z';
    if(name==='presence_token_status')return {data:{is_valid:true,expires_at:new Date(Date.now()+60000).toISOString()},error:null};
    const s=state();let row=s.find(r=>r.user_id===active()&&!r.checked_out_at);
    if(name==='gym_check_in_with_presence'){
      if(!row){row={id:crypto.randomUUID(),user_id:active(),gym_role:args.requested_role,checked_in_at:now,checked_out_at:null,checked_out_by:null,checkout_method:null};s.push(row);save(s)}
      return {data:row,error:null};
    }
    if(name==='gym_check_out'){
      if(row){row.checked_out_at=now;row.checked_out_by=active();row.checkout_method='self';save(s)}
      else row=s.filter(r=>r.user_id===active()).at(-1);
      return {data:row,error:null};
    }
    return {data:null,error:{message:'unexpected RPC'}};
  }};
  window.supabase={createClient:()=>client};
})();`;
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-TW',timezoneId:'Asia/Taipei'});
  const page=await context.newPage(), errors=[], external=[];
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2'))return route.fulfill({contentType:'text/javascript',body:sdk});
    if(url.startsWith(base+'/'))return route.continue();
    external.push(url);return route.abort();
  });
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const gotoHome=async()=>{await page.goto(base+'/index.html?presence_token=abcdefghijklmnop123456');await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled);};
  const time=async value=>page.evaluate(v=>localStorage.setItem('__test_now',v),value);
  const all=()=>page.evaluate(id=>FootprintsStore.all(id),uid);
  const dismiss=async()=>{await page.locator('#stamp-dialog').getByRole('button',{name:'回到簽到／簽退',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled);};
  async function action(kind,value){await time(value);await page.click(kind==='in'?'#check-in-button':'#check-out-button');await page.waitForSelector('#stamp-dialog .stamp-seal');}
  await gotoHome();
  // Server failures cannot stamp.
  await page.evaluate(()=>localStorage.setItem('__test_rpc_error','gym_check_in_with_presence'));
  await page.click('#check-in-button');await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('簽到失敗'));
  assert.equal((await all()).length,0);assert.equal(await page.locator('#stamp-dialog').count(),0);
  await page.evaluate(()=>localStorage.removeItem('__test_rpc_error'));
  await action('in','2026-10-05T01:00:00.000Z');
  assert.match(await page.locator('#stamp-dialog').innerText(),/到訪認證/);assert.equal((await all()).length,1);
  await page.locator('.stamp-seal').evaluate(el=>el.getAnimations().forEach(a=>a.finish()));await page.screenshot({path:path.join(artifacts,'stamp-in-mobile.png')});await dismiss();
  // A failed checkout leaves the prior attendance open and creates no outcome.
  await page.evaluate(()=>localStorage.setItem('__test_rpc_error','gym_check_out'));
  await page.click('#check-out-button');await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('簽退失敗'));
  assert.equal((await all()).length,1);await page.evaluate(()=>localStorage.removeItem('__test_rpc_error'));
  await action('out','2026-10-05T02:15:00.000Z');
  assert.match(await page.locator('#stamp-dialog').innerText(),/1 小時 15 分鐘/);assert.equal((await all()).length,2);
  await page.locator('.stamp-seal').evaluate(el=>el.getAnimations().forEach(a=>a.finish()));await page.screenshot({path:path.join(artifacts,'stamp-out-mobile.png')});await dismiss();
  // Same-day additional sessions do not add either stamp or overwrite first checkout content.
  await gotoHome();await action('in','2026-10-05T05:00:00.000Z');assert.match(await page.locator('#stamp-dialog h1').innerText(),/今天已蓋過章/);await dismiss();
  await action('out','2026-10-05T05:30:00.000Z');assert.match(await page.locator('#stamp-dialog h1').innerText(),/今天已蓋過章/);
  assert.equal((await all()).length,2);assert.match(await page.locator('#stamp-dialog').innerText(),/1 小時 15 分鐘/);await dismiss();
  // Cross-midnight timestamps follow Taiwan, not UTC or browser clock.
  await gotoHome();await action('in','2026-10-05T15:55:00.000Z');assert.equal((await all()).length,2);await dismiss();
  await action('out','2026-10-05T16:05:00.000Z');
  let rows=await all();assert.equal(rows.length,3);assert(rows.some(r=>r.kind==='out'&&r.date==='2026-10-06'));
  assert.match(await page.locator('#stamp-dialog').innerText(),/10 分鐘/);await dismiss();
  // Local write failure keeps backend success; retry stores without another RPC.
  await gotoHome();
  await page.evaluate(()=>{window.realRecord=FootprintsStore.record;FootprintsStore.record=async()=>{throw new Error('測試：手機空間不足')};});
  await time('2026-10-06T01:00:00.000Z');await page.click('#check-in-button');
  await page.waitForSelector('#stamp-dialog .message.error');assert.match(await page.locator('#stamp-dialog h1').innerText(),/簽到已成功/);
  assert.equal(await page.locator('#stamp-dialog .stamp-seal').count(),0);
  const beforeRPC=await page.evaluate(()=>window.__calls.filter(c=>c.rpc==='gym_check_in_with_presence').length);
  await page.evaluate(()=>{FootprintsStore.record=window.realRecord;});await page.getByRole('button',{name:'重試儲存印章'}).click();
  await page.waitForSelector('#stamp-dialog .stamp-seal');assert.equal((await all()).length,4);
  assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.rpc==='gym_check_in_with_presence').length),beforeRPC);await dismiss();
  // Unique key transaction prevents races across tabs.
  const data={id:'33333333-3333-4333-8333-333333333333',user_id:uid,checked_in_at:'2026-10-07T01:00:00.000Z',checked_out_at:null};
  const tab=await context.newPage();await tab.goto(base+'/training.html');await tab.addScriptTag({url:base+'/assets/footprints-store.js'});
  const raced=await Promise.all([page.evaluate(d=>FootprintsStore.record(d.user_id,'in',d),data),tab.evaluate(d=>FootprintsStore.record(d.user_id,'in',d),data)]);
  assert.deepEqual(raced.map(r=>r.duplicate).sort(),[false,true]);await tab.close();
  const rejected=await page.evaluate(async d=>{
    let n=0;
    for(const payload of [{...d,user_id:'${other}'},{...d,checked_out_at:'2026-10-07T02:00:00Z',checked_out_by:'${other}',checkout_method:'assisted'}]){
      try{await FootprintsStore.record(d.user_id,'out',payload);}catch{n++}
    }return n;
  },data);assert.equal(rejected,2);
  // Both review tabs share one navigation category, and viewing cannot stamp.
  const count=(await all()).length;
  await page.goto(base+'/footprints.html?view=in&month=2026-10');await page.waitForSelector('#footprints-content:not(.hidden)');
  assert.equal(await page.locator('#month-count').innerText(),'3');
  assert.equal(await page.locator('#drawer-subnav-footprints a').count(),2);
  assert.deepEqual(await page.evaluate(()=>window.__calls.filter(c=>c.rpc||c.table==='attendance_sessions')),[]);
  await page.evaluate(()=>{FootprintsStore.record=()=>{throw new Error('Review must not write')}});
  await page.locator('#stamp-calendar button').first().click();assert.match(await page.locator('#stamp-dialog h1').innerText(),/這天，我來了/);
  await page.getByRole('button',{name:'關閉回顧'}).click();assert.equal((await all()).length,count);
  await page.screenshot({path:path.join(artifacts,'stampbook-mobile.png'),fullPage:true});
  await page.click('#tab-out');await page.waitForSelector('#footprints-content:not(.hidden)');
  assert.equal(await page.locator('#month-count').innerText(),'2');assert.equal(await page.locator('.checkout-mini-card').count(),2);
  await page.locator('.checkout-mini-card button').first().click();assert.match(await page.locator('#stamp-dialog').innerText(),/本月完成簽退\s*2 天/);
  await page.getByRole('button',{name:'關閉回顧'}).click();assert.equal((await all()).length,count);
  await page.screenshot({path:path.join(artifacts,'checkout-history-mobile.png'),fullPage:true});
  // Backup deduplication and account separation.
  const backup=await page.evaluate(async id=>({format:'gym-footprints-backup',version:1,userId:id,stamps:await FootprintsStore.all(id)}),uid);
  await page.locator('.footprints-backup summary').click();
  const downloadEvent=page.waitForEvent('download');await page.click('#footprints-export');const download=await downloadEvent;
  assert.equal(JSON.parse(fs.readFileSync(await download.path(),'utf8')).stamps.length,count);
  await page.setInputFiles('#footprints-file',{name:'footprints.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('已新增 0 個'));
  const malformed=structuredClone(backup);malformed.stamps[0].date='2026-02-31';
  await page.setInputFiles('#footprints-file',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malformed))});
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('匯入未完成'));assert.equal((await all()).length,count);
  await page.evaluate(id=>localStorage.setItem('__test_user',id),other);await page.reload();await page.waitForSelector('#footprints-content:not(.hidden)');
  assert.equal(await page.locator('#total-count').innerText(),'0');assert.equal(await page.locator('.checkout-mini-card').count(),0);
  await page.setInputFiles('#footprints-file',{name:'wrong-account.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('同一 Google 帳號'));
  assert.equal(await page.evaluate(id=>FootprintsStore.all(id).then(r=>r.length),other),0);
  // Auth change hides the old account's personal view.
  await page.evaluate(()=>{localStorage.setItem('__test_user','signed-out');window.__authCallbacks.forEach(cb=>cb('SIGNED_OUT',null));});
  await page.waitForURL('**/index.html');await page.waitForSelector('#signed-out-card:not(.hidden)');
  await page.evaluate(id=>localStorage.setItem('__test_user',id),uid);
  await page.goto(base+'/footprints.html?view=in&month=2026-10');await page.waitForSelector('#footprints-content:not(.hidden)');
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
  }
  await page.screenshot({path:path.join(artifacts,'stampbook-desktop.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: RPC failures do not stamp; check-in/out receipts; daily dedup; preserve first checkout; Taiwan midnight; local failure/retry without new RPC; cross-tab race; reject assisted/mismatched events; review no writes/history queries; shared menu; backup/dedup/invalid input/account isolation/sign-out; mobile layout 320–1280.');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
