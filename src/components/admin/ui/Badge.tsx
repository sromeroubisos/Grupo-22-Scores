'use client';

import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'live';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'ca-badge ca-badge--default',
  success: 'ca-badge ca-badge--success',
  warning: 'ca-badge ca-badge--warning',
  danger: 'ca-badge ca-badge--danger',
  info: 'ca-badge ca-badge--info',
  live: 'ca-badge ca-badge--live',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', dot = false, children, ...props }, ref) => {
    return (
      <span ref={ref} className={cn(variantClasses[variant], className)} {...props}>
        {dot && (
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              variant === 'live' && 'animate-pulse'
            )}
            style={{
              backgroundColor: 'currentColor',
              boxShadow: variant === 'live' ? '0 0 8px currentColor' : undefined,
            }}
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
