'use client';

import { useId, useMemo, useState } from 'react';
import {
    FREQUENT_COUNTRY_CODES,
    SELECTABLE_NATIONALITIES,
    flagPathOf,
    searchCountries,
} from '@/features/captain/data/catalogs';
import styles from './capitan.module.css';

interface Props {
    value: string;
    onChange: (code: string) => void;
}

/**
 * Los que se muestran antes de "Ver más": las veinticuatro uniones de rugby
 * habituales, en el orden del catálogo. Se filtran contra la lista ofrecida
 * porque una unión suspendida no puede colarse por ser "frecuente".
 */
const DESTACADOS = SELECTABLE_NATIONALITIES.filter((c) => FREQUENT_COUNTRY_CODES.includes(c.code));

/** Bandera del catálogo: SVG local, sin emojis —en Windows se ven como "AR"—. */
function Flag({ code }: { code: string }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element -- SVG local estático; next/image no aporta acá
        <img
            src={flagPathOf(code)}
            alt=""
            width={22}
            height={16}
            className={styles.flag}
            loading="lazy"
        />
    );
}

/**
 * De dónde sos. El catálogo ENTERO —doscientas y pico de nacionalidades— con su
 * bandera, no las ocho de siempre.
 *
 * Doscientos botones no entran en una tarjeta, así que se muestran primero las
 * uniones de rugby y el resto se alcanza escribiendo o desplegando. Buscar es el
 * camino corto: quien viene por Namibia la encuentra en dos teclas y no
 * recorriendo una grilla.
 *
 * Semántica de `radiogroup` para que funcione con teclado y lector de pantalla
 * (CLAUDE.md §6).
 */
export default function CountryPicker({ value, onChange }: Props) {
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState(false);
    const searchId = useId();

    const buscando = query.trim().length > 0;
    // Cuando se busca, se busca SIEMPRE sobre el catálogo entero: si el jugador
    // escribe "Fiyi" y Fiyi está fuera de los destacados, tiene que aparecer.
    const results = useMemo(
        () => (buscando ? searchCountries(query) : SELECTABLE_NATIONALITIES),
        [buscando, query],
    );

    /**
     * El elegido SIEMPRE está a la vista.
     *
     * Sin esto, quien busca "Namibia", la elige y borra la búsqueda vuelve a una
     * grilla de veinticuatro uniones donde ninguna está marcada: la pantalla le
     * dice que no eligió nada. Se cuela al principio, que es donde se mira.
     */
    const compacta = useMemo(() => {
        if (DESTACADOS.some((c) => c.code === value)) return DESTACADOS;
        const elegido = SELECTABLE_NATIONALITIES.find((c) => c.code === value);
        return elegido ? [elegido, ...DESTACADOS] : DESTACADOS;
    }, [value]);

    const visible = buscando || expanded ? results : compacta;
    const ocultos = results.length - visible.length;

    return (
        <div className={styles.picker}>
            <label className={styles.searchLabel} htmlFor={searchId}>Buscar un país</label>
            <input
                id={searchId}
                type="search"
                className={styles.input}
                placeholder="Buscar un país"
                value={query}
                autoComplete="off"
                onChange={(e) => setQuery(e.target.value)}
            />

            {buscando && (
                <p className={styles.searchCount} aria-live="polite">
                    {results.length === 0
                        ? 'Ningún país con ese nombre.'
                        : `${results.length} ${results.length === 1 ? 'país' : 'países'}.`}
                </p>
            )}

            <div className={styles.countryGrid} role="radiogroup" aria-label="Nacionalidad">
                {visible.map((pais) => {
                    const elegido = pais.code === value;
                    return (
                        <button
                            key={pais.code}
                            type="button"
                            role="radio"
                            aria-checked={elegido}
                            className={`${styles.country} ${elegido ? styles.countryOn : ''}`}
                            onClick={() => onChange(pais.code)}
                        >
                            <Flag code={pais.code} />
                            <span className={styles.countryName}>{pais.nameEs}</span>
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
