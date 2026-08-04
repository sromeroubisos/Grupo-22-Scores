'use client';

import { createPortal } from 'react-dom';
import { ArchiveRestore, X } from 'lucide-react';
import { HistoricalSeasonImportWizard } from './HistoricalSeasonImportWizard';
import { useDialog } from './useDialog';
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
  // This drawer already handled Escape and locked body scroll; useDialog keeps
  // both, adds the html-level lock iOS needs, and supplies the focus trap and
  // focus restore it was missing.
  const { ref: drawerRef, dialogProps: drawerDialogProps } = useDialog<HTMLDivElement>({
    open,
    onClose,
    label: 'Importar torneo historico legado',
  });

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="pp-drawer-overlay historical-season-overlay"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        className="pp-drawer-panel pp-drawer-panel-wide historical-season-drawer"
        {...drawerDialogProps}
      >
        <div className="pp-drawer-header">
          <div className="pp-drawer-header-content">
            <div className="pp-drawer-header-left">
              <div className="pp-drawer-icon">
                <ArchiveRestore />
              </div>
              <div>
                <h2 className="pp-drawer-title">Importar torneo historico legado</h2>
                <p className="pp-drawer-subtitle">
                  Crea otro torneo vinculado a {seasonLabel || 'la temporada actual'}. Usar solo si necesitas conservar el modelo anterior.
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

        <div className="pp-drawer-body historical-season-drawer-body">
          <HistoricalSeasonImportWizard
            tournamentId={tournamentId}
            onBack={onClose}
            onComplete={() => {
              onClose();
            }}
            showStandaloneHeader={false}
            redirectTab="resumen"
            legacyMode
          />
        </div>
      </div>
    </>,
    document.body
  );
}
