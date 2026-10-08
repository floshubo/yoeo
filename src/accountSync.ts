import { accountHeaders, apiUrl } from './api';
import type { Preference, Profile, Report } from './types';

/**
 * Optional account sync. Payment never goes through here: the App Store account owns the
 * purchase. A YOEO account only adds a recoverable identity for scan history and the allergen
 * profile, so a reinstall or another device can pick them up again.
 */
export type CloudProfile = { id: string; name: string; allergens: Preference[]; avatar: string | null; completed: boolean };

async function accountApi<T>(headers: Record<string,string>, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(apiUrl(`/api/account/${path}`), {
    method: init.method || (init.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!response.ok) throw Object.assign(Error('Account sync failed.'), { status: response.status });
  return response.json();
}

/** Freeze credentials for a sync run. A subsequent sign-in must not redirect queued writes. */
export function accountSync(ownerId: string) {
  const headers = accountHeaders();
  let profileId: string | undefined;
  let profileQueue: Promise<unknown> = Promise.resolve();
  const reportQueues = new Map<string,Promise<unknown>>();
  function writeReport<T>(id:string, write:()=>Promise<T>):Promise<T> {
    const next=(reportQueues.get(id)||Promise.resolve()).catch(()=>undefined).then(write);
    reportQueues.set(id,next);
    void next.finally(()=>{if(reportQueues.get(id)===next)reportQueues.delete(id);}).catch(()=>undefined);
    return next;
  }
  return {
    ownerId,
    pullReports: () => accountApi<Report[]>(headers, 'reports').then(list => Array.isArray(list) ? list.map(r => ({...r, syncOwnerId: ownerId})) : []),
    pushReport: (report: Report) => {
      if (report.syncOwnerId && report.syncOwnerId !== ownerId) return Promise.reject(Error('Result belongs to another account.'));
      const {syncOwnerId: _owner, ...body} = report;
      return writeReport(report.id,()=>accountApi<{id:string}>(headers, 'reports', {body}));
    },
    removeReport: (id: string) => writeReport(id,()=>accountApi<{ok:boolean}>(headers, `reports/${encodeURIComponent(id)}`, {method:'DELETE',body:{}})),
    pullProfiles: () => accountApi<CloudProfile[]>(headers, 'profiles').then(list => Array.isArray(list) ? list : []),
    pushProfile: (profile: Profile) => {
      if (profile.syncOwnerId && profile.syncOwnerId !== ownerId) return Promise.reject(Error('Profile belongs to another account.'));
      const next = profileQueue.then(async () => {
        const result = await accountApi<{id:string}>(headers, 'profiles', {
          body: {id:profile.id || profileId,name:profile.name.trim(),avatar:profile.avatar ?? null,allergens:profile.allergens,completed:profile.completed},
        });
        profileId = result.id;
        return result;
      });
      profileQueue = next.catch(() => undefined);
      return next;
    },
  };
}

/** Guest results may be claimed once. Another account's history remains local only. */
export function reportsForAccount(reports: Report[], ownerId: string) {
  return reports.filter(r => !r.syncOwnerId || r.syncOwnerId === ownerId);
}

/** Account copies win on conflicts; results saved before signing in are kept. Newest first, capped like local storage. */
export function mergeReports(local: Report[], cloud: Report[]): Report[] {
  const cloudIds = new Set(cloud.map(report => report.id));
  return [...cloud, ...local.filter(report => !cloudIds.has(report.id))]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);
}
