'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import styles from './search.module.css';
import { db } from '@/lib/mock-db';
import { Search, X, Clock } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type EntityType = 'CLUB' | 'LIGA';

interface HistoryItem {
    id: string;
    type: EntityType;
    title: string;
    subtitle: string;
    href: string;
    lastViewedAt: number;
}

interface ResultRow {
    id: string;
    type: EntityType;
    title: string;
    subtitle: string;
    href: string;
    color?: string;
}

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce(value: string, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

// ─── History hook (localStorage) ─────────────────────────────────────────────

const HISTORY_KEY = 'search_history_v1';
const HISTORY_LIMIT = 20;

function useSearchHistory() {
    const [history, setHistory] = useState<HistoryItem[]>([]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(HISTORY_KEY);
            if (raw) setHistory(JSON.parse(raw));
        } catch {
            // ignore
        }
    }, []);

    const persist = (items: HistoryItem[]) => {
        setHistory(items);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); } catch { /* ignore */ }
    };

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

    const clearAll = useCallback(() => persist([]), []);

    return { history, saveItem, removeItem, clearAll };
}

// ─── Search logic (mock DB) ───────────────────────────────────────────────────

function buildResults(query: string): ResultRow[] {
    const lq = query.toLowerCase();

    const clubs: ResultRow[] = db.clubs
        .filter(c => c.name.toLowerCase().includes(lq) || c.city.toLowerCase().includes(lq))
        .map(c => ({
            id: `club-${c.id}`,
            type: 'CLUB' as EntityType,
            title: c.name,
            subtitle: `${(c as any).country ?? 'Argentina'} · ${c.city}`,
            href: `/clubs/${c.id}`,
            color: c.primaryColor,
        }));

    const leagues: ResultRow[] = db.tournaments
        .filter(l => l.name.toLowerCase().includes(lq) || l.category.toLowerCase().includes(lq))
        .map(l => ({
            id: `tour-${l.id}`,
            type: 'LIGA' as EntityType,
            title: l.name,
            subtitle: `${l.sport} · ${l.category}`,
            href: `/tournaments/${l.id}`,
        }));

    return [...leagues, ...clubs];
}

const TRENDING = ['Copa del Mundo', 'Los Pumas', 'Playoffs URBA', 'Leonas', 'Inter Miami', 'Top 14'];

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
        <Link href={row.href} className={styles.row} onClick={() => onSave(row)}>
            <div
                className={styles.rowIcon}
                style={{ backgroundColor: row.color ?? 'var(--color-bg-tertiary)' }}
            />
            <div className={styles.rowInfo}>
                <span className={styles.rowTitle}>{row.title}</span>
                <span className={styles.rowSubtitle}>{row.subtitle}</span>
            </div>
            <span className={styles.rowBadge}>{row.type}</span>
            <svg className={styles.rowChevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M9 18l6-6-6-6" />
            </svg>
        </Link>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SearchPage() {
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounce(query, 300);
    const inputRef = useRef<HTMLInputElement>(null);
    const { history, saveItem, removeItem, clearAll } = useSearchHistory();

    const isDebouncing = query !== debouncedQuery;
    const hasQuery = debouncedQuery.length >= 2;
    const results = hasQuery ? buildResults(debouncedQuery) : [];

    const handleSave = useCallback((row: ResultRow) => {
        saveItem({ id: row.id, type: row.type, title: row.title, subtitle: row.subtitle, href: row.href });
    }, [saveItem]);

    const handleHistoryClick = useCallback((item: HistoryItem) => {
        saveItem(item);
    }, [saveItem]);

    // State A: no query (or < 2 chars)
    const showEmpty = !isDebouncing && !hasQuery;

    return (
        <div className={styles.page}>
            {/* ── Sticky header ── */}
            <header className={styles.header}>
                <div className={styles.inputWrapper}>
                    <Search className={styles.inputIcon} size={20} />
                    <input
                        ref={inputRef}
                        className={styles.input}
                        placeholder="Clubes, ligas, jugadores, partidos..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                    />
                    {query.length > 0 && (
                        <button
                            className={styles.clearBtn}
                            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
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
                                        href={item.href}
                                        className={styles.recentRow}
                                        onClick={() => handleHistoryClick(item)}
                                    >
                                        <Clock size={15} className={styles.recentIcon} />
                                        <div className={styles.rowInfo}>
                                            <span className={styles.rowTitle}>{item.title}</span>
                                            <span className={styles.rowSubtitle}>{item.subtitle}</span>
                                        </div>
                                        <span className={styles.rowBadge}>{item.type}</span>
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

                {/* State B: debouncing → skeleton */}
                {!showEmpty && (isDebouncing || (query.length >= 2 && debouncedQuery.length < 2)) && (
                    <SkeletonRows />
                )}

                {/* State B: results ready */}
                {!showEmpty && !isDebouncing && hasQuery && (
                    results.length > 0 ? (
                        <div className={styles.resultList}>
                            {results.map(row => (
                                <ResultRowItem key={row.id} row={row} onSave={handleSave} />
                            ))}
                        </div>
                    ) : (
                        <div className={styles.noResults}>
                            <p>No hay datos disponibles todavía</p>
                            <button className={styles.clearBtn} onClick={() => window.location.reload()} style={{ marginTop: '20px', padding: '8px 16px', background: 'var(--color-surface-hover)', borderRadius: '8px', color: 'var(--color-text)' }}>
                                Reintentar
                            </button>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
