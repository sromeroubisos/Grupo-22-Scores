import 'server-only';

/**
 * Buscador del generador de overlays y del panel del marcador manual
 * (`GET /api/overlay?tipo=buscar&q=…`). Con un nombre devuelve:
 *
 *  - clubes con nombre corto, color y escudo (para llenar un marcador manual
 *    con un toque, sin tipear nada),
 *  - partidos de G22 de esos clubes, de tres semanas atrás a tres adelante
 *    (para elegir el partido sin ir a buscar el link),
 *  - torneos (para la tabla, la fecha, el playoff o los goleadores).
 *
 * Solo lo público: clubes y torneos visibles, partidos visibles. Los escudos
 * van por el proxy, nunca `clubs.logo_url` (base64 de hasta 200 KB).
 */
import { getReadClient } from '@/lib/supabase/read';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import { matchContext, rel, str, tournamentLogo, visible } from '@/lib/server/overlayFeed';

type Row = Record<string, unknown>;

export interface OverlaySearchClub {
  id: string;
  name: string;
  short: string;
  color: string | null;
  logo: string | null;
}

export interface OverlaySearchMatch {
  id: string;
  dateTime: string | null;
  status: string;
  home: OverlaySearchClub;
  away: OverlaySearchClub;
  tournament: string | null;
  context: string | null;
}

export interface OverlaySearchTournament {
  id: string;
  name: string;
  logo: string | null;
}

export interface OverlaySearchResult {
  clubs: OverlaySearchClub[];
  matches: OverlaySearchMatch[];
  tournaments: OverlaySearchTournament[];
}

const CLUB_COLUMNS = 'id, name, short_name, primary_color';
const WINDOW_DAYS = 21;

/** Lo que tipea el productor va a un `ilike`: sin comodines ni separadores de filtro. */
function searchTerm(raw: string): string {
  return raw.replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function toClub(row: Row | null): OverlaySearchClub | null {
  const id = str(row?.id);
  if (!row || !id) return null;
  const name = str(row.name) ?? 'Club';
  return {
    id,
    name,
    short: str(row.short_name) ?? name,
    color: str(row.primary_color),
    logo: buildTeamLogoProxyUrl({ key: id, name }),
  };
}

export async function searchOverlay(rawQuery: string): Promise<OverlaySearchResult> {
  const term = searchTerm(rawQuery);
  if (term.length < 2) return { clubs: [], matches: [], tournaments: [] };
  const db = await getReadClient();
  const pattern = `%${term}%`;

  const [byName, byShort, tournamentsRes] = await Promise.all([
    db.from('clubs').select(`${CLUB_COLUMNS}, is_visible`).ilike('name', pattern).order('name').limit(60),
    db.from('clubs').select(`${CLUB_COLUMNS}, is_visible`).ilike('short_name', pattern).order('name').limit(20),
    db.from('tournaments').select('id, name, is_visible').ilike('name', pattern).order('name').limit(20),
  ]);

  // Un club tiene muchas versiones (M19, 7s, Intermedia…): para los PARTIDOS se
  // miran todas, incluso las ocultas —el partido trae su propia visibilidad—;
  // para elegir un CLUB se ofrecen solo las visibles, el nombre más corto
  // primero (el club principal antes que sus categorías).
  const seen = new Set<string>();
  const allRows: Row[] = [];
  for (const row of [...((byName.data ?? []) as Row[]), ...((byShort.data ?? []) as Row[])]) {
    const id = str(row.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    allRows.push(row);
  }
  const clubs = allRows
    .filter((row) => row.is_visible !== false)
    .map((row) => toClub(row))
    .filter((item): item is OverlaySearchClub => Boolean(item))
    .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, 10);

  let matches: OverlaySearchMatch[] = [];
  if (allRows.length) {
    const ids = allRows.map((row) => String(row.id)).slice(0, 60);
    const now = Date.now();
    const from = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();
    const to = new Date(now + WINDOW_DAYS * 86_400_000).toISOString();
    const select = [
      'id, date_time, status, round_label, is_visible, review_status',
      `homeClub:home_club_id (${CLUB_COLUMNS})`,
      `awayClub:away_club_id (${CLUB_COLUMNS})`,
      'tournament:tournament_id (id, name)',
      'phase:phase_id (name)',
      'zone:group_id (name)',
      'roundRow:round_uuid (name)',
    ].join(', ');
    const idList = ids.join(',');
    const { data } = await db
      .from('matches')
      .select(select)
      .or(`home_club_id.in.(${idList}),away_club_id.in.(${idList})`)
      .gte('date_time', from)
      .lte('date_time', to)
      .order('date_time', { ascending: true })
      .limit(40);
    const rows = visible((data ?? []) as Row[]);
    // Lo más cercano a hoy primero: el partido que se está por transmitir.
    rows.sort((a, b) => Math.abs(Date.parse(String(a.date_time)) - now) - Math.abs(Date.parse(String(b.date_time)) - now));
    matches = rows.slice(0, 12).flatMap((row) => {
      const home = toClub(rel(row.homeClub));
      const away = toClub(rel(row.awayClub));
      if (!home || !away) return [];
      return [{
        id: String(row.id),
        dateTime: str(row.date_time),
        status: str(row.status) ?? 'scheduled',
        home,
        away,
        tournament: str(rel(row.tournament)?.name),
        context: matchContext(row),
      }];
    });
  }

  const tournaments = ((tournamentsRes.data ?? []) as Row[])
    .filter((row) => row.is_visible !== false && str(row.id))
    .slice(0, 8)
    .map((row) => ({ id: String(row.id), name: str(row.name) ?? 'Torneo', logo: tournamentLogo(row) }));

  return { clubs, matches, tournaments };
}
