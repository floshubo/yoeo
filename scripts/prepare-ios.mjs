import { loadEnv } from 'vite';
import { spawnSync } from 'node:child_process';
import revenueCatConfig from '../server/revenuecat-config.json' with { type: 'json' };

export function validateIOSRelease(env) {
  const errors = [];
  for (const key of ['VITE_API_BASE_URL', 'VITE_PRIVACY_POLICY_URL', 'VITE_SUPPORT_URL']) {
    try {
      const url = new URL(env[key]);
      if (url.protocol !== 'https:' || url.username || url.password || /localhost|127\.0\.0\.1|example\.(com|org|net)/i.test(url.hostname)) throw Error();
    } catch { errors.push(`${key} must be a real public HTTPS URL.`); }
  }
  if (!/^appl_[A-Za-z0-9]+$/.test(env.VITE_REVENUECAT_IOS_API_KEY || revenueCatConfig.iosPublicApiKey)) errors.push('Set the Apple RevenueCat public SDK key (appl_...), not a test or secret key.');
  if (!env.VITE_AI_PROVIDER_NAME?.trim() || /your |configured|placeholder/i.test(env.VITE_AI_PROVIDER_NAME)) errors.push('VITE_AI_PROVIDER_NAME must identify the actual production AI provider.');
  return errors;
}

if (process.argv[1]?.endsWith('prepare-ios.mjs')) {
  const errors = validateIOSRelease({ ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env });
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  for (const args of [['build'], ['exec', 'cap', 'sync', 'ios']]) {
    const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
