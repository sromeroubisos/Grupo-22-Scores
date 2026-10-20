// Opciones que ofrece el onboarding: competiciones de un deporte y los clubes
// del deporte.
//
// Nada de esto es una lista nueva:
//  - Competiciones: las MISMAS fuentes que el selector de ligas de la portada
//    (torneos de la base + catálogo estático + catálogo externo de rugby). Si una
//    competición existe en la base y también viene de un proveedor externo
//    (FlashScore, ESPN...), manda la de la base y la externa no se ofrece.
//  - Clubes: todos los visibles del deporte en la base (/api/clubs) más los que
//    el feed de partidos muestra jugando (clubes de proveedor que no están en la
//    base). Ambas fuentes ya vienen filtradas por deporte.

import { getCachedMatches } from '@/hooks/useMatchesStore';
import { findCountryRecord, getCountryById } from '@/lib/data/countries';
import { buildEspnFootballTournaments, getEspnFootballInternationalTournaments } from '@/lib/data/tournaments/espnFootballCatalog';
import { getInternationalTournamentsBySport, getTournamentsBySport } from '@/lib/data/tournaments/index';
import { loadManualScopes, loadManualTournaments } from '@/lib/catalog/manualTournaments';
import { etiquetaDeTemporada } from '@/lib/tournamentSeasonFilter';
import type { Tournament } from '@/lib/types';
import { readCachedLeagueCatalog, writeCachedLeagueCatalog } from '@/lib/utils/leagueCatalogStorage';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import { generateLocalDateKeys } from '@/lib/timezone';
import { tipoDeLista } from '@/lib/leagueSections';

export interface LeagueOption {
    id: string;
    name: string;
    logo: string | null;
    /** País · rama · temporada: lo que distingue a dos competiciones de nombre parecido. */
    subtitle: string;
    priority: number;
    /** Id de país del catálogo ('argentina'); 'international' si no es de un país. */
    countryId: string;
    /** true si sale de la tabla `tournaments` (la fuente de verdad). */
    fromDb: boolean;
    /** Puntaje para ordenar: prioridad cargada > alcance (nacional/regional) > temporada vigente. */
    rank: number;
    /** 'nacional' | 'regional' | null (de una unión). Solo lo traen los torneos de la base. */
    scope: string | null;
    /** Es la edición de este año (o no declara año). Una edición vieja nunca se recomienda. */
    current: boolean;
}

export interface ClubOption {
    id: string;
    name: string;
    logo: string | null;
    /** Ciudad/país, o la competición en la que se lo vio jugar: ayuda a reconocerlo. */
    context: string;
    /** Id de país del catálogo, si se pudo resolver. */
    countryId: string | null;
    /** Ids de las competiciones en las que juega en la ventana: con esto se destacan los de las ligas elegidas. */
    leagueIds: string[];
    /** Club base del que es una categoría/rama ("Club M16" → "Club"), si la base lo sabe. */
    baseId: string | null;
}

// ─── País del visitante ──────────────────────────────────────────────────────

// Zona horaria → ISO-2. La zona es más confiable que el idioma del navegador
// (un argentino con el celular en inglés sigue estando en America/Argentina).
const TIMEZONE_PREFIX_TO_ISO: Array<[string, string]> = [
    ['America/Argentina/', 'AR'], ['America/Buenos_Aires', 'AR'], ['America/Montevideo', 'UY'],
    ['America/Santiago', 'CL'], ['America/Asuncion', 'PY'], ['America/La_Paz', 'BO'],
    ['America/Lima', 'PE'], ['America/Bogota', 'CO'], ['America/Guayaquil', 'EC'],
    ['America/Caracas', 'VE'], ['America/Sao_Paulo', 'BR'], ['America/Bahia', 'BR'],
    ['America/Fortaleza', 'BR'], ['America/Manaus', 'BR'], ['America/Mexico_City', 'MX'],
    ['America/Toronto', 'CA'], ['America/Vancouver', 'CA'], ['America/New_York', 'US'],
    ['America/Chicago', 'US'], ['America/Denver', 'US'], ['America/Los_Angeles', 'US'],
    ['Europe/Madrid', 'ES'], ['Europe/Paris', 'FR'], ['Europe/Rome', 'IT'], ['Europe/Lisbon', 'PT'],
    ['Europe/Berlin', 'DE'], ['Europe/Dublin', 'IE'], ['Europe/Tbilisi', 'GE'],
    ['Pacific/Auckland', 'NZ'], ['Africa/Johannesburg', 'ZA'], ['Australia/', 'AU'],
];

/** Id de país (del catálogo) donde parece estar el visitante, o null si no se puede saber. */
export function detectUserCountryId(): string | null {
    if (typeof window === 'undefined') return null;
    let iso: string | null = null;
    try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        iso = TIMEZONE_PREFIX_TO_ISO.find(([prefix]) => timeZone.startsWith(prefix))?.[1] ?? null;
    } catch {
        // Sin Intl: se prueba con el idioma.
    }
    if (!iso) {
        try {
            iso = new Intl.Locale(navigator.language).maximize().region ?? null;
        } catch {
            iso = null;
        }
    }
    return iso ? findCountryRecord(null, iso)?.id ?? null : null;
}

// ─── Competiciones ───────────────────────────────────────────────────────────

function describe(tournament: Tournament): string {
    const countryId = tournament.countryId || 'international';
    const country = countryId === 'international'
        ? 'Internacional'
        : getCountryById(countryId)?.nameEs || getCountryById(countryId)?.name || '';
    const parts = [
        country,
        tournament.isWomen || String(tournament.gender || '').toLowerCase().startsWith('f') ? 'Femenino' : null,
        tournament.subcategory || null,
        etiquetaDeTemporada(tournament.seasonId),
    ];
    return parts.filter(Boolean).join(' · ');
}

const SCOPE_WEIGHT: Record<string, number> = { nacional: 20, regional: 10 };

function toOption(tournament: Tournament, fromDb: boolean, scope?: string | null): LeagueOption | null {
    const name = String(tournament.displayName || tournament.nameEs || tournament.name || '').trim();
    if (!tournament.id || !name) return null;
    const priority = typeof tournament.priority === 'number' ? tournament.priority : 0;
    // Sin temporada o con la vigente cuenta como actual; una edición vieja baja al final.
    const isCurrent = etiquetaDeTemporada(tournament.seasonId) === null;
    return {
        id: tournament.id,
        name,
        logo: tournament.logoUrl || null,
        subtitle: describe(tournament),
        priority,
        countryId: tournament.countryId || 'international',
        fromDb,
        scope: scope ?? null,
        current: isCurrent,
        // La prioridad cargada a mano manda; a igualdad, el alcance y la temporada vigente.
        rank: priority * 100
            + (SCOPE_WEIGHT[String(scope ?? '')] ?? 0)
            + (isCurrent ? 5 : 0)
            // "Superior" es el primer grado de su división: el que la gente busca.
            + (String(tournament.subcategory ?? '').toLowerCase() === 'superior' ? 3 : 0),
    };
}

function isSeniorCompetition(tournament: Tournament, scope?: string | null): boolean {
    // El onboarding ofrece lo principal ("Competiciones", como el selector de la portada);
    // reserva y juveniles se buscan después desde ahí.
    return tournament.isVisible !== false && tipoDeLista({ ...tournament, scope }) === 'competiciones';
}

function squash(value: string): string {
    return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Las dos son la misma competición si un nombre contiene al otro (con piso de 4 letras para no unir "A" con "Liga A"). */
function sameCompetitionName(a: string, b: string): boolean {
    const left = squash(a);
    const right = squash(b);
    if (left.length < 4 || right.length < 4) return left === right;
    return left.includes(right) || right.includes(left);
}

/**
 * Une las competiciones de varias fuentes. La base manda: una competición de
 * proveedor se descarta si ya hay una de la base con el mismo país y el mismo
 * nombre (o uno que lo contenga: "Top 14" y "Top 14 de la URBA").
 */
function mergeOptions(db: Tournament[], others: Tournament[], scopes: Map<string, string | null>): LeagueOption[] {
    const fromDb = db.filter((t) => isSeniorCompetition(t, scopes.get(t.id))).map((t) => toOption(t, true, scopes.get(t.id))).filter((o): o is LeagueOption => o !== null);
    const byId = new Map<string, LeagueOption>(fromDb.map((option) => [option.id, option]));

    for (const tournament of others.filter((t) => isSeniorCompetition(t))) {
        const option = toOption(tournament, false);
        if (!option || byId.has(option.id)) continue;
        const duplicatesDb = fromDb.some((dbOption) => (
            dbOption.countryId === option.countryId && sameCompetitionName(dbOption.name, option.name)
        ));
        if (!duplicatesDb) byId.set(option.id, option);
    }

    // Orden estable: la base antes que cualquier otra fuente (es la fuente de verdad), luego relevancia, país y nombre.
    return [...byId.values()].sort((a, b) => (
        Number(b.fromDb) - Number(a.fromDb)
        || b.rank - a.rank
        || a.subtitle.localeCompare(b.subtitle, 'es')
        || a.name.localeCompare(b.name, 'es')
    ));
}

function staticTournaments(sportId: string): Tournament[] {
    return sportId === 'football'
        ? [...buildEspnFootballTournaments(), ...getEspnFootballInternationalTournaments()]
        : [...getTournamentsBySport(sportId as never), ...getInternationalTournamentsBySport(sportId as never)];
}

/**
 * Primera tanda: torneos de la base + catálogo estático. Es rápida (el pedido de
 * la base lo hace la portada al abrir y viaja cacheado). Si la base no contesta
 * se devuelve igual el estático y `partial` avisa para ofrecer un reintento.
 */
export async function loadPrimaryLeagueOptions(sportId: string): Promise<{ options: LeagueOption[]; partial: boolean }> {
    let db: Tournament[] = [];
    let scopes = new Map<string, string | null>();
    let partial = false;
    try {
        const [all, scopeById] = await Promise.all([loadManualTournaments(), loadManualScopes()]);
        db = all.filter((tournament) => tournament.sportId === sportId);
        scopes = scopeById;
    } catch {
        partial = true;
    }
    return { options: mergeOptions(db, staticTournaments(sportId), scopes), partial };
}

interface RugbyCatalogItem {
    id: string;
    name: string;
    display_name?: string | null;
    country_id?: string | null;
    country?: string | null;
    priority?: number | null;
    logo_url?: string | null;
    age_grade?: string | null;
    category?: string | null;
    gender?: string | null;
    subcategory?: string | null;
    season_id?: string | null;
}

async function loadRugbyCatalog(signal?: AbortSignal): Promise<Tournament[]> {
    let items = readCachedLeagueCatalog<RugbyCatalogItem>('rugby', 'all');
    if (!items) {
        const params = new URLSearchParams({ sport: 'rugby', scope: 'catalog', audience: 'all' });
        const response = await fetch(`/api/public/tournaments?${params.toString()}`, { signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.data)) throw new Error(payload.error || `HTTP ${response.status}`);
        items = payload.data as RugbyCatalogItem[];
        writeCachedLeagueCatalog('rugby', 'all', items);
    }
    return items.map((item) => ({
        id: item.id,
        name: item.display_name || item.name,
        displayName: item.display_name || item.name,
        originalName: item.name,
        countryId: item.country_id || 'international',
        priority: typeof item.priority === 'number' ? item.priority : 0,
        logoUrl: item.logo_url || null,
        ageGroup: item.age_grade || undefined,
        categories: item.category ? [item.category.toLowerCase()] : [],
        subcategory: item.subcategory ?? null,
        gender: item.gender ?? null,
        seasonId: item.season_id || null,
        sportId: 'rugby',
    }));
}

/**
 * Segunda tanda: el catálogo externo de rugby (lento: sale de un proveedor).
 * Devuelve SOLO lo que no estaba en `primary` y no repite a una competición de
 * la base, para que el listado crezca por abajo sin reordenarse.
 */
export async function loadExternalLeagueOptions(
    sportId: string,
    primary: LeagueOption[],
    signal?: AbortSignal,
): Promise<{ extra: LeagueOption[]; failed: boolean }> {
    if (sportId !== 'rugby') return { extra: [], failed: false };
    try {
        const external = await loadRugbyCatalog(signal);
        const dbOptions = primary.filter((option) => option.fromDb);
        const known = new Set(primary.map((option) => option.id));
        const extra = external
            .filter((tournament) => isSeniorCompetition(tournament))
            .map((tournament) => toOption(tournament, false))
            .filter((option): option is LeagueOption => (
                option !== null
                && !known.has(option.id)
                && !dbOptions.some((dbOption) => dbOption.countryId === option.countryId && sameCompetitionName(dbOption.name, option.name))
            ))
            .sort((a, b) => b.rank - a.rank || a.subtitle.localeCompare(b.subtitle, 'es') || a.name.localeCompare(b.name, 'es'));
        return { extra, failed: false };
    } catch {
        return { extra: [], failed: !signal?.aborted };
    }
}

// ─── Clubes ──────────────────────────────────────────────────────────────────

// Ayer, hoy y los dos días siguientes: cubre a los clubes de proveedor que no
// están en la base sin pedirle al servidor el mes entero.
const CLUB_WINDOW_FROM = -1;
const CLUB_WINDOW_TO = 2;
// PostgREST no devuelve más de 1000 filas por pedido: se pagina.
const CLUBS_PAGE_SIZE = 1000;
const CLUBS_MAX_PAGES = 6;

interface FeedMatch {
    tournament?: { id?: string | number | null; name?: string | null } | null;
    homeTeam?: { name?: string | null } | null;
    awayTeam?: { name?: string | null } | null;
    homeClubId?: string | null;
    awayClubId?: string | null;
}

interface DbClub {
    id: string;
    name: string;
    logo_url?: string | null;
    city?: string | null;
    country?: string | null;
    base_club_id?: string | null;
}

async function matchesOf(date: string, sportId: string, timeZone: string, signal?: AbortSignal): Promise<FeedMatch[]> {
    const cached = getCachedMatches(date, sportId);
    if (cached) return cached as FeedMatch[];

    const url = `/api/matches?date=${date}&sport=${sportId}&external=true&tz=${encodeURIComponent(timeZone)}`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
}

async function loadDbClubs(sportId: string, signal?: AbortSignal): Promise<DbClub[]> {
    const clubs: DbClub[] = [];
    for (let page = 0; page < CLUBS_MAX_PAGES; page++) {
        const url = `/api/clubs?sport=${encodeURIComponent(sportId)}&limit=${CLUBS_PAGE_SIZE}&offset=${page * CLUBS_PAGE_SIZE}&families=1`;
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const rows: DbClub[] = Array.isArray(payload?.data) ? payload.data : [];
        clubs.push(...rows);
        if (rows.length < CLUBS_PAGE_SIZE) break;
    }
    return clubs;
}

/**
 * Todos los clubes del deporte: los visibles de la base y los de proveedor que
 * el feed muestra jugando. Se trae una vez por deporte (se precarga mientras se
 * eligen las competiciones); cada club lleva los ids de sus competiciones para
 * destacar los de las ligas elegidas.
 */
export async function loadClubOptions(
    sportId: string,
    timeZone: string,
    signal?: AbortSignal,
): Promise<{ options: ClubOption[]; failed: boolean; partial: boolean }> {
    const dates = generateLocalDateKeys(timeZone, CLUB_WINDOW_FROM, CLUB_WINDOW_TO);
    const [dbResult, ...dayResults] = await Promise.allSettled([
        loadDbClubs(sportId, signal),
        ...dates.map((entry) => matchesOf(entry.dateKey, sportId, timeZone, signal)),
    ]);
    const dbClubs = dbResult.status === 'fulfilled' ? (dbResult.value as DbClub[]) : [];
    const feed = dayResults.flatMap((day) => (day.status === 'fulfilled' ? (day.value as FeedMatch[]) : []));
    const failedDays = dayResults.filter((day) => day.status === 'rejected').length;

    const byId = new Map<string, ClubOption>();
    for (const club of dbClubs) {
        const id = String(club.id || '').trim();
        const name = String(club.name || '').trim();
        if (!id || !name || byId.has(id)) continue;
        byId.set(id, {
            id,
            name,
            logo: club.logo_url || null,
            context: [club.city, club.country].filter(Boolean).join(', '),
            countryId: club.country ? findCountryRecord(null, club.country)?.id ?? null : null,
            leagueIds: [],
            baseId: club.base_club_id || null,
        });
    }

    for (const match of feed) {
        const leagueId = String(match.tournament?.id ?? '');
        const competition = String(match.tournament?.name ?? '').trim();
        const sides = [
            { id: match.homeClubId, team: match.homeTeam },
            { id: match.awayClubId, team: match.awayTeam },
        ];
        for (const side of sides) {
            const id = typeof side.id === 'string' ? side.id.trim() : '';
            const name = String(side.team?.name ?? '').trim();
            // Sin id de club no hay a qué seguir: la portada tampoco ofrece estrella ahí.
            if (!id || !name) continue;
            const existing = byId.get(id);
            if (existing) {
                if (leagueId && !existing.leagueIds.includes(leagueId)) existing.leagueIds.push(leagueId);
                if (!existing.context) existing.context = competition;
                continue;
            }
            byId.set(id, {
                id,
                name,
                logo: resolveTeamLogo(side.team as never) || null,
                context: competition,
                countryId: null,
                leagueIds: leagueId ? [leagueId] : [],
                baseId: null,
            });
        }
    }

    const dbFailed = dbResult.status === 'rejected';
    const failed = dbFailed && failedDays === dates.length;
    return {
        options: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        failed,
        partial: !failed && (dbFailed || failedDays > 0),
    };
}

// ─── Familias de clubes ──────────────────────────────────────────────────────

export interface ClubTree {
    /** Clubes que no son categoría de otro (o cuyo club base no está en la lista). */
    roots: ClubOption[];
    /** club base → sus categorías/ramas, ordenadas por nombre. */
    childrenOf: Map<string, ClubOption[]>;
}

/**
 * Agrupa los clubes derivados ("Club Femenino", "Club M16 B") bajo su club base.
 * Un derivado cuyo base no está en la lista se queda como club suelto, y un ciclo
 * en los datos nunca hace desaparecer a nadie: cada club termina siendo raíz o hijo.
 */
export function buildClubTree(options: ClubOption[]): ClubTree {
    const byId = new Map(options.map((club) => [club.id, club]));

    const rootOf = (club: ClubOption): ClubOption => {
        let current = club;
        for (let depth = 0; depth < 6; depth++) {
            const base = current.baseId ? byId.get(current.baseId) : undefined;
            if (!base) return current;
            current = base;
            if (current.id === club.id) return club;
        }
        return club;
    };

    const roots: ClubOption[] = [];
    const childrenOf = new Map<string, ClubOption[]>();
    for (const club of options) {
        const root = rootOf(club);
        if (root.id === club.id) {
            roots.push(club);
            continue;
        }
        const siblings = childrenOf.get(root.id);
        if (siblings) siblings.push(club);
        else childrenOf.set(root.id, [club]);
    }
    childrenOf.forEach((children) => children.sort((a, b) => a.name.localeCompare(b.name, 'es')));
    return { roots, childrenOf };
}

/** "Aero Club Río IV Femenino" bajo "Aero Club Río IV" se lee "Femenino". */
export function categoryLabel(child: ClubOption, root: ClubOption): string {
    if (child.name.startsWith(root.name)) {
        const rest = child.name.slice(root.name.length).replace(/^[\s\-–·:]+/, '').trim();
        if (rest) return rest;
    }
    return child.name;
}

// ─── Recomendadas por país ───────────────────────────────────────────────────

// Los regionales que cada país considera "los suyos", en el orden en que se ofrecen. Es una
// curaduría de qué competiciones recomendar (no una lista de datos): cada patrón se busca por
// nombre entre las competiciones de la BASE de este año. Los patrones son exactos a propósito:
// "Torneo Regional del NEA" no es "… NEA Ascenso" ni "Torneo Norpatagónico" es el Patagónico.
const CURATED_REGIONALS: Record<string, RegExp[]> = {
    argentina: [
        /^top 14 de la urba$/,
        /^top 10 del centro$/,
        /^torneo regional del noa a$/,
        /^copa oro\b/,
        /^torneo regional del litoral( a)?$/,
        /^torneo regional pampeano( [ab])?$/,
        /^torneo regional patagonico$/,
        /^torneo regional del nea$/,
    ],
};

/**
 * Qué se recomienda a quien está en `countryId`. Con curaduría (Argentina): sus regionales,
 * después los nacionales vigentes. Sin ella: los regionales y nacionales vigentes del país y,
 * si no hay ninguno, las vigentes de mayor relevancia. Siempre de la edición de este año.
 */
export function pickRecommendedLeagues(options: LeagueOption[], countryId: string, max = 20, fallbackMax = 8): LeagueOption[] {
    const ofCountry = options.filter((option) => option.countryId === countryId && option.current);
    const nationals = ofCountry.filter((option) => option.scope === 'nacional');

    const patterns = CURATED_REGIONALS[countryId];
    if (patterns) {
        const picked: LeagueOption[] = [];
        for (const pattern of patterns) {
            const match = ofCountry.find((option) => option.fromDb && pattern.test(squash(option.name)) && !picked.includes(option));
            if (match) picked.push(match);
        }
        const withNationals = [...picked, ...nationals.filter((option) => !picked.includes(option))];
        if (withNationals.length > 0) return withNationals.slice(0, max);
    }

    const scoped = ofCountry.filter((option) => option.scope === 'regional' || option.scope === 'nacional');
    return scoped.length > 0 ? scoped.slice(0, max) : ofCountry.slice(0, fallbackMax);
}

// ─── Clubes de una competición ───────────────────────────────────────────────

/**
 * Clubes inscriptos en la edición vigente de una competición de la base (o, si es
 * de un proveedor, los de su tabla). Es lo que hace que "los clubes de tus
 * competiciones" sean todos y no solo los que juegan en la ventana del feed.
 */
export async function loadLeagueClubs(
    leagueId: string,
    signal?: AbortSignal,
): Promise<Array<{ id: string; name: string; logo: string | null }>> {
    const response = await fetch(`/api/tournaments/${encodeURIComponent(leagueId)}/participants`, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rows: Array<{ id?: string | null; name?: string | null; logo?: string | null }> = Array.isArray(payload) ? payload : [];
    return rows
        .filter((row) => row.id && row.name)
        .map((row) => ({ id: String(row.id), name: String(row.name), logo: row.logo || null }));
}
