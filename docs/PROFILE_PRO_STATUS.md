# Profile subscription status — September 26, 2026

Profile previously used `/api/usage` alone, while the native subscription screen read RevenueCat CustomerInfo. This could display Free and a free-scan counter despite an active store entitlement.

Profile now recognizes either an active native `yoeo_pro` entitlement or a server Pro plan. Pro displays the Pro badge and no subtitle or scan-count line. Free users retain their scan count. The native initial check suppresses the temporary Free badge/count until account identity and entitlement loading complete.

Native status reads do not depend on product offerings. They are serialized with the existing purchase SDK identity queue, wait for authenticated account identity, listen for CustomerInfo purchase/restore changes, and refresh on Profile navigation and foregrounding. Stale reads cannot overwrite newer purchase events. Known entitlements survive transient read failures, and switching accounts/logging out cannot inherit the previous customer's status. No client-side status grants server scan access; backend authorization remains unchanged.

Verification: `pnpm build`, `pnpm test`, `scripts/profile-subscription-test.mjs` and `scripts/settings-resources-test.mjs`. Mobile UI checks mock the native SDK and all account APIs; no real purchase, restore, cancellation or deletion is performed. A physical iPhone and a rebuilt TestFlight bundle are still needed to verify the user's real store subscription.

Reference: [RevenueCat subscription status and CustomerInfo updates](https://www.revenuecat.com/docs/customers/customer-info).
