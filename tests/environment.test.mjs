import assert from 'node:assert/strict';
import { test } from 'node:test';
import { metric, readingState, ageText } from '../assets/features/environment/model.js';
import { createEnvironmentHandler, validateReading, sha256Hex } from '../supabase/functions/ingest-environment/handler.ts';
const reading={temperature_c:19.5,humidity_pct:48.7,illuminance_lux:160.9,light_status:'ok',full_spectrum:6013,infrared:795,wifi_rssi:-53,uptime_s:90,sample_age_ms:1000};
test('payload: finite values, darkness, missing sensors, saturation, bounded sample age',()=>{
 assert.equal(validateReading(reading).illuminance_lux,160.9);
 assert.equal(validateReading({...reading,illuminance_lux:0,full_spectrum:0,infrared:0}).illuminance_lux,0);
 assert.equal(validateReading({...reading,temperature_c:null}).temperature_c,null);
 assert.equal(validateReading({...reading,light_status:'saturated',illuminance_lux:null}).illuminance_lux,null);
 for(const change of [{humidity_pct:101},{temperature_c:NaN},{temperature_c:'19.5'},{illuminance_lux:Infinity},{illuminance_lux:-1},{light_status:'error'},{light_status:'ok',illuminance_lux:null},{sample_age_ms:10001},{infrared:1.5},{uptime_s:-1},{light_status:'saturated',illuminance_lux:null,full_spectrum:null}])assert.throws(()=>validateReading({...reading,...change}));
 assert.throws(()=>validateReading({}));assert.throws(()=>validateReading([]));
 const parsed=validateReading({...reading,device_id:'forged',received_at:'2099-01-01'});assert.equal(parsed.device_id,undefined);assert.equal(parsed.received_at,undefined);
});
test('display: zero vs null, stale times and partial errors',()=>{
 const now=Date.parse('2026-11-22T01:00:00Z');const row={...reading,received_at:new Date(now).toISOString(),sampled_at:new Date(now-1000).toISOString()};
 assert.equal(readingState(row,now),'fresh');assert.equal(readingState({...row,illuminance_lux:0},now),'fresh');
 assert.equal(readingState({...row,temperature_c:null},now),'partial');assert.equal(readingState({...row,light_status:'saturated',illuminance_lux:null},now),'partial');
 assert.equal(readingState(row,now+151000),'stale');assert.equal(readingState({...row,received_at:'broken'},now),'stale');
 assert.equal(readingState({...row,sampled_at:new Date(now+60000).toISOString()},now),'stale');
 assert.equal(metric(null),'—');assert.equal(metric(NaN),'—');assert.equal(metric(0),'0.0');assert.equal(ageText(new Date(now-61000).toISOString(),now),'1 分 1 秒');
});
test('endpoint: credential rejection, disabled devices, identity binding, persistence and failures',async()=>{
 let writes=[],enabled=true,lookupError=null,writeError=null;
 const hash=await sha256Hex('test-only-secret');
 const client={from(table){
  if(table==='presence_devices')return{select(){return this},eq(){return this},async maybeSingle(){return{data:{id:'trusted-device',device_code:'room-esp32',display_name:'Room',enabled,secret_hash:hash},error:lookupError}}};
  assert.equal(table,'environment_latest');return{async upsert(row,options){writes.push(row);assert.equal(options.onConflict,'device_id');return{error:writeError}}};
 }};
 const handler=createEnvironmentHandler(()=>client);
 const request=(payload=reading,secret='test-only-secret',method='POST')=>new Request('https://test.invalid',{method,headers:{'content-type':'application/json','x-device-id':'room-esp32','x-device-secret':secret},...(method==='POST'?{body:JSON.stringify(payload)}:{})});
 assert.equal((await handler(request(reading,'','OPTIONS'))).status,200);assert.equal((await handler(request(reading,'','GET'))).status,405);
 assert.equal((await handler(request(reading,''))).status,401);assert.equal((await handler(request(reading,'wrong'))).status,401);
 enabled=false;assert.equal((await handler(request())).status,401);enabled=true;assert.equal(writes.length,0);
 assert.equal((await handler(request({...reading,temperature_c:99}))).status,400);assert.equal((await handler(request({...reading,padding:'a'.repeat(5000)}))).status,400);
 const response=await handler(request({...reading,device_id:'attacker',received_at:'2099-01-01'}));assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
 assert.equal(writes.length,1);assert.equal(writes[0].device_id,'trusted-device');assert.equal(Date.parse(writes[0].received_at)-Date.parse(writes[0].sampled_at),1000);assert(!('secret_hash' in writes[0]));
 writeError={code:'42P01'};assert.equal((await handler(request())).status,500);lookupError={code:'42P01'};assert.equal((await handler(request())).status,500);
});
