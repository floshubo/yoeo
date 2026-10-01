import { createRequire } from "node:module";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(
  path.resolve(process.env.YOEO_TOOLS_DIR || ".", "package.json"),
);
const { chromium } = require("playwright");
const baseUrl = process.env.YOEO_BASE_URL || "http://127.0.0.1:5187";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});
const context = await browser.newContext({
  viewport: { width: 360, height: 712 },
  permissions: ["camera"],
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(baseUrl);
await page.evaluate(() =>
  localStorage.setItem(
    "yoeo-profile",
    JSON.stringify({
      name: "Alex",
      completed: true,
      allergens: [
        { name: "Milk", severity: "Critical" },
        { name: "Fish", severity: "Avoid" },
        { name: "Crustaceans", severity: "Avoid" },
      ],
    }),
  ),
);
await page.reload();
await page
  .getByRole("button", { name: "Start Analyzing", exact: true })
  .waitFor();
const analyzePosition = await page.evaluate(() => {
  const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes('Start Analyzing'));
  const navigation = document.querySelector('.bottom-nav');
  const buttonBox = button?.getBoundingClientRect();
  const navigationBox = navigation?.getBoundingClientRect();
  return buttonBox && navigationBox ? { buttonBottom: buttonBox.bottom, navigationTop: navigationBox.top } : null;
});
assert.ok(analyzePosition);
assert.ok(analyzePosition.navigationTop - analyzePosition.buttonBottom >= 16);
assert.ok(analyzePosition.navigationTop - analyzePosition.buttonBottom <= 28);
await page.getByRole("navigation").getByRole("button", { name: "Profile", exact: true }).click();
assert.equal(await page.getByRole("button", { name: "Sign out", exact: true }).count(), 0);
assert.ok(await page.getByRole("button", { name: "Install YOEO on this phone", exact: true }).isVisible());
await page.getByRole("navigation").getByRole("button", { name: "Home", exact: true }).click();
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
await page.screenshot({ path: "test-results/home-content-size.png" });
const manifest = await page.evaluate(
  async () => await (await fetch("/manifest.webmanifest")).json(),
);
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "/");
assert.equal(manifest.scope, "/");
assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"));
assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose?.split(/\s+/).includes("maskable")));
await page
  .getByRole("button", { name: "Start Analyzing", exact: true })
  .click();
await page.getByRole("button", { name: "Camera", exact: true }).click();
await page
  .getByRole("button", { name: "No, take the menu", exact: true })
  .click();
await page.waitForFunction(
  () => document.querySelector("video")?.videoWidth > 0,
);
await page.getByRole("button", { name: "Take photo", exact: true }).click();
await page
  .getByRole("button", { name: "Analyze 1 photo", exact: true })
  .waitFor();
assert.ok(await page.locator(".photo-preview").isVisible());
await page.getByRole("button", { name: "Close", exact: true }).click();
await page.getByRole("button", { name: "Discard", exact: true }).click();
await page
  .getByRole("navigation")
  .getByRole("button", { name: "Allergens", exact: true })
  .click();
await page.getByRole("button", { name: "Milk", exact: true }).click();
await page.waitForFunction(() =>
  Array.from(document.images).every((i) => i.complete && i.naturalWidth),
);
await context.setOffline(true);
await page.reload();
await page
  .getByRole("button", { name: "Start Analyzing", exact: true })
  .waitFor();
assert.ok(await page.getByRole("heading", { name: /Hi Alex/ }).isVisible());
const cached = await page.evaluate(async () => {
  const name = (await caches.keys()).find(name => name.startsWith('yoeo-'));
  if (!name) throw new Error('YOEO offline cache is missing');
  const cache = await caches.open(name);
  return (await cache.keys()).map((r) => new URL(r.url).pathname);
});
assert.ok(!cached.some((p) => p.startsWith("/api/")));
assert.equal(cached.filter(p => p.startsWith('/assets/final-ui/')).length, 87);
for (const width of [320, 390, 768, 1280]) {
  await page.setViewportSize({ width, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
}
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "PWA checks passed: manifest, service worker, offline profile, API cache exclusion, simulated camera capture, responsive widths 320–1280.",
);
