import { hideMessage as appHideMessage } from '../../shared/ui/messages.js';
import { mountShell as appMountShell } from '../../shared/ui/shell.js';
import { setMessage as appSetMessage } from '../../shared/ui/messages.js';
import { taipeiDateString as appTaipeiDateString } from '../../shared/time.js';
import { LocalCharts } from '../../shared/ui/line-chart.js';
import { FitnessFiles } from '../../shared/files.js';
import { BodyweightStore } from './repository.js';
import { validDate } from '../../shared/validation.js';
const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
 const notice=(s,error=false)=>appSetMessage(s,error?'error':'success');

export async function mount(){appMountShell();
 let rows=[],busy=false,editing=null,limit=30;
 const today=appTaipeiDateString(),start=new Date(today+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-6);
 $('weight-date').value=today;$('weight-date').max=today;$('weight-start').value=start.toISOString().slice(0,10);$('weight-end').value=today;
 function lock(v){busy=v;$('weight-fields').disabled=v;document.querySelectorAll('[data-weight-action]').forEach(b=>b.disabled=v)}
 function reset(){editing=null;$('weight-date').disabled=false;$('weight-save').textContent='儲存體重';$('weight-cancel').classList.add('hidden')}
 function draw(){
  const a=$('weight-start').value,b=$('weight-end').value;
  if(!validDate(a)||!validDate(b)||a>b){$('weight-chart').replaceChildren(el('p','請選擇有效日期，開始日不可晚於結束日。','message error'));return}
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
   const del=el('button','刪除','secondary-button');del.type='button';del.dataset.weightAction='';del.onclick=async()=>{if(busy||!confirm(`刪除 ${r.date} 的體重紀錄？已產生的月度卡不會更改。`))return;lock(true);try{await BodyweightStore.removeWeight(r.date,r.updatedAt);if(editing?.date===r.date)reset();await reload();notice('已刪除紀錄。')}catch(e){notice(e.message,true)}finally{lock(false)}};
   actions.append(edit,del);item.append(text,actions);list.append(item);
  }
  $('weight-more').classList.toggle('hidden',rows.length<=limit);
 }
 async function reload(){rows=(await BodyweightStore.weights()).sort((a,b)=>b.date.localeCompare(a.date));render()}
 async function load(){if(busy)return;lock(true);try{await reload();appHideMessage()}catch(e){$('weight-chart').replaceChildren();$('weight-list').replaceChildren();notice('讀取失敗：'+e.message,true)}finally{lock(false)}}
 $('weight-form').onsubmit=async e=>{
  e.preventDefault();if(busy)return;
  const date=$('weight-date').value,kg=Number($('weight-kg').value),old=editing||rows.find(r=>r.date===date);
  if(!editing&&old&&!confirm(`${date} 已記錄 ${old.kg} kg，要改為 ${kg} kg 嗎？`))return;
  lock(true);try{await BodyweightStore.saveWeight({date,kg,updatedAt:Math.max(Date.now(),(old?.updatedAt||0)+1)},old?.updatedAt??null);reset();await reload();notice('體重已儲存在本機。')}catch(e){notice(e.message,true)}finally{lock(false)}
 };
 $('weight-cancel').onclick=reset;$('weight-refresh').onclick=load;$('weight-more').onclick=()=>{limit+=30;render()};
 $('weight-start').onchange=draw;$('weight-end').onchange=draw;
 $('weight-seven').onclick=()=>{$('weight-start').value=start.toISOString().slice(0,10);$('weight-end').value=today;draw()};
 $('weight-export').onclick=async()=>{if(busy)return;lock(true);try{FitnessFiles.download({format:'gym-bodyweight-backup',version:1,records:await BodyweightStore.weights()},'gym-bodyweight-'+today+'.json')}catch(e){notice(e.message,true)}finally{lock(false)}};
 $('weight-import').onclick=()=>$('weight-file').click();
 $('weight-file').onchange=async e=>{const f=e.target.files[0];if(!f||busy)return;lock(true);try{const result=await BodyweightStore.merge(await FitnessFiles.readFile(f));await reload();notice(`已匯入 ${result.added} 筆，略過 ${result.skipped} 個已有日期。`)}catch(e){notice('匯入失敗：'+e.message,true)}finally{e.target.value='';lock(false)}};
 load();
}
