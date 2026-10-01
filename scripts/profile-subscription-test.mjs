import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import config from '../server/revenuecat-config.json' with {type:'json'};

const {chromium}=createRequire(path.resolve(process.env.YOEO_TOOLS_DIR || '.', 'package.json'))('playwright');
const browser=await chromium.launch({headless:true});
await mkdir('test-results/profile-subscription',{recursive:true});
try {
 for(const scenario of ['native-annual','native-free','web-pro']) {
  const page=await browser.newPage({viewport:{width:393,height:852},serviceWorkers:'block'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const native=scenario.startsWith('native');
  await page.addInitScript(({native,pro,entitlementId})=>{
   localStorage.setItem('yoeo-profile',JSON.stringify({name:'Annual subscriber',completed:true,allergens:[]}));
   localStorage.setItem('yoeo-account-session','isolated-session');
   localStorage.setItem('yoeo-language','en');
   if(!native)return;
   const state={pro,userId:null,customerReads:0,configured:[],callbacks:new Map(),nextId:0,delayRead:false,pendingRead:null,failRead:false};
   const info=(active=state.pro)=>({originalAppUserId:state.userId,entitlements:{active:active?{[entitlementId]:{isActive:true,productIdentifier:'yearly'}}:{}}});
   window.__purchases=state;
   window.__setEntitlement=pro=>{state.pro=pro;for(const item of state.callbacks.values())if(item.event==='customerInfo')item.callback(info());};
   window.__resumeApp=()=>{for(const item of state.callbacks.values())if(item.event==='appStateChange')item.callback({isActive:true});};
   window.webkit={messageHandlers:{bridge:{}}};
   window.Capacitor={
    PluginHeaders:[
     {name:'Purchases',methods:['setLogLevel','configure','logIn','logOut','getCustomerInfo','getOfferings','removeCustomerInfoUpdateListener'].map(name=>({name,rtype:'promise'})).concat([{name:'addCustomerInfoUpdateListener',rtype:'callback'}])},
     {name:'App',methods:[{name:'getLaunchUrl',rtype:'promise'},{name:'addListener',rtype:'callback'},{name:'removeListener',rtype:'promise'}]},
    ],
    nativePromise:async(plugin,method,options)=>{
     if(plugin==='Purchases') {
      if(method==='configure'){state.userId=options.appUserID||null;state.configured.push(state.userId);}
      if(method==='logIn')state.userId=options.appUserID;
      if(method==='logOut'){state.userId=null;state.pro=false;}
      if(method==='getCustomerInfo') {
       state.customerReads++;
       if(state.failRead)throw Error('Offline');
       const customerInfo=info();
       if(state.delayRead){state.delayRead=false;return new Promise(resolve=>{state.pendingRead=()=>resolve({customerInfo});});}
       return {customerInfo};
      }
      // Subscription status must remain available without a working product catalog.
      if(method==='getOfferings')throw Error('Store products unavailable');
      if(method==='removeCustomerInfoUpdateListener'){state.callbacks.delete(options.listenerToRemove);return {wasRemoved:true};}
     }
     if(method==='removeListener')state.callbacks.delete(options.callbackId);
     return {};
    },
    nativeCallback:(plugin,method,options,callback)=>{
     if(typeof options==='function')callback=options;
     const id=String(++state.nextId);
     state.callbacks.set(id,{event:method==='addCustomerInfoUpdateListener'?'customerInfo':options.eventName,callback});
     return Promise.resolve(id);
    },
   };
  },{native,pro:scenario==='native-annual',entitlementId:config.entitlementId});
  let releaseSession;
  const sessionGate=new Promise(resolve=>{releaseSession=resolve;});
  await page.route('**/api/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   const signedIn=!!route.request().headers()['x-yoeo-session'];
   if(pathname==='/api/auth/session'&&native)await sessionGate;
   const json=pathname==='/api/auth/session'?{user:signedIn?{id:'annual-user',email:'test@example.invalid'}:null}:
    pathname==='/api/usage'?{enforced:true,plan:scenario==='web-pro'?'pro':'free',remaining:scenario==='web-pro'?null:3}:{configured:false};
   await route.fulfill({json});
  });
  await page.goto(process.env.YOEO_TEST_URL || 'http://127.0.0.1:5188');
  await page.getByRole('navigation').getByRole('button',{name:'Profile',exact:true}).click();
  if(native) {
   assert.deepEqual(await page.evaluate(()=>window.__purchases.configured),[], 'Do not initialize an anonymous purchase customer while account identity is loading');
   assert.equal(await page.locator('.profile-brand .badge.free').count(),0,'Do not flash Free while subscription identity is loading');
   assert.equal(await page.locator('.profile-header > p').count(),0);
   releaseSession();
  }
  const pro=scenario!=='native-free';
  await page.locator(pro?'.profile-brand .badge.pro':'.profile-brand .badge.free').waitFor();
  assert.equal(await page.locator('.profile-header > p').count(),pro?0:1);
  if(pro)assert.equal(await page.getByText('3 of 3 free scans remaining',{exact:true}).count(),0);
  else await page.getByText('3 of 3 free scans remaining',{exact:true}).waitFor();
  await page.screenshot({path:`test-results/profile-subscription/${scenario}.png`});
  if(native) {
   await page.waitForFunction(()=>Array.from(window.__purchases.callbacks.values()).some(item=>item.event==='customerInfo'));
   // Purchase/restore listener updates the badge immediately, even while the API says Free.
   await page.evaluate(()=>window.__setEntitlement(true));
   await page.locator('.profile-brand .badge.pro').waitFor();
   assert.equal(await page.locator('.profile-header > p').count(),0);
   // A delayed read must not overwrite a newer purchase notification.
   await page.evaluate(()=>{window.__setEntitlement(false);window.__purchases.delayRead=true;window.__resumeApp();});
   await page.waitForFunction(()=>!!window.__purchases.pendingRead);
   await page.evaluate(()=>{window.__setEntitlement(true);window.__purchases.pendingRead();});
   await page.waitForTimeout(100);
   assert.equal(await page.locator('.profile-brand .badge.pro').count(),1);
   const readsBeforeFailure=await page.evaluate(()=>window.__purchases.customerReads);
   await page.evaluate(()=>{window.__purchases.failRead=true;window.__resumeApp();});
   await page.waitForFunction(reads=>window.__purchases.customerReads>reads,readsBeforeFailure);
   assert.equal(await page.locator('.profile-brand .badge.pro').count(),1,'A failed status read must not downgrade a known Pro subscription');
   await page.evaluate(()=>{window.__purchases.failRead=false;});
   // Foreground refresh picks up expiry/changes made outside the app.
   await page.evaluate(()=>{window.__purchases.pro=false;window.__resumeApp();});
   await page.locator('.profile-brand .badge.free').waitFor();
   await page.getByText('3 of 3 free scans remaining',{exact:true}).waitFor();
   assert.deepEqual(await page.evaluate(()=>window.__purchases.configured),['annual-user']);
   // Logout must not retain the previous customer's Pro badge.
   await page.evaluate(()=>window.__setEntitlement(true));
   await page.locator('.profile-brand .badge.pro').waitFor();
   await page.getByRole('button',{name:'Sign out',exact:true}).click();
   await page.getByRole('heading',{name:'Guest',exact:true}).waitFor();
   await page.locator('.profile-brand .badge.free').waitFor();
   assert.equal(await page.locator('.profile-brand .badge.pro').count(),0);
  }
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('Profile subscription checks passed: active annual native entitlement overrides Free scan status, Pro has no subtitle/count, free counts remain, web Pro, purchase/restore updates, foreground expiry refresh, stale reads and logout identity. All purchase/API data is mocked.');
} catch(error) {
 for(const page of browser.contexts().flatMap(context=>context.pages())) {
  console.error(await page.locator('body').innerText());
  await page.screenshot({path:'test-results/profile-subscription/failure.png'});
 }
 throw error;
} finally {await browser.close();}
