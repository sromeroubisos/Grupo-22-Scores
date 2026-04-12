'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import pageStyles from '../page.module.css';
import { useSport } from '@/context/SportContext';
import { getTournamentsBySport, getInternationalTournamentsBySport } from '@/lib/data/tournaments';
import { findCountryRecord, getAllCountries, resolveCountryId } from '@/lib/data/countries';
import type { Tournament } from '@/lib/types';
import { useFavorites } from '@/hooks/useFavorites';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { resolveTournamentAudience, type TournamentAudience } from '@/lib/utils/tournamentAudience';
import { compareTournamentsByPriority } from '@/lib/utils/tournamentOrdering';

type TournamentCountryGroup = {
    countryName: string;
    flagEmoji: string;
    tournaments: Tournament[];
    externalCountryId?: string | null;
    tournamentCount?: number | null;
    loading?: boolean;
    loaded?: boolean;
    error?: string | null;
};

type RugbyPublicCountrySummary = {
    id: string;
    external_country_id: string;
    name: string;
    flag?: string | null;
    tournament_count?: number | null;
    type: 'country';
};

type RugbyCountryGroupState = {
    externalCountryId: string;
    countryName: string;
    flagEmoji: string;
    tournaments: Tournament[];
    tournamentCount?: number | null;
    loading: boolean;
    loaded: boolean;
    error: string | null;
};

type PublicTournamentListItem = {
    id: string;
    name: string;
    display_name?: string | null;
    country?: string | null;
    country_id?: string | null;
    sport_id?: string | null;
    logo_url?: string | null;
    priority?: number | null;
    type?: string | null;
    url?: string | null;
    seasons?: Array<{
        seasonId?: string | null;
        season?: string | number | null;
        year?: number | null;
        startDate?: string | null;
        endDate?: string | null;
        teamsCount?: number | null;
        isActive?: boolean | null;
        current?: boolean | null;
    }> | null;
};

type ManualTournamentApiItem = {
    id: string;
    name: string;
    display_name?: string | null;
    sport_id?: string | null;
    country?: string | null;
    country_id?: string | null;
    priority?: number | null;
    logo_url?: string | null;
    category?: string | null;
    season_id?: string | number | null;
    is_visible?: boolean | null;
    age_grade?: string | null;
    format?: Tournament['format'] | null;
};

const ALL_COUNTRIES = getAllCountries();

function extractRegionFromLocale(locale: string): string | null {
    const safeLocale = locale.trim();
    if (!safeLocale) {
        return null;
    }

    try {
        if (typeof Intl !== 'undefined' && 'Locale' in Intl) {
            const intlLocale = new Intl.Locale(safeLocale);
            if (intlLocale.region) {
                return intlLocale.region.toUpperCase();
            }
        }
    } catch {
        // Ignore malformed locale strings and keep the fallback parser below.
    }

    const [, ...rest] = safeLocale.split(/[-_]/);
    const region = rest.find((part) => /^[A-Za-z]{2}$/.test(part));
    return region ? region.toUpperCase() : null;
}

function resolveCountryIdFromLocale(locale: string): string | null {
    const region = extractRegionFromLocale(locale);
    if (!region) {
        return null;
    }

    return ALL_COUNTRIES.find((country) => country.code.toUpperCase() === region)?.id || null;
}

function normalizeLookupValue(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value)
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function CountryFlag({
    countryId,
    countryName,
    fallbackEmoji,
}: {
    countryId?: string | null;
    countryName?: string | null;
    fallbackEmoji?: string | null;
}) {
    const [imageError, setImageError] = useState(false);

    const country = findCountryRecord(countryId, countryName);
    const code = country?.code?.toUpperCase() || '';
    const canUseFlagApi = /^[A-Z]{2}$/.test(code) && !imageError;

    if (!canUseFlagApi) {
        return (
            <span
                aria-hidden="true"
                style={{
                    width: 20,
                    minWidth: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    lineHeight: 1,
                }}
            >
                {fallbackEmoji || country?.flagEmoji || '🌐'}
            </span>
        );
    }

    const codeLower = code.toLowerCase();

    return (
        <span
            aria-hidden="true"
            style={{
                width: 20,
                minWidth: 20,
                height: 15,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: 3,
                background: 'rgba(255,255,255,0.06)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset',
            }}
        >
            <img
                src={`https://flagcdn.com/w20/${codeLower}.png`}
                srcSet={`https://flagcdn.com/w40/${codeLower}.png 2x`}
                width="20"
                height="15"
                alt=""
                loading="lazy"
                onError={() => setImageError(true)}
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
            />
        </span>
    );
}

function groupTournamentsByCountry(tournaments: Tournament[]) {
    const groups: Record<string, TournamentCountryGroup> = {};

    tournaments.forEach((tournament) => {
        const safeCountryId = tournament.countryId || 'international';
        const country = findCountryRecord(safeCountryId);
        const countryName = country?.name || safeCountryId;
        const flagEmoji = country?.flagEmoji || '';

        if (!groups[safeCountryId]) {
            groups[safeCountryId] = { countryName, flagEmoji, tournaments: [] };
        }

        groups[safeCountryId].tournaments.push(tournament);
    });

    Object.values(groups).forEach((group) => {
        group.tournaments.sort(compareTournamentsByPriority);
    });

    return groups;
}

function isFlashScoreTournamentId(value: string): boolean {
    return /^fs-/i.test(value);
}

function buildTournamentHref(tournamentId: string, sourceUrl?: string | null, sportId?: string | null, name?: string | null): string {
    const baseHref = `/tournaments/${tournamentId}`;
    const normalizedSourceUrl = String(sourceUrl || '').trim();

    if (!isFlashScoreTournamentId(tournamentId) || !normalizedSourceUrl) {
        return baseHref;
    }

    const query = new URLSearchParams();
    query.set('sport', sportId || 'rugby');
    query.set('url', normalizedSourceUrl);
    if (name) query.set('name', name);

    return `${baseHref}?${query.toString()}`;
}

function appendTournamentSeasonHref(baseHref: string, seasonId: string): string {
    return `${baseHref}${baseHref.includes('?') ? '&' : '?'}season=${encodeURIComponent(seasonId)}`;
}

function getTournamentHref(tournament: Pick<Tournament, 'id' | 'url'>): string {
    return tournament.url || `/tournaments/${tournament.id}`;
}

function mapPublicTournamentToTournament(item: PublicTournamentListItem): Tournament {
    const countryId = String(item.country_id || 'international').trim().toLowerCase() || 'international';
    const sportId = (item.sport_id || 'rugby') as Tournament['sportId'];
    const displayName = item.display_name || item.name;
    const type: Tournament['type'] = item.type === 'cup'
        ? 'cup'
        : countryId === 'international'
            ? 'international'
            : 'local';

    const seasons = Array.isArray(item.seasons)
        ? item.seasons
            .map((season) => {
                const seasonId = season?.seasonId ?? season?.season;
                if (seasonId === null || seasonId === undefined || seasonId === '') return null;

                return {
                    seasonId: String(seasonId),
                    year: typeof season?.year === 'number' ? season.year : undefined,
                    startDate: season?.startDate || undefined,
                    endDate: season?.endDate || undefined,
                    teamsCount: typeof season?.teamsCount === 'number' ? season.teamsCount : 0,
                    isActive: season?.isActive === true || season?.current === true,
                };
            })
            .filter((season): season is Exclude<typeof season, null> => season !== null)
        : [];

    return {
        id: item.id,
        name: displayName,
        displayName,
        originalName: item.name,
        nameEs: displayName,
        url: buildTournamentHref(item.id, item.url, sportId, displayName),
        type,
        sportId,
        countryId,
        priority: typeof item.priority === 'number' ? item.priority : 0,
        logoUrl: item.logo_url || null,
        categories: [],
        seasons,
        isApiManaged: true,
        dataSource: isFlashScoreTournamentId(item.id) ? 'flashscore' : 'local-db',
    };
}

export default function TorneosPage() {
    const { selectedSport, setSelectedSport, activeSports } = useSport();
    const { favoriteSportIds } = useUserPreferences();
    const { isLeagueFavorite } = useFavorites();

    const [manualTournamentsList, setManualTournamentsList] = useState<Tournament[]>([]);
    const [rugbyCountrySummaries, setRugbyCountrySummaries] = useState<RugbyPublicCountrySummary[]>([]);
    const [rugbyCountryGroups, setRugbyCountryGroups] = useState<Record<string, RugbyCountryGroupState>>({});
    const [rugbyPublicCatalogReady, setRugbyPublicCatalogReady] = useState(false);
    const [selectedAudience, setSelectedAudience] = useState<TournamentAudience>('mayores');
    const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set(['international']));
    const [expandedLeagueIds, setExpandedLeagueIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [isSportMenuOpen, setIsSportMenuOpen] = useState(false);
    const [userCountryId, setUserCountryId] = useState<string | null>(null);

    const sortedActiveSports = useMemo(() => {
        if (favoriteSportIds.length === 0) return activeSports;

        return [...activeSports].sort((left, right) => {
            const leftFavorite = favoriteSportIds.includes(left.id);
            const rightFavorite = favoriteSportIds.includes(right.id);

            if (leftFavorite && !rightFavorite) return -1;
            if (!leftFavorite && rightFavorite) return 1;
            return 0;
        });
    }, [activeSports, favoriteSportIds]);

    const allTournaments = useMemo(() => getTournamentsBySport(selectedSport.id), [selectedSport.id]);
    const internationalTournaments = useMemo(() => getInternationalTournamentsBySport(selectedSport.id), [selectedSport.id]);
    const loadedRugbyPublicTournaments = useMemo(
        () => Object.values(rugbyCountryGroups).flatMap((group) => group.tournaments),
        [rugbyCountryGroups],
    );
    const hasRugbyPublicCatalog = selectedSport.id === 'rugby' && rugbyPublicCatalogReady;

    const searchTerm = normalizeLookupValue(searchQuery);

    const localTournaments = useMemo(() => {
        const sportManualTournaments = manualTournamentsList.filter((tournament) => tournament.sportId === selectedSport.id);
        const externalRugbyTournaments = selectedSport.id === 'rugby' ? loadedRugbyPublicTournaments : [];
        const combined = [...sportManualTournaments, ...allTournaments, ...externalRugbyTournaments];

        return combined.filter((tournament) => {
            if (tournament.type !== 'local' && tournament.type !== 'cup') {
                return false;
            }

            return resolveTournamentAudience({
                ageGroup: tournament.ageGroup,
                categories: tournament.categories,
                isYouth: tournament.isYouth,
                name: tournament.name,
                displayName: tournament.displayName || tournament.nameEs,
                originalName: tournament.originalName,
            }) === selectedAudience;
        });
    }, [allTournaments, loadedRugbyPublicTournaments, manualTournamentsList, selectedAudience, selectedSport.id]);

    const recommendedCatalog = useMemo(() => {
        const unique = new Map<string, Tournament>();
        const combined = [
            ...manualTournamentsList.filter((tournament) => tournament.sportId === selectedSport.id),
            ...allTournaments,
            ...internationalTournaments,
            ...loadedRugbyPublicTournaments,
        ];

        combined.forEach((tournament) => {
            if (resolveTournamentAudience({
                ageGroup: tournament.ageGroup,
                categories: tournament.categories,
                isYouth: tournament.isYouth,
                name: tournament.name,
                displayName: tournament.displayName || tournament.nameEs,
                originalName: tournament.originalName,
            }) !== selectedAudience) {
                return;
            }

            if (searchTerm) {
                const countryName = findCountryRecord(tournament.countryId)?.nameEs || findCountryRecord(tournament.countryId)?.name || '';
                const haystack = [
                    tournament.name,
                    tournament.displayName,
                    tournament.nameEs,
                    tournament.originalName,
                    countryName,
                ]
                    .map((value) => normalizeLookupValue(value))
                    .join(' ');

                if (!haystack.includes(searchTerm)) {
                    return;
                }
            }

            if (!unique.has(tournament.id)) {
                unique.set(tournament.id, tournament);
            }
        });

        return [...unique.values()];
    }, [
        allTournaments,
        internationalTournaments,
        loadedRugbyPublicTournaments,
        manualTournamentsList,
        searchTerm,
        selectedAudience,
        selectedSport.id,
    ]);

    const groupedTournaments = useMemo(() => {
        const grouped = groupTournamentsByCountry(localTournaments);

        if (!hasRugbyPublicCatalog) {
            return grouped;
        }

        const merged: Record<string, TournamentCountryGroup> = { ...grouped };

        rugbyCountrySummaries.forEach((summary) => {
            const existing = merged[summary.id];
            const state = rugbyCountryGroups[summary.id];

            merged[summary.id] = {
                countryName: summary.name,
                flagEmoji: summary.flag || existing?.flagEmoji || '',
                tournaments: existing?.tournaments || state?.tournaments || [],
                externalCountryId: summary.external_country_id,
                tournamentCount: state?.tournamentCount ?? summary.tournament_count ?? existing?.tournamentCount ?? null,
                loading: state?.loading ?? false,
                loaded: state?.loaded ?? false,
                error: state?.error ?? null,
            };
        });

        return merged;
    }, [hasRugbyPublicCatalog, localTournaments, rugbyCountryGroups, rugbyCountrySummaries]);

    const filteredInternational = useMemo(() => {
        const audienceFiltered = internationalTournaments.filter((tournament) => (
            resolveTournamentAudience({
                ageGroup: tournament.ageGroup,
                categories: tournament.categories,
                isYouth: tournament.isYouth,
                name: tournament.name,
                displayName: tournament.displayName || tournament.nameEs,
                originalName: tournament.originalName,
            }) === selectedAudience
        ));

        if (!searchQuery) return audienceFiltered.slice(0, 10);

        return audienceFiltered.filter((tournament) =>
            normalizeLookupValue(tournament.name).includes(searchTerm),
        );
    }, [internationalTournaments, searchQuery, searchTerm, selectedAudience]);

    const filteredGroups = useMemo(() => {
        if (!searchQuery) return groupedTournaments;

        const filtered: typeof groupedTournaments = {};
        Object.entries(groupedTournaments).forEach(([countryId, group]) => {
            const normalizedCountryName = normalizeLookupValue(group.countryName);
            const matchingTournaments = group.tournaments.filter((tournament) =>
                normalizeLookupValue(tournament.name).includes(searchTerm) ||
                normalizedCountryName.includes(searchTerm),
            );
            const matchesCountry = normalizedCountryName.includes(searchTerm);

            if (matchingTournaments.length > 0 || matchesCountry) {
                filtered[countryId] = {
                    ...group,
                    tournaments: matchesCountry ? group.tournaments : matchingTournaments,
                };
            }
        });

        return filtered;
    }, [groupedTournaments, searchQuery, searchTerm]);

    const compareSidebarTournaments = useCallback((left: Tournament, right: Tournament) => {
        const leftFavorite = isLeagueFavorite(left.id);
        const rightFavorite = isLeagueFavorite(right.id);

        if (leftFavorite && !rightFavorite) return -1;
        if (!leftFavorite && rightFavorite) return 1;

        if (hasRugbyPublicCatalog) {
            const leftIsLocal = left.dataSource !== 'flashscore';
            const rightIsLocal = right.dataSource !== 'flashscore';

            if (leftIsLocal && !rightIsLocal) return -1;
            if (!leftIsLocal && rightIsLocal) return 1;
        }

        return compareTournamentsByPriority(left, right);
    }, [hasRugbyPublicCatalog, isLeagueFavorite]);

    const recommendedTournaments = useMemo(() => {
        const recommended = new Map<string, Tournament>();

        recommendedCatalog
            .filter((tournament) => isLeagueFavorite(tournament.id))
            .sort(compareSidebarTournaments)
            .forEach((tournament) => {
                recommended.set(tournament.id, tournament);
            });

        if (userCountryId) {
            recommendedCatalog
                .filter((tournament) => (
                    normalizeLookupValue(tournament.countryId) === userCountryId &&
                    !recommended.has(tournament.id)
                ))
                .sort(compareSidebarTournaments)
                .forEach((tournament) => {
                    recommended.set(tournament.id, tournament);
                });
        }

        return [...recommended.values()].slice(0, 8);
    }, [compareSidebarTournaments, isLeagueFavorite, recommendedCatalog, userCountryId]);

    const loadRugbyCountryTournaments = useCallback(async (countryId: string) => {
        if (!hasRugbyPublicCatalog || countryId === 'international') {
            return;
        }

        const group = groupedTournaments[countryId];
        if (!group?.externalCountryId || group.loading || group.loaded) {
            return;
        }

        setRugbyCountryGroups((prev) => ({
            ...prev,
            [countryId]: {
                externalCountryId: group.externalCountryId || '',
                countryName: group.countryName,
                flagEmoji: group.flagEmoji,
                tournaments: prev[countryId]?.tournaments || [],
                tournamentCount: prev[countryId]?.tournamentCount ?? group.tournamentCount ?? null,
                loading: true,
                loaded: false,
                error: null,
            },
        }));

        try {
            const searchParams = new URLSearchParams({
                sport: 'rugby',
                scope: 'country',
                audience: selectedAudience,
                external_country_id: group.externalCountryId,
                country_name: group.countryName,
            });

            if (group.flagEmoji) {
                searchParams.set('country_flag', group.flagEmoji);
            }

            const response = await fetch(`/api/public/tournaments?${searchParams.toString()}`, {
                cache: 'force-cache',
            });
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(payload.error || `HTTP ${response.status}`);
            }

            const data = Array.isArray(payload.data) ? payload.data as PublicTournamentListItem[] : [];
            const tournaments = data.map((item) => mapPublicTournamentToTournament(item));

            setRugbyCountryGroups((prev) => ({
                ...prev,
                [countryId]: {
                    externalCountryId: group.externalCountryId || '',
                    countryName: group.countryName,
                    flagEmoji: group.flagEmoji,
                    tournaments,
                    tournamentCount: tournaments.length,
                    loading: false,
                    loaded: true,
                    error: null,
                },
            }));
        } catch (error) {
            console.error('Error fetching rugby country tournaments:', error instanceof Error ? error.message : 'Unknown error');

            setRugbyCountryGroups((prev) => ({
                ...prev,
                [countryId]: {
                    externalCountryId: group.externalCountryId || '',
                    countryName: group.countryName,
                    flagEmoji: group.flagEmoji,
                    tournaments: prev[countryId]?.tournaments || [],
                    tournamentCount: prev[countryId]?.tournamentCount ?? group.tournamentCount ?? null,
                    loading: false,
                    loaded: false,
                    error: 'No se pudieron cargar las ligas.',
                },
            }));
        }
    }, [groupedTournaments, hasRugbyPublicCatalog, selectedAudience]);

    const toggleCountry = useCallback((countryId: string) => {
        setExpandedCountries((prev) => {
            const next = new Set(prev);
            if (next.has(countryId)) {
                next.delete(countryId);
            } else {
                next.add(countryId);
            }
            return next;
        });
    }, []);

    const toggleLeague = useCallback((leagueId: string) => {
        setExpandedLeagueIds((prev) => {
            const next = new Set(prev);
            if (next.has(leagueId)) next.delete(leagueId);
            else next.add(leagueId);
            return next;
        });
    }, []);

    const sortedCountryIds = Object.keys(filteredGroups).sort((left, right) =>
        filteredGroups[left].countryName.localeCompare(filteredGroups[right].countryName),
    );

    const getCountryTournamentCount = useCallback((group: TournamentCountryGroup) => {
        if (typeof group.tournamentCount === 'number') {
            return group.tournamentCount;
        }

        if (group.loaded || !group.externalCountryId) {
            return group.tournaments.length;
        }

        return null;
    }, []);

    useEffect(() => {
        if (typeof navigator === 'undefined') {
            return;
        }

        const locales = Array.from(new Set([...(navigator.languages || []), navigator.language].filter(Boolean)));

        for (const locale of locales) {
            const resolvedCountryId = resolveCountryIdFromLocale(locale);
            if (resolvedCountryId) {
                setUserCountryId(resolvedCountryId);
                return;
            }
        }

        setUserCountryId(null);
    }, []);

    useEffect(() => {
        async function fetchManualTournaments() {
            try {
                const response = await fetch('/api/home/manual-tournaments', { cache: 'default' });
                const payload = await response.json().catch(() => ({}));

                if (!response.ok) {
                    console.error('Error fetching manual tournaments:', payload.error || `HTTP ${response.status}`);
                    return;
                }

                const data = Array.isArray(payload.data) ? payload.data as ManualTournamentApiItem[] : [];
                const mapped: Tournament[] = data.map((tournament) => ({
                    id: tournament.id,
                    name: tournament.display_name || tournament.name,
                    nameEs: tournament.display_name || tournament.name,
                    url: `/tournaments/${tournament.id}`,
                    type: 'local',
                    sportId: tournament.sport_id as Tournament['sportId'],
                    countryId: resolveCountryId(tournament.country_id, tournament.country),
                    priority: typeof tournament.priority === 'number' ? tournament.priority : 0,
                    logoUrl: tournament.logo_url || null,
                    categories: tournament.category ? [tournament.category.toLowerCase()] : [],
                    seasons: tournament.season_id
                        ? [{ seasonId: String(tournament.season_id), teamsCount: 0, isActive: true }]
                        : [],
                    isVisible: tournament.is_visible ?? undefined,
                    isWomen: tournament.category?.toLowerCase() === 'women',
                    isYouth: resolveTournamentAudience({
                        ageGrade: tournament.age_grade,
                        category: tournament.category,
                    }) === 'juveniles',
                    ageGroup: tournament.age_grade || undefined,
                    format: tournament.format || undefined,
                }));
                setManualTournamentsList(mapped);
            } catch (error) {
                console.error('Error fetching manual tournaments:', error instanceof Error ? error.message : 'Unknown error');
            }
        }

        void fetchManualTournaments();
    }, []);

    useEffect(() => {
        if (selectedSport.id !== 'rugby') {
            setRugbyCountrySummaries([]);
            setRugbyCountryGroups({});
            setRugbyPublicCatalogReady(false);
            return;
        }

        const controller = new AbortController();

        async function fetchRugbyCountrySummaries() {
            try {
                const searchParams = new URLSearchParams({
                    sport: 'rugby',
                    scope: 'summary',
                });

                const response = await fetch(`/api/public/tournaments?${searchParams.toString()}`, {
                    cache: 'force-cache',
                    signal: controller.signal,
                });
                const payload = await response.json().catch(() => ({}));

                if (!response.ok) {
                    console.error('Error fetching rugby country summaries:', payload.error || `HTTP ${response.status}`);
                    setRugbyCountrySummaries([]);
                    setRugbyCountryGroups({});
                    setRugbyPublicCatalogReady(false);
                    return;
                }

                const countries = Array.isArray(payload.data?.countries)
                    ? payload.data.countries as RugbyPublicCountrySummary[]
                    : [];

                setRugbyCountrySummaries(countries);
                setRugbyPublicCatalogReady(true);
            } catch (error) {
                if ((error as Error).name === 'AbortError') {
                    return;
                }

                console.error('Error fetching rugby country summaries:', error instanceof Error ? error.message : 'Unknown error');
                setRugbyCountrySummaries([]);
                setRugbyCountryGroups({});
                setRugbyPublicCatalogReady(false);
            }
        }

        setRugbyPublicCatalogReady(false);
        void fetchRugbyCountrySummaries();

        return () => controller.abort();
    }, [selectedSport.id]);

    useEffect(() => {
        if (selectedSport.id === 'rugby') {
            setRugbyCountryGroups({});
        }
    }, [selectedAudience, selectedSport.id]);

    useEffect(() => {
        setExpandedCountries(new Set(selectedAudience === 'mayores' ? ['international'] : []));
        setExpandedLeagueIds(new Set());
    }, [selectedAudience]);

    useEffect(() => {
        setIsSportMenuOpen(false);
    }, [selectedSport.id]);

    useEffect(() => {
        if (!hasRugbyPublicCatalog) {
            return;
        }

        expandedCountries.forEach((countryId) => {
            if (countryId !== 'international') {
                void loadRugbyCountryTournaments(countryId);
            }
        });
    }, [expandedCountries, hasRugbyPublicCatalog, loadRugbyCountryTournaments]);

    return (
        <div
            style={{
                minHeight: '100vh',
                padding: '16px 16px calc(var(--mobile-nav-height) + 24px + env(safe-area-inset-bottom))',
            }}
        >
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
                <div className={pageStyles.sidebarUnifiedCard}>
                    <div className={pageStyles.sportSwitch}>
                        <button
                            type="button"
                            className={pageStyles.sportSwitchBtn}
                            onClick={() => setIsSportMenuOpen((prev) => !prev)}
                            aria-expanded={isSportMenuOpen}
                        >
                            <div className={pageStyles.sportSwitchIcon}>{selectedSport.icon}</div>
                            <div className={pageStyles.sportSwitchLabel}>
                                <span className={pageStyles.sportSwitchName}>{selectedSport.nameEs}</span>
                                <span className={pageStyles.sportSwitchHint}>Deporte activo</span>
                            </div>
                            <svg
                                className={pageStyles.sportSwitchChevron}
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M6 9l6 6 6-6" />
                            </svg>
                        </button>

                        <div className={`${pageStyles.sportMenu} ${isSportMenuOpen ? pageStyles.sportMenuOpen : ''}`}>
                            {sortedActiveSports.map((sport) => (
                                <div
                                    key={sport.id}
                                    className={`${pageStyles.sportMenuItem} ${selectedSport.id === sport.id ? pageStyles.sportMenuItemActive : ''}`}
                                    onClick={() => {
                                        setSelectedSport(sport);
                                        setIsSportMenuOpen(false);
                                    }}
                                >
                                    <span>{sport.icon}</span>
                                    <span>{sport.nameEs}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={pageStyles.audienceSwitch} role="tablist" aria-label="Segmento de torneos">
                        {(['mayores', 'juveniles'] as TournamentAudience[]).map((audience) => (
                            <button
                                key={audience}
                                type="button"
                                className={`${pageStyles.audienceSwitchBtn} ${selectedAudience === audience ? pageStyles.audienceSwitchBtnActive : ''}`}
                                onClick={() => setSelectedAudience(audience)}
                            >
                                {audience === 'mayores' ? 'Mayores' : 'Juveniles'}
                            </button>
                        ))}
                    </div>

                    <div className={pageStyles.sidebarSearchArea}>
                        <svg
                            className={pageStyles.sidebarSearchIcon}
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                        </svg>
                        <input
                            type="text"
                            placeholder={selectedAudience === 'juveniles'
                                ? `Filtrar juveniles de ${selectedSport.nameEs}...`
                                : selectedSport.id === 'tennis'
                                    ? `Filtrar torneos de ${selectedSport.nameEs}...`
                                    : `Filtrar ligas de ${selectedSport.nameEs}...`}
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            className={pageStyles.sidebarSearchInput}
                        />
                    </div>

                    {recommendedTournaments.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                            <div className={pageStyles.sidebarSectionTitle} style={{ height: 'auto', marginBottom: '8px' }}>
                                Recomendados
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {recommendedTournaments.map((tournament) => (
                                    <Link
                                        key={tournament.id}
                                        href={getTournamentHref(tournament)}
                                        className={pageStyles.accordionItemLink}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            paddingLeft: '16px',
                                            background: 'rgba(255,255,255,0.02)',
                                            borderRadius: '10px',
                                        }}
                                    >
                                        {isLeagueFavorite(tournament.id) && (
                                            <Star size={11} fill="currentColor" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                                        )}
                                        <span>{tournament.name}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className={pageStyles.accordionList}>
                        {filteredInternational.length > 0 && (
                            <div className={pageStyles.accordionItem}>
                                <button
                                    type="button"
                                    onClick={() => toggleCountry('international')}
                                    className={`${pageStyles.accordionHeader} ${expandedCountries.has('international') ? pageStyles.active : ''}`}
                                >
                                    <div className={pageStyles.accordionHeaderContent}>
                                        <span></span>
                                        <span>{`Internacional (${filteredInternational.length})`}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <svg
                                            className={pageStyles.chevron}
                                            style={{ transform: expandedCountries.has('international') ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M6 9l6 6 6-6" />
                                        </svg>
                                    </div>
                                </button>

                                <div className={`${pageStyles.accordionContent} ${expandedCountries.has('international') ? pageStyles.open : ''}`}>
                                    {filteredInternational
                                        .slice()
                                        .sort(compareSidebarTournaments)
                                        .map((tournament) => (
                                            <Link
                                                key={tournament.id}
                                                href={getTournamentHref(tournament)}
                                                className={pageStyles.accordionItemLink}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                            >
                                                {isLeagueFavorite(tournament.id) && (
                                                    <Star size={11} fill="currentColor" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                                                )}
                                                <span>{tournament.name}</span>
                                            </Link>
                                        ))}
                                </div>
                            </div>
                        )}

                        {sortedCountryIds.map((countryId) => {
                            const group = filteredGroups[countryId];
                            const isExpanded = expandedCountries.has(countryId);
                            const countryTournamentCount = getCountryTournamentCount(group);

                            return (
                                <div key={countryId} className={pageStyles.accordionItem}>
                                    <button
                                        type="button"
                                        onClick={() => toggleCountry(countryId)}
                                        className={`${pageStyles.accordionHeader} ${isExpanded ? pageStyles.active : ''}`}
                                    >
                                        <div className={pageStyles.accordionHeaderContent}>
                                            <CountryFlag
                                                countryId={countryId}
                                                countryName={group.countryName}
                                                fallbackEmoji={group.flagEmoji}
                                            />
                                            <span>
                                                {countryTournamentCount === null
                                                    ? group.countryName
                                                    : `${group.countryName} (${countryTournamentCount})`}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <svg
                                                className={pageStyles.chevron}
                                                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                                width="16"
                                                height="16"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                            >
                                                <path d="M6 9l6 6 6-6" />
                                            </svg>
                                        </div>
                                    </button>

                                    <div className={`${pageStyles.accordionContent} ${isExpanded ? pageStyles.open : ''}`}>
                                        {group.loading && group.tournaments.length === 0 && (
                                            <div className={pageStyles.audienceEmptyState}>Cargando ligas...</div>
                                        )}
                                        {!group.loading && group.error && group.tournaments.length === 0 && (
                                            <div className={pageStyles.audienceEmptyState}>{group.error}</div>
                                        )}
                                        {!group.loading && group.tournaments
                                            .slice()
                                            .sort(compareSidebarTournaments)
                                            .map((tournament) => {
                                                const hasSubItems = Boolean(tournament.seasons && tournament.seasons.length > 0);
                                                const isLeagueExpanded = expandedLeagueIds.has(tournament.id);
                                                const isFavLeague = isLeagueFavorite(tournament.id);

                                                if (hasSubItems) {
                                                    return (
                                                        <div key={tournament.id} className={pageStyles.accordionItemLinkWrapper}>
                                                            <div
                                                                className={`${pageStyles.accordionItemHeader} ${isLeagueExpanded ? pageStyles.active : ''}`}
                                                                style={{ display: 'flex', alignItems: 'center', padding: 0, width: '100%' }}
                                                            >
                                                                <Link
                                                                    href={getTournamentHref(tournament)}
                                                                    style={{
                                                                        flex: 1,
                                                                        padding: '10px 16px',
                                                                        color: 'inherit',
                                                                        textDecoration: 'none',
                                                                        textAlign: 'left',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '6px',
                                                                    }}
                                                                >
                                                                    {isFavLeague && (
                                                                        <Star size={11} fill="currentColor" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                                                                    )}
                                                                    {tournament.name}
                                                                </Link>
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => {
                                                                        event.preventDefault();
                                                                        event.stopPropagation();
                                                                        toggleLeague(tournament.id);
                                                                    }}
                                                                    style={{
                                                                        padding: '10px 16px',
                                                                        background: 'transparent',
                                                                        border: 'none',
                                                                        cursor: 'pointer',
                                                                        color: 'inherit',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                    }}
                                                                >
                                                                    <svg
                                                                        className={pageStyles.chevron}
                                                                        width="14"
                                                                        height="14"
                                                                        viewBox="0 0 24 24"
                                                                        fill="none"
                                                                        stroke="currentColor"
                                                                        strokeWidth="2"
                                                                        style={{ transform: isLeagueExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                                                    >
                                                                        <path d="M9 18l6-6-6-6" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                            <div className={`${pageStyles.accordionItemContent} ${isLeagueExpanded ? pageStyles.open : ''}`}>
                                                                {tournament.seasons!.map((season) => (
                                                                    <Link
                                                                        key={season.seasonId}
                                                                        href={appendTournamentSeasonHref(getTournamentHref(tournament), season.seasonId)}
                                                                        className={pageStyles.accordionSubItemLink}
                                                                    >
                                                                        Temporada {season.seasonId}
                                                                    </Link>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <Link
                                                        key={tournament.id}
                                                        href={getTournamentHref(tournament)}
                                                        className={pageStyles.accordionItemLink}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                                    >
                                                        {isFavLeague && (
                                                            <Star size={11} fill="currentColor" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                                                        )}
                                                        <span>{tournament.name}</span>
                                                    </Link>
                                                );
                                            })}
                                    </div>
                                </div>
                            );
                        })}

                        {filteredInternational.length === 0 && sortedCountryIds.length === 0 && (
                            <div className={pageStyles.audienceEmptyState}>
                                {selectedAudience === 'juveniles'
                                    ? 'No hay torneos juveniles cargados para este deporte.'
                                    : 'No hay torneos disponibles para este deporte.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
