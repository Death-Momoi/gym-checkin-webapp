import { MonthlyMetrics } from './metrics.js';
import { round } from '../../shared/numbers.js';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
 let photo;
 function loadPhoto(){if(!photo)photo=new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('卡片圖片讀取失敗，請重新整理後再試。'));i.src='./assets/monthly-good.jpg'}).catch(e=>{photo=null;throw e});return photo}
 async function paint(card){
  const image=await loadPhoto();await document.fonts.ready;
  const c=el('canvas');c.width=1080;c.height=1440;c.className='monthly-art';c.setAttribute('role','img');c.setAttribute('aria-label',`${card.month} 月度成果：總訓練量 ${card.summary.volume} kg，${MonthlyMetrics.weightText(card.summary)}，附讚讚貓圖片`);
  const ctx=c.getContext('2d');if(!ctx)throw Error('此瀏覽器無法產生成果圖片。');
  const rect=(x,y,w,h,r,fill)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill()};
  const text=(value,x,y,size=30,color='#f5f3e8',max=950,weight=500)=>{ctx.font=`${weight} ${size}px system-ui, sans-serif`;ctx.fillStyle=color;while(ctx.measureText(value).width>max&&value.length>1)value=value.slice(0,-2)+'…';ctx.fillText(value,x,y)};
  const num=n=>n.toLocaleString('zh-TW',{maximumFractionDigits:2});const s=card.summary;
  ctx.fillStyle='#0b201e';ctx.fillRect(0,0,1080,1440);
  const gradient=ctx.createLinearGradient(0,0,1080,1000);gradient.addColorStop(0,'#25493c');gradient.addColorStop(1,'#0b201e');ctx.fillStyle=gradient;ctx.fillRect(0,0,1080,1000);
  ctx.strokeStyle='#567365';ctx.lineWidth=2;ctx.strokeRect(24,24,1032,1392);
  text('MY MONTHLY COLLECTION',66,94,23,'#b5ceaa',620,650);
  text(card.month.replace('-',' / '),66,177,70,'#f0d38d',590,800);
  text('每一點努力，都算數。',66,242,37,'#f5f3e8',610,700);
  text(card.name||'我的月度成果',66,302,27,'#b5c9be',570);
  rect(725,70,286,286,24,'#f0d38d');
  // Keep the supplied photo intact: contain, never crop or redraw its subject.
  const scale=Math.min(258/image.naturalWidth,258/image.naturalHeight),iw=image.naturalWidth*scale,ih=image.naturalHeight*scale;ctx.drawImage(image,739+(258-iw)/2,84+(258-ih)/2,iw,ih);
  text('讚啦！這個月有在努力',725,391,21,'#f0d38d',285,650);
  rect(62,435,956,295,24,'#18372e');text('本月總訓練量',94,489,28,'#b5c9be');
  text(num(s.volume)+' kg',94,581,78,'#f0d38d',886,800);
  const equivalents=s.volume/5000;const eq=equivalents>0&&equivalents<.01?'< 0.01':num(round(equivalents));
  text(`相當於累積舉起 ${eq} 隻大象的重量`,94,646,32,'#f5f3e8',880,650);
  text('趣味換算基準：每隻 5,000 kg；不是一次舉起的重量',94,695,21,'#b5c9be',880);
  const stats=[['訓練天數',s.trainingDays+' 天'],['累積組數',s.sets+' 組'],['本機到訪章',s.visits+' 天']];
  stats.forEach(([label,value],i)=>{const x=62+i*326;rect(x,754,304,148,20,'#213e34');text(label,x+26,800,24,'#b5c9be',260);text(value,x+26,859,42,'#f5f3e8',258,750)});
  rect(62,926,956,245,24,'#e4e4cf');text('體重變化 · 月內首末兩筆比較',94,978,25,'#3f5b50');text(MonthlyMetrics.weightText(s),94,1046,49,'#17392f',880,800);
  if(s.weightDays>=2){text(`${s.weightStart.date}  ${num(s.weightStart.kg)} kg  →  ${s.weightEnd.date}  ${num(s.weightEnd.kg)} kg`,94,1101,25,'#3f5b50',875);text('只呈現變化，不判定增重或減重哪個更好。',94,1142,21,'#3f5b50')}
  else text(s.weightDays===1?'只有一天體重紀錄，暫不計算增減。':'這個月尚無體重紀錄，下個月再一起累積。',94,1110,27,'#3f5b50',880);
  text(s.trainingDays?'謝謝你，願意一次又一次開始。':'這是起點卡，下次記下訓練，一起累積。',64,1235,32,'#f0d38d',960,700);
  text('總訓練量＝每筆重量 × 次數 × 組數加總；依輸入重量計算',64,1295,22,'#b5c9be',960);
  text(`本機紀錄快照 · ${card.triggerDate} 簽到領取 · 不上傳雲端`,64,1340,22,'#b5c9be',960);
  text('GYM JOURNAL  /  KEEP SHOWING UP',64,1385,18,'#829c8f',960,600);
  return c;
 }
 async function download(canvas,month){const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('圖片產生失敗。')),'image/png'));const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`gym-monthly-${month}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}

export const MonthlyRenderer={paint,download};
