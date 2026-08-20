'use client';

import { type ReactNode } from 'react';
import { StrataRail, type StrataStep } from '@/components/admin/ui/StrataRail';
import '@/components/admin/ui/crystalline.css';

interface ClubTrainingShellProps {
  breadcrumb: ReactNode;
  headerActions?: ReactNode;
  saveIndicator?: ReactNode;
  steps: StrataStep[];
  activeStep: string;
  onStepChange: (stepId: string) => void;
  children: ReactNode;
  contextPanel?: ReactNode;
}

export function ClubTrainingShell({
  breadcrumb,
  headerActions,
  saveIndicator,
  steps,
  activeStep,
  onStepChange,
  children,
  contextPanel,
}: ClubTrainingShellProps) {
  return (
    <div
      className="club-training-shell"
      style={{
        display: 'grid',
        gridTemplateColumns: contextPanel ? '200px 1fr 300px' : '200px 1fr',
        flex: 1,
        overflow: 'hidden',
        height: '100%',
      }}
    >
      <StrataRail steps={steps} activeStep={activeStep} onStepChange={onStepChange} />

      <section
        className="club-training-canvas"
        style={{
          background: 'var(--ca-surface-hover)',
          padding: '2.5rem',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            marginBottom: '2rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>{breadcrumb}</div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {saveIndicator}
            {headerActions}
          </div>
        </div>
        {children}
      </section>

      {contextPanel ? (
        <aside
          className="club-training-context"
          style={{
            borderLeft: '1px solid var(--crys-border)',
            padding: '2rem 1.5rem',
            background: 'var(--ca-surface)',
            overflowY: 'auto',
          }}
        >
          {contextPanel}
        </aside>
      ) : null}
    </div>
  );
}
