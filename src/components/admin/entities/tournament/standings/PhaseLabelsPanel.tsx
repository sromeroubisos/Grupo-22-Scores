'use client';

import { LabelChip } from './LabelChip';
import styles from './TournamentStandingsTab.module.css';
import type { UiLabel } from './types';

export function PhaseLabelsPanel({
  labels,
  phaseName,
  onClose,
}: {
  labels: UiLabel[];
  phaseName: string;
  onClose: () => void;
}) {
  return (
    <div className={styles.labelsOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.labelsPanel}
        role="dialog"
        aria-modal="true"
        aria-label="Etiquetas de la fase"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.labelsPanelHeader}>
          <div className={styles.labelsPanelTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            Etiquetas de fase
          </div>
          <button type="button" className={styles.labelsPanelClose} onClick={onClose} aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.labelsList}>
          {labels.length === 0 ? (
            <p className={styles.labelsEmpty}>
              Esta fase no tiene etiquetas configuradas. Definilas desde la pestaña de estructura.
            </p>
          ) : (
            labels.map((label) => (
              <div key={label.id} className={styles.labelRow}>
                <LabelChip name={label.name} color={label.color} />
                <span className={styles.labelsEmpty}>{phaseName}</span>
              </div>
            ))
          )}
        </div>

        <div className={styles.labelsForm}>
          <h4 className={styles.labelsFormTitle}>Origen</h4>
          <p className={styles.labelsEmpty}>
            Las etiquetas visibles y asignables en la tabla responden a la configuración guardada en la fase activa.
            Si querés cambiarlas, hacelo desde la pestaña Estructura y después volvé a esta vista.
          </p>
        </div>
      </div>
    </div>
  );
}
