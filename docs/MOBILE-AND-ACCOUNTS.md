# Mobile and account setup

The production PWA includes selection motion, reduced-motion behavior, avatar uploads, profile editing, an offline shell and camera capture. Capacitor 8 and its iOS, Android, Camera, Browser, App, Haptics, Preferences and Status Bar packages are installed. The app uses native haptics and the native camera plugin when it runs inside Capacitor. Provider credentials, physical-device checks, signing and store review remain outstanding.

## Phone installation

Deploy the Node server and built frontend together behind HTTPS. A Dockerfile is provided, but has not been built. Set APP_URL to the exact public origin (e.g. your HTTPS domain, with no path). Keep the same origin for frontend and API so HttpOnly session cookies work. The localhost preview cannot be opened from a different phone as localhost.

On iPhone: Safari → Share → Add to Home Screen → Open as Web App. On Android: browser menu → Install app / Add to Home Screen, or the install action in Profile. YOEO also shows a platform-specific installation sheet. Safe-area padding, standalone layout, portrait preference, separate regular/maskable icon declarations, theme/background colors, offline shell and touch-sized controls are configured. Zoom remains available. Animations honor reduced-motion settings.

Camera uses the rear camera through getUserMedia; the new Device camera action uses a native capture file input. The photo library remains separate. JPEG/PNG/WebP are accepted; HEIC requires conversion. Physical iOS/Android device checks are still required.

On Windows development machines where Node networking cannot reach the configured AI provider but Windows itself can, set `AI_WINDOWS_HTTP=true`. This uses the Windows HTTP stack for server-side provider requests; API keys remain on the server and are passed to the child transport through standard input. Leave it false in ordinary deployments.

## Supabase accounts

1. Create/select your Supabase project; apply all SQL files in `supabase/migrations` in order in a development project first. They provide person profiles, self-service deletion and Pro entitlements.
2. Copy the account fields from `.env.example` to `.env`. Use the project URL and publishable key for sign-in, profile access, and authenticated Pro checks. Set SESSION_SECRET to a randomly generated value of at least 32 characters; it signs the anonymous scan counter and account session cookies.
3. In Supabase Authentication → URL Configuration, set the Site URL to `https://yoeo.onrender.com`. Add `https://yoeo.onrender.com/api/auth/callback`, `https://yoeo.onrender.com/?account=1&oauth=1`, and `https://yoeo.onrender.com/api/auth/native-callback` to Redirect URLs. Keep localhost entries only in a development project. Set both `APP_URL` and `API_PUBLIC_URL` to `https://yoeo.onrender.com` in Render.
4. Complete the Google instructions below, test the flow, and only then set `AUTH_GOOGLE_ENABLED=true` in Render.
5. Complete the Apple instructions below, test the flow, and only then set `AUTH_APPLE_ENABLED=true` in Render.

OAuth uses PKCE. Render serves the web app and API from one origin, so web sessions use Secure, HttpOnly, SameSite=Lax cookies. In native builds, the system browser returns only the authorization code through `app.yoeo.mobile://auth/callback`; the app exchanges it with the PKCE verifier. Native builds still store the encrypted session in WebView local storage; move it into Keychain/Keystore before store submission. Supabase validates the underlying session before cloud requests. Row-level security and owner filters protect profiles without an admin key.

The account screen uses Supabase email/password authentication. In Supabase Authentication → Providers → Email, enable Email and decide whether **Confirm email** is required. With confirmation enabled, a new user confirms the message and then signs in with the password they chose. Signup only asks for email and password; the local profile name remains separate.

## Google sign-in setup

1. Open Google Cloud Console → Google Auth Platform and configure the consent screen with the YOEO name, support email, homepage and privacy-policy URL.
2. Create an OAuth client with type **Web application**.
3. Add `https://yoeo.onrender.com` under Authorized JavaScript origins.
4. Add `https://xeufaenbsjkxjxhucdir.supabase.co/auth/v1/callback` under Authorized redirect URIs. Google redirects to Supabase first; do not put the YOEO callback in this Google field.
5. In Supabase Authentication → Providers → Google, enable Google and paste the client ID and client secret.
6. In Render, set `AUTH_GOOGLE_ENABLED=true` and redeploy. The disabled Google button becomes active automatically.
7. Test new-account login, repeat login, logout, cancelled consent and login on a second device before launch.

The native app now opens the Supabase Google OAuth page in the system browser and receives the result through the registered app URL scheme. The same Web application OAuth client handles that hosted web flow. Keep its client secret in Supabase. A future direct native ID-token flow would require separate iOS and Android OAuth clients for the final bundle ID/package name and signing fingerprints.

## Apple sign-in setup

1. Join the Apple Developer Program and settle the final bundle ID. Register an App ID for that bundle and enable **Sign in with Apple**.
2. Register a Services ID for web authentication, for example `app.yoeo.web`, and associate it with the primary App ID.
3. Configure the Services ID website domain as `xeufaenbsjkxjxhucdir.supabase.co` and its return URL as `https://xeufaenbsjkxjxhucdir.supabase.co/auth/v1/callback`.
4. Create a Sign in with Apple key, download its `.p8` file once, and record the Key ID and Team ID. Keep the key outside this repository.
5. Generate the Apple OAuth client secret and enter the Services ID/client ID plus secret in Supabase Authentication → Providers → Apple.
6. In Render, set `AUTH_APPLE_ENABLED=true` and redeploy. The disabled Apple button becomes active automatically.
7. Test the native iOS callback on a physical device. The current flow uses Apple's web OAuth through the system browser, including in the native app. Apple does not return the user's full name through this flow; the person profile collects a name separately.

Apple’s web OAuth secret expires and must be regenerated at least every six months. Schedule rotation before enabling the provider in production.

Reset password requires a signed-in session. Enable Supabase password security and reauthentication policies for production. Email is displayed from the authenticated account; changing login email is not implemented. Settings is the single page for profile editing, account controls, export and data deletion. App Settings has no language selector; the public website's selector is unchanged. Deletion requires a confirmation dialog. The app shows deletion progress, confirms completion, and restarts onboarding only after the user continues. For signed-in users it deletes the Supabase account and cascading database rows before clearing all app storage; local-only users clear all app storage. Native deletion UI still needs platform validation.

## Account email with Resend

Email/password signup is implemented in the app. In Supabase, new-user signup, the Email provider, and **Confirm email** are enabled. The remaining production step is outbound email delivery.

Use Resend through Supabase Custom SMTP for confirmation and recovery email:

1. Add and verify a dedicated sending subdomain such as `auth.yoeo.app` in Resend. Add the DKIM, SPF and other verification records Resend provides to Cloudflare DNS.
2. Create a Resend API key restricted to sending email.
3. In Supabase **Authentication → Emails → SMTP Settings**, enable Custom SMTP and set host `smtp.resend.com`, port `465`, username `resend`, password to the Resend API key, sender email `no-reply@auth.yoeo.app`, and sender name `YOEO`.
4. Keep email confirmation enabled. Customize the Confirm signup and Reset password templates, then send a test to a non-team address.
5. Disable Resend click/open tracking for authentication mail so confirmation links are not rewritten. Review the current Resend free-plan limits before launch.

The SMTP password belongs only in Supabase, never in this repository or a `VITE_` variable. Supabase's default mail service is limited to project team addresses and is unsuitable for public signup.

## Profiles and the future family version

`auth.users` identifies an account. `person_profiles` identifies a person and stores name, allergen preferences and a small JPEG avatar. One account can own several profiles. Avatars default to a generic icon and uploaded photos are center-cropped to 256×256 before storage. Photos remain private inside the RLS-protected row.

The account identifies subscription access and scan usage. Profiles and saved reports remain local to the device. Shared households, invitations, guardian roles, concurrent editing/conflict resolution and billing are future work.

## App Store / Play Store path

`capacitor.config.json` and the Capacitor 8 dependencies prepare a bundled-web-assets wrapper. The example app ID `app.yoeo.mobile` must be confirmed or replaced before generating either platform because changing it later is disruptive.

After the final app ID is chosen:

```sh
pnpm native:doctor
pnpm native:add:ios
pnpm native:add:android
pnpm native:sync
```

Open the native projects with `pnpm native:open:ios` on macOS/Xcode or `pnpm native:open:android` with Android Studio. Run `pnpm native:sync` after every web build that should be copied into the native projects.

Before producing native binaries:

- Add a native API origin and OAuth deep-link callback before generating release builds. Do not use Capacitor `server.url` as the production app.
- Store native credentials in Keychain/Keystore, add camera/photo permission descriptions, and wire native camera output to the existing review pipeline.
- Add universal/app links and associated domains, privacy disclosures, store signing and physical-device tests. Account deletion already exists in Edit Profile but must be validated in each binary.
- Complete App Store/Play policy review and accessibility review; no submission or acceptance is claimed.

Before submission, YOEO still needs a public privacy-policy URL, support URL, final company/developer contact, App Store screenshots, store descriptions, age/content ratings, data-safety answers, iOS privacy manifest review, Android target-SDK verification, production payment handling and review credentials or a complete demo mode. Google login on iOS makes Sign in with Apple necessary under Apple’s review rules. Any paid digital Pro plan sold in the native app must use the applicable store purchase system unless a current policy exception applies.

## References

- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase Apple setup](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Resend pricing](https://resend.com/pricing)
- [Capacitor](https://capacitorjs.com/docs)
- [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Mobile capture input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)
