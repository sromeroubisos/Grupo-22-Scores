'use client';

import { type ReactNode } from 'react';
import './crystalline.css';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  padding?: 'sm' | 'md' | 'lg';
}

export function GlassCard({ children, className = '', style, padding = 'md' }: GlassCardProps) {
  const paddingMap = {
    sm: '1rem',
    md: '1.5rem',
    lg: '2.5rem',
  };

  return (
    <div
      className={`crys-glass ${className}`}
      style={{
        padding: paddingMap[padding],
        borderRadius: 2,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
