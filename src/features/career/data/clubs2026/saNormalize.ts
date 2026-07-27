// Normalización PURA de clubes AR/UY/CL desde el esquema real de Supabase al
// contrato canónico del motor. Sin dependencia de Supabase ni de red: recibe
// filas crudas y devuelve ClubDef[]. La usan tanto el generador del snapshot
// (scripts/gen-sa-clubs.mjs) como los tests.
//
// Todo lo de acá salió de una inspección de SOLO LECTURA del proyecto real.
// Las reglas están escritas explícitamente porque los datos tienen trampas:
//   · `sport='rugby'` NO alcanza: 84 clubes de HOCKEY están etiquetados así
//     (se detectan porque su unión es una federación de hockey).
//   · Muchas filas no son clubes sino EQUIPOS (M17 "A", Damas, Intermedia).
//   · Hay seleccionados y equipos representativos mezclados con clubes.
//   · `country` convive en dos formatos: 'Argentina' y 'ARG'.
//   · `club_divisions` está VACÍA: el nivel se deduce del torneo disputado.
//   · `logo_url` es un data-URI base64 enorme: NUNCA entra al snapshot.

import type { ClubDef } from '../clubs.ts';
import { CATALOG_SEASON } from './rosters2026.ts';

/** Fila cruda de `clubs` (subconjunto real de columnas; sin logo_url). */
export interface RawClubRow {
    id: string;
    name: string;
    short_name: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    slug: string | null;
    sport: string | null;
    union_id: string | null;
    is_visible: boolean;
}

export interface RawUnionRow {
    id: string;
    name: string;
}

/** Fila cruda de `tournament_standings` unida al nombre de su torneo. */
export interface RawStandingRow {
    club_id: string;
    tournament_name: string;
    played: number;
    won: number;
    scored: number;
    conceded: number;
}

// ── País ─────────────────────────────────────────────────────────────────────
// `clubs.country` guarda texto libre en dos formatos conviviendo.
const COUNTRY_ALIASES: Record<string, 'ar' | 'uy' | 'cl'> = {
    Argentina: 'ar', ARG: 'ar',
    Uruguay: 'uy', URY: 'uy',
    Chile: 'cl', CHL: 'cl',
};

const COMPETITION_BY_COUNTRY: Record<'ar' | 'uy' | 'cl', string> = {
    ar: 'sa-ar', uy: 'sa-uy', cl: 'sa-cl',
};

// ── Filtros de exclusión ─────────────────────────────────────────────────────
/** Unión de HOCKEY: sus clubes están mal etiquetados como sport='rugby'. */
const HOCKEY_UNION = /h[oó]ckey|hoquei/i;

/**
 * Equipos que no son el plantel superior de un club. Ojo con los sufijos: hay
 * que aceptar "Femenino"/"Juvenil" completos, no solo la raíz, y los marcadores
 * de equipo van tanto entre comillas ("A") como entre paréntesis ("(C)").
 */
const NON_SENIOR = /\b(m\s?-?1[0-9]|m\s?-?2[0-3]|sub\s?-?\d+|damas|femenin\w*|women|juvenil\w*|infantil\w*|cadet\w*|pre\s?intermedia|intermedia|reserva)\b|"\s?[abc]\s?"|\(\s?[abc]\s?\)$|\b[ab]\b$/i;

/**
 * Seleccionados y equipos representativos: no son clubes de carrera. El apóstrofo
 * del seven aparece como "7´s" en los datos reales, no como "7s".
 */
const REPRESENTATIVE = /\b(u-?\d{2}|7\s?[´'’]?\s?s|sevens?|fisu)\b/i;
const REPRESENTATIVE_NAMES = new Set(['Argentina XV', 'Santa Fe XV', 'Chile XV', 'Cuyo']);

/**
 * Franquicias de Super Rugby Americas que YA viven en el catálogo estático con
 * rating profesional explícito. La fila de Supabase se descarta: gana el
 * catálogo estático. Clave = nombre normalizado de la fila de Supabase.
 */
const SRA_DUPLICATES = new Set(['dogosxv', 'pampas', 'selknam', 'tarucas', 'capibarasxv', 'penarol']);

// ── Divisiones reales (del nombre del torneo disputado) ──────────────────────
// `club_divisions` está vacía, así que el nivel sale del torneo en el que el
// club aparece con partidos jugados. Los nombres son REALES; el tier es una
// asignación de DISEÑO del juego, explícita y versionada (no un hash).
export const DIVISION_TIERS: Record<string, number> = {
    // Tier 1 · máxima categoría doméstica
    'Top 14 de la URBA': 1,
    'Top 10 del Centro': 1,
    'Apertura - Super Uru de Clubes': 1,
    // Tier 2 · segunda categoría y torneos regionales principales
    'Primera "A" de la URBA': 2,
    'Torneo del Interior "B"': 2,
    'Provincial de Mendoza': 2,
    'Torneo Anual Tucumano': 2,
    'Torneo Regional Pampeano': 2,
    'Torneo Local de la URNE': 2,
    'Liga Norte Grande': 2,
    'Copa Oro del Oeste': 2,
    'Copa Oro URS': 2,
    'Torneo Regional Del Litoral "B"': 2,
    'Torneo Oficial Chubut': 2,
    'Torneo Local de Mar del Plata': 2,
    'Torneo Local de la Unión Austral': 2,
    'Torneo Regional Patagónico': 2,
    'Segunda División de ARUSA': 2,
    // Tier 3 · tercera categoría
    'Primera "B" de la URBA': 3,
    'Súper 9 "B"': 3,
    'Copa Plata del Oeste': 3,
    // Tier 4 · cuarta categoría
    'Primera "C" de la URBA': 4,
};

/**
 * Torneos que NO son una división doméstica de clubes: regionales profesionales
 * (los cubre el catálogo estático), seleccionados, seven y datos de prueba.
 */
export const NON_DIVISION_TOURNAMENTS = new Set([
    'Super Rugby Americas',
    'FISU AMERICA GAMES',
    'SVNS 2 - Femenino',
    'SVNS 2 - Masculino',
    'Test Torneo Auto-QA 2026',
]);

/** Rating base por división. Amateur: el techo duro es 46. */
const TIER_BASE: Record<number, number> = { 1: 43, 2: 38, 3: 33, 4: 28 };

/** Tier por defecto según la unión, para clubes sin standings. */
const UNION_DEFAULT_TIER: Record<string, number> = {
    URBA: 2,
    'Uru Rugby': 2,
    ARUSA: 2,
    'Unión Cordobesa de Rugby': 2,
};
const FALLBACK_TIER = 3;

export const AMATEUR_RATING_MAX = 46;
export const AMATEUR_RATING_MIN = 24;

function clampRating(value: number): number {
    return Math.max(AMATEUR_RATING_MIN, Math.min(AMATEUR_RATING_MAX, Math.round(value)));
}

export function normalizeName(value: string): string {
    return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
}

function shortNameOf(row: RawClubRow): string {
    const candidate = (row.short_name ?? '').trim();
    if (candidate.length > 0 && candidate.length <= 24) return candidate;
    return row.name.slice(0, 3).toUpperCase();
}

export interface NormalizeResult {
    clubs: ClubDef[];
    /** Motivo → cantidad de filas descartadas. Se reporta, no se esconde. */
    discarded: Record<string, number>;
}

/**
 * Convierte las filas crudas al contrato canónico. Determinístico: mismas filas
 * ⇒ mismo resultado, ordenado por id. No consulta nada ni muta la base.
 */
export function normalizeSaClubs(
    rows: RawClubRow[],
    unions: RawUnionRow[],
    standings: RawStandingRow[],
): NormalizeResult {
    const unionName = new Map(unions.map((u) => [u.id, u.name]));
    const discarded: Record<string, number> = {
        'otro deporte': 0, 'unión de hockey': 0, 'fuera de AR/UY/CL': 0,
        'no es plantel superior': 0, 'seleccionado/representativo': 0,
        'oculto (is_visible=false)': 0, 'duplica franquicia SRA estática': 0,
        'nombre duplicado en el mismo país': 0,
    };

    // Mejor standing de cada club: el de la división más alta y, a igual
    // división, el de más partidos jugados.
    const best = new Map<string, { tier: number; row: RawStandingRow }>();
    for (const s of standings) {
        if (s.played <= 0) continue;
        if (NON_DIVISION_TOURNAMENTS.has(s.tournament_name)) continue;
        const tier = DIVISION_TIERS[s.tournament_name];
        if (tier === undefined) continue;
        const current = best.get(s.club_id);
        if (!current || tier < current.tier || (tier === current.tier && s.played > current.row.played)) {
            best.set(s.club_id, { tier, row: s });
        }
    }

    const clubs: ClubDef[] = [];
    const seenName = new Set<string>();

    for (const row of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
        if (row.sport !== 'rugby') { discarded['otro deporte']++; continue; }
        if (HOCKEY_UNION.test(unionName.get(row.union_id ?? '') ?? '')) { discarded['unión de hockey']++; continue; }
        const countryCode = COUNTRY_ALIASES[row.country ?? ''];
        if (!countryCode) { discarded['fuera de AR/UY/CL']++; continue; }
        if (!row.is_visible) { discarded['oculto (is_visible=false)']++; continue; }
        if (NON_SENIOR.test(row.name)) { discarded['no es plantel superior']++; continue; }
        if (REPRESENTATIVE.test(row.name) || REPRESENTATIVE_NAMES.has(row.name)) {
            discarded['seleccionado/representativo']++; continue;
        }

        const key = normalizeName(row.name);
        if (SRA_DUPLICATES.has(key)) { discarded['duplica franquicia SRA estática']++; continue; }
        const dedupeKey = `${countryCode}|${key}`;
        if (seenName.has(dedupeKey)) { discarded['nombre duplicado en el mismo país']++; continue; }
        seenName.add(dedupeKey);

        const entry = best.get(row.id);
        const tier = entry?.tier ?? UNION_DEFAULT_TIER[unionName.get(row.union_id ?? '') ?? ''] ?? FALLBACK_TIER;
        const base = TIER_BASE[tier] ?? TIER_BASE[FALLBACK_TIER];

        // Ajuste por RENDIMIENTO REAL (no por hash del nombre).
        let adjustment = 0;
        if (entry) {
            const { played, won, scored, conceded } = entry.row;
            const winRate = won / played;
            const diffPerMatch = (scored - conceded) / played;
            adjustment = (winRate - 0.5) * 6 + Math.max(-1.5, Math.min(1.5, diffPerMatch / 12));
        }

        const rating = clampRating(base + adjustment);
        const competitionId = COMPETITION_BY_COUNTRY[countryCode];

        clubs.push({
            id: `sb-${row.id}`,
            labelEs: row.name,
            league: competitionId,
            prestige: clampRating(base * 0.9 + adjustment * 0.5),
            name: row.name,
            shortName: shortNameOf(row),
            countryCode,
            region: 'south-america',
            competitionId,
            level: 'amateur',
            rating,
            marketBand: 1,
            professionalStatus: 'amateur',
            source: 'supabase',
            sourceId: row.id,
            seasonVersion: CATALOG_SEASON,
            divisionName: entry ? entry.row.tournament_name : null,
            divisionTier: tier,
        });
    }

    return { clubs, discarded };
}
