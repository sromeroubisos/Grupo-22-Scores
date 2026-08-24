'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import { ArrowLeft, ChevronLeft, ChevronRight, Star, Trash2, Trophy } from 'lucide-react';
import { useFavorite } from '@/hooks/useFavorites';
import { FAVORITES_ENABLED } from '@/lib/favorites/config';
import { SPORTS_BY_ID } from '@/lib/sports';
import { canonicalizeSportId } from '@/lib/clubDerivatives';
import ExportImage, { type SquadData } from '@/components/ExportImage';
import { APP_TIMEZONE, formatDateInTimeZone, formatDateKey, getTodayKey, addDaysToIsoDate } from '@/lib/timezone';
import { estadoDesdeToken } from '@/lib/matches/providerStatus';
import { canUseRestrictedContentActions } from '@/lib/auth/roles';
import { sortMatchesByDate } from '@/lib/utils/matchOrdering';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import { useAuth } from '@/context/AuthContext';
import HistoryTab from './HistoryTab';
import PanelMatchForm, { type PanelFamilyClub } from './PanelMatchForm';
import PanelCategories from './PanelCategories';

const SPORT_LABEL: Record<string, string> = Object.fromEntries(
    Object.entries(SPORTS_BY_ID).map(([id, s]) => [id, s.name])
);

// ── Panel del Día ───────────────────────────────────────────────────────────
// El día de un partido sale de la timezone del sitio, NUNCA de aritmética sobre
// el epoch: un partido a las 21:30 de un sábado argentino ya es domingo en UTC,
// y el panel lo mostraría el día equivocado. Por eso la clave se arma con
// `formatDateKey` + APP_TIMEZONE, que es la misma cuenta que usa el resto del
// sitio para agrupar por jornada.
function matchDayKey(match: any): string | null {
    const raw = match?.timestamp ?? match?.start_time ?? match?.time;
    const seconds = Number(raw);
    if (!Number.isFinite(seconds)) return null;
    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) return null;
    return formatDateKey(date, APP_TIMEZONE);
}

// `estadoDesdeToken` es el vocabulario canónico de estados del proyecto y
// devuelve null cuando el token no dice nada. Ese null NO es 'no empezó': ahí
// cae el bucket con el que vino el partido desde /api/teams, que ya resolvió
// finalizado-vs-programado mirando fecha y estado juntos.
type DayBucket = 'result' | 'fixture';
type DayState = 'live' | 'final' | 'scheduled' | 'off';

function matchDayState(match: any, bucket: DayBucket): DayState {
    const estado = estadoDesdeToken(match?.match_status || match?.event_status || match?.status);
    if (estado === 'live') return 'live';
    if (estado === 'final') return 'final';
    if (estado === 'postponed' || estado === 'cancelled') return 'off';
    return bucket === 'result' ? 'final' : 'scheduled';
}

// El mediodía UTC evita que la etiqueta se corra de día al formatear: a las
// 12:00Z Argentina son las 09:00 del mismo día, con o sin horario de verano.
function dayKeyLabel(key: string) {
    const date = new Date(key + 'T12:00:00Z');
    if (Number.isNaN(date.getTime())) return key;
    return formatDateInTimeZone(date, 'es-AR', { weekday: 'long', day: 'numeric', month: 'long' }, APP_TIMEZONE) || key;
}

// Un partido del panel, en el idioma que habla el export `dailyMatches`.
// El estado entra por parámetro y NO se recalcula acá: si se recalculara, la
// placa podría decir "programado" sobre un partido que la pantalla muestra
// terminado, porque la pantalla también mira el bucket con el que vino.
function toDailyMatchExport(match: any, state: DayState) {
    const stamp = match.timestamp || match.start_time || match.time;
    const withoutScore = state === 'scheduled' || state === 'off';
    const rawHome = match.scores?.home ?? match.scores?.home_score ?? match.home_score;
    const rawAway = match.scores?.away ?? match.scores?.away_score ?? match.away_score;

    return {
        homeTeam: match.home_team?.name || match.event_home_team || match.home_team_name || 'Local',
        awayTeam: match.away_team?.name || match.event_away_team || match.away_team_name || 'Visitante',
        homeLogo: getTeamLogo(match.home_team) || match.home_team_logo || '',
        awayLogo: getTeamLogo(match.away_team) || match.away_team_logo || '',
        homeScore: withoutScore ? undefined : (rawHome ?? undefined),
        awayScore: withoutScore ? undefined : (rawAway ?? undefined),
        time: formatClubDate(stamp, { hour: '2-digit', minute: '2-digit', hour12: false }),
        status: state === 'live' ? ('live' as const) : state === 'final' ? ('finished' as const) : ('scheduled' as const),
        dateLabel: formatClubDate(stamp, { weekday: 'short', day: '2-digit', month: '2-digit' }),
        kickoffAt: stamp ? new Date(stamp * 1000).toISOString() : undefined,
    };
}

/**
 * Orden de una jornada: por ESCALAFÓN, no por horario.
 *
 * El rango y la letra los resuelve el servidor (`level_rank` / `level_variant`,
 * ver `src/lib/clubs/categoryLevel.ts`), así que acá solo se comparan. Un
 * partido sin rango —los de la caída a los partidos de este club solo, cuando
 * la agenda no llegó— queda al final y se ordena por hora, como antes.
 *
 * `recentFirst` es para los Finalizados: entre dos fichas del MISMO rango, el
 * resultado más nuevo va arriba.
 */
function compareMatchByLevel(left: any, right: any, recentFirst: boolean): number {
    const leftRank = Number(left?.level_rank ?? Number.MAX_SAFE_INTEGER);
    const rightRank = Number(right?.level_rank ?? Number.MAX_SAFE_INTEGER);
    if (leftRank !== rightRank) return leftRank - rightRank;

    // La ficha sin letra va antes que la "A": "Primera" a secas es el equipo, y
    // "Primera A"/"Primera B" son la partición de un club que presenta dos.
    const leftVariant = String(left?.level_variant || '');
    const rightVariant = String(right?.level_variant || '');
    if (leftVariant !== rightVariant) {
        if (!leftVariant) return -1;
        if (!rightVariant) return 1;
        return leftVariant.localeCompare(rightVariant);
    }

    const leftTime = Number(left?.timestamp || 0);
    const rightTime = Number(right?.timestamp || 0);
    return recentFirst ? rightTime - leftTime : leftTime - rightTime;
}

// Etiqueta corta para los extremos de un plazo: "24 ago". La larga ocuparía
// dos renglones cuando hay que mostrar principio y fin juntos.
function dayKeyShortLabel(key: string) {
    const date = new Date(key + 'T12:00:00Z');
    if (Number.isNaN(date.getTime())) return key;
    return formatDateInTimeZone(date, 'es-AR', { day: 'numeric', month: 'short' }, APP_TIMEZONE) || key;
}

// Los plazos del panel. "Día" es la jornada sola —el comportamiento original—;
// los otros abren una ventana hacia adelante desde el día elegido, así que
// "7 días" parado en hoy es lo que se viene, no lo que ya pasó.
const DAY_RANGES: Array<{ days: number; label: string }> = [
    { days: 1, label: 'Día' },
    { days: 7, label: '7 días' },
    { days: 30, label: '30 días' },
];

// El orden es el de la jornada, no el alfabético: primero lo que se está
// jugando, después lo que falta, al final lo que ya pasó.
const DAY_SECTIONS: Array<{ id: DayState; label: string; tone: string }> = [
    { id: 'live', label: 'En vivo', tone: 'toneLive' },
    { id: 'scheduled', label: 'Por jugar', tone: 'toneScheduled' },
    { id: 'final', label: 'Finalizados', tone: 'toneFinal' },
    { id: 'off', label: 'Suspendidos', tone: 'toneOff' },
];

const TABS = [
    { id: 'summary', label: 'Resumen' },
    { id: 'results', label: 'Resultados' },
    { id: 'fixtures', label: 'Fixture' },
    { id: 'history', label: 'Historial' },
    { id: 'titles', label: 'Títulos' },
    { id: 'squad', label: 'Plantilla' },
    { id: 'transfers', label: 'Transferencias' },
    { id: 'today', label: 'Hoy' },
];

const DEFAULT_PUBLIC_TABS = new Set(['summary', 'results', 'fixtures']);

function isRugbyApiSportsTeamId(value: string) {
    return /^ras-team-\d+$/i.test(value);
}

function isEspnAmericanFootballTeamId(value: string) {
    return /^espn-team-\d+$/i.test(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getExternalTeamId(value: string, teamUrl?: string) {
    if (value.startsWith('fs-team-')) return value.slice(8);
    const rugbyMatch = /^ras-team-(\d+)$/i.exec(value);
    if (rugbyMatch?.[1]) return rugbyMatch[1];
    const espnMatch = /^espn-team-(\d+)$/i.exec(value);
    if (espnMatch?.[1]) return espnMatch[1];
    if (teamUrl && !UUID_RE.test(value)) return value;
    return null;
}

const getTeamLogo = (team: any) => {
    return resolveTeamLogo(team);
};

const POSITION_ORDER: Record<string, number> = {
    goalkeeper: 0, goalkeepers: 0, portero: 0, g: 0,
    defender: 1, defenders: 1, defensa: 1, d: 1,
    midfielder: 2, midfielders: 2, mediocampista: 2, m: 2,
    forward: 3, forwards: 3, striker: 3, strikers: 3, delantero: 3, f: 3,
    coach: 4, manager: 4, entrenador: 4,
};

const POSITION_LABELS: Record<number, string> = {
    0: 'Porteros',
    1: 'Defensas',
    2: 'Mediocampistas',
    3: 'Delanteros',
    4: 'Cuerpo Tecnico',
    5: 'Otros',
};

type PublicRelatedClub = {
    id: string;
    name: string;
    logo_url: string | null;
    sport: string | null;
    sport_id: string | null;
    is_base: boolean;
};

function groupSquadByPosition(squad: any): Record<number, any[]> {
    const groups: Record<number, any[]> = {};

    // FlashScore v2 squad format: array of { team_name, tab_name, list: [{ name: "Goalkeepers", players: [...] }] }
    if (Array.isArray(squad) && squad.length > 0 && squad[0]?.list) {
        // Flatten all tournaments' lists into position groups
        for (const tab of squad) {
            if (!Array.isArray(tab.list)) continue;
            for (const posGroup of tab.list) {
                const posName = (posGroup.name || '').toLowerCase();
                const orderIdx = POSITION_ORDER[posName] ?? POSITION_ORDER[posName.replace(/s$/, '')] ?? 5;
                const playersArr = Array.isArray(posGroup.players) ? posGroup.players : [];
                for (const p of playersArr) {
                    if (!groups[orderIdx]) groups[orderIdx] = [];
                    // Normalize player fields for rendering
                    groups[orderIdx].push({
                        ...p,
                        player_id: p.player_id || p.id || '',
                        name: p.name || p.player_name || '',
                        jersey_number: p.number || p.jersey_number || '',
                        nationality: p.country_name || p.nationality || '',
                        age: p.age || '',
                    });
                }
            }
        }
        if (Object.keys(groups).length > 0) return groups;
    }

    // Flat array of players
    let players: any[] = [];

    if (Array.isArray(squad)) {
        players = squad;
    } else if (squad && typeof squad === 'object') {
        if (Array.isArray(squad.DATA)) {
            players = squad.DATA;
        } else {
            // Object with position keys like { goalkeepers: [...], defenders: [...] }
            Object.entries(squad).forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    const posKey = key.toLowerCase();
                    const orderIdx = POSITION_ORDER[posKey] ?? 5;
                    value.forEach((p: any) => {
                        if (!groups[orderIdx]) groups[orderIdx] = [];
                        groups[orderIdx].push(p);
                    });
                }
            });
            if (Object.keys(groups).length > 0) return groups;
        }
    }

    // Group flat player list by position field
    players.forEach((p: any) => {
        const pos = (p.position || p.position_name || p.role || '').toLowerCase().trim();
        const orderIdx = POSITION_ORDER[pos] ?? 5;
        if (!groups[orderIdx]) groups[orderIdx] = [];
        groups[orderIdx].push(p);
    });

    return groups;
}

function formatClubDate(timestamp: number, options: Intl.DateTimeFormatOptions) {
    return formatDateInTimeZone(new Date(timestamp * 1000), 'es-AR', options, APP_TIMEZONE) || '';
}

// La fecha de nacimiento no se muestra ni se exporta: del padron sale la edad y
// nada mas. El porque esta en `mapClubRosterPersonToSquad` (/api/teams).

function formatPlayerStatus(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null;

    const normalized = value.trim().replace(/[_-]+/g, ' ');
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function TeamDetailInner({ id }: { id: string }) {
    const router = useRouter();
    const sp = useSearchParams();
    const { user, isLoading: authLoading } = useAuth();

    const [activeTab, setActiveTab] = useState('summary');
    const [loading, setLoading] = useState(true);
    const [squadLoading, setSquadLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [details, setDetails] = useState<any>(null);
    const [results, setResults] = useState<any[]>([]);
    const [fixtures, setFixtures] = useState<any[]>([]);
    const [squad, setSquad] = useState<any>(null);
    const [squadFetched, setSquadFetched] = useState(false);
    const [transfers, setTransfers] = useState<any[]>([]);
    const [honours, setHonours] = useState<any[]>([]);
    const [resolvedClubId, setResolvedClubId] = useState<string | null>(null);

    const [selectedSport, setSelectedSport] = useState<string>('all');
    const [selectedSquadTab, setSelectedSquadTab] = useState<string>('');
    const favoriteClubId = id;
    const { isFavorited, toggle: toggleFavorite } = useFavorite('club', favoriteClubId);

    // Keep provider-prefixed IDs so the API route can detect the correct external source.
    const rawId = id;

    // Hints from URL search params (passed from match/tournament page links)
    const hintName = sp.get('name') || '';
    const hintTeamUrl = sp.get('team_url') || '';
    const hintLeague = sp.get('league') || '';
    const preferredSport = sp.get('sport') || (isRugbyApiSportsTeamId(id) ? 'rugby' : isEspnAmericanFootballTeamId(id) ? 'american-football' : '');

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            setResolvedClubId(null);
            try {
                const query = new URLSearchParams();
                query.set('team_id', rawId);
                if (hintName) query.set('team_name', hintName);
                if (hintTeamUrl) query.set('team_url', hintTeamUrl);
                if (hintLeague) query.set('league', hintLeague);
                if (preferredSport) query.set('preferred_sport', preferredSport);
                query.set('skip_squad', 'true');

                const res = await fetch(`/api/teams?${query.toString()}`, { cache: 'no-store' });
                const payload = await res.json();

                if (!res.ok || !payload?.ok) {
                    setError(payload?.error || 'No se pudo cargar los datos del equipo.');
                    return;
                }

                if (
                    payload?.resolvedClubId &&
                    payload.resolvedClubId !== id &&
                    !id.startsWith('fs-team-') &&
                    !isRugbyApiSportsTeamId(id) &&
                    !isEspnAmericanFootballTeamId(id)
                ) {
                    const nextParams = new URLSearchParams();
                    if (preferredSport) nextParams.set('sport', preferredSport);
                    if (hintName) nextParams.set('name', hintName);
                    if (hintTeamUrl) nextParams.set('team_url', hintTeamUrl);
                    if (hintLeague) nextParams.set('league', hintLeague);

                    const queryString = nextParams.toString();
                    router.replace(`/clubs/${payload.resolvedClubId}${queryString ? `?${queryString}` : ''}`);
                    return;
                }

                setResolvedClubId(payload.resolvedClubId || null);
                setDetails(payload.details || null);
                setResults(sortMatchesByDate(payload.results || [], 'desc'));
                setFixtures(sortMatchesByDate(payload.fixtures || [], 'asc'));
                setSquad(null);
                setSquadFetched(false);
                setSelectedSquadTab('');
                setTransfers(payload.transfers || []);
                setHonours(Array.isArray(payload.honours) ? payload.honours : []);
            } catch (err) {
                console.error('Error fetching team data:', err);
                setError('Error al cargar datos del equipo.');
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [hintLeague, hintName, hintTeamUrl, id, preferredSport, rawId, router]);

    // Derived: unique sports from matches
    const availableSports = useMemo(() => {
        const seen = new Set<string>();
        [...results, ...fixtures].forEach(m => { if (m.sport_id) seen.add(String(m.sport_id)); });
        return Array.from(seen);
    }, [results, fixtures]);

    useEffect(() => {
        const normalizedPreferredSport = canonicalizeSportId(preferredSport);
        if (!normalizedPreferredSport) return;
        const matchingSport = availableSports.find((sportId) => canonicalizeSportId(sportId) === normalizedPreferredSport);
        if (!matchingSport) return;
        setSelectedSport((current) => current === matchingSport ? current : matchingSport);
    }, [availableSports, preferredSport]);

    // Derived: squad tabs
    const squadTabs: string[] = useMemo(() => {
        if (Array.isArray(squad) && squad.length > 0 && squad[0]?.tab_name) {
            const seen = new Set<string>();
            squad.forEach((t: any) => { if (t.tab_name) seen.add(t.tab_name); });
            return Array.from(seen);
        }
        return [];
    }, [squad]);

    // Lazy-load squad when the squad tab is first selected. Uses `?only=squad`
    // so the API skips the schedule/scoreboard/standings work and only hits the
    // roster endpoints (typically ~300ms vs ~3s+ for the full bundle).
    useEffect(() => {
        if (activeTab !== 'squad' || squadFetched || loading) return;

        async function fetchSquad() {
            setSquadLoading(true);
            try {
                const query = new URLSearchParams();
                query.set('team_id', rawId);
                query.set('only', 'squad');
                if (hintName) query.set('team_name', hintName);
                if (hintTeamUrl) query.set('team_url', hintTeamUrl);
                if (hintLeague) query.set('league', hintLeague);
                if (preferredSport) query.set('preferred_sport', preferredSport);

                const res = await fetch(`/api/teams?${query.toString()}`, { cache: 'no-store' });
                const payload = await res.json();
                if (res.ok && payload?.ok) {
                    setSquad(payload.squad || null);
                }
            } catch {
                // Silently ignore — squad just won't show
            } finally {
                setSquadLoading(false);
                setSquadFetched(true);
            }
        }

        fetchSquad();
    }, [activeTab, squadFetched, loading, rawId, hintLeague, hintName, hintTeamUrl, preferredSport]);

    // Auto-select first squad tab when squad loads
    useEffect(() => {
        if (squadTabs.length === 0) {
            if (selectedSquadTab) setSelectedSquadTab('');
            return;
        }

        if (!selectedSquadTab || !squadTabs.includes(selectedSquadTab)) {
            setSelectedSquadTab(squadTabs[0]);
        }
    }, [selectedSquadTab, squadTabs]);

    // Filtered matches by sport
    const filteredResults = selectedSport === 'all' ? results : results.filter(m => String(m.sport_id) === selectedSport);
    const filteredFixtures = selectedSport === 'all' ? fixtures : fixtures.filter(m => String(m.sport_id) === selectedSport);

    // La agenda del panel: los partidos de TODA la familia del club, del deporte
    // de este club. Se pide a demanda —solo al abrir la pestaña— porque son ~1000
    // filas y no tienen por qué encarecer la carga inicial de la ficha.
    const [agenda, setAgenda] = useState<{ results: any[]; fixtures: any[] } | null>(null);
    const [canManageClub, setCanManageClub] = useState(false);
    const [panelFamilyClubs, setPanelFamilyClubs] = useState<PanelFamilyClub[]>([]);
    const [showMatchForm, setShowMatchForm] = useState(false);
    const [showCategories, setShowCategories] = useState(false);
    // Se prende al pasar por la pestaña "Hoy": deja que la agenda arranque antes
    // del click. Ver el `onPointerEnter` de la barra de pestañas.
    const [agendaWanted, setAgendaWanted] = useState(false);
    // Se sube para forzar una relectura de la agenda después de cargar un partido:
    // sin esto la effect no vuelve a correr, porque sus dependencias no cambiaron.
    const [agendaNonce, setAgendaNonce] = useState(0);
    const [agendaLoading, setAgendaLoading] = useState(false);
    const [agendaFailed, setAgendaFailed] = useState(false);
    // Qué rango de fechas tiene cargado la agenda, y para qué club/nonce. Sin
    // esto no se puede saber si navegar a otro día necesita volver a pedir.
    const [agendaWindow, setAgendaWindow] = useState<{ from: string; to: string; loadedFor: string } | null>(null);
    // Los vecinos con partidos que quedaron FUERA de la ventana: el estado vacío
    // los usa para no quedarse sin sugerencia cuando la ventana entera está vacía.
    const [agendaNearestOutside, setAgendaNearestOutside] = useState<{ before: string | null; after: string | null } | null>(null);
    // Baja de un partido del panel. `confirmDeleteId` es el paso intermedio: el
    // ícono de tacho no borra, abre la confirmación. Borrar un partido no se
    // deshace, así que no puede pasar por un solo click al lado de un enlace.
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    // Qué club ya se pidió. Va en un ref y NO en las dependencias: tener
    // `agendaLoading` entre las dependencias hacía que poner la carga en true
    // volviera a disparar la effect, y su cleanup marcaba `cancelled` sobre el
    // fetch que estaba en vuelo. El pedido llegaba, nadie lo escuchaba y el panel
    // se quedaba en "sumando la familia" para siempre.
    const agendaRequestedFor = useRef<string | null>(null);


    // Índice jornada -> partidos. Con la agenda cargada son los de la familia
    // entera; hasta que llegue (o si falla) son los de este club solo, que la
    // ficha ya tenía. El filtro de deporte del encabezado se aplica igual arriba.
    const dayIndex = useMemo(() => {
        const index = new Map<string, any[]>();
        const add = (match: any, bucket: DayBucket) => {
            const key = matchDayKey(match);
            if (!key) return;
            const entry = { ...match, __bucket: bucket };
            const list = index.get(key);
            if (list) list.push(entry);
            else index.set(key, [entry]);
        };

        const sourceResults = agenda ? agenda.results : filteredResults;
        const sourceFixtures = agenda ? agenda.fixtures : filteredFixtures;
        const bySport = (match: any) => selectedSport === 'all' || String(match.sport_id) === selectedSport;

        sourceResults.filter(bySport).forEach(match => add(match, 'result'));
        sourceFixtures.filter(bySport).forEach(match => add(match, 'fixture'));
        return index;
    }, [agenda, filteredResults, filteredFixtures, selectedSport]);

    const todayKey = useMemo(() => getTodayKey(APP_TIMEZONE), []);
    const [dayKey, setDayKey] = useState<string>(() => getTodayKey(APP_TIMEZONE));
    const [rangeDays, setRangeDays] = useState<number>(1);
    // Plazo a medida: cuando está puesto, manda sobre el preset.
    const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);

    const windowStartKey = customRange ? customRange.from : dayKey;
    const windowEndKey = customRange ? customRange.to : addDaysToIsoDate(dayKey, rangeDays - 1);

    useEffect(() => {
        if (activeTab !== 'today' && !agendaWanted) return;
        if (!resolvedClubId) return;

        // La agenda ya no trae todo el historial: viene una VENTANA alrededor del
        // día que se está mirando (ver WINDOW_DAYS en la ruta). Mientras la
        // navegación se quede adentro, no se pide nada — que es el caso normal,
        // porque la ventana cubre una temporada entera para cada lado.
        const loadedFor = `${resolvedClubId}:${agendaNonce}`;
        const covered = agendaWindow
            && agendaWindow.loadedFor === loadedFor
            && windowStartKey >= agendaWindow.from
            && windowEndKey <= agendaWindow.to;
        if (covered) return;

        const requestKey = `${loadedFor}:${windowStartKey}`;
        if (agendaRequestedFor.current === requestKey) return;

        agendaRequestedFor.current = requestKey;
        setAgendaLoading(true);

        const url = `/api/clubs/${encodeURIComponent(resolvedClubId)}/agenda`
            + `?day=${encodeURIComponent(windowStartKey)}`;

        fetch(url, { cache: 'no-store' })
            .then(response => (response.ok ? response.json() : null))
            .then(payload => {
                if (payload?.ok) {
                    setAgenda({
                        results: Array.isArray(payload.results) ? payload.results : [],
                        fixtures: Array.isArray(payload.fixtures) ? payload.fixtures : [],
                    });
                    // El flag es solo para DIBUJAR el botón: la ruta de escritura
                    // revalida el permiso por su cuenta.
                    setCanManageClub(Boolean(payload.canManage));
                    setPanelFamilyClubs(Array.isArray(payload.familyClubs) ? payload.familyClubs : []);
                    setAgendaWindow(payload.window?.from && payload.window?.to
                        ? { from: payload.window.from, to: payload.window.to, loadedFor }
                        : null);
                    setAgendaNearestOutside(payload.nearestOutside ?? null);
                } else {
                    // Sin agenda el panel no se cae: sigue con los partidos de este
                    // club, que la ficha ya tenía cargados.
                    setAgendaFailed(true);
                }
            })
            .catch(() => setAgendaFailed(true))
            .finally(() => setAgendaLoading(false));
    }, [activeTab, agendaWanted, resolvedClubId, agendaNonce, windowStartKey, windowEndKey, agendaWindow]);

    const handleDeleteMatch = async (matchId: string) => {
        if (!resolvedClubId || !matchId) return;
        setDeletingMatchId(matchId);
        setDeleteError(null);
        try {
            const response = await fetch(
                `/api/clubs/${encodeURIComponent(resolvedClubId)}/panel-matches?matchId=${encodeURIComponent(matchId)}`,
                { method: 'DELETE' },
            );
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) {
                // El motivo del servidor está escrito para el dirigente ("ese
                // partido no lo cargó el club"), así que se muestra tal cual.
                setDeleteError(payload?.error || 'No se pudo borrar el partido');
                return;
            }
            setConfirmDeleteId(null);
            // Releer la agenda en vez de sacar la fila a mano: el conteo de cada
            // sección y los buckets se rearman solos con la respuesta del server.
            agendaRequestedFor.current = null;
            setAgendaNonce(value => value + 1);
        } catch {
            setDeleteError('No se pudo borrar el partido');
        } finally {
            setDeletingMatchId(null);
        }
    };

    // Largo del plazo en días, con tope: un "desde 1990 hasta hoy" no puede
    // convertirse en un for de doce mil vueltas cada vez que React redibuja.
    const windowSpan = useMemo(() => {
        const from = Date.parse(windowStartKey + 'T00:00:00Z');
        const to = Date.parse(windowEndKey + 'T00:00:00Z');
        if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 1;
        return Math.min(400, Math.round((to - from) / 86400000) + 1);
    }, [windowStartKey, windowEndKey]);

    const isSingleDay = windowSpan === 1;

    const dayGroups = useMemo(() => {
        const list = (dayIndex.get(windowStartKey) || []).slice();
        const groups: Record<DayState, any[]> = { live: [], scheduled: [], final: [], off: [] };
        list.forEach(match => groups[matchDayState(match, match.__bucket)].push(match));
        // El horario NO ordena la jornada: la Intermedia juega a las 15:15 y la
        // Primera a las 17:00 solo porque comparten cancha. Se lee por escalafón.
        // Dentro de cada sección, el horario queda de desempate: los resultados
        // del último primero, lo que viene en orden de cancha.
        groups.live.sort((left, right) => compareMatchByLevel(left, right, false));
        groups.scheduled.sort((left, right) => compareMatchByLevel(left, right, false));
        groups.final.sort((left, right) => compareMatchByLevel(left, right, true));
        groups.off.sort((left, right) => compareMatchByLevel(left, right, false));
        return { ...groups, total: list.length };
    }, [dayIndex, windowStartKey]);

    // Para el estado vacío: la jornada con partidos más cercana a la elegida.
    // Las claves son 'YYYY-MM-DD' normalizadas, así que compararlas como fecha
    // UTC es pura aritmética y no depende de la timezone de nadie.
    const nearestDayWithMatches = useMemo(() => {
        let best: string | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        const target = Date.parse(windowStartKey + 'T00:00:00Z');
        const consider = (key: string | null | undefined) => {
            if (!key || key === windowStartKey) return;
            const distance = Math.abs(Date.parse(key + 'T00:00:00Z') - target);
            if (distance < bestDistance) { bestDistance = distance; best = key; }
        };

        dayIndex.forEach((_matches, key) => consider(key));

        // Los vecinos de afuera de la ventana. Hacen falta para el club dormido:
        // si en el medio año para cada lado no hay nada, el índice está vacío y
        // sin esto el estado vacío se quedaría sin adónde mandarte.
        consider(agendaNearestOutside?.before);
        consider(agendaNearestOutside?.after);

        return best;
    }, [dayIndex, windowStartKey, agendaNearestOutside]);

    // Solo las jornadas CON partidos: un plazo de 30 días no dibuja treinta
    // encabezados vacíos para mostrar tres partidos.
    const windowDays = useMemo(() => {
        const days: Array<{ key: string; matches: any[] }> = [];
        for (let offset = 0; offset < windowSpan; offset += 1) {
            const key = addDaysToIsoDate(windowStartKey, offset);
            const matches = dayIndex.get(key);
            if (!matches || !matches.length) continue;
            days.push({
                key,
                // Mismo criterio que la jornada suelta: escalafón primero.
                matches: matches.slice().sort((left, right) => compareMatchByLevel(left, right, false)),
            });
        }
        return days;
    }, [dayIndex, windowStartKey, windowSpan]);

    const windowTotal = useMemo(
        () => windowDays.reduce((sum, day) => sum + day.matches.length, 0),
        [windowDays]
    );

    // Mover el plazo corre las DOS puntas el largo de la ventana, así el paso es
    // el mismo que se está mirando y no un día suelto.
    const shiftWindow = (direction: 1 | -1) => {
        const step = windowSpan * direction;
        if (customRange) {
            setCustomRange({
                from: addDaysToIsoDate(customRange.from, step),
                to: addDaysToIsoDate(customRange.to, step),
            });
            return;
        }
        setDayKey(addDaysToIsoDate(dayKey, step));
    };

    const goToDay = (key: string) => {
        setCustomRange(null);
        setDayKey(key);
    };

    // El punto de color de una jornada lo manda el estado más urgente que tenga:
    // si algo se está jugando, la jornada está en vivo aunque el resto ya terminó.
    const dayTone = (matches: any[]) => {
        const states = new Set(matches.map(match => matchDayState(match, match.__bucket)));
        if (states.has('live')) return 'toneLive';
        if (states.has('scheduled')) return 'toneScheduled';
        if (states.has('final')) return 'toneFinal';
        return 'toneOff';
    };

    // Palmarés agrupado por competición: temporadas de campeón y de subcampeón.
    const honoursByCompetition = useMemo(() => {
        const byComp = new Map<string, { name: string; titles: string[]; runnerUps: string[] }>();
        for (const row of honours) {
            const name = String(row?.competition_name || '').trim();
            const season = String(row?.season || '').trim();
            if (!name || !season) continue;
            let entry = byComp.get(name);
            if (!entry) {
                entry = { name, titles: [], runnerUps: [] };
                byComp.set(name, entry);
            }
            if (row.result === 'champion') entry.titles.push(season);
            else entry.runnerUps.push(season);
        }
        return Array.from(byComp.values()).sort((a, b) =>
            b.titles.length - a.titles.length ||
            b.runnerUps.length - a.runnerUps.length ||
            a.name.localeCompare(b.name));
    }, [honours]);
    const isSuperAdminUser = !authLoading && canUseRestrictedContentActions(user?.role);
    const externalTeamId = getExternalTeamId(rawId, hintTeamUrl);
    const adminClubId = useMemo(() => {
        if (resolvedClubId) return resolvedClubId;
        if (!externalTeamId && !rawId.startsWith('fs-team-') && !isRugbyApiSportsTeamId(rawId) && !isEspnAmericanFootballTeamId(rawId)) return rawId;
        return null;
    }, [externalTeamId, rawId, resolvedClubId]);
    const visibleTabs = useMemo(() => {
        const supportedTabs = new Set<string>(
            Array.isArray(details?.supported_tabs)
                ? details.supported_tabs.filter((tab: unknown): tab is string => typeof tab === 'string')
                : Array.from(DEFAULT_PUBLIC_TABS)
        );

        if (details?.is_internal || resolvedClubId) {
            supportedTabs.add('squad');
        }

        // El panel solo existe si el club tiene jornadas para mostrar. Un club
        // externo sin un solo partido cargado no gana una pestaña vacía.
        if (dayIndex.size > 0) {
            supportedTabs.add('today');
        }

        supportedTabs.add('history');

        // La tab de títulos solo existe si hay palmarés: sin filas, ni aparece.
        if (honoursByCompetition.length > 0) {
            supportedTabs.add('titles');
        }

        return TABS.filter((tab) => supportedTabs.has(tab.id));
    }, [details?.is_internal, details?.supported_tabs, resolvedClubId, honoursByCompetition.length, dayIndex.size]);
    const relatedFamilyClubs = useMemo(() => {
        const familyClubs: PublicRelatedClub[] = Array.isArray(details?.related_clubs)
            ? details.related_clubs.filter((club: unknown): club is PublicRelatedClub => {
                return typeof club === 'object'
                    && club !== null
                    && typeof (club as PublicRelatedClub).id === 'string'
                    && typeof (club as PublicRelatedClub).name === 'string';
            })
            : [];
        const currentClubId = resolvedClubId || (!externalTeamId ? rawId : '');

        return familyClubs
            .filter((club) => club.id !== currentClubId)
            .sort((left, right) => {
                if (left.is_base) return -1;
                if (right.is_base) return 1;
                return left.name.localeCompare(right.name);
            });
    }, [details?.related_clubs, externalTeamId, rawId, resolvedClubId]);

    useEffect(() => {
        if (visibleTabs.some((tab) => tab.id === activeTab)) return;
        setActiveTab('summary');
    }, [activeTab, visibleTabs]);

    if (loading) {
        return (
            <div className={styles.page}>
                <div className={`${styles.skHeaderBanner} ${styles.skLoadingWrap}`}>
                    <div className="container">
                        <div className={`${styles.skeleton} ${styles.skBreadcrumb}`} />
                        <div className={styles.skHeaderRow}>
                            <div className={`${styles.skeleton} ${styles.skLogo}`} />
                            <div className={styles.skHeaderText}>
                                <div className={`${styles.skeleton} ${styles.skTitle}`} />
                                <div className={styles.skMetaRow}>
                                    <div className={`${styles.skeleton} ${styles.skMeta}`} />
                                    <div className={`${styles.skeleton} ${styles.skMetaSm}`} />
                                </div>
                            </div>
                        </div>
                        <div className={styles.skTabs}>
                            {[0, 1, 2, 3, 4].map(i => (
                                <div key={i} className={`${styles.skeleton} ${styles.skTab}`} />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
                    <div className={styles.skContent}>
                        <div className={styles.skMain}>
                            <div className={`${styles.skeleton} ${styles.skSectionTitle}`} />
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className={`${styles.skeleton} ${styles.skMatchRow}`} />
                            ))}
                        </div>
                        <div className={styles.skSidebar}>
                            <div className={`${styles.skeleton} ${styles.skSidebarTitle}`} />
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className={`${styles.skeleton} ${styles.skSidebarRow}`} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.errorContainer}>
                <p>{error}</p>
                <div className={styles.backButton} onClick={() => router.push('/')}>
                    <ArrowLeft size={16} /> Volver al Inicio
                </div>
            </div>
        );
    }

    // Extract team info from details, fallback to hintName from URL
    const teamName = details?.name || details?.team?.name || details?.team_name || hintName || rawId;
    const teamLogoUrl =
        resolveTeamLogo(details, details?.team) ||
        '';
    const returnTo = `/clubs/${rawId}${sp.toString() ? `?${sp.toString()}` : ''}`;
    const adminEditHref = adminClubId
        ? `/admin/entities/${adminClubId}/manage?type=club`
        : externalTeamId
            ? (() => {
                const params = new URLSearchParams();
                params.set('name', teamName);
                params.set('returnTo', returnTo);
                if (preferredSport) params.set('sport', preferredSport);
                if (hintTeamUrl) params.set('team_url', hintTeamUrl);
                if (hintLeague) params.set('league', hintLeague);
                if (rawId.startsWith('fs-team-')) params.set('source', 'flashscore');
                if (isRugbyApiSportsTeamId(rawId)) params.set('source', 'rugby-api-sports');
                if (isEspnAmericanFootballTeamId(rawId)) params.set('source', 'espn');

                return `/admin/super/clubes/externos/${externalTeamId}/logo?${params.toString()}`;
            })()
            : null;
    const countryName = details?.country?.name || details?.country || '';
    const countryFlag = details?.country?.image_path || details?.country?.small_image_path || '';
    const venue = details?.venue?.name || details?.venue || details?.stadium || '';
    const coachName = details?.coach?.name || details?.manager?.name || '';

    // Render a match item (same pattern as tournament page)
    const renderMatchItem = (match: any, options?: { managed?: boolean }) => {
        const timestamp = match.timestamp || match.start_time || match.time;
        const date = timestamp ? new Date(timestamp * 1000) : new Date();

        const matchStatus = match.match_status || match.event_status || match.status || '';
        const isScheduled = matchStatus === 'scheduled' || matchStatus === 'NS' || matchStatus === 'Not Started';
        const rawScoreHome = match.scores?.home ?? match.scores?.home_score ?? match.home_score ?? null;
        const rawScoreAway = match.scores?.away ?? match.scores?.away_score ?? match.away_score ?? null;
        const scoreHome = isScheduled || rawScoreHome == null ? '-' : rawScoreHome;
        const scoreAway = isScheduled || rawScoreAway == null ? '-' : rawScoreAway;

        const homeName = match.home_team?.name || match.event_home_team || match.home_team_name || 'Home';
        const awayName = match.away_team?.name || match.event_away_team || match.away_team_name || 'Away';

        const homeLogo = getTeamLogo(match.home_team) || match.home_team_logo || '';
        const awayLogo = getTeamLogo(match.away_team) || match.away_team_logo || '';

        let homeClass = '';
        let awayClass = '';
        if (typeof scoreHome === 'number' && typeof scoreAway === 'number') {
            if (scoreHome > scoreAway) homeClass = styles.winnerName;
            if (scoreAway > scoreHome) awayClass = styles.winnerName;
        }

        // Un partido del archivo ('ra-…') no tiene página propia: navega al
        // torneo en cuestión cuando el torneo sí la tiene, y si no, no linkea.
        const matchKey = String(match.event_key || match.match_id || '');
        const isArchiveMatch = matchKey.startsWith('ra-');
        const tournamentId = String(match.tournament_id || '');
        const tournamentHref = tournamentId && !tournamentId.startsWith('ra-') ? `/torneos/${tournamentId}` : null;
        const href = isArchiveMatch ? tournamentHref : `/matches/${matchKey}`;

        const matchBody = (
            <>
                <div className={styles.matchTime}>
                    <span className={styles.matchDateStr}>{date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', weekday: 'short', timeZone: APP_TIMEZONE })}</span>
                    <span>{date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE })}</span>
                </div>
                <div className={styles.matchTeams}>
                    <div className={styles.teamRow}>
                        <div className={styles.teamInfo}>
                            {homeLogo ? (
                                <img src={homeLogo} alt={homeName} className={styles.teamLogoSmall} />
                            ) : (
                                <div className={styles.teamLogoPlaceholder} />
                            )}
                            <span className={homeClass}>{homeName}</span>
                        </div>
                        <span className={styles.score}>{scoreHome}</span>
                    </div>
                    <div className={styles.teamRow}>
                        <div className={styles.teamInfo}>
                            {awayLogo ? (
                                <img src={awayLogo} alt={awayName} className={styles.teamLogoSmall} />
                            ) : (
                                <div className={styles.teamLogoPlaceholder} />
                            )}
                            <span className={awayClass}>{awayName}</span>
                        </div>
                        <span className={styles.score}>{scoreAway}</span>
                    </div>
                </div>
            </>
        );

        // El botón de baja va FUERA del enlace: un <button> adentro de un <a> no
        // es HTML válido, y además un click al borde del tacho no puede terminar
        // navegando a la ficha del partido.
        const canDelete = Boolean(options?.managed && match.can_delete && match.match_id);
        const row = href ? (
            <Link href={href} key={matchKey} className={styles.matchItem}>
                {matchBody}
                <div className={styles.matchMeta}>
                    <ChevronRight size={16} />
                </div>
            </Link>
        ) : (
            <div key={matchKey} className={styles.matchItem}>
                {matchBody}
            </div>
        );

        // Sin baja posible la fila sale como siempre y sin envoltorio: el
        // escalonado de entrada se apoya en `.matchItem:nth-child()`.
        if (!canDelete) return row;

        const matchId = String(match.match_id);
        const isConfirming = confirmDeleteId === matchId;
        const isDeleting = deletingMatchId === matchId;

        return (
            <div key={matchKey} className={styles.matchItemManaged}>
                {row}
                {isConfirming ? (
                    <div className={styles.matchDeleteConfirm}>
                        <span className={styles.matchDeleteAsk}>¿Borrar este partido?</span>
                        <button
                            type="button"
                            className={styles.matchDeleteYes}
                            onClick={() => handleDeleteMatch(matchId)}
                            disabled={isDeleting}
                        >
                            {isDeleting ? 'Borrando…' : 'Sí, borrar'}
                        </button>
                        <button
                            type="button"
                            className={styles.matchDeleteNo}
                            onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }}
                            disabled={isDeleting}
                        >
                            Cancelar
                        </button>
                        {deleteError ? <span className={styles.matchDeleteError}>{deleteError}</span> : null}
                    </div>
                ) : (
                    <button
                        type="button"
                        className={styles.matchDeleteBtn}
                        aria-label={`Borrar el partido ${homeName} contra ${awayName}`}
                        onClick={() => { setConfirmDeleteId(matchId); setDeleteError(null); }}
                    >
                        <Trash2 size={15} aria-hidden="true" />
                    </button>
                )}
            </div>
        );
    };

    // Group squad by position, filtered by selected tab
    const activeSquadTabValue = selectedSquadTab || squadTabs[0] || '';
    const selectedSquadData = squadTabs.length > 0 && activeSquadTabValue
        ? (Array.isArray(squad) ? squad.filter((t: any) => t.tab_name === activeSquadTabValue) : squad)
        : squad;
    const squadGroups = groupSquadByPosition(selectedSquadData);
    const sortedPositionKeys = Object.keys(squadGroups)
        .map(Number)
        .sort((a, b) => a - b);
    const exportPositionKeys = sortedPositionKeys.filter((posIdx) => Array.isArray(squadGroups[posIdx]) && squadGroups[posIdx].length > 0);
    const normalizedSquadTab = activeSquadTabValue.trim().toLowerCase();
    const squadExportSubtitle = activeSquadTabValue
        && normalizedSquadTab !== 'active'
        && normalizedSquadTab !== 'squad'
        && activeSquadTabValue !== teamName
        ? activeSquadTabValue
        : 'Plantel completo';
    const getExportPositionLabel = (posIdx: number) => {
        if (posIdx === 5) {
            return exportPositionKeys.length === 1 ? 'Jugadores' : 'Sin posicion';
        }

        return POSITION_LABELS[posIdx] || 'Jugadores';
    };
    const squadExportData: SquadData | null = exportPositionKeys.length > 0
        ? {
            title: 'Plantel',
            subtitle: squadExportSubtitle,
            tournament: teamName,
            tournamentLogo: teamLogoUrl,
            teamName,
            teamLogo: teamLogoUrl,
            groups: exportPositionKeys.map((posIdx) => ({
                label: getExportPositionLabel(posIdx),
                players: squadGroups[posIdx]
                    .map((player: any) => {
                        const playerName = player.name || player.player_name || 'Jugador';
                        const playerCountry = player.country?.name || player.nationality || '';
                        const jerseyNumber = player.jersey_number || player.shirt_number || player.number || '';
                        const pId = player.player_id || player.id || '';
                        const playerPosition = player.position || player.position_name || '';
                        const playerDivision = player.team_name || player.tab_name || player.division_name || '';
                        const playerAge = typeof player.age === 'number' || typeof player.age === 'string'
                            ? String(player.age).trim()
                            : '';

                        return {
                            id: pId || null,
                            number: jerseyNumber || null,
                            name: playerName,
                            country: playerCountry || null,
                            position: playerPosition || null,
                            teamLabel: playerDivision && playerDivision !== activeSquadTabValue && playerDivision !== teamName ? playerDivision : null,
                            age: playerAge || null,
                        };
                    })
                    .filter((player: any) => player && player.name),
            })).filter((group) => group.players.length > 0),
        }
        : null;

    return (
        <div className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div className="container">
                    <div className={styles.breadcrumb}>
                        <Link href="/">Inicio</Link>
                        <span className={styles.separator}>/</span>
                        <Link href="/clubs">Clubes</Link>
                        <span className={styles.separator}>/</span>
                        <span className={styles.breadcrumbActive}>{teamName}</span>
                    </div>

                    <div className={styles.headerContent}>
                        <div className={styles.logoContainer}>
                            {teamLogoUrl ? (
                                <img src={teamLogoUrl} alt={teamName} className={styles.teamLogo} />
                            ) : (
                                <div className={styles.logoPlaceholder}>{teamName?.[0]}</div>
                            )}
                        </div>
                        <div className={styles.headerInfo}>
                            <h1 className={styles.title}>{teamName}</h1>
                            <div className={styles.meta}>
                                {countryName && (
                                    <span className={styles.country}>
                                        {countryFlag && <img src={countryFlag} alt="" className={styles.countryFlag} />}
                                        {countryName}
                                    </span>
                                )}
                                {venue && <span>{venue}</span>}
                            </div>
                            {(availableSports.length > 1 || squadTabs.length > 1) && (
                                <div className={styles.headerDropdowns}>
                                    {availableSports.length > 1 && (
                                        <select
                                            className={styles.headerSelect}
                                            value={selectedSport}
                                            onChange={e => setSelectedSport(e.target.value)}
                                        >
                                            <option value="all">Todos los deportes</option>
                                            {availableSports.map(s => (
                                                <option key={s} value={s}>{SPORT_LABEL[s] || s}</option>
                                            ))}
                                        </select>
                                    )}
                                    {squadTabs.length > 1 && (
                                        <select
                                            className={styles.headerSelect}
                                            value={selectedSquadTab}
                                            onChange={e => setSelectedSquadTab(e.target.value)}
                                        >
                                            {squadTabs.map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className={styles.headerActions}>
                            {isSuperAdminUser && adminEditHref ? (
                                <Link href={adminEditHref} prefetch={false} className={styles.adminActionBtn}>
                                    Editar logo
                                </Link>
                            ) : null}
                            {FAVORITES_ENABLED && (
                                <button
                                    className={`${styles.followBtn} ${isFavorited ? styles.followBtnActive : ''}`}
                                    onClick={() => toggleFavorite({
                                        name: teamName,
                                        logo_url: teamLogoUrl || null,
                                        type_label: 'Club',
                                        canonical_id: resolvedClubId || null,
                                        sport_id: preferredSport || null,
                                    })}
                                    type="button"
                                >
                                    <Star size={16} fill={isFavorited ? 'currentColor' : 'none'} />
                                    {isFavorited ? 'Siguiendo' : 'Seguir'}
                                </button>
                            )}
                        </div>
                    </div>

                    <nav className={styles.navTabs}>
                        {visibleTabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`${styles.tabButton} ${activeTab === tab.id ? styles.activeTab : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                                // El panel es lo único de esta ficha que pide datos
                                // aparte. Se arranca al pasar por encima o al tocar,
                                // así el click no espera la ida y vuelta. No se
                                // precarga de entrada: quien nunca abre "Hoy" no
                                // tiene por qué pagarla.
                                onPointerEnter={tab.id === 'today' ? () => setAgendaWanted(true) : undefined}
                                onPointerDown={tab.id === 'today' ? () => setAgendaWanted(true) : undefined}
                                onFocus={tab.id === 'today' ? () => setAgendaWanted(true) : undefined}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>
            </header>

            <main className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
                <div className={`${styles.contentLayout} ${activeTab === 'history' ? styles.historyContentLayout : ''} ${activeTab === 'today' ? styles.panelContentLayout : ''}`}>
                    <div key={activeTab} className={styles.mainColumn}>

                        {/* Summary Tab */}
                        {activeTab === 'today' && (
                            <div className={styles.card}>
                                <div className={styles.dayHeader}>
                                    <div>
                                        <h2 className={styles.pageTitle}>Panel del Día</h2>
                                        <p className={styles.dayCaption}>
                                            {isSingleDay
                                                ? dayKeyLabel(windowStartKey) + (windowStartKey === todayKey ? ' · hoy' : '')
                                                : dayKeyShortLabel(windowStartKey) + ' — ' + dayKeyShortLabel(windowEndKey)
                                                    + ' · ' + windowTotal + (windowTotal === 1 ? ' partido' : ' partidos')}
                                            {agendaLoading ? ' · sumando la familia…' : ''}
                                        </p>
                                    </div>
                                    <div className={styles.dayControls}>
                                        <div className={styles.rangePicker} role="radiogroup" aria-label="Plazo">
                                            {DAY_RANGES.map(range => {
                                                const active = !customRange && rangeDays === range.days;
                                                return (
                                                    <button
                                                        key={range.days}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={active}
                                                        className={styles.rangeBtn + (active ? ' ' + styles.rangeBtnActive : '')}
                                                        onClick={() => { setCustomRange(null); setRangeDays(range.days); }}
                                                    >
                                                        {range.label}
                                                    </button>
                                                );
                                            })}
                                            <button
                                                type="button"
                                                role="radio"
                                                aria-checked={Boolean(customRange)}
                                                className={styles.rangeBtn + (customRange ? ' ' + styles.rangeBtnActive : '')}
                                                onClick={() => setCustomRange({ from: windowStartKey, to: windowEndKey })}
                                            >
                                                A medida
                                            </button>
                                        </div>
                                        <div className={styles.dayNav}>
                                            <button
                                                type="button"
                                                className={styles.dayNavBtn}
                                                aria-label={isSingleDay ? 'Jornada anterior' : 'Plazo anterior'}
                                                onClick={() => shiftWindow(-1)}
                                            >
                                                <ChevronLeft size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.dayNavToday}
                                                onClick={() => goToDay(todayKey)}
                                                disabled={!customRange && windowStartKey === todayKey}
                                            >
                                                {!customRange && windowStartKey === todayKey ? 'Estás en hoy' : 'Volver a hoy'}
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.dayNavBtn}
                                                aria-label={isSingleDay ? 'Jornada siguiente' : 'Plazo siguiente'}
                                                onClick={() => shiftWindow(1)}
                                            >
                                                <ChevronRight size={16} />
                                            </button>
                                        </div>

                                        {/* La estética la elige el rol y la resuelve ExportImage solo:
                                            quien tiene panel de gestión exporta con el diseño activo,
                                            y el hincha y el invitado con Fan V5. Sin partidos no hay
                                            botón: una placa vacía no es un export. */}
                                        {canManageClub && !showMatchForm ? (
                                            <button
                                                type="button"
                                                className={styles.panelFormSecondary}
                                                onClick={() => setShowMatchForm(true)}
                                            >
                                                Cargar partido
                                            </button>
                                        ) : null}

                                        {/* De acá sale el orden de la jornada: qué categoría
                                            representa cada ficha del club. */}
                                        {canManageClub && !showCategories ? (
                                            <button
                                                type="button"
                                                className={styles.panelFormSecondary}
                                                onClick={() => setShowCategories(true)}
                                            >
                                                Categorías
                                            </button>
                                        ) : null}

                                        {windowTotal > 0 ? (
                                            <ExportImage
                                                template="dailyMatches"
                                                filename={'panel-' + teamName + '-' + windowStartKey}
                                                data={{
                                                    date: isSingleDay
                                                        ? dayKeyLabel(windowStartKey)
                                                        : dayKeyShortLabel(windowStartKey) + ' — ' + dayKeyShortLabel(windowEndKey),
                                                    tournament: teamName,
                                                    tournamentLogo: teamLogoUrl,
                                                    matches: windowDays.flatMap(day => day.matches.map(
                                                        match => toDailyMatchExport(match, matchDayState(match, match.__bucket))
                                                    )),
                                                }}
                                            />
                                        ) : null}
                                    </div>
                                </div>

                                {showCategories && resolvedClubId ? (
                                    <PanelCategories
                                        clubId={resolvedClubId}
                                        onClose={() => {
                                            setShowCategories(false);
                                            // El escalafón cambió: la jornada se
                                            // reordena con la agenda releída.
                                            agendaRequestedFor.current = null;
                                            setAgendaNonce(value => value + 1);
                                        }}
                                    />
                                ) : null}

                                {showMatchForm && resolvedClubId ? (
                                    <PanelMatchForm
                                        clubId={resolvedClubId}
                                        familyClubs={panelFamilyClubs}
                                        defaultDate={windowStartKey}
                                        onCancel={() => setShowMatchForm(false)}
                                        onCreated={() => {
                                            setShowMatchForm(false);
                                            setAgenda(null);
                                            setAgendaNonce(value => value + 1);
                                        }}
                                    />
                                ) : null}

                                {customRange ? (
                                    <div className={styles.customRange}>
                                        <label className={styles.customRangeField}>
                                            <span>Desde</span>
                                            <input
                                                type="date"
                                                className={styles.customRangeInput}
                                                value={customRange.from}
                                                onChange={event => {
                                                    const from = event.target.value;
                                                    if (!from) return;
                                                    // Si el desde se pasa del hasta, el hasta lo sigue:
                                                    // un plazo invertido no muestra nada y no explica por qué.
                                                    setCustomRange(current => ({
                                                        from,
                                                        to: current && current.to >= from ? current.to : from,
                                                    }));
                                                }}
                                            />
                                        </label>
                                        <label className={styles.customRangeField}>
                                            <span>Hasta</span>
                                            <input
                                                type="date"
                                                className={styles.customRangeInput}
                                                min={customRange.from}
                                                value={customRange.to}
                                                onChange={event => {
                                                    const to = event.target.value;
                                                    if (!to) return;
                                                    setCustomRange(current => ({
                                                        from: current && current.from <= to ? current.from : to,
                                                        to,
                                                    }));
                                                }}
                                            />
                                        </label>
                                        <span className={styles.customRangeNote}>
                                            {windowSpan === 400 ? 'Se muestran los primeros 400 días del plazo.' : windowSpan + (windowSpan === 1 ? ' día' : ' días')}
                                        </span>
                                    </div>
                                ) : null}

                                {windowTotal === 0 ? (
                                    <div className={styles.emptyState}>
                                        <p>{isSingleDay ? 'El club no juega esta jornada.' : 'El club no juega en este plazo.'}</p>
                                        {nearestDayWithMatches ? (
                                            <button
                                                type="button"
                                                className={styles.linkButton}
                                                onClick={() => goToDay(nearestDayWithMatches)}
                                            >
                                                Ir al {dayKeyLabel(nearestDayWithMatches)}
                                            </button>
                                        ) : null}
                                    </div>
                                ) : isSingleDay ? (
                                    /* Una sola jornada se lee por estado: qué se juega ahora, qué falta y
                                       qué terminó. La fecha ya la dice el encabezado. */
                                    <div className={styles.dayGroups}>
                                        {DAY_SECTIONS.map(section => {
                                            const sectionMatches = dayGroups[section.id];
                                            // Un grupo sin partidos colapsa: no reserva media pantalla vacía.
                                            if (!sectionMatches.length) return null;

                                            return (
                                                <section key={section.id} className={styles.dayGroup}>
                                                    <div className={styles.dayGroupHead}>
                                                        <span className={styles.dayGroupDot + ' ' + styles[section.tone]} aria-hidden="true" />
                                                        <h3 className={styles.dayGroupTitle}>{section.label}</h3>
                                                        <span className={styles.dayGroupCount}>{sectionMatches.length}</span>
                                                    </div>
                                                    <div className={styles.matchList}>
                                                        {sectionMatches.map(match => renderMatchItem(match, { managed: canManageClub }))}
                                                    </div>
                                                </section>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    /* Un plazo se lee por fecha: el estado de cada partido ya lo canta su
                                       marcador, y lo que falta saber es qué día se juega cada cosa. */
                                    <div className={styles.dayGroups}>
                                        {windowDays.map(day => (
                                            <section key={day.key} className={styles.dayGroup}>
                                                <div className={styles.dayGroupHead}>
                                                    <span className={styles.dayGroupDot + ' ' + styles[dayTone(day.matches)]} aria-hidden="true" />
                                                    <h3 className={styles.dayGroupTitle}>
                                                        {dayKeyLabel(day.key)}
                                                        {day.key === todayKey ? ' · hoy' : ''}
                                                    </h3>
                                                    <span className={styles.dayGroupCount}>{day.matches.length}</span>
                                                </div>
                                                <div className={styles.matchList}>
                                                    {day.matches.map(match => renderMatchItem(match, { managed: canManageClub }))}
                                                </div>
                                            </section>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'summary' && (
                            <>
                                {filteredResults.length > 0 && (
                                    <div className={styles.section}>
                                        <div className={styles.sectionHeader}>
                                            <h2>Ultimos Resultados</h2>
                                            <button className={styles.linkButton} onClick={() => setActiveTab('results')}>Ver todos</button>
                                        </div>
                                        <div className={styles.matchList}>
                                            {filteredResults.slice(0, 5).map(m => renderMatchItem(m))}
                                        </div>
                                    </div>
                                )}

                                {filteredFixtures.length > 0 && (
                                    <div className={styles.section} style={{ marginTop: '32px' }}>
                                        <div className={styles.sectionHeader}>
                                            <h2>Proximos Partidos</h2>
                                            <button className={styles.linkButton} onClick={() => setActiveTab('fixtures')}>Ver todos</button>
                                        </div>
                                        <div className={styles.matchList}>
                                            {filteredFixtures.slice(0, 5).map(m => renderMatchItem(m))}
                                        </div>
                                    </div>
                                )}

                                {relatedFamilyClubs.length > 0 && (
                                    <div className={styles.section} style={{ marginTop: '32px' }}>
                                        <div className={styles.sectionHeader}>
                                            <h2>Clubes relacionados</h2>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                                            {relatedFamilyClubs.map((club) => {
                                                const relatedSport = canonicalizeSportId(club.sport || club.sport_id || '');
                                                const href = relatedSport
                                                    ? `/clubs/${club.id}?sport=${encodeURIComponent(relatedSport)}`
                                                    : `/clubs/${club.id}`;

                                                return (
                                                    <Link
                                                        key={club.id}
                                                        href={href}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 12,
                                                            padding: 14,
                                                            borderRadius: 14,
                                                            border: '1px solid rgba(255,255,255,0.08)',
                                                            background: 'rgba(255,255,255,0.035)',
                                                            textDecoration: 'none',
                                                            color: 'inherit',
                                                        }}
                                                    >
                                                        <span style={{ width: 42, height: 42, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                                            {club.logo_url ? (
                                                                <img src={club.logo_url} alt={club.name || 'Club'} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                            ) : (
                                                                <span style={{ fontSize: 13, fontWeight: 800 }}>{String(club.name || 'C').slice(0, 2).toUpperCase()}</span>
                                                            )}
                                                        </span>
                                                        <span style={{ minWidth: 0 }}>
                                                            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {club.name}
                                                            </span>
                                                            <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--text-secondary, #888)' }}>
                                                                {club.is_base ? 'Club base' : 'Misma familia'}
                                                                {relatedSport ? ` · ${SPORT_LABEL[relatedSport] || relatedSport}` : ''}
                                                            </span>
                                                        </span>
                                                        <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-secondary, #888)' }} />
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {filteredResults.length === 0 && filteredFixtures.length === 0 && relatedFamilyClubs.length === 0 && (
                                    <p className={styles.emptyState}>No hay datos de partidos disponibles.</p>
                                )}
                            </>
                        )}

                        {/* Results Tab */}
                        {activeTab === 'results' && (
                            <div className={styles.section}>
                                <div className={styles.sectionHeader} style={{ marginBottom: '16px' }}>
                                    <h2 className={styles.pageTitle}>Resultados</h2>
                                    <ExportImage
                                        template="dailyMatches"
                                        filename={`resultados-${teamName}`}
                                        data={{
                                            date: 'Resultados',
                                            tournament: teamName,
                                            tournamentLogo: teamLogoUrl,
                                            matches: filteredResults.map(m => ({
                                                homeTeam: m.home_team?.name || m.event_home_team || m.home_team_name || 'Local',
                                                awayTeam: m.away_team?.name || m.event_away_team || m.away_team_name || 'Visitante',
                                                homeLogo: getTeamLogo(m.home_team) || m.home_team_logo || '',
                                                awayLogo: getTeamLogo(m.away_team) || m.away_team_logo || '',
                                                homeScore: m.scores?.home ?? m.scores?.home_score ?? m.home_score,
                                                awayScore: m.scores?.away ?? m.scores?.away_score ?? m.away_score,
                                                time: formatClubDate(m.timestamp || m.start_time || m.time, { day: '2-digit', month: '2-digit' }),
                                                status: 'finished' as const,
                                                dateLabel: formatClubDate(m.timestamp || m.start_time || m.time, { weekday: 'short', day: '2-digit', month: '2-digit' }),
                                                kickoffAt: (m.timestamp || m.start_time || m.time)
                                                    ? new Date((m.timestamp || m.start_time || m.time) * 1000).toISOString()
                                                    : undefined,
                                            })),
                                        }}
                                    />
                                </div>
                                <div className={styles.matchList}>
                                    {filteredResults.length > 0
                                        ? filteredResults.map(m => renderMatchItem(m))
                                        : <p className={styles.emptyState}>No hay resultados registrados.</p>
                                    }
                                </div>
                            </div>
                        )}

                        {/* Fixtures Tab */}
                        {activeTab === 'fixtures' && (
                            <div className={styles.section}>
                                <div className={styles.sectionHeader} style={{ marginBottom: '16px' }}>
                                    <h2 className={styles.pageTitle}>Fixture</h2>
                                    <ExportImage
                                        template="dailyMatches"
                                        filename={`fixture-${teamName}`}
                                        data={{
                                            date: 'Próximos Partidos',
                                            tournament: teamName,
                                            tournamentLogo: teamLogoUrl,
                                            matches: filteredFixtures.map(m => ({
                                                homeTeam: m.home_team?.name || m.event_home_team || m.home_team_name || 'Local',
                                                awayTeam: m.away_team?.name || m.event_away_team || m.away_team_name || 'Visitante',
                                                homeLogo: getTeamLogo(m.home_team) || m.home_team_logo || '',
                                                awayLogo: getTeamLogo(m.away_team) || m.away_team_logo || '',
                                                time: formatClubDate(m.timestamp || m.start_time || m.time, { hour: '2-digit', minute: '2-digit', hour12: false }) + ' ' +
                                                    formatClubDate(m.timestamp || m.start_time || m.time, { day: '2-digit', month: '2-digit' }),
                                                status: 'scheduled' as const,
                                                dateLabel: formatClubDate(m.timestamp || m.start_time || m.time, { weekday: 'short', day: '2-digit', month: '2-digit' }),
                                                kickoffAt: (m.timestamp || m.start_time || m.time)
                                                    ? new Date((m.timestamp || m.start_time || m.time) * 1000).toISOString()
                                                    : undefined,
                                            })),
                                        }}
                                    />
                                </div>
                                <div className={styles.matchList}>
                                    {filteredFixtures.length > 0
                                        ? filteredFixtures.map(m => renderMatchItem(m))
                                        : <p className={styles.emptyState}>No hay partidos programados.</p>
                                    }
                                </div>
                            </div>
                        )}

                        {activeTab === 'history' && (
                            <HistoryTab
                                clubId={resolvedClubId || rawId}
                                teamName={teamName}
                                selectedSport={selectedSport}
                            />
                        )}

                        {/* Titles Tab */}
                        {activeTab === 'titles' && (
                            <div className={styles.section}>
                                <div className={styles.sectionHeader} style={{ marginBottom: '16px' }}>
                                    <h2 className={styles.pageTitle}>Títulos</h2>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary, #888)' }}>
                                        {honoursByCompetition.reduce((total, comp) => total + comp.titles.length, 0)} títulos
                                        {' · '}
                                        {honoursByCompetition.reduce((total, comp) => total + comp.runnerUps.length, 0)} subcampeonatos
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gap: 10 }}>
                                    {honoursByCompetition.map((comp) => (
                                        <div
                                            key={comp.name}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: 12,
                                                padding: 14,
                                                borderRadius: 14,
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                background: 'rgba(255,255,255,0.035)',
                                            }}
                                        >
                                            <span style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.06)' }}>
                                                <Trophy size={20} style={{ color: comp.titles.length > 0 ? '#eab308' : 'var(--text-secondary, #888)' }} aria-hidden="true" />
                                            </span>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: 14, fontWeight: 700 }}>
                                                    {comp.name}
                                                    <span style={{ marginLeft: 8, fontWeight: 600, fontSize: 12, color: 'var(--text-secondary, #888)' }}>
                                                        {comp.titles.length > 0
                                                            ? `${comp.titles.length} ${comp.titles.length === 1 ? 'título' : 'títulos'}`
                                                            : `${comp.runnerUps.length} ${comp.runnerUps.length === 1 ? 'subcampeonato' : 'subcampeonatos'}`}
                                                    </span>
                                                </div>
                                                {comp.titles.length > 0 && (
                                                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary, #888)', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                                                        {comp.titles.join(' · ')}
                                                    </div>
                                                )}
                                                {comp.runnerUps.length > 0 && (
                                                    <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-secondary, #888)', overflowWrap: 'anywhere' }}>
                                                        Subcampeón: {comp.runnerUps.join(' · ')}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Squad Tab */}
                        {activeTab === 'squad' && (
                            <div className={styles.section}>
                                <div className={styles.sectionHeader} style={{ marginBottom: '16px' }}>
                                    <h2 className={styles.pageTitle}>Plantilla</h2>
                                    {squadExportData ? (
                                        <ExportImage
                                            template="squad"
                                            filename={`plantel-${teamName}`}
                                            data={squadExportData}
                                        />
                                    ) : null}
                                </div>
                                {squadLoading ? (
                                    <div>
                                        {[1, 2, 3, 4, 5, 6].map(i => (
                                            <div key={i} style={{ height: 52, borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
                                        ))}
                                        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
                                    </div>
                                ) : sortedPositionKeys.length > 0 ? (
                                    sortedPositionKeys.map(posIdx => (
                                        <div key={posIdx} className={styles.positionGroup}>
                                            <div className={styles.positionTitle}>
                                                {POSITION_LABELS[posIdx] || 'Otros'}
                                            </div>
                                            <div className={styles.tableCard}>
                                                {squadGroups[posIdx].map((player: any, idx: number) => {
                                                    const playerName = player.name || player.player_name || 'Jugador';
                                                    const playerPhoto = player.image_path || player.small_image_path || player.photo || '';
                                                    const playerCountry = player.country?.name || player.nationality || '';
                                                    const jerseyNumber = player.jersey_number || player.shirt_number || player.number || '';
                                                    const pId = player.player_id || player.id || '';
                                                    const playerPosition = player.position || player.position_name || '';
                                                    const playerDivision = player.team_name || player.tab_name || player.division_name || '';
                                                    const playerStatus = formatPlayerStatus(player.status);
                                                    const playerAge = typeof player.age === 'number' || typeof player.age === 'string'
                                                        ? player.age
                                                        : null;

                                                    return (
                                                        <div key={pId || idx} className={styles.playerRow}>
                                                            <div>
                                                                {playerPhoto ? (
                                                                    <img src={playerPhoto} alt={playerName} className={styles.playerPhoto} />
                                                                ) : (
                                                                    <div className={styles.playerPhotoPlaceholder} />
                                                                )}
                                                            </div>
                                                            <div className={styles.playerIdentity}>
                                                                <div className={styles.playerName}>
                                                                    {pId ? <Link href={`/players/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{playerName}</Link> : playerName}
                                                                </div>
                                                                {playerCountry && <div className={styles.playerCountry}>{playerCountry}</div>}
                                                                {(playerPosition || playerDivision) && (
                                                                    <div className={styles.playerMeta}>
                                                                        {playerPosition ? <span className={styles.playerMetaChip}>{playerPosition}</span> : null}
                                                                        {playerDivision ? <span className={styles.playerMetaChip}>{playerDivision}</span> : null}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className={styles.playerNumberBlock}>
                                                                <span className={styles.playerStatLabel}>Dorsal</span>
                                                                <span className={styles.playerNumber}>{jerseyNumber || '-'}</span>
                                                            </div>
                                                            <div className={styles.playerDetails}>
                                                                {playerAge !== null ? (
                                                                    <div className={styles.playerDetailItem}>
                                                                        <span className={styles.playerDetailLabel}>Edad</span>
                                                                        <span className={styles.playerDetailValue}>{playerAge}</span>
                                                                    </div>
                                                                ) : null}
                                                                {playerStatus ? (
                                                                    <div className={styles.playerDetailItem}>
                                                                        <span className={styles.playerDetailLabel}>Estado</span>
                                                                        <span className={styles.playerDetailValue}>{playerStatus}</span>
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className={styles.emptyState}>Plantilla no disponible.</p>
                                )}
                            </div>
                        )}

                        {/* Transfers Tab */}
                        {activeTab === 'transfers' && (
                            <div className={styles.section}>
                                <h2 className={styles.pageTitle} style={{ marginBottom: '16px' }}>Transferencias</h2>
                                {transfers.length > 0 ? (
                                    <div className={styles.tableCard}>
                                        <div className={styles.transferHeader}>
                                            <div>Jugador</div>
                                            <div>Desde</div>
                                            <div>Hacia</div>
                                            <div>Tipo</div>
                                            <div style={{ textAlign: 'right' }}>Fecha</div>
                                        </div>
                                        {transfers.map((transfer: any, idx: number) => {
                                            const playerName = transfer.player?.name || transfer.player_name || transfer.name || 'Jugador';
                                            const fromTeam = transfer.from_team?.name || transfer.team_from?.name || transfer.from || '-';
                                            const toTeam = transfer.to_team?.name || transfer.team_to?.name || transfer.to || '-';
                                            const fromLogo = getTeamLogo(transfer.from_team || transfer.team_from) || '';
                                            const toLogo = getTeamLogo(transfer.to_team || transfer.team_to) || '';
                                            const type = transfer.type || transfer.transfer_type || '-';
                                            const date = transfer.date || transfer.transfer_date || '-';

                                            return (
                                                <div key={transfer.id || idx} className={styles.transferRow}>
                                                    <div className={styles.transferPlayer}>{playerName}</div>
                                                    <div className={styles.transferTeam}>
                                                        {fromLogo && <img src={fromLogo} alt="" className={styles.teamLogoSmall} />}
                                                        {fromTeam}
                                                    </div>
                                                    <div className={styles.transferTeam}>
                                                        {toLogo && <img src={toLogo} alt="" className={styles.teamLogoSmall} />}
                                                        {toTeam}
                                                    </div>
                                                    <div className={styles.transferType}>{type}</div>
                                                    <div className={styles.transferDate}>{date}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className={styles.emptyState}>No hay transferencias disponibles.</p>
                                )}
                            </div>
                        )}

                    </div>

                    {/* Sidebar */}
                    <aside className={styles.sidebarRight}>
                        <div className={styles.card}>
                            <h3>Equipo</h3>
                            {teamLogoUrl && (
                                <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 12px' }}>
                                    <img src={teamLogoUrl} alt={teamName} style={{ width: 56, height: 56, objectFit: 'contain' }} />
                                </div>
                            )}
                            {countryName && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Pais</span>
                                    <span className={styles.value}>{countryName}</span>
                                </div>
                            )}
                            {details?.current_league && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Liga</span>
                                    <span className={styles.value}>{details.current_league}</span>
                                </div>
                            )}
                            {details?.current_season && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Temporada</span>
                                    <span className={styles.value}>{details.current_season}</span>
                                </div>
                            )}
                            {details?.standing?.position && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Posicion</span>
                                    <span className={styles.value}>#{details.standing.position}</span>
                                </div>
                            )}
                            {venue && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Estadio</span>
                                    <span className={styles.value}>{venue}</span>
                                </div>
                            )}
                            {coachName && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Director Tecnico</span>
                                    <span className={styles.value}>{coachName}</span>
                                </div>
                            )}
                            {details?.founded && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Fundado</span>
                                    <span className={styles.value}>{details.founded}</span>
                                </div>
                            )}
                            {details?.statistics && (
                                <>
                                    <div className={styles.infoRow}>
                                        <span className={styles.label}>PJ</span>
                                        <span className={styles.value}>{details.statistics.played ?? '-'}</span>
                                    </div>
                                    <div className={styles.infoRow}>
                                        <span className={styles.label}>G-E-P</span>
                                        <span className={styles.value}>
                                            {[details.statistics.wins, details.statistics.draws, details.statistics.losses]
                                                .map((value: any) => value ?? '-')
                                                .join('-')}
                                        </span>
                                    </div>
                                    <div className={styles.infoRow}>
                                        <span className={styles.label}>Pts +/-</span>
                                        <span className={styles.value}>
                                            {(details.statistics.pointsFor ?? '-')}/{(details.statistics.pointsAgainst ?? '-')}
                                        </span>
                                    </div>
                                </>
                            )}
                            {(details?.type || details?.club_type) && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Tipo</span>
                                    <span className={styles.value}>{details.type || details.club_type}</span>
                                </div>
                            )}
                            {(details?.short_code || details?.code) && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Codigo</span>
                                    <span className={styles.value}>{details.short_code || details.code}</span>
                                </div>
                            )}
                            {(details?.website || details?.website_url) && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Web</span>
                                    <a href={details.website || details.website_url} target="_blank" rel="noopener noreferrer" className={styles.value} style={{ wordBreak: 'break-all' }}>
                                        {(details.website || details.website_url).replace(/^https?:\/\//, '')}
                                    </a>
                                </div>
                            )}
                            {details?.description || details?.about ? (
                                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary, #888)', lineHeight: 1.5 }}>
                                    {details.description || details.about}
                                </div>
                            ) : null}
                            {details?.social_links && typeof details.social_links === 'object' && Object.keys(details.social_links).length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary, #888)', marginBottom: 6 }}>Redes</div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {Object.entries(details.social_links as Record<string, string>).map(([network, url]) =>
                                            url ? (
                                                <a key={network} href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, textTransform: 'capitalize' }}>
                                                    {network}
                                                </a>
                                            ) : null
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}

export default function TeamDetailClientPage({ id }: { id: string }) {
    return (
        <Suspense fallback={
            <div className={styles.loadingContainer}>
                <div className={styles.spinner}></div>
                <p>Cargando equipo...</p>
            </div>
        }>
            <TeamDetailInner id={id} />
        </Suspense>
    );
}
