'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './GlobalSearch.module.css';

export default function GlobalSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const fetchResults = async () => {
            if (query.length < 2) {
                setResults([]);
                return;
            }

            setLoading(true);
            try {
                const res = await fetch(`/api/search/universal?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                setResults(data.data || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(fetchResults, 300);
        return () => clearTimeout(timer);
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
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                    type="text"
                    placeholder="Buscar torneos o clubes..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                {loading && <div className={styles.spinner}></div>}
            </div>

            {isOpen && query.length >= 2 && (
                <div className={styles.results}>
                    {results.length > 0 ? (
                        <>
                            {/* Torneos */}
                            {results.some(r => r.type === 'tournament') && (
                                <div className={styles.groupHeader}>Torneos</div>
                            )}
                            {results.filter(r => r.type === 'tournament').map((res) => (
                                <SearchResultItem key={res.id} res={res} onSelect={handleSelect} />
                            ))}

                            {/* Clubes */}
                            {results.some(r => r.type === 'club') && (
                                <div className={styles.groupHeader}>Clubes</div>
                            )}
                            {results.filter(r => r.type === 'club').map((res) => (
                                <SearchResultItem key={res.id} res={res} onSelect={handleSelect} />
                            ))}
                        </>
                    ) : !loading ? (
                        <div className={styles.noResults}>No se encontraron resultados</div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function SearchResultItem({ res, onSelect }: { res: any; onSelect: (url: string) => void }) {
    return (
        <button
            className={styles.resultItem}
            onClick={() => onSelect(res.url)}
        >
            <div className={styles.resultIcon}>
                {res.logo_url ? (
                    <img src={res.logo_url} alt={res.title} />
                ) : (
                    res.type === 'tournament' ? '🏆' : '🛡️'
                )}
            </div>
            <div className={styles.resultContent}>
                <span className={styles.resultTitle}>{res.title}</span>
                <span className={styles.resultSubtitle}>{res.subtitle}</span>
            </div>
            <span className={`${styles.badge} ${res.type === 'tournament' ? styles.tournamentBadge : styles.clubBadge}`}>
                {res.type === 'tournament' ? 'Torneo' : 'Club'}
            </span>
            <svg className={styles.arrowIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
        </button>
    );
}
