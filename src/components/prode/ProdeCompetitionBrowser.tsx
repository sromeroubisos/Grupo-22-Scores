'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './ProdeCompetitionBrowser.module.css';
import ProdeCompetitionCard from './ProdeCompetitionCard';
import { getSportLabel } from './competitionState';
import { compareLobbyCompetitions, isCompetitionActive } from '@/lib/prode/lobbyOrder';
import type { PublicProdeCompetition } from '@/lib/prode/types';

type SortMode = 'relevance' | 'popular' | 'name';

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
    { id: 'relevance', label: 'Jugables primero' },
    { id: 'popular', label: 'Mas jugadores' },
    { id: 'name', label: 'A-Z' },
];

/**
 * Pantalla de buscar. Acá vive el catálogo completo con sus filtros; el lobby solo
 * muestra la vitrina. Separarlas evita el problema de origen: 38 tarjetas iguales
 * una atrás de otra sin forma de encontrar nada.
 */
export default function ProdeCompetitionBrowser({
    competitions,
}: {
    competitions: PublicProdeCompetition[];
}) {
    const [query, setQuery] = useState('');
    const [sportFilter, setSportFilter] = useState<string>('all');
    const [openOnly, setOpenOnly] = useState(false);
    const [sortMode, setSortMode] = useState<SortMode>('relevance');
    const [now, setNow] = useState<number | null>(null);

    useEffect(() => {
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    const normalizedQuery = query.trim().toLowerCase();

    const searchMatched = useMemo(() => {
        if (!normalizedQuery) return competitions;

        return competitions.filter((competition) => {
            const haystack = [
                competition.name,
                competition.description || '',
                getSportLabel(competition.sportId),
            ].join(' ').toLowerCase();

            return haystack.includes(normalizedQuery);
        });
    }, [competitions, normalizedQuery]);

    // Los contadores del filtro cuentan sobre lo que dejó la búsqueda, no sobre el
    // catálogo entero: un chip que promete 29 y devuelve 2 miente.
    const sportOptions = useMemo(() => {
        const counts = new Map<string, number>();

        searchMatched.forEach((competition) => {
            const sportId = competition.sportId;
            if (!sportId) return;
            counts.set(sportId, (counts.get(sportId) || 0) + 1);
        });

        const sports = Array.from(counts.entries())
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

        return [
            { id: 'all', label: 'Todos', count: searchMatched.length },
            ...sports.map(([id, count]) => ({ id, label: getSportLabel(id), count })),
        ];
    }, [searchMatched]);

    const results = useMemo(() => {
        const filtered = searchMatched
            .filter((competition) => sportFilter === 'all' || competition.sportId === sportFilter)
            .filter((competition) => !openOnly || isCompetitionActive(competition));

        const sorted = [...filtered];

        if (sortMode === 'popular') {
            sorted.sort((left, right) =>
                right.members.totalMembers - left.members.totalMembers
                || left.name.localeCompare(right.name, 'es'));
        } else if (sortMode === 'name') {
            sorted.sort((left, right) => left.name.localeCompare(right.name, 'es'));
        } else {
            // "Jugables primero" usa el orden del lobby, que ya tiene test: destacadas,
            // después las que se pueden jugar, después por cierre más próximo.
            sorted.sort(compareLobbyCompetitions);
        }

        return sorted;
    }, [searchMatched, sportFilter, openOnly, sortMode]);

    const openCount = competitions.filter(isCompetitionActive).length;
    const hasFilters = Boolean(normalizedQuery) || sportFilter !== 'all' || openOnly;

    function clearFilters() {
        setQuery('');
        setSportFilter('all');
        setOpenOnly(false);
    }

    return (
        <div className={styles.page}>
            <div className="container">
                <div className={styles.shell}>
                    <header className={styles.header}>
                        <Link href="/prode" className={styles.backLink}>← Prode</Link>
                        <h1 className={styles.title}>Competencias</h1>
                        <p className={styles.lede}>
                            Todas las ligas publicas del prode. Buscá por torneo o deporte y entrá a la
                            que quieras jugar.
                        </p>
                        <p className={styles.headerCount}>
                            <span className={styles.headerCountNum}>{competitions.length}</span> competencias ·{' '}
                            <span className={styles.headerCountNum}>{openCount}</span> abiertas ahora
                        </p>
                    </header>

                    <div className={styles.toolbar}>
                        <div className={styles.searchField}>
                            <label htmlFor="competencias-search" className={styles.visuallyHidden}>
                                Buscar una competencia
                            </label>
                            <svg className={styles.searchIcon} viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                                <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                            <input
                                id="competencias-search"
                                type="search"
                                className={styles.searchInput}
                                placeholder="Buscar torneo o deporte"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                autoComplete="off"
                            />
                            {query ? (
                                <button
                                    type="button"
                                    className={styles.searchClear}
                                    onClick={() => setQuery('')}
                                    aria-label="Borrar la busqueda"
                                >
                                    ×
                                </button>
                            ) : null}
                        </div>

                        <div className={styles.filterRow} role="group" aria-label="Filtrar por deporte">
                            {sportOptions.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    className={`${styles.chip} ${sportFilter === option.id ? styles.chipActive : ''}`}
                                    aria-pressed={sportFilter === option.id}
                                    onClick={() => setSportFilter(option.id)}
                                >
                                    {option.label}
                                    <span className={styles.chipCount}>{option.count}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.controlRow}>
                        <button
                            type="button"
                            className={`${styles.chip} ${openOnly ? styles.chipActive : ''}`}
                            aria-pressed={openOnly}
                            onClick={() => setOpenOnly((current) => !current)}
                        >
                            Solo abiertas
                            <span className={styles.chipCount}>{openCount}</span>
                        </button>

                        <div className={styles.sortRow} role="group" aria-label="Ordenar las competencias">
                            {SORT_OPTIONS.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    className={`${styles.chip} ${sortMode === option.id ? styles.chipActive : ''}`}
                                    aria-pressed={sortMode === option.id}
                                    onClick={() => setSortMode(option.id)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <p className={styles.resultCount} role="status">
                        {results.length === competitions.length
                            ? `${results.length} competencias`
                            : `${results.length} de ${competitions.length} competencias`}
                    </p>

                    {results.length ? (
                        <div className={styles.cardGrid}>
                            {results.map((competition) => (
                                <ProdeCompetitionCard key={competition.id} competition={competition} now={now} />
                            ))}
                        </div>
                    ) : (
                        <div className={styles.empty}>
                            <p className={styles.emptyTitle}>Ninguna competencia coincide</p>
                            <p className={styles.emptyText}>
                                {normalizedQuery
                                    ? `No hay resultados para "${query.trim()}". Proba con el nombre del torneo o del deporte.`
                                    : 'Con estos filtros no queda ninguna competencia.'}
                            </p>
                            {hasFilters ? (
                                <button type="button" className={styles.btnSecondary} onClick={clearFilters}>
                                    Limpiar filtros
                                </button>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
