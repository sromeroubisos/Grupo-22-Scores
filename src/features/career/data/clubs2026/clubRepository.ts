// ClubRepository: fuente de clubes de Argentina/Uruguay/Chile. El MOTOR nunca
// consulta Supabase directamente — recibe un SNAPSHOT (estático internacional +
// SA del repositorio) y trabaja con eso, para reproducir carreras.
//
// La MCP de Supabase sigue SIN autorizar (el servidor responde "Unauthorized:
// provide a valid access token"), así que acá va la INTERFAZ + un ADAPTADOR DE
// FIXTURES (datos de prueba, claramente marcados).
//
// VERIFICADO contra `src/lib/database.types.ts` (tipos generados del esquema
// real): la tabla `clubs` existe y tiene exactamente estas columnas —
//   categories, city, country, created_at, id, is_visible, logo_url, name,
//   primary_color, region, short_name, slug, sport, sport_id, union_id, updated_at
// Los nombres de abajo NO están inventados: son un subconjunto de esa lista.
//
// PENDIENTE de inspección en modo lectura (no se puede deducir del esquema):
//   · qué valor concreto de `sport_id` / `sport` identifica al rugby;
//   · qué valores toma `country` para Argentina/Uruguay/Chile;
//   · cuántas filas de rugby hay por país y si hay duplicados por nombre;
//   · a qué apunta `union_id` y si sirve para derivar la competición/nivel.
// Hasta responder eso NO se escribe el adaptador real: sería suponer el dato.

import type { ClubDef } from '../clubs.ts';
import { CLUBS as WORLD_CLUBS } from '../clubs.ts';
import { SA_CLUBS, SA_SNAPSHOT_VERSION } from './saClubs.generated.ts';

// Subconjunto REAL de columnas de la tabla `clubs` de Supabase (database.types).
export interface SupabaseClubRow {
    id: string;
    name: string;
    short_name: string | null;
    country: string | null; // 'Argentina' | 'Uruguay' | 'Chile' | ...
    region: string | null;
    city: string | null;
    slug: string | null;
    sport: string | null;
    sport_id: string | null;
    union_id: string | null;
    is_visible: boolean;
    logo_url: string | null;
}

export type SaCountry = 'Argentina' | 'Uruguay' | 'Chile';

const COUNTRY_CODE: Record<SaCountry, string> = { Argentina: 'ar', Uruguay: 'uy', Chile: 'cl' };

export interface ClubRepository {
    /** Clubes activos de AR/UY/CL, ya normalizados al contrato del motor. */
    listSouthAmericaClubs(): Promise<ClubDef[]>;
}

// Mapea una fila real de Supabase → ClubDef del motor. Nivel AMATEUR (regla dura:
// ningún club amateur AR/UY/CL supera rating 46). El rating fino se explicita
// cuando se carguen los clubes reales; acá va un valor amateur estable.
export function rowToClubDef(row: SupabaseClubRow, ratingOverride?: number): ClubDef {
    const country = (row.country ?? 'Argentina') as SaCountry;
    const rating = Math.min(46, Math.max(24, ratingOverride ?? 38));
    const competitionId = `sa-${COUNTRY_CODE[country] ?? 'ar'}`;
    return {
        id: `sb-${row.id}`,
        labelEs: row.name,
        league: competitionId,
        prestige: rating,
        name: row.name,
        shortName: row.short_name ?? row.name.slice(0, 3).toUpperCase(),
        countryCode: COUNTRY_CODE[country] ?? 'ar',
        region: 'south-america',
        competitionId,
        level: 'amateur',
        rating,
        marketBand: 1,
        professionalStatus: 'amateur',
        source: 'supabase',
        sourceId: row.id,
        seasonVersion: '2026-27',
    };
}

// Adaptador de FIXTURES: datos de prueba (NO reales) para poder ejercitar el
// merge y el motor sin Supabase. Se reemplaza por SupabaseClubRepository cuando
// haya acceso autorizado. Nombres marcados como fixture a propósito.
export class FixturesClubRepository implements ClubRepository {
    async listSouthAmericaClubs(): Promise<ClubDef[]> {
        const row = (id: string, name: string, short: string, country: SaCountry): SupabaseClubRow => ({
            id, name, short_name: short, country, region: null, city: null, slug: null,
            sport: 'rugby', sport_id: null, union_id: null, is_visible: true, logo_url: null,
        });
        const rows: SupabaseClubRow[] = [
            row('fx-ar-1', 'Fixture AR 1', 'FA1', 'Argentina'),
            row('fx-ar-2', 'Fixture AR 2', 'FA2', 'Argentina'),
            row('fx-uy-1', 'Fixture UY 1', 'FU1', 'Uruguay'),
            row('fx-cl-1', 'Fixture CL 1', 'FC1', 'Chile'),
        ];
        return rows.map((r, i) => rowToClubDef(r, 42 - i * 3));
    }
}

/**
 * Repositorio que consume el MOTOR: lee el snapshot estático generado desde
 * Supabase (`scripts/gen-sa-clubs.mjs`). Es la pieza que hace reproducible una
 * carrera: el motor nunca toca la red ni depende de filas mutables.
 */
export class StaticSaClubRepository implements ClubRepository {
    async listSouthAmericaClubs(): Promise<ClubDef[]> {
        return SA_CLUBS;
    }
}

export interface CatalogSnapshot {
    catalogVersion: string; // versión del catálogo estático internacional
    saSnapshotVersion: string; // hash del contenido traído de Supabase
    snapshotVersion: string; // versión del catálogo normalizado completo
    clubs: ClubDef[];
    counts: { total: number; static: number; supabase: number; ar: number; uy: number; cl: number };
}

// Hash del CONTENIDO (no solo de los ids): si cambia un rating, cambia la versión.
function contentHash(clubs: ClubDef[]): string {
    let h = 2166136261 >>> 0;
    const key = clubs
        .map((c) => `${c.id}|${c.rating}|${c.prestige}|${c.level}|${c.competitionId}`)
        .sort()
        .join(',');
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36);
}

/**
 * Arma el snapshot que consume el motor: catálogo internacional estático +
 * clubes AR/UY/CL del repositorio. Determinístico dado el mismo repo.
 * Ante un id repetido gana el catálogo estático (tiene rating explícito).
 */
export async function buildCatalogSnapshot(repo: ClubRepository, catalogVersion: string): Promise<CatalogSnapshot> {
    const sa = await repo.listSouthAmericaClubs();
    const seen = new Set(WORLD_CLUBS.map((c) => c.id));
    // ARGENTINA YA NO SALE DE ACÁ. Sus clubes vienen del canon
    // (`arSystem2026.ts`), con su división real y su rama. Una fila argentina del
    // repositorio que no matcheó con el canon entraría como club de `sa-ar`, que
    // es una liga que dejó de existir: quedaría en un torneo fantasma, sin campo
    // competitivo y sin título posible. El repositorio sirve Uruguay y Chile.
    const extra = sa.filter((c) => !seen.has(c.id) && c.countryCode !== 'ar');
    const merged = [...WORLD_CLUBS, ...extra];
    const fromSupabase = merged.filter((c) => c.source === 'supabase');
    // Se cuenta POR PAÍS sobre el catálogo fusionado, sin mirar el `source`: a
    // los argentinos los pone el canon y antes esto los contaba como cero.
    const byCountry = (cc: string) => merged.filter((c) => c.countryCode === cc).length;

    return {
        catalogVersion,
        saSnapshotVersion: SA_SNAPSHOT_VERSION,
        snapshotVersion: `${catalogVersion}+sa.${contentHash(merged)}`,
        clubs: merged,
        counts: {
            total: merged.length,
            static: merged.filter((c) => c.source === 'career-static').length,
            supabase: fromSupabase.length,
            ar: byCountry('ar'),
            uy: byCountry('uy'),
            cl: byCountry('cl'),
        },
    };
}
