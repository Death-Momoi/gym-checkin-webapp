(async function(){
 'use strict';
 const app=await GymApp.init();if(!app)return;const userId=app.session.user.id,$=id=>document.getElementById(id);
 let inactive=false,busy=false,limit=6;
 app.client.auth.onAuthStateChange((_event,session)=>{if(session?.user?.id!==userId){inactive=true;$('monthly-list').replaceChildren();window.location.replace('./index.html')}});
 async function load(){
  if(busy||inactive)return;busy=true;$('monthly-refresh').disabled=true;$('monthly-list').replaceChildren();
  try{
   const rows=(await FitnessStore.cards(userId)).sort((a,b)=>b.month.localeCompare(a.month));if(inactive)return;
   const requested=new URLSearchParams(location.search).get('month'),at=rows.findIndex(r=>r.month===requested);if(at>=limit)limit=at+1;
   $('monthly-count').textContent=`${rows.length} 張收藏`;
   if(!rows.length){const p=document.createElement('p');p.className='card chart-empty';p.textContent='尚未領取月度卡。每月在這台裝置第一次成功簽到，就會產生上個月的成果卡。';$('monthly-list').append(p)}
   $('monthly-more').classList.toggle('hidden',rows.length<=limit);
   for(const card of rows.slice(0,limit)){
    const item=document.createElement('article');item.className='monthly-entry';item.id='month-'+card.month;
    const title=document.createElement('h2');title.textContent=card.month+' 月度成果';item.append(title);
    const canvas=await MonthlyCards.paint(card);if(inactive)return;item.append(canvas);
    const detail=document.createElement('p');detail.className='monthly-description';detail.textContent=`總訓練量 ${card.summary.volume.toLocaleString('zh-TW')} kg · ${card.summary.trainingDays} 個訓練日 · ${FitnessMetrics.weightText(card.summary)}。${card.triggerDate} 領取。`;item.append(detail);
    const button=document.createElement('button');button.type='button';button.className='primary-button';button.textContent='下載成果卡 PNG';button.onclick=async()=>{button.disabled=true;try{await MonthlyCards.download(canvas,card.month)}catch(e){GymApp.setMessage(e.message,'error')}finally{button.disabled=false}};item.append(button);$('monthly-list').append(item);
   }
   GymApp.hideMessage();const month=new URLSearchParams(location.search).get('month');if(/^\d{4}-\d\d$/.test(month||''))document.getElementById('month-'+month)?.scrollIntoView({block:'start'});
  }catch(e){if(!inactive)GymApp.setMessage('無法讀取成果卡：'+e.message,'error')}finally{busy=false;$('monthly-refresh').disabled=false}
 }
 $('monthly-refresh').onclick=load;
 $('monthly-more').onclick=()=>{limit+=6;load()};
 $('monthly-export').onclick=async()=>{try{FitnessFiles.download({format:'gym-monthly-cards-backup',version:1,userId,records:await FitnessStore.cards(userId)},'gym-monthly-cards.json')}catch(e){GymApp.setMessage(e.message,'error')}};
 $('monthly-import').onclick=()=>$('monthly-file').click();
 $('monthly-file').onchange=async e=>{const file=e.target.files[0];if(!file||busy)return;try{const data=await FitnessFiles.readFile(file);if(inactive)return;const result=await FitnessStore.merge(data,'cards',userId);await load();GymApp.setMessage(`已匯入 ${result.added} 張，略過 ${result.skipped} 張已有月份。`,'success')}catch(error){GymApp.setMessage('匯入失敗：'+error.message,'error')}finally{e.target.value=''}};
 await load();
})();
