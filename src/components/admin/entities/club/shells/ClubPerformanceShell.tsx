'use client';

import { type ReactNode } from 'react';
import { GlassCard } from '@/components/admin/ui/GlassCard';
import '@/components/admin/ui/crystalline.css';

interface PerformanceTab {
  id: string;
  label: string;
}

interface ClubPerformanceShellProps {
  breadcrumb: ReactNode;
  tabs: PerformanceTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  filterBar?: ReactNode;
  children: ReactNode;
}

export function ClubPerformanceShell({
  breadcrumb,
  tabs,
  activeTab,
  onTabChange,
  filterBar,
  children,
}: ClubPerformanceShellProps) {
  return (
    <div
      className="club-performance-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
        height: '100%',
      }}
    >
      <header
        style={{
          padding: '1.5rem 2.5rem 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>{breadcrumb}</div>
        {filterBar}
      </header>

      <nav
        style={{
          display: 'flex',
          gap: '0.25rem',
          padding: '1rem 2.5rem',
          borderBottom: '1px solid var(--crys-border)',
        }}
        aria-label="Vistas de rendimiento"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 2,
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: isActive ? 'var(--crys-accent-gradient)' : 'transparent',
                color: isActive ? 'white' : 'var(--crys-text-secondary)',
                transition: 'var(--crys-transition)',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem 2.5rem',
        }}
      >
        {children}
      </main>
    </div>
  );
}

export function PerformanceDashboardGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridTemplateRows: 'auto auto 1fr',
        gap: '1.5rem',
      }}
    >
      {children}
    </div>
  );
}

export function PerformanceKPIRow({ children }: { children: ReactNode }) {
  return (
    <div style={{ gridColumn: 'span 4', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
      {children}
    </div>
  );
}

export function PerformanceChartZone({ children }: { children: ReactNode }) {
  return (
    <GlassCard style={{ gridColumn: 'span 3', minHeight: 300 }} padding="md">
      {children}
    </GlassCard>
  );
}

export function PerformanceSideZone({ children }: { children: ReactNode }) {
  return (
    <GlassCard style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column' }} padding="md">
      {children}
    </GlassCard>
  );
}

export function PerformanceTableZone({ children }: { children: ReactNode }) {
  return (
    <GlassCard style={{ gridColumn: 'span 4' }} padding="md">
      {children}
    </GlassCard>
  );
}
