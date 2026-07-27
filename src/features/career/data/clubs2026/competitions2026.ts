// Grafo de competiciones y copas 2026-27. Puro y determinístico (sin red).
//  - 5 tipos: liga, copa eliminatoria, copa de liga, supercopa, copa internacional.
//  - CLASIFICACIÓN por CRITERIO REAL (pertenencia a la liga o POSICIÓN FINAL +
//    plazas), NUNCA por umbral de rating: el rating influye en simular el
//    resultado de una competición, no en quién entra a ella.
//  - Ascensos/descensos declarativos (nunca entre competiciones PARALELAS).
//  - Clasificar ≠ participar ≠ ganar. Este archivo resuelve QUIÉN PARTICIPA;
//    el resultado (y el título) lo resuelve engine/competition-results.ts.
//  - Una copa NUNCA es destino de fichaje.

import type { ClubDef } from '../clubs.ts';
import { LEAGUES } from '../clubs.ts';
import type { ClubLevel } from './rosters2026.ts';
import { CATALOG_SEASON, EXPECTED_COUNTS } from './rosters2026.ts';

export type CompetitionKind = 'league' | 'knockout-cup' | 'league-cup' | 'super-cup' | 'continental-cup';
export type CompetitionScope = 'domestic' | 'regional' | 'continental' | 'national-team';

/** Cómo se entra a una competición. */
export type QualificationCriterion =
    | 'membership' // el club pertenece a esa competición (liga propia, copa de liga)
    | 'league-position' // terminó entre las posiciones [from..to] de una liga
    | 'invitation'; // plaza de invitación (asignada por el organizador)

export interface QualificationRule {
    criterion: QualificationCriterion;
    /** Liga de origen. null solo para plazas de invitación. */
    sourceCompetitionId: string | null;
    /** Rango de posiciones finales (1 = campeón). null si el criterio no es posicional. */
    fromPosition: number | null;
    toPosition: number | null;
    slots: number;
    note?: string;
}

/** Posición final de un club en su liga (la unidad de clasificación). */
export interface LeagueStanding {
    competitionId: string;
    position: number; // 1 = campeón
    teams: number;
}

export interface CompetitionDef {
    id: string;
    label: string;
    kind: CompetitionKind;
    scope: CompetitionScope;
    region: string;
    seasonVersion: string;
    isTransferDestination: boolean; // ligas sí; copas NO
    /** Plazas totales (null = todos los miembros de la competición de origen). */
    totalTeams: number | null;
    /**
     * Dispersión del resultado, en puntos de rating. Cuanto más alta, más
     * probable es que gane un club que no es el más fuerte del campo. Una liga
     * larga es menos aleatoria que una final única.
     */
    volatility: number;
    qualification: QualificationRule[];
}

// Título concreto ganado (para titlesWon[]).
export interface TitleWon {
    competitionId: string;
    season: string;
    club: string; // id de club
    category: CompetitionKind;
    scope: CompetitionScope;
}

// Cuanto más corta y eliminatoria es la competición, más azar admite.
const KIND_VOLATILITY: Record<CompetitionKind, number> = {
    league: 6,
    'league-cup': 9,
    'continental-cup': 10,
    'knockout-cup': 11,
    'super-cup': 14,
};

// Las ligas de nivel bajo son más parejas (menos separación real entre clubes).
const LEVEL_VOLATILITY_BONUS: Record<ClubLevel, number> = {
    'elite-world': 0,
    'elite-pro': 0,
    'pro-second': 1,
    'pro-regional': 1,
    semipro: 2,
    development: 2,
    amateur: 3,
};

function membership(competitionId: string, slots: number, note?: string): QualificationRule {
    return { criterion: 'membership', sourceCompetitionId: competitionId, fromPosition: null, toPosition: null, slots, note };
}

function byPosition(competitionId: string, from: number, to: number, note?: string): QualificationRule {
    return {
        criterion: 'league-position',
        sourceCompetitionId: competitionId,
        fromPosition: from,
        toPosition: to,
        slots: to - from + 1,
        note,
    };
}

function invitation(slots: number, note: string): QualificationRule {
    return { criterion: 'invitation', sourceCompetitionId: null, fromPosition: null, toPosition: null, slots, note };
}

// ── Ligas (una por competición del catálogo) + ids simbólicos AR/UY/CL ───────
function buildLeagues(): CompetitionDef[] {
    const leagues: CompetitionDef[] = Object.values(LEAGUES).map((lg) => ({
        id: lg.id,
        label: lg.labelEs,
        kind: 'league' as const,
        scope: lg.kind === 'regional-franchise' ? ('regional' as const) : ('domestic' as const),
        region: lg.region,
        seasonVersion: CATALOG_SEASON,
        isTransferDestination: true,
        totalTeams: EXPECTED_COUNTS[lg.id] ?? null,
        volatility: KIND_VOLATILITY.league + LEVEL_VOLATILITY_BONUS[lg.level],
        qualification: [membership(lg.id, EXPECTED_COUNTS[lg.id] ?? 0, 'pertenece a la liga')],
    }));

    // Ligas AR/UY/CL: si el snapshot de Supabase las pobló ya vienen de LEAGUES;
    // si no (snapshot vacío), se registran igual como ids simbólicos para que el
    // grafo no quede con referencias colgando.
    const present = new Set(leagues.map((l) => l.id));
    for (const [id, label] of [['sa-ar', 'Liga Argentina'], ['sa-uy', 'Liga Uruguaya'], ['sa-cl', 'Liga Chilena']] as const) {
        if (present.has(id)) continue;
        leagues.push({
            id, label, kind: 'league', scope: 'domestic', region: 'south-america',
            seasonVersion: CATALOG_SEASON, isTransferDestination: true, totalTeams: null,
            volatility: KIND_VOLATILITY.league + LEVEL_VOLATILITY_BONUS.amateur,
            qualification: [membership(id, 0, 'pertenece a la liga')],
        });
    }
    return leagues;
}

// ── Copas: clasificación por CRITERIO REAL, NUNCA destino de fichaje ─────────
export const CUPS: CompetitionDef[] = [
    {
        // Champions Cup 2026/27: 24 clubes = 8 Top 14 + 8 URC + 8 PREM, por
        // posición final en la liga de origen.
        // Fuente: https://www.epcrugby.com/champions-cup/qualification
        id: 'champions-cup', label: 'Champions Cup', kind: 'continental-cup', scope: 'continental', region: 'europe',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: 24,
        volatility: KIND_VOLATILITY['continental-cup'],
        qualification: [
            byPosition('top14', 1, 8, '8 plazas Top 14'),
            byPosition('urc', 1, 8, '8 plazas URC'),
            byPosition('prem', 1, 8, '8 plazas PREM'),
        ],
    },
    {
        // Challenge Cup 2026/27: 18 clubes = 8 URC + 6 Top 14 + 2 PREM + 2 invitados.
        // Los 2 invitados NO se inventan: quedan como plaza declarada sin asignar
        // hasta que EPCR los publique (ver PENDING_QUALIFICATIONS).
        // Fuentes: https://www.epcrugby.com/challenge-cup/ecc-qualification
        //          https://www.epcrugby.com/champions-cup/content/epcr-pool-draws-for-202627-season
        id: 'challenge-cup', label: 'Challenge Cup', kind: 'continental-cup', scope: 'continental', region: 'europe',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: 18,
        volatility: KIND_VOLATILITY['continental-cup'] + 1,
        qualification: [
            byPosition('urc', 9, 16, '8 plazas URC'),
            byPosition('top14', 9, 14, '6 plazas Top 14'),
            byPosition('prem', 9, 10, '2 plazas PREM'),
            invitation(2, 'invitados EPCR 2026/27 sin publicar'),
        ],
    },
    {
        id: 'prem-rugby-cup', label: 'PREM Rugby Cup', kind: 'league-cup', scope: 'domestic', region: 'europe',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: null,
        volatility: KIND_VOLATILITY['league-cup'],
        qualification: [membership('prem', 10, 'copa de liga: la disputan los clubes de PREM')],
    },
    {
        // Simplificación documentada: se modela abierta a División de Honor y
        // División de Honor Élite (criterio de PERTENENCIA, no de rating).
        id: 'copa-del-rey', label: 'Copa del Rey', kind: 'knockout-cup', scope: 'domestic', region: 'europe-emerging',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: null,
        volatility: KIND_VOLATILITY['knockout-cup'],
        qualification: [
            membership('esp-dh', 10, 'clubes de División de Honor'),
            membership('esp-dhelite', 10, 'clubes de División de Honor Élite'),
        ],
    },
    {
        // Supercopa: campeón de liga vs campeón de copa. Simplificación
        // documentada: las dos primeras posiciones de División de Honor.
        id: 'supercopa-esp', label: 'Supercopa de España', kind: 'super-cup', scope: 'domestic', region: 'europe-emerging',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: 2,
        volatility: KIND_VOLATILITY['super-cup'],
        qualification: [byPosition('esp-dh', 1, 2, 'campeón de liga + campeón de copa (aprox.)')],
    },
];

export const LEAGUES_COMP: CompetitionDef[] = buildLeagues();
export const ALL_COMPETITIONS: CompetitionDef[] = [...LEAGUES_COMP, ...CUPS];

/**
 * Plazas declaradas cuyo ocupante todavía NO publicó el organizador. Se
 * documentan como pendientes (no se inventan) y no rompen el grafo: nadie
 * clasifica por esa vía hasta que exista el dato real.
 */
export const PENDING_QUALIFICATIONS: { competitionId: string; slots: number; note: string }[] = CUPS.flatMap((cup) =>
    cup.qualification
        .filter((rule) => rule.criterion === 'invitation')
        .map((rule) => ({ competitionId: cup.id, slots: rule.slots, note: rule.note ?? 'plaza de invitación sin asignar' })),
);

// ── Ascensos/descensos declarativos (solo escaleras domésticas verticales) ───
export interface MovementRule {
    from: string;
    to: string;
    slots: number;
    kind: 'auto' | 'playoff';
    direction: 'promotion' | 'relegation';
}

export const MOVEMENTS: MovementRule[] = [
    { from: 'prod2', to: 'top14', slots: 2, kind: 'playoff', direction: 'promotion' },
    { from: 'nationale', to: 'prod2', slots: 1, kind: 'playoff', direction: 'promotion' },
    { from: 'championship', to: 'prem', slots: 1, kind: 'playoff', direction: 'promotion' },
    { from: 'esp-dhelite', to: 'esp-dh', slots: 1, kind: 'playoff', direction: 'promotion' },
    { from: 'esp-dhb', to: 'esp-dhelite', slots: 1, kind: 'playoff', direction: 'promotion' },
    { from: 'jpn-d2', to: 'jpn-d1', slots: 1, kind: 'playoff', direction: 'promotion' },
    { from: 'jpn-d3', to: 'jpn-d2', slots: 1, kind: 'playoff', direction: 'promotion' },
    { from: 'top14', to: 'prod2', slots: 2, kind: 'auto', direction: 'relegation' },
    { from: 'prod2', to: 'nationale', slots: 1, kind: 'auto', direction: 'relegation' },
    { from: 'prem', to: 'championship', slots: 1, kind: 'auto', direction: 'relegation' },
    { from: 'esp-dh', to: 'esp-dhelite', slots: 1, kind: 'auto', direction: 'relegation' },
    { from: 'esp-dhelite', to: 'esp-dhb', slots: 1, kind: 'auto', direction: 'relegation' },
    { from: 'jpn-d1', to: 'jpn-d2', slots: 1, kind: 'auto', direction: 'relegation' },
    { from: 'jpn-d2', to: 'jpn-d3', slots: 1, kind: 'auto', direction: 'relegation' },
];

// Competiciones PARALELAS: nunca hay ascenso/descenso entre ellas ni con ligas.
// `sra` (Super Rugby Americas) es paralela a las ligas domésticas AR/UY/CL:
// jugar ahí no es "ascender" desde el club doméstico.
export const PARALLEL_COMPETITIONS = new Set([
    'npc', 'super-rugby', 'urc', 'currie-premier', 'currie-first', 'super-cup', 'sra',
]);

// ── API ──────────────────────────────────────────────────────────────────────
/**
 * ¿El club CLASIFICA a esta competición, dada su posición final en la liga?
 * El rating NO participa de esta decisión.
 */
export function qualifiesFor(comp: CompetitionDef, club: ClubDef, standing: LeagueStanding | null): boolean {
    for (const rule of comp.qualification) {
        switch (rule.criterion) {
            case 'membership':
                if (club.competitionId === rule.sourceCompetitionId) return true;
                break;
            case 'league-position': {
                if (!standing || standing.competitionId !== rule.sourceCompetitionId) break;
                if (club.competitionId !== rule.sourceCompetitionId) break;
                const from = rule.fromPosition ?? 1;
                const to = rule.toPosition ?? standing.teams;
                if (standing.position >= from && standing.position <= to) return true;
                break;
            }
            case 'invitation':
                // Plaza sin asignar: nadie clasifica por invitación hasta tener el dato real.
                break;
        }
    }
    return false;
}

/**
 * Competiciones que el club DISPUTA esta temporada: su liga + las copas a las
 * que clasificó. Participar no es ganar: el resultado lo resuelve el motor.
 */
export function participatingCompetitions(club: ClubDef, standing: LeagueStanding | null): CompetitionDef[] {
    return ALL_COMPETITIONS.filter((comp) => qualifiesFor(comp, club, standing));
}

/** Destinos de FICHAJE posibles: solo ligas (una copa nunca es destino). */
export function transferDestinations(): CompetitionDef[] {
    return ALL_COMPETITIONS.filter((comp) => comp.isTransferDestination && comp.kind === 'league');
}

export function getCompetition(id: string): CompetitionDef | undefined {
    return ALL_COMPETITIONS.find((c) => c.id === id);
}
