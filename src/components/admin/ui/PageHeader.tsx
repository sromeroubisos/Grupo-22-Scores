'use client';

import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface PageHeaderProps {
  kicker?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ kicker, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {kicker && (
          <span className="text-xs font-black uppercase tracking-[0.18em] text-[var(--ca-accent)]">
            {kicker}
          </span>
        )}
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--ca-text)] sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--ca-text-secondary)]">{description}</p>
        )}
      </div>
      {actions && <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-0">{actions}</div>}
    </header>
  );
}
