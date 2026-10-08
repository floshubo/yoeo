import { createRequire } from "node:module";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(
  path.resolve(process.env.YOEO_TOOLS_DIR || ".", "package.json"),
);
const { chromium } = require("playwright");
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 360, height: 800 },
  deviceScaleFactor: 1,
});
await page.addInitScript(() => localStorage.setItem('yoeo-account-session', 'ui-test-session'));
await page.route('**/api/auth/session', route => route.fulfill({json:{user:{id:'ui-test-user'},sessionToken:'ui-test-session'}}));
await page.route('**/api/usage', route => route.fulfill({json:{enforced:true,plan:'pro',remaining:null}}));
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.YOEO_TEST_URL || "http://127.0.0.1:5187");
await page.getByRole("button", { name: "Get started", exact: true }).waitFor();
await page.screenshot({ path: "test-results/welcome.png" });
await page.getByRole("button", { name: "Get started", exact: true }).click();
await page.screenshot({ path: "test-results/onboarding.png" });
for (let i = 0; i < 8; i++) {
  await page
    .getByRole("button", {
      name: i === 0 ? "Critical" : i === 4 ? "Avoid" : "Safe",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
}
await page.getByRole("textbox", { name: "Your name" }).fill("Alex");
await page.getByRole("button", { name: "Let’s go", exact: true }).click();
await page
  .getByRole("button", { name: "Start Analyzing", exact: true })
  .waitFor();
await page.screenshot({ path: "test-results/home.png" });
await page
  .getByRole("navigation")
  .getByRole("button", { name: "Allergens", exact: true })
  .click();
await page.getByRole("button", { name: "Milk", exact: true }).click();
await page.screenshot({ path: "test-results/allergens.png" });
await page.locator(".allergen-row").first().click();
await page.getByRole("button", { name: "Move to Avoid", exact: true }).click();
await page.reload();
await page
  .getByRole("button", { name: "Start Analyzing", exact: true })
  .waitFor();
const prefs = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("yoeo-profile")),
);
assert.equal(prefs.allergens.find((a) => a.name === "Milk").severity, "Avoid");
await page
  .getByRole("button", { name: "Start Analyzing", exact: true })
  .click();
await page.getByRole("button", { name: "Photo", exact: true }).click();
await page
  .getByRole("button", { name: "No, upload the menu", exact: true })
  .click();
await page
  .getByLabel("Upload menu photos")
  .setInputFiles("public/assets/183-2448-imgImage42.png");
await page
  .getByRole("button", { name: "Analyze 1 photo", exact: true })
  .waitFor();
await page.screenshot({ path: "test-results/review.png" });
assert.equal(await page.getByRole('button', { name: 'Analyze 1 photo', exact: true }).isEnabled(), false);
await page.getByRole('checkbox', { name: /I agree to send/ }).check();
await page.route('**/api/analyze', route => route.fulfill({status:503,json:{error:'AI provider key is not configured.'}}), {times:1});
await page
  .getByRole("button", { name: "Analyze 1 photo", exact: true })
  .click();
await page.getByRole("alert").waitFor();
assert.match(await page.getByRole("alert").textContent(), /AI|provider|key/i);
const report = {
  id: "ui-fixture",
  createdAt: new Date().toISOString(),
  title: "Menu workflow test",
  model: "mock-provider",
  readable: true,
  sourceType: "menu",
  extractedText: "Milk soup",
  summary: "Test fixture",
  profileSnapshot: prefs.allergens,
  warnings: ["AI cannot determine cross-contact."],
  dishes: [
    {
      id: "1",
      name: "Milk soup",
      description: "Milk is declared on the menu.",
      ingredients: ["Milk"],
      allergens: [
        {
          name: "Milk",
          severity: "Avoid",
          certainty: "declared",
          evidence: "The menu lists milk.",
        },
      ],
      uncertainties: ["Cross-contact unknown"],
      questions: ["Is shared equipment used?"],
      status: "Avoid",
    },
    {
      id: "2",
      name: "Potatoes",
      description: "Potatoes",
      ingredients: ["Potatoes"],
      allergens: [],
      uncertainties: ["Hidden ingredients unknown"],
      questions: [],
      status: "Uncertain",
    },
  ],
};
await page.route("**/api/analyze", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(report),
  }),
);
await page
  .getByRole("button", { name: "Analyze 1 photo", exact: true })
  .click();
await page.getByRole("button", { name: /Show all results/ }).click();
await page.screenshot({ path: "test-results/results.png" });
await page.getByRole("button", { name: "Save results", exact: true }).click();
await page.getByRole("heading", { name: "Saved Results" }).waitFor();
await page
  .getByRole("navigation")
  .getByRole("button", { name: "Profile", exact: true })
  .click();
await page.screenshot({ path: "test-results/profile.png" });
await page.getByRole("button", { name: "Saved Results", exact: true }).click();
assert.ok(
  await page.getByRole("heading", { name: "Menu workflow test" }).isVisible(),
);
assert.deepEqual(errors, []);
const broken = await page
  .locator("img")
  .evaluateAll((imgs) =>
    imgs.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src),
  );
assert.deepEqual(broken, []);
await page.setViewportSize({ width: 390, height: 844 });
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
await browser.close();
console.log(
  "UI workflow passed: onboarding, persistence, allergen editing, real upload, missing-key error, mocked analysis, report saving, mobile layout.",
);
