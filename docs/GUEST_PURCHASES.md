# Pro without a YOEO account — October 8, 2026

App Review rejected a build because buying or restoring YOEO Pro, and scanning beyond the three free scans, required a YOEO account. Payment and login are now two separate systems: the App Store account pays, and an optional YOEO account only adds a recoverable identity.

## The flow

1. First launch: onboarding, allergen profile stored on the device, straight to scanning. No login wall.
2. Free scans used up: the Pro offer opens and the purchase goes directly through the App Store payment sheet.
3. After the first successful purchase, a one-time optional prompt offers account sync and cross-platform access, including Android. It explicitly explains that Restore Purchases works on other Apple devices without a YOEO account. Its dismiss button reads "Maybe later".
4. Settings keeps a permanent "Sign in or create account" entry and a "Restore Purchases" button. Both are also on the Subscription screen.

## Payment: the App Store account

The RevenueCat SDK runs as an anonymous customer (`$RCAnonymousID:…`, a random 128-bit value created on the device). The app sends that ID in the `X-YOEO-Purchase-ID` header on `/api/usage` and `/api/analyze`, and before any paid scan the server checks the `yoeo_pro` entitlement with RevenueCat `GET /v1/subscribers/{app_user_id}`. The client never tells the server that it is Pro, and no YOEO login takes part.

Rules in `server/usage.mjs`:

- Free scans are still counted per device with the signed guest token; no lookup happens while free scans remain.
- The header is accepted only in the SDK's anonymous format. Emails, account IDs and other values are rejected with 400 and never looked up.
- A failed store lookup is never treated as Pro. After the free allowance it returns 503 so the scanner can retry; while free scans remain, `/api/usage` still reports them so the scanner is not blocked.
- Signed-in users are additionally checked through their account (`scan_accounts` plan plus the account's own RevenueCat entitlement). A store outage does not block an account that already holds Pro, and a Supabase outage does not block a store customer.

## Login: an optional, recoverable identity

Signing in with Apple, Google or email attaches the YOEO account to the anonymous store customer (`src/revenuecat.ts`):

- The app calls `Purchases.logIn()` with the YOEO user ID. RevenueCat merges the anonymous purchases into a new account; for an account it already knows, the device's receipt is synced to it once. Signing in with the same account on another device, including Android, returns the same subscription, which Restore Purchases alone cannot do across platforms. The device keeps sending its anonymous ID, so the server also verifies the linked customer without a Supabase round trip.
- Signing out calls `Purchases.logOut()`. The device becomes a fresh store customer and Restore Purchases recovers the App Store receipt without an account. A linked identity cached by the SDK is kept across launches while the YOEO session exists.
- Scan history and the allergen profile sync to the account (`src/accountSync.ts`; tables `saved_reports` and `person_profiles`). On sign-in the account copies are merged with what is on the device and anything saved before signing in is uploaded; afterwards every save, delete and profile edit is mirrored. Signing out never deletes local data. The `saved_reports` table is created by `supabase/migrations/202610080001_saved_reports.sql` and is removed with the account.

Android needs `VITE_REVENUECAT_ANDROID_API_KEY` in the native build for the SDK to run there; the server check works the same way.

Sync captures the account credentials for each run, marks locally cached data with its owner and does not upload another account's history. Failed profile edits and report deletions can retry on reconnect, returning to the app or tapping Settings → Sync account data. A visible message reports incomplete sync. Local copies remain on shared devices after signing out.

Production Supabase setup on October 8: installed the missing `202609050001_profiles.sql` and `202610080001_saved_reports.sql` together in a transaction. Verified row-level security is enabled on both tables. Existing scan quota tables and account-deletion function were already present.

## Verification

- `pnpm test` covers guest purchases (`tests/guest-purchases.test.mjs`), the anonymous SDK identity with linking and unlinking (`tests/revenuecat.test.mjs`), the saved results routes (`tests/auth.test.mjs`) and the scan limit (`tests/usage.test.mjs`).
- `pnpm preview:purchases` runs the real UI with a simulated store and account service at <http://127.0.0.1:5195>, including purchase, the post-purchase prompt, sign-in linking, cancellation, restore, a catalog outage and an exhausted allowance. No real purchase is made.
- `scripts/navigation-premium-test.mjs`, `scripts/save-account-flow-test.mjs` and `scripts/profile-subscription-test.mjs` check the signed-out flows, linking on sign-in, unlinking on sign-out and Restore Purchases from Settings in a headless browser with mocked APIs.
- A physical iPhone with a TestFlight build is still required to verify a real App Store purchase, restore while signed out, and an Android sign-in picking up the same subscription.

## Notes for the App Review reply

- Purchase and restore are available on the Subscription screen and in Settings without signing in; there is no sign-in step before the App Store sheet.
- Paid features work while signed out, including unlimited scans. The server verifies the purchase with RevenueCat using the device's anonymous customer ID, not a YOEO account.
- YOEO registration is optional. It is offered once after a purchase with a "Maybe later" dismissal, and otherwise lives in Settings and Profile. It adds cross-platform access to the same subscription, cloud sync of scan history and the allergen profile, and recovery after a reinstall.
