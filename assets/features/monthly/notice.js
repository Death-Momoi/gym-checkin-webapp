import { MonthlyCards } from './service.js';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
 async function afterCheckIn(app,payload){
  const box=el('section',undefined,'monthly-notice');box.setAttribute('aria-label','月度成果卡通知');
  async function run(){
   box.replaceChildren(el('p','正在整理上個月的本機成果……'));
   try{const r=await MonthlyCards.ensure(app,payload);if(!r.created){box.remove();return}box.replaceChildren(el('strong',r.created?`${r.card.month} 月度成果卡已收藏！`:`${r.card.month} 月度成果卡已在收藏中`),el('p',r.created?'你的上月努力，已存成一張專屬小卡。':'本月不重複產生，保留首次簽到時的成果。'));
    const a=el('a','查看／下載月度成果卡','primary-button button-link');a.href='./monthly.html?month='+r.card.month;box.append(a);
   }catch(e){box.replaceChildren(el('strong','簽到已成功，但月度卡尚未完成'),el('p',e.message||'本機儲存失敗。'));const retry=el('button','重試產生月度卡','secondary-button');retry.type='button';retry.onclick=run;box.append(retry)}
  }
  const target=document.getElementById('stamp-dialog')||document.querySelector('main');target.append(box);await run();
 }

export const MonthlyNotice={afterCheckIn};
