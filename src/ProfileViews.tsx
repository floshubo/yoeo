import {useEffect,useMemo,useState} from 'react';
import { Capacitor } from '@capacitor/core';
import { LegalLinks, openExternal } from './LegalLinks';
import {Avatar,Icon,Button,Badge,Navigation,AllergenRow} from './components';
import type {Report,Severity} from './types';
import type {CustomerInfo,PurchasesPackage} from '@revenuecat/purchases-capacitor';
import {
 configureRevenueCat,getRevenueCatCustomerInfo,hasProEntitlement,listenForCustomerInfo,
 presentRevenueCatCustomerCenter,
 purchaseErrorMessage,purchaseRevenueCatPackage,restoreRevenueCatPurchases,revenueCatIsNative,
 type RevenueCatSnapshot,
} from './revenuecat';
import {useI18n} from './i18n';

export function ProfileHeading({title,avatar,onBack,backLabel='Back'}:{title:string;avatar?:string;onBack:()=>void;backLabel?:string}) {
  const {t}=useI18n();
  return <header className="profile-detail-header"><div><button onClick={onBack} aria-label={t("Go back")}><Icon name="back"/><span>{t(backLabel)}</span></button><button onClick={onBack} aria-label={t("Return to previous screen")}><Avatar src={avatar} size={24}/></button></div><h1>{t(title)}</h1></header>;
}
export function SavedReports({reports,avatar,onOpen,onDelete,navigate,onBack}:{reports:Report[];avatar?:string;onOpen:(r:Report)=>void;onDelete:(id:string)=>void;navigate:(s:string)=>void;onBack:()=>void}) {
 const {t,language}=useI18n();
 const [filter,setFilter]=useState('All');
 const filtered=reports.map(r=>({...r,dishes:r.dishes.filter(d=>filter==='All'||d.status===filter)})).filter(r=>r.dishes.length);
 return <div className="page profile-detail"><ProfileHeading title="Saved Results" avatar={avatar} onBack={onBack}/><div className="scroll-body padded"><div className="tabs report-tabs" role="tablist" aria-label={t("Filter saved results")}>{['All','Critical','Avoid'].map(f=><button key={f} role="tab" aria-selected={f===filter} className={`${f.toLowerCase()} ${filter===f?'selected':''}`} onClick={()=>setFilter(f)}>{t(f)}</button>)}</div>
 {filtered.map(r=><article className="saved-report" key={r.id}><div className="saved-report-heading"><button onClick={()=>onOpen(reports.find(x=>x.id===r.id)!)}><h2>{r.title}</h2><small>{new Date(r.createdAt).toLocaleDateString(language)} · {new Date(r.createdAt).toLocaleTimeString(language,{hour:'2-digit',minute:'2-digit'})}</small></button><button className="text-button" aria-label={t("Delete {title}",{title:r.title})} onClick={()=>onDelete(r.id)}>×</button></div>{r.dishes.map(d=><button key={d.id} className="saved-dish" onClick={()=>onOpen(reports.find(x=>x.id===r.id)!)}><h3>{d.name}</h3>{d.allergens.filter(a=>a.severity==='Critical'||a.severity==='Avoid').map((a,i)=><AllergenRow key={i} item={{name:a.name,severity:a.severity as Severity}}/>)}{d.status==='Uncertain'&&<div className="uncertain-result"><span className="question-mark">?</span><span>{t("No tracked allergens detected")}<br/><small>{t("Confirm ingredients before eating")}</small></span><Badge value="Uncertain"/></div>}</button>)}</article>)}
 {!filtered.length&&<div className="empty-profile"><Icon name="bookmark" size={48}/><h2>{t(reports.length?'No matching results':'Your results, in one place')}</h2><p>{t(reports.length?'Choose another filter to see your saved analyses.':'Save an analysis to come back to it here.')}</p></div>}</div><Navigation active="profile" onChange={navigate}/></div>;
}
type PlanId='monthly'|'yearly'|'lifetime';
const planLabels:Record<PlanId,string>={monthly:'Monthly',yearly:'Annual',lifetime:'Lifetime'};
function packageFor(plan:PlanId,snapshot:RevenueCatSnapshot|null):PurchasesPackage|null {
 const offering=snapshot?.offering;
 if(!offering)return null;
 if(plan==='monthly')return offering.monthly||offering.availablePackages.find(p=>p.product.identifier==='monthly')||null;
 if(plan==='yearly')return offering.annual||offering.availablePackages.find(p=>p.product.identifier==='yearly')||null;
 return offering.lifetime||offering.availablePackages.find(p=>p.product.identifier==='lifetime')||null;
}
export function Subscription({signedIn,onBack,onSignIn,onActivated}:{signedIn:boolean;onBack:()=>void;onSignIn:()=>void;onActivated?:(event:'purchase'|'restore')=>void}) {
 const native=revenueCatIsNative();
 const testStore=import.meta.env.MODE==='revenuecat-test';
 const [plan,setPlan]=useState<PlanId>('yearly');
 const [snapshot,setSnapshot]=useState<RevenueCatSnapshot|null>(null);
 const [loading,setLoading]=useState(native);
 const [busy,setBusy]=useState(false);
 const [reload,setReload]=useState(0);
 const [message,setMessage]=useState('');
 const pro=hasProEntitlement(snapshot?.customerInfo||null);
 const selectedPackage=useMemo(()=>packageFor(plan,snapshot),[plan,snapshot]);

 useEffect(()=>{
  if(!native)return;
  setLoading(true);setSnapshot(null);setMessage('');
  let active=true;
  let stop:undefined|(()=>void);
  void configureRevenueCat().then(data=>{
   if(!active)return;
   setSnapshot(data);
   setLoading(false);
   stop=listenForCustomerInfo((customerInfo:CustomerInfo)=>setSnapshot(current=>current?{...current,customerInfo}:current));
  }).catch(async error=>{
   // Purchases already made stay visible even when the product catalog is unavailable.
   const customerInfo=await getRevenueCatCustomerInfo().catch(()=>null);
   if(!active)return;
   if(customerInfo)setSnapshot({customerInfo,offering:null});
   setMessage(purchaseErrorMessage(error));setLoading(false);
  });
  return()=>{active=false;stop?.();};
 },[native,reload]);

 async function run(action:()=>Promise<CustomerInfo|null>,success:string,event:'purchase'|'restore'){
  setBusy(true);setMessage('');
  try{const customerInfo=await action();if(!customerInfo)throw Error('Purchases are available in the mobile app.');setSnapshot(current=>({offering:current?.offering||null,customerInfo}));const active=hasProEntitlement(customerInfo);setMessage(active?success:'No active YOEO Pro purchase was found for this store account.');if(active)onActivated?.(event);}
  catch(error){const text=purchaseErrorMessage(error);if(text)setMessage(text);}
  finally{setBusy(false);}
 }
 return <div className="page profile-detail subscription-page"><button type="button" className="subscription-close" onClick={onBack} aria-label="Close subscription">×</button><div className="scroll-body subscription-body">
  <img className="subscription-hero" src="/subscription-hero.png" alt="" />
  <div className="subscription-content">
   <h2>{pro?'YOEO Pro is active':'Get Started with YOEO Pro'}</h2>
   <p className="subscription-account-note">No YOEO account needed. Purchase and restore with your store account.</p>
   <ul className="subscription-benefits"><li><img src="/subscription-check.svg" alt=""/>Unlimited allergen profiles</li><li><img src="/subscription-check.svg" alt=""/>Unlimited scans and analyses</li><li><img src="/subscription-check.svg" alt=""/>Full scan history</li></ul>
   <div className="subscription-plans" role="radiogroup" aria-label="Choose a plan">{(['monthly','yearly','lifetime'] as PlanId[]).map(id=>{const option=packageFor(id,snapshot);const price=loading?'Loading…':option?.product.priceString|| (native?'Unavailable':'In mobile app');return <button type="button" key={id} role="radio" aria-checked={plan===id} className={`subscription-plan ${plan===id?'selected':''}`} onClick={()=>setPlan(id)}><span><strong>{planLabels[id]}</strong><b>{price}{option&&id!=='lifetime'?id==='monthly'?'/month':'/year':''}</b></span>{plan===id?<img src="/subscription-selected.svg" alt=""/>:<span className="subscription-unselected" aria-hidden="true"/>}</button>;})}</div>
   {!native?<Button disabled>Available in the mobile app</Button>:pro?<Button secondary disabled={busy} onClick={()=>void presentRevenueCatCustomerCenter().catch(error=>setMessage(purchaseErrorMessage(error)))}>Manage subscription</Button>:<Button disabled={busy||loading||!selectedPackage} onClick={()=>selectedPackage&&void run(()=>purchaseRevenueCatPackage(selectedPackage),'YOEO Pro is active.','purchase')}>{busy?'Please wait…':selectedPackage?'Continue':'Product not available'}</Button>}
   {native&&!loading&&!snapshot?.offering&&!pro&&<button className="text-button" disabled={busy} onClick={()=>setReload(value=>value+1)}>Retry loading plans</button>}
   <div className="subscription-links">{native&&<button className="text-button" disabled={busy} onClick={()=>void run(restoreRevenueCatPurchases,'Purchases restored. YOEO Pro is active.','restore')}>Restore Purchases</button>}<LegalLinks /></div>
   <p className="privacy-note">Already subscribed? Restore purchases on any supported device using the same store account.</p>
   {!signedIn&&<div className="subscription-optional-account"><p>You can sign in or create a YOEO account at any time. It is not needed to use Pro.</p><button className="text-button" disabled={busy} onClick={onSignIn}>Sign in or create account (optional)</button></div>}
   <p className="privacy-note">Monthly and annual subscriptions renew automatically unless canceled at least 24 hours before the current period ends. Payment is charged to your store account at confirmation. Lifetime is a one-time purchase.</p>
   {Capacitor.getPlatform()==='ios'&&<button className="text-button" onClick={()=>void openExternal('https://apps.apple.com/account/subscriptions').catch(()=>setMessage('Could not open subscription settings.'))}>Apple subscription settings</button>}
  {testStore&&<p className="subscription-message" role="status">Test Store — simulated purchases with an anonymous test customer. No payment will be charged.</p>}
  {message&&<p className="subscription-message" role="status">{message}</p>}
  {!native&&<p className="privacy-note">Subscriptions are available in the iPhone and Android apps.</p>}
  {native&&!loading&&!snapshot?.offering&&<p className="privacy-note">Plans are currently unavailable. Please try again later.</p>}
  </div>
 </div></div>;
}
