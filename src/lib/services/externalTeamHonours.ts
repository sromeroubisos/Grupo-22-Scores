/**
 * externalTeamHonours.ts
 *
 * Lectura del palmarés de equipos externos (`external_team_honours`).
 * Una fila por (equipo, competición, temporada, resultado); el agregado por
 * competición (cuántos títulos, qué años) se arma acá al leer, nunca se
 * persiste. Escriben los importadores (hoy: rugbyarchive-equipo.ts) vía
 * service_role.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';

export interface TeamHonourRow {
    id: number;
    team_id: string;
    sport: string;
    source: string;
    source_ref: string | null;
    competition_name: string;
    season: string;
    result: 'champion' | 'runner_up';
}

export interface TeamHonourSummary {
    competition_name: string;
    titles: string[];      // temporadas en que salió campeón, de la más nueva a la más vieja
    runner_ups: string[];  // temporadas de subcampeón
}

/**
 * Filas de palmarés para cualquiera de los ids con que puede estar anclado el
 * equipo (id crudo de FlashScore o 'ra-team-<id>'). Si el mismo logro quedó
 * escrito bajo dos anclas (import viejo sin vínculo + reimport vinculado), se
 * queda una sola.
 */
export async function getTeamHonours(
    teamIds: string[],
    supabase: SupabaseClient
): Promise<TeamHonourRow[]> {
    const ids = Array.from(new Set(teamIds.map((v) => String(v || '').trim()).filter(Boolean)));
    if (ids.length === 0) return [];

    const { data, error } = await supabase
        .from('external_team_honours')
        .select('*')
        .in('team_id', ids)
        .order('season', { ascending: false });

    if (error) {
        if (error.code === '42P01' || isMissingTableError(error, 'external_team_honours')) return [];
        console.warn('[externalTeamHonours] getTeamHonours error:', error.message);
        return [];
    }

    const seen = new Set<string>();
    const rows: TeamHonourRow[] = [];
    for (const row of (data || []) as TeamHonourRow[]) {
        const key = `${row.competition_name}|${row.season}|${row.result}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
    }
    return rows;
}

/** Agrupa el palmarés por competición, ordenado por cantidad de títulos. */
export function summarizeTeamHonours(rows: TeamHonourRow[]): TeamHonourSummary[] {
    const byCompetition = new Map<string, TeamHonourSummary>();
    for (const row of rows) {
        let entry = byCompetition.get(row.competition_name);
        if (!entry) {
            entry = { competition_name: row.competition_name, titles: [], runner_ups: [] };
            byCompetition.set(row.competition_name, entry);
        }
        if (row.result === 'champion') entry.titles.push(row.season);
        else entry.runner_ups.push(row.season);
    }
    return Array.from(byCompetition.values()).sort(
        (a, b) => b.titles.length - a.titles.length ||
            b.runner_ups.length - a.runner_ups.length ||
            a.competition_name.localeCompare(b.competition_name)
    );
}
