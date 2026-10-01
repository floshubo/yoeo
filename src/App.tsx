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
import {configureRevenueCat, getRevenueCatCustomerInfo, hasProEntitlement, revenueCatIsNative} from './revenuecat';
import {useProSubscription} from './useProSubscription';
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
  const nativeSubscription = useProSubscription(accountId, signedIn, screen === 'profile');
  const profileIsPro = nativeSubscription.pro === true || scanUsage?.plan === 'pro';
  const [checkingScanAccess,setCheckingScanAccess]=useState(false);
  useEffect(()=>{let active=true;if(screen==='profile')fetch(apiUrl('/api/usage'),{headers:{'X-YOEO-Guest':localStorage.getItem('yoeo-guest-token')||'',...accountHeaders()}}).then(r=>r.ok?r.json():null).then(data=>{if(!active)return;if(data?.usageToken)localStorage.setItem('yoeo-guest-token',data.usageToken);setScanUsage(data);}).catch(()=>{if(active)setScanUsage(null);});return()=>{active=false;};},[screen,signedIn]);
  useEffect(()=>{if(!signedIn){setAccountEmail('');setAccountAvatar(null);setScanUsage(null);}},[signedIn]);
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
    if(screen==='saved'&&!signedIn&&authReady){sessionStorage.setItem('yoeo-account-return','saved');setAccountReturn('saved');go('account',true);}
  },[screen,signedIn,authReady]);
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
      writeStored("yoeo-profile", p);
      setProfile(p);
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
      const next = [r, ...saved.filter((x) => x.id !== r.id)].slice(0, 50);
      writeStored("yoeo-reports", next);
      setSaved(next);
      setToast("Results saved on this device");
      return true;
    } catch {
      setToast(
        "Storage is full. Download your report or delete older results.",
      );
      return false;
    }
  }
  const navigate = (s: string) => {
    if(s==='saved'&&!signedIn){sessionStorage.setItem('yoeo-account-return','saved');setAccountReturn('saved');go('account');}
    else go(s);
    setSheet(false);
  };
  async function startScan(){
    if(checkingScanAccess)return;
    setCheckingScanAccess(true);
    try{
      const response=await fetch(apiUrl('/api/usage'),{headers:{'X-YOEO-Guest':localStorage.getItem('yoeo-guest-token')||'',...accountHeaders()}});
      if(!response.ok)throw Error();
      const usage=await response.json();
      if(usage.usageToken)localStorage.setItem('yoeo-guest-token',usage.usageToken);
      setScanUsage(usage);
      if(usage.enforced&&usage.plan!=='pro'&&(usage.remaining??0)<=0){setPremiumReason('scans');return;}
      setSheet(true);
    }catch{setToast(t('Could not check your scan availability. Please try again.'));}
    finally{setCheckingScanAccess(false);}
  }
  const [premiumReason, setPremiumReason] = useState<'save'|'scans'|null>(null);
  const [pendingSave, setPendingSave] = useState<Report|null>(() => pendingUpgrade().report);
  const [checkingSave, setCheckingSave] = useState(false);
  const saveLock = useRef(false);
  const [upgradeFlow, setUpgradeFlow] = useState(() => pendingUpgrade().active);
  useEffect(() => {
    if (screen === 'account' || screen === 'subscription') return;
    setUpgradeFlow(false);
    sessionStorage.removeItem('yoeo-upgrade');
  }, [screen]);
  async function checkPremium() {
    if (revenueCatIsNative()) {
      let userId = accountId;
      if (!userId && hasAccountSession()) {
        const response = await fetch(apiUrl('/api/auth/session'), {headers: accountHeaders()});
        if (!response.ok) throw Error('Please sign in again to check your subscription.');
        const session = await response.json(); userId = session.user.id;
      }
      return hasProEntitlement(await getRevenueCatCustomerInfo(userId));
    }
    const response = await fetch(apiUrl('/api/usage'), {headers: {'X-YOEO-Guest': localStorage.getItem('yoeo-guest-token') || '', ...accountHeaders()}});
    if (!response.ok) throw Error('Could not check your subscription. Please try again.');
    const usage = await response.json();
    if (usage.usageToken) localStorage.setItem('yoeo-guest-token', usage.usageToken);
    return usage.plan === 'pro';
  }
  function finishSave(r: Report) {
    if (!persistReport(r)) return;
    sessionStorage.removeItem('yoeo-upgrade');
    setPendingSave(null); setUpgradeFlow(false);
    reset('saved');
  }
  function continueSaveUpgrade(r: Report) {
    setPendingSave(r);
    sessionStorage.setItem('yoeo-upgrade', JSON.stringify({report:r, active:false}));
    setUpgradeFlow(false);
    navigate('account');
  }
  async function saveReport(r: Report) {
    if (saveLock.current) return;
    saveLock.current = true; setCheckingSave(true);
    try {
      if (signedIn && hasAccountSession()) finishSave(r);
      else continueSaveUpgrade(r);
    } catch {setToast('Could not save results. Please try again.');}
    finally {saveLock.current = false; setCheckingSave(false);}
  }
  function completeUpgrade() {
    if (!hasAccountSession()) {
      sessionStorage.setItem('yoeo-upgrade', JSON.stringify({report:pendingSave, active:true}));
      setUpgradeFlow(true); navigate('account'); return;
    }
    if (pendingSave) finishSave(pendingSave);
    else {sessionStorage.removeItem('yoeo-upgrade');setUpgradeFlow(false);reset('home');}
  }
  useEffect(() => {
    if (screen !== 'account' || !accountId || !pendingSave || upgradeFlow) return;
    finishSave(pendingSave);
  }, [screen, accountId, pendingSave, upgradeFlow]);
  useEffect(() => {
    if (screen !== 'account' || !accountId || !upgradeFlow) return;
    let active = true;
    void checkPremium().then(pro => {
      if (!active) return;
      if (pro) completeUpgrade();
      else go('subscription', true);
    }).catch(() => {if (active) go('subscription', true);});
    return () => {active = false;};
  }, [screen, accountId, upgradeFlow]);
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
          onAccount={()=>setPremiumReason('scans')}
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
      {signedIn&&<div hidden={screen !== "saved"} style={{height:'100%'}}><SavedReports reports={saved} onBack={back} avatar={shownAvatar} navigate={navigate} onOpen={r=>{setReport(r);setFromSaved(true);navigate('results');}} onDelete={id=>{try{const next=saved.filter(r=>r.id!==id);writeStored('yoeo-reports',next);setSaved(next);}catch{setToast('Could not update saved results.');}}}/></div>}
      {screen === 'account' && (authReady?<Account signedIn={signedIn} savingResult={!!pendingSave} onAuthChange={setSignedIn} onBack={()=>{sessionStorage.removeItem('yoeo-account-return');setAccountReturn(null);back();}}/>:<div className="page account-page"><Topbar title="Account" onBack={back}/><div className="scroll-body padded account-content"><p role="status">Completing sign in…</p></div></div>)}
      {screen === 'reset-password' && <ResetPassword onBack={back} onSignIn={()=>navigate('account')}/>}
      {screen === "sources" && <DataSources onBack={back} avatar={shownAvatar} navigate={navigate}/>}
      {screen === "subscription" && <Subscription onBack={back} onActivated={upgradeFlow ? completeUpgrade : undefined} onSignIn={()=>{if(!upgradeFlow)setPendingSave(null);sessionStorage.setItem('yoeo-upgrade', JSON.stringify({report:upgradeFlow?pendingSave:null,active:true}));setUpgradeFlow(true);navigate('account');}} appUserId={accountId}/>}
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
              <label className="field">{t('Email address')}<input type="email" value={accountEmail} readOnly placeholder={t('Sign in to connect your email')} /></label>
              {signedIn ? <button type="button" className="profile-setting" onClick={() => navigate('reset-password')}><Icon name="password"/><span>{t('Reset password')}</span></button> : <Button secondary onClick={() => navigate('account')}>{t('Sign in or create account')}</Button>}
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
        <p>{t(premiumReason === 'save' ? 'Save results and revisit them anytime with YOEO Pro.' : 'You’ve used your three free scans. Get YOEO Pro to keep analyzing.')}</p>
        <p>{t('Unlimited analyses and saved results, all in one plan.')}</p>
        <Button onClick={()=>{sessionStorage.setItem('yoeo-upgrade', JSON.stringify({report:premiumReason==='save'?pendingSave:null, active:true}));if(premiumReason!=='save')setPendingSave(null);setPremiumReason(null);setUpgradeFlow(true);navigate(signedIn ? 'subscription' : 'account');}}>{t(signedIn ? 'Upgrade to Pro' : 'Sign up or sign in to upgrade')}</Button>
        <Button secondary onClick={()=>setPremiumReason(null)}>{t('Not now')}</Button>
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
            {hasAccountSession() && <p>Deleting your data does not cancel an App Store or Google Play subscription. Cancel it in your store subscription settings to stop future charges.</p>}
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
                    if(revenueCatIsNative())await configureRevenueCat(null).catch(()=>{});
                  }
                  localStorage.clear();
                  sessionStorage.clear();
                  history.replaceState(null,'',location.pathname);
                  setProfile(emptyProfile);
                  setSaved([]);
                  setName('');
                  setReport(null);
                  setPendingSave(null);
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
