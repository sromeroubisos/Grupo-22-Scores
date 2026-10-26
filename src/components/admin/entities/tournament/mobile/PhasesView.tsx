'use client';

/**
 * Fases: la lista, y nada mas.
 *
 * Es la primera de las seis diferencias con challenge.place que anoto
 * `GESTOR_TORNEOS_FASES_REDISENO.md`: alla la pestana de fases es SOLO la
 * lista, y el alta es otra pantalla. Aca igual — el formulario vive en
 * `NewPhaseView` y esta pantalla no lo monta.
 */

import { ChevronRight, Layers, Plus } from 'lucide-react';
import {
    EmptyState,
    SkeletonList,
    matchCountOf,
    phaseMeta,
    phaseSubtitle,
    type MobilePhase,
} from './shared';

export function PhasesView({
    phases,
    loading,
    onOpenPhase,
    onNewPhase,
}: {
    phases: MobilePhase[];
    loading: boolean;
    onOpenPhase: (phaseId: string) => void;
    onNewPhase: () => void;
}) {
    if (loading) return <SkeletonList rows={3} height={78} />;

    if (phases.length === 0) {
        return (
            <EmptyState
                title="El torneo todavia no tiene fases"
                text="Una fase es una tabla o un cuadro de llaves. Sin al menos una, el torneo no puede tener partidos."
                action={
                    <button
                        type="button"
                        className="gtm-btn gtm-btn-primary"
                        style={{ marginTop: 6 }}
                        onClick={onNewPhase}
                    >
                        <Plus size={18} />
                        Agregar la primera fase
                    </button>
                }
            />
        );
    }

    return (
        <>
            <button type="button" className="gtm-btn gtm-btn-primary" onClick={onNewPhase}>
                <Plus size={18} />
                Agregar fase
            </button>

            {phases.map((phase) => {
                const matches = matchCountOf(phase);
                return (
                    <button
                        key={phase.id}
                        type="button"
                        className="gtm-row-card"
                        onClick={() => onOpenPhase(phase.id)}
                    >
                        <Layers size={20} className="gtm-chevron" />
                        <div className="gtm-row-body">
                            <div className="gtm-row" style={{ gap: 6 }}>
                                <span className="gtm-row-title gtm-grow">{phase.name}</span>
                                {phase.isActive ? (
                                    <span className="gtm-pill gtm-pill-live">En juego</span>
                                ) : null}
                            </div>
                            <div className="gtm-row-sub">{phaseSubtitle(phase)}</div>
                            <div className="gtm-row-meta">
                                {[phaseMeta(phase), matches === 0 ? 'sin calendario' : `${matches} partidos`]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </div>
                        </div>
                        <ChevronRight size={20} className="gtm-chevron" />
                    </button>
                );
            })}
        </>
    );
}
