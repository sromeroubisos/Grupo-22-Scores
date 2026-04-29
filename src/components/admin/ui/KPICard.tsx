'use client';

import { GlassCard } from './GlassCard';
import './crystalline.css';

interface KPICardProps {
  label: string;
  value: string | number;
  delta?: string;
  deltaType?: 'positive' | 'negative' | 'neutral';
  className?: string;
}

export function KPICard({ label, value, delta, deltaType = 'neutral', className = '' }: KPICardProps) {
  const deltaColor =
    deltaType === 'positive'
      ? 'var(--crys-success)'
      : deltaType === 'negative'
        ? 'var(--crys-error)'
        : 'var(--crys-text-secondary)';

  return (
    <GlassCard className={className} padding="md">
      <span className="crys-kpi-label">{label}</span>
      <span className="crys-kpi-value" style={{ marginTop: 8, display: 'block' }}>
        {value}
        {delta ? (
          <small style={{ fontSize: '0.8rem', color: deltaColor, marginLeft: 8 }}>{delta}</small>
        ) : null}
      </span>
    </GlassCard>
  );
}
