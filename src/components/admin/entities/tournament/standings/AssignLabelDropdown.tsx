'use client';

import { useEffect, useRef, useState } from 'react';
import { LabelChip } from './LabelChip';
import type { UiLabel } from './types';
import styles from './TournamentStandingsTab.module.css';

interface Props {
  allLabels: UiLabel[];
  assignedLabelIds: Set<string>;
  onAssign: (labelId: string) => Promise<void>;
  onUnassign: (labelId: string) => Promise<void>;
  onClose: () => void;
}

export function AssignLabelDropdown({ allLabels, assignedLabelIds, onAssign, onUnassign, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function toggle(labelId: string) {
    if (busy) return;
    setBusy(labelId);
    try {
      if (assignedLabelIds.has(labelId)) {
        await onUnassign(labelId);
      } else {
        await onAssign(labelId);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={ref} className={styles.assignDropdown} role="menu" aria-label="Asignar etiquetas">
      {allLabels.length === 0 ? (
        <p className={styles.assignDropdownEmpty}>No hay etiquetas. Creá una desde "Etiquetas".</p>
      ) : (
        allLabels.map((label) => {
          const assigned = assignedLabelIds.has(label.id);
          const loading = busy === label.id;
          return (
            <button
              key={label.id}
              type="button"
              role="menuitem"
              className={`${styles.assignDropdownItem} ${assigned ? styles.assignDropdownItemActive : ''}`}
              onClick={() => toggle(label.id)}
              disabled={loading}
            >
              <LabelChip name={label.name} color={label.color} />
              <span className={styles.assignDropdownCheck}>
                {loading ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.spinnerIcon}>
                    <path d="M12 2a10 10 0 0110 10"/>
                  </svg>
                ) : assigned ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : null}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
