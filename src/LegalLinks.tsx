import { useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Modal, Button } from './components';

export async function openExternal(url: string) {
  if (Capacitor.isNativePlatform()) await Browser.open({ url });
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export function LegalLinks() {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [error, setError] = useState('');
  const policy = import.meta.env.VITE_PRIVACY_POLICY_URL;
  const support = import.meta.env.VITE_SUPPORT_URL;
  function open(url: string) { void openExternal(url).catch(() => setError('Could not open this link. Please try again.')); }
  return <>
    <p className="legal-links">
      <button type="button" className="text-button" onClick={() => policy ? open(policy) : setShowPrivacy(true)}>Privacy policy</button>
      {' · '}<button type="button" className="text-button" onClick={() => open('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}>Terms of use</button>
      {support && <>{' · '}<button type="button" className="text-button" onClick={() => open(support)}>Support</button></>}
    </p>
    {error && <p role="alert">{error}</p>}
    {showPrivacy && <Modal label="Your privacy" onClose={() => setShowPrivacy(false)}>
      <h2>Your privacy</h2>
      <p>Your profile and saved reports stay on this device. Signing in connects your subscription and scan allowance to your account.</p>
      <p>Analyzing sends your selected photos, menu text and allergen preferences to our server and its configured AI provider. Do not include personal information in photos or menu text. Purchases are processed by your app store and RevenueCat.</p>
      <p>Export or delete your data in Settings. If you are signed in, deleting data also permanently deletes your account and its associated database data. It does not cancel a store subscription.</p>
      <p>This preview has no published operator privacy policy yet. A release must identify the operator, AI provider, retention periods and privacy contact.</p>
      <Button onClick={() => setShowPrivacy(false)}>Close</Button>
    </Modal>}
  </>;
}
