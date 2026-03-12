'use client';

/**
 * app/page.tsx — Root page.
 *
 * Auth gate: redirects unauthenticated users to /login.
 * Shows the Onboarding carousel only on the first visit after login.
 * Once onboarding is complete, goes straight to the FieldVetSession.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WebSocketProvider } from './components/WebSocketProvider';
import { FieldVetSession } from './components/FieldVetSession';
import { Onboarding } from './components/Onboarding';

const ONBOARDED_KEY = 'wafrivet_onboarded';
const FARMER_KEY    = 'wafrivet_farmer';

export default function Home() {
  const router = useRouter();
  // null = unknown (SSR / before hydration)
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    // Guard: require login before allowing access.
    const farmer = localStorage.getItem(FARMER_KEY);
    if (!farmer) {
      router.replace('/login');
      return;
    }
    const alreadyOnboarded = localStorage.getItem(ONBOARDED_KEY) === '1';
    setShowOnboarding(!alreadyOnboarded);
  }, [router]);

  const handleComplete = () => {
    localStorage.setItem(ONBOARDED_KEY, '1');
    setShowOnboarding(false);
  };

  // Hold rendering until localStorage has been checked.
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
