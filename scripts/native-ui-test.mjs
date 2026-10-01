import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(path.resolve(process.env.YOEO_TOOLS_DIR || '.', 'package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });
try {
  for (const native of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
    await page.addInitScript(native => {
      if (native) window.webkit = { messageHandlers: { bridge: {} } };
      localStorage.setItem('yoeo-profile', JSON.stringify({ name: 'J', completed: true, allergens: [] }));
    }, native);
    const healthRequests = [];
    await page.route('**/api/**', route => {
      if (route.request().url().endsWith('/api/health')) healthRequests.push(route.request().url());
      return route.fulfill({ json: { configured: true, user: null } });
    });
    await page.goto(process.env.YOEO_TEST_URL || 'http://127.0.0.1:5191');
    await page.getByRole('button', { name: 'Start Analyzing', exact: true }).waitFor();
    const install = page.getByRole('dialog', { name: 'Install YOEO' });
    if (native) {
      await page.waitForTimeout(1700);
      assert.equal(await install.count(), 0);
      assert.ok(healthRequests.some(url => url.startsWith('https://yoeo.onrender.com/')));
      const bounds = await page.locator('.bottom-nav:visible').boundingBox();
      assert.ok(Math.abs(bounds.y + bounds.height - 852) < 1, 'Navigation reaches the bottom of the native viewport');
    } else {
      await install.waitFor();
      await page.getByRole('button', { name: 'Not now', exact: true }).click();
      assert.ok(healthRequests.some(url => url.startsWith(process.env.YOEO_TEST_URL || 'http://127.0.0.1:5191')));
    }
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Install YOEO on this phone', exact: true }).count(), native ? 0 : 1);
    if (!native) {
      await page.evaluate(() => {
        document.documentElement.classList.add('native-app');
        window.dispatchEvent(new Event('pageshow'));
        window.dispatchEvent(new Event('beforeinstallprompt', {cancelable:true}));
      });
      assert.equal(await page.getByRole('button', {name:'Install YOEO on this phone',exact:true}).count(),0);
      assert.equal(await install.count(),0);
    }
    console.log(`${native ? 'Native' : 'Web'} install visibility and API routing passed`);
    await page.close();
  }
} finally {
  await browser.close();
}
