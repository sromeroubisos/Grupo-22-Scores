'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import styles from './search.module.css';
import { Search, X, Clock } from 'lucide-react';

interface HistoryItem {
    id: string;
    type: 'tournament' | 'club';
    title: string;
    subtitle: string;
    url: string;
    logo_url?: string;
    lastViewedAt: number;
}

interface ResultRow {
    id: string;
    type: 'tournament' | 'club';
    title: string;
    subtitle: string;
    url: string;
    logo_url?: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonRows() {
    return (
        <div className={styles.skeletonList}>
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={styles.skeletonRow}>
                    <div className={styles.skeletonCircle} />
                    <div className={styles.skeletonLines}>
                        <div className={styles.skeletonLine} style={{ width: `${55 + (i % 3) * 15}%` }} />
                        <div className={styles.skeletonLine} style={{ width: `${30 + (i % 2) * 20}%`, height: 10 }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function ResultRowItem({ row, onSave }: { row: ResultRow; onSave: (r: ResultRow) => void }) {
    return (
        <Link href={row.url} className={styles.row} onClick={() => onSave(row)}>
            <div className={styles.rowIcon}>
                {row.logo_url ? (
                    <img src={row.logo_url} alt={row.title} />
                ) : (
                    row.type === 'tournament' ? '🏆' : '🛡️'
                )}
            </div>
            <div className={styles.rowInfo}>
                <span className={styles.rowTitle}>{row.title}</span>
                <span className={styles.rowSubtitle}>{row.subtitle}</span>
            </div>
            <span className={`${styles.badge} ${row.type === 'tournament' ? styles.tournamentBadge : styles.clubBadge}`}>
                {row.type === 'tournament' ? 'Torneo' : 'Club'}
            </span>
            <svg className={styles.rowChevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M9 18l6-6-6-6" />
            </svg>
        </Link>
    );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useDebounce(value: string, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

const HISTORY_KEY = 'search_history_v1';
const HISTORY_LIMIT = 20;

function useSearchHistory() {
    const [history, setHistory] = useState<HistoryItem[]>([]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(HISTORY_KEY);
            if (raw) setHistory(JSON.parse(raw));
        } catch { /* ignore */ }
    }, []);

    const saveItem = useCallback((item: Omit<HistoryItem, 'lastViewedAt'>) => {
        setHistory(prev => {
            const filtered = prev.filter(h => h.id !== item.id);
            const next = [{ ...item, lastViewedAt: Date.now() }, ...filtered].slice(0, HISTORY_LIMIT);
            try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
    }, []);

    const removeItem = useCallback((id: string) => {
        setHistory(prev => {
            const next = prev.filter(h => h.id !== id);
            try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
    }, []);

    const clearAll = useCallback(() => {
        setHistory([]);
        try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
    }, []);

    return { history, saveItem, removeItem, clearAll };
}

const TRENDING = ['Copa del Mundo', 'Los Pumas', 'Playoffs URBA', 'Leonas', 'Inter Miami', 'Top 14'];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SearchPage() {
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounce(query, 250);
    const inputRef = useRef<HTMLInputElement>(null);
    const [results, setResults] = useState<ResultRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { history, saveItem, removeItem, clearAll } = useSearchHistory();

    useEffect(() => {
        const fetchResults = async () => {
            if (debouncedQuery.length < 2) {
                setResults([]);
                return;
            }

            setIsLoading(true);
            try {
                const res = await fetch(`/api/search/universal?q=${encodeURIComponent(debouncedQuery)}`);
                if (!res.ok) throw new Error('Search failed');
                const data = await res.json();
                setResults(data.data || []);
            } catch (err) {
                console.error('Search error:', err);
                setResults([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchResults();
    }, [debouncedQuery]);

    const handleSave = useCallback((row: ResultRow | HistoryItem) => {
        saveItem({
            id: row.id,
            type: row.type,
            title: row.title,
            subtitle: row.subtitle,
            url: (row as any).url || (row as any).href,
            logo_url: row.logo_url
        });
    }, [saveItem]);

    const hasQuery = debouncedQuery.length >= 2;
    const showEmpty = !isLoading && !hasQuery && query.length < 2;

    // Grouping logic
    const tournaments = results.filter(r => r.type === 'tournament');
    const clubs = results.filter(r => r.type === 'club');

    return (
        <div className={styles.page}>
            {/* ── Sticky header ── */}
            <header className={styles.header}>
                <div className={styles.inputWrapper}>
                    <Search className={styles.inputIcon} size={20} />
                    <input
                        ref={inputRef}
                        className={styles.input}
                        placeholder="Buscar torneos o clubes..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                    />
                    {query.length > 0 && (
                        <button
                            className={styles.clearBtn}
                            onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
                            aria-label="Limpiar búsqueda"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </header>

            {/* ── Content ── */}
            <div className={styles.content}>

                {/* State A: empty query → recientes + tendencias */}
                {showEmpty && (
                    <>
                        {history.length > 0 && (
                            <section className={styles.section}>
                                <div className={styles.sectionHeader}>
                                    <span className={styles.sectionLabel}>Recientes</span>
                                    <button className={styles.clearAllBtn} onClick={clearAll}>
                                        Borrar todo
                                    </button>
                                </div>
                                {history.map(item => (
                                    <Link
                                        key={item.id}
                                        href={item.url}
                                        className={styles.recentRow}
                                        onClick={() => handleSave(item)}
                                    >
                                        <div className={styles.recentIconWrapper}>
                                            {item.logo_url ? (
                                                <img src={item.logo_url} className={styles.recentLogo} alt="" />
                                            ) : (
                                                <Clock size={15} className={styles.recentIcon} />
                                            )}
                                        </div>
                                        <div className={styles.rowInfo}>
                                            <span className={styles.rowTitle}>{item.title}</span>
                                            <span className={styles.rowSubtitle}>{item.subtitle}</span>
                                        </div>
                                        <button
                                            className={styles.removeBtn}
                                            onClick={e => { e.preventDefault(); e.stopPropagation(); removeItem(item.id); }}
                                            aria-label="Eliminar del historial"
                                        >
                                            <X size={14} />
                                        </button>
                                    </Link>
                                ))}
                            </section>
                        )}

                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <span className={styles.sectionLabel}>Tendencias</span>
                            </div>
                            <div className={styles.trendingGrid}>
                                {TRENDING.map(tag => (
                                    <button
                                        key={tag}
                                        className={styles.trendChip}
                                        onClick={() => setQuery(tag)}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </section>
                    </>
                )}

                {/* Loading state */}
                {isLoading && <SkeletonRows />}

                {/* Results list */}
                {!showEmpty && !isLoading && hasQuery && (
                    results.length > 0 ? (
                        <div className={styles.resultList}>
                            {tournaments.length > 0 && (
                                <>
                                    <div className={styles.groupHeader}>Torneos</div>
                                    {tournaments.map(row => (
                                        <ResultRowItem key={row.id} row={row} onSave={handleSave} />
                                    ))}
                                </>
                            )}
                            {clubs.length > 0 && (
                                <>
                                    <div className={styles.groupHeader}>Clubes</div>
                                    {clubs.map(row => (
                                        <ResultRowItem key={row.id} row={row} onSave={handleSave} />
                                    ))}
                                </>
                            )}
                        </div>
                    ) : (
                        <div className={styles.noResults}>
                            <p>No se encontraron resultados para "{debouncedQuery}"</p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
