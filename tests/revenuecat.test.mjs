import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import config from '../server/revenuecat-config.json' with { type: 'json' };

const anonymousA='$RCAnonymousID:'+'a'.repeat(32);
const anonymousB='$RCAnonymousID:'+'b'.repeat(32);
// cached: the App User ID the SDK remembers from the previous launch. entitled: customers holding yoeo_pro.
// known: identified customers RevenueCat already has, so logIn cannot merge the anonymous customer into them.
function sdkFixture(mode='production',{offeringError=false,cached=anonymousA,session=false,entitled=[],known=[],syncError=false}={}) {
 const calls=[];
 let customer=cached;
 const pro=new Set(entitled);
 const accounts=new Set(known);
 const store=new Map(session?[['yoeo-account-session','token']]:[]);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)}});
 const info=()=>({originalAppUserId:customer,entitlements:{active:pro.has(customer)?{[config.entitlementId]:{isActive:true,productIdentifier:'yearly'}}:{}}});
 // The App Store receipt on this device follows whichever customer restores or syncs it.
 const transfer=()=>{pro.clear();pro.add(customer);};
 const purchases={
  setLogLevel:async()=>{},
  configure:async options=>{calls.push(['configure',options.apiKey,options.appUserID]);await new Promise(r=>setTimeout(r,5));},
  getAppUserID:async()=>({appUserID:customer}),
  logIn:async({appUserID})=>{calls.push(['login',appUserID]);const created=!accounts.has(appUserID);if(created){accounts.add(appUserID);if(pro.has(customer))pro.add(appUserID);}customer=appUserID;return {created,customerInfo:info()};},
  logOut:async()=>{calls.push(['logout']);customer=anonymousB;return {customerInfo:info()};},
  syncPurchases:async()=>{calls.push(['sync']);if(syncError)throw Error('Store offline');transfer();},
  getCustomerInfo:async()=>({customerInfo:info()}),
  getOfferings:async()=>{if(offeringError)throw Error('Store catalog unavailable');return {current:{identifier:'default',availablePackages:[]}};},
  purchasePackage:async()=>{calls.push(['purchase']);pro.add(customer);return {customerInfo:info()};},
  restorePurchases:async()=>{calls.push(['restore']);transfer();return {customerInfo:info()};},
 };
 const dependencies={
  '@capacitor/core':{Capacitor:{isNativePlatform:()=>true,getPlatform:()=>'ios'}},
  '@revenuecat/purchases-capacitor':{Purchases:purchases,LOG_LEVEL:{WARN:'WARN'},ENTITLEMENT_VERIFICATION_MODE:{INFORMATIONAL:'INFORMATIONAL'}},
  '@revenuecat/purchases-capacitor-ui':{},
  '../server/revenuecat-config.json':config,
 };
 const source=readFileSync(new URL('../src/revenuecat.ts',import.meta.url),'utf8').replaceAll('import.meta.env',JSON.stringify({MODE:mode,DEV:false}));
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const exports={};
 new Function('require','exports',compiled)(name=>{assert.ok(name in dependencies);return dependencies[name];},exports);
 return {sdk:exports,calls,store,pro,customer:()=>customer};
}

test('concurrent setup, entitlement reads and request headers share one anonymous identity',async()=>{
 const {sdk,calls,store}=sdkFixture();
 const results=await Promise.all([sdk.configureRevenueCat(),sdk.getRevenueCatCustomerInfo(),sdk.purchaseHeaders()]);
 assert.deepEqual(calls,[['configure',config.iosPublicApiKey,undefined]]);
 assert.equal(results[0].customerInfo.originalAppUserId,anonymousA);
 assert.equal(results[1].originalAppUserId,anonymousA);
 assert.deepEqual(results[2],{'X-YOEO-Purchase-ID':anonymousA});
 assert.equal(store.get('yoeo-store-customer'),anonymousA);
});

test('only explicit Test Store build mode uses the test key',async()=>{
 for(const mode of ['production','revenuecat-test']){
  const {sdk,calls}=sdkFixture(mode);
  await sdk.configureRevenueCat();
  assert.equal(calls[0][1],mode==='production'?config.iosPublicApiKey:config.testPublicApiKey);
 }
});

test('restores and entitlement reads work even when the product catalog fails',async()=>{
 const {sdk}=sdkFixture('production',{offeringError:true});
 await assert.rejects(sdk.configureRevenueCat(),/Store catalog unavailable/);
 assert.equal(sdk.hasProEntitlement(await sdk.restoreRevenueCatPurchases()),true);
 assert.equal(sdk.hasProEntitlement(await sdk.getRevenueCatCustomerInfo()),true);
 assert.deepEqual(await sdk.purchaseHeaders(),{'X-YOEO-Purchase-ID':anonymousA});
});

test('guest purchase configures the SDK and unlocks Pro without a YOEO account',async()=>{
 const {sdk,calls}=sdkFixture();
 assert.equal(sdk.hasProEntitlement(await sdk.purchaseRevenueCatPackage({identifier:'yearly'})),true);
 assert.deepEqual(calls.map(c=>c[0]),['configure','purchase']);
});

test('signing in links the device purchase to a new YOEO account; signing out returns to a fresh store customer',async()=>{
 const {sdk,calls,pro}=sdkFixture();
 await sdk.purchaseRevenueCatPackage({identifier:'yearly'});
 await sdk.setRevenueCatAccount('account-1');
 assert.equal(sdk.hasProEntitlement(await sdk.getRevenueCatCustomerInfo()),true,'The account inherits the anonymous purchase');
 assert.ok(pro.has('account-1'));
 assert.deepEqual(await sdk.purchaseHeaders(),{'X-YOEO-Purchase-ID':anonymousA},'The device keeps identifying itself by its store customer');
 await sdk.setRevenueCatAccount('account-1');
 await sdk.setRevenueCatAccount(null);
 assert.equal(sdk.hasProEntitlement(await sdk.getRevenueCatCustomerInfo()),false,'A signed-out device no longer carries the account');
 assert.deepEqual(await sdk.purchaseHeaders(),{'X-YOEO-Purchase-ID':anonymousB});
 assert.equal(sdk.hasProEntitlement(await sdk.restoreRevenueCatPurchases()),true,'Restore Purchases recovers the App Store receipt without an account');
 assert.deepEqual(calls.map(c=>c[0]),['configure','purchase','login','logout','restore']);
});

test('linking to an account RevenueCat already knows moves this device receipt to it once',async()=>{
 const {sdk,calls,pro}=sdkFixture('production',{entitled:[anonymousA],known:['account-2']});
 await sdk.setRevenueCatAccount('account-2');
 assert.equal(sdk.hasProEntitlement(await sdk.getRevenueCatCustomerInfo()),true);
 assert.ok(pro.has('account-2'));
 await sdk.setRevenueCatAccount('account-2');
 assert.deepEqual(calls.map(c=>c[0]),['configure','login','sync']);
});

test('an offline receipt sync after linking can be repeated with Restore Purchases',async()=>{
 const {sdk,calls}=sdkFixture('production',{entitled:[anonymousA],known:['account-3'],syncError:true});
 await sdk.setRevenueCatAccount('account-3');
 assert.equal(sdk.hasProEntitlement(await sdk.getRevenueCatCustomerInfo()),false);
 assert.equal(sdk.hasProEntitlement(await sdk.restoreRevenueCatPurchases()),true);
 assert.deepEqual(calls.map(c=>c[0]),['configure','login','sync','restore']);
});

test('a linked account stays linked across launches while its YOEO session exists',async()=>{
 const fixture=sdkFixture('production',{cached:'account-4',session:true,entitled:['account-4']});
 fixture.store.set('yoeo-store-customer',anonymousA);
 const {sdk,calls}=fixture;
 assert.equal(sdk.hasProEntitlement(await sdk.getRevenueCatCustomerInfo()),true);
 assert.deepEqual(await sdk.purchaseHeaders(),{'X-YOEO-Purchase-ID':anonymousA});
 await sdk.setRevenueCatAccount('account-4');
 assert.deepEqual(calls.map(c=>c[0]),['configure'],'No logout or re-login on launch');
});

test('a cached account identity without a YOEO session returns to a store-only customer',async()=>{
 const {sdk,calls}=sdkFixture('production',{cached:'account-5',session:false,entitled:['account-5']});
 assert.equal(sdk.hasProEntitlement(await sdk.getRevenueCatCustomerInfo()),false);
 assert.deepEqual(await sdk.purchaseHeaders(),{'X-YOEO-Purchase-ID':anonymousB});
 assert.equal(sdk.hasProEntitlement(await sdk.restoreRevenueCatPurchases()),true);
 assert.deepEqual(calls.map(c=>c[0]),['configure','logout','restore']);
});
