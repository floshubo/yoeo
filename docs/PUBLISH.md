# Publish a private-key-safe test version

Recommended starting setup: one Render Free web service for the Node API and built PWA, plus Supabase Free for sign-in, profiles and Pro entitlements. Render provides an HTTPS `onrender.com` address; buying a domain is optional. A Render account, Supabase account and a private GitHub repository are required.

## Setup

1. Create a Supabase project. Apply all three SQL migrations in `supabase/migrations` in filename order. Save its project URL, anon key and service-role key in your password manager.
2. Configure email authentication and a verified sending domain with a transactional email provider, or enable Google OAuth for your testers. Default Supabase email delivery is restricted; see `MOBILE-AND-ACCOUNTS.md`. Keep email confirmation enabled.
3. Push this project to a private GitHub repository. `.gitignore` excludes `.env`, and `.dockerignore` excludes every `.env` file from the image. Never add secrets to the repository, frontend variables, or Docker build arguments.
4. Create a Render Blueprint using `render.yaml`. Choose Free. Enter the AI key, Supabase URL, and Supabase publishable key in its private environment settings. Render generates `SESSION_SECRET`. Set `APP_URL` to the exact public HTTPS origin used by the app, with no trailing slash. If the first start waits for the correct URL, update it and redeploy.
5. In Supabase set the Site URL to the same `APP_URL` and allow `APP_URL/?account=1&oauth=1` for the web OAuth return. If using the native app, set `API_PUBLIC_URL` to the Render API origin and allow `API_PUBLIC_URL/api/auth/native-callback`. Enable the provider flags in Render only after configuring Google/Apple credentials.
6. Open the HTTPS link, sign in, and check a real scan. Verify a free account is blocked after three successful scans, including after signing out, changing profiles, or using another device. Check mobile camera and Add to Home Screen on actual phones.

## Limit and Pro access

`NODE_ENV=production` gives each browser three successful analysis requests before sign-in. One request can include several photos. Failed provider calls do not consume a scan. The count is carried in a server-signed token stored by the PWA (and an HTTP-only cookie when served directly), so client code cannot forge a lower count. After the allowance is used, the user must sign in and have an active Pro entitlement. Clearing browser data can reset a device allowance, so add server-side abuse controls before a large public launch.

Local `pnpm start` serves a production build for preview but stays unlimited unless `NODE_ENV=production` is set. Live production refuses startup without the required account and AI settings. IP rate limits still protect the anonymous AI endpoint.

Pro checks use the signed-in user's Supabase access token. The security-definer RPC verifies that `auth.uid()` matches the requested account, while the entitlement table remains inaccessible to browser clients. Pro is currently administrator-managed in `scan_accounts`: set `plan='pro'` and optionally `pro_until` for a verified account using the Supabase SQL editor. Do not grant users write access to this table. Payments and subscription webhooks are not implemented; the Upgrade button shows the subscription page and honestly states that payment checkout is coming soon. A payment provider must verify payment server-side before granting Pro.

## Free-tier limits and costs

- Render Free sleeps after 15 minutes without traffic, has an ephemeral filesystem and bounded monthly usage. The first visitor may wait for startup. Quotas survive because they live in Supabase. See https://render.com/docs/free.
- Supabase Free includes a 500 MB database and can pause after low activity for seven days. See https://supabase.com/pricing and https://supabase.com/docs/guides/platform/free-project-pausing.
- Hosting credits do not cover AI API charges. Set a provider spending limit before sharing broadly. The initial allowance is device-cookie based and is intended for a limited demo rather than strong fraud prevention.
- Former `now.sh` links became `vercel.app`: https://vercel.com/changelog/urls-are-becoming-consistent. Vercel Hobby is restricted to personal non-commercial use: https://vercel.com/docs/plans/hobby.

No cloud accounts, sending domain, paid plan or public deployment were created. Docker/Supabase deployment needs verification after account setup; local tests validate the application quota flow with an isolated test store.
