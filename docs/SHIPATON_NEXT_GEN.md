# YOEO: Next Gen review notes

YOEO is a menu-reading companion for people managing food allergies. Users set an allergen profile and its severity levels, photograph a restaurant menu or allergen list, and receive a dish-by-dish report with detected allergens, source evidence, and uncertainty. The app also supports saved reports, account sync, and a RevenueCat-backed Pro tier. It is designed to support conversations with restaurant staff, not to replace them.

## What to look for in the demo

1. Set the allergen profile and choose severity levels.
2. Capture or upload a menu and, when available, its allergen legend.
3. Review the structured result: dish names, evidence, warnings, and questions to ask staff.
4. Save a report on the device and return to it later; signing in is optional.
5. Open the native subscription screen to see RevenueCat offerings and the entitlement-backed Pro experience.

The AI analysis requires a network connection and a configured vision-model API. It is not an independent laboratory test of the food. When a menu is incomplete or ambiguous, the report should surface uncertainty rather than promise safety.

## Run from source

Install Node.js 22.12+ and pnpm 11. From the repository root:

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

Open <http://localhost:5187>. The UI can be explored without credentials. For live photo analysis, set `AI_API_KEY`, `AI_PROVIDER`, `AI_BASE_URL`, and a compatible vision model in the untracked `.env`. To enable accounts, create a Supabase project, run the migrations in `supabase/migrations` in filename order, then set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and a local `SESSION_SECRET` of at least 32 characters. Configure email and OAuth providers in Supabase itself if desired. No production credentials are included here.

For iOS device or simulator builds, use macOS with Xcode and follow [iOS handoff](IOS_APP_STORE_HANDOFF.md). For RevenueCat Test Store purchases, follow [purchase test setup](REVENUECAT_SETUP.md) and run `pnpm native:test:ios` before opening the Xcode project. This test mode does not charge a real payment. Android source and release instructions are in [Android handoff](ANDROID_PLAY_HANDOFF.md). A public App Store listing is not needed to review the Next Gen source-and-video entry.

## Verify

```sh
pnpm test
pnpm build
```

The repository includes automated tests for API validation, authentication, usage limits, AI response handling, and RevenueCat behavior. The app uses React, TypeScript, Capacitor, Node/Express, Supabase, and the RevenueCat Purchases SDK. The [MIT License](../LICENSE) covers the repository. Do not add private environment files, user data, or signing credentials to a public fork.
