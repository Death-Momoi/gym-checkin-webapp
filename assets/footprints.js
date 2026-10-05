(async function () {
  'use strict';
  const $ = id=>document.getElementById(id), store=window.FootprintsStore;
  const params=new URLSearchParams(location.search), kind=params.get('view')==='out'?'out':'in';
  document.body.dataset.page=kind==='in'?'stampbook':'checkoutcards';
  const app=await GymApp.init(); if(!app)return;
  store.configure(app);
  const userId=app.session.user.id, name=GymApp.profileName(app.profile,app.session);
  let rows=[],limit=12,busy=false,accountChanged=false;
  // Register before the initial request so an account change cannot reveal stale results.
  app.client.auth.onAuthStateChange((_event,session)=>{
    if(session?.user?.id!==userId){
      accountChanged=true;store.invalidate();rows=[];
      $('footprints-content').classList.add('hidden');document.getElementById('stamp-dialog')?.close();
      if(session)window.location.replace('./index.html');
    }
  });
  $('footprints-owner').textContent=`${name} · 每天一個到訪章，一張簽退成果卡。`;
  $('tab-'+kind).setAttribute('aria-current','page');
  $('footprints-month').value=/^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month')||'')&&Number(params.get('month').slice(0,4))>=1970&&Number(params.get('month').slice(0,4))<=9998?params.get('month'):GymApp.taipeiDateString().slice(0,7);
  $('stamp-calendar-section').classList.toggle('hidden',kind!=='in');$('checkout-cards-section').classList.toggle('hidden',kind!=='out');
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  function render() {
    const month=$('footprints-month').value, selected=rows.filter(r=>r.kind===kind&&r.date.startsWith(month)).sort((a,b)=>b.date.localeCompare(a.date));
    $('month-count').textContent=selected.length;
    $('total-count').textContent=rows.filter(r=>r.kind===kind).length;
    $('month-count-label').textContent=kind==='in'?'本月到訪天數':'本月完成簽退天數';$('total-count-label').textContent=kind==='in'?'累積到訪天數':'累積完成簽退天數';
    $('footprints-rule').textContent=kind==='in'?'每天只蓋一次，點選有印章的日期即可回顧。':'每天最多一張成果卡，顯示雲端當天第一次完成簽退的內容。';
    for(const k of ['in','out'])$('tab-'+k).href=`./footprints.html?view=${k}&month=${month}`;
    if(kind==='in') {
      const calendar=$('stamp-calendar');calendar.replaceChildren();
      const [year,m]=month.split('-').map(Number), start=new Date(Date.UTC(year,m-1,1));
      const offset=(start.getUTCDay()+6)%7, count=new Date(Date.UTC(year,m,0)).getUTCDate();
      for(let i=0;i<offset;i++){const blank=el('div');blank.setAttribute('aria-hidden','true');calendar.append(blank);}
      for(let n=1;n<=count;n++) {
        const date=`${month}-${String(n).padStart(2,'0')}`, entry=selected.find(r=>r.date===date);
        const cell=el(entry?'button':'div',undefined,`stamp-day${entry?' stamped':''}${date===GymApp.taipeiDateString()?' is-today':''}`);
        cell.append(el('span',String(n)),el('strong',entry?'✓':'·'));
        if(entry){cell.type='button';cell.setAttribute('aria-label',`${date} 到訪章，查看紀錄`);cell.onclick=()=>FootprintsUI.review(entry,rows,name);}
        else cell.setAttribute('aria-label',`${date} 未集章`);
        calendar.append(cell);
      }
      $('stamp-empty').classList.toggle('hidden',selected.length>0);
    }else {
      const list=$('checkout-cards');list.replaceChildren();
      if(!selected.length)list.append(el('p','本月還沒有成果卡。雲端尚未有此月份已完成簽退的紀錄。','card training-empty'));
      selected.slice(0,limit).forEach(entry=>{
        const item=el('article',undefined,'card checkout-mini-card');
        const top=el('div',undefined,'training-heading');top.append(el('h3',entry.date),el('span','✓ 已完成','checkout-label'));item.append(top);
        const stats=store.stats(rows,'out',entry.date);
        item.append(el('p',`截至這天，本月已完成 ${stats.month} 天`,'checkout-mini-title'),el('p',`首次簽退 ${GymApp.formatTime(entry.at)} · 停留 ${FootprintsUI.duration(entry)}`,'hint'));
        if(entry.checkoutMethod==='assisted')item.append(el('p','由他人協助簽退','hint'));
        const button=el('button','查看這天的成果','secondary-button');button.type='button';button.onclick=()=>FootprintsUI.review(entry,rows,name);item.append(button);list.append(item);
      });
      $('checkout-more').classList.toggle('hidden',limit>=selected.length);
    }
  }
  async function refresh() {rows=await store.all(userId);render();}
  function selectMonth(value) {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)||Number(value.slice(0,4))<1970||Number(value.slice(0,4))>9998) {
      $('footprints-month').value=GymApp.taipeiDateString().slice(0,7);GymApp.setMessage('請選擇有效月份。','error');
    }
    limit=12;render();
    history.replaceState(null,'',`./footprints.html?view=${kind}&month=${$('footprints-month').value}`);
  }
  $('footprints-month').addEventListener('change',()=>selectMonth($('footprints-month').value));
  for(const [id,delta] of [['month-prev',-1],['month-next',1]])$(id).onclick=()=>{
    const [y,m]=$('footprints-month').value.split('-').map(Number), date=new Date(Date.UTC(y,m-1+delta,1));
    const year=date.getUTCFullYear();if(year<1970||year>9998)return;
    $('footprints-month').value=`${year}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;selectMonth($('footprints-month').value);
  };
  $('checkout-more').onclick=()=>{limit+=12;render();};
  async function loadCloud() {
    if(busy||accountChanged)return;
    busy=true;$('footprints-refresh').disabled=true;
    $('footprints-content').classList.add('hidden');
    document.getElementById('stamp-dialog')?.close();
    GymApp.setMessage('正在讀取此帳號的雲端簽到紀錄……');
    try {await refresh();if(!accountChanged){$('footprints-content').classList.remove('hidden');GymApp.hideMessage();}}
    catch(error){if(!accountChanged)GymApp.setMessage(error.message||'讀取失敗，請確認網路後重新讀取。','error');}
    finally{busy=false;$('footprints-refresh').disabled=false;}
  }
  $('footprints-refresh').onclick=loadCloud;
  await loadCloud();

})();
