import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIOSRelease } from '../scripts/prepare-ios.mjs';
const valid = { VITE_API_BASE_URL: 'https://api.yoeo.app', VITE_PRIVACY_POLICY_URL: 'https://yoeo.app/privacy', VITE_SUPPORT_URL: 'https://yoeo.app/support', VITE_REVENUECAT_IOS_API_KEY: 'appl_fixture', VITE_AI_PROVIDER_NAME: 'OpenAI' };
test('iOS release rejects missing production configuration', () => assert.equal(validateIOSRelease({}).length, 4));
test('iOS release accepts complete configuration', () => assert.deepEqual(validateIOSRelease(valid), []));
test('iOS release rejects insecure, placeholder and credential URLs', () => {
  for (const url of ['http://api.yoeo.app', 'https://localhost', 'https://your-api.example.com', 'https://user:password@api.yoeo.app']) assert.ok(validateIOSRelease({ ...valid, VITE_API_BASE_URL: url }).length);
});
test('iOS release rejects test and server purchase keys', () => {
  for (const key of ['test_fixture', 'sk_fixture']) assert.ok(validateIOSRelease({ ...valid, VITE_REVENUECAT_IOS_API_KEY: key }).length);
});
