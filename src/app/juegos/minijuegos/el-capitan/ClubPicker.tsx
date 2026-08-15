'use client';

import { useId, useMemo, useState } from 'react';
import type { ClubDef } from '@/features/captain/data/catalogs';
import { normalizeSearch } from '@/features/captain/data/catalogs';
import { competitionLabel } from '@/features/captain';
import ClubBadge from './ClubBadge';
import styles from './capitan.module.css';

interface Props {
    /** El pool del país, tal como lo devuelve `startingClubPool`. */
    clubs: ClubDef[];
    value: string | null;
    onChange: (clubId: string) => void;
}

/**
 * Cuántos se ven antes de "Ver los otros". Veinticuatro, como los destacados del
 * selector de países: doce filas en teléfono, que es lo que entra sin que el
 * botón de empezar se vaya a media pantalla de scroll.
 */
const COMPACTOS = 24;

/**
 * EN QUÉ CLUB TE HACÉS.
 *
 * La lista NO es el catálogo del país: es el pool del que sortea el motor
 * (`startingClubPool`), y por eso llega por props ya resuelto. Ofrecer acá los
 * clubes profesionales sería ofrecer debutar en el Top 14, que es justo lo que
 * el juego no hace — a primera se llega.
 *
 * Ordenado por rating y no alfabéticamente: en Argentina son 264 clubes y el que
 * abre la lista busca reconocer algo. Los grandes arriba dan ese anclaje, y el
 * buscador es el camino corto para el resto — quien viene por su club de barrio
 * lo encuentra en dos teclas.
 *
 * Elegir el más fuerte del pool es legítimo y no rompe nada: son todos clubes
 * donde un pibe de 18 puede empezar. Lo que cambia es que el sorteo pondera al
 * revés —hay muchos más clubes chicos que grandes—, así que elegir a CASI es
 * elegir algo que el dado casi nunca te da.
 */
export default function ClubPicker({ clubs, value, onChange }: Props) {
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState(false);
    const searchId = useId();

    const ordenados = useMemo(
        () => [...clubs].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name, 'es')),
        [clubs],
    );

    const buscando = query.trim().length > 0;
    const results = useMemo(() => {
        if (!buscando) return ordenados;
        const needle = normalizeSearch(query);
        return ordenados.filter((c) => normalizeSearch(c.name).includes(needle));
    }, [buscando, ordenados, query]);

    /**
     * El elegido SIEMPRE está a la vista, igual que en el selector de países: si
     * buscaste tu club de barrio, lo elegiste y borraste la búsqueda, la lista
     * corta no puede volver sin nada marcado.
     */
    const compacta = useMemo(() => {
        const cabeza = ordenados.slice(0, COMPACTOS);
        if (value === null || cabeza.some((c) => c.id === value)) return cabeza;
        const elegido = ordenados.find((c) => c.id === value);
        return elegido ? [elegido, ...cabeza] : cabeza;
    }, [ordenados, value]);

    const visible = buscando || expanded ? results : compacta;
    const ocultos = results.length - visible.length;

    return (
        <div className={styles.picker}>
            <label className={styles.searchLabel} htmlFor={searchId}>Buscar un club</label>
            <input
                id={searchId}
                type="search"
                className={styles.input}
                placeholder="Buscar un club"
                value={query}
                autoComplete="off"
                onChange={(e) => setQuery(e.target.value)}
            />

            {buscando && (
                <p className={styles.searchCount} aria-live="polite">
                    {results.length === 0
                        ? 'Ningún club con ese nombre.'
                        : `${results.length} ${results.length === 1 ? 'club' : 'clubes'}.`}
                </p>
            )}

            <div className={styles.clubGrid} role="radiogroup" aria-label="Club donde empezás">
                {visible.map((club) => {
                    const elegido = club.id === value;
                    const torneo = competitionLabel(club.id);
                    return (
                        <button
                            key={club.id}
                            type="button"
                            role="radio"
                            aria-checked={elegido}
                            className={`${styles.clubOption} ${elegido ? styles.clubOptionOn : ''}`}
                            onClick={() => onChange(club.id)}
                        >
                            <ClubBadge clubId={club.id} clubName={club.name} size={26} />
                            <span className={styles.clubOptionText}>
                                <span className={styles.clubOptionName}>{club.name}</span>
                                {/* La división es lo que dice qué es ese club para
                                    alguien que no lo conoce: sin ella, 264 nombres
                                    argentinos son 264 nombres. */}
                                {torneo && <span className={styles.clubOptionLeague}>{torneo}</span>}
                            </span>
                        </button>
                    );
                })}
            </div>

            {!buscando && ocultos > 0 && (
                <button type="button" className={styles.linkBtn} onClick={() => setExpanded(true)}>
                    Ver los otros {ocultos}
                </button>
            )}
            {!buscando && expanded && (
                <button type="button" className={styles.linkBtn} onClick={() => setExpanded(false)}>
                    Ver menos
                </button>
            )}
        </div>
    );
}
