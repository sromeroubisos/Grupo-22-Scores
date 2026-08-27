'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import pageStyles from '../page.module.css';
import { useSport } from '@/context/SportContext';
import { getTournamentsBySport, getInternationalTournamentsBySport } from '@/lib/data/tournaments';
import { buildEspnFootballTournaments, getEspnFootballInternationalTournaments } from '@/lib/data/tournaments/espnFootballCatalog';
import { findCountryRecord, getAllCountries, resolveCountryId } from '@/lib/data/countries';
import type { Tournament } from '@/lib/types';
import TournamentSeasonTag from '@/components/TournamentSeasonTag';
import CountryFlag from '@/components/CountryFlag';
import { useFavorites } from '@/hooks/useFavorites';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { AUDIENCE_LABELS, matchesTournamentAudience, resolveTournamentAudience, type TournamentAudience } from '@/lib/utils/tournamentAudience';
import { compareTournamentsByPriority } from '@/lib/utils/tournamentOrdering';
import { readCachedLeagueCatalog, writeCachedLeagueCatalog } from '@/lib/utils/leagueCatalogStorage';

type TournamentCountryGroup = {
    countryName: string;
    flagEmoji: string;
    tournaments: Tournament[];
    externalCountryId?: string | null;
    tournamentCount?: number | null;
    loading?: boolean;
    loaded?: boolean;
    error?: string | null;
    externalUnavailable?: boolean;
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
    externalUnavailable?: boolean;
};

type PublicTournamentListItem = {
    id: string;
    name: string;
    display_name?: string | null;
    country?: string | null;
    country_id?: string | null;
    external_country_id?: string | null;
    sport_id?: string | null;
    logo_url?: string | null;
    priority?: number | null;
    type?: string | null;
    url?: string | null;
    /** La temporada de esta edición. Null en los torneos del catálogo externo. */
    season_id?: string | null;
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

// Rugby se guarda con tres sport_id y los tres son el mismo deporte en pantalla.
// Comparar con `===` hacia desaparecer del listado cualquier fila cargada como
// 'rugby-union' o 'rugby-league'.
const RUGBY_SPORT_IDS = ['rugby', 'rugby-union', 'rugby-league'];

function belongsToSport(tournamentSportId: unknown, selectedSportId: string): boolean {
    const sportId = String(tournamentSportId || '').trim().toLowerCase();
    if (!sportId) return false;
    if (RUGBY_SPORT_IDS.includes(selectedSportId)) return RUGBY_SPORT_IDS.includes(sportId);
    return sportId === selectedSportId;
}

// Las categorias reales son 'Profesional', 'Amateur', 'Primera Division Damas',
// no la palabra 'women': comparar contra 'women' no daba verdadero nunca.
const WOMEN_CATEGORY_PATTERN = /\b(women|woman|femenin[oa]s?|damas|mujeres)\b/i;

function isWomenCategory(category?: string | null): boolean {
    return WOMEN_CATEGORY_PATTERN.test(String(category || ''));
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

// La identidad de un torneo es su nombre dentro de su pais, no su id: el mismo
// Top 14 llega con id de catalogo (`rugby-argentina-top-14`) y con id de
// proveedor (`fs-rugby-union-argentina-top-14`), y deduplicar por id los deja a
// los dos en pantalla.
function getTournamentUniqueKey(tournament: Tournament): string {
    const name = normalizeLookupValue(tournament.displayName || tournament.name || tournament.nameEs);
    if (!name) return normalizeLookupValue(tournament.id);

    return [normalizeLookupValue(tournament.countryId), name].join('::');
}

function isFlashScoreTournamentId(value: string): boolean {
    return /^fs-/i.test(value);
}

function isLocalTournamentId(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

// Cuando el mismo torneo llega por dos vias gana el que administramos nosotros:
// primero el de base de datos, despues el del catalogo (que trae los ids de
// FlashScore ya curados) y ultimo el que viene crudo del proveedor.
const SOURCE_RANK_LOCAL_DB = 0;
const SOURCE_RANK_CATALOG = 1;
const SOURCE_RANK_PROVIDER = 2;

function getTournamentSourceRank(tournament: Tournament): number {
    const id = String(tournament.id || '');

    if (isLocalTournamentId(id) || tournament.dataSource === 'local-db') {
        return SOURCE_RANK_LOCAL_DB;
    }

    if (isFlashScoreTournamentId(id) || tournament.dataSource === 'flashscore') {
        return SOURCE_RANK_PROVIDER;
    }

    return SOURCE_RANK_CATALOG;
}

function uniqueTournamentsByIdentity(tournaments: Tournament[]) {
    const unique = new Map<string, Tournament>();

    tournaments.forEach((tournament) => {
        const key = getTournamentUniqueKey(tournament);
        if (!key) return;

        const existing = unique.get(key);
        if (!existing || getTournamentSourceRank(tournament) < getTournamentSourceRank(existing)) {
            unique.set(key, tournament);
        }
    });

    return [...unique.values()];
}

function appendTournamentSeasonHref(baseHref: string, seasonId: string): string {
    return `${baseHref}${baseHref.includes('?') ? '&' : '?'}season=${encodeURIComponent(seasonId)}`;
}

// OJO: `tournament.url` del catalogo estatico es la ruta de ORIGEN del proveedor
// (`/rugby-union/england/premiership-rugby/`), no una ruta de esta app. Devolverla
// tal cual mandaba a 404. La ruta siempre es /tournaments/{id}; la url de origen
// viaja como parametro para que el detalle sepa a quien preguntarle.
function getTournamentHref(tournament: Tournament): string {
    const base = `/tournaments/${tournament.id}`;
    const rawUrl = String(tournament.url || '').trim();
    const isExternalRoute = isFlashScoreTournamentId(String(tournament.id || ''));
    const params = new URLSearchParams();

    if (rawUrl && !rawUrl.startsWith('/tournaments/')) {
        params.set('url', rawUrl);
    }

    // El detalle de un torneo externo no tiene nombre propio en base de datos:
    // sin esto queda un "Cargando..." hasta que contesta el proveedor.
    if (isExternalRoute || (rawUrl && !rawUrl.startsWith('/tournaments/'))) {
        if (tournament.sportId) params.set('sport', String(tournament.sportId));
        const name = tournament.displayName || tournament.name;
        if (name) params.set('name', name);
    }

    const query = params.toString();
    return query ? `${base}?${query}` : base;
}

function mapPublicTournamentToTournament(item: PublicTournamentListItem): Tournament {
    // Por el catalogo, no por el texto crudo: 'ARG' y 'Argentina' son el mismo pais.
    const countryId = resolveCountryId(item.country_id, item.country, 'international');
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
        // Se guarda la url de ORIGEN, sin transformar: la ruta de la app la arma
        // getTournamentHref, que es el unico lugar que decide adonde se navega.
        url: item.url || null,
        type,
        sportId,
        countryId,
        priority: typeof item.priority === 'number' ? item.priority : 0,
        logoUrl: item.logo_url || null,
        categories: [],
        seasons,
        seasonId: item.season_id || null,
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
    const [remoteSearchTournaments, setRemoteSearchTournaments] = useState<Tournament[]>([]);
    const [isRemoteSearching, setIsRemoteSearching] = useState(false);
    const [catalogUnavailable, setCatalogUnavailable] = useState(false);

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

    const allTournaments = useMemo(() => {
        if (selectedSport.id === 'football') return buildEspnFootballTournaments();
        return getTournamentsBySport(selectedSport.id);
    }, [selectedSport.id]);
    const internationalTournaments = useMemo(() => {
        if (selectedSport.id === 'football') return getEspnFootballInternationalTournaments();
        return getInternationalTournamentsBySport(selectedSport.id);
    }, [selectedSport.id]);
    const loadedRugbyPublicTournaments = useMemo(
        () => Object.values(rugbyCountryGroups).flatMap((group) => group.tournaments),
        [rugbyCountryGroups],
    );
    const hasRugbyPublicCatalog = selectedSport.id === 'rugby' && rugbyPublicCatalogReady;

    const searchTerm = normalizeLookupValue(searchQuery);

    // Una sola lista para TODOS los grupos, internacional incluido. Antes lo
    // internacional se renderizaba aparte y terminaba habiendo dos acordeones
    // "Internacional": el del catalogo y el de base de datos.
    const localTournaments = useMemo(() => {
        const sportManualTournaments = manualTournamentsList.filter((tournament) => belongsToSport(tournament.sportId, selectedSport.id));
        const externalRugbyTournaments = selectedSport.id === 'rugby' ? loadedRugbyPublicTournaments : [];
        const combined = [
            ...sportManualTournaments,
            ...allTournaments,
            ...internationalTournaments,
            ...externalRugbyTournaments,
            ...remoteSearchTournaments,
        ];

        // El recorte por audiencia va ANTES de deduplicar: si no, un torneo de
        // mayores y uno de juveniles con el mismo nombre se pisan entre si.
        const audienceMatched = combined.filter((tournament) => {
            if (tournament.type !== 'local' && tournament.type !== 'cup' && tournament.type !== 'international') {
                return false;
            }

            return matchesTournamentAudience({
                ageGroup: tournament.ageGroup,
                categories: tournament.categories,
                isYouth: tournament.isYouth,
                name: tournament.name,
                displayName: tournament.displayName || tournament.nameEs,
                originalName: tournament.originalName,
            }, selectedAudience);
        });

        return uniqueTournamentsByIdentity(audienceMatched);
    }, [
        allTournaments,
        internationalTournaments,
        loadedRugbyPublicTournaments,
        manualTournamentsList,
        remoteSearchTournaments,
        selectedAudience,
        selectedSport.id,
    ]);

    const recommendedCatalog = useMemo(() => {
        const matched: Tournament[] = [];
        const combined = [
            ...manualTournamentsList.filter((tournament) => belongsToSport(tournament.sportId, selectedSport.id)),
            ...allTournaments,
            ...internationalTournaments,
            ...loadedRugbyPublicTournaments,
            ...remoteSearchTournaments,
        ];

        combined.forEach((tournament) => {
            if (!matchesTournamentAudience({
                ageGroup: tournament.ageGroup,
                categories: tournament.categories,
                isYouth: tournament.isYouth,
                name: tournament.name,
                displayName: tournament.displayName || tournament.nameEs,
                originalName: tournament.originalName,
            }, selectedAudience)) {
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

            matched.push(tournament);
        });

        return uniqueTournamentsByIdentity(matched);
    }, [
        allTournaments,
        internationalTournaments,
        loadedRugbyPublicTournaments,
        manualTournamentsList,
        remoteSearchTournaments,
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

        // Dos resumenes pueden caer en el mismo pais ('ARG' de base y 'Argentina'
        // del proveedor): se suman los contadores en vez de pisar uno con el otro.
        const summariesSeen = new Set<string>();

        rugbyCountrySummaries.forEach((summary) => {
            const countryId = resolveCountryId(summary.id, summary.name, summary.id);
            const existing = merged[countryId];
            const state = rugbyCountryGroups[countryId];
            const alreadyMerged = summariesSeen.has(countryId);
            summariesSeen.add(countryId);

            const tournaments = existing?.tournaments || state?.tournaments || [];

            // El proveedor los nombra en ingles ("France", "World"). El sitio
            // esta en castellano, y ademas la busqueda ya usa el nombre local:
            // si el encabezado dijera "World", buscar "Internacional" no lo
            // encontraria.
            const countryRecord = findCountryRecord(countryId, summary.name);
            const summaryCount = typeof summary.tournament_count === 'number' ? summary.tournament_count : null;
            const previousCount = alreadyMerged && typeof existing?.tournamentCount === 'number' ? existing.tournamentCount : 0;

            merged[countryId] = {
                countryName: countryRecord?.nameEs || countryRecord?.name || summary.name,
                flagEmoji: summary.flag || existing?.flagEmoji || '',
                tournaments,
                // El id externo del proveedor (numerico) manda sobre el de base.
                externalCountryId: (alreadyMerged && existing?.externalCountryId && /^\d+$/.test(existing.externalCountryId))
                    ? existing.externalCountryId
                    : summary.external_country_id,
                // Ya cargado, el contador es lo que se ve. Sin cargar, el del
                // resumen: la API lo calcula con la misma funcion de merge que
                // usa el detalle del pais, asi que coincide con la lista que se
                // abre. Viene null mientras el catalogo se esta armando.
                tournamentCount: (state?.loaded ?? false)
                    ? tournaments.length
                    : (summaryCount === null ? (alreadyMerged ? existing?.tournamentCount ?? null : null) : summaryCount + previousCount),
                loading: state?.loading ?? false,
                loaded: state?.loaded ?? false,
                error: state?.error ?? null,
                externalUnavailable: state?.externalUnavailable ?? false,
            };
        });

        return merged;
    }, [hasRugbyPublicCatalog, localTournaments, rugbyCountryGroups, rugbyCountrySummaries]);

    const filteredGroups = useMemo(() => {
        if (!searchQuery) return groupedTournaments;

        const filtered: typeof groupedTournaments = {};
        Object.entries(groupedTournaments).forEach(([countryId, group]) => {
            // El nombre del pais llega en ingles desde el proveedor ("France"),
            // pero el sitio esta en castellano: sin el nombre local, buscar
            // "Francia" no encontraba nada.
            const countryRecord = findCountryRecord(countryId, group.countryName);
            const countryNames = [group.countryName, countryRecord?.nameEs, countryRecord?.name]
                .map((value) => normalizeLookupValue(value))
                .filter(Boolean);
            const matchesCountry = countryNames.some((name) => name.includes(searchTerm));

            const matchingTournaments = group.tournaments.filter((tournament) => (
                normalizeLookupValue(tournament.displayName || tournament.name).includes(searchTerm) ||
                normalizeLookupValue(tournament.originalName).includes(searchTerm) ||
                matchesCountry
            ));

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

    // Internacional se carga como cualquier otro grupo. Excluirlo venia de cuando
    // era un bloque aparte con lista fija: quedaba mostrando solo lo del catalogo
    // local (45 ligas) con el contador de la API (83) al lado.
    const loadRugbyCountryTournaments = useCallback(async (countryId: string) => {
        if (!hasRugbyPublicCatalog) {
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

            const response = await fetch(`/api/public/tournaments?${searchParams.toString()}`);
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
                    // Contesto, pero sin la fuente externa: lo que se ve es solo
                    // lo nuestro. Un pais corto por una caida no se muestra igual
                    // que un pais que de verdad tiene pocas ligas.
                    externalUnavailable: payload?.meta?.externalUnavailable === true,
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


    // Numero solo cuando es el de verdad: el del grupo ya cargado, el de un grupo
    // que no depende de una fuente externa, o el que calculo la API cruzando base
    // y catalogo. Un numero aproximado al lado de una lista que no lo cumple es
    // peor que no ponerlo.
    const getCountryTournamentCount = useCallback((group: TournamentCountryGroup) => {
        if (group.loaded || !group.externalCountryId) {
            return group.tournaments.length;
        }

        return typeof group.tournamentCount === 'number' ? group.tournamentCount : null;
    }, []);

    // Un pais sin una sola liga en esta audiencia no se ofrece: seria un
    // acordeon que dice "(0)" y se abre vacio.
    const sortedCountryIds = useMemo(() => Object.keys(filteredGroups)
        .filter((countryId) => {
            const group = filteredGroups[countryId];
            if (group.tournaments.length > 0 || group.loading || group.error) return true;

            return getCountryTournamentCount(group) !== 0;
        })
        // Internacional primero, el resto alfabetico.
        .sort((left, right) => {
            if (left === 'international') return -1;
            if (right === 'international') return 1;
            return filteredGroups[left].countryName.localeCompare(filteredGroups[right].countryName);
        }), [filteredGroups, getCountryTournamentCount]);

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
        const controller = new AbortController();

        async function fetchManualTournaments() {
            try {
                // Pedir solo el deporte activo: antes bajaba la tabla entera de
                // todos los deportes y el filtrado se hacia aca.
                const response = await fetch(`/api/home/manual-tournaments?sport=${encodeURIComponent(selectedSport.id)}`, {
                    cache: 'default',
                    signal: controller.signal,
                });
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
                    url: null,
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
                    isWomen: isWomenCategory(tournament.category),
                    isYouth: resolveTournamentAudience({
                        ageGrade: tournament.age_grade,
                        category: tournament.category,
                    }) === 'juveniles',
                    ageGroup: tournament.age_grade || undefined,
                    format: tournament.format || undefined,
                    dataSource: 'local-db',
                }));
                setManualTournamentsList(mapped);
            } catch (error) {
                if ((error as Error).name === 'AbortError') return;
                console.error('Error fetching manual tournaments:', error instanceof Error ? error.message : 'Unknown error');
            }
        }

        void fetchManualTournaments();

        return () => controller.abort();
    }, [selectedSport.id]);

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
                // La audiencia va en el pedido: los contadores por pais son
                // distintos en mayores y en juveniles, y sin este parametro la
                // pestaña de juveniles se quedaba con los numeros de mayores.
                const searchParams = new URLSearchParams({
                    sport: 'rugby',
                    scope: 'summary',
                    audience: selectedAudience,
                });

                const response = await fetch(`/api/public/tournaments?${searchParams.toString()}`, {
                    signal: controller.signal,
                });
                const payload = await response.json().catch(() => ({}));

                if (!response.ok) {
                    console.error('Error fetching rugby country summaries:', payload.error || `HTTP ${response.status}`);
                    setRugbyCountrySummaries([]);
                    setRugbyCountryGroups({});
                    setRugbyPublicCatalogReady(false);
                    setCatalogUnavailable(true);
                    return;
                }

                const countries = Array.isArray(payload.data?.countries)
                    ? payload.data.countries as RugbyPublicCountrySummary[]
                    : [];

                setRugbyCountrySummaries(countries);
                setCatalogUnavailable(payload?.meta?.externalUnavailable === true);
                setRugbyPublicCatalogReady(true);
            } catch (error) {
                if ((error as Error).name === 'AbortError') {
                    return;
                }

                console.error('Error fetching rugby country summaries:', error instanceof Error ? error.message : 'Unknown error');
                setRugbyCountrySummaries([]);
                setRugbyCountryGroups({});
                setRugbyPublicCatalogReady(false);
                setCatalogUnavailable(true);
            }
        }

        setCatalogUnavailable(false);
        void fetchRugbyCountrySummaries();

        return () => controller.abort();
    }, [selectedAudience, selectedSport.id]);

    // La busqueda del acordeon solo ve lo que ya esta en pantalla, asi que una
    // liga de un pais sin abrir no aparecia nunca. Esto le pregunta al catalogo
    // completo, sin bloquear: lo que ya hay se sigue viendo y los resultados de
    // la API se suman cuando llegan.
    useEffect(() => {
        // Dos letras alcanzan: hay siglas cortas ("SR", "T14") que antes no
        // llegaban a disparar la consulta.
        if (searchTerm.length < 2) {
            setRemoteSearchTournaments([]);
            setIsRemoteSearching(false);
            return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(async () => {
            setIsRemoteSearching(true);

            try {
                const searchParams = new URLSearchParams({
                    sport: selectedSport.id,
                    audience: selectedAudience,
                    search: searchTerm,
                });

                const response = await fetch(`/api/public/tournaments?${searchParams.toString()}`, {
                    signal: controller.signal,
                });
                const payload = await response.json().catch(() => ({}));

                if (!response.ok) {
                    console.error('Error searching tournaments:', payload.error || `HTTP ${response.status}`);
                    return;
                }

                const data = Array.isArray(payload.data) ? payload.data as PublicTournamentListItem[] : [];
                setRemoteSearchTournaments(data.map((item) => mapPublicTournamentToTournament(item)));
            } catch (error) {
                if ((error as Error).name === 'AbortError') return;
                console.error('Error searching tournaments:', error instanceof Error ? error.message : 'Unknown error');
            } finally {
                if (!controller.signal.aborted) {
                    setIsRemoteSearching(false);
                }
            }
        }, 450);

        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, [searchTerm, selectedAudience, selectedSport.id]);

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

    // Catalogo entero de una vez: al llegar el resumen se pide todo el deporte y
    // se arman los paises antes de que alguien los abra, asi abrir es instantaneo.
    // Si esto falla, cada pais se pide solo como antes.
    useEffect(() => {
        if (!hasRugbyPublicCatalog || rugbyCountrySummaries.length === 0) return;

        const controller = new AbortController();
        const audience = selectedAudience;

        const applyCatalog = (items: PublicTournamentListItem[]) => {
            const tournaments = items.map((item) => mapPublicTournamentToTournament(item));
            setRugbyCountryGroups((prev) => {
                const next = { ...prev };
                rugbyCountrySummaries.forEach((summary) => {
                    const countryId = resolveCountryId(summary.id, summary.name, summary.id);
                    if (next[countryId]?.loaded) return;

                    const externalCountryId = String(summary.external_country_id || '').trim();
                    const matches = tournaments.filter((tournament, index) => {
                        const itemExternalCountryId = String(items[index].external_country_id || '').trim();
                        return (externalCountryId !== '' && itemExternalCountryId === externalCountryId)
                            || tournament.countryId === countryId;
                    });

                    next[countryId] = {
                        externalCountryId,
                        countryName: summary.name,
                        flagEmoji: summary.flag || '',
                        tournaments: matches,
                        tournamentCount: matches.length,
                        loading: false,
                        loaded: true,
                        error: null,
                        externalUnavailable: false,
                    };
                });
                return next;
            });
        };

        const cached = readCachedLeagueCatalog<PublicTournamentListItem>('rugby', audience);
        if (cached) {
            applyCatalog(cached);
            return () => controller.abort();
        }

        (async () => {
            try {
                const searchParams = new URLSearchParams({ sport: 'rugby', scope: 'catalog', audience });
                const response = await fetch(`/api/public/tournaments?${searchParams.toString()}`, { signal: controller.signal });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || !Array.isArray(payload.data)) return;

                const items = payload.data as PublicTournamentListItem[];
                writeCachedLeagueCatalog('rugby', audience, items);
                applyCatalog(items);
            } catch (error) {
                if ((error as Error).name === 'AbortError') return;
                console.error('Error precargando el catalogo de ligas:', error instanceof Error ? error.message : 'Unknown error');
            }
        })();

        return () => controller.abort();
    }, [hasRugbyPublicCatalog, rugbyCountrySummaries, selectedAudience]);

    useEffect(() => {
        if (!hasRugbyPublicCatalog) {
            return;
        }

        expandedCountries.forEach((countryId) => {
            void loadRugbyCountryTournaments(countryId);
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
                <h1 className={pageStyles.tournamentsPageTitle}>Torneos y ligas</h1>

                <div className={pageStyles.sidebarUnifiedCard}>
                    <div className={pageStyles.sportSwitch}>
                        <button
                            type="button"
                            className={pageStyles.sportSwitchBtn}
                            onClick={() => setIsSportMenuOpen((prev) => !prev)}
                            aria-expanded={isSportMenuOpen}
                            aria-haspopup="listbox"
                            aria-label={`Deporte activo: ${selectedSport.nameEs}. Cambiar de deporte`}
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

                        {/* Botones, no divs: antes no se llegaba por teclado. */}
                        <div
                            className={`${pageStyles.sportMenu} ${isSportMenuOpen ? pageStyles.sportMenuOpen : ''}`}
                            role="listbox"
                            aria-label="Deportes"
                        >
                            {sortedActiveSports.map((sport) => (
                                <button
                                    key={sport.id}
                                    type="button"
                                    role="option"
                                    aria-selected={selectedSport.id === sport.id}
                                    className={`${pageStyles.sportMenuItem} ${selectedSport.id === sport.id ? pageStyles.sportMenuItemActive : ''}`}
                                    onClick={() => {
                                        setSelectedSport(sport);
                                        setIsSportMenuOpen(false);
                                    }}
                                >
                                    <span aria-hidden="true">{sport.icon}</span>
                                    <span>{sport.nameEs}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={pageStyles.audienceSwitch} role="tablist" aria-label="Segmento de torneos">
                        {(['mayores', 'juveniles'] as TournamentAudience[]).map((audience) => (
                            <button
                                key={audience}
                                type="button"
                                role="tab"
                                aria-selected={selectedAudience === audience}
                                className={`${pageStyles.audienceSwitchBtn} ${selectedAudience === audience ? pageStyles.audienceSwitchBtnActive : ''}`}
                                onClick={() => setSelectedAudience(audience)}
                            >
                                {AUDIENCE_LABELS[audience]}
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
                            id="tournaments-search"
                            type="text"
                            aria-label={`Buscar ${selectedAudience === 'juveniles' ? 'torneos de juveniles y reserva' : 'ligas y torneos'} de ${selectedSport.nameEs}`}
                            placeholder={selectedAudience === 'juveniles'
                                ? `Filtrar juveniles y reserva de ${selectedSport.nameEs}...`
                                : selectedSport.id === 'tennis'
                                    ? `Filtrar torneos de ${selectedSport.nameEs}...`
                                    : `Filtrar ligas de ${selectedSport.nameEs}...`}
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            className={pageStyles.sidebarSearchInput}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                className={pageStyles.sidebarSearchClear}
                                onClick={() => setSearchQuery('')}
                                aria-label="Borrar búsqueda"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {catalogUnavailable && (
                        <div className={pageStyles.tournamentsNotice} role="status">
                            No se pudo consultar el catálogo externo. Se muestran los torneos propios.
                        </div>
                    )}

                    {isRemoteSearching && (
                        <div className={pageStyles.tournamentsNotice} role="status">
                            Buscando en el catálogo completo...
                        </div>
                    )}

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
                                        <TournamentSeasonTag seasonId={tournament.seasonId} />
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className={pageStyles.accordionList}>
                        {sortedCountryIds.map((countryId) => {
                            const group = filteredGroups[countryId];
                            const isExpanded = expandedCountries.has(countryId);
                            const countryTournamentCount = getCountryTournamentCount(group);

                            return (
                                <div key={countryId} className={pageStyles.accordionItem}>
                                    <button
                                        type="button"
                                        onClick={() => toggleCountry(countryId)}
                                        aria-expanded={isExpanded}
                                        className={`${pageStyles.accordionHeader} ${isExpanded ? pageStyles.active : ''}`}
                                    >
                                        <div className={pageStyles.accordionHeaderContent}>
                                            <CountryFlag countryId={countryId} countryName={group.countryName} />
                                            <span className={pageStyles.accordionHeaderName}>{group.countryName}</span>
                                        </div>
                                        <div className={pageStyles.accordionHeaderTail}>
                                            {countryTournamentCount !== null && (
                                                <span className={pageStyles.accordionCount}>{countryTournamentCount}</span>
                                            )}
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
                                        <div className={pageStyles.accordionContentInner}>
                                        {group.loading && group.tournaments.length === 0 && (
                                            <div className={pageStyles.accordionSkeleton} role="status" aria-label="Cargando ligas">
                                                <span className={pageStyles.accordionSkeletonRow} />
                                                <span className={pageStyles.accordionSkeletonRow} />
                                                <span className={pageStyles.accordionSkeletonRow} />
                                            </div>
                                        )}
                                        {!group.loading && group.error && group.tournaments.length === 0 && (
                                            <div className={pageStyles.audienceEmptyState}>{group.error}</div>
                                        )}
                                        {!group.loading && !group.error && group.externalUnavailable && (
                                            <div className={pageStyles.audienceEmptyState}>
                                                {group.tournaments.length > 0
                                                    ? 'El catálogo externo no respondió: puede faltar alguna liga.'
                                                    : 'El catálogo externo no respondió. Probá de nuevo en un rato.'}
                                            </div>
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
                                                                    className={pageStyles.leagueRowLink}
                                                                    style={{
                                                                        flex: 1,
                                                                        minHeight: 32,
                                                                        padding: '4px 8px',
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
                                                                    aria-label={`${isLeagueExpanded ? 'Ocultar' : 'Ver'} temporadas de ${tournament.name}`}
                                                                    aria-expanded={isLeagueExpanded}
                                                                    onClick={(event) => {
                                                                        event.preventDefault();
                                                                        event.stopPropagation();
                                                                        toggleLeague(tournament.id);
                                                                    }}
                                                                    style={{
                                                                        padding: '0 8px',
                                                                        minWidth: 32,
                                                                        minHeight: 32,
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
                                                                <div className={pageStyles.accordionItemContentInner}>
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
                                                        <TournamentSeasonTag seasonId={tournament.seasonId} />
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {sortedCountryIds.length === 0 && (
                            <div className={pageStyles.audienceEmptyState}>
                                {searchQuery
                                    ? (isRemoteSearching
                                        ? `Buscando "${searchQuery}"...`
                                        : `No encontramos nada con "${searchQuery}".`)
                                    : selectedAudience === 'juveniles'
                                        ? 'No hay torneos juveniles ni de reserva cargados para este deporte.'
                                        : 'No hay torneos disponibles para este deporte.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
