'use client';

/**
 * app/components/PhoneEntryOverlay.tsx
 *
 * Step 1 of the phone + PIN flow.
 *
 * Shown immediately when a PIN_REQUIRED event arrives.  The AI agent
 * has already detected the phone number from conversation and sent it as
 * `phone_number` in the event.  This overlay:
 *
 *   1. Pre-fills the number so the farmer can verify it at a glance.
 *   2. Lets the farmer edit the number manually if it is wrong.
 *   3. Shows the Nigerian country-code prefix (+234) separately so the
 *      farmer only needs to type/confirm the local digits.
 *   4. "Next" proceeds to the PinOverlay (step 2) with the confirmed number.
 *   5. This component does NOT call any backend endpoint — it is purely a
 *      confirmation / correction step before PIN setup/verify.
 *
 * Props:
 *   phoneNumber   — E.164 number supplied by the AI (e.g. "+2348012345678").
 *                   The "+234" prefix is stripped for display.
 *   isReturning   — true → farmer has an existing PIN (verify mode).
 *                   false → new farmer (setup mode).
 *   onConfirm     — called with the final E.164 number when farmer taps Next.
 *   onBack        — called when farmer taps Back (dismiss overlay entirely).
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

const COUNTRY_CODE = '+234';
const FLAG = '🇳🇬';

/** Strip the +234 prefix if present and return the local digits. */
function toLocalDigits(e164: string): string {
  if (e164.startsWith(COUNTRY_CODE)) {
    return e164.slice(COUNTRY_CODE.length);
  }
  // If already without prefix, return as-is
  return e164.replace(/^\+?0*/, '');
}

/** Convert local digits back to E.164. */
function toE164(local: string): string {
  const digits = local.replace(/\D/g, '');
  return `${COUNTRY_CODE}${digits}`;
}

/** Returns true when local digits look like a valid Nigerian number (7–10 digits). */
function isValidLocal(local: string): boolean {
  const d = local.replace(/\D/g, '');
  return d.length >= 7 && d.length <= 10;
}

interface PhoneEntryOverlayProps {
  phoneNumber: string;
  isReturning: boolean;
  onConfirm: (e164Phone: string) => void;
  onBack: () => void;
}

export function PhoneEntryOverlay({
  phoneNumber,
  isReturning,
  onConfirm,
  onBack,
}: PhoneEntryOverlayProps) {
  const [localDigits, setLocalDigits] = useState<string>(toLocalDigits(phoneNumber));
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input after mount so the farmer can immediately correct it.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
    setLocalDigits(raw);
  }, []);

  const handleNext = useCallback(() => {
    if (!isValidLocal(localDigits)) return;
    onConfirm(toE164(localDigits));
  }, [localDigits, onConfirm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleNext();
      if (e.key === 'Escape') onBack();
    },
    [handleNext, onBack],
  );

  const valid = isValidLocal(localDigits);

  const title = isReturning
    ? 'Confirm your phone number'
    : 'Confirm your phone number';

  const subtitle = isReturning
    ? 'This is the number Fatima heard. Tap Next to enter your PIN.'
    : 'This is the number Fatima heard. Tap Next to create your PIN.';

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '22rem',
          margin: '0 1rem',
          background: '#111827',
          borderRadius: '1.25rem',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          color: '#fff',
          animation: 'slide-up 0.3s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Phone icon */}
        <div
          style={{
            width: '4rem',
            height: '4rem',
            borderRadius: '50%',
            background: 'rgba(34,197,94,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1rem',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            style={{ width: '2rem', height: '2rem', fill: '#4ade80' }}
            aria-hidden="true"
          >
            <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.47 11.47 0 0 0 3.59.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z" />
          </svg>
        </div>

        <h2
          style={{
            fontSize: '1.2rem',
            fontWeight: 800,
            marginBottom: '0.25rem',
            textAlign: 'center',
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: '0.82rem',
            color: '#9ca3af',
            textAlign: 'center',
            marginBottom: '1.5rem',
          }}
        >
          {subtitle}
        </p>

        {/* Phone input row */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            gap: '0.5rem',
            marginBottom: '1.25rem',
          }}
        >
          {/* Country code badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '0.75rem',
              padding: '0 0.75rem',
              fontSize: '1rem',
              fontWeight: 700,
              color: '#e5e7eb',
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            <span aria-label="Nigerian flag">{FLAG}</span>
            <span>{COUNTRY_CODE}</span>
          </div>

          {/* Local digits input */}
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            autoCorrect="off"
            spellCheck={false}
            placeholder="8012345678"
            value={localDigits}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            aria-label="Phone number local digits"
            style={{
              flex: 1,
              background: '#1f2937',
              border: `1px solid ${valid ? '#4ade80' : '#374151'}`,
              borderRadius: '0.75rem',
              padding: '0.75rem 1rem',
              fontSize: '1.1rem',
              fontWeight: 700,
              color: '#fff',
              outline: 'none',
              letterSpacing: '0.05em',
              transition: 'border-color 0.2s',
            }}
          />
        </div>

        {/* Helper text */}
        {!valid && localDigits.length > 0 && (
          <p
            role="alert"
            style={{
              fontSize: '0.75rem',
              color: '#f87171',
              marginBottom: '1rem',
              alignSelf: 'flex-start',
            }}
          >
            Please enter 7–10 digits (without country code)
          </p>
        )}

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            gap: '0.75rem',
            marginTop: valid && localDigits.length > 0 ? 0 : '0.25rem',
          }}
        >
          {/* Back */}
          <button
            type="button"
            onClick={onBack}
            style={{
              flex: 1,
              padding: '0.85rem',
              borderRadius: '0.85rem',
              border: '1px solid #374151',
              background: 'transparent',
              color: '#9ca3af',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = '#1f2937';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            Back
          </button>

          {/* Next */}
          <button
            type="button"
            onClick={handleNext}
            disabled={!valid}
            style={{
              flex: 2,
              padding: '0.85rem',
              borderRadius: '0.85rem',
              border: 'none',
              background: valid ? '#16a34a' : '#374151',
              color: valid ? '#fff' : '#6b7280',
              fontSize: '0.95rem',
              fontWeight: 800,
              cursor: valid ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => {
              if (!valid) return;
              (e.currentTarget as HTMLButtonElement).style.background = '#15803d';
            }}
            onMouseLeave={e => {
              if (!valid) return;
              (e.currentTarget as HTMLButtonElement).style.background = '#16a34a';
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
