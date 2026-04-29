'use client';

import { type ReactNode } from 'react';
import './crystalline.css';

export interface StrataStep {
  id: string;
  label: string;
  stepNumber: string;
  status: 'completed' | 'active' | 'pending' | 'blocked';
}

interface StrataRailProps {
  steps: StrataStep[];
  activeStep: string;
  onStepChange: (stepId: string) => void;
}

export function StrataRail({ steps, activeStep, onStepChange }: StrataRailProps) {
  return (
    <nav
      className="strata-rail"
      style={{
        borderRight: '1px solid var(--crys-border)',
        padding: '2rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        width: 200,
        flexShrink: 0,
      }}
      aria-label="Pasos del flujo"
    >
      {steps.map((step) => {
        const isActive = activeStep === step.id;
        const isCompleted = step.status === 'completed';
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onStepChange(step.id)}
            disabled={step.status === 'blocked'}
            className={`strata-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            style={{
              position: 'relative',
              padding: '1.5rem 1rem',
              cursor: step.status === 'blocked' ? 'not-allowed' : 'pointer',
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              opacity: step.status === 'blocked' ? 0.4 : 1,
            }}
          >
            <span
              className="step-label"
              style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--crys-text-secondary)',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              {step.stepNumber}
            </span>
            <span
              className="step-title"
              style={{
                fontWeight: 600,
                fontSize: '0.95rem',
                color: isCompleted
                  ? 'var(--crys-success)'
                  : isActive
                    ? 'var(--crys-text-primary)'
                    : 'var(--crys-text-secondary)',
              }}
            >
              {step.label}
            </span>
            <span
              style={{
                content: "''",
                position: 'absolute',
                left: '-1px',
                top: 0,
                bottom: 0,
                width: 2,
                background: isActive
                  ? 'var(--crys-accent-gradient)'
                  : isCompleted
                    ? 'var(--crys-success)'
                    : 'var(--crys-step-inactive)',
                boxShadow: isActive ? '0 0 15px rgba(0, 106, 255, 0.5)' : undefined,
                transition: 'var(--crys-transition)',
              }}
            />
          </button>
        );
      })}
    </nav>
  );
}
