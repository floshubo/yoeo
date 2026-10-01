# YOEO purchases

Verified in RevenueCat on September 18, 2026:

- Project: YOEO (`1b07b42d`). Apple bundle: `app.yoeo.mobile`.
- Entitlement: `yoeo_pro`.
- Default offering: `default` with `$rc_monthly`, `$rc_annual`, `$rc_lifetime`; each package currently points only to a Test Store product.
- The App Store catalog still has **no products**, so the production purchase sheet cannot open yet. The Test Store has products for monthly, annual and lifetime plans.
- Apple's in-app purchase signing key is valid in RevenueCat. The separate App Store Connect import API key is missing; its `.p8` file is required to import products automatically.
- No Google Play app is connected. Web checkout is not integrated.

The app fetches packages and localized prices from RevenueCat/the store each time the subscription screen opens. Prices are not copied into source code. Signup uses the Supabase account ID as the RevenueCat customer ID; purchases and restores require sign-in. The backend independently checks that account's `yoeo_pro` entitlement for unlimited scans, including on the website.

Public SDK keys are included in `server/revenuecat-config.json`. These are client keys, not secret/admin keys. Optional environment overrides remain supported. No RevenueCat password or secret key belongs in the repository.

## Test on a Mac now

```bash
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm native:test:ios
pnpm native:open:ios
```

Select the Apple team and an iPhone/simulator in Xcode, then Run. This explicit build mode uses the existing RevenueCat Test Store products and displays a simulated-purchase notice. It does not charge money. Native API calls default to the hosted Render backend.

1. Sign up/sign in to YOEO (complete email confirmation if requested).
2. Open Profile → Subscription. Confirm the prices load.
3. Choose a plan and complete the simulated purchase.
4. Verify Pro unlocks saved results and scans beyond the three free scans.
5. Restart and verify the same signed-in account retains Pro. Test Restore purchases, cancellation, and a different account.

If RevenueCat denies sandbox access, the project owner must allow the tester's RevenueCat app user ID under Project settings → Sandbox access. Do not broadly disable the sandbox restrictions.

This test mode is for local Xcode testing. **Do not distribute this build as a paid production app.** The normal `pnpm native:ipa:ios` command rebuilds in production mode with the Apple key. A physical-device purchase/restore test is still required; automated checks use mocked store responses.

## Enable real purchases later

1. Create the real products/prices in App Store Connect, or use your friend's existing exact product IDs.
2. Import/add those Apple products in RevenueCat. Import requires the App Store Connect API credential; manually adding products requires exact IDs.
3. Attach all Apple products to `yoeo_pro` and their corresponding packages in the current `default` offering, alongside the Test Store products.
4. Build with `pnpm native:ipa:ios`, then test purchase and restore through TestFlight before release.

The custom subscription screen displays live store prices. A RevenueCat components-based Paywall is attached to the offering, but this screen purchases packages directly and does not present that hosted paywall. Store product IDs may differ from the test IDs because the app selects the standard monthly/annual/lifetime packages.
