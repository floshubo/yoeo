import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import revenueCatConfig from './revenuecat-config.json' with { type: 'json' };

const FREE_SCANS = 3;
const COOKIE_NAME = 'yoeo_guest';

export function usageService(env, auth, { fetchImpl = fetch } = {}) {
  const enabled = env.NODE_ENV === 'production';
  const pending = new Map();
  const secure = (env.APP_URL || '').startsWith('https://');
  const secret = env.SESSION_SECRET || 'development-only-session-secret';
  const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

  function encodeGuest(guest) {
    const payload = Buffer.from(JSON.stringify(guest)).toString('base64url');
    const signature = createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  function readGuest(req) {
    const cookieToken = (req.headers?.cookie || '').split(';').map(value => value.trim())
      .find(value => value.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
    const raw = req.body?.guestToken || req.get?.('x-yoeo-guest') || cookieToken;
    if (raw) {
      try {
        const [payload, signature] = raw.split('.');
        const expected = createHmac('sha256', secret).update(payload).digest('base64url');
        const supplied = Buffer.from(signature || '');
        const wanted = Buffer.from(expected);
        if (supplied.length === wanted.length && timingSafeEqual(supplied, wanted)) {
          const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
          if (typeof parsed.id === 'string' && Number.isInteger(parsed.used) && parsed.used >= 0)
            return { id: parsed.id, used: Math.min(parsed.used, FREE_SCANS) };
        }
      } catch {
        // Invalid cookies receive a fresh anonymous allowance.
      }
    }
    return { id: randomUUID(), used: 0 };
  }

  function writeGuest(res, guest) {
    res.append('Set-Cookie', `${COOKIE_NAME}=${encodeGuest(guest)}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=31536000${secure ? '; Secure' : ''}`);
  }

  async function account(req, res) {
    if (!auth.accountsEnabled) return null;
    try {
      const session = await auth.getSession(req, res);
      return { id: session.user.id, token: session.token };
    } catch (error) {
      if (error.status === 401) return null;
      throw error;
    }
  }

  async function accountStatus(identity) {
    const apiKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
    if (!apiKey || !identity?.token)
      throw fail(503, 'USAGE_UNAVAILABLE', 'Scan availability could not be checked. Please try again later.');
    const response = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/scan_usage_status`, {
      method: 'POST',
      headers: { apikey: apiKey, Authorization: `Bearer ${identity.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: identity.id }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw fail(503, 'USAGE_UNAVAILABLE', 'Scan availability could not be checked. Please try again later.');
    const status = await response.json();
    if (status.plan === 'pro') return status;
    // RevenueCat permits public SDK keys for the read-only v1 subscriber lookup.
    // Never let a Test Store key override the live Apple key in production.
    const configuredKey = env.REVENUECAT_SERVER_API_KEY || '';
    const revenueCatKey = env.NODE_ENV === 'production' && configuredKey.startsWith('test_')
      ? revenueCatConfig.iosPublicApiKey : configuredKey || revenueCatConfig.iosPublicApiKey;
    const customer = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(identity.id)}`, {
      headers: { Authorization: `Bearer ${revenueCatKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!customer.ok)
      throw fail(503, 'USAGE_UNAVAILABLE', 'Subscription status could not be checked. Please try again later.');
    const info = await customer.json();
    const entitlement = info?.subscriber?.entitlements?.[env.REVENUECAT_ENTITLEMENT_ID || revenueCatConfig.entitlementId];
    const expires = entitlement?.expires_date ? Date.parse(entitlement.expires_date) : null;
    return entitlement && (expires === null || expires > Date.now()) ? { ...status, plan: 'pro', remaining: null } : status;
  }

  return {
    enabled,
    async status(req, res) {
      if (!enabled) return { enforced: false, plan: 'development', remaining: null };
      const guest = readGuest(req);
      writeGuest(res, guest);
      const remaining = Math.max(0, FREE_SCANS - guest.used - (pending.get(guest.id) || 0));
      const identity = await account(req, res);
      if (!identity) return { enforced: true, plan: 'free', remaining, signedIn: false, usageToken: encodeGuest(guest) };
      const status = await accountStatus(identity);
      return { enforced: true, plan: status.plan === 'pro' ? 'pro' : 'free', remaining: status.plan === 'pro' ? null : remaining, signedIn: true, usageToken: encodeGuest(guest) };
    },
    async reserve(req, res) {
      if (!enabled) return null;
      const guest = readGuest(req);
      const active = pending.get(guest.id) || 0;
      if (guest.used + active < FREE_SCANS) {
        pending.set(guest.id, active + 1);
        writeGuest(res, guest);
        return { mode: 'guest', guest, res };
      }
      const identity = await account(req, res);
      if (!identity)
        throw fail(401, 'SIGN_IN_REQUIRED', 'You’ve used your three free scans. Sign in to continue with Pro.');
      const status = await accountStatus(identity);
      if (status.plan !== 'pro')
        throw fail(402, 'SCAN_LIMIT_REACHED', 'Your three free scans are used. Upgrade to Pro to keep scanning.');
      return { mode: 'pro' };
    },
    async finish(reservation, success) {
      if (!reservation || reservation.mode !== 'guest') return;
      const active = Math.max(0, (pending.get(reservation.guest.id) || 1) - 1);
      if (active) pending.set(reservation.guest.id, active);
      else pending.delete(reservation.guest.id);
      if (success) {
        const guest = { ...reservation.guest, used: reservation.guest.used + 1 };
        writeGuest(reservation.res, guest);
        return { usageToken: encodeGuest(guest), usage: { plan: 'free', remaining: Math.max(0, FREE_SCANS - guest.used) } };
      }
    },
  };
}
