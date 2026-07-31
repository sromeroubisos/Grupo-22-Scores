'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    countryNameIn, FREQUENT_COUNTRY_CODES, normalizeSearch, SELECTABLE_NATIONALITIES, searchCountries,
} from '@/features/career';
import { useLocale } from './LocaleContext';
import Flag from './Flag';
import { useFittingCount } from './useFittingCount';
import styles from './carrera.module.css';

interface Props {
    value: string | null;
    onChange: (code: string) => void;
    /**
     * true en la tarjeta de escritorio: la grilla mide su caja y muestra
     * EXACTAMENTE las filas que entran, en vez de desbordar con scroll. En
     * mobile la pantalla fluye y el conteo fijo de siempre es el correcto.
     */
    fitToBox?: boolean;
}

// Cuántos se muestran antes de "Ver más": las naciones de rugby habituales.
const COMPACT_COUNT = FREQUENT_COUNTRY_CODES.length;

/**
 * El cupo medido es un mecanismo de la TARJETA de escritorio. En mobile la
 * pantalla fluye hacia abajo, la caja no tiene alto que medir y el cálculo
 * devolvería el mínimo — se veían 4 países. Ahí manda el conteo de siempre con
 * su "Ver más". Es el mismo breakpoint que usa el CSS de la tarjeta.
 */
const TARJETA = '(min-width: 900px)';

// Medidas REALES de `.countryOption` (min-height) y del gap de `.countryGrid`.
// Si cambian en el CSS, cambian acá: el cupo se calcula con estos números.
const ROW_HEIGHT = 40;
const ROW_GAP = 8;

/**
 * Selector de nacionalidad: buscador + grilla de dos columnas. Muestra un
 * subconjunto compacto y despliega el catálogo completo con "Ver más". Cuando
 * hay búsqueda, busca SIEMPRE sobre el catálogo entero.
 * Semántica de radiogroup para que funcione con teclado y lector de pantalla.
 */
export default function CountryPicker({ value, onChange, fitToBox = false }: Props) {
    const { locale, t } = useLocale();
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState(false);
    const searchId = useId();
    const gridRef = useRef<HTMLDivElement>(null);
    const [enTarjeta, setEnTarjeta] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia(TARJETA);
        const sync = () => setEnTarjeta(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    const midiendo = fitToBox && enTarjeta;

    const fitting = useFittingCount(gridRef, {
        rowHeight: ROW_HEIGHT, gap: ROW_GAP, columns: 2, min: 4, max: SELECTABLE_NATIONALITIES.length,
    });

    const searching = query.trim().length > 0;
    /**
     * SE BUSCA EN LOS DOS IDIOMAS, siempre.
     *
     * `searchCountries` es del motor y sólo conoce los nombres en español, que es
     * el idioma canónico del catálogo. Jugando en inglés eso deja "South Africa"
     * sin resultados y el buscador —que es EL camino a los 231 países que no
     * entran en la grilla— queda roto justo en el idioma nuevo.
     *
     * Buscar en los dos y no sólo en el que está activo es a propósito: un
     * argentino con la interfaz en inglés sigue escribiendo "Sudáfrica".
     */
    const results = useMemo(() => {
        if (!searching) return SELECTABLE_NATIONALITIES;
        const spanish = searchCountries(query);
        if (locale === 'es') return spanish;
        const needle = normalizeSearch(query);
        const english = SELECTABLE_NATIONALITIES.filter(
            (c) => normalizeSearch(countryNameIn(c.code, c.nameEs, 'en')).includes(needle),
        );
        // Orden estable del catálogo, sin repetidos: los que coinciden en los dos
        // idiomas no pueden salir dos veces.
        const found = new Set([...spanish, ...english].map((c) => c.code));
        return SELECTABLE_NATIONALITIES.filter((c) => found.has(c.code));
    }, [locale, query, searching]);
    // Con caja acotada manda lo que entra, se esté buscando o no: la promesa es
    // que NADA scrollea, y una búsqueda con 40 resultados desbordaría igual.
    const cupo = midiendo ? fitting : (searching || expanded ? results.length : COMPACT_COUNT);
    const visible = results.slice(0, cupo);
    const hidden = results.length - visible.length;

    return (
        <div className={`${styles.picker} ${midiendo ? styles.pickerFit : ''}`}>
            <label className={styles.searchLabel} htmlFor={searchId}>{t.searchCountry}</label>
            <input
                id={searchId}
                type="search"
                className={styles.searchInput}
                placeholder={t.searchCountry}
                value={query}
                autoComplete="off"
                onChange={(e) => setQuery(e.target.value)}
            />

            {searching && (
                <p className={styles.searchCount} aria-live="polite">
                    {results.length === 0 ? t.noCountryMatches : t.countriesFound(results.length)}
                </p>
            )}

            <div
                ref={gridRef}
                className={`${styles.countryGrid} ${midiendo ? styles.countryGridFit : ''}`}
                role="radiogroup"
                aria-label={t.nationality}
            >
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
                            <span className={styles.countryName}>{countryNameIn(country.code, country.nameEs, locale)}</span>
                        </button>
                    );
                })}
            </div>

            {/* Con caja acotada no hay "Ver menos": no se despliega nada in
                situ, porque desplegar es justamente lo que traía el scroll. El
                resto del catálogo se alcanza escribiendo. */}
            {hidden > 0 && (
                midiendo
                    ? (
                        <p className={styles.searchCount}>{t.moreCountries(hidden)}</p>
                    )
                    : !searching && !expanded && (
                        <button type="button" className={styles.linkBtn} onClick={() => setExpanded(true)}>
                            {t.seeMore(hidden)}
                        </button>
                    )
            )}
            {!midiendo && !searching && expanded && (
                <button type="button" className={styles.linkBtn} onClick={() => setExpanded(false)}>
                    {t.seeLess}
                </button>
            )}
        </div>
    );
}
