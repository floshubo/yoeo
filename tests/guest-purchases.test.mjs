import {test} from 'node:test';
import assert from 'node:assert/strict';
import {usageService} from '../server/usage.mjs';
import {createApp} from '../server/app.mjs';

const guestId='$RCAnonymousID:'+'b'.repeat(32);
function fixture({entitlement={expires_date:null},httpStatus=200,cloudDown=false}={}) {
 let token='';let id=guestId;let lookups=0;let cloudCalls=0;
 const service=usageService({NODE_ENV:'production',SESSION_SECRET:'s'.repeat(32)},
  {accountsEnabled:cloudDown,getSession:async()=>{cloudCalls++;throw Error('Supabase paused');}},
  {fetchImpl:async url=>{
   lookups++;
   assert.equal(url,'https://api.revenuecat.com/v1/subscribers/'+encodeURIComponent(guestId));
   return new Response(JSON.stringify({subscriber:{entitlements:entitlement?{yoeo_pro:entitlement}:{}}}),{status:httpStatus});
  }});
 const req=()=>({headers:{},body:{guestToken:token,plan:'pro'},get:name=>name==='x-yoeo-purchase-id'?id:undefined});
 const res={append:()=>{}};
 return {service,req,res,setId:value=>id=value,lookups:()=>lookups,cloudCalls:()=>cloudCalls,exhaust:async()=>{
  for(let i=0;i<3;i++){const result=await service.finish(await service.reserve(req(),res),true);token=result.usageToken;}
 }};
}

test('guest annual and lifetime purchases allow a fourth scan without a cloud account',async()=>{
 for(const entitlement of [{expires_date:null},{expires_date:new Date(Date.now()+60000).toISOString()}]){
  const f=fixture({entitlement,cloudDown:true});
  assert.equal((await f.service.status(f.req(),f.res)).plan,'pro');
  await f.exhaust();
  assert.equal((await f.service.reserve(f.req(),f.res)).mode,'pro');
  assert.equal(f.cloudCalls(),0,'Paid store access must not contact unavailable account services');
 }
});

test('expired, invalid-date and missing entitlements cannot unlock paid scans',async()=>{
 for(const entitlement of [null,{expires_date:new Date(Date.now()-60000).toISOString()},{expires_date:'invalid'}]){
  const f=fixture({entitlement});await f.exhaust();
  assert.equal((await f.service.status(f.req(),f.res)).plan,'free');
  await assert.rejects(f.service.reserve(f.req(),f.res),e=>e.status===402&&e.code==='SCAN_LIMIT_REACHED');
 }
});

test('unverified client Pro flags, email and signed-in customer IDs grant no purchase access',async()=>{
 for(const id of ['someone@example.com','4e20ba3f-94c7-4801-9879-23c962f18b2f','$RCAnonymousID:short']){
  const f=fixture();f.setId(id);await f.exhaust();
  await assert.rejects(f.service.reserve(f.req(),f.res),e=>e.status===400);
  assert.equal(f.lookups(),0);
 }
 const f=fixture();f.setId(undefined);await f.exhaust();
 await assert.rejects(f.service.reserve(f.req(),f.res),e=>e.status===402);
});

test('RevenueCat outage fails closed; nonexistent customers remain free',async()=>{
 const f=fixture({httpStatus:503});await f.exhaust();
 await assert.rejects(f.service.reserve(f.req(),f.res),e=>e.status===503);
 const missing=fixture({httpStatus:404});
 assert.equal((await missing.service.status(missing.req(),missing.res)).plan,'free');
});

test('cloud login failure does not block guest allowance or manufacture premium access',async()=>{
 const f=fixture({entitlement:null,cloudDown:true});
 assert.equal((await f.service.status(f.req(),f.res)).remaining,3);
 await f.exhaust();
 await assert.rejects(f.service.reserve(f.req(),f.res),e=>e.status===402);
});

test('native CORS accepts the guest purchase header',async()=>{
 const server=createApp({env:{}}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 try {
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/usage`,{method:'OPTIONS',headers:{Origin:'capacitor://localhost','Access-Control-Request-Headers':'x-yoeo-purchase-id'}});
  assert.equal(response.status,204);
  assert.match(response.headers.get('Access-Control-Allow-Headers'),/X-YOEO-Purchase-ID/);
 } finally {await new Promise(resolve=>server.close(resolve));}
});

test('a store outage keeps remaining free scans and existing account Pro grants usable',async()=>{
 const outage=fixture({httpStatus:503});
 const status=await outage.service.status(outage.req(),outage.res);
 assert.equal(status.plan,'free');assert.equal(status.remaining,3,'The profile still loads while free scans remain');
 await outage.exhaust();
 await assert.rejects(outage.service.status(outage.req(),outage.res),e=>e.status===503,'An exhausted device fails closed');
 let token='';
 const service=usageService({NODE_ENV:'production',SESSION_SECRET:'s'.repeat(32),SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEY:'public'},
  {accountsEnabled:true,getSession:async()=>({user:{id:'account-1'},token:'access'})},
  {fetchImpl:async url=>url.includes('revenuecat.com')?new Response('{}',{status:503}):new Response(JSON.stringify({plan:'pro'}))});
 const req=()=>({headers:{},body:{guestToken:token},get:name=>name==='x-yoeo-purchase-id'?guestId:undefined});
 const res={append:()=>{}};
 for(let i=0;i<3;i++){token=(await service.finish(await service.reserve(req(),res),true)).usageToken;}
 assert.equal((await service.reserve(req(),res)).mode,'pro','A signed-in account that already holds Pro is not blocked by the store outage');
 assert.equal((await service.status(req(),res)).plan,'pro');
});
