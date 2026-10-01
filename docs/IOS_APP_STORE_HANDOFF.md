# YOEO for iPhone and iPad

The Capacitor iOS app bundles the PWA and adds native camera access and Apple in-app purchases. Bundle ID: `app.yoeo.mobile`. iOS 15+; build with Xcode 26 or newer and the iOS 26 SDK. This repository is prepared for native builds; it is not an Apple-approved or signed release.

## Build and share

For browser testing, run `pnpm install`, `pnpm build`, and `pnpm start`. Friends need the deployed HTTPS app URL; a GitHub source link alone does not run the app. On iPhone, open that URL in Safari, choose Share → Add to Home Screen → Open as Web App. A PWA does not require App Store review.

The **iOS build** GitHub Actions workflow builds an unsigned simulator app on a Mac runner. It verifies compilation without developer certificates. The resulting artifact is for a Mac simulator, not installation on a friend's iPhone. Check the workflow result after pushing; it has not been verified on this Windows machine.

For TestFlight or App Store submission, use a Mac with Xcode 26+, Node 24, and pnpm 11. The repository includes a one-command IPA builder:

1. Copy `.env.production.example` to `.env.production`. Set the actual API URL, Apple RevenueCat public SDK key, published privacy and support URLs, and actual AI provider name. These are public build settings. Keep server secrets on the API host.
2. Sign in to the Apple Developer team in Xcode once. The team must own the `app.yoeo.mobile` App ID, and the Mac keychain must contain its Apple Distribution certificate and private key. As a headless alternative for provisioning access, set `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_KEY_PATH` for an App Store Connect API key with suitable access; the signing certificate is still required on the Mac.
3. From Terminal at the repository root, run:

   ```bash
   APPLE_TEAM_ID=6W4NV47RS3 IOS_BUILD_NUMBER=1 IOS_VERSION=1.0 pnpm native:ipa:ios
   ```

   The script installs locked dependencies, validates production settings, builds and synchronizes Capacitor, validates the privacy files, archives with automatic signing, and exports `output/ios/YOEO-1.0-1.ipa`.
4. Test the result through TestFlight on a real iPhone and iPad. Upload the IPA with Transporter or Xcode Organizer, complete processing and export-compliance questions, then invite testers. External testing may need Beta App Review. A signed IPA cannot simply be shared through GitHub for unrestricted installation.

## Included safeguards

- Camera and photo permission descriptions, icons and launch assets, HTTPS transport defaults, and safe-area styling.
- A bundled `PrivacyInfo.xcprivacy`, including the Preferences UserDefaults reason `CA92.1`. Data declarations conservatively cover account/profile, health/allergy information, photos/content, purchase history and scan usage linked to an account. Reconcile with the final backend and SDK privacy report before submission.
- Explicit, unchecked consent before sending a scan to the named AI provider; permission is scoped to the current scanner session and can be unchecked.
- Privacy and terms links in account, settings, scan and subscription screens; Apple subscription management, restore purchases, renewal disclosure, and deletion/cancellation explanation.
- Email-code login and Google/Apple OAuth are available in native builds. OAuth returns to the app through `app.yoeo.mobile://auth/callback` and exchanges the code with PKCE. Test both providers on a physical device, including cancellation and cold start, before store submission. Move the encrypted account session from WebView local storage to Keychain before release.
- Native app bundles do not register the PWA service worker, avoiding stale cached code across native updates.

## Required before submission

- Publish an accurate privacy policy with operator identity/contact, the actual AI/account/purchase processors, data purposes, sharing, retention, deletion, and user rights. The preview privacy text is not a finished policy. Ensure both release URLs work without login.
- Verify `NATIVE_APP_ORIGINS` includes `capacitor://localhost` on the API, apply all Supabase migrations, configure reliable email delivery, and test actual account deletion including synced profiles. Review RevenueCat account-data deletion and legally required purchase-record retention; deleting a Supabase account does not automatically erase every processor record.
- Configure Apple products and RevenueCat offerings, Apple public SDK key and server entitlement verification. Test purchase, cancellation, restore after reinstall, expiration, account switching, and management. See [purchase setup](REVENUECAT_AND_STORE_RELEASE.md).
- Complete App Privacy answers from actual production collection, SDKs and retention. Generate and inspect the Xcode privacy report; declarations in source do not replace App Store Connect answers.
- Supply screenshots from supported iPhone/iPad sizes, support and privacy URLs, age-rating answers, export-compliance answers, product metadata, review account and review notes. Confirm rights to the shipped artwork and fonts.
- Test camera permission allow/deny, photo picker, network loss, offline saved reports, small screens, rotation, VoiceOver, enlarged text, email sign-in and deletion on devices. No physical-device testing or signed archive was performed on Windows.
- Describe YOEO as an assistive menu/allergen tool. Do not promise food safety, diagnosis or detection of cross-contact. Apple independently reviews safety, completeness and minimum functionality.

Suggested reviewer path: complete local onboarding → Photo → choose menu → agree to AI processing → Analyze → save result → Profile. Account deletion is in Profile → Edit Profile. Paid features are in Subscription, with Restore purchases available. Provide a working account and sufficient scan allowance for review.

References checked September 10, 2026: [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), [SDK requirements](https://developer.apple.com/news/upcoming-requirements/), [account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [Capacitor privacy reason](https://capacitorjs.com/docs/apis/preferences).
