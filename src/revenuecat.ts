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

let configured = false;
let identifiedUserId: string | null = null;
let identityQueue: Promise<unknown> = Promise.resolve();

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

export function configureRevenueCat(appUserId: string | null): Promise<RevenueCatSnapshot | null> {
  return withRevenueCatIdentity(appUserId, getRevenueCatSnapshot);
}

/** Entitlement reads must not depend on the store's product catalog being available. */
export function getRevenueCatCustomerInfo(appUserId: string | null): Promise<CustomerInfo | null> {
  return withRevenueCatIdentity(appUserId, async () => (await Purchases.getCustomerInfo()).customerInfo);
}

function withRevenueCatIdentity<T>(appUserId: string | null, read: () => Promise<T>): Promise<T | null> {
  // Account and subscription screens can mount together. Serialize SDK identity changes.
  const next = identityQueue.then(async () => await configureIdentity(appUserId) ? read() : null);
  identityQueue = next.catch(() => undefined);
  return next;
}

async function configureIdentity(appUserId: string | null): Promise<boolean> {
  if (!revenueCatIsNative()) return false;
  const key = apiKey();
  if (!key) throw new Error('RevenueCat is not configured for this mobile build.');

  if (!configured) {
    await Purchases.setLogLevel({ level: import.meta.env.DEV ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN });
    await Purchases.configure({
      apiKey: key,
      appUserID: appUserId || undefined,
      entitlementVerificationMode: ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
      shouldShowInAppMessagesAutomatically: true,
    });
    configured = true;
    identifiedUserId = appUserId;
  } else if (appUserId && appUserId !== identifiedUserId) {
    await Purchases.logIn({ appUserID: appUserId });
    identifiedUserId = appUserId;
  } else if (!appUserId && identifiedUserId) {
    await Purchases.logOut();
    identifiedUserId = null;
  }

  return true;
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
  const { customerInfo } = await Purchases.purchasePackage({ aPackage });
  return customerInfo;
}

export async function restoreRevenueCatPurchases() {
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
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
