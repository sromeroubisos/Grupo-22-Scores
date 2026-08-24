'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import TeamLogo from '@/components/TeamLogo';
import styles from './GlobalSearch.module.css';

type SearchResult = {
    id: string;
    type: 'tournament' | 'club' | 'player';
    title: string;
    subtitle: string;
    url: string;
    logo_url?: string;
};

export default function GlobalSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside, { passive: true });
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        if (query.length < 2) {
            setResults([]);
            setLoading(false);
            return;
        }

        const controller = new AbortController();

        const fetchResults = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/search/universal?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                });
                const data = await res.json();
                setResults(data.data || []);
            } catch (error) {
                if ((error as Error)?.name === 'AbortError') return;
                console.error(error);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        const timer = setTimeout(() => {
            void fetchResults();
        }, 300);

        return () => {
            clearTimeout(timer);
            // Without aborting, a slow response for an earlier prefix can land after the
            // one the user actually finished typing and repaint the dropdown with results
            // for a query that is no longer on screen.
            controller.abort();
        };
    }, [query]);

    const handleSelect = (url: string) => {
        router.push(url);
        setIsOpen(false);
        setQuery('');
    };

    return (
        <div className={styles.container} ref={containerRef}>
            <div className={`${styles.searchBox} ${isOpen ? styles.active : ''}`}>
                <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {/* El placeholder desaparece al escribir: quien vuelve al campo a
                    mitad de una consulta se queda sin saber qué se esperaba acá.
                    El nombre accesible tiene que ser estable. */}
                <input
                    type="search"
                    aria-label="Buscar torneos, clubes o jugadores"
                    placeholder="Buscar torneos, clubes o jugadores..."
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                {loading ? <div className={styles.spinner} /> : null}
            </div>

            {isOpen && query.length >= 2 ? (
                <div className={styles.results}>
                    {results.length > 0 ? (
                        <>
                            {results.some((result) => result.type === 'tournament') ? (
                                <div className={styles.groupHeader}>Torneos</div>
                            ) : null}
                            {results.filter((result) => result.type === 'tournament').map((result) => (
                                <SearchResultItem key={result.id} res={result} onSelect={handleSelect} />
                            ))}

                            {results.some((result) => result.type === 'club') ? (
                                <div className={styles.groupHeader}>Clubes</div>
                            ) : null}
                            {results.filter((result) => result.type === 'club').map((result) => (
                                <SearchResultItem key={result.id} res={result} onSelect={handleSelect} />
                            ))}

                            {results.some((result) => result.type === 'player') ? (
                                <div className={styles.groupHeader}>Jugadores</div>
                            ) : null}
                            {results.filter((result) => result.type === 'player').map((result) => (
                                <SearchResultItem key={result.id} res={result} onSelect={handleSelect} />
                            ))}
                        </>
                    ) : !loading ? (
                        <div className={styles.noResults}>No se encontraron resultados</div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

/**
 * Las iniciales de un jugador. La foto no sirve como identidad en el buscador:
 * de 1528 fichas, 31 tienen una — el resto quedaria como un hueco gris repetido
 * fila tras fila.
 */
function initialsOf(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const BADGE_LABEL: Record<SearchResult['type'], string> = {
    tournament: 'Torneo',
    club: 'Club',
    player: 'Jugador',
};

function SearchResultItem({ res, onSelect }: { res: SearchResult; onSelect: (url: string) => void }) {
    return (
        <button
            className={styles.resultItem}
            onClick={() => onSelect(res.url)}
        >
            {res.type === 'club' ? (
                <TeamLogo
                    name={res.title}
                    teamId={res.id}
                    logoUrl={res.logo_url}
                    className={styles.resultIcon}
                    size={40}
                />
            ) : res.type === 'player' ? (
                <div className={`${styles.resultIcon} ${styles.playerIcon}`} aria-hidden="true">
                    {initialsOf(res.title)}
                </div>
            ) : (
                <div className={styles.resultIcon}>
                    {res.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={res.logo_url} alt="" loading="lazy" />
                    ) : (
                        '🏆'
                    )}
                </div>
            )}
            <div className={styles.resultContent}>
                <span className={styles.resultTitle}>{res.title}</span>
                <span className={styles.resultSubtitle}>{res.subtitle}</span>
            </div>
            <span
                className={`${styles.badge} ${
                    res.type === 'tournament'
                        ? styles.tournamentBadge
                        : res.type === 'player'
                          ? styles.playerBadge
                          : styles.clubBadge
                }`}
            >
                {BADGE_LABEL[res.type]}
            </span>
            <svg className={styles.arrowIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
            </svg>
        </button>
    );
}
