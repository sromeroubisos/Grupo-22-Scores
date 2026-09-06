'use client';

// El puntaje de la gente vive detras de un boton, no abajo de la tabla.
//
// La lista completa de un plantel doble es media pantalla de scroll: dejarla
// siempre abierta empujaba las estadisticas fuera de la vista. Se abre cuando
// alguien la pide y se cierra sola con Escape o tocando afuera.

import { useCallback, useEffect, useRef } from 'react';

import PeopleRatingsPanel, { usePeopleRatingsSummary, type RateablePlayer } from './PeopleRatingsPanel';

import styles from './PeopleRatingsDialog.module.css';

export default function PeopleRatingsDialog({
    open,
    onClose,
    matchId,
    players,
    homeName,
    awayName,
    canVote,
}: {
    open: boolean;
    onClose: () => void;
    matchId: string;
    players: RateablePlayer[];
    homeName: string;
    awayName: string;
    canVote: boolean;
}) {
    const closeRef = useRef<HTMLButtonElement | null>(null);
    // De donde vino el foco, para devolverlo al cerrar.
    const openerRef = useRef<HTMLElement | null>(null);

    // El dialogo esta montado (cerrado) desde que aparece la pestana, asi que
    // el resumen se pide aca y llega antes de que alguien lo abra. Al abrirlo
    // se refresca por detras, con lo que ya habia a la vista.
    const ratings = usePeopleRatingsSummary(matchId);
    const { refresh } = ratings;

    const handleClose = useCallback(() => {
        onClose();
    }, [onClose]);

    useEffect(() => {
        if (open) refresh();
    }, [open, refresh]);

    useEffect(() => {
        if (!open) return;

        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        closeRef.current?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                handleClose();
            }
        };
        document.addEventListener('keydown', onKeyDown);

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
            openerRef.current?.focus();
        };
    }, [open, handleClose]);

    if (!open) return null;

    return (
        <div
            className={styles.overlay}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) handleClose();
            }}
        >
            <div
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="people-ratings-title"
            >
                <div className={styles.topBar}>
                    <button
                        ref={closeRef}
                        type="button"
                        className={styles.close}
                        onClick={handleClose}
                        aria-label="Cerrar el puntaje de la gente"
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
                             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                    </button>
                </div>

                <div className={styles.body}>
                    <PeopleRatingsPanel
                        matchId={matchId}
                        players={players}
                        homeName={homeName}
                        awayName={awayName}
                        canVote={canVote}
                        ratings={ratings}
                    />
                </div>
            </div>
        </div>
    );
}
