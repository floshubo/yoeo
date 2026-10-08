import { Capacitor } from '@capacitor/core';
import revenueCatConfig from '../server/revenuecat-config.json';
import {
  ENTITLEMENT_VERIFICATION_MODE,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  Purchases,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesPackage,
} from '@revenuecat/purchases-capacitor';
import {
  PAYWALL_RESULT,
  PaywallPresentationConfiguration,
  RevenueCatUI,
} from '@revenuecat/purchases-capacitor-ui';

export const PRO_ENTITLEMENT = revenueCatConfig.entitlementId;
export const YOEO_PRODUCTS = ['monthly', 'yearly', 'lifetime'] as const;

/** RevenueCat's device-generated customer ID. Only this format is ever sent as a purchase credential. */
const ANONYMOUS_ID = /^\$RCAnonymousID:[a-f0-9]{32}$/i;
const STORE_CUSTOMER_KEY = 'yoeo-store-customer';
const SESSION_KEY = 'yoeo-account-session';

let configured = false;
let identityQueue: Promise<unknown> = Promise.resolve();
/** This device's anonymous store customer. It keeps identifying the device's purchases after a YOEO account is linked. */
let purchaseId: string | null = null;
/** The optional YOEO account currently linked to the store customer in the SDK. */
let linkedAccount: string | null = null;

export type RevenueCatSnapshot = {
  customerInfo: CustomerInfo;
  offering: PurchasesOffering | null;
};

export function revenueCatIsNative() {
  return Capacitor.isNativePlatform();
}

function apiKey() {
  if (import.meta.env.MODE === 'revenuecat-test') return revenueCatConfig.testPublicApiKey;
  const platform = Capacitor.getPlatform();
  const testKey = import.meta.env.DEV ? import.meta.env.VITE_REVENUECAT_TEST_API_KEY : '';
  if (platform === 'ios') {
    return import.meta.env.VITE_REVENUECAT_IOS_API_KEY || testKey || revenueCatConfig.iosPublicApiKey;
  }
  if (platform === 'android') {
    return import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY || testKey;
  }
  return '';
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function rememberStoreCustomer(appUserID: string) {
  if (!ANONYMOUS_ID.test(appUserID)) return;
  purchaseId = appUserID;
  try {
    storage()?.setItem(STORE_CUSTOMER_KEY, appUserID);
  } catch {
    // The header is still sent for this launch.
  }
}

export function hasProEntitlement(customerInfo: CustomerInfo | null) {
  return Boolean(customerInfo?.entitlements.active[PRO_ENTITLEMENT]?.isActive);
}

export function purchaseWasCancelled(error: unknown) {
  return (error as Partial<PurchasesError> | null)?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
}

export function purchaseErrorMessage(error: unknown) {
  if (purchaseWasCancelled(error)) return '';
  const message = (error as Partial<PurchasesError> | null)?.message;
  return message || (error instanceof Error ? error.message : 'The purchase could not be completed.');
}

export function configureRevenueCat(): Promise<RevenueCatSnapshot | null> {
  return withRevenueCatIdentity(getRevenueCatSnapshot);
}

/** Entitlement reads must not depend on the store's product catalog being available. */
export function getRevenueCatCustomerInfo(): Promise<CustomerInfo | null> {
  return withRevenueCatIdentity(async () => (await Purchases.getCustomerInfo()).customerInfo);
}

function withRevenueCatIdentity<T>(read: () => Promise<T>): Promise<T | null> {
  // Identity changes and reads are serialized so a sign-in cannot interleave with a purchase.
  const next = identityQueue.then(async () => await configureIdentity() ? read() : null);
  identityQueue = next.catch(() => undefined);
  return next;
}

async function configureIdentity(): Promise<boolean> {
  if (!revenueCatIsNative()) return false;
  const key = apiKey();
  if (!key) throw new Error('RevenueCat is not configured for this mobile build.');

  if (!configured) {
    await Purchases.setLogLevel({ level: import.meta.env.DEV ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN });
    // Payment belongs to the App Store account on the device, so the SDK starts as an anonymous customer.
    await Purchases.configure({
      apiKey: key,
      entitlementVerificationMode: ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
      shouldShowInAppMessagesAutomatically: true,
    });
    const { appUserID } = await Purchases.getAppUserID();
    if (ANONYMOUS_ID.test(appUserID)) {
      rememberStoreCustomer(appUserID);
    } else if (storage()?.getItem(SESSION_KEY)) {
      // A YOEO account linked on an earlier launch stays linked while its session exists.
      linkedAccount = appUserID;
      const stored = storage()?.getItem(STORE_CUSTOMER_KEY);
      purchaseId = stored && ANONYMOUS_ID.test(stored) ? stored : null;
    } else {
      // No YOEO session: return to a store-only customer. Restore Purchases recovers the App Store receipt.
      await Purchases.logOut();
      rememberStoreCustomer((await Purchases.getAppUserID()).appUserID);
    }
    configured = true;
  }

  return true;
}

/**
 * Link the optional YOEO account to this device's store customer, or return to a store-only
 * customer after sign-out. Linking lets the subscription bought with the App Store account follow
 * the YOEO account to other devices and platforms; it never asks for payment again.
 */
export function setRevenueCatAccount(accountId: string | null): Promise<void | null> {
  return withRevenueCatIdentity(async () => {
    if (accountId === linkedAccount) return;
    if (accountId) {
      const before = (await Purchases.getCustomerInfo()).customerInfo;
      const { created, customerInfo } = await Purchases.logIn({ appUserID: accountId });
      linkedAccount = accountId;
      // An existing account may already have an anonymous alias, preventing a merge.
      // In that case sync this device's receipt if the newly linked account lacks Pro.
      if (!created && hasProEntitlement(before) && !hasProEntitlement(customerInfo)) {
        await Purchases.syncPurchases().catch(() => undefined);
      }
    } else {
      await Purchases.logOut();
      linkedAccount = null;
      rememberStoreCustomer((await Purchases.getAppUserID()).appUserID);
    }
  });
}

/** High-entropy guest purchase credential. Never log it or accept arbitrary account IDs. */
export async function purchaseHeaders(): Promise<Record<string, string>> {
  if (!revenueCatIsNative()) return {};
  try { await withRevenueCatIdentity(async () => undefined); } catch { /* Free scans remain available. */ }
  return purchaseId ? { 'X-YOEO-Purchase-ID': purchaseId } : {};
}

export async function getRevenueCatSnapshot(): Promise<RevenueCatSnapshot> {
  const [{ customerInfo }, offerings] = await Promise.all([
    Purchases.getCustomerInfo(),
    Purchases.getOfferings(),
  ]);
  return { customerInfo, offering: offerings.current };
}

export function listenForCustomerInfo(onUpdate: (customerInfo: CustomerInfo) => void) {
  const listener = (customerInfo: CustomerInfo) => onUpdate(customerInfo);
  const callbackId = Purchases.addCustomerInfoUpdateListener(listener).catch(() => null);
  return () => {
    void callbackId.then((listenerToRemove) => {
      if (listenerToRemove !== null) return Purchases.removeCustomerInfoUpdateListener({ listenerToRemove }).catch(() => undefined);
    });
  };
}

export async function purchaseRevenueCatPackage(aPackage: PurchasesPackage) {
  return withRevenueCatIdentity(async () => (await Purchases.purchasePackage({ aPackage })).customerInfo);
}

export async function restoreRevenueCatPurchases() {
  return withRevenueCatIdentity(async () => (await Purchases.restorePurchases()).customerInfo);
}

export async function presentRevenueCatPaywall(offering?: PurchasesOffering | null) {
  const { result } = await RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: PRO_ENTITLEMENT,
    offering: offering || undefined,
    displayCloseButton: true,
    presentationConfiguration: PaywallPresentationConfiguration.FULL_SCREEN,
  });
  return result;
}

export function paywallUnlockedPro(result: PAYWALL_RESULT) {
  return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
}

export async function presentRevenueCatCustomerCenter() {
  await RevenueCatUI.presentCustomerCenter();
}
