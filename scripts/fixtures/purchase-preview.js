/* Only injected by scripts/purchase-preview.mjs. No live purchases or external APIs. */
(() => {
 const id='$RCAnonymousID:'+'d'.repeat(32);
 let pro=false, cancel=false, catalogUnavailable=false, nextId=0, linked=null;
 const callbacks=new Map();
 const notify=customerInfo=>{for(const item of callbacks.values())if(item.event==='customerInfo')item.callback(customerInfo);};
 const note=text=>{const status=document.querySelector('#preview-status');if(status)status.textContent=text;};
 const info=()=>({originalAppUserId:linked||id,entitlements:{active:pro?{yoeo_pro:{isActive:true,productIdentifier:'yearly'}}:{}},managementURL:'https://apps.apple.com/account/subscriptions'});
 const sync=async()=>{pro=(await (await fetch('/__preview/state')).json()).pro;return info();};
 const setPro=async value=>{await fetch('/__preview/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pro:value})});await sync();for(const item of callbacks.values())if(item.event==='customerInfo')item.callback(info());};
 const plans=[['monthly','$rc_monthly','MONTHLY','$2.99'],['yearly','$rc_annual','ANNUAL','$19.99'],['lifetime','$rc_lifetime','LIFETIME','$49.99']].map(([identifier,packageId,packageType,priceString])=>({identifier:packageId,packageType,product:{identifier,priceString},presentedOfferingContext:{offeringIdentifier:'default'}}));
 const offerings={current:{identifier:'default',availablePackages:plans,monthly:plans[0],annual:plans[1],lifetime:plans[2]}};
 if(!localStorage.getItem('yoeo-profile'))localStorage.setItem('yoeo-profile',JSON.stringify({name:'Guest',completed:true,allergens:[{name:'Milk',severity:'Critical'}]}));
 localStorage.setItem('yoeo-language','en');
 sessionStorage.setItem('yoeo-install-guide-seen','1');
 window.webkit={messageHandlers:{bridge:{}}};
 window.Capacitor={
  PluginHeaders:[
   {name:'Purchases',methods:['setLogLevel','configure','isAnonymous','getAppUserID','logIn','logOut','getCustomerInfo','getOfferings','purchasePackage','restorePurchases','syncPurchases','removeCustomerInfoUpdateListener'].map(name=>({name,rtype:'promise'})).concat([{name:'addCustomerInfoUpdateListener',rtype:'callback'}])},
   {name:'RevenueCatUI',methods:[{name:'presentCustomerCenter',rtype:'promise'}]},
   {name:'App',methods:[{name:'getLaunchUrl',rtype:'promise'},{name:'addListener',rtype:'callback'},{name:'removeListener',rtype:'promise'}]},
   {name:'Haptics',methods:[{name:'impact',rtype:'promise'}]},
  ],
  nativePromise:async(plugin,method,options)=>{
   if(plugin==='Purchases'){
    if(method==='isAnonymous')return {isAnonymous:!linked};
    if(method==='getAppUserID')return {appUserID:linked||id};
    // Signing in links the store customer to the YOEO account; the purchase itself stays with the store account.
    if(method==='logIn'){linked=options.appUserID;const customerInfo=await sync();notify(customerInfo);note('Demo: store customer linked to YOEO account '+linked+'. The same subscription would now follow this account to Android.');return {created:true,customerInfo};}
    if(method==='logOut'){linked=null;const customerInfo=await sync();notify(customerInfo);note('Demo: signed out of YOEO. The store customer is anonymous again; Restore Purchases still works.');return {customerInfo};}
    if(method==='getCustomerInfo')return {customerInfo:await sync()};
    if(method==='getOfferings'){if(catalogUnavailable)throw Error('Demo: the store catalog is unavailable. Restore Purchases still works.');return offerings;}
    if(method==='purchasePackage'){
     if(cancel){cancel=false;throw {code:'1',message:'Purchase cancelled'};}
     await setPro(true);return {customerInfo:info()};
    }
    if(method==='restorePurchases'){await setPro(true);return {customerInfo:info()};}
    if(method==='removeCustomerInfoUpdateListener')callbacks.delete(options.listenerToRemove);
   }
   if(plugin==='RevenueCatUI'){document.querySelector('#preview-status').textContent='Demo: a real device opens the store subscription manager.';}
   if(method==='removeListener')callbacks.delete(options.callbackId);
   return {};
  },
  nativeCallback:(_plugin,method,options,callback)=>{
   if(typeof options==='function')callback=options;
   const callbackId=String(++nextId);callbacks.set(callbackId,{event:method==='addCustomerInfoUpdateListener'?'customerInfo':options.eventName,callback});
   return Promise.resolve(callbackId);
  },
 };
 document.addEventListener('DOMContentLoaded',()=>{
  const style=document.createElement('style');style.textContent='#root{position:fixed!important;inset:104px 0 0!important;height:auto!important;min-height:0!important;margin:0!important}#root .app-shell{height:100%!important;min-height:0!important}#purchase-preview-toolbar{position:fixed;inset:0 0 auto;z-index:9999;height:104px;box-sizing:border-box;padding:8px 12px;background:#17331b;color:white;font:12px/18px system-ui;text-align:center;overflow:auto}#purchase-preview-toolbar button{font:11px system-ui;border:1px solid #ffffff70;border-radius:7px;color:white;background:transparent;padding:5px 8px;margin:3px;cursor:pointer}#preview-status{font-size:11px;color:#d5eacb}';document.head.append(style);
  const bar=document.createElement('aside');bar.id='purchase-preview-toolbar';bar.innerHTML='<strong>Interactive preview · sample prices · no charges</strong><div><button id="preview-reset">Reset guest</button><button id="preview-expire">Expire Pro</button><button id="preview-cancel">Cancel next purchase</button><button id="preview-catalog">Toggle catalog outage</button><button id="preview-exhaust">Use 3 free scans</button></div><div id="preview-status">Profile → Subscription to try a guest purchase or restore.</div>';document.body.append(bar);
  const status=text=>document.querySelector('#preview-status').textContent=text;
  document.querySelector('#preview-reset').onclick=async()=>{await setPro(false);for(const key of ['yoeo-account-session','yoeo-guest-token','yoeo-reports','yoeo-store-customer','yoeo-link-prompt-seen'])localStorage.removeItem(key);sessionStorage.removeItem('yoeo-upgrade');location.reload();};
  document.querySelector('#preview-expire').onclick=async()=>{await setPro(false);status('Pro expired. Further paid scans require an active purchase.');};
  document.querySelector('#preview-cancel').onclick=()=>{cancel=true;status('The next purchase will be cancelled. No error or account screen should appear.');};
  document.querySelector('#preview-catalog').onclick=()=>{catalogUnavailable=!catalogUnavailable;status(catalogUnavailable?'Catalog offline. Reopen Subscription; Restore Purchases remains available.':'Catalog available again. Reopen Subscription or tap Retry loading plans.');};
  document.querySelector('#preview-exhaust').onclick=async()=>{
   for(let i=0;i<3;i++){
    const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json','X-YOEO-Purchase-ID':id},body:JSON.stringify({images:[],text:'Preview menu',profile:[],guestToken:localStorage.getItem('yoeo-guest-token')||undefined})});
    const data=await r.json();if(data.usageToken)localStorage.setItem('yoeo-guest-token',data.usageToken);
   }
   status('Free scans used. Home → Start Analyzing now offers Pro without sign-in.');
  };
 });
})();
