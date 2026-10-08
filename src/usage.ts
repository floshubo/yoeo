import { accountHeaders, apiUrl } from './api';
import { purchaseHeaders } from './revenuecat';

export type ScanUsage = { enforced: boolean; plan: string; remaining: number | null; usageToken?: string };

export async function usageHeaders(): Promise<Record<string, string>> {
  const accessToken = sessionStorage.getItem('yoeo-access-token');
  return {
    'X-YOEO-Guest': localStorage.getItem('yoeo-guest-token') || '',
    ...accountHeaders(),
    ...await purchaseHeaders(),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export async function fetchScanUsage(): Promise<ScanUsage> {
  const response = await fetch(apiUrl('/api/usage'), { headers: await usageHeaders() });
  if (!response.ok) throw Error('Could not check your scan availability. Please try again.');
  const usage: ScanUsage = await response.json();
  if (usage.usageToken) localStorage.setItem('yoeo-guest-token', usage.usageToken);
  return usage;
}
