'use client';

import React from 'react';
import TeamLogo from '@/components/TeamLogo';
import styles from './page.module.css';

/**
 * El podio de cada metrica arriba de la tabla, al estilo "Top stats" de FotMob.
 *
 * La tabla de abajo tiene catorce columnas y contesta cualquier pregunta, pero
 * obliga a barrer con el ojo para contestar la unica que casi todos traen:
 * quien va primero. Estas tarjetas la contestan sin scrollear, y la tabla queda
 * para el que quiere comparar.
 *
 * No reemplaza a la tabla ni duplica su logica: las filas que recibe son
 * exactamente las que la tabla ya calculo.
 *
 * El escudo sale de `entityLogo` en las DOS clases de fila: en la de equipo es
 * el del club, en la de jugador es el del club por el que anoto. `teamLogo` no
 * existe en la fila —pedirlo dejaba iniciales en vez de escudo.
 */

export type TarjetaDeTop = {
    /** id de la columna en la fila; tambien es la clave de orden de la tabla. */
    metric: string;
    title: string;
    /** `true` cuando gana el que tiene menos (puntos en contra, tarjetas). */
    lowerIsBetter?: boolean;
    decimals?: number;
    suffix?: string;
    /** La diferencia de puntos sin signo miente: +19 y -19 se dibujan igual. */
    signed?: boolean;
};

const n = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

function formatValor(raw: unknown, card: TarjetaDeTop) {
    const valor = n(raw);
    const texto = valor.toLocaleString('es-AR', {
        minimumFractionDigits: card.decimals ?? 0,
        maximumFractionDigits: card.decimals ?? 0,
    });
    const signo = card.signed && valor > 0 ? '+' : '';
    return `${signo}${texto}${card.suffix ?? ''}`;
}

type Props = {
    rows: any[];
    cards: TarjetaDeTop[];
    /** Metricas que la competicion no publica: su tarjeta no se dibuja. */
    unmeasured: Set<string>;
    /** Las filas de jugador muestran el club abajo del nombre. */
    kind: 'teams' | 'players';
    /** Ordena la tabla de abajo por esa metrica. */
    onPick: (metric: string, direction: 'asc' | 'desc') => void;
};

export default function TournamentTopStats({ rows, cards, unmeasured, kind, onPick }: Props) {
    const visibles = cards
        .filter((card) => !unmeasured.has(card.metric))
        .map((card) => {
            const podio = [...rows]
                .sort((a, b) => {
                    const delta = n(a[card.metric]) - n(b[card.metric]);
                    // Desempate estable por nombre: sin esto, dos equipos con los
                    // mismos puntos se turnan el podio entre renders.
                    if (delta !== 0) return card.lowerIsBetter ? delta : -delta;
                    return String(a.entityName ?? '').localeCompare(String(b.entityName ?? ''), 'es');
                })
                .slice(0, 3);
            return { card, podio };
        })
        // Un podio de tres ceros no es un podio: es la metrica avisando que en
        // esta competicion todavia no paso nada. La tabla ya lo dice con guiones.
        .filter(({ card, podio }) => podio.length > 0 && (card.lowerIsBetter || n(podio[0][card.metric]) !== 0));

    if (visibles.length === 0) return null;

    return (
        <section className={styles.topStatsSection} aria-label="Lo más destacado">
            <h3 className={styles.topStatsHeading}>Lo más destacado</h3>
            <div className={styles.topStatsGrid}>
                {visibles.map(({ card, podio }) => (
                    <article key={card.metric} className={styles.topStatsCard}>
                        <button
                            type="button"
                            className={styles.topStatsCardHead}
                            onClick={() => onPick(card.metric, card.lowerIsBetter ? 'asc' : 'desc')}
                            title={`Ordenar la tabla por ${card.title}`}
                        >
                            <span className={styles.topStatsCardTitle}>{card.title}</span>
                            <span className={styles.topStatsCardChevron} aria-hidden="true">›</span>
                        </button>

                        <ol className={styles.topStatsList}>
                            {podio.map((row, idx) => (
                                <li key={String(row.entityId)} className={styles.topStatsItem}>
                                    <span className={styles.topStatsRank}>{idx + 1}</span>
                                    <TeamLogo
                                        name={String(kind === 'players' ? (row.secondary ?? '') : (row.entityName ?? ''))}
                                        logoUrl={row.entityLogo}
                                        teamId={kind === 'players' ? row.teamId : row.entityId}
                                        size={24}
                                        className={styles.topStatsCrest}
                                    />
                                    <span className={styles.topStatsIdentity}>
                                        <span className={styles.topStatsName}>{row.entityName}</span>
                                        {kind === 'players' && row.secondary && (
                                            <span className={styles.topStatsTeam}>{row.secondary}</span>
                                        )}
                                    </span>
                                    <span
                                        className={`${styles.topStatsValue} ${idx === 0 ? styles.topStatsValueLead : ''}`}
                                    >
                                        {formatValor(row[card.metric], card)}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </article>
                ))}
            </div>
        </section>
    );
}
