# YOEO purchases

Verified in RevenueCat on October 8, 2026:

- Project: YOEO (`1b07b42d`). Apple bundle: `app.yoeo.mobile`.
- Entitlement: `yoeo_pro`.
- Default offering: `default` with `$rc_monthly`, `$rc_annual`, `$rc_lifetime`; each package has both an Apple product and a Test Store product.
- Apple products: `app.yoeo.mobile.premium.monthly`, `app.yoeo.mobile.premium.yearly`, and `app.yoeo.mobile.pro.lifetime`. All three are attached to `yoeo_pro`. The monthly product's displayed store status is **Ready to Submit**; RevenueCat setup does not establish App Store approval.
- Restore behavior is **Transfer to new App User ID**, compatible with optional account registration. Restoring signed out can transfer a linked receipt away from the identified account; signing in again on the purchasing device can sync it back. Verify this on real devices before claiming seamless cross-platform access.
- No Google Play app is connected, and the currently signed-in collaborator cannot add app configurations. The project owner must connect Google Play; then set `VITE_REVENUECAT_ANDROID_API_KEY` for Android builds. Web checkout is not integrated.

The app fetches packages and localized prices from RevenueCat/the store each time the subscription screen opens. Prices are not copied into source code. Purchases use the anonymous RevenueCat customer ID that the SDK creates on the device; buying and restoring never require a YOEO sign-in. Signing in links that store customer to the YOEO account through RevenueCat `logIn`, so the same subscription is available on another device or on Android through the account; signing out unlinks it, and Restore Purchases recovers the App Store receipt on any Apple device. The backend verifies that customer's `yoeo_pro` entitlement before every paid scan. Signed-in website users keep the administrator-managed account entitlement. See [Pro without a YOEO account](GUEST_PURCHASES.md).

Public SDK keys are included in `server/revenuecat-config.json`. These are client keys, not secret/admin keys. Optional environment overrides remain supported. No RevenueCat password or secret key belongs in the repository.

## Test on a Mac now

```bash
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm native:test:ios
pnpm native:open:ios
```

Select the Apple team and an iPhone/simulator in Xcode, then Run. This explicit build mode uses the existing RevenueCat Test Store products and displays a simulated-purchase notice. It does not charge money. Native API calls default to the hosted Render backend.

1. Stay signed out of YOEO. Sign-in must not be needed at any step.
2. Open Profile → Subscription. Confirm the prices load.
3. Choose a plan and complete the simulated purchase.
4. Verify Pro unlocks scans beyond the three free scans. Saving results locally is free.
5. Restart and verify Pro persists while signed out. Reinstall and tap Restore Purchases. Sign in to link Pro to the YOEO account. Sign out, then restore to recover Pro for the new anonymous customer. Test cancellation and a different store account.

If RevenueCat denies sandbox access, the project owner must allow the tester's RevenueCat app user ID under Project settings → Sandbox access. Do not broadly disable the sandbox restrictions.

This test mode is for local Xcode testing. **Do not distribute this build as a paid production app.** The normal `pnpm native:ipa:ios` command rebuilds in production mode with the Apple key. A physical-device purchase/restore test is still required; automated checks use mocked store responses.

## Before the next App Store submission

1. Confirm all three products are included in the App Store Connect submission and have complete pricing/localization/review details. Do not create duplicate products; the configured identifiers above already exist.
2. Pull the latest `main` on the signing Mac, install dependencies, and build with `pnpm native:ipa:ios` using a new build number.
3. Test a purchase while signed out, scan after exhausting the free allowance, dismiss the optional account prompt, reinstall and restore without signing in, and test account linking on a second device.
4. Submit the new binary after these TestFlight checks. GitHub's simulator artifact is not a signed TestFlight build.
5. Render currently uses a free instance and warns that inactive services can take 50 seconds or more to wake. Select an appropriate always-on plan before review; this requires the owner's billing decision. Keep Supabase active as well.

The custom subscription screen displays live store prices. A RevenueCat components-based Paywall is attached to the offering, but this screen purchases packages directly and does not present that hosted paywall. Store product IDs may differ from the test IDs because the app selects the standard monthly/annual/lifetime packages.
