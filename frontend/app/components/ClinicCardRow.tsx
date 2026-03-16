'use client';

/**
 * app/components/ClinicCardRow.tsx
 *
 * Horizontal scroll strip that renders veterinary clinic cards when
 * the CLINICS_FOUND WebSocket event arrives.
 *
 * - Each ClinicCard shows the clinic name, address, open/closed pill,
 *   a phone tap-to-call link, and a Google Maps navigation button.
 * - Animates in with a CSS translateY slide-up transition.
 * - Scroll snaps for native feel on Android Chrome.
 *
 * Design is deliberately low-contrast-on-dark (consistent with CameraView
 * background) and touch-friendly (min 48 px tap targets everywhere).
 */

import React, { useState, useEffect, useRef } from 'react';
import type { Clinic } from '@/app/types/events';

export interface ClinicCardRowProps {
  clinics: Clinic[];
}

// ── Individual clinic card ────────────────────────────────────────────────────

interface ClinicCardProps {
  clinic: Clinic;
}

function ClinicCard({ clinic }: ClinicCardProps) {
  const isOpen = clinic.openNow === true;
  const isClosed = clinic.openNow === false;
  const openNowLabel = isOpen ? 'OPEN NOW' : isClosed ? 'CLOSED' : 'HOURS N/A';

  return (
    <article
      style={{
        flex: '0 0 280px',
        width: '280px',
        minWidth: '280px',
        borderRadius: '16px',
        overflow: 'hidden',
        background: 'var(--color-bg)',
        border: `2px solid var(--color-border)`,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        boxShadow:
          '0 2px 8px rgba(0,0,0,0.3)',
        cursor: 'default',
        scrollSnapAlign: 'start',
      }}
    >
      <div
        style={{
          padding: '12px 12px 10px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          background: 'var(--color-surface)',
        }}
      >
        {/* Status pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              background: isOpen
                ? 'color-mix(in srgb, var(--color-primary) 85%, transparent)'
                : isClosed
                  ? 'rgba(248,81,73,0.9)'
                  : 'color-mix(in srgb, var(--color-border) 80%, transparent)',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              padding: '2px 8px',
              borderRadius: '20px',
              whiteSpace: 'nowrap',
            }}
            aria-label={`Clinic status: ${openNowLabel}`}
          >
            {openNowLabel}
          </span>
        </div>

        {/* Name */}
        <p
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--color-text)',
            lineHeight: 1.35,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {clinic.name}
        </p>

        {/* Address */}
        {clinic.address && (
          <p
            style={{
              fontSize: '12px',
              color: 'var(--color-text-muted)',
              margin: 0,
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {clinic.address}
          </p>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
          {clinic.phone && (
            <a
              href={`tel:${clinic.phone}`}
              aria-label={`Call ${clinic.name}`}
              style={{
                flex: 1,
                background:
                  'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                color: 'var(--color-primary)',
                border:
                  '1.5px solid color-mix(in srgb, var(--color-primary) 35%, transparent)',
                borderRadius: '10px',
                padding: '8px 4px',
                fontSize: '12px',
                fontWeight: 700,
                textAlign: 'center',
                textDecoration: 'none',
                minHeight: '36px',
                lineHeight: '20px',
              }}
            >
              Call
            </a>
          )}

          {clinic.googleMapsUri && (
            <a
              href={clinic.googleMapsUri}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Navigate to ${clinic.name} in Google Maps`}
              style={{
                flex: 1,
                background: 'var(--color-primary)',
                color: 'var(--color-white)',
                border: '1.5px solid transparent',
                borderRadius: '10px',
                padding: '8px 4px',
                fontSize: '12px',
                fontWeight: 700,
                textAlign: 'center',
                textDecoration: 'none',
                minHeight: '36px',
                lineHeight: '20px',
              }}
            >
              Open in Maps
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────────

export function ClinicCardRow({ clinics }: ClinicCardRowProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Trigger slide-up animation on first render with content.
  const triggeredRef = useRef(false);
  useEffect(() => {
    if (clinics.length > 0 && !triggeredRef.current) {
      triggeredRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
    }
  }, [clinics.length]);

  if (clinics.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Nearby veterinary clinics"
      style={{
        animation: 'slide-up 0.42s cubic-bezier(0.34, 1.38, 0.64, 1)',
        transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <p
        style={{
          fontSize: '12px',
          fontWeight: 700,
          fontFamily: 'var(--font-fraunces)',
          color: 'var(--color-text)',
          textTransform: 'uppercase',
          letterSpacing: '0.09em',
          padding: '0 16px 8px',
          margin: 0,
        }}
      >
        Nearby vet clinics ({clinics.length})
      </p>

      <div
        className="hide-scrollbar"
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '10px',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          padding: '0 16px 12px',
        }}
      >
        {clinics.map((clinic, i) => (
          <div key={`${clinic.name}-${i}`} role="listitem">
            <ClinicCard clinic={clinic} />
          </div>
        ))}
      </div>
    </div>
  );
}
