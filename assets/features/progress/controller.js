import { hideMessage as appHideMessage } from '../../shared/ui/messages.js';
import { mountShell as appMountShell } from '../../shared/ui/shell.js';
import { setMessage as appSetMessage } from '../../shared/ui/messages.js';
import { taipeiDateString as appTaipeiDateString } from '../../shared/time.js';
import { TrainingStore } from '../training/index.js';
import { LocalCharts } from '../../shared/ui/line-chart.js';
import { ProgressMetrics } from './metrics.js';
const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
 const notice=(s,error=false)=>appSetMessage(s,error?'error':'success');

export async function mount(){appMountShell();
  let records=[];
  function draw(){const name=$('progress-exercise').value,days=ProgressMetrics.progress(records,name);
   $('progress-count').textContent=days.length?`${name} · 最近 ${days.length} 個訓練日（${days[0].date} ～ ${days.at(-1).date}）`:'先在訓練助手記錄動作';
   LocalCharts.render($('max-chart'),days.map(d=>({date:d.date,value:d.max})),{title:'每日最大重量',categorical:true});
   LocalCharts.render($('volume-chart'),days.map(d=>({date:d.date,value:d.volume})),{title:'每日總訓練量',color:'#fbbf24',categorical:true});
  }
  async function load(){ $('progress-refresh').disabled=true;try{
   const previous=$('progress-exercise').value;records=await TrainingStore.all();const names=new Map();records.filter(r=>r.date<=appTaipeiDateString()).forEach(r=>names.set(ProgressMetrics.normalized(r.exercise),r.exercise.trim()));
   $('progress-exercise').replaceChildren();[...names.values()].sort((a,b)=>a.localeCompare(b,'zh-TW')).forEach(name=>{const o=el('option',name);o.value=name;$('progress-exercise').append(o)});
   if([...names.values()].includes(previous))$('progress-exercise').value=previous;
   $('progress-exercise').disabled=!names.size;draw();appHideMessage();
  }catch(e){$('max-chart').replaceChildren();$('volume-chart').replaceChildren();notice('無法讀取訓練紀錄：'+e.message,true)}finally{$('progress-refresh').disabled=false}}
  $('progress-exercise').onchange=draw;$('progress-refresh').onclick=load;load();
}
