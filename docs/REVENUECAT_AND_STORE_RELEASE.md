# RevenueCat and native store release

The repository contains complete Capacitor projects in `ios/` and `android/`. RevenueCat is integrated in `src/revenuecat.ts` and the live subscription experience is in `src/ProfileViews.tsx`.

## Android publishing from this PC

The Android debug build has been verified. Its installable APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

For the Play Store, first create an upload key once. Run the following from PowerShell and answer the password/name prompts. Keep the generated keystore and its passwords backed up outside the repository; losing the upload key complicates future updates.

```powershell
& 'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe' -genkeypair -v -keystore "$HOME\yoeo-upload.jks" -alias yoeo-upload -keyalg RSA -keysize 2048 -validity 10000
```

Set the signing values in the same PowerShell window. These values are read only for the build and are never written into the app repository.

```powershell
$env:YOEO_KEYSTORE_PATH="$HOME\yoeo-upload.jks"
$env:YOEO_KEY_ALIAS="yoeo-upload"
$env:YOEO_KEYSTORE_PASSWORD="your-keystore-password"
$env:YOEO_KEY_PASSWORD="your-key-password"
pnpm native:bundle:android
```

The finished signed bundle will be `android/app/build/outputs/bundle/release/app-release.aab`. Upload that file to **Play Console → Testing → Internal testing → Create new release**. Start with an internal test; Google Play then reports any remaining account, policy, listing, or product requirements before production review.

## Local configuration

The supplied RevenueCat Test Store key is stored only in the ignored local `.env` file. A fresh checkout should copy `.env.example` to `.env` and set:

```dotenv
VITE_REVENUECAT_TEST_API_KEY=test_...
VITE_REVENUECAT_IOS_API_KEY=
VITE_REVENUECAT_ANDROID_API_KEY=
REVENUECAT_SERVER_API_KEY=test_...
REVENUECAT_ENTITLEMENT_ID=yoeo_pro
```

`VITE_REVENUECAT_TEST_API_KEY` is for RevenueCat Test Store builds. Before a store release, set the public Apple and Google SDK keys in the platform-specific variables. Vite variables are embedded in the app bundle, so only public SDK keys belong in `VITE_` variables. Never put a RevenueCat secret key in a `VITE_` variable.

The bundled native app also needs the deployed API origin at build time:

```dotenv
VITE_API_BASE_URL=https://your-api.example.com
```

The API deployment must set this exact allowlist:

```dotenv
NATIVE_APP_ORIGINS=capacitor://localhost,http://localhost
```

## RevenueCat dashboard setup

1. Open **Product catalog → Products → Test Store**.
2. Create `monthly` as a monthly subscription.
3. Create `yearly` as a yearly subscription.
4. Create `lifetime` as a lifetime/non-consumable purchase.
5. Open **Entitlements**, create `yoeo_pro`, and attach all three products.
6. Open **Offerings**, create an offering named `default`, and make it the current offering.
7. Add package `$rc_monthly` with `monthly`, `$rc_annual` with `yearly`, and `$rc_lifetime` with `lifetime`.
8. The app uses its custom subscription screen. A RevenueCat-hosted Paywall is optional; the current purchase button uses the selected package directly.
9. Configure Customer Center if the RevenueCat account has access to it. YOEO shows Customer Center only to a customer with active Pro access.

Until the offering is current and contains those packages, the app displays **Product not available**. Prices always come from the store through RevenueCat; the code does not hardcode currency or price.

## Implemented purchase lifecycle

`configureRevenueCat()` selects the platform SDK key, enables informational trusted-entitlement verification, and configures RevenueCat once. The SDK starts with RevenueCat's anonymous App User ID. YOEO sign-in calls `Purchases.logIn()` with the Supabase user ID so the store customer is linked to the account, and sign-out calls `logOut()`; email addresses are never used as identifiers. A cached account identity is kept across launches while its YOEO session exists and is logged out otherwise.

The subscription screen:

- fetches `Purchases.getOfferings()` and `Purchases.getCustomerInfo()`;
- checks `customerInfo.entitlements.active.yoeo_pro.isActive`;
- listens for CustomerInfo changes;
- purchases the selected monthly, yearly, or lifetime package;
- treats purchase cancellation as a normal dismissal;
- restores purchases and refreshes entitlement state;
- shows the custom paywall with live store prices; and
- presents Customer Center for an active customer.

The server verifies the anonymous customer sent in the `X-YOEO-Purchase-ID` header through RevenueCat `GET /v1/subscribers/{app_user_id}` before every paid scan, and still checks a signed-in account's entitlement when Supabase reports a free plan. Set `REVENUECAT_SERVER_API_KEY` on the API deployment before release so a valid `yoeo_pro` purchase bypasses the three-scan limit. For larger production traffic, add an authenticated RevenueCat webhook that updates `scan_accounts`; webhooks require an eligible RevenueCat plan and should use HMAC verification and idempotent event handling.

## Run and test

Browser development still works with:

```sh
pnpm dev
```

Browsers cannot open native App Store or Google Play purchase sheets. Use a native Test Store build:

```sh
pnpm run build -- --mode revenuecat-test
pnpm exec cap sync
```

This build permits an anonymous RevenueCat Test Store purchase without a YOEO account. RevenueCat creates a device-local `$RCAnonymousID` automatically. The Test Store purchase modal can simulate success, failure, or cancellation without charging a payment method. Production builds behave the same way: purchases, restores and paid scans never require a YOEO account.

On macOS, prepare and open iOS with:

```sh
pnpm native:test:ios
pnpm native:open:ios
```

Do not put the `test_...` key in `.env.production` or ship a `revenuecat-test` build to TestFlight or the App Store. Production uses `VITE_REVENUECAT_IOS_API_KEY=appl_...`; the Test Store build selects the separate public Test Store key automatically.

Test all three products, cancellation, restore after reinstall, account switching, expiration, billing retry, and offline startup. Confirm `yoeo_pro` is active after each successful purchase while signed out of YOEO, and that signing in or out does not change it.

## App Store Connect

1. Enroll in the Apple Developer Program and create the App ID `app.yoeo.mobile`.
2. Create the app record in App Store Connect with the same bundle ID.
3. Accept the Paid Apps Agreement and complete tax and banking details.
4. Create one subscription group containing auto-renewable products `monthly` and `yearly`.
5. Create `lifetime` as a non-consumable in-app purchase.
6. Add localized display names, descriptions, prices, and review screenshots for each product.
7. Import the products into the Apple app in RevenueCat, attach them to `yoeo_pro`, and place them in the current offering packages.
8. Replace `VITE_REVENUECAT_IOS_API_KEY` with the Apple public SDK key, then run `pnpm native:sync`.
9. On a Mac, run `pnpm native:open:ios` to open `ios/App/App.xcodeproj`, select the YOEO team, enable the **In-App Purchase** capability, select a real device, and test with a sandbox Apple ID.
10. Set the version/build number, archive in Xcode, validate, and upload to App Store Connect.
11. Complete App Privacy details. Menu/allergen photos are sent to the configured AI service for analysis, profile and allergy data can be stored locally or in the signed-in account, and purchase data is processed by Apple and RevenueCat. The answers must match the final production data flow and retention policy.
12. Add a privacy-policy URL, support URL, screenshots, age rating, review notes, and a review account or exact sign-in instructions. Submit the in-app purchases with the first app version.

For **App Store Server Notifications**, open the Apple app in RevenueCat and copy its complete **Apple Server Notification URL**. Paste that same RevenueCat URL into both the Production Server URL and Sandbox Server URL fields in App Store Connect, and select Version 2 for both. Do not enter the YOEO website or Render API URL in those fields.

The iOS project already includes camera/photo usage text, HTTPS-only transport defaults, the YOEO icon/splash set, iOS 15 minimum support, and the RevenueCat Swift packages. Xcode signing and the In-App Purchase capability are account-owned settings and cannot be committed as reusable credentials.

## Google Play

1. Create a Play Console app with application ID `app.yoeo.mobile`.
2. Create `monthly` and `yearly` subscriptions with active base plans, plus `lifetime` as a one-time non-consumable product.
3. Import them into the Google app in RevenueCat and attach the matching products to the same offering packages and `yoeo_pro` entitlement.
4. Set `VITE_REVENUECAT_ANDROID_API_KEY` to the Google public SDK key.
5. Add license testers and publish the products before testing through an internal testing track.
6. Create a private upload key and configure Play App Signing. Keep keystore files and passwords outside Git.
7. Run `pnpm native:bundle:android` after adding the release signing configuration, then upload `android/app/build/outputs/bundle/release/app-release.aab`.
8. Complete Data safety, content rating, store listing, privacy policy, screenshots, and reviewer access.

The Android project targets API 36, has the required Internet permission, disables app-data backups, and uses `singleTop` so returning from a bank verification app does not cancel the purchase flow.

## Release discipline

- Increase Android `versionCode` and iOS `CURRENT_PROJECT_VERSION` for every upload.
- Keep monthly and yearly in the same subscription group/tier unless product behavior changes.
- Grant Pro from the `yoeo_pro` entitlement only; do not infer access from a product identifier.
- Never unlock scans merely because a client says it purchased. The API performs its own RevenueCat lookup.
- Refresh CustomerInfo after purchase, restore, login, and app foregrounding.
- Configure Apple App Store Server Notifications and Google Real-time Developer Notifications through RevenueCat before launch so refunds and expirations propagate quickly.
- Test sandbox renewals and cancellations before each release.

Official references: [Capacitor installation](https://www.revenuecat.com/docs/getting-started/installation/capacitor), [product setup](https://www.revenuecat.com/docs/projects/configuring-products), [Offerings](https://www.revenuecat.com/docs/offerings/overview), [customer identity](https://www.revenuecat.com/docs/customers/identifying-customers), [Paywalls](https://www.revenuecat.com/docs/tools/paywalls), [Customer Center](https://www.revenuecat.com/docs/tools/customer-center), [CustomerInfo](https://www.revenuecat.com/docs/customers/customer-info), and [webhook security](https://www.revenuecat.com/docs/integrations/webhooks).
