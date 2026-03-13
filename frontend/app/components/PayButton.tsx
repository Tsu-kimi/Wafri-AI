'use client';

/**
 * app/components/PayButton.tsx
 *
 * Full-width "Pay Now" button using Paystack inline SDK.
 *
 * Triggered when checkoutUrl arrives (CHECKOUT_LINK event). Instead of
 * redirecting to the pre-generated URL, we call PaystackPop.newTransaction()
 * with the Paystack public key so the popup appears in-app without a page
 * leave — better UX on mobile browsers.
 *
 * @paystack/inline-js is loaded via dynamic import inside the click handler
 * so it never executes during Next.js server-side prerendering (the package
 * accesses `window` at module initialisation time, which would throw on the
 * server).
 *
 * Environment variable required (set in .env.local or Vercel):
 *   NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
 *
 * On success: shows a fullscreen payment-success overlay.
 */

import React, { useState } from 'react';
import { Wallet } from 'iconsax-react';


export interface PayButtonProps {
  /** Cart total in NGN — converted to kobo (×100) when calling Paystack. */
  cartTotal: number;
  /** Backend-issued Paystack reference from CHECKOUT_LINK event. */
  paymentReference: string;
  /** Optional callback when Paystack client reports immediate success. */
  onPaymentInitiated?: (reference: string) => void;
}

export function PayButton({ cartTotal, paymentReference, onPaymentInitiated }: PayButtonProps) {
  const [isLoading,   setIsLoading]   = useState(false);
  const paystackKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? '';

  const handlePay = async () => {
    if (!paystackKey) {
      console.warn(
        '[PayButton] NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY is not set. ' +
          'Add it to .env.local (or Vercel project settings) and rebuild.',
      );
      return;
    }

    if (!paymentReference) {
      console.warn('[PayButton] Missing payment reference from CHECKOUT_LINK event.');
      return;
    }

    setIsLoading(true);
    try {
      // Dynamic import prevents the Paystack bundle (which accesses `window`
      // at module-init time) from executing during SSR prerendering.
      // v2 exports a class — instantiate before calling newTransaction.
      const { default: PaystackPop } = await import('@paystack/inline-js');
      const popup = new PaystackPop();
      popup.newTransaction({
        key: paystackKey,
        // Demo email placeholder — Paystack requires an email field.
        email: 'farmer@wafrivet.com',
        amount: Math.round(cartTotal * 100), // NGN → kobo
        currency: 'NGN',
        ref: paymentReference,
        metadata: { source: 'wafrivet-field-vet', version: '1.0' },
        onSuccess: () => {
          setIsLoading(false);
          onPaymentInitiated?.(paymentReference);
        },
        onCancel: () => {
          // User dismissed popup without paying.
          setIsLoading(false);
        },
        onError: (err: { message: string }) => {
          console.error('[PayButton] Paystack error:', err.message);
          setIsLoading(false);
        },
      });
    } catch (err: unknown) {
      console.error('[PayButton] Failed to load Paystack:', err);
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* ── Pay Now button ─────────────────────────────────────────────── */}
      <button
        onClick={() => void handlePay()}
        disabled={isLoading}
        style={{
          width: '100%',
          background: isLoading
            ? 'color-mix(in srgb, var(--color-primary) 50%, transparent)'
            : 'var(--color-primary)',
          color: 'var(--color-white)',
          border: 'none',
          borderRadius: '18px',
          padding: '0 24px',
          fontSize: '18px',
          fontWeight: 800,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          minHeight: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          boxShadow: isLoading
            ? 'none'
            : '0 6px 28px color-mix(in srgb, var(--color-primary) 50%, transparent), 0 2px 8px rgba(0,0,0,0.3)',
          letterSpacing: '0.01em',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
          transition: 'background 0.2s ease, box-shadow 0.2s ease',
        }}
        aria-label={`Pay ₦${cartTotal.toLocaleString('en-NG')} now with Paystack`}
        aria-busy={isLoading}
      >
        <span aria-hidden style={{ display: 'flex', alignItems: 'center' }}>
          {isLoading ? '⏳' : <Wallet variant="Bold" size={24} color="var(--color-white)" />}
        </span>
        <span>
          {isLoading
            ? 'Opening payment…'
            : `Pay ₦${cartTotal.toLocaleString('en-NG')} Now`}
        </span>
      </button>
    </>
  );
}

