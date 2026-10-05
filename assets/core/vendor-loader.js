const pending=new Map();
export function loadScript(url,ready){
 if(ready())return Promise.resolve();
 if(!pending.has(url))pending.set(url,new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url;script.onload=()=>ready()?resolve():reject(new Error('外部程式庫未能初始化'));script.onerror=()=>{script.remove();reject(new Error('外部程式庫載入失敗'))};document.head.append(script)}).catch(e=>{pending.delete(url);throw e}));
 return pending.get(url);
}
export async function loadDatePicker(){try{await loadScript('https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.js',()=>typeof window.flatpickr==='function')}catch{ /* Native date input remains available. */ }}
