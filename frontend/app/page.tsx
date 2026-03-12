'use client';

/**
 * app/page.tsx — Root page.
 *
 * Shows the Onboarding carousel only on a new device (first visit).
 * Once the user completes onboarding, a flag is persisted to localStorage
 * so subsequent loads skip straight to FieldVetSession.
 */

import React, { useState, useEffect } from 'react';
import { WebSocketProvider } from './components/WebSocketProvider';
import { FieldVetSession } from './components/FieldVetSession';
import { Onboarding } from './components/Onboarding';

const ONBOARDED_KEY = 'wafrivet_onboarded';

export default function Home() {
  // null = unknown (SSR / before hydration), true = show, false = skip
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    const alreadyOnboarded = localStorage.getItem(ONBOARDED_KEY) === '1';
    setShowOnboarding(!alreadyOnboarded);
  }, []);

  const handleComplete = () => {
    localStorage.setItem(ONBOARDED_KEY, '1');
    setShowOnboarding(false);
  };

  // Hold rendering until localStorage has been read to avoid a flash.
  if (showOnboarding === null) return null;

  if (showOnboarding) {
    return <Onboarding onComplete={handleComplete} />;
  }

  return (
    <WebSocketProvider>
      <FieldVetSession />
    </WebSocketProvider>
  );
}
