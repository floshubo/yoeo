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
   const state={pro,userId:'$RCAnonymousID:'+'c'.repeat(32),customerReads:0,configured:[],logins:[],logouts:0,callbacks:new Map(),nextId:0,holdReads:true,pendingReads:[],delayRead:false,pendingRead:null,failRead:false};
   const info=(active=state.pro)=>({originalAppUserId:state.userId,entitlements:{active:active?{[entitlementId]:{isActive:true,productIdentifier:'yearly'}}:{}}});
   window.__purchases=state;
   window.__setEntitlement=pro=>{state.pro=pro;for(const item of state.callbacks.values())if(item.event==='customerInfo')item.callback(info());};
   window.__resumeApp=()=>{for(const item of state.callbacks.values())if(item.event==='appStateChange')item.callback({isActive:true});};
   window.__releaseReads=()=>{state.holdReads=false;for(const release of state.pendingReads.splice(0))release();};
   window.webkit={messageHandlers:{bridge:{}}};
   window.Capacitor={
    PluginHeaders:[
     {name:'Purchases',methods:['setLogLevel','configure','isAnonymous','getAppUserID','logIn','logOut','syncPurchases','getCustomerInfo','getOfferings','restorePurchases','removeCustomerInfoUpdateListener'].map(name=>({name,rtype:'promise'})).concat([{name:'addCustomerInfoUpdateListener',rtype:'callback'}])},
     {name:'App',methods:[{name:'getLaunchUrl',rtype:'promise'},{name:'addListener',rtype:'callback'},{name:'removeListener',rtype:'promise'}]},
    ],
    nativePromise:async(plugin,method,options)=>{
     if(plugin==='Purchases') {
      if(method==='configure')state.configured.push(options.appUserID||null);
      if(method==='isAnonymous')return {isAnonymous:true};
      if(method==='getAppUserID')return {appUserID:state.userId};
      const notify=customerInfo=>{for(const item of state.callbacks.values())if(item.event==='customerInfo')item.callback(customerInfo);};
      if(method==='syncPurchases')throw Error('syncPurchases is only for an account RevenueCat already knows');
      // Signing in links the anonymous store customer to the YOEO account; a new account inherits its purchases.
      if(method==='logIn'){state.logins.push(options.appUserID);state.userId=options.appUserID;const customerInfo=info();notify(customerInfo);return {created:true,customerInfo};}
      // Signing out returns to a fresh anonymous customer that holds nothing until Restore Purchases.
      if(method==='logOut'){state.logouts++;state.userId='$RCAnonymousID:'+'e'.repeat(32);state.pro=false;const customerInfo=info();notify(customerInfo);return {customerInfo};}
      if(method==='restorePurchases'){state.pro=true;const customerInfo=info();notify(customerInfo);return {customerInfo};}
      if(method==='getCustomerInfo') {
       state.customerReads++;
       if(state.failRead)throw Error('Offline');
       const customerInfo=info();
       if(state.holdReads)return new Promise(resolve=>{state.pendingReads.push(()=>resolve({customerInfo}));});
       if(state.delayRead){state.delayRead=false;return new Promise(resolve=>{state.pendingRead=()=>{state.pendingRead=null;resolve({customerInfo});};});}
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
  await page.route('**/api/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   const signedIn=!!route.request().headers()['x-yoeo-session'];
   const json=pathname==='/api/auth/session'?{user:signedIn?{id:'annual-user',email:'test@example.invalid'}:null}:
    pathname==='/api/usage'?{enforced:true,plan:scenario==='web-pro'?'pro':'free',remaining:scenario==='web-pro'?null:3}:{configured:false};
   await route.fulfill({json});
  });
  await page.goto(process.env.YOEO_TEST_URL || 'http://127.0.0.1:5188');
  await page.getByRole('navigation').getByRole('button',{name:'Profile',exact:true}).click();
  if(native) {
   // The store customer is configured anonymously right away; a YOEO account is never used as its ID.
   await page.waitForFunction(()=>window.__purchases.pendingReads.length>0);
   assert.deepEqual(await page.evaluate(()=>window.__purchases.configured),[null],'Configure the anonymous store customer, never a YOEO account ID');
   assert.equal(await page.locator('.profile-brand .badge.free').count(),0,'Do not flash Free while the subscription status is loading');
   assert.equal(await page.locator('.profile-header > p').count(),0);
   await page.evaluate(()=>window.__releaseReads());
  }
  const pro=scenario!=='native-free';
  await page.locator(pro?'.profile-brand .badge.pro':'.profile-brand .badge.free').waitFor();
  assert.equal(await page.locator('.profile-header > p').count(),pro?0:1);
  if(pro)assert.equal(await page.getByText('3 of 3 free scans remaining',{exact:true}).count(),0);
  else await page.getByText('3 of 3 free scans remaining',{exact:true}).waitFor();
  await page.screenshot({path:`test-results/profile-subscription/${scenario}.png`});
  if(native) {
   await page.waitForFunction(()=>Array.from(window.__purchases.callbacks.values()).some(item=>item.event==='customerInfo'));
   // The signed-in YOEO account is linked to the store customer, never used as its initial ID.
   await page.waitForFunction(()=>window.__purchases.logins.length===1);
   assert.deepEqual(await page.evaluate(()=>window.__purchases.logins),['annual-user']);
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
   assert.deepEqual(await page.evaluate(()=>window.__purchases.configured),[null]);
   // Payment stays with the store account: signing out unlinks the YOEO account, and Restore Purchases in Settings brings Pro back without one.
   await page.evaluate(()=>window.__setEntitlement(true));
   await page.locator('.profile-brand .badge.pro').waitFor();
   await page.getByRole('button',{name:'Sign out',exact:true}).click();
   await page.getByRole('heading',{name:'Guest',exact:true}).waitFor();
   await page.locator('.profile-brand .badge.free').waitFor();
   assert.equal(await page.evaluate(()=>window.__purchases.logouts),1,'Sign-out returns the SDK to an anonymous store customer');
   assert.deepEqual(await page.evaluate(()=>window.__purchases.configured),[null],'Sign-out must not reconfigure the store customer');
   await page.getByRole('button',{name:'Settings',exact:true}).click();
   await page.getByRole('button',{name:'Restore Purchases',exact:true}).click();
   await page.getByText('Purchases restored. YOEO Pro is active.').waitFor();
   await page.getByRole('button',{name:'Go back',exact:true}).click();
   await page.locator('.profile-brand .badge.pro').waitFor();
  }
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('Profile subscription checks passed: active annual native entitlement overrides Free scan status, Pro has no subtitle/count, free counts remain, web Pro, purchase/restore updates, foreground expiry refresh, stale reads, account linking on sign-in, unlinking on sign-out, and Restore Purchases from Settings. All purchase/API data is mocked.');
} catch(error) {
 for(const page of browser.contexts().flatMap(context=>context.pages())) {
  console.error(await page.locator('body').innerText());
  await page.screenshot({path:'test-results/profile-subscription/failure.png'});
 }
 throw error;
} finally {await browser.close();}
