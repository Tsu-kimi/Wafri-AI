'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowDown2, 
  Notification, 
  Global, 
  ShoppingCart, 
  Location,
  CloseSquare
} from 'iconsax-react';

interface ActionMenuProps {
  onShowNotifications: () => void;
  onResetLocation: () => void;
  onShowCart: () => void;
  hasNotifications: boolean;
}

export function ActionMenu({
  onShowNotifications,
  onResetLocation,
  onShowCart,
  hasNotifications,
}: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const toggleMenu = () => setIsOpen(!isOpen);

  const baseItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '44px',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    WebkitTapHighlightColor: 'transparent',
    background: 'none',
    border: 'none',
    padding: 0,
  };

  const triggerButtonStyle: React.CSSProperties = {
    ...baseItemStyle,
    borderRadius: '50%',
    background: 'color-mix(in srgb, var(--color-surface-2) 60%, transparent)',
    border: '1px solid var(--color-border)',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
      {/* Trigger Button */}
      <button
        onClick={toggleMenu}
        style={{
          ...triggerButtonStyle,
          background: hasNotifications && !isOpen 
            ? 'color-mix(in srgb, var(--color-error) 22%, transparent)' 
            : triggerButtonStyle.background,
          border: hasNotifications && !isOpen ? '1px solid var(--color-error)' : triggerButtonStyle.border,
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          zIndex: 100,
        }}
        aria-label="Toggle action menu"
        aria-expanded={isOpen}
      >
        <ArrowDown2 
          variant="Linear" 
          color={hasNotifications && !isOpen ? 'var(--color-error)' : 'var(--color-white)'} 
          size={24} 
        />
      </button>

      {/* Dropdown Items */}
      {isOpen && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Notification Icon */}
          <button
            onClick={() => {
              onShowNotifications();
              setIsOpen(false);
            }}
            style={{
              ...baseItemStyle,
              animation: 'menu-slide-down 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
              animationDelay: '0.05s',
            }}
            aria-label="View notifications"
          >
            <Notification 
              variant="Linear" 
              color="var(--color-white)" 
              size={24} 
            />
          </button>

          {/* Globe/Website Icon */}
          <a
            href="https://wafrivet.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...baseItemStyle,
              animation: 'menu-slide-down 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
              animationDelay: '0.1s',
            }}
            aria-label="Visit Wafrivet website"
          >
            <Global variant="Linear" color="var(--color-white)" size={24} />
          </a>

          {/* Cart Icon */}
          <button
            onClick={() => {
              onShowCart();
              setIsOpen(false);
            }}
            style={{
              ...baseItemStyle,
              animation: 'menu-slide-down 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
              animationDelay: '0.15s',
            }}
            aria-label="Go to cart"
          >
            <ShoppingCart variant="Linear" color="var(--color-white)" size={24} />
          </button>

          {/* Location Icon */}
          <button
            onClick={() => {
              onResetLocation();
              setIsOpen(false);
            }}
            style={{
              ...baseItemStyle,
              animation: 'menu-slide-down 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
              animationDelay: '0.2s',
            }}
            aria-label="Reset location"
          >
            <Location variant="Linear" color="var(--color-white)" size={24} />
          </button>
        </div>
      )}
    </div>
  );
}
