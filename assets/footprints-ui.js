(function () {
  'use strict';
  const store = window.FootprintsStore;
  const el = (tag,text,cls) => { const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e; };
  function duration(entry) {
    const minutes = Math.floor((Date.parse(entry.checkedOutAt)-Date.parse(entry.checkedInAt))/60000);
    if(minutes < 1)return '不到 1 分鐘';
    return minutes >= 60 ? `${Math.floor(minutes/60)} 小時 ${minutes%60} 分鐘` : `${minutes} 分鐘`;
  }
  function card(entry,rows,{name='',duplicate=false,review=false}={}) {
    const isIn=entry.kind==='in', section=el('section',undefined,`stamp-card stamp-${entry.kind}`);
    section.append(el('p',review?'MY FITNESS JOURNAL · 回顧':isIn?'CHECK IN · 每天一個到訪章':'CHECK OUT · 每天一張成果卡','stamp-eyebrow'));
    section.append(el('h1',review?(isIn?'這天，我來了':'這天的簽退成果'):duplicate?'今天已蓋過章囉':isIn?'今天的努力，從到場開始':'今天完成，收下你的成果'));
    section.append(el('p',`${name ? name+' · ' : ''}${entry.date}`,'stamp-owner'));
    const seal=el('div',undefined,`stamp-seal${!review&&!duplicate?' stamp-land':''}`);
    seal.append(el('span',isIn?'✓':'★','stamp-symbol'),el('strong',isIn?'到訪認證':'簽退完成'),el('small',entry.date));
    section.append(seal);
    const stats=store.stats(rows,entry.kind,entry.date), grid=el('dl',undefined,'stamp-stats');
    for(const [label,value] of [['本週',stats.week],['本月',stats.month],['累積',stats.total]]) {
      const item=el('div');item.append(el('dt',`${label}${isIn?'到訪':'完成簽退'}`),el('dd',`${value} 天`));grid.append(item);
    }
    section.append(grid);
    if(!isIn) {
      const detail=el('div',undefined,'stamp-session-detail');
      detail.append(el('strong',`本日首次簽退 · 停留 ${duration(entry)}`));
      detail.append(el('p',`${GymApp.formatDateTime(entry.checkedInAt)} → ${GymApp.formatDateTime(entry.checkedOutAt)}`));
      detail.append(el('p','停留時間不代表實際運動時間。'));
      section.append(detail);
    } else section.append(el('p',`本日首次簽到 ${GymApp.formatTime(entry.at)}，已留下今天的到訪章。`,'stamp-caption'));
    section.append(el('p',duplicate?'這次簽到／簽退仍已成功；今日印章與天數不重複增加，保留首次紀錄。':review?'本週、本月與累積天數計算至卡片日期。':'同一台灣日期只計一次。休息與恢復，也是一部分。','stamp-caption'));
    return section;
  }
  function dialog(kind) {
    document.getElementById('stamp-dialog')?.remove();
    const dlg=el('dialog',undefined,`stamp-dialog stamp-${kind}`);dlg.id='stamp-dialog';dlg.setAttribute('aria-label',kind==='in'?'簽到蓋章頁面':'簽退成果蓋章頁面');
    document.body.append(dlg);
    const close=() => {document.body.classList.remove('stamp-page-open');dlg.remove();};
    dlg.addEventListener('close',close,{once:true});
    dlg.showModal();document.body.classList.add('stamp-page-open');return dlg;
  }
  function links(dlg,kind,review=false,date='') {
    const actions=el('div',undefined,'stamp-actions');
    const close=el('button',review?'關閉回顧':'回到簽到／簽退','secondary-button');close.type='button';close.onclick=()=>dlg.close();
    const link=el('a',review?'開啟訓練助手':kind==='in'?'開始使用訓練助手':'回顧我的健身足跡','primary-button button-link');
    link.href=review||kind==='in'?'./training.html':`./footprints.html?view=out&month=${date.slice(0,7)}`;
    actions.append(link,close);dlg.append(actions);
    if(!review&&kind==='in') {const a=el('a','回顧我的集章卡','stamp-review-link');a.href=`./footprints.html?view=in&month=${date.slice(0,7)}`;dlg.append(a);}
  }
  async function present(kind,app,payload) {
    const dlg=dialog(kind);
    const render = async () => {
      dlg.replaceChildren(el('p','正在把今日印章存入手機……','stamp-caption'));
      try {
        const result=await store.record(app.session.user.id,kind,payload);
        let rows, reviewError='';
        try {rows=await store.all(app.session.user.id);} catch {rows=null;reviewError='印章已存入手機，目前無法讀取累積統計，稍後可至「我的健身足跡」查看。';}
        dlg.replaceChildren();
        if(rows) dlg.append(card(result.entry,rows,{name:GymApp.profileName(app.profile,app.session),duplicate:result.duplicate}));
        else {dlg.append(el('h1',kind==='in'?'簽到成功，今日已蓋章':'簽退成功，成果卡已儲存'));dlg.append(el('p',reviewError));}
        links(dlg,kind,false,result.entry.date);
      } catch(error) {
        dlg.replaceChildren(el('h1',`${kind==='in'?'簽到':'簽退'}已成功`),el('p','但今日印章尚未儲存，請勿為了集章再次簽到／簽退。','stamp-caption'),el('p',error.message||'手機儲存空間無法使用。','message error'));
        const retry=el('button','重試儲存印章','primary-button');retry.type='button';retry.onclick=render;dlg.append(retry);links(dlg,kind);
      }
    };
    await render();
  }
  function review(entry,rows,name) {const dlg=dialog(entry.kind);dlg.append(card(entry,rows,{name,review:true}));links(dlg,entry.kind,true,entry.date);}
  window.FootprintsUI={present,review,card,duration};
})();
