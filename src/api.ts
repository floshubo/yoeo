import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const SESSION_KEY = 'yoeo-account-session';
const OAUTH_FLOW_KEY = 'yoeo-oauth-flow';

// Native bundles cannot use relative /api URLs on capacitor://localhost.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ||
  (Capacitor.isNativePlatform() ? 'https://yoeo.onrender.com' : '')).replace(/\/$/, '');

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function accountHeaders(): Record<string, string> {
  const session = localStorage.getItem(SESSION_KEY);
  return session ? { 'X-YOEO-Session': session } : {};
}

export function storeAccountSession(data: { sessionToken?: string } | null) {
  if (data?.sessionToken) localStorage.setItem(SESSION_KEY, data.sessionToken);
}

export function clearAccountSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function hasAccountSession() {
  return Boolean(localStorage.getItem(SESSION_KEY));
}

export function acceptAccountSessionFromUrl() {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get('session');
  if (!token) return;
  localStorage.setItem(SESSION_KEY, token);
  history.replaceState(null, '', location.pathname + location.search);
}

export async function beginOAuth(provider: 'google' | 'apple') {
  const native = Capacitor.isNativePlatform();
  const response = await fetch(apiUrl(`/api/auth/oauth/${provider}?mode=${native ? 'native' : 'json'}`));
  const data = await response.json();
  if (!response.ok) throw Error(data.error || `Could not start ${provider} sign-in.`);
  localStorage.setItem(OAUTH_FLOW_KEY, data.flowToken);
  if (native) await Browser.open({url: data.url});
  else location.assign(data.url);
}

async function exchangeOAuthCode(code: string) {
  const flowToken = localStorage.getItem(OAUTH_FLOW_KEY);
  localStorage.removeItem(OAUTH_FLOW_KEY);
  if (!flowToken) throw Error('Sign-in expired. Please start again.');
  const response = await fetch(apiUrl('/api/auth/oauth/callback'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, flowToken }),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Sign-in did not complete.');
  storeAccountSession(data);
}

export async function completeNativeOAuth(url: string) {
  const callback = new URL(url);
  if (callback.protocol !== 'app.yoeo.mobile:' || callback.hostname !== 'auth' || callback.pathname !== '/callback') return false;
  await Browser.close().catch(() => {});
  const error = callback.searchParams.get('error_description') || callback.searchParams.get('error');
  if (error) throw Error(error);
  const code = callback.searchParams.get('code');
  if (!code) throw Error('Sign-in did not complete.');
  await exchangeOAuthCode(code);
  return true;
}

export async function completeOAuthFromUrl() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!params.has('oauth')) return false;
  history.replaceState(history.state, '', '/?account=1');
  const error = params.get('error_description') || params.get('error');
  if (error) throw Error(error);
  if (!code) throw Error('Sign-in did not complete.');
  await exchangeOAuthCode(code);
  return true;
}
