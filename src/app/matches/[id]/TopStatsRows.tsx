'use client';

import React from 'react';
import styles from './page.module.css';
import { ladoGanador, menosEsMejor } from '@/lib/statBetterSide';

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

/** `null` cuando no hay dato: nadie gana una metrica que nadie midio. */
export type LadoDeFila = { texto: string; valor: number | null };

type FilaProps = {
    metricKey?: string;
    label: string;
    tooltip?: string;
    home: LadoDeFila;
    away: LadoDeFila;
};

export function TopStatRow({ metricKey, label, tooltip, home, away }: FilaProps) {
    const gana = ladoGanador(home.valor, away.valor, metricKey, label);

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
export function TopStatSplit({ metricKey, label, home, away }: {
    metricKey?: string;
    label: string;
    home: number;
    away: number;
}) {
    const total = home + away;

    // La barra no sabe de "mejor": pinta al local en acento lleno y al visitante
    // en tinta, asi que el que tiene MAS se lleva la franja brillante. Sobre
    // "Perdidas", "Turnovers" o "Exclusiones de 2 min" eso condecora al peor.
    // Esas cabeceras van como fila normal, donde la chapa si premia al que tiene
    // menos. Medido: 3 de las 162 filas de los seis deportes caian aca.
    if (menosEsMejor(metricKey, label)) {
        return (
            <TopStatRow
                metricKey={metricKey}
                label={label}
                home={{ texto: String(home), valor: home }}
                away={{ texto: String(away), valor: away }}
            />
        );
    }

    // Sin nada anotado no hay reparto que mostrar: media barra de cada lado
    // afirmaria un empate que no ocurrio. La fila normal ya dice 0 y 0, y como
    // empatan tampoco reparte chapa.
    if (total <= 0) {
        return (
            <TopStatRow
                metricKey={metricKey}
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
