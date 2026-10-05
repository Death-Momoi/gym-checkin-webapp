export const KEY='gym-rest-timer-v1:'+new URL('.',location.href).pathname;
export const TimerStorage={read:()=>JSON.parse(localStorage.getItem(KEY)||'null'),write:data=>localStorage.setItem(KEY,JSON.stringify(data))};
