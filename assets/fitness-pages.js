(function(){
 'use strict';
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
 const notice=(s,error=false)=>GymApp.setMessage(s,error?'error':'success');
 function download(data,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
 async function readFile(file){if(!file||file.size>20*1024*1024)throw Error('請選擇 20 MB 內的 JSON 備份。');return JSON.parse(await file.text())}
 window.FitnessFiles={download,readFile};
 if(!['progress','bodyweight'].includes(document.body.dataset.page))return;
 GymApp.mountShell();
 if(document.body.dataset.page==='progress'){
  let records=[];
  function draw(){const name=$('progress-exercise').value,days=FitnessMetrics.progress(records,name);
   $('progress-count').textContent=days.length?`${name} · 最近 ${days.length} 個訓練日（${days[0].date} ～ ${days.at(-1).date}）`:'先在訓練助手記錄動作';
   LocalCharts.render($('max-chart'),days.map(d=>({date:d.date,value:d.max})),{title:'每日最大重量',categorical:true});
   LocalCharts.render($('volume-chart'),days.map(d=>({date:d.date,value:d.volume})),{title:'每日總訓練量',color:'#fbbf24',categorical:true});
  }
  async function load(){ $('progress-refresh').disabled=true;try{
   const previous=$('progress-exercise').value;records=await TrainingStore.all();const names=new Map();records.filter(r=>r.date<=GymApp.taipeiDateString()).forEach(r=>names.set(FitnessMetrics.normalized(r.exercise),r.exercise.trim()));
   $('progress-exercise').replaceChildren();[...names.values()].sort((a,b)=>a.localeCompare(b,'zh-TW')).forEach(name=>{const o=el('option',name);o.value=name;$('progress-exercise').append(o)});
   if([...names.values()].includes(previous))$('progress-exercise').value=previous;
   $('progress-exercise').disabled=!names.size;draw();GymApp.hideMessage();
  }catch(e){$('max-chart').replaceChildren();$('volume-chart').replaceChildren();notice('無法讀取訓練紀錄：'+e.message,true)}finally{$('progress-refresh').disabled=false}}
  $('progress-exercise').onchange=draw;$('progress-refresh').onclick=load;load();return;
 }
 let rows=[],busy=false,editing=null,limit=30;
 const today=GymApp.taipeiDateString(),start=new Date(today+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-6);
 $('weight-date').value=today;$('weight-date').max=today;$('weight-start').value=start.toISOString().slice(0,10);$('weight-end').value=today;
 function lock(v){busy=v;$('weight-fields').disabled=v;document.querySelectorAll('[data-weight-action]').forEach(b=>b.disabled=v)}
 function reset(){editing=null;$('weight-date').disabled=false;$('weight-save').textContent='儲存體重';$('weight-cancel').classList.add('hidden')}
 function draw(){
  const a=$('weight-start').value,b=$('weight-end').value;
  if(!FitnessStore.validDate(a)||!FitnessStore.validDate(b)||a>b){$('weight-chart').replaceChildren(el('p','請選擇有效日期，開始日不可晚於結束日。','message error'));return}
  const points=rows.filter(r=>r.date>=a&&r.date<=b).sort((x,y)=>x.date.localeCompare(y.date)).map(r=>({date:r.date,value:r.kg}));
  LocalCharts.render($('weight-chart'),points,{title:'體重變化',color:'#c4b5fd',zero:false,start:a,end:b});
  $('weight-range-count').textContent=`${a} ～ ${b} · ${points.length} 天紀錄`;
 }
 function render(){
  draw();const list=$('weight-list');list.replaceChildren();$('weight-count').textContent=`${rows.length} 天紀錄`;
  if(!rows.length)list.append(el('p','還沒有體重紀錄，從今天開始。','hint'));
  for(const r of rows.slice(0,limit)){
   const item=el('article',undefined,'weight-row'),text=el('div');text.append(el('strong',r.date),el('p',`${r.kg} kg`));const actions=el('div',undefined,'training-actions');
   const edit=el('button','修改','secondary-button');edit.type='button';edit.dataset.weightAction='';edit.onclick=()=>{editing=r;$('weight-date').value=r.date;$('weight-date').disabled=true;$('weight-kg').value=r.kg;$('weight-save').textContent='儲存修改';$('weight-cancel').classList.remove('hidden');$('weight-kg').focus()};
   const del=el('button','刪除','secondary-button');del.type='button';del.dataset.weightAction='';del.onclick=async()=>{if(busy||!confirm(`刪除 ${r.date} 的體重紀錄？已產生的月度卡不會更改。`))return;lock(true);try{await FitnessStore.removeWeight(r.date,r.updatedAt);if(editing?.date===r.date)reset();await reload();notice('已刪除紀錄。')}catch(e){notice(e.message,true)}finally{lock(false)}};
   actions.append(edit,del);item.append(text,actions);list.append(item);
  }
  $('weight-more').classList.toggle('hidden',rows.length<=limit);
 }
 async function reload(){rows=(await FitnessStore.weights()).sort((a,b)=>b.date.localeCompare(a.date));render()}
 async function load(){if(busy)return;lock(true);try{await reload();GymApp.hideMessage()}catch(e){$('weight-chart').replaceChildren();$('weight-list').replaceChildren();notice('讀取失敗：'+e.message,true)}finally{lock(false)}}
 $('weight-form').onsubmit=async e=>{
  e.preventDefault();if(busy)return;
  const date=$('weight-date').value,kg=Number($('weight-kg').value),old=editing||rows.find(r=>r.date===date);
  if(!editing&&old&&!confirm(`${date} 已記錄 ${old.kg} kg，要改為 ${kg} kg 嗎？`))return;
  lock(true);try{await FitnessStore.saveWeight({date,kg,updatedAt:Math.max(Date.now(),(old?.updatedAt||0)+1)},old?.updatedAt??null);reset();await reload();notice('體重已儲存在本機。')}catch(e){notice(e.message,true)}finally{lock(false)}
 };
 $('weight-cancel').onclick=reset;$('weight-refresh').onclick=load;$('weight-more').onclick=()=>{limit+=30;render()};
 $('weight-start').onchange=draw;$('weight-end').onchange=draw;
 $('weight-seven').onclick=()=>{$('weight-start').value=start.toISOString().slice(0,10);$('weight-end').value=today;draw()};
 $('weight-export').onclick=async()=>{if(busy)return;lock(true);try{download({format:'gym-bodyweight-backup',version:1,records:await FitnessStore.weights()},'gym-bodyweight-'+today+'.json')}catch(e){notice(e.message,true)}finally{lock(false)}};
 $('weight-import').onclick=()=>$('weight-file').click();
 $('weight-file').onchange=async e=>{const f=e.target.files[0];if(!f||busy)return;lock(true);try{const result=await FitnessStore.merge(await readFile(f),'weights');await reload();notice(`已匯入 ${result.added} 筆，略過 ${result.skipped} 個已有日期。`)}catch(e){notice('匯入失敗：'+e.message,true)}finally{e.target.value='';lock(false)}};
 load();
})();
