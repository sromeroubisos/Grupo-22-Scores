'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, ChevronRight, ChevronDown, ChevronUp, Star, Globe } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { useSport } from '@/context/SportContext';
import { getCountryById } from '@/lib/data/countries';
import type { SportId } from '@/lib/types';
import { getCachedLogo } from '@/lib/utils/logoCache';

const TROPHY_FALLBACK = '\u{1F3C6}';
const FLAG_FALLBACK = '\u{1F3F3}\u{FE0F}';

interface DbTournament {
    id: string;
    name: string;
    display_name: string | null;
    country: string | null;
    country_id: string | null;
    sport_id: string | null;
    logo_url: string | null;
    slug: string | null;
}

interface TournamentCountry {
    id: string;
    name: string;
    nameEs?: string;
    code?: string;
    flagEmoji?: string;
}

const TournamentLogo = React.memo(({ tournament }: { tournament: DbTournament }) => {
    const cachedLogo = getCachedLogo(tournament.id);
    const logoSrc = tournament.logo_url || cachedLogo;

    if (!logoSrc) {
        return <div style={{ padding: '6px' }}>{TROPHY_FALLBACK}</div>;
    }

    return (
        <img
            src={logoSrc}
            alt={tournament.name}
            onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '';
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                    const fallback = document.createElement('div');
                    fallback.textContent = TROPHY_FALLBACK;
                    fallback.style.padding = '4px';
                    fallback.style.fontSize = '12px';
                    parent.appendChild(fallback);
                }
            }}
        />
    );
});
TournamentLogo.displayName = 'TournamentLogo';

const CountryFlag = React.memo(({ country }: { country: TournamentCountry }) => {
    if (country.code && country.code.length === 2) {
        const code = country.code.toLowerCase();
        return (
            <div className="g22-countryFlag">
                <img
                    src={`https://flagcdn.com/w20/${code}.png`}
                    srcSet={`https://flagcdn.com/w40/${code}.png 2x`}
                    width="20"
                    height="15"
                    alt={country.name}
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            </div>
        );
    }
    return (
        <div className="g22-countryFlag" style={{ fontSize: '1rem' }}>
            {country.flagEmoji || <Globe size={16} color="#8e8e93" />}
        </div>
    );
});
CountryFlag.displayName = 'CountryFlag';

const TournamentItem = React.memo(({ tournament, isFavorite }: { tournament: DbTournament; isFavorite: boolean }) => (
    <Link href={`/tournaments/${tournament.id}`} className="g22-listItem">
        <div className="g22-listIcon">
            <TournamentLogo tournament={tournament} />
        </div>
        <span className="g22-listLabel">{tournament.display_name || tournament.name}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isFavorite && <Star size={14} fill="#30d158" color="#30d158" />}
            <ChevronRight size={18} color="#444" />
        </div>
    </Link>
));
TournamentItem.displayName = 'TournamentItem';

function normalizeTournamentCountry(tournament: DbTournament): string {
    return (tournament.country_id || tournament.country || '').trim().toLowerCase();
}

const CountryAccordion = React.memo(({
    country,
    tournaments,
    isExpanded,
    onToggle,
}: {
    country: TournamentCountry;
    tournaments: DbTournament[];
    isExpanded: boolean;
    onToggle: (id: string) => void;
}) => (
    <div>
        <div className="g22-countryItem" onClick={() => onToggle(country.id)}>
            <div className="g22-countryName">
                <CountryFlag country={country} />
                <span>{country.nameEs || country.name}</span>
            </div>
            {isExpanded ? <ChevronUp size={18} color="#8e8e93" /> : <ChevronDown size={18} color="#8e8e93" />}
        </div>

        {isExpanded && (
            <div className="g22-countryTournaments">
                <div className="g22-list" style={{ borderTop: 'none' }}>
                    {tournaments.map((t) => (
                        <TournamentItem key={t.id} tournament={t} isFavorite={false} />
                    ))}
                </div>
            </div>
        )}
    </div>
));
CountryAccordion.displayName = 'CountryAccordion';

export default function TorneosPage() {
    const { isLeagueFavorite } = useFavorites();
    const [search, setSearch] = useState('');
    const [selectedSport, setSelectedSport] = useState<SportId>('rugby');
    const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
    const [allTournaments, setAllTournaments] = useState<DbTournament[]>([]);
    const [loadingTournaments, setLoadingTournaments] = useState(false);

    const { activeSports } = useSport();

    // Fetch tournaments from DB whenever selected sport changes
    useEffect(() => {
        const controller = new AbortController();

        const fetchTournaments = async () => {
            setLoadingTournaments(true);
            setAllTournaments([]);

            try {
                const searchParams = new URLSearchParams();
                searchParams.set('sport', selectedSport);

                const response = await fetch(`/api/public/tournaments?${searchParams.toString()}`, {
                    cache: 'no-store',
                    signal: controller.signal,
                });
                const payload = await response.json().catch(() => ({}));

                if (response.ok) {
                    const data = Array.isArray(payload.data) ? payload.data : [];
                    setAllTournaments(data as DbTournament[]);
                }
            } catch (error) {
                if ((error as Error).name !== 'AbortError') {
                    console.error('Error fetching tournaments:', error);
                }
            }

            setLoadingTournaments(false);
        };

        fetchTournaments();

        return () => controller.abort();
    }, [selectedSport]);

    // Filter by search term
    const filteredTournaments = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return allTournaments;
        return allTournaments.filter(t =>
            t.name.toLowerCase().includes(query) ||
            (t.display_name && t.display_name.toLowerCase().includes(query))
        );
    }, [allTournaments, search]);

    // Argentina / popular section
    const recommended = useMemo(() => {
        return filteredTournaments.filter(t =>
            normalizeTournamentCountry(t) === 'argentina'
        );
    }, [filteredTournaments]);

    // Group remaining by country
    const countriesWithTournaments = useMemo(() => {
        const groups: Record<string, DbTournament[]> = {};

        filteredTournaments.forEach(t => {
            // Skip Argentina (shown in recommended)
            if (normalizeTournamentCountry(t) === 'argentina') return;

            const key = t.country_id || t.country || '__sin-pais__';
            if (!groups[key]) groups[key] = [];
            groups[key].push(t);
        });

        return Object.entries(groups)
            .map(([countryKey, tournaments]) => {
                if (countryKey === '__sin-pais__') {
                    return {
                        country: { id: '__sin-pais__', name: 'Sin país', nameEs: 'Sin país', code: '', flagEmoji: FLAG_FALLBACK },
                        tournaments,
                    };
                }
                // Try to resolve via static country data (supports both id and name)
                const resolved = getCountryById(countryKey) ||
                    (tournaments[0]?.country
                        ? { id: countryKey, name: tournaments[0].country, nameEs: tournaments[0].country, code: '', flagEmoji: FLAG_FALLBACK }
                        : { id: countryKey, name: countryKey, nameEs: countryKey, code: '', flagEmoji: FLAG_FALLBACK });
                return { country: resolved, tournaments };
            })
            .sort((a, b) => {
                // 'Sin país' always last
                if (a.country.id === '__sin-pais__') return 1;
                if (b.country.id === '__sin-pais__') return -1;
                return (a.country.nameEs || a.country.name).localeCompare(b.country.nameEs || b.country.name);
            });
    }, [filteredTournaments]);

    const toggleCountry = (id: string) => {
        setExpandedCountry(expandedCountry === id ? null : id);
    };

    return (
        <div className="g22-listPage">
            <header className="g22-listHeader">
                <div className="g22-listHeaderTop">
                    <div className="g22-listSearch">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Buscar en Scores"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="g22-listActionIcon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="7" r="4" stroke="#8e8e93" strokeWidth="2" />
                            <path d="M4 21C4 17.134 7.13401 14 11 14H13C16.866 14 20 17.134 20 21" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" />
                            <circle cx="18" cy="18" r="3" fill="#1c1c1e" stroke="#8e8e93" strokeWidth="1.5" />
                            <path d="M18 17V19M17 18H19" stroke="#8e8e93" strokeWidth="1" strokeLinecap="round" />
                        </svg>
                    </div>
                </div>

                {/* Sport Selector */}
                <div className="g22-sportSelector">
                    {activeSports.map(sport => (
                        <div
                            key={sport.id}
                            className={`g22-sportChip ${selectedSport === sport.id ? 'active' : ''}`}
                            onClick={() => {
                                setSelectedSport(sport.id);
                                setExpandedCountry(null);
                            }}
                            title={sport.nameEs}
                        >
                            <span className="icon">{sport.icon}</span>
                        </div>
                    ))}
                </div>
            </header>

            {loadingTournaments ? (
                <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>
                    <p>Cargando torneos...</p>
                </div>
            ) : (
                <>
                    {/* Recommended / Argentina Section */}
                    {recommended.length > 0 && (
                        <section className="g22-listSection">
                            <div className="g22-listSectionHeader">
                                <h2 className="g22-listSectionTitle">Populares</h2>
                            </div>
                            <div className="g22-list" style={{ borderTop: 'none' }}>
                                {recommended.map((tournament) => (
                                    <TournamentItem
                                        key={tournament.id}
                                        tournament={tournament}
                                        isFavorite={isLeagueFavorite(tournament.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* All Countries */}
                    <section className="g22-listSection">
                        <div className="g22-listSectionHeader">
                            <h2 className="g22-listSectionTitle">Todos los países</h2>
                        </div>

                        {countriesWithTournaments.length === 0 && !loadingTournaments && (
                            <div style={{ padding: '24px 16px', opacity: 0.5 }}>
                                <p>No hay torneos para este deporte.</p>
                            </div>
                        )}

                        {countriesWithTournaments.map(({ country, tournaments }) => (
                            <CountryAccordion
                                key={country.id}
                                country={country}
                                tournaments={tournaments}
                                isExpanded={expandedCountry === country.id}
                                onToggle={toggleCountry}
                            />
                        ))}
                    </section>
                </>
            )}
        </div>
    );
}
