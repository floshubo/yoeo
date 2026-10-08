import {useEffect, useState} from 'react';
import {App as NativeApp} from '@capacitor/app';
import {getRevenueCatCustomerInfo, hasProEntitlement, listenForCustomerInfo, revenueCatIsNative} from './revenuecat';
import type {CustomerInfo} from '@revenuecat/purchases-capacitor';

/** Keep the profile in sync with native purchases, restores and foreground refreshes. */
export function useProSubscription(profileVisible: boolean) {
  const native = revenueCatIsNative();
  const [status, setStatus] = useState<{pro: boolean | null} | null>(null);

  useEffect(() => {
    if (!native) return;
    let active = true;
    let revision = 0;
    let stop: (() => void) | undefined;
    const update = (customerInfo: CustomerInfo | null) => {
      if (active) setStatus({pro: hasProEntitlement(customerInfo)});
    };
    const refresh = async () => {
      const requestRevision = ++revision;
      try {
        const info = await getRevenueCatCustomerInfo();
        if (active && requestRevision === revision) update(info);
      } catch {
        // Preserve a known entitlement during a transient network/store failure.
        if (active && requestRevision === revision) setStatus(current => current || {pro: null});
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
  }, [native, profileVisible]);

  return {
    pro: native ? status?.pro ?? null : null,
    checking: native && status === null,
  };
}
