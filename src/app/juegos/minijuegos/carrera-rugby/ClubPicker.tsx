'use client';

import { useId, useMemo, useState } from 'react';
import { competitionLabelOf, normalizeSearch, startClubChoices } from '@/features/career';
import { useLocale } from './LocaleContext';
import ClubBadge from './ClubBadge';
import styles from './carrera.module.css';

interface Props {
    /** País del jugador. De acá sale la lista: se elige entre los de tu país. */
    countryCode: string;
    value: string | null;
    onChange: (clubId: string) => void;
    /** Confirmar la elección y volver a la creación. */
    onDone: () => void;
    onBack: () => void;
}

/**
 * LA PANTALLA DE ELEGIR CLUB.
 *
 * Es una pantalla y no un desplegable adentro de la tarjeta de creación, y la
 * diferencia no es estética: son 227 clubes argentinos en 25 divisiones. Un
 * `<select>` con doscientas líneas no es elegir, es buscar a ciegas; acá cada
 * club entra con su escudo y su división, que son las dos cosas que le dicen al
 * jugador qué está eligiendo.
 *
 * AGRUPADO POR DIVISIÓN, en el orden de fuerza que declara el catálogo. Una lista
 * plana ordenada por rating leería "Newman, CASI, SIC, Hindú…" sin decir nunca
 * que eso es el Top 14 y que abajo hay seis categorías más.
 *
 * El buscador filtra sobre la lista entera, no sobre lo que se está viendo: es el
 * camino corto para el que ya sabe a qué club quiere ir.
 */
export default function ClubPicker({ countryCode, value, onChange, onDone, onBack }: Props) {
    const { t } = useLocale();
    const [query, setQuery] = useState('');
    const searchId = useId();

    const clubs = useMemo(() => startClubChoices(countryCode), [countryCode]);

    const results = useMemo(() => {
        const needle = normalizeSearch(query);
        if (needle.length === 0) return clubs;
        return clubs.filter((c) => normalizeSearch(c.labelEs).includes(needle));
    }, [clubs, query]);

    /**
     * Agrupado conservando el ORDEN DE LA LISTA: `startClubChoices` ya viene del
     * más fuerte al más flojo, así que la primera aparición de cada división marca
     * su lugar en la pirámide. Nada de ordenar por nombre de competición, que
     * pondría la Tercera antes que el Top 14 por la T.
     */
    const groups = useMemo(() => {
        const byCompetition = new Map<string, typeof results>();
        for (const club of results) {
            const list = byCompetition.get(club.competitionId) ?? [];
            list.push(club);
            byCompetition.set(club.competitionId, list);
        }
        return [...byCompetition.entries()];
    }, [results]);

    const searching = query.trim().length > 0;

    return (
        <div className={styles.clubPick}>
            <header className={styles.creatorHead}>
                <span className={styles.eyebrow}>{t.startClub}</span>
                {/* h2 y no h1: el h1 de la página es el título del juego. */}
                <h2 className={styles.creatorTitle}>{t.pickClubTitle}</h2>
                <p className={styles.creatorLead}>{t.pickClubLead}</p>
            </header>

            <div className={styles.clubPickSearch}>
                <label className={styles.searchLabel} htmlFor={searchId}>{t.searchClub}</label>
                <input
                    id={searchId}
                    type="search"
                    className={styles.searchInput}
                    placeholder={t.searchClub}
                    value={query}
                    autoComplete="off"
                    onChange={(e) => setQuery(e.target.value)}
                />
                {searching && (
                    <p className={styles.searchCount} aria-live="polite">
                        {results.length === 0 ? t.noClubMatches : t.clubsFound(results.length)}
                    </p>
                )}
            </div>

            <div className={styles.clubPickList} role="radiogroup" aria-label={t.pickClubTitle}>
                {groups.map(([competitionId, list]) => (
                    <section key={competitionId} className={styles.clubGroup}>
                        <h3 className={styles.clubGroupTitle}>{competitionLabelOf(competitionId)}</h3>
                        <div className={styles.clubGrid}>
                            {list.map((club) => {
                                const selected = club.id === value;
                                return (
                                    <button
                                        key={club.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        className={`${styles.clubOption} ${selected ? styles.clubOptionOn : ''}`}
                                        onClick={() => onChange(club.id)}
                                    >
                                        <ClubBadge clubId={club.id} clubName={club.labelEs} size={28} />
                                        <span className={styles.clubOptionName}>{club.labelEs}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>

            <footer className={styles.creatorFoot}>
                <button type="button" className={styles.ghostBtn} onClick={onBack}>{t.back}</button>
                <div className={styles.creatorFootRight}>
                    {/* El deshabilitado dice qué falta, como en el resto del juego. */}
                    {value === null && (
                        <p className={styles.hintText} aria-live="polite">{t.pickClubLead}</p>
                    )}
                    <button type="button" className={styles.primaryBtn} onClick={onDone} disabled={value === null}>
                        {t.useThisClub}
                    </button>
                </div>
            </footer>
        </div>
    );
}
