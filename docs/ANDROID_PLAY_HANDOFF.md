# YOEO Android and Google Play handoff

## Build identity

- App name: **YOEO**
- Package/application ID: **`app.yoeo.mobile`**
- Current version: **`1.0`**
- Current version code: **`1`**
- Minimum Android: API 24
- Target/compile API: API 36
- Subscription entitlement: **`yoeo_pro`**
- Products: **`monthly`**, **`yearly`**, and **`lifetime`**

The Android project, launcher icon, adaptive icon, splash assets, camera integration, RevenueCat SDK, Paywall, Customer Center, purchase restoration, and signed bundle pipeline are present. The upload key is stored locally in `android/keystores/yoeo-upload.jks`; it and its ignored `.env.android-signing` credentials must be backed up securely.

## Access to request from the Google Play account owner

Ask the owner to invite your Google account in **Play Console → Users and permissions** and grant access to the YOEO app. You need permission to:

- view app information;
- manage testing and production releases;
- manage store presence and the store listing;
- manage in-app products/subscriptions;
- view financial data, orders, and cancellation responses; and
- manage orders and subscriptions.

The owner should create the app using the exact package ID `app.yoeo.mobile`. Package IDs cannot be changed after the first artifact is uploaded.

## Configure Google Play products

1. Complete the payments profile and merchant setup.
2. Create `monthly` under **Monetize → Products → Subscriptions** with one active monthly base plan.
3. Create `yearly` under **Subscriptions** with one active yearly base plan.
4. Create `lifetime` under **In-app products** as a non-consumable one-time product.
5. Add prices and activate every base plan/product in the countries used for testing.
6. Enable Play App Signing when creating the first release. Use Google’s generated app-signing key and YOEO’s local key as the upload key.
7. Upload `docs/yoeo-upload-certificate.pem` only if Play Console asks to register or reset the upload certificate.

## Connect Google Play to RevenueCat

1. In RevenueCat, open the YOEO project and add a **Google Play** app with package ID `app.yoeo.mobile`.
2. Create a dedicated Google Cloud service account and enable Google Play Android Developer API, Google Play Developer Reporting API, and Pub/Sub.
3. Give that service account the Google Cloud roles **Pub/Sub Editor** and **Monitoring Viewer**.
4. Invite the service-account email to the YOEO app in Play Console. Grant **View app information and download bulk reports**, **View financial data, orders, and cancellation survey responses**, **Manage orders and subscriptions**, and **Manage store presence**.
5. Create a JSON key for the service account and upload it only to **RevenueCat → Project settings → Google Play app → Service account credentials**. Do not add it to this repository.
6. Import the three Google Play products into RevenueCat.
7. Create entitlement `yoeo_pro` and attach `monthly`, `yearly`, and `lifetime`.
8. Create the current Offering `default` with packages `$rc_monthly`, `$rc_annual`, and `$rc_lifetime` mapped to those products.
9. Publish the RevenueCat Paywall and configure Customer Center.
10. Copy the RevenueCat **public Android SDK key** into `.env.production` as `VITE_REVENUECAT_ANDROID_API_KEY`. It is the public app key, not a secret/admin key.

RevenueCat reports that new Google service credentials can take up to 36 hours to validate. The RevenueCat credential page must show valid credentials before purchase testing is considered complete.

## Production configuration and final bundle

Copy `.env.production.example` to the ignored `.env.production` and fill in:

```dotenv
VITE_REVENUECAT_ANDROID_API_KEY=goog_...
VITE_API_BASE_URL=https://your-production-api.example.com
```

The server at `VITE_API_BASE_URL` must allow `capacitor://localhost` through `NATIVE_APP_ORIGINS`, and must have its AI, Supabase, session, and RevenueCat server variables configured. Run:

```powershell
pnpm native:bundle:android
```

The release script refuses to create a store bundle if the Android RevenueCat key is missing or the backend still points to localhost. The resulting upload file is:

`android/app/build/outputs/bundle/release/app-release.aab`

## Internal testing before production

1. Create an **Internal testing** release and upload the AAB.
2. Add tester Google accounts and share the opt-in link.
3. Install from Google Play. Sideloading is insufficient for reliable Play Billing tests.
4. Add the same accounts as license testers.
5. Verify monthly, yearly, lifetime, cancellation, restore after reinstall, account switching, and Customer Center.
6. Verify that three scans work before sign-in and the fourth requires sign-in plus `yoeo_pro`.
7. Verify camera/photo permissions on a physical Android phone.
8. Confirm RevenueCat shows the Supabase UUID as the App User ID and an active `yoeo_pro` entitlement after purchase.

## Play Console submission material

Complete the store listing, app icon, feature graphic, phone screenshots, short and full descriptions, support email, website, and privacy-policy URL. Complete App access, Ads, Content rating, Target audience, News apps, Data safety, and any health-app declaration Play Console displays.

The Data safety and privacy-policy answers must match the deployed system. YOEO can process menu/allergen photos through the configured AI provider, store profile/allergy information locally and in Supabase after sign-in, and send purchase/customer identifiers to Google Play and RevenueCat. Confirm final retention, deletion, encryption, and sharing behavior before submitting these declarations.

Increment `versionCode` for every later upload. Never overwrite or lose `android/keystores/yoeo-upload.jks` or `.env.android-signing` without first keeping a secure backup.
