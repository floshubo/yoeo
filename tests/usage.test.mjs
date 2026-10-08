import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
import {usageService} from '../server/usage.mjs';
async function serve(app,fn){const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));try{await fn(`http://127.0.0.1:${s.address().port}`);}finally{await new Promise(r=>s.close(r));}}
const body={images:[],text:'Menu soup',profile:[]};
const post=base=>fetch(base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('development scans do not require a cloud account',async()=>{await serve(createApp({env:{},analyzeFn:async()=>({ok:true})}),async base=>{for(let i=0;i<4;i++)assert.equal((await post(base)).status,200);});});
test('production allows an anonymous scan before account setup',async()=>{let calls=0;await serve(createApp({env:{NODE_ENV:'production'},analyzeFn:async()=>{calls++;return {ok:true};}}),async base=>assert.equal((await post(base)).status,200));assert.equal(calls,1);});
test('anonymous allowance counts successful scans and offers Pro after three',async()=>{
 let token='';const req=()=>({headers:{},body:{guestToken:token},get:()=>undefined});const res=()=>({append:()=>{}});
 const u=usageService({NODE_ENV:'production',SESSION_SECRET:'x'.repeat(32)},{accountsEnabled:false});
 const failed=await u.reserve(req(),res());await u.finish(failed,false);
 for(let i=0;i<3;i++){const response=res();const reservation=await u.reserve(req(),response);token=(await u.finish(reservation,true)).usageToken;}
 assert.equal((await u.status(req(),res())).remaining,0);
 await assert.rejects(u.reserve(req(),res()),error=>error.status===402&&error.code==='SCAN_LIMIT_REACHED');
});
test('a signed-in Pro account continues after the anonymous allowance',async()=>{
 let token='',headers;const req=()=>({headers:{},body:{guestToken:token},get:()=>undefined});const res=()=>({append:()=>{}});
 const u=usageService({NODE_ENV:'production',SESSION_SECRET:'x'.repeat(32),SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_browser-safe'},{accountsEnabled:true,getSession:async()=>({user:{id:'user-1'},token:'user-access-token'})},{fetchImpl:async(_url,options)=>{headers=options.headers;return new Response(JSON.stringify({plan:'pro'}));}});
 for(let i=0;i<3;i++){const reservation=await u.reserve(req(),res());token=(await u.finish(reservation,true)).usageToken;}
 assert.equal((await u.reserve(req(),res())).mode,'pro');
 assert.equal(headers.apikey,'sb_publishable_browser-safe');assert.equal(headers.Authorization,'Bearer user-access-token');
});

test('premium status is checked before free scans are exhausted',async()=>{
 const req={headers:{},get:()=>undefined};const res={append:()=>{}};
 let plan='pro';
 const u=usageService({NODE_ENV:'production',SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEY:'public'},{accountsEnabled:true,getSession:async()=>({user:{id:'user'},token:'token'})},{fetchImpl:async()=>new Response(JSON.stringify({plan}))});
 const premium=await u.status(req,res);
 assert.equal(premium.plan,'pro');assert.equal(premium.remaining,null);assert.equal(premium.signedIn,true);
 plan='free';
 const free=await u.status(req,res);
 assert.equal(free.plan,'free');assert.equal(free.remaining,3);assert.equal(free.signedIn,true);
});

test('subscription lookup failure does not grant premium access',async()=>{
 let token='';const req=()=>({headers:{},body:{guestToken:token},get:()=>undefined});const res={append:()=>{}};
 const u=usageService({NODE_ENV:'production',SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEY:'public'},{accountsEnabled:true,getSession:async()=>({user:{id:'user'},token:'token'})},{fetchImpl:async()=>new Response('{}',{status:503})});
 // Remaining free scans stay usable during the outage, but nothing becomes Pro.
 const status=await u.status(req(),res);
 assert.equal(status.plan,'free');assert.equal(status.remaining,3);
 for(let i=0;i<3;i++){token=(await u.finish(await u.reserve(req(),res),true)).usageToken;}
 await assert.rejects(u.status(req(),res),error=>error.status===503);
 await assert.rejects(u.reserve(req(),res),error=>error.status===503);
});
test('a RevenueCat yoeo_pro entitlement unlocks scans when the local plan is free',async()=>{
 let token='';const req=()=>({headers:{},body:{guestToken:token},get:()=>undefined});const res=()=>({append:()=>{}});
 const calls=[];
 const u=usageService({NODE_ENV:'production',SESSION_SECRET:'x'.repeat(32),SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEY:'sb_public',REVENUECAT_SERVER_API_KEY:'rc_public',REVENUECAT_ENTITLEMENT_ID:'yoeo_pro'},{accountsEnabled:true,getSession:async()=>({user:{id:'70f61fea-d65f-4918-a51f-c21dac14d657'},token:'access'})},{fetchImpl:async(url)=>{calls.push(url);return url.includes('revenuecat.com')?new Response(JSON.stringify({subscriber:{entitlements:{yoeo_pro:{expires_date:null}}}})):new Response(JSON.stringify({plan:'free'}));}});
 for(let i=0;i<3;i++){const reservation=await u.reserve(req(),res());token=(await u.finish(reservation,true)).usageToken;}
 assert.equal((await u.reserve(req(),res())).mode,'pro');
 assert.equal(calls.some(url=>url.includes('/v1/subscribers/70f61fea')),true);
});
test('fourth scan is blocked before AI; failed scan releases its slot',async()=>{
 let used=0,pending=0,fail=false,aiCalls=0;const usage={status:async()=>({remaining:3-used}),reserve:async()=>{if(used+pending>=3)throw Object.assign(Error('Upgrade to Pro'),{status:402,code:'SCAN_LIMIT_REACHED'});pending++;return {id:'slot'};},finish:async(_r,success)=>{pending--;if(success)used++;}};
 await serve(createApp({env:{NODE_ENV:'production'},usageOverride:usage,analyzeFn:async()=>{aiCalls++;if(fail)throw Error('Provider down');return {ok:true};}}),async base=>{
 fail=true;assert.equal((await post(base)).status,500);assert.equal(used,0);assert.equal(pending,0);fail=false;
 for(let i=0;i<3;i++)assert.equal((await post(base)).status,200);
 const denied=await post(base);assert.equal(denied.status,402);assert.equal((await denied.json()).code,'SCAN_LIMIT_REACHED');assert.equal(aiCalls,4);assert.equal(used,3);
 });
});

test('default Apple key verifies active, expired and missing RevenueCat entitlements',async()=>{
 let entitlement={expires_date:new Date(Date.now()+60000).toISOString()};
 let lookupStatus=200;
 const u=usageService({NODE_ENV:'production',SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEY:'public'},
 {accountsEnabled:true,getSession:async()=>({user:{id:'signed-in-account'},token:'access'})},
 {fetchImpl:async(url,options)=>{
  if(!url.includes('api.revenuecat.com'))return new Response(JSON.stringify({plan:'free'}));
  assert.equal(url,'https://api.revenuecat.com/v1/subscribers/signed-in-account');
  assert.match(options.headers.Authorization,/^Bearer appl_/);
  return new Response(JSON.stringify({subscriber:{entitlements:entitlement?{yoeo_pro:entitlement}:{}}}),{status:lookupStatus});
 }});
 const status=()=>u.status({headers:{},get:()=>undefined},{append:()=>{}});
 assert.equal((await status()).plan,'pro');
 entitlement={expires_date:new Date(Date.now()-60000).toISOString()};
 assert.equal((await status()).plan,'free');
 entitlement=null;
 assert.equal((await status()).plan,'free');
 lookupStatus=503;
 assert.equal((await status()).plan,'free','A failed lookup never grants Pro while the free allowance remains available');
});
test('production subscription lookup ignores a Test Store key',async()=>{
 const u=usageService({NODE_ENV:'production',SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEY:'public',REVENUECAT_SERVER_API_KEY:'test_old_key'},
 {accountsEnabled:true,getSession:async()=>({user:{id:'signed-in-account'},token:'access'})},
 {fetchImpl:async(url,options)=>{
  if(!url.includes('api.revenuecat.com'))return new Response(JSON.stringify({plan:'free'}));
  assert.match(options.headers.Authorization,/^Bearer appl_/);
  return new Response(JSON.stringify({subscriber:{entitlements:{}}}));
 }});
 assert.equal((await u.status({headers:{},get:()=>undefined},{append:()=>{}})).plan,'free');
});
