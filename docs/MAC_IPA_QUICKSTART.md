# YOEO iPhone IPA — Quick Start

Follow these steps on a Mac.

## Before starting

You need:

- Xcode 26 or newer.
- Node.js 24.
- Access to the private repository: `https://github.com/floshubo/yoeo`.
- An invitation to the Apple Developer team.
- The team's 10-character Apple Team ID.
- Real Apple products connected in RevenueCat before testing real store purchases. See `docs/REVENUECAT_SETUP.md` for the ready-to-use Test Store build.

## 1. Prepare Xcode

1. Open Xcode.
2. Accept the license and install the requested iOS components.
3. Open **Xcode → Settings → Accounts**.
4. Sign in with the invited Apple Developer account.
5. Make sure the team can use bundle ID `app.yoeo.mobile`.

## 2. Clone YOEO

Copy and paste into Terminal:

```bash
git clone https://github.com/floshubo/yoeo.git
cd yoeo
corepack enable
```

Sign in to GitHub if requested.

## 3. Create the production environment file

For an existing checkout, first pull the latest UI and component assets:

```bash
git switch main
git pull --ff-only origin main
```

Keep your existing `.env.production` values. All app assets are included in the repository; no additional asset download is needed. Run the IPA build command below again so it rebuilds the web app and synchronizes the new UI into iOS before archiving.

Copy and paste this complete command into Terminal:

```bash
cat > .env.production <<'EOF'
VITE_REVENUECAT_IOS_API_KEY=
VITE_PRIVACY_POLICY_URL=https://yoeo.app/privacy.html
VITE_SUPPORT_URL=https://yoeo.app/support.html
VITE_AI_PROVIDER_NAME=OpenAI
VITE_API_BASE_URL=https://yoeo.onrender.com
EOF
```

The verified YOEO public Apple SDK key is included in the code. Leave the override empty, or set a real `appl_` key if intentionally changing the RevenueCat app. Remove any old placeholder value.

Do not add an OpenAI key. The app uses the hosted YOEO backend, which keeps that key private.

## 4. Build the IPA

Replace `ABCDEFGHIJ` with the real Apple Team ID, then copy and paste:

```bash
APPLE_TEAM_ID=ABCDEFGHIJ IOS_BUILD_NUMBER=1 IOS_VERSION=1.0 pnpm native:ipa:ios
```

The script installs dependencies, builds the app, synchronizes Capacitor, signs the iOS archive, and exports the IPA.

For every later upload, increase `IOS_BUILD_NUMBER`:

```bash
APPLE_TEAM_ID=ABCDEFGHIJ IOS_BUILD_NUMBER=2 IOS_VERSION=1.0 pnpm native:ipa:ios
```

## 5. Find the file

For version 1.0 and build 1:

```text
output/ios/YOEO-1.0-1.ipa
```

## 6. Upload to TestFlight

1. Install and open Apple Transporter on the Mac.
2. Sign in with the Apple Developer account.
3. Drag `YOEO-1.0-1.ipa` into Transporter.
4. Click **Deliver**.
5. Open App Store Connect and wait for processing.
6. Add the build to a TestFlight group and invite testers.

Use TestFlight to install the app on iPhones. Do not send the IPA directly to ordinary testers.

## If the build fails

- **RevenueCat key error:** use the public iOS key beginning with `appl_`, not a `test_` or secret key.
- **Signing error:** sign in to Xcode and confirm the Apple Developer invitation.
- **Bundle ID error:** the team must own `app.yoeo.mobile`.
- **Build number used:** increase `IOS_BUILD_NUMBER`.
- **More help:** read `docs/FRIEND_IOS_IPA_BUILD.md`.
