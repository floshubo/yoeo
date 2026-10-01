import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import config from '../server/revenuecat-config.json' with { type: 'json' };

function sdkFixture(mode='production', {offeringError=false, pro=false}={}) {
 const calls=[];
 let customer='';
 const purchases={
  setLogLevel:async()=>{},
  configure:async options=>{calls.push(['configure',options.apiKey,options.appUserID]);await new Promise(r=>setTimeout(r,5));customer=options.appUserID;},
  logIn:async({appUserID})=>{calls.push(['login',appUserID]);customer=appUserID;},
  logOut:async()=>{calls.push(['logout']);customer=null;},
  getCustomerInfo:async()=>({customerInfo:{originalAppUserId:customer,entitlements:{active:pro?{[config.entitlementId]:{isActive:true,productIdentifier:'yearly'}}:{}}}}),
  getOfferings:async()=>{if(offeringError)throw Error('Store catalog unavailable');return {current:{identifier:'default',availablePackages:[]}};},
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
 return {sdk:exports,calls};
}

test('concurrent RevenueCat setup configures once and preserves each account snapshot',async()=>{
 const {sdk,calls}=sdkFixture();
 const results=await Promise.all([sdk.configureRevenueCat('first'),sdk.configureRevenueCat('first'),sdk.configureRevenueCat('second'),sdk.configureRevenueCat(null)]);
 assert.deepEqual(calls,[['configure',config.iosPublicApiKey,'first'],['login','second'],['logout']]);
 assert.deepEqual(results.map(x=>x.customerInfo.originalAppUserId),['first','first','second',null]);
});

test('only explicit Test Store build mode uses the test key',async()=>{
 for(const mode of ['production','revenuecat-test']){
  const {sdk,calls}=sdkFixture(mode);
  await sdk.configureRevenueCat('tester');
  assert.equal(calls[0][1],mode==='production'?config.iosPublicApiKey:config.testPublicApiKey);
 }
});

test('annual Pro entitlement can be read when store offerings fail',async()=>{
 const {sdk}=sdkFixture('production',{offeringError:true,pro:true});
 await assert.rejects(sdk.configureRevenueCat('annual-subscriber'),/Store catalog unavailable/);
 const info=await sdk.getRevenueCatCustomerInfo('annual-subscriber');
 assert.equal(info.originalAppUserId,'annual-subscriber');
 assert.equal(sdk.hasProEntitlement(info),true);
});

test('entitlement-only reads preserve identity ordering across account changes',async()=>{
 const {sdk,calls}=sdkFixture();
 const results=await Promise.all([sdk.getRevenueCatCustomerInfo('first'),sdk.configureRevenueCat('second'),sdk.getRevenueCatCustomerInfo(null)]);
 assert.deepEqual(calls,[['configure',config.iosPublicApiKey,'first'],['login','second'],['logout']]);
 assert.equal(results[0].originalAppUserId,'first');
 assert.equal(results[1].customerInfo.originalAppUserId,'second');
 assert.equal(results[2].originalAppUserId,null);
 assert.equal(sdk.hasProEntitlement(results[0]),false);
});
