import {useEffect,useState} from 'react';
import {Button,Topbar} from './components';
import {accountHeaders,apiUrl,beginOAuth,clearAccountSession,storeAccountSession} from './api';

async function api(path:string,body?:unknown,method=body?'POST':'GET'){
 const response=await fetch(apiUrl('/api/'+path),{method,headers:{'Content-Type':'application/json',...accountHeaders()},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();
 if(!response.ok)throw Object.assign(Error(data.error||'Could not complete account request.'),{status:response.status});
 storeAccountSession(data);
 return data;
}

type Props={onBack:()=>void;onAuthChange:(signedIn:boolean)=>void;signedIn:boolean;initialMode?:'signup'|'signin'};

export default function Account({onBack,onAuthChange,signedIn,initialMode='signin'}:Props){
 const [config,setConfig]=useState<{enabled:boolean;providers:{google:boolean;apple:boolean}}|null>(null);
 const [user,setUser]=useState<{id:string;email:string}|null>(null);
 const [mode,setMode]=useState<'signup'|'signin'>(initialMode);
 const [checking,setChecking]=useState(true);
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [visible,setVisible]=useState(false);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);

 async function refresh(){
  const session=await api('auth/session');
  setUser(session.user);
  onAuthChange(true);
 }
 useEffect(()=>{let active=true;void api('auth/config').then(async next=>{if(!active)return;setConfig(next);if(next.enabled){try{await refresh();}catch(error){if(!active)return;if((error as Error&{status?:number}).status===401){clearAccountSession();onAuthChange(false);}else setMessage('Could not refresh your account. Please try again.');}}}).catch(()=>{if(active)setMessage('Account service unavailable.');}).finally(()=>{if(active)setChecking(false);});return()=>{active=false;};},[signedIn]);
 async function action(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 async function passwordAuth(){const data=await api(mode==='signup'?'auth/signup':'auth/login',{email,password});if(data.needsConfirmation){setMode('signin');setPassword('');setMessage(data.message);return;}await refresh();}

 return <div className="page account-page">
  <Topbar title="Account" onBack={onBack}/>
  <div className="scroll-body padded account-content">
   {checking||(signedIn&&!user)?<p role="status">Checking account…</p>:!user?<>
    <div className="account-intro"><h2>{mode==='signup'?'Create your YOEO account':'Sign in'}</h2><p>Signing in is optional. You can purchase, restore, scan and save results without a YOEO account.</p><p>Signing in syncs your allergen profile and saved results to your account and links your purchases for access on other platforms.</p><button type="button" className="text-button" onClick={onBack}>Continue without signing in</button></div>
    <div className="oauth-buttons">
     <Button disabled={!config?.providers.google||busy} secondary onClick={()=>void action(()=>beginOAuth('google'))}><img className="oauth-logo" src="/assets/oauth/google.svg" alt=""/>Continue with Google</Button>
     <Button disabled={!config?.providers.apple||busy} secondary onClick={()=>void action(()=>beginOAuth('apple'))}><img className="oauth-logo apple" src="/assets/oauth/apple.png" alt=""/>Continue with Apple</Button>
    </div>
    {config&&(!config.providers.google||!config.providers.apple)&&<p className="provider-note">Social sign-in will become available after its provider is connected.</p>}
    {config&&!config.enabled&&<p className="provider-note">Account sign in is temporarily unavailable.</p>}
    <div className="account-divider"><span>or</span></div>
    <form className="account-form" onSubmit={event=>{event.preventDefault();void action(passwordAuth);}}>
     <label className="field">Email address<input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label>
     <label className="field password-field">Password<span className="password-input"><input type={visible?'text':'password'} autoComplete={mode==='signup'?'new-password':'current-password'} minLength={mode==='signup'?12:1} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)}/><button type="button" aria-label={visible?'Hide password':'Show password'} onClick={()=>setVisible(value=>!value)}>{visible?'Hide':'Show'}</button></span></label>
     {mode==='signup'&&<p className="privacy-note">Use at least 12 characters.</p>}
     <Button type="submit" disabled={busy||!email||!password}>{busy?'Please wait…':mode==='signup'?'Create account':'Sign in'}</Button>
    </form>
    <button type="button" className="account-mode" onClick={()=>{setMode(mode==='signup'?'signin':'signup');setMessage('');}}>{mode==='signup'?'Already have an account? Sign in':'New to YOEO? Create an account'}</button>
   </>:<>
    <p>Signed in as {user.email}</p>
   <Button secondary disabled={busy} onClick={()=>void action(async()=>{await api('auth/logout',{});clearAccountSession();onAuthChange(false);setUser(null);setMessage('Signed out. Your current local profile stays on this device.');})}>Sign out</Button>
   </>}
   {message&&<p className="error-box" role="status">{message}</p>}
  </div>
 </div>;
}
