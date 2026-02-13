'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ChevronRight, ChevronDown, ChevronUp, Star, Globe } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { getActiveSports } from '@/lib/data/sports';
import { getTournamentsBySport } from '@/lib/data/tournaments';
import { getCountryById } from '@/lib/data/countries';
import type { SportId, Tournament } from '@/lib/types';
import { getCachedLogo } from '@/lib/utils/logoCache';

const TROPHY_FALLBACK = '\u{1F3C6}';
const FLAG_FALLBACK = '\u{1F3F3}\u{FE0F}';

const TournamentLogo = React.memo(({ tournament }: { tournament: Tournament }) => {
    const cachedLogo = getCachedLogo(tournament.id);
    const logoSrc = tournament.logoUrl || cachedLogo;

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

const CountryFlag = React.memo(({ country }: { country: any }) => {
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

const TournamentItem = React.memo(({ tournament, isFavorite }: { tournament: Tournament; isFavorite: boolean }) => (
    <Link href={`/tournaments/${tournament.id}`} className="g22-listItem">
        <div className="g22-listIcon">
            <TournamentLogo tournament={tournament} />
        </div>
        <span className="g22-listLabel">{tournament.nameEs || tournament.name}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isFavorite && <Star size={14} fill="#30d158" color="#30d158" />}
            <ChevronRight size={18} color="#444" />
        </div>
    </Link>
));

const CountryAccordion = React.memo(({
    country,
    tournaments,
    isExpanded,
    onToggle
}: {
    country: any;
    tournaments: Tournament[];
    isExpanded: boolean;
    onToggle: (id: string) => void;
}) => {
    return (
        <div key={country.id}>
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
    );
});

export default function TorneosPage() {
    const { isLeagueFavorite } = useFavorites();
    const [search, setSearch] = useState('');
    const [selectedSport, setSelectedSport] = useState<SportId>('rugby');
    const [expandedCountry, setExpandedCountry] = useState<string | null>(null);

    const activeSports = getActiveSports();

    // Get all tournaments for the selected sport
    const allTournaments = useMemo(() => {
        return getTournamentsBySport(selectedSport);
    }, [selectedSport]);

    // Filtering logic
    const filteredTournaments = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return allTournaments;
        return allTournaments.filter(t =>
            t.name.toLowerCase().includes(query) ||
            (t.nameEs && t.nameEs.toLowerCase().includes(query))
        );
    }, [allTournaments, search]);

    // Recommended (Argentina)
    const recommended = useMemo(() => {
        return filteredTournaments.filter(t => t.countryId === 'argentina');
    }, [filteredTournaments]);

    // Grouping by country
    const countriesWithTournaments = useMemo(() => {
        const groups: Record<string, Tournament[]> = {};
        filteredTournaments.forEach(t => {
            if (t.countryId === 'argentina') return; // Already in recommended
            if (!groups[t.countryId]) groups[t.countryId] = [];
            groups[t.countryId].push(t);
        });

        return Object.entries(groups)
            .map(([countryId, tournaments]) => ({
                country: getCountryById(countryId) || { id: countryId, name: countryId, nameEs: countryId, flagEmoji: FLAG_FALLBACK },
                tournaments: tournaments.sort((a, b) => b.priority - a.priority)
            }))
            .sort((a, b) => (a.country.nameEs || a.country.name).localeCompare(b.country.nameEs || b.country.name));
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

            {/* Recommended Section */}
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

            {/* All Countries List */}
            <section className="g22-listSection">
                <div className="g22-listSectionHeader">
                    <h2 className="g22-listSectionTitle">Todos los países</h2>
                </div>

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
        </div>
    );
}


