import {useEffect, useState} from 'react';
import {App as NativeApp} from '@capacitor/app';
import {getRevenueCatCustomerInfo, hasProEntitlement, listenForCustomerInfo, revenueCatIsNative} from './revenuecat';
import type {CustomerInfo} from '@revenuecat/purchases-capacitor';

/** Keep the profile in sync with native purchases, restores and foreground refreshes. */
export function useProSubscription(appUserId: string | null, signedIn: boolean, profileVisible: boolean) {
  const native = revenueCatIsNative();
  const ready = !signedIn || !!appUserId;
  const identity = signedIn ? appUserId : null;
  const [status, setStatus] = useState<{identity: string | null; pro: boolean | null} | null>(null);

  useEffect(() => {
    // Wait for authentication before configuring an anonymous SDK customer.
    if (!native || !ready) return;
    let active = true;
    let revision = 0;
    let stop: (() => void) | undefined;
    const update = (customerInfo: CustomerInfo | null) => {
      if (active) setStatus({identity, pro: hasProEntitlement(customerInfo)});
    };
    const refresh = async () => {
      const requestRevision = ++revision;
      try {
        const info = await getRevenueCatCustomerInfo(identity);
        if (active && requestRevision === revision) update(info);
      } catch {
        // Preserve a known entitlement during a transient network/store failure.
        if (active && requestRevision === revision) setStatus(current =>
          current?.identity === identity ? current : {identity, pro: null});
      }
    };
    void refresh().then(() => {
      if (active) stop = listenForCustomerInfo(info => {revision++; update(info);});
    });
    const onVisibility = () => {if (document.visibilityState === 'visible') void refresh();};
    document.addEventListener('visibilitychange', onVisibility);
    const appListener = NativeApp.addListener('appStateChange', ({isActive}) => {if (isActive) void refresh();});
    return () => {
      active = false;
      stop?.();
      document.removeEventListener('visibilitychange', onVisibility);
      void appListener.then(listener => listener.remove());
    };
  }, [native, ready, identity, profileVisible]);

  return {
    pro: native && ready && status?.identity === identity ? status.pro : null,
    checking: native && (!ready || status?.identity !== identity),
  };
}
