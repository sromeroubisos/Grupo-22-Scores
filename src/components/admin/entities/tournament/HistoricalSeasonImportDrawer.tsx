'use client';

import { useEffect } from 'react';
import { ArchiveRestore, X } from 'lucide-react';
import { HistoricalSeasonImportWizard } from './HistoricalSeasonImportWizard';
import './drawer-premium.css';

type HistoricalSeasonImportDrawerProps = {
  open: boolean;
  tournamentId: string;
  seasonLabel?: string | null;
  onClose: () => void;
};

export function HistoricalSeasonImportDrawer({
  open,
  tournamentId,
  seasonLabel,
  onClose,
}: HistoricalSeasonImportDrawerProps) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="pp-drawer-overlay" onClick={onClose} />
      <div
        className="pp-drawer-panel pp-drawer-panel-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Importar temporada historica"
      >
        <div className="pp-drawer-header">
          <div className="pp-drawer-header-content">
            <div className="pp-drawer-header-left">
              <div className="pp-drawer-icon">
                <ArchiveRestore />
              </div>
              <div>
                <h2 className="pp-drawer-title">Agregar temporada antigua</h2>
                <p className="pp-drawer-subtitle">
                  Crea una edicion historica nueva con fixture, tabla final y campeon vinculada a la temporada {seasonLabel || 'actual'}.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="pp-drawer-close"
              onClick={onClose}
              aria-label="Cerrar importador historico"
            >
              <X />
            </button>
          </div>
        </div>

        <div className="pp-drawer-body">
          <HistoricalSeasonImportWizard
            tournamentId={tournamentId}
            onBack={onClose}
            onComplete={() => {
              onClose();
            }}
            showStandaloneHeader={false}
            redirectTab="resumen"
          />
        </div>
      </div>
    </>
  );
}
