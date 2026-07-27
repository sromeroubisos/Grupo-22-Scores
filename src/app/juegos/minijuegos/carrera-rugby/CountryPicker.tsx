'use client';

import { useId, useMemo, useState } from 'react';
import { FREQUENT_COUNTRY_CODES, SELECTABLE_COUNTRIES, searchCountries } from '@/features/career';
import Flag from './Flag';
import styles from './carrera.module.css';

interface Props {
    value: string | null;
    onChange: (code: string) => void;
}

// Cuántos se muestran antes de "Ver más": las naciones de rugby habituales.
const COMPACT_COUNT = FREQUENT_COUNTRY_CODES.length;

/**
 * Selector de nacionalidad: buscador + grilla de dos columnas. Muestra un
 * subconjunto compacto y despliega el catálogo completo con "Ver más". Cuando
 * hay búsqueda, busca SIEMPRE sobre el catálogo entero.
 * Semántica de radiogroup para que funcione con teclado y lector de pantalla.
 */
export default function CountryPicker({ value, onChange }: Props) {
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState(false);
    const searchId = useId();

    const searching = query.trim().length > 0;
    const results = useMemo(() => (searching ? searchCountries(query) : SELECTABLE_COUNTRIES), [query, searching]);
    const visible = searching || expanded ? results : results.slice(0, COMPACT_COUNT);
    const hidden = results.length - visible.length;

    return (
        <div className={styles.picker}>
            <label className={styles.searchLabel} htmlFor={searchId}>Buscar país</label>
            <input
                id={searchId}
                type="search"
                className={styles.searchInput}
                placeholder="Buscar país"
                value={query}
                autoComplete="off"
                onChange={(e) => setQuery(e.target.value)}
            />

            {searching && (
                <p className={styles.searchCount} aria-live="polite">
                    {results.length === 0
                        ? 'Ningún país coincide'
                        : `${results.length} ${results.length === 1 ? 'país' : 'países'}`}
                </p>
            )}

            <div className={styles.countryGrid} role="radiogroup" aria-label="Nacionalidad">
                {visible.map((country) => {
                    const selected = country.code === value;
                    return (
                        <button
                            key={country.code}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            className={`${styles.countryOption} ${selected ? styles.countryOptionOn : ''}`}
                            onClick={() => onChange(country.code)}
                        >
                            <Flag code={country.code} size={22} decorative />
                            <span className={styles.countryName}>{country.nameEs}</span>
                        </button>
                    );
                })}
            </div>

            {!searching && hidden > 0 && (
                <button type="button" className={styles.linkBtn} onClick={() => setExpanded(true)}>
                    Ver más ({hidden})
                </button>
            )}
            {!searching && expanded && (
                <button type="button" className={styles.linkBtn} onClick={() => setExpanded(false)}>
                    Ver menos
                </button>
            )}
        </div>
    );
}
