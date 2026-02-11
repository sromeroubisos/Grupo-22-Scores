'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useSport } from '@/context/SportContext';
import { getTournamentsBySport, getInternationalTournamentsBySport } from '@/lib/data/tournaments/index';
import { getCountryById } from '@/lib/data/countries';
import type { Tournament } from '@/lib/types';
import styles from './Sidebar.module.css';

// Group tournaments by country
function groupTournamentsByCountry(tournaments: Tournament[]) {
    const groups: Record<string, { countryName: string; flagEmoji: string; tournaments: Tournament[] }> = {};

    tournaments.forEach(tournament => {
        const country = getCountryById(tournament.countryId);
        const countryName = country?.name || tournament.countryId;
        const flagEmoji = country?.flagEmoji || '🌍';

        if (!groups[tournament.countryId]) {
            groups[tournament.countryId] = { countryName, flagEmoji, tournaments: [] };
        }
        groups[tournament.countryId].tournaments.push(tournament);
    });

    // Sort tournaments within each group by priority
    Object.values(groups).forEach(group => {
        group.tournaments.sort((a, b) => b.priority - a.priority);
    });

    return groups;
}

export default function Sidebar() {
    const { selectedSport } = useSport();
    const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set(['international']));
    const [searchQuery, setSearchQuery] = useState('');

    // Get tournaments for selected sport
    const allTournaments = useMemo(() => getTournamentsBySport(selectedSport.id), [selectedSport.id]);
    const internationalTournaments = useMemo(() => getInternationalTournamentsBySport(selectedSport.id), [selectedSport.id]);

    // Group local tournaments by country
    const localTournaments = useMemo(() => {
        return allTournaments.filter(t => t.type === 'local' || t.type === 'cup');
    }, [allTournaments]);

    const groupedTournaments = useMemo(() => groupTournamentsByCountry(localTournaments), [localTournaments]);

    // Filter tournaments by search
    const filteredInternational = useMemo(() => {
        if (!searchQuery) return internationalTournaments.slice(0, 10);
        return internationalTournaments.filter(t =>
            t.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [internationalTournaments, searchQuery]);

    const filteredGroups = useMemo(() => {
        if (!searchQuery) return groupedTournaments;

        const filtered: typeof groupedTournaments = {};
        Object.entries(groupedTournaments).forEach(([countryId, group]) => {
            const matchingTournaments = group.tournaments.filter(t =>
                t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                group.countryName.toLowerCase().includes(searchQuery.toLowerCase())
            );
            if (matchingTournaments.length > 0) {
                filtered[countryId] = { ...group, tournaments: matchingTournaments };
            }
        });
        return filtered;
    }, [groupedTournaments, searchQuery]);

    const toggleCountry = (countryId: string) => {
        setExpandedCountries(prev => {
            const next = new Set(prev);
            if (next.has(countryId)) {
                next.delete(countryId);
            } else {
                next.add(countryId);
            }
            return next;
        });
    };

    // Sort countries alphabetically
    const sortedCountryIds = Object.keys(filteredGroups).sort((a, b) =>
        filteredGroups[a].countryName.localeCompare(filteredGroups[b].countryName)
    );

    return (
        <aside className={styles.sidebar}>
            {/* Sport Header */}
            <div className={styles.sportHeader}>
                <span className={styles.sportIcon}>{selectedSport.icon}</span>
                <span className={styles.sportTitle}>{selectedSport.name}</span>
            </div>

            {/* Search */}
            <div className={styles.searchContainer}>
                <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                    type="text"
                    placeholder="Buscar torneos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                />
                {searchQuery && (
                    <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Tournament List */}
            <div className={styles.tournamentList}>
                {/* International Section */}
                {filteredInternational.length > 0 && (
                    <div className={styles.section}>
                        <button
                            className={`${styles.sectionHeader} ${expandedCountries.has('international') ? styles.expanded : ''}`}
                            onClick={() => toggleCountry('international')}
                        >
                            <span className={styles.sectionFlag}>🌍</span>
                            <span className={styles.sectionTitle}>Internacional</span>
                            <span className={styles.tournamentCount}>{filteredInternational.length}</span>
                            <svg className={styles.chevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M6 9l6 6 6-6" />
                            </svg>
                        </button>
                        {expandedCountries.has('international') && (
                            <div className={styles.sectionContent}>
                                {filteredInternational.map(tournament => (
                                    <Link
                                        key={tournament.id}
                                        href={`/tournaments/${tournament.id}`}
                                        className={styles.tournamentLink}
                                    >
                                        <span className={styles.tournamentName}>{tournament.name}</span>
                                        {tournament.isWomen && <span className={styles.badge}>W</span>}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Countries */}
                {sortedCountryIds.map(countryId => {
                    const group = filteredGroups[countryId];
                    const isExpanded = expandedCountries.has(countryId);

                    return (
                        <div key={countryId} className={styles.section}>
                            <button
                                className={`${styles.sectionHeader} ${isExpanded ? styles.expanded : ''}`}
                                onClick={() => toggleCountry(countryId)}
                            >
                                <span className={styles.sectionFlag}>{group.flagEmoji}</span>
                                <span className={styles.sectionTitle}>{group.countryName}</span>
                                <span className={styles.tournamentCount}>{group.tournaments.length}</span>
                                <svg className={styles.chevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </button>
                            {isExpanded && (
                                <div className={styles.sectionContent}>
                                    {group.tournaments.map(tournament => (
                                        <Link
                                            key={tournament.id}
                                            href={`/tournaments/${tournament.id}`}
                                            className={styles.tournamentLink}
                                        >
                                            <span className={styles.tournamentName}>{tournament.name}</span>
                                            {tournament.isWomen && <span className={styles.badge}>W</span>}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Empty State */}
                {filteredInternational.length === 0 && sortedCountryIds.length === 0 && (
                    <div className={styles.emptyState}>
                        <span className={styles.emptyIcon}>🔍</span>
                        <span className={styles.emptyText}>No se encontraron torneos</span>
                    </div>
                )}
            </div>

            {/* Stats Footer */}
            <div className={styles.statsFooter}>
                <span>{allTournaments.length} torneos disponibles</span>
            </div>
        </aside>
    );
}
