'use client';

import { useMemo, useState } from 'react';

import {
    etiquetaDeEstadistica,
    etiquetaDeGrupo,
    etiquetaDePeriodo,
} from '@/lib/tennis/labels';
import type { TennisStatGroup, TennisStatRow } from '@/lib/services/tennis';

import styles from './page.module.css';

/**
 * La planilla del partido, con el rail de sets arriba.
 *
 * El rail es el mismo elemento que la ficha de los otros deportes usa para sus
 * pestañas, pero acá no lleva secciones: lleva SETS. En tenis la pregunta que
 * se hace el que mira no es "¿qué otra cosa hay?" sino "¿qué pasó en el primer
 * set?" — el proveedor manda la planilla ya cortada por período y el rail es el
 * lugar natural para elegirlo.
 */

interface Props {
    statistics: TennisStatGroup[];
    homeName: string;
    awayName: string;
}

/**
 * El reparto de la barra.
 *
 * Con total (23/53 contra 35/67) van los porcentajes de cada lado, que es la
 * comparación real; sin total, los valores crudos repartidos sobre la suma.
 * Sin nada, la pista queda vacía: una barra al 50/50 dibuja un empate que nadie
 * jugó.
 */
function reparto(row: TennisStatRow): { home: number; away: number } {
    const { homeValue, awayValue, homeTotal, awayTotal } = row;
    if (homeValue == null || awayValue == null) return { home: 0, away: 0 };

    if (homeTotal && awayTotal) {
        return { home: (homeValue / homeTotal) * 100, away: (awayValue / awayTotal) * 100 };
    }

    const suma = homeValue + awayValue;
    if (suma <= 0) return { home: 0, away: 0 };
    return { home: (homeValue / suma) * 100, away: (awayValue / suma) * 100 };
}

/** Una fila 0-0 no dice nada: el globo que nadie tiró no es una estadística. */
function tieneContenido(row: TennisStatRow): boolean {
    if (row.homeValue === 0 && row.awayValue === 0 && !row.homeTotal && !row.awayTotal) return false;
    return Boolean(row.home || row.away);
}

/**
 * Quién va mejor en esa fila.
 *
 * `compareCode` NO dice quién va mejor: dice quién tiene el número más alto
 * —medido en el payload, "Dobles faltas 3 contra 5" viene con código 2, o sea
 * el que hizo MÁS—. Sirve igual, porque compara sobre la base correcta: cuando
 * la fila tiene total usa el porcentaje y no el crudo (con 16/23 contra 23/35
 * marca al local, que va 70% a 66%). Lo único que hay que agregarle es dar
 * vuelta las filas negativas, donde ganar es tener menos.
 */
function lider(row: TennisStatRow): 'home' | 'away' | null {
    if (row.compareCode !== 1 && row.compareCode !== 2) return null;
    const masAlto = row.compareCode === 1 ? 'home' : 'away';
    if (row.statisticsType !== 'negative') return masAlto;
    return masAlto === 'home' ? 'away' : 'home';
}

function Fila({ row }: { row: TennisStatRow }) {
    const { home, away } = reparto(row);
    const mejor = lider(row);

    return (
        <div className={styles.statItem}>
            <div className={styles.statRow}>
                <span className={`${styles.statVal} ${mejor === 'home' ? styles.statValLeads : ''}`}>{row.home}</span>
                <span className={styles.statLabel}>{etiquetaDeEstadistica(row.name)}</span>
                <span className={`${styles.statVal} ${mejor === 'away' ? styles.statValLeads : ''}`}>{row.away}</span>
            </div>
            {/* El COLOR de la barra es de cada lado y no cambia nunca: si saltara
                al que va mejor, la referencia de arriba estaría mintiendo en la
                mitad de las filas. Quién va mejor se lee en el número, que es el
                único lugar donde se puede decir sin ambigüedad —en una fila de
                errores la barra más larga es la peor, no la mejor—. */}
            <div className={styles.statTrack} aria-hidden="true">
                <span className={styles.statTrackSide}>
                    <span
                        className={`${styles.statBar} ${styles.statBarHome}`}
                        style={{ width: `${Math.min(100, home)}%` }}
                    />
                </span>
                <span className={styles.statTrackSide}>
                    <span
                        className={`${styles.statBar} ${styles.statBarAway}`}
                        style={{ width: `${Math.min(100, away)}%` }}
                    />
                </span>
            </div>
        </div>
    );
}

export default function TennisStatsPanel({ statistics, homeName, awayName }: Props) {
    const periodos = useMemo(
        () => statistics.filter((bloque) => (bloque.groups ?? []).length > 0),
        [statistics],
    );
    const [periodo, setPeriodo] = useState(() => periodos[0]?.period ?? 'ALL');

    if (periodos.length === 0) return null;

    const activo = periodos.find((p) => p.period === periodo) ?? periodos[0];
    const grupos = (activo.groups ?? [])
        .map((grupo) => ({
            ...grupo,
            statisticsItems: (grupo.statisticsItems ?? []).filter(tieneContenido),
        }))
        .filter((grupo) => grupo.statisticsItems.length > 0);

    return (
        <section className={styles.statsSection} aria-labelledby="tenis-stats-title">
            <div className={styles.statsHead}>
                <h2 id="tenis-stats-title" className={styles.sectionTitle}>Estadísticas</h2>
                <p className={styles.statsLegend}>
                    <span className={styles.legendHome} aria-hidden="true" />
                    <span>{homeName}</span>
                    <span className={styles.legendSep} aria-hidden="true" />
                    <span className={styles.legendAway} aria-hidden="true" />
                    <span>{awayName}</span>
                </p>
            </div>

            {periodos.length > 1 ? (
                <div className={styles.rail} role="tablist" aria-label="Período de la planilla">
                    {periodos.map((bloque) => {
                        const seleccionado = bloque.period === activo.period;
                        return (
                            <button
                                key={bloque.period}
                                type="button"
                                role="tab"
                                aria-selected={seleccionado}
                                className={`${styles.railItem} ${seleccionado ? styles.railItemActive : ''}`}
                                onClick={() => setPeriodo(bloque.period)}
                            >
                                {etiquetaDePeriodo(bloque.period)}
                            </button>
                        );
                    })}
                </div>
            ) : null}

            <div className={styles.statGrid}>
                {grupos.map((grupo) => (
                    <div key={grupo.groupName} className={styles.statGroup}>
                        <h3 className={styles.statGroupName}>{etiquetaDeGrupo(grupo.groupName)}</h3>
                        {grupo.statisticsItems.map((row) => (
                            <Fila key={`${grupo.groupName}-${row.name}`} row={row} />
                        ))}
                    </div>
                ))}
            </div>
        </section>
    );
}
