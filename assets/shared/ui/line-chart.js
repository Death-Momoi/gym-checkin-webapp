const NS='http://www.w3.org/2000/svg';
 const number=n=>n.toLocaleString('zh-TW',{maximumFractionDigits:2});
 function node(tag,attrs={},text){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e}
 function render(container,points,{title,color='#5eead4',zero=true,start,end,categorical=false}={}){
  container.replaceChildren();
  if(!points.length){const p=document.createElement('p');p.className='chart-empty';p.textContent='這段期間尚無紀錄，記下第一筆後就會出現折線圖。';container.append(p);return}
  const w=Math.max(340,container.clientWidth),h=300,left=64,right=20,top=28,bottom=72;
  const svg=node('svg',{viewBox:`0 0 ${w} ${h}`,role:'img','aria-label':title,class:'fitness-chart'});svg.append(node('title',{},title));
  const values=points.map(p=>p.value),min=Math.min(...values),max=Math.max(...values);
  let lo=zero?0:Math.max(0,Math.floor((min-Math.max(0.5,(max-min)*.15))*10)/10),hi=zero?Math.max(1,max*1.12):max+Math.max(.5,(max-min)*.15);
  const dateNum=s=>Date.parse(s+'T00:00:00Z'),first=dateNum(start||points[0].date),last=dateNum(end||points.at(-1).date);
  const x=p=>categorical&&points.length>1?left+points.indexOf(p)/(points.length-1)*(w-left-right):first===last?(left+w-right)/2:left+(dateNum(p.date)-first)/(last-first)*(w-left-right),y=v=>top+(hi-v)/(hi-lo)*(h-top-bottom);
  for(let i=0;i<=4;i++){const val=lo+(hi-lo)*i/4,yy=y(val);svg.append(node('line',{x1:left,y1:yy,x2:w-right,y2:yy,stroke:'#334155','stroke-dasharray':'4 5'}),node('text',{x:left-12,y:yy+4,'text-anchor':'end',fill:'#94a3b8','font-size':12},Math.abs(val)>=10000?number(val/1000)+'k':number(val)))}
  svg.append(node('text',{x:15,y:16,fill:'#94a3b8','font-size':12},'kg'));
  svg.append(node('path',{d:points.map((p,i)=>`${i?'L':'M'} ${x(p)} ${y(p.value)}`).join(' '),fill:'none',stroke:color,'stroke-width':3,'stroke-linejoin':'round'}));
  const labels=new Set(points.length<=10?points.map((_,i)=>i):Array.from({length:7},(_,i)=>Math.round(i*(points.length-1)/6)));
  points.forEach((p,i)=>{
   const group=node('g',{tabindex:0,role:'img','aria-label':`${p.date}：${number(p.value)} kg`});group.append(node('title',{},`${p.date} · ${number(p.value)} kg`),node('circle',{cx:x(p),cy:y(p.value),r:5,fill:color,stroke:'#0f172a','stroke-width':2}));svg.append(group);
   if(labels.has(i))svg.append(node('text',{x:x(p),y:h-bottom+22,transform:`rotate(-40 ${x(p)} ${h-bottom+22})`,'text-anchor':'end',fill:'#94a3b8','font-size':11},p.date.slice(5))); 
  });
  const scroll=document.createElement('div');scroll.className='chart-scroll';scroll.append(svg);container.append(scroll);
  const hint=document.createElement('p');hint.className='hint';hint.textContent=zero?'日期由左至右；同日合併，未訓練日不補零。':'未量測日期不補零；縱軸依體重範圍縮放。';container.append(hint);
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='查看精確數值';details.append(summary);
  const table=document.createElement('table');table.className='fitness-table';const head=table.createTHead().insertRow();for(const t of ['日期','公斤數（kg）']){const th=document.createElement('th');th.scope='col';th.textContent=t;head.append(th)}const body=table.createTBody();points.forEach(p=>{const r=body.insertRow();r.insertCell().textContent=p.date;r.insertCell().textContent=number(p.value)});details.append(table);container.append(details);
 }
 export const LocalCharts={render,number};
