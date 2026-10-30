import 'server-only';

/**
 * Qué columnas viajan al celular y cómo se leen las filas centrales.
 *
 * Columnas EXPLÍCITAS a propósito:
 * - `people`: nunca id_number, birth_date, email, phone, weight ni height (hay
 *   menores en el padrón; ver people_column_privileges). La puerta lee con
 *   service_role, así que la única defensa es esta lista.
 * - `clubs`: sin logo_url (puede ser base64 de cientos de KB por fila).
 *
 * Si una columna no existe en la base viva (la base y las migraciones del repo
 * divergen), se reintenta con la lista mínima en vez de romper la descarga.
 */
import type { LooseSupabaseClient } from '@/lib/supabase/loose';
import type { SyncEntity } from './protocol';

export const MOBILE_COLUMNS: Record<SyncEntity, { full: string; minimal: string }> = {
  tournaments: {
    full: 'id, name, display_name, slug, sport_id, status, category, season_id, union_id, is_visible, format, ruleset, current_season_id, created_by_user_id, created_at, updated_at',
    minimal: 'id, name, display_name, sport_id, status, union_id, ruleset',
  },
  tournament_phases: {
    full: 'id, tournament_id, season_id, name, phase_type, order_index, settings, updated_at',
    minimal: 'id, tournament_id, name, settings',
  },
  clubs: {
    full: 'id, name, short_name, sport, sport_id, union_id, city, is_visible, created_at, updated_at',
    minimal: 'id, name, short_name, sport_id, union_id',
  },
  tournament_participants: {
    full: 'id, tournament_id, club_id, status, season_id, updated_at',
    minimal: 'id, tournament_id, club_id',
  },
  people: {
    full: 'id, club_id, first_name, last_name, full_name, position, role, status, created_at, updated_at',
    minimal: 'id, club_id, first_name, last_name, full_name, position',
  },
  matches: {
    full: 'id, tournament_id, phase_id, round_label, home_club_id, away_club_id, home_team_id, away_team_id, season_id, date_time, venue, status, score, clock, lineups, notes, referee, official_sheet_number, is_visible, sport_id, sport, points_autocalculated, created_at, updated_at',
    minimal: 'id, tournament_id, phase_id, round_label, home_club_id, away_club_id, date_time, venue, status, score, notes',
  },
  match_events: {
    full: 'id, match_id, club_id, team_id, player_id, player_name, event_type, minute, details, season_id, created_at, updated_at',
    minimal: 'id, match_id, club_id, player_id, player_name, event_type, minute, details',
  },
};

export type CentralRow = Record<string, unknown> & { id: string };

const PAGE = 1000;
const ID_CHUNK = 100;

function isMissingColumn(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42703' || code === 'PGRST204';
}

/** Deja la fila con la forma que usa el celular (una sola columna de deporte en clubes). */
export function normalizeRow(entity: SyncEntity, row: Record<string, unknown>): CentralRow {
  if (entity === 'clubs') {
    const { sport, ...rest } = row;
    return { ...rest, sport_id: rest.sport_id ?? sport ?? null } as unknown as CentralRow;
  }
  return row as CentralRow;
}

type QueryBuilder = (columns: string) => { range: (from: number, to: number) => Promise<{ data: unknown[] | null; error: unknown }> };

/** Pagina de a 1000 (PostgREST corta ahí) y cae a la lista mínima si falta una columna. */
async function paged(entity: SyncEntity, build: QueryBuilder, columnsOverride?: string): Promise<CentralRow[]> {
  let columns = columnsOverride ?? MOBILE_COLUMNS[entity].full;
  const rows: CentralRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let { data, error } = await build(columns).range(from, from + PAGE - 1);
    if (error && !columnsOverride && isMissingColumn(error) && columns !== MOBILE_COLUMNS[entity].minimal) {
      columns = MOBILE_COLUMNS[entity].minimal;
      ({ data, error } = await build(columns).range(from, from + PAGE - 1));
    }
    if (error) throw error;
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page.map((row) => normalizeRow(entity, row)));
    if (page.length < PAGE) return rows;
  }
}

/** Filas de `entity` cuyo `column` está en `values`, en tandas de 100 ids. */
export async function selectIn(
  client: LooseSupabaseClient,
  entity: SyncEntity,
  column: string,
  values: Iterable<string>,
  refine?: (query: any) => any,
  /** Columnas propias (p. ej. solo ids para calcular el alcance). */
  columns?: string,
): Promise<CentralRow[]> {
  const unique = [...new Set([...values].filter(Boolean))];
  const out: CentralRow[] = [];
  for (let index = 0; index < unique.length; index += ID_CHUNK) {
    const chunk = unique.slice(index, index + ID_CHUNK);
    out.push(
      ...(await paged(entity, (columns) => {
        let query = client.from(entity).select(columns).in(column, chunk).order('id', { ascending: true });
        if (refine) query = refine(query);
        return query;
      }, columns)),
    );
  }
  return out;
}

/** Filas de `entity` que cumplen `refine` (sin filtro por lista). */
export async function selectWhere(
  client: LooseSupabaseClient,
  entity: SyncEntity,
  refine: (query: any) => any,
  columns?: string,
): Promise<CentralRow[]> {
  return paged(entity, (cols) => refine(client.from(entity).select(cols).order('id', { ascending: true })), columns);
}

export async function selectOne(client: LooseSupabaseClient, entity: SyncEntity, id: string): Promise<CentralRow | null> {
  const [row] = await selectIn(client, entity, 'id', [id]);
  return row ?? null;
}
