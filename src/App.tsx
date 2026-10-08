import { useEffect, useRef, useState } from "react";
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import {
  AllergenRow,
  Avatar,
  Badge,
  Brand,
  Button,
  Icon,
  IconButton,
  Modal,
  Navigation,
  ProfileList,
  Topbar,
} from "./components";
import { groups, allergenGroups, icons, imageFor, severities } from "./data";
import {SavedReports, Subscription} from './ProfileViews';
import { downloadJson, processAvatar, readStored, writeStored } from "./storage";
import type { Preference, Profile, Report, Severity } from "./types";
import Scanner from "./Scanner";
import { LegalLinks, openExternal } from './LegalLinks';
import Results from "./Results";
import Account from './Account';
import ResetPassword from './ResetPassword';
import DataSources from './DataSources';
import { tapFeedback } from './mobile';
import {acceptAccountSessionFromUrl,accountHeaders,apiUrl,clearAccountSession,completeNativeOAuth,completeOAuthFromUrl,hasAccountSession,storeAccountSession} from './api';
import { useI18n } from './i18n';

import {useNavigation} from './useNavigation';
import {useProSubscription} from './useProSubscription';
import {fetchScanUsage} from './usage';
import {hasProEntitlement,purchaseErrorMessage,restoreRevenueCatPurchases,revenueCatIsNative,setRevenueCatAccount} from './revenuecat';
import {accountSync,mergeReports,reportsForAccount} from './accountSync';
acceptAccountSessionFromUrl();

function pendingUpgrade(): {report: Report|null; active: boolean} {
  try {return JSON.parse(sessionStorage.getItem('yoeo-upgrade') || 'null') || {report: null, active: false};}
  catch {return {report: null, active: false};}
}

const emptyProfile: Profile = { name: "", allergens: [], completed: false };
export default function App() {
  const {t}=useI18n();
  const [profile, setProfile] = useState<Profile>(() => {
    const p = readStored<Profile>("yoeo-profile", emptyProfile);
    return typeof p?.name === "string" && Array.isArray(p.allergens)
      ? p
      : emptyProfile;
  });
  const {screen, navigate: go, back, reset} = useNavigation(
    new URLSearchParams(location.search).has('account') || new URLSearchParams(location.search).has('oauth') ? 'account' : profile.completed ? "home" : "start",
  );
  const [category, setCategory] = useState(0);
  const [choice, setChoice] = useState<Severity | null>(null);
  const [selectionTick, setSelectionTick] = useState(0);
  const [draft, setDraft] = useState<Preference[]>(profile.allergens);
  const [name, setName] = useState(profile.name);
  const [sheet, setSheet] = useState(false);
  const [scanSession, setScanSession] = useState(false);
  useEffect(()=>{if(screen==='home'||screen==='results')setScanSession(false);},[screen]);
  const [scanMode, setScanMode] = useState<"camera" | "photo">("photo");
  const [tab, setTab] = useState<Severity | 'All'>("Critical");
  const [allergenQuery,setAllergenQuery]=useState('');
  const [opened, setOpened] = useState<string[]>([]);
  const [editing, setEditing] = useState<Preference | null>(null);
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("Milk");
  const [addSeverity, setAddSeverity] = useState<Severity>("Avoid");
  const [toast, setToast] = useState("");
  const [report, setReport] = useState<Report | null>(() => pendingUpgrade().report);
  const [saved, setSaved] = useState<Report[]>(() =>
    readStored("yoeo-reports", []),
  );
  const [fromSaved, setFromSaved] = useState(false);
  const [health, setHealth] = useState<{
    configured: boolean;
    provider: string;
    model: string;
    requiresAccessToken: boolean;
  } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deletionStatus,setDeletionStatus] = useState<'idle'|'deleting'|'complete'>('idle');
  const [deletedAccount,setDeletedAccount] = useState(false);
  const deleting=deletionStatus==='deleting';
  const [accessToken, setAccessToken] = useState("");
  const [accountEmail, setAccountEmail] = useState('');
  const [signedIn, setSignedIn] = useState(hasAccountSession);
  const [authReady,setAuthReady]=useState(()=>!new URLSearchParams(location.search).has('oauth'));
  const [accountReturn,setAccountReturn]=useState<string|null>(()=>sessionStorage.getItem('yoeo-account-return'));
  const [accountId, setAccountId] = useState<string|null>(null);
  const [accountAvatar,setAccountAvatar]=useState<string|null>(null);
  const customAvatar=signedIn ? accountId && profile.avatarOwnerId===accountId ? profile.avatar : undefined : profile.avatar;
  const shownAvatar=customAvatar || (signedIn?accountAvatar:undefined) || undefined;
  const [scanUsage,setScanUsage]=useState<{enforced:boolean;plan:string;remaining:number|null}|null>(null);
  const nativeSubscription = useProSubscription(screen === 'profile');
  const profileIsPro = nativeSubscription.pro === true || scanUsage?.plan === 'pro';
  const [checkingScanAccess,setCheckingScanAccess]=useState(false);
  useEffect(()=>{let active=true;if(screen==='profile')void fetchScanUsage().then(data=>{if(active)setScanUsage(data);}).catch(()=>{if(active)setScanUsage(null);});return()=>{active=false;};},[screen,signedIn,nativeSubscription.pro]);
  useEffect(()=>{if(!signedIn){setAccountEmail('');setAccountAvatar(null);setScanUsage(null);}},[signedIn]);
  // Payment stays with the App Store account. Signing in links the optional YOEO account to that
  // store customer so the subscription follows the account; signing out unlinks it again.
  useEffect(()=>{if(!revenueCatIsNative()||(signedIn&&!accountId))return;void setRevenueCatAccount(signedIn?accountId:null).catch(()=>undefined);},[signedIn,accountId]);
  const profileRef=useRef(profile);useEffect(()=>{profileRef.current=profile;},[profile]);
  const savedRef=useRef(saved);useEffect(()=>{savedRef.current=saved;},[saved]);
  const syncClient=useRef<ReturnType<typeof accountSync>|null>(null);
  const [syncRevision,setSyncRevision]=useState(0);
  const [syncError,setSyncError]=useState(false);
  useEffect(()=>{const retry=()=>{if(document.visibilityState==='visible')setSyncRevision(n=>n+1);};window.addEventListener('online',retry);document.addEventListener('visibilitychange',retry);return()=>{window.removeEventListener('online',retry);document.removeEventListener('visibilitychange',retry);};},[]);
  const pendingDeletes=(owner:string):string[]=>readStored<Record<string,string[]>>('yoeo-pending-report-deletes',{})[owner]||[];
  function finishDelete(owner:string,id:string){const all=readStored<Record<string,string[]>>('yoeo-pending-report-deletes',{});writeStored('yoeo-pending-report-deletes',{...all,[owner]:(all[owner]||[]).filter(value=>value!==id)});}
  function syncProfile(p:Profile){
    const client=syncClient.current;
    if(!client||!p.completed||!p.name.trim()||(p.syncOwnerId&&p.syncOwnerId!==client.ownerId))return;
    void client.pushProfile(p).then(({id})=>{if(syncClient.current!==client)return;const current=profileRef.current;if(current.syncOwnerId&&current.syncOwnerId!==client.ownerId)return;const next={...current,id,syncOwnerId:client.ownerId,syncPending:current===p?false:current.syncPending};writeStored('yoeo-profile',next);profileRef.current=next;setProfile(next);}).catch(()=>{if(syncClient.current===client)setSyncError(true);});
  }
  useEffect(()=>{
    if(!accountId){syncClient.current=null;setSyncError(false);return;}
    let active=true;
    const client=accountSync(accountId);syncClient.current=client;setSyncError(false);
    (async()=>{
      // Scan history: the account's copies plus anything saved on this device before signing in.
      try{
        const deletions=pendingDeletes(accountId);
        for(const id of deletions){if(!active)return;await client.removeReport(id);finishDelete(accountId,id);}
        const beforePull=savedRef.current;
        const cloud=await client.pullReports();if(!active)return;
        // A stale response must not resurrect a deletion or replace a result just saved.
        if(savedRef.current!==beforePull){setSyncRevision(n=>n+1);return;}
        const local=savedRef.current.map(r=>!r.syncOwnerId?{...r,syncOwnerId:accountId}:r);
        const merged=mergeReports(local,cloud.filter(r=>!pendingDeletes(accountId).includes(r.id)));
        writeStored('yoeo-reports',merged);savedRef.current=merged;setSaved(merged);
        const cloudIds=new Set(cloud.map(r=>r.id));
        for(const report of reportsForAccount(local,accountId).filter(r=>!cloudIds.has(r.id))){if(!active)return;await client.pushReport(report);}
      }catch{if(active)setSyncError(true);}
      // Allergen profile: a completed account profile wins; one set up before signing in is uploaded.
      try{
        if(!active)return;
        const [cloud]=await client.pullProfiles();if(!active)return;
        const local=profileRef.current;
        if(local.syncOwnerId===accountId&&local.syncPending){syncProfile(local);}
        else if(cloud?.completed){
          const avatar=cloud.avatar||(!local.syncOwnerId||local.syncOwnerId===accountId?local.avatar:undefined);
          const next:Profile={...local,id:cloud.id,name:cloud.name,allergens:cloud.allergens,completed:true,avatar,avatarOwnerId:avatar?accountId:undefined,syncOwnerId:accountId,syncPending:false};
          writeStored('yoeo-profile',next);profileRef.current=next;setProfile(next);
          if(!cloud.avatar&&avatar)syncProfile(next);
        }else if(local.completed&&local.name.trim()&&(!local.syncOwnerId||local.syncOwnerId===accountId)){
          const next={...local,id:cloud?.id,syncOwnerId:accountId,syncPending:true};writeStored('yoeo-profile',next);profileRef.current=next;setProfile(next);syncProfile(next);
        }
      }catch{if(active)setSyncError(true);}
    })();
    return()=>{active=false;if(syncClient.current===client)syncClient.current=null;};
  },[accountId,syncRevision]);
  useEffect(()=>{void completeOAuthFromUrl().then(completed=>{if(completed)setSignedIn(true);}).catch(e=>setToast(e instanceof Error?e.message:'Sign-in did not complete.')).finally(()=>setAuthReady(true));},[]);
  useEffect(()=>{
    if(!Capacitor.isNativePlatform())return;
    let active=true;
    const handle=(url:string)=>{void completeNativeOAuth(url).then(completed=>{if(active&&completed){setSignedIn(true);go('account');}}).catch(e=>{if(active)setToast(e instanceof Error?e.message:'Sign-in did not complete.');});};
    const listener=CapacitorApp.addListener('appUrlOpen',event=>handle(event.url));
    void CapacitorApp.getLaunchUrl().then(result=>{if(result?.url)handle(result.url);});
    return()=>{active=false;void listener.then(handle=>handle.remove());};
  },[]);
  useEffect(()=>{
    if(!hasAccountSession()){setAccountId(null);setAccountAvatar(null);return;}
    let active=true;
    fetch(apiUrl('/api/auth/session'),{headers:accountHeaders()}).then(async r=>{
      if(!active)return;
      if(!r.ok){setAccountId(null);setAccountAvatar(null);if(r.status===401){clearAccountSession();setSignedIn(false);}return;}
      const data=await r.json();if(!active)return;storeAccountSession(data);setSignedIn(true);setAccountId(data?.user?.id||null);setAccountAvatar(data?.user?.avatarUrl||null);
    }).catch(()=>{if(active){setSignedIn(hasAccountSession());setAccountId(null);}});
    return()=>{active=false;};
  },[signedIn]);
  useEffect(()=>{
    if(screen==='account'&&accountId&&accountReturn){const destination=accountReturn;sessionStorage.removeItem('yoeo-account-return');setAccountReturn(null);go(destination,true);}
  },[screen,accountId,accountReturn]);
  useEffect(() => {
    if (screen !== 'settings') return;
    setName(profile.name);
    setAccountEmail('');
    if (!signedIn) return;
    let active = true;
    fetch(apiUrl('/api/auth/session'), {headers: accountHeaders()})
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (active) { storeAccountSession(s); setAccountEmail(s?.user?.email || '');setAccountAvatar(s?.user?.avatarUrl||null); } })
      .catch(() => {});
    return () => { active = false; };
  }, [screen, profile.name, signedIn]);
  useEffect(() => { if(screen !== 'welcome-complete') return; const timer=setTimeout(()=>reset('home'),2200); return ()=>clearTimeout(timer); },[screen]);
  useEffect(() => {
    fetch(apiUrl("/api/health"))
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    document.title = `YOEO — ${screen === "start" ? "Eat safely everyday" : screen[0].toUpperCase() + screen.slice(1)}`;
  }, [screen]);
  useEffect(() => {
    const color = ['start', 'welcome-complete', 'onboarding', 'name', 'home', 'allergens', 'scan'].includes(screen) ? '#366823' : '#f1faeb';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    document.documentElement.style.setProperty('--app-chrome', color);
  }, [screen]);
  function persist(p: Profile) {
    try {
      const next=signedIn&&accountId?{...p,id:p.syncOwnerId===accountId?p.id:undefined,syncOwnerId:accountId,syncPending:true}:{...p,id:undefined,syncOwnerId:undefined,syncPending:false};
      writeStored("yoeo-profile", next);profileRef.current=next;
      setProfile(next);
      if (signedIn && accountId) syncProfile(next);
      return true;
    } catch {
      setToast("Could not save. Your browser storage may be full or disabled.");
      return false;
    }
  }
  function changeSeverity(item: Preference) {
    const all = [
      ...profile.allergens.filter((a) => a.name !== item.name),
      item,
    ];
    if (persist({ ...profile, allergens: all })) {
      setEditing(null);
      setAdding(false);
      setTab(item.severity);
      setToast("Allergen profile updated");
    }
  }
  function persistReport(r: Report) {
    try {
      const result=signedIn&&accountId&&!r.syncOwnerId?{...r,syncOwnerId:accountId}:r;
      const next = [result, ...savedRef.current.filter((x) => x.id !== r.id)].slice(0, 50);
      writeStored("yoeo-reports", next);
      savedRef.current=next;setSaved(next);
      setToast("Results saved on this device");
      const client=syncClient.current;
      if(client&&(!result.syncOwnerId||result.syncOwnerId===accountId)){
        finishDelete(client.ownerId,r.id);
        void client.pushReport(result).catch(()=>{if(syncClient.current===client)setSyncError(true);});
      }
      return true;
    } catch {
      setToast(
        "Storage is full. Download your report or delete older results.",
      );
      return false;
    }
  }
  function deleteSavedReport(id:string){
    try{
      const result=savedRef.current.find(r=>r.id===id);
      const client=syncClient.current;
      const shouldSync=client&&(!result?.syncOwnerId||result.syncOwnerId===client.ownerId);
      if(shouldSync){const all=readStored<Record<string,string[]>>('yoeo-pending-report-deletes',{});writeStored('yoeo-pending-report-deletes',{...all,[client.ownerId]:[...new Set([...(all[client.ownerId]||[]),id])]});}
      const next=savedRef.current.filter(r=>r.id!==id);writeStored('yoeo-reports',next);savedRef.current=next;setSaved(next);
      if(shouldSync)void client.removeReport(id).then(()=>finishDelete(client.ownerId,id)).catch(()=>{if(syncClient.current===client)setSyncError(true);});
    }catch{setToast('Could not update saved results.');}
  }
  const navigate = (s: string) => {
    go(s);
    setSheet(false);
  };
  async function startScan(){
    if(checkingScanAccess)return;
    setCheckingScanAccess(true);
    try{
      const usage=await fetchScanUsage();
      setScanUsage(usage);
      if(usage.enforced&&usage.plan!=='pro'&&(usage.remaining??0)<=0){setPremiumReason('scans');return;}
      setSheet(true);
    }catch{setToast(t('Could not check your scan availability. Please try again.'));}
    finally{setCheckingScanAccess(false);}
  }
  const [premiumReason, setPremiumReason] = useState<'scans'|null>(null);
  const [checkingSave, setCheckingSave] = useState(false);
  const saveLock = useRef(false);
  const [upgradeFlow, setUpgradeFlow] = useState(() => pendingUpgrade().active);
  // Shown once after the first purchase: an account is optional and only adds restore/sync across devices.
  const [linkPrompt,setLinkPrompt]=useState(false);
  const [accountMode,setAccountMode]=useState<'signin'|'signup'>('signin');
  const linkPromptSeen=()=>{try{return !!localStorage.getItem('yoeo-link-prompt-seen');}catch{return true;}};
  const markLinkPromptSeen=()=>{try{localStorage.setItem('yoeo-link-prompt-seen','1');}catch{/* Shown again next time. */}};
  const [restoring,setRestoring]=useState(false);
  useEffect(() => {
    if (screen === 'account' || screen === 'subscription') return;
    setUpgradeFlow(false);
    setAccountMode('signin');
    sessionStorage.removeItem('yoeo-upgrade');
  }, [screen]);
  function finishSave(r: Report) {
    if (!persistReport(r)) return;
    sessionStorage.removeItem('yoeo-upgrade');
    setUpgradeFlow(false);
    reset('saved');
  }
  async function saveReport(r: Report) {
    if (saveLock.current) return;
    saveLock.current = true; setCheckingSave(true);
    try {
      finishSave(r);
    } catch {setToast('Could not save results. Please try again.');}
    finally {saveLock.current = false; setCheckingSave(false);}
  }
  function completeUpgrade() {
    setScanUsage(null);
    sessionStorage.removeItem('yoeo-upgrade');setUpgradeFlow(false);reset('home');
  }
  async function restorePurchases() {
    if (restoring) return;
    setRestoring(true);
    try {
      const info = await restoreRevenueCatPurchases();
      setScanUsage(null);
      setToast(hasProEntitlement(info) ? t('Purchases restored. YOEO Pro is active.') : t('No active YOEO Pro purchase was found for this store account.'));
    } catch (error) {
      const text = purchaseErrorMessage(error);
      if (text) setToast(text);
    } finally {setRestoring(false);}
  }
  const nextCategory = () => {
    if (!choice) return;
    const g = groups[category];
    const next = [
      ...draft.filter((a) => !g.items.includes(a.name)),
      ...g.items.map((n) => ({ name: n, severity: choice })),
    ];
    setDraft(next);
    if (category === groups.length - 1) go("name");
    else {
      setCategory((v) => v + 1);
      setChoice(next.find(a=>groups[category+1].items.includes(a.name))?.severity ?? null);
    }
  };
  const currentGroup = groups[category];
  return (
    <main className={`app-shell screen-${screen}`}>
      {screen === "start" && (
        <div className="page welcome">
          <div className="welcome-brand">
            <img src={icons.logo} alt="" width="86" height="49" />
            <h1>YOEO</h1>
            <p>{t('Eat safely everyday')}</p>
          </div>
          <div className="fixed-actions">
            <Button
              secondary
              onClick={() => {
                setCategory(0);
                setChoice(null);
                setDraft([]);
                navigate("onboarding");
              }}
            >
              {t('Get started')}
            </Button>
          </div>
        </div>
      )}
      {screen === "onboarding" && (
        <div className="page onboarding">
          <div className="onboarding-heading">
            <h1>{t('What are you allergic to?')}</h1>
            <p>{t('Choose the severity for each category')}</p>
          </div>
          <div className="onboard-content">
            <div className="category-count">
              {category > 0 && (
                <button
                  aria-label={t('Previous category')}
                  onClick={() => {
                    if(choice) setDraft([...draft.filter(a=>!currentGroup.items.includes(a.name)),...currentGroup.items.map(name=>({name,severity:choice}))]);
                    setCategory((n) => n - 1);
                    setChoice(
                      draft.find((a) =>
                        groups[category - 1].items.includes(a.name),
                      )?.severity ?? null,
                    );
                  }}
                >
                  ‹
                </button>
              )}
              {t('Category {current} of {total}',{current:category+1,total:groups.length})}
            </div>
            <div className="stacked-card" key={category}>
              <h2>{t(currentGroup.name)}</h2>
              <div
                className={`mascot-panel ${(choice || "unselected").toLowerCase()}`}
              >
                <img
                  key={`${category}-${selectionTick}`}
                  src={
                    imageFor(currentGroup.items[0], choice || 'None', 'Lg')
                  }
                  alt={t(currentGroup.name)}
                  className={!choice ? "neutral-mascot" : `mascot-reaction reaction-${choice.toLowerCase()}`}
                />
                  <span key={`badge-${selectionTick}`} className={choice ? 'selection-badge' : ''} aria-live="polite"><Badge value={choice || t('Not selected yet')} /></span>
              </div>
              <div className="severity-options">
                {severities.map((s) => (
                  <button
                    key={s}
                    className={`${s.toLowerCase()} ${choice === s ? "chosen" : ""}`}
                    aria-pressed={choice === s}
                    onClick={() => { setChoice(s); setSelectionTick(n => n + 1); tapFeedback(); }}
                  >
                    {t(s)}
                  </button>
                ))}
              </div>
            </div>
            <p className="category-detail">
              {currentGroup.items.length > 1
                ? currentGroup.items.map(item=>t(item)).join(" · ")
                : ""}
            </p>
          </div>
          <div className="fixed-actions">
            <Button disabled={!choice} onClick={nextCategory}>
              {t('Next')}
            </Button>
          </div>
        </div>
      )}
      {screen === "name" && (
        <div className="page name-page">
          <div className="onboarding-heading">
            <h1>{t('What’s your name?')}</h1>
            <p>{t('Almost there — just one last step')}</p>
          </div>
          <form
            className="name-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                name.trim() &&
                persist({
                  name: name.trim(),
                  allergens: draft,
                  completed: true,
                })
              )
                navigate("welcome-complete");
            }}
          >
            <label className="field">
              {t('Your name')}
              <input
                autoComplete="given-name"
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="fixed-actions">
              <Button type="submit" disabled={!name.trim()}>
                {t('Let’s go')}
              </Button>
            </div>
          </form>
        </div>
      )}
      {screen === 'welcome-complete' && <div className="page welcome welcome-complete" role="status"><div className="welcome-brand"><img src={icons.logo} alt="" width="96" height="50"/><h1>{t('Welcome to YOEO!')}</h1><p>{t('Get ready to eat safely everyday')}</p></div><button className="visually-hidden" onClick={()=>reset('home')}>{t('Continue to home')}</button></div>}
      {screen === "home" && (
        <div className="page home">
          <div className="home-header">
            <Brand avatar={signedIn?shownAvatar:undefined} onProfile={() => navigate("profile")} />
            <h1>
              {signedIn?t('Hi {name},',{name:profile.name}):t('Hi there,')}<br />
              {t('Ready to eat safely?')}
            </h1>
          </div>
          <div className="home-main">
            <section className="my-allergens">
              <div className="card-heading">
                <h2>{t('My Allergens')}</h2>
                <div>
                  <IconButton
                    name="edit"
                    label={t('Edit allergens')}
                    onClick={() => navigate("allergens")}
                  />
                </div>
              </div>
              <div className="home-allergen-list">
                {profile.allergens.filter((a) => a.severity !== "Safe")
                  .length ? (
                  profile.allergens
                    .filter((a) => a.severity !== "Safe")
                    .sort((a, b) =>
                      a.severity === b.severity
                        ? 0
                        : a.severity === "Critical"
                          ? -1
                          : 1,
                    )
                    .map((item) => (
                      <AllergenRow
                        key={item.name}
                        item={item}
                        onClick={() => setEditing(item)}
                      />
                    ))
                ) : (
                  <div className="empty-profile">
                    <Icon name="allergensActive" size={48} />
                    <p>{t('No allergens marked to avoid.')}</p>
                    <button
                      className="text-button"
                      onClick={() => navigate("allergens")}
                    >
                      {t('Review your allergen profile')}
                    </button>
                  </div>
                )}
              </div>
            </section>
            <Button disabled={checkingScanAccess} onClick={()=>void startScan()}>
              <Icon name="scan" />
              {t('Start Analyzing')}
            </Button>
          </div>
          <Navigation active="home" onChange={navigate} />
        </div>
      )}
      {screen === "allergens" && (
        <div className="page allergen-page">
          <div className="allergen-header">
            <Brand avatar={shownAvatar} onProfile={() => navigate("profile")} />
            <IconButton name="back" label={t("Go back")} onClick={back}/>
            <div className="allergen-title">
              <h1>{t('My Allergens')}</h1>
              <button onClick={() => setAdding(true)}>
                <span>＋</span> {t('Add allergen')}
              </button>
            </div>
          </div>
          <div className="scroll-body allergen-body">
            <div className="tabs" role="tablist" aria-label="Allergen severity">
              {(['All',...severities] as const).map((s) => (
                <button
                  role="tab"
                  aria-selected={tab === s}
                  key={s}
                  className={tab === s ? s.toLowerCase() : ""}
                  onClick={() => setTab(s)}
                >
                  {t(s)}
                </button>
              ))}
            </div>
            <label className="allergen-search">{t('Find an allergen')}<input type="search" value={allergenQuery} onChange={e=>setAllergenQuery(e.target.value)} placeholder={t('Type an allergen name')} /></label>
            {allergenGroups.map((g) => {
              const items = profile.allergens.filter(
                (a) => (tab === 'All' || a.severity === tab) && g.items.includes(a.name) && t(a.name).toLocaleLowerCase().includes(allergenQuery.trim().toLocaleLowerCase()),
              );
              return items.length ? (
                <section className="allergen-group" key={g.name}>
                  <button
                    className="group-toggle"
                    aria-expanded={opened.includes(g.name)}
                    onClick={() =>
                      setOpened((a) =>
                        a.includes(g.name)
                          ? a.filter((n) => n !== g.name)
                          : [...a, g.name],
                      )
                    }
                  >
                    <img src={imageFor(g.items[0],tab==='All'?items[0].severity:tab,'Sm')} alt="" width="28" height="28" />
                    <strong>{t(g.name)}</strong>
                    <Icon name="down" size={20} />
                  </button>
                  {opened.includes(g.name) && (
                    <div className="group-items">
                      {items.map((item) => (
                        <AllergenRow
                          key={item.name}
                          item={item}
                          onClick={() => setEditing(item)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ) : null;
            })}
            {!profile.allergens.some((a) => (tab === 'All' || a.severity === tab) && t(a.name).toLocaleLowerCase().includes(allergenQuery.trim().toLocaleLowerCase())) && (
              <p className="empty-note">
                {allergenQuery ? t('No matching allergens.') : tab === 'All' ? t('No allergens in your profile yet.') : t('No allergens in {severity}.',{severity:t(tab).toLowerCase()})}<br />
                {!allergenQuery && t('Add an allergen to personalize your checks.')}
              </p>
            )}
            {tab === "Safe" && (
              <p className="privacy-note">
                {t('“Safe” records your own tolerance. It does not verify that a dish is safe to eat.')}
              </p>
            )}
          </div>
          <Navigation active="allergens" onChange={navigate} />
        </div>
      )}
      {(screen === "scan" || scanSession) && (
        <div hidden={screen !== "scan"} style={{height:'100%'}}><Scanner
          active={screen === "scan"}
          onUpgrade={()=>setPremiumReason('scans')}
          mode={scanMode}
          profile={profile.allergens}
          onClose={back}
          onReport={(r) => {
            setReport(r);
            setFromSaved(false);
            go("results", true);
          }}
        /></div>
      )}
      {report && (
        <div hidden={screen !== "results"} style={{height:'100%'}}>
        <Results
          key={report.id}
          report={report}
          onHome={() => reset("home")}
          onBack={back}
          saving={checkingSave}
          onSave={saveReport}
          saved={saved.some((r) => r.id === report.id)}
          initialResults={fromSaved}
        /></div>
      )}
      {screen === "profile" && (
        <div className="page profile-page">
          <div className="profile-header">
            <div className="profile-brand">
              <Icon name="logoGreen" size={32}/>
              {(profileIsPro || !nativeSubscription.checking) && <Badge value={profileIsPro ? 'Pro' : scanUsage?.enforced ? 'Free' : 'Local'} />}
            </div>
            <div className="profile-avatar"><Avatar src={signedIn?shownAvatar:undefined} size={60}/></div>
            <h1>{signedIn?profile.name:t('Guest')}</h1>
            {!profileIsPro && !nativeSubscription.checking && <p>
              {scanUsage?.enforced ? t('{remaining} of 3 free scans remaining',{remaining:scanUsage.remaining??0}) : t(saved.length===1?'{count} saved analysis on this device':'{count} saved analyses on this device',{count:saved.length})}
            </p>}
          </div>
          <div className="scroll-body profile-links">
            {(
              [
                { label: "Saved Results", icon: "bookmark", screen: "saved" },
                { label: "Subscription", icon: "card", screen: "subscription" },
                { label: "Data Resources", icon: "file", screen: "sources" },
                {
                  label: "Settings",
                  icon: "settings",
                  screen: "settings",
                },
              ] as const
            ).map((link) => (
              <ProfileList
                icon={link.icon}
                key={link.screen}
                onClick={() => navigate(link.screen)}
              >
                {t(link.label)}
              </ProfileList>
            ))}
            {!signedIn && <ProfileList icon="userEdit" onClick={() => navigate('account')}>{t('Sign in or create account')}</ProfileList>}
            {signedIn && <button className="profile-link" onClick={async()=>{try{const r=await fetch(apiUrl('/api/auth/logout'),{method:'POST',headers:{'Content-Type':'application/json',...accountHeaders()},body:'{}'});if(!r.ok&&r.status!==503)throw Error();clearAccountSession();setAccountId(null);setSignedIn(false);setToast(t('Signed out. Your local profile remains on this device.'));}catch{setToast(t('Could not sign out. Please try again.'));}}}><Icon name="logout"/><strong>{t('Sign out')}</strong></button>}
          </div>
          <Navigation active="profile" onChange={navigate} />
        </div>
      )}
      {<div hidden={screen !== "saved"} style={{height:'100%'}}><SavedReports reports={saved} onBack={back} avatar={shownAvatar} navigate={navigate} onOpen={r=>{setReport(r);setFromSaved(true);navigate('results');}} onDelete={deleteSavedReport}/></div>}
      {screen === 'account' && (authReady?<Account signedIn={signedIn} initialMode={accountMode} onAuthChange={setSignedIn} onBack={()=>{sessionStorage.removeItem('yoeo-account-return');setAccountReturn(null);back();}}/>:<div className="page account-page"><Topbar title="Account" onBack={back}/><div className="scroll-body padded account-content"><p role="status">Completing sign in…</p></div></div>)}
      {screen === 'reset-password' && <ResetPassword onBack={back} onSignIn={()=>navigate('account')}/>}
      {screen === "sources" && <DataSources onBack={back} avatar={shownAvatar} navigate={navigate}/>}
      {screen === "subscription" && <Subscription signedIn={signedIn} onBack={back} onActivated={event=>{if(event==='purchase'&&!signedIn&&!linkPromptSeen()){markLinkPromptSeen();setLinkPrompt(true);}if(upgradeFlow)completeUpgrade();}} onSignIn={()=>{sessionStorage.setItem('yoeo-account-return','subscription');setAccountReturn('subscription');navigate('account');}}/>}
      {screen === "settings" && (
        <div className="page settings-page">
          <Topbar title={t('Settings')} onBack={back} />
          <div className="scroll-body settings-content">
            <form className="settings-card settings-profile-form" onSubmit={e => {
              e.preventDefault();
              if (name.trim() && persist({...profile, name: name.trim()})) setToast(t('Profile saved'));
            }}>
              <h3>{t('Profile')}</h3>
              <div className="avatar-editor">
                <Avatar src={shownAvatar} size={80}/>
                <label className="photo-upload-button">{t('Change profile photo')}<input type="file" accept="image/*,.heic,.heif" className="visually-hidden" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(signedIn&&!accountId)throw Error(t('Please wait for your account to load.'));const avatar=await processAvatar(file);if(persist({...profile,avatar,avatarOwnerId:signedIn?accountId||undefined:undefined}))setToast(t('Profile photo updated'));}catch(error){setToast(error instanceof Error?error.message:t('Could not update profile photo.'));}}}/></label>
                {customAvatar&&<button type="button" className="remove-avatar-button" onClick={()=>{if(persist({...profile,avatar:undefined,avatarOwnerId:undefined}))setToast(t('Profile photo removed'));}}>{t('Remove photo')}</button>}
              </div>
              <label className="field">{t('Name')}<input maxLength={40} value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" /></label>
              <Button type="submit" disabled={!name.trim()}>{t('Save')}</Button>
            </form>
            <section className="settings-card">
              <h3>{t('Account')}</h3>
              {signedIn&&<><p className="privacy-note" role="status">{t(syncError?'Your changes are saved on this device. Cloud sync could not finish.':'Your account can sync your profile and saved results. Local data stays on this device when you sign out.')}</p><Button secondary onClick={()=>setSyncRevision(value=>value+1)}>{t('Sync account data')}</Button></>}
              <label className="field">{t('Email address')}<input type="email" value={accountEmail} readOnly placeholder={t('Sign in to connect your email')} /></label>
              {signedIn ? <button type="button" className="profile-setting" onClick={() => navigate('reset-password')}><Icon name="password"/><span>{t('Reset password')}</span></button> : <Button secondary onClick={() => navigate('account')}>{t('Sign in or create account')}</Button>}
              {revenueCatIsNative()&&<button type="button" className="profile-setting" disabled={restoring} onClick={()=>void restorePurchases()}>{t(restoring?'Restoring…':'Restore Purchases')}</button>}
              <button type="button" className="profile-setting" onClick={()=>{const platform=Capacitor.getPlatform();if(platform==='ios')void openExternal('https://apps.apple.com/account/subscriptions');else if(platform==='android')void openExternal('https://play.google.com/store/account/subscriptions');else void openExternal('https://support.apple.com/en-us/118428');}}>{t('Manage or cancel subscription')}</button>
              <p className="privacy-note">{t('Deleting your YOEO account does not cancel a subscription. Manage it through the store account used to purchase it.')}</p>
            </section>
            {health?.requiresAccessToken && (
              <form className="settings-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  sessionStorage.setItem("yoeo-access-token", accessToken);
                  setAccessToken("");
                  setToast("Access token saved for this session");
                }}
              >
                <label className="field">
                  App access token
                  <input
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <Button type="submit">Save access token</Button>
              </form>
            )}
            <section className="settings-card"><h3>{t('Your data')}</h3><LegalLinks /><Button secondary onClick={() => downloadJson({ profile, reports: saved }, "yoeo-backup.json")}>{t('Export my data')}</Button><Button secondary danger onClick={() => setConfirmClear(true)}><Icon name="trash"/>{t('Delete data')}</Button></section>
          </div>
          <Navigation active="profile" onChange={navigate}/>
        </div>
      )}
      {premiumReason && <Modal label={t('Unlock YOEO Pro')} onClose={()=>setPremiumReason(null)}>
        <div className="modal-heading"><h2>{t('Unlock YOEO Pro')}</h2><IconButton name="close" label={t('Close')} onClick={()=>setPremiumReason(null)}/></div>
        <p>{t('You’ve used your three free scans. Get YOEO Pro to keep analyzing.')}</p>
        <p>{t('Unlimited analyses and saved results, all in one plan.')}</p>
        <p>{t('No YOEO account needed. Purchase and restore with your store account.')}</p>
        <Button onClick={()=>{sessionStorage.setItem('yoeo-upgrade', JSON.stringify({report:null, active:true}));setPremiumReason(null);setUpgradeFlow(true);navigate('subscription');}}>{t('Upgrade to Pro')}</Button>
        <Button secondary onClick={()=>setPremiumReason(null)}>{t('Not now')}</Button>
      </Modal>}
      {linkPrompt && <Modal label={t('Keep Pro on every device')} onClose={()=>setLinkPrompt(false)}>
        <div className="modal-heading"><h2>{t('Keep Pro on every device')}</h2><IconButton name="close" label={t('Close')} onClick={()=>setLinkPrompt(false)}/></div>
        <p>{t('Create an account to sync your history and access your subscription on other platforms, including Android.')}</p>
        <p>{t('Your purchase already works. Restore Purchases also works on your other Apple devices without a YOEO account. Creating an account is optional.')}</p>
        <Button onClick={()=>{setLinkPrompt(false);setAccountMode('signup');navigate('account');}}>{t('Create account')}</Button>
        <Button secondary onClick={()=>setLinkPrompt(false)}>{t('Maybe later')}</Button>
      </Modal>}
      {sheet && (
        <Modal
          sheet
          label={t("Choose image source")}
          onClose={() => setSheet(false)}
        >
          <span className="sheet-handle" />
          <div className="source-options">
            {(["camera", "photo"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setScanSession(true);
                  setScanMode(m);
                  navigate("scan");
                }}
              >
                <span>{t(m === "camera" ? "Camera" : "Photo")}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {editing && (
        <Modal label={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <div className="modal-heading">
            <h2>{t(editing.name)}</h2>
            <IconButton
              name="close"
              label={t("Close allergen details")}
              onClick={() => setEditing(null)}
            />
          </div>
          <div className={`edit-mascot ${editing.severity.toLowerCase()}`}>
            <img src={imageFor(editing.name,editing.severity,'Lg')} alt="" width="180" height="180" />
            <p>{t(editing.name)}</p>
            <Badge value={editing.severity} />
          </div>
          {severities
            .filter((s) => s !== editing.severity)
            .map((s) => (
              <Button
                key={s}
                secondary
                onClick={() => changeSeverity({ ...editing, severity: s })}
              >
                {t("Move to {severity}",{severity:t(s)})}
              </Button>
            ))}
        </Modal>
      )}
      {adding && (
        <Modal label={t("Add allergen")} onClose={() => setAdding(false)}>
          <div className="modal-heading">
            <h2>{t("Add allergen")}</h2>
            <IconButton
              name="close"
              label="Close"
              onClick={() => setAdding(false)}
            />
          </div>
          <label className="field">
            {t("Allergen")}
            <select
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
            >
              {groups.map((g) => (
                <optgroup key={g.name} label={t(g.name)}>
                  {g.items.map((n) => (
                    <option key={n} value={n}>{t(n)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field">
            {t("Severity")}
            <select
              value={addSeverity}
              onChange={(e) => setAddSeverity(e.target.value as Severity)}
            >
              {severities.map((s) => (
                <option key={s} value={s}>{t(s)}</option>
              ))}
            </select>
          </label>
          <Button
            onClick={() =>
              changeSeverity({ name: addName, severity: addSeverity })
            }
          >
            {t("Save allergen")}
          </Button>
        </Modal>
      )}
      {confirmClear && (
        <Modal label={t(deletionStatus==='complete'?'Your data has been deleted':deleting?'Deleting your data…':'Delete data?')} onClose={() => {if(deletionStatus==='idle')setConfirmClear(false);}}>
          {deletionStatus==='idle' && <div className="confirm-dialog danger-dialog">
            <div className="danger-dialog-icon"><Icon name="trash" size={28}/></div>
            <div className="modal-heading"><h2>{t('Delete data?')}</h2><IconButton name="close" label={t('Close')} onClick={() => setConfirmClear(false)}/></div>
            <p>Deleting your data does not cancel an App Store or Google Play subscription. Cancel it in your store subscription settings to stop future charges.</p>
            <p>{hasAccountSession()?t('This permanently deletes your YOEO account and its app database records, then removes your local YOEO profile and saved results from this device.'):t('This permanently removes all data stored by this app on this device.')}</p>
            <Button
              danger
              onClick={async () => {
                const includesAccount=hasAccountSession();
                setDeletedAccount(includesAccount);
                setDeletionStatus('deleting');
                try {
                  if(includesAccount){
                    const r=await fetch(apiUrl('/api/account'),{method:'DELETE',headers:{'Content-Type':'application/json',...accountHeaders()},body:JSON.stringify({confirm:'DELETE'})});
                    if(!r.ok){const d=await r.json().catch(()=>null);throw Error(d?.error||'Could not delete your account.');}
                  }
                  localStorage.clear();
                  sessionStorage.clear();
                  history.replaceState(null,'',location.pathname);
                  setProfile(emptyProfile);
                  setSaved([]);
                  setName('');
                  setReport(null);
                  setUpgradeFlow(false);
                  setAccountId(null);
                  setSignedIn(false);
                  setDeletionStatus('complete');
                } catch (e) {
                  setDeletionStatus('idle');
                  setToast(e instanceof Error?e.message:'Could not delete your data.');
                }
              }}
            >
              {t('Delete data')}
            </Button>
            <Button secondary onClick={() => setConfirmClear(false)}>{t('Keep my data')}</Button>
          </div>}
          {deleting && <div className="deletion-progress" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true"/>
            <h2>{t('Deleting your data…')}</h2>
            <p>{t(deletedAccount?'Deleting your account and associated data. This usually takes a few seconds.':'Removing your data from this device. This usually takes a few seconds.')}</p>
          </div>}
          {deletionStatus==='complete' && <div className="deletion-complete" role="status" aria-live="polite">
            <div className="deletion-complete-icon" aria-hidden="true">✓</div>
            <h2>{t('Your data has been deleted')}</h2>
            <p>{t(deletedAccount?'Your YOEO account and app data on this device have been deleted. Your store subscription was not canceled.':'All data stored by this app on this device has been deleted.')}</p>
            <Button onClick={()=>location.reload()}>{t('Continue')}</Button>
          </div>}
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast-mark" aria-hidden="true">✓</span><span>{toast}</span><button type="button" onClick={()=>setToast('')} aria-label={t('Close')}>×</button>
        </div>
      )}
    </main>
  );
}
