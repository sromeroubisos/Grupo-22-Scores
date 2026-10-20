'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import TeamLogo from '@/components/TeamLogo';
import styles from './TournamentPlayerSheet.module.css';

/**
 * La ficha rápida de un jugador dentro de las estadísticas del torneo.
 *
 * Tocar un nombre en el ranking abre esto en vez de mandar a otra pantalla: se
 * ve lo que el jugador hizo EN ESTE TORNEO sin perder el lugar en la lista, y de
 * ahí sale el camino al perfil completo (`/players/[id]`). Es la misma idea que
 * `PlayerMatchSheet` de la ficha de partido —hoja que sube en mobile, diálogo
 * centrado en pantalla grande— pero con los números de la temporada.
 *
 * No calcula nada: recibe las cifras ya formateadas de la tabla de donde se
 * tocó, así que lo que dice la ficha es exactamente lo que dice la fila.
 */

export type PlayerSheetStat = {
    label: string;
    /** Rótulo largo, para el lector de pantalla y el tooltip. */
    title?: string;
    value: string;
    tone?: 'attack' | 'defense' | 'danger';
    /** La métrica por la que está ordenada la lista: va destacada. */
    accent?: boolean;
};

export type TournamentPlayerSheetSubject = {
    name: string;
    teamName: string;
    teamId?: string | null;
    logoUrl?: string | null;
    /** Sin id no hay perfil al que mandar: el botón se reemplaza por un aviso. */
    playerId?: string | null;
    /** "3.º en Tries", ya armado por quien abre. */
    rankLabel?: string | null;
    stats: PlayerSheetStat[];
};

type Props = {
    subject: TournamentPlayerSheetSubject | null;
    onClose: () => void;
};

const toneClass: Record<NonNullable<PlayerSheetStat['tone']>, string> = {
    attack: styles.toneAttack,
    defense: styles.toneDefense,
    danger: styles.toneDanger,
};

/** Lo que tarda la hoja en irse: el mismo camino de entrada, al revés. */
const EXIT_MS = 200;
/** Igual que el scroll: hacia dónde llegaría el gesto si siguiera deslizando. */
const projectDistance = (velocityPxPerSec: number, rate = 0.998) =>
    ((velocityPxPerSec / 1000) * rate) / (1 - rate);

export default function TournamentPlayerSheet({ subject, onClose }: Props) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const open = subject !== null;
    const [closing, setClosing] = useState(false);
    const drag = useRef<{ startY: number; samples: Array<{ y: number; t: number }> } | null>(null);

    // Cerrar no es desaparecer: la hoja sale por donde entró y recién ahí se
    // desmonta. Si no, el cierre rompe la continuidad espacial de la apertura.
    const requestClose = useCallback(() => {
        const panel = panelRef.current;
        if (!panel) { onClose(); return; }
        setClosing(true);
        window.setTimeout(() => { setClosing(false); onClose(); }, EXIT_MS);
    }, [onClose]);

    const onGrabStart = (event: React.PointerEvent<HTMLElement>) => {
        // Sólo en la hoja inferior (mobile): en el diálogo centrado no se arrastra.
        if (window.matchMedia('(min-width: 640px)').matches) return;
        // Un botón dentro de la cabecera (cerrar) conserva su clic.
        if ((event.target as HTMLElement).closest('button, a')) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startY: event.clientY, samples: [{ y: event.clientY, t: performance.now() }] };
        if (panelRef.current) panelRef.current.style.transition = 'none';
    };

    const onGrabMove = (event: React.PointerEvent<HTMLElement>) => {
        const state = drag.current;
        const panel = panelRef.current;
        if (!state || !panel) return;
        const dy = event.clientY - state.startY;
        state.samples = [...state.samples.slice(-4), { y: event.clientY, t: performance.now() }];
        // 1:1 hacia abajo; hacia arriba resiste: no hay nada más que mostrar.
        const shown = dy >= 0 ? dy : (dy * 0.55 * 300) / (300 + 0.55 * Math.abs(dy));
        panel.style.transform = `translateY(${shown}px)`;
    };

    const onGrabEnd = (event: React.PointerEvent<HTMLElement>) => {
        const state = drag.current;
        const panel = panelRef.current;
        drag.current = null;
        if (!state || !panel) return;
        const first = state.samples[0];
        const last = state.samples[state.samples.length - 1];
        const dt = Math.max(last.t - first.t, 1);
        const velocity = ((last.y - first.y) / dt) * 1000; // px/s, con signo
        const projected = Math.max(event.clientY - state.startY, 0) + projectDistance(velocity) * 0.3;
        if (projected > panel.offsetHeight * 0.4) {
            // Sigue con la velocidad del dedo: sin costura entre arrastrar y animar.
            panel.style.transition = `transform ${EXIT_MS}ms cubic-bezier(0.25, 1, 0.5, 1)`;
            panel.style.transform = 'translateY(100%)';
            window.setTimeout(onClose, EXIT_MS);
        } else {
            panel.style.transition = 'transform 320ms cubic-bezier(0.34, 1.4, 0.64, 1)';
            panel.style.transform = 'translateY(0)';
        }
    };

    useEffect(() => {
        if (!open) return;
        const previouslyFocused = document.activeElement as HTMLElement | null;
        panelRef.current?.focus();

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') requestClose();
        };
        document.addEventListener('keydown', onKey);

        // El fondo no se mueve mientras la hoja está abierta.
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = previousOverflow;
            // Devuelve el foco al nombre que se tocó: sin esto, con teclado, el
            // usuario queda de nuevo al principio de la página.
            previouslyFocused?.focus?.();
        };
    }, [open, requestClose]);

    if (!subject) return null;

    const titleId = 'tournament-player-sheet-title';

    return (
        <div
            className={`${styles.overlay} ${closing ? styles.overlayClosing : ''}`}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) requestClose();
            }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className={`${styles.sheet} ${closing ? styles.sheetClosing : ''}`}
            >
                {/* El agarre: se ve y se puede tirar de él (o de la cabecera). */}
                <div
                    className={styles.grabber}
                    onPointerDown={onGrabStart}
                    onPointerMove={onGrabMove}
                    onPointerUp={onGrabEnd}
                    onPointerCancel={onGrabEnd}
                    aria-hidden="true"
                >
                    <span />
                </div>
                <header
                    className={styles.header}
                    onPointerDown={onGrabStart}
                    onPointerMove={onGrabMove}
                    onPointerUp={onGrabEnd}
                    onPointerCancel={onGrabEnd}
                >
                    <TeamLogo
                        name={subject.teamName}
                        logoUrl={subject.logoUrl ?? undefined}
                        teamId={subject.teamId ?? undefined}
                        size={44}
                        className={styles.crest}
                    />
                    <div className={styles.identity}>
                        <h3 id={titleId} className={styles.name}>{subject.name}</h3>
                        <p className={styles.team}>{subject.teamName}</p>
                        {subject.rankLabel && <span className={styles.rank}>{subject.rankLabel}</span>}
                    </div>
                    <button type="button" className={styles.close} onClick={requestClose} aria-label="Cerrar ficha">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                            <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                    </button>
                </header>

                <div className={styles.body}>
                    <p className={styles.sectionLabel}>En este torneo</p>
                    <dl className={styles.stats}>
                        {subject.stats.map((stat) => (
                            <div
                                key={stat.label}
                                className={`${styles.stat} ${stat.accent ? styles.statAccent : ''}`}
                                title={stat.title}
                            >
                                <dt>{stat.label}</dt>
                                <dd className={stat.tone ? toneClass[stat.tone] : undefined}>{stat.value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>

                <footer className={styles.footer}>
                    {subject.playerId ? (
                        <Link href={`/players/${encodeURIComponent(subject.playerId)}`} className={styles.profileLink}>
                            Ver perfil completo
                            <span aria-hidden="true"> →</span>
                        </Link>
                    ) : (
                        <p className={styles.noProfile}>
                            Este jugador todavía no tiene un perfil vinculado.
                        </p>
                    )}
                </footer>
            </div>
        </div>
    );
}
