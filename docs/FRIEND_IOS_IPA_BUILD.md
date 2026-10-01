# Build the YOEO iOS IPA on a Mac

This guide builds a signed YOEO `.ipa` from the GitHub repository. The app uses the hosted YOEO backend at `https://yoeo.onrender.com`; the AI API key and other server secrets remain on Render and are never copied into the iPhone app.

## What you need

- A Mac with Xcode 26 or newer and the iOS platform installed.
- Node.js 24 and Git.
- Access to the private repository `https://github.com/floshubo/yoeo`.
- Membership in the Apple Developer team that owns bundle ID `app.yoeo.mobile`.
- An Apple Distribution certificate and its private key in the Mac keychain. Xcode can normally create and manage these after signing in.
- The RevenueCat public Apple SDK key for the YOEO iOS app. It starts with `appl_`.

## 1. Prepare Xcode

1. Install Xcode from the Mac App Store.
2. Open Xcode once, accept the license, and install the requested iOS components.
3. Open **Xcode → Settings → Accounts** and sign in with the Apple ID invited to the YOEO Apple Developer team.
4. Confirm that the team can use the App ID `app.yoeo.mobile` and automatic signing.
5. Find the 10-character Team ID in the account/team details or on the Apple Developer membership page. You will use it as `APPLE_TEAM_ID`.

## 2. Clone the repository

Open Terminal and run:

```bash
git clone https://github.com/floshubo/yoeo.git
cd yoeo
corepack enable
```

If GitHub asks for authentication, sign in with a GitHub account that has been invited to the private repository.

## 3. Get the RevenueCat Apple key

1. Sign in to RevenueCat.
2. Open the YOEO project.
3. Open the iOS app whose bundle ID is `app.yoeo.mobile`. Create that app in RevenueCat first if it does not exist.
4. Copy its **Public SDK Key**, which begins with `appl_`.

Do not use the `test_...` Test Store key for an App Store build. Do not place a RevenueCat secret/server key in a `VITE_` variable.

## 4. Create `.env.production`

Create a file named `.env.production` in the cloned repository root:

```env
VITE_REVENUECAT_ANDROID_API_KEY=
VITE_REVENUECAT_IOS_API_KEY=appl_PASTE_THE_PUBLIC_APPLE_KEY_HERE
VITE_PRIVACY_POLICY_URL=https://yoeo.onrender.com/privacy.html
VITE_SUPPORT_URL=https://yoeo.onrender.com/support.html
VITE_AI_PROVIDER_NAME=OpenAI
VITE_API_BASE_URL=https://yoeo.onrender.com
```

Replace the complete `appl_PASTE_THE_PUBLIC_APPLE_KEY_HERE` value with the real RevenueCat public Apple SDK key. The file is intentionally ignored by Git.

The AI key is not part of this file. The native app sends analysis requests over HTTPS to the YOEO Render backend, and the backend privately calls the AI provider.

## 5. Build the IPA

From the repository root, run this single command, replacing `ABCDEFGHIJ` with the real Apple Team ID:

```bash
APPLE_TEAM_ID=ABCDEFGHIJ IOS_BUILD_NUMBER=1 IOS_VERSION=1.0 pnpm native:ipa:ios
```

The script automatically:

1. Installs the exact dependency versions from the lockfile.
2. Validates the production URLs and RevenueCat Apple key.
3. Builds the React PWA.
4. Synchronizes the Capacitor iOS project and native plugins.
5. Validates the iOS privacy files.
6. Archives YOEO with automatic Apple signing.
7. Exports a signed App Store Connect IPA.

Every App Store upload needs a larger `IOS_BUILD_NUMBER`. For example, use `2` after uploading build `1`. Change `IOS_VERSION` when releasing a new user-facing version.

## 6. Find the IPA

For version `1.0` and build `1`, the finished file is:

```text
yoeo/output/ios/YOEO-1.0-1.ipa
```

The script prints the full absolute path when it finishes.

## 7. Upload and test

1. Install Apple Transporter from the Mac App Store, sign in, and drop the `.ipa` into Transporter; or upload it through Xcode Organizer.
2. Wait for the build to finish processing in App Store Connect.
3. Complete export-compliance questions when requested.
4. Add the build to an internal TestFlight group.
5. Invite testers. External testers may require Beta App Review.

An App Store Connect IPA is distributed through TestFlight or the App Store. It is not intended for unrestricted direct installation on arbitrary iPhones.

## Optional headless authentication

The build script can use an App Store Connect API key for provisioning access. Set all three variables together:

```bash
export ASC_KEY_ID=YOUR_KEY_ID
export ASC_ISSUER_ID=YOUR_ISSUER_ID
export ASC_KEY_PATH=/secure/path/AuthKey_YOUR_KEY_ID.p8
APPLE_TEAM_ID=ABCDEFGHIJ IOS_BUILD_NUMBER=1 IOS_VERSION=1.0 pnpm native:ipa:ios
```

The Mac still needs the Apple Distribution certificate and private key in its keychain. Never commit the `.p8`, certificates, provisioning profiles, or `.env.production`.

## Common errors

- **Missing `.env.production`**: create the file in the repository root using the template above.
- **Invalid RevenueCat key**: use the public iOS key beginning with `appl_`, not a `test_`, `sk_`, or server key.
- **No signing certificate**: sign into Xcode with the invited Apple Developer account and let Xcode manage signing.
- **Bundle identifier unavailable**: the Apple Developer team must own `app.yoeo.mobile`.
- **Build number already used**: increase `IOS_BUILD_NUMBER` and run the command again.
- **Provisioning failure**: verify the team membership, App ID, In-App Purchase capability, signing certificate, and internet access.
- **RevenueCat products unavailable**: configure `monthly`, `yearly`, and `lifetime`, attach them to entitlement `yoeo_pro`, and add them to the current RevenueCat offering.
- **Render responds slowly at first**: the free Render service may need up to about a minute to wake after inactivity.

## Live services

- PWA: `https://yoeo.onrender.com/`
- API and backend: `https://yoeo.onrender.com/`
- Privacy policy: `https://yoeo.onrender.com/privacy.html`
- Support: `https://yoeo.onrender.com/support.html`
