import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** Best-effort feedback; unsupported devices simply keep the visual response. */
export async function tapFeedback() {
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    } else {
      navigator.vibrate?.(12);
    }
  }
}
