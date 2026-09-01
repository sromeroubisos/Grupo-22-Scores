'use client';

import React from 'react';
import styles from './page.module.css';

/**
 * Las estadisticas del partido al estilo FotMob: el valor de cada equipo en los
 * extremos, la etiqueta en el medio y una chapa llena marcando quien gano la
 * metrica. Sin barras dobles.
 *
 * Las barras dobles que habia antes gastaban dos tercios del ancho de la fila en
 * dibujar una proporcion que el par de numeros ya decia. Al sacarlas entran
 * catorce metricas donde entraban ocho, y la comparacion —que es para lo que
 * existe la pantalla— queda en los numeros, que es donde el ojo va primero.
 *
 * La proporcion no se pierde: la fila `accent` de cada seccion (Puntos, Goles)
 * se dibuja como barra partida, igual que la posesion en FotMob.
 */

/**
 * Metricas donde gana el que tiene MENOS.
 *
 * La chapa marca al mejor, no al mas grande. Sin esta lista la pantalla
 * felicitaria al equipo con mas tarjetas rojas.
 *
 * Va por clave y no por etiqueta a proposito: la etiqueta cambia de deporte en
 * deporte ("Amarillas", "Yellow cards") y de proveedor en proveedor, la clave
 * la fija `matchStatsFromEvents.ts`.
 */
const MENOS_ES_MEJOR = new Set([
    'yellowCards', 'redCards', 'blueCards', 'greenCards', 'twoMinSuspensions',
    'penaltiesCommitted', 'penaltyYards', 'fouls', 'injuries',
    'knockOns', 'forwardPasses', 'handlingErrors',
    'turnovers', 'turnoversLost', 'turnoversBadPass', 'turnoversOffensiveFoul',
    'turnoversOnDowns', 'turnoversPassivePlay', 'turnoversTechnicalFault',
    'fumbles', 'fumblesLost', 'interceptionsThrown', 'sacksTaken',
    'ownGoals', 'linesLost', 'rucksLost', 'maulsLost', 'scrumsLost',
    'shotsMissed', 'shotsOffTarget', 'conversionsMissed', 'dropGoalsMissed',
    'penaltyGoalsMissed', 'shootoutMissed',
]);

/**
 * Etiquetas de las metricas que llegan sin clave (planilla del proveedor).
 *
 * Es un respaldo, no la via principal: el proveedor manda `label` y nada mas,
 * asi que para esas filas la unica sena disponible es el texto. Se compara en
 * minusculas y sin acentos.
 */
const MENOS_ES_MEJOR_TEXTO = [
    'amarilla', 'roja', 'tarjeta', 'card', 'falta', 'foul',
    'perdida', 'error', 'penal cometido', 'offside', 'fuera de juego',
];

const sinAcentos = (texto: string) =>
    texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function menosEsMejor(metricKey: string | undefined, label: string) {
    if (metricKey) return MENOS_ES_MEJOR.has(metricKey);
    const plano = sinAcentos(label);
    return MENOS_ES_MEJOR_TEXTO.some((aguja) => plano.includes(aguja));
}

/** `null` cuando no hay dato: nadie gana una metrica que nadie midio. */
export type LadoDeFila = { texto: string; valor: number | null };

type FilaProps = {
    metricKey?: string;
    label: string;
    tooltip?: string;
    home: LadoDeFila;
    away: LadoDeFila;
};

/**
 * Quien se lleva la chapa. Empate y falta de dato no la dan a nadie: una chapa
 * en un 0-0 diria que alguien gano algo que no paso.
 */
function ganador(home: LadoDeFila, away: LadoDeFila, invertido: boolean): 'home' | 'away' | null {
    if (home.valor === null || away.valor === null) return null;
    if (home.valor === away.valor) return null;
    const local = invertido ? home.valor < away.valor : home.valor > away.valor;
    return local ? 'home' : 'away';
}

export function TopStatRow({ metricKey, label, tooltip, home, away }: FilaProps) {
    const invertido = menosEsMejor(metricKey, label);
    const gana = ganador(home, away, invertido);

    return (
        <div className={styles.topStatRow}>
            <span
                className={`${styles.topStatValue} ${styles.topStatValueHome} ${gana === 'home' ? styles.topStatValueWin : ''}`}
            >
                {home.texto}
            </span>
            <span className={styles.topStatLabel} title={tooltip}>{label}</span>
            <span
                className={`${styles.topStatValue} ${styles.topStatValueAway} ${gana === 'away' ? styles.topStatValueWin : ''}`}
            >
                {away.texto}
            </span>
        </div>
    );
}

/**
 * La metrica cabecera de la seccion como barra partida, igual que la posesion
 * de FotMob: los dos numeros en los extremos y el reparto en el ancho.
 *
 * Solo tiene sentido con conteos, donde `home / (home + away)` es una parte de
 * un total real. Un porcentaje no es una parte de nada —dos equipos pueden
 * tener 93% de pases acertados cada uno— y por eso las filas de porcentaje
 * siguen el camino normal aunque vengan marcadas como cabecera.
 */
export function TopStatSplit({ label, home, away }: { label: string; home: number; away: number }) {
    const total = home + away;

    // Sin nada anotado no hay reparto que mostrar: media barra de cada lado
    // afirmaria un empate que no ocurrio. La fila normal ya dice 0 y 0, y como
    // empatan tampoco reparte chapa.
    if (total <= 0) {
        return (
            <TopStatRow
                label={label}
                home={{ texto: String(home), valor: home }}
                away={{ texto: String(away), valor: away }}
            />
        );
    }

    const pctHome = (home / total) * 100;

    return (
        <div className={styles.topStatSplitBlock}>
            <span className={styles.topStatSplitLabel}>{label}</span>
            <div
                className={styles.topStatSplitTrack}
                role="img"
                aria-label={`${label}: ${home} el local, ${away} el visitante`}
            >
                <span className={styles.topStatSplitHome} style={{ width: `${pctHome}%` }}>
                    <b>{home}</b>
                </span>
                <span className={styles.topStatSplitAway} style={{ width: `${100 - pctHome}%` }}>
                    <b>{away}</b>
                </span>
            </div>
        </div>
    );
}
