(async function () {
  'use strict';
  const $ = id=>document.getElementById(id), store=window.FootprintsStore;
  const params=new URLSearchParams(location.search), kind=params.get('view')==='out'?'out':'in';
  document.body.dataset.page=kind==='in'?'stampbook':'checkoutcards';
  const app=await GymApp.init(); if(!app)return;
  const userId=app.session.user.id, name=GymApp.profileName(app.profile,app.session);
  let rows=[],limit=12,busy=false;
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
    $('footprints-rule').textContent=kind==='in'?'每天只蓋一次，點選有印章的日期即可回顧。':'每天最多一張成果卡，保留當天第一次本人簽退的內容。';
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
      if(!selected.length)list.append(el('p','本月還沒有成果卡。下次本人簽退成功，就會在這裡留下紀錄。','card training-empty'));
      selected.slice(0,limit).forEach(entry=>{
        const item=el('article',undefined,'card checkout-mini-card');
        const top=el('div',undefined,'training-heading');top.append(el('h3',entry.date),el('span','✓ 已完成','checkout-label'));item.append(top);
        const stats=store.stats(rows,'out',entry.date);
        item.append(el('p',`截至這天，本月已完成 ${stats.month} 天`,'checkout-mini-title'),el('p',`首次簽退 ${GymApp.formatTime(entry.at)} · 停留 ${FootprintsUI.duration(entry)}`,'hint'));
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
  $('footprints-export').onclick=async()=>{
    if(busy)return;
    try {
      const stamps=await store.all(userId), data={format:'gym-footprints-backup',version:1,userId,exportedAt:new Date().toISOString(),stamps};
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const a=el('a');a.href=url;a.download=`健身足跡_${GymApp.taipeiDateString()}_${Date.now()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      GymApp.setMessage(`已產生 ${stamps.length} 個印章的備份，請確認手機下載完成。`,'success');
    }catch(error){GymApp.setMessage(`無法備份：${error.message}`,'error');}
  };
  $('footprints-import').onclick=()=>$('footprints-file').click();
  $('footprints-file').onchange=async event=>{
    const file=event.target.files[0];event.target.value='';if(!file||busy)return;
    busy=true;$('footprints-import').disabled=true;$('footprints-export').disabled=true;
    try{
      if(file.size>20*1024*1024)throw new Error('檔案超過 20 MB。');
      const parsed=store.parseBackup(JSON.parse(await file.text()),userId);
      if(!confirm(`合併 ${parsed.length} 個本帳號印章？相同日期及類型會保留手機原有紀錄。`))return;
      const result=await store.merge(userId,parsed);await refresh();
      GymApp.setMessage(`已新增 ${result.added} 個印章，保留 ${result.skipped} 個現有印章。`,'success');
    }catch(error){GymApp.setMessage(`匯入未完成：${error.message}`,'error');}
    finally{busy=false;$('footprints-import').disabled=false;$('footprints-export').disabled=false;}
  };
  try {await refresh();$('footprints-content').classList.remove('hidden');GymApp.hideMessage();}
  catch(error){GymApp.setMessage(`讀取本機足跡失敗：${error.message}。請確認瀏覽器允許儲存資料後重新整理。`,'error');}
  // Do not keep a previous user's cards visible after an account change in another tab.
  app.client.auth.onAuthStateChange((_event,session)=>{
    if(session?.user?.id!==userId){$('footprints-content').classList.add('hidden');document.getElementById('stamp-dialog')?.close();if(session)window.location.replace('./index.html');}
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy)refresh().catch(()=>GymApp.setMessage('無法更新本機足跡，請重新整理。','error'));});
})();
