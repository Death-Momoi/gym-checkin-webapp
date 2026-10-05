const assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
const artifacts=process.env.TEST_ARTIFACT_DIR||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'gym-footprints-test-'));
const uid='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
// Shared test server across fresh browser contexts. No production requests or writes.
const server={rows:[],now:'2026-10-05T01:00:00.000Z',calls:[],failRPC:null,failReadAt:null,cap:1000};
const sdk=`(()=>{
 const uid='${uid}';
 const active=()=>localStorage.getItem('__test_user')||uid;
 const session=()=>active()==='signed-out'?null:{user:{id:active(),email:'test@example.invalid',user_metadata:{full_name:'測試使用者'}},access_token:'test-only'};
 window.__authCallbacks=[];
 const client={auth:{getSession:async()=>({data:{session:session()},error:null}),onAuthStateChange:cb=>{__authCallbacks.push(cb);return {data:{subscription:{unsubscribe(){}}}}},signInWithOAuth:async()=>({error:null})},
 from(table){const request={table,filters:[],orders:[]};const q={select(fields,options){request.fields=fields;request.options=options;return q},eq(k,v){request.filters.push(['eq',k,v]);return q},in(k,v){request.filters.push(['in',k,v]);return q},is(k,v){request.filters.push(['is',k,v]);return q},order(k,v){request.orders.push([k,v]);return q},range(a,b){request.range=[a,b];return q},single(){request.single=true;return q},then(resolve,reject){return window.__server(request).then(resolve,reject)}};return q},
 rpc(name,args){return window.__server({rpc:name,args,user:active()})}};
 window.__client=client;window.supabase={createClient:()=>client};
})();`;
function response(req){
 server.calls.push(structuredClone(req));
 if(req.rpc){
  if(req.rpc===server.failRPC)return {error:{message:'模擬伺服器拒絕'},data:null};
  if(req.rpc==='presence_token_status')return {data:{is_valid:true,expires_at:new Date(Date.now()+60000).toISOString()},error:null};
  let row=server.rows.find(r=>r.user_id===req.user&&!r.checked_out_at);
  if(req.rpc==='gym_check_in_with_presence'){
   if(!row){row={id:crypto.randomUUID(),user_id:req.user,gym_role:req.args.requested_role,checked_in_at:server.now,checked_out_at:null,checked_out_by:null,checkout_method:null};server.rows.push(row)}
  }else if(req.rpc==='gym_check_out'){
   if(row){row.checked_out_at=server.now;row.checked_out_by=req.user;row.checkout_method='self'}else row=server.rows.filter(r=>r.user_id===req.user).at(-1);
  }else throw new Error('Unexpected RPC '+req.rpc);
  return {data:structuredClone(row),error:null};
 }
 let rows=req.table==='profiles'?[uid,other].map(id=>({id,display_name:'測試使用者',name_confirmed:true,status:'active',app_role:'member'})):server.rows;
 for(const [op,k,v] of req.filters)rows=rows.filter(r=>op==='in'?v.includes(r[k]):r[k]===v);
 rows=[...rows];
 for(const [k,opt] of [...req.orders].reverse())rows.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(opt.ascending?1:-1));
 const count=rows.length;
 if(req.range){
  assert(req.filters.some(f=>f[0]==='eq'&&f[1]==='user_id'),'Personal request missing account filter');
  if(server.failReadAt!==null&&req.range[0]>=server.failReadAt)return {data:null,error:{message:'模擬雲端讀取失敗'}};
  rows=rows.slice(req.range[0],Math.min(req.range[1]+1,req.range[0]+server.cap));
 }
 return {data:structuredClone(req.single?rows[0]:rows),error:null,count:req.options?.count==='exact'?count:null};
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 const errors=[],external=[];
 async function fresh(){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-TW',timezoneId:'Asia/Taipei'});
  await context.exposeBinding('__server',(_source,req)=>response(req));
  await context.route('**/*',route=>{
   const url=route.request().url();
   if(url.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2'))return route.fulfill({contentType:'text/javascript',body:sdk});
   if(url.startsWith(base+'/'))return route.continue();external.push(url);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());return {context,page};
 }
 const {context,page}=await fresh();
 const gotoHome=async()=>{await page.goto(base+'/index.html?presence_token=abcdefghijklmnop123456');await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled)};
 const all=()=>page.evaluate(id=>{FootprintsStore.configure({client:__client,session:{user:{id}}});return FootprintsStore.all(id)},uid);
 const dismiss=async()=>{await page.locator('#stamp-dialog').getByRole('button',{name:'回到簽到／簽退',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled)};
 async function action(kind,value){server.now=value;await page.click(kind==='in'?'#check-in-button':'#check-out-button');await page.waitForSelector('#stamp-dialog .stamp-seal')}
 await gotoHome();server.failRPC='gym_check_in_with_presence';await page.click('#check-in-button');await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('簽到失敗'));
 assert.equal((await all()).length,0);assert.equal(await page.locator('#stamp-dialog').count(),0);server.failRPC=null;
 await action('in','2026-10-05T01:00:00.000Z');assert.equal((await all()).length,1);
 await page.locator('.stamp-seal').evaluate(el=>el.getAnimations().forEach(a=>a.finish()));await page.screenshot({path:path.join(artifacts,'stamp-in-mobile.png')});await dismiss();
 server.failRPC='gym_check_out';await page.click('#check-out-button');await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('簽退失敗'));assert.equal((await all()).length,1);server.failRPC=null;
 await action('out','2026-10-05T02:15:00.000Z');assert.match(await page.locator('#stamp-dialog').innerText(),/1 小時 15 分鐘/);assert.equal((await all()).length,2);
 await page.locator('.stamp-seal').evaluate(el=>el.getAnimations().forEach(a=>a.finish()));await page.screenshot({path:path.join(artifacts,'stamp-out-mobile.png')});await dismiss();
 await gotoHome();await action('in','2026-10-05T05:00:00.000Z');assert.match(await page.locator('#stamp-dialog h1').innerText(),/今天已蓋過章/);await dismiss();
 await action('out','2026-10-05T05:30:00.000Z');assert.equal((await all()).length,2);assert.match(await page.locator('#stamp-dialog').innerText(),/1 小時 15 分鐘/);await dismiss();
 await gotoHome();await action('in','2026-10-05T15:55:00.000Z');await dismiss();await action('out','2026-10-05T16:05:00.000Z');assert.equal((await all()).length,3);assert.match(await page.locator('#stamp-dialog').innerText(),/10 分鐘/);await dismiss();
 // A read failure cannot undo a committed attendance or trigger a duplicate RPC on retry.
 await gotoHome();server.failReadAt=0;server.now='2026-10-06T01:00:00.000Z';await page.click('#check-in-button');await page.waitForSelector('#stamp-dialog .message.error');
 assert.match(await page.locator('#stamp-dialog h1').innerText(),/簽到已成功/);
 const rpcCount=server.calls.filter(c=>c.rpc==='gym_check_in_with_presence').length;
 server.failReadAt=null;await page.getByRole('button',{name:'重新讀取成果',exact:true}).click();await page.waitForSelector('#stamp-dialog .stamp-seal');assert.equal((await all()).length,4);
 assert.equal(server.calls.filter(c=>c.rpc==='gym_check_in_with_presence').length,rpcCount);await dismiss();
 // Historical records and assisted checkout are visible on a brand-new device.
 server.rows.push({id:'historic',user_id:uid,checked_in_at:'2026-10-01T01:00:00Z',checked_out_at:'2026-10-01T03:00:00Z',checked_out_by:other,checkout_method:'assisted'});
 server.rows.push({id:'other-only',user_id:other,checked_in_at:'2026-10-02T01:00:00Z',checked_out_at:null});
 const second=await fresh();await second.page.goto(base+'/footprints.html?view=out&month=2026-10');await second.page.waitForSelector('#footprints-content:not(.hidden)');assert.equal(await second.page.locator('#month-count').innerText(),'3');assert.match(await second.page.locator('#checkout-cards').innerText(),/由他人協助簽退/);await second.context.close();
 server.calls=[];await page.goto(base+'/footprints.html?view=in&month=2026-10');await page.waitForSelector('#footprints-content:not(.hidden)');assert.equal(await page.locator('#month-count').innerText(),'3');assert.equal(await page.locator('#drawer-subnav-footprints a').count(),2);
 await page.locator('#stamp-calendar button').first().click();await page.getByRole('button',{name:'關閉回顧'}).click();assert(!server.calls.some(c=>c.rpc));
 const reads=server.calls.length;await page.click('#month-prev');await page.click('#month-next');assert.equal(server.calls.length,reads);
 await page.screenshot({path:path.join(artifacts,'stampbook-mobile.png'),fullPage:true});await page.click('#tab-out');await page.waitForSelector('#footprints-content:not(.hidden)');await page.screenshot({path:path.join(artifacts,'checkout-history-mobile.png'),fullPage:true});
 // Cloud corrections update the projection; no local import or stamp database exists.
 server.rows=server.rows.filter(r=>r.id!=='historic');await page.click('#footprints-refresh');await page.waitForSelector('#footprints-content:not(.hidden)');assert.equal(await page.locator('#month-count').innerText(),'2');
 assert.deepEqual(await page.evaluate(async()=>({dbs:(await indexedDB.databases()).map(d=>d.name),keys:Object.keys(localStorage)})),{dbs:[],keys:[]});
 // More than 1000 records, plus a server page cap below requested range.
 const original=structuredClone(server.rows);
 server.rows=Array.from({length:1005},(_,i)=>({id:'history-'+String(i).padStart(4,'0'),user_id:uid,checked_in_at:new Date(Date.UTC(2020,0,1+i,1)).toISOString(),checked_out_at:null}));server.cap=317;server.calls=[];
 await page.click('#footprints-refresh');await page.waitForSelector('#footprints-content:not(.hidden)');
 await page.click('#tab-in');await page.waitForSelector('#footprints-content:not(.hidden)');assert.equal(await page.locator('#total-count').innerText(),'1005');
 assert.deepEqual(server.calls.filter(c=>c.range).slice(0,4).map(c=>c.range[0]),[0,317,634,951]);
 server.failReadAt=317;await page.click('#footprints-refresh');await page.waitForSelector('#message.error');assert(await page.locator('#footprints-content').evaluate(e=>e.classList.contains('hidden')));
 server.failReadAt=null;server.rows=original;server.cap=1000;await page.click('#footprints-refresh');await page.waitForSelector('#footprints-content:not(.hidden)');
 // Absolute-time sorting, Taiwan date boundary, and owner rejection.
 const pure=await page.evaluate(id=>{
  const row=(key,time)=>({id:key,user_id:id,checked_in_at:time,checked_out_at:null});
  const result=FootprintsStore.aggregate([row('late','2026-10-01T02:00:00Z'),row('early','2026-10-01T09:00:00+08:00')],id);
  let rejects=false;try{FootprintsStore.aggregate([row('bad','2026-10-01T01:00:00Z')],'different')}catch{rejects=true}
  return {earliest:result[0].sessionId,date:FootprintsStore.dateKey('2026-10-01T16:01:00Z'),rejects};
 },uid);assert.deepEqual(pure,{earliest:'early',date:'2026-10-02',rejects:true});
 await page.evaluate(id=>localStorage.setItem('__test_user',id),other);await page.reload();await page.waitForSelector('#footprints-content:not(.hidden)');assert.equal(await page.locator('#total-count').innerText(),'1');
 await page.evaluate(()=>{localStorage.setItem('__test_user','signed-out');__authCallbacks.forEach(cb=>cb('SIGNED_OUT',null))});await page.waitForURL('**/index.html');await page.waitForSelector('#signed-out-card:not(.hidden)');
 await page.evaluate(id=>localStorage.setItem('__test_user',id),uid);await page.goto(base+'/footprints.html?view=in&month=2026-10');await page.waitForSelector('#footprints-content:not(.hidden)');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width)}
 await page.screenshot({path:path.join(artifacts,'stampbook-desktop.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await browser.close();
 console.log('PASS: cloud read-only history, cross-device, account isolation, daily dedup, Taiwan midnight, earliest checkout, assisted checkout, pagination >1000/server cap, partial-read errors, retry without RPC, cloud corrections, no local stamps, shared navigation, responsive layout.');
})().catch(e=>{console.error(e);process.exit(1)});
