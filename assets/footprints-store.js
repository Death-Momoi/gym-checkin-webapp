/* Read-only projection of the signed-in account's existing Supabase attendance.
   No stamp table, local stamp database, imports, or writes. */
(function () {
  'use strict';
  const FIELDS='id,user_id,checked_in_at,checked_out_at,checked_out_by,checkout_method';
  const PAGE_SIZE=1000;
  let context=null;
  function configure(app) {
    if(!app?.session?.user?.id||!app.client)throw new Error('請先使用 Google 帳號登入。');
    context={client:app.client,userId:app.session.user.id};
  }
  function dateKey(value) {
    const p=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).map(v=>[v.type,v.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  const validTime=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
  function fromAttendance(userId,kind,payload) {
    const row=Array.isArray(payload)?payload[0]:payload;
    if(!row||row.user_id!==userId||typeof row.id!=='string'||!['in','out'].includes(kind)||!validTime(row.checked_in_at))throw new Error('簽到資料不完整或帳號不符。');
    if(kind==='out'&&(!validTime(row.checked_out_at)||Date.parse(row.checked_out_at)<Date.parse(row.checked_in_at)))throw new Error('簽退時間不正確，請稍後重新讀取。');
    const at=kind==='in'?row.checked_in_at:row.checked_out_at;
    return {userId,kind,date:dateKey(at),at,sessionId:row.id,checkedInAt:row.checked_in_at,
      checkedOutAt:kind==='out'?row.checked_out_at:null,checkoutMethod:kind==='out'?row.checkout_method:null};
  }
  function aggregate(records,userId) {
    const days=new Map();
    for(const row of records) {
      if(row.user_id!==userId)throw new Error('資料帳號不符，已停止顯示。');
      for(const kind of row.checked_out_at?['in','out']:['in']) {
        const stamp=fromAttendance(userId,kind,row), key=`${kind}:${stamp.date}`, prior=days.get(key);
        // Pick the earliest event in absolute time, with a stable tie-breaker.
        if(!prior||Date.parse(stamp.at)<Date.parse(prior.at)||(Date.parse(stamp.at)===Date.parse(prior.at)&&stamp.sessionId<prior.sessionId))days.set(key,stamp);
      }
    }
    return [...days.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind));
  }
  async function readAttendance(userId) {
    const active=context;
    if(!active||active.userId!==userId)throw new Error('登入帳號已變更，請重新整理。');
    const rows=[];
    let offset=0,total=null;
    while(total===null||offset<total) {
      let query=active.client.from('attendance_sessions').select(FIELDS,offset===0?{count:'exact'}:{}).eq('user_id',userId)
        .order('checked_in_at',{ascending:true}).order('id',{ascending:true}).range(offset,offset+PAGE_SIZE-1);
      const {data,error,count}=await query;
      if(error)throw new Error(`讀取簽到紀錄失敗：${error.message}`);
      if(context!==active)throw new Error('登入帳號已變更，請重新整理。');
      if(!Array.isArray(data))throw new Error('簽到紀錄回應不完整，請重新讀取。');
      if(offset===0&&Number.isInteger(count)&&count>=0)total=count;
      if(!data.length) {
        if(total!==null&&offset<total)throw new Error('紀錄在讀取期間有變更，請重新讀取。');
        break;
      }
      if(data.some(r=>r.user_id!==userId))throw new Error('資料帳號不符，已停止顯示。');
      rows.push(...data);offset+=data.length;
    }
    return rows;
  }
  const all=async userId=>aggregate(await readAttendance(userId),userId);
  async function afterSuccess(app,kind,payload) {
    configure(app);
    const userId=app.session.user.id,row=Array.isArray(payload)?payload[0]:payload;
    const event=fromAttendance(userId,kind,row);
    const records=await readAttendance(userId);
    // Include the committed RPC response even if a concurrent read momentarily omitted it.
    const byId=new Map(records.map(r=>[r.id,r]));
    const existing=byId.get(row.id);
    // A check-in receipt must not turn a concurrently checked-out record back into an open one.
    byId.set(row.id,kind==='in'&&existing?.checked_out_at?existing:row);
    const rows=aggregate([...byId.values()],userId),entry=rows.find(r=>r.kind===kind&&r.date===event.date);
    return {rows,entry,duplicate:entry.sessionId!==event.sessionId};
  }
  function stats(rows,kind,date) {
    const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
    const monday=d.toISOString().slice(0,10),dates=[...new Set(rows.filter(r=>r.kind===kind&&r.date<=date).map(r=>r.date))];
    return {total:dates.length,month:dates.filter(v=>v.startsWith(date.slice(0,7))).length,week:dates.filter(v=>v>=monday).length};
  }
  window.FootprintsStore={configure,invalidate:()=>{context=null;},all,afterSuccess,stats,aggregate,fromAttendance,dateKey};
})();
