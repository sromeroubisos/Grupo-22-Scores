'use client';

import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Button } from './Button';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface EmptyStateProps {
  kicker?: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: {
    label: string;
    onClick?: () => void;
    href?: string;
    variant?: 'primary' | 'secondary' | 'ghost';
  }[];
  className?: string;
}

export function EmptyState({
  kicker,
  title,
  description,
  icon,
  actions,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('ca-empty-state', className)}>
      <div className="ca-empty-state__card ca-card">
        {icon && (
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--ca-surface-elevated)] text-[var(--ca-accent)]">
            {icon}
          </div>
        )}
        {kicker && <p className="ca-empty-state__kicker">{kicker}</p>}
        <h1 className="ca-empty-state__title">{title}</h1>
        {description && <p className="ca-empty-state__text">{description}</p>}
        {actions && actions.length > 0 && (
          <div className="ca-empty-state__actions">
            {actions.map((action, index) =>
              action.href ? (
                <a
                  key={index}
                  href={action.href}
                  className={`ca-btn ${index === 0 ? 'ca-btn--primary' : 'ca-btn--secondary'}`}
                >
                  {action.label}
                </a>
              ) : (
                <Button
                  key={index}
                  variant={action.variant || (index === 0 ? 'primary' : 'secondary')}
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
