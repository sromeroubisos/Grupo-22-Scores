import 'server-only';

/**
 * Datos de los overlays de transmisión (`/overlay/*`): una lista de partidos
 * elegidos, una fecha de un torneo, un día, un cuadro de playoff o la ficha de
 * un jugador, todo devuelto en UNA forma que el cliente dibuja sin saber de
 * dónde salió.
 *
 * Los partidos salen con la forma que ya lee `toOverlayMatch` (la misma del
 * `GET /api/matches/[id]`), así el reloj, el estado y los escudos se resuelven
 * con el mismo código que el marcador.
 *
 * Los escudos van SIEMPRE por el proxy (`/api/assets/team-logo`) y nunca se
 * lee `clubs.logo_url`: guarda PNG en base64 de hasta 200 KB y una fecha de 12
 * partidos se volvía una respuesta de varios MB para un gráfico que se relee
 * cada pocos segundos.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { getReadClient } from '@/lib/supabase/read';
import { isMatchVisibleToPublic } from '@/lib/matchReview';
import { loadPlayoffBracket } from '@/lib/server/playoffBracket';
import { getLocalPlayerProfile, toPublicLocalPlayerProfile } from '@/lib/services/localPlayerProfile';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import { APP_TIMEZONE, addDaysToIsoDate, combineLocalDateTimeToUtcIso, formatDateKey } from '@/lib/timezone';
import type {
  OverlayBracketCup,
  OverlayFeed,
  OverlayPlayer,
} from '@/lib/overlay/overlayFeedTypes';

// Las consultas del feed son de solo lectura y con columnas explícitas.
type Db = any;
type Row = Record<string, unknown>;

const CLUB_COLUMNS = 'id, name, short_name, primary_color';
const MATCH_SELECT = [
  'id, tournament_id, phase_id, round_uuid, round_label, date_time, venue, status, score, clock, sport_id',
  'is_visible, review_status, home_source_label, away_source_label',
  `homeClub:home_club_id (${CLUB_COLUMNS})`,
  `awayClub:away_club_id (${CLUB_COLUMNS})`,
  'tournament:tournament_id (id, name, sport_id, ruleset)',
  // De qué parte del torneo es: fase (Copa de Oro, Playoff), zona y fecha.
  'phase:phase_id (name, phase_type)',
  'zone:group_id (name)',
  'roundRow:round_uuid (name)',
].join(', ');

/**
 * "Copa de Oro · Zona A · Fecha 3", "Playoff · Cuartos de final": a qué parte
 * del torneo pertenece el partido. El torneo y la fecha se pueden omitir
 * cuando el gráfico ya los dice en el título.
 */
export function matchContext(row: Row, options: { tournament?: boolean; round?: boolean } = {}): string | null {
  const parts = [
    options.tournament ? str(rel(row.tournament)?.name) : null,
    str(rel(row.phase)?.name),
    str(rel(row.zone)?.name),
    options.round === false ? null : str(rel(row.roundRow)?.name) ?? str(row.round_label),
  ].filter((part): part is string => Boolean(part));
  // Sin repetir: una fecha que se llama igual que su fase ("Final") va una vez.
  const unique = parts.filter((part, index) => parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index);
  return unique.length ? unique.join(' · ') : null;
}

/** Tope de partidos por pedido: un gráfico al aire no muestra más que esto. */
const MAX_MATCHES = 60;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class OverlayFeedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function rel(value: unknown): Row | null {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === 'object' ? (item as Row) : null;
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseIdList(raw: string | null | undefined, max = 24): string[] {
  const seen = new Set<string>();
  for (const part of String(raw || '').split(/[\s,]+/)) {
    // Se acepta la URL entera de la ficha: lo que pega un productor es un link.
    const id = part.trim().replace(/\/+$/, '').split('/').pop()?.split('?')[0] ?? '';
    if (id) seen.add(id);
    if (seen.size >= max) break;
  }
  return [...seen];
}

export function tournamentLogo(tournament: Row | null): string | null {
  const id = str(tournament?.id);
  return id ? buildTeamLogoProxyUrl({ key: id, name: str(tournament?.name), entity: 'tournament' }) : null;
}

function club(row: Row | null, sourceLabel: unknown): Row {
  if (!row) {
    // Llave de playoff sin definir: "1° Zona A", "Ganador SF1".
    const label = str(sourceLabel) ?? 'A definir';
    return { name: label, short_name: label, logo: null, primary_color: null };
  }
  const name = str(row.name) ?? 'Equipo';
  return {
    id: row.id,
    name,
    short_name: str(row.short_name) ?? name,
    primary_color: row.primary_color ?? null,
    logo: buildTeamLogoProxyUrl({ key: str(row.id), name }),
  };
}

/** Un partido de la base → la forma que lee `toOverlayMatch` (sin eventos: las listas no los usan). */
function toPayload(row: Row, context: { tournament?: boolean; round?: boolean } = {}): Row {
  const tournament = rel(row.tournament);
  return {
    id: row.id,
    context_label: matchContext(row, context),
    status: row.status,
    date_time: row.date_time,
    venue: row.venue,
    score: row.score,
    clock: row.clock,
    round_label: row.round_label,
    sport_id: row.sport_id ?? tournament?.sport_id ?? null,
    homeClub: club(rel(row.homeClub), row.home_source_label),
    awayClub: club(rel(row.awayClub), row.away_source_label),
    tournament: tournament
      ? { id: tournament.id, name: tournament.name, ruleset: tournament.ruleset, logo_url: tournamentLogo(tournament) }
      : null,
  };
}

export function visible(rows: Row[]): Row[] {
  return rows.filter((row) => isMatchVisibleToPublic(row as { is_visible?: boolean | null; review_status?: string | null }));
}

export async function loadTournament(db: Db, tournamentId: string): Promise<Row> {
  if (!UUID_RE.test(tournamentId)) throw new OverlayFeedError('El torneo tiene que ser un ID (o el link del torneo).', 400);
  const { data, error } = await db.from('tournaments').select('id, name, sport_id, ruleset').eq('id', tournamentId).maybeSingle();
  if (error) throw new OverlayFeedError('No se pudo leer el torneo.', 502);
  if (!data) throw new OverlayFeedError('No se encontró el torneo.', 404);
  return data as Row;
}

/* ─── partidos elegidos ─── */

export async function feedSelectedMatches(ids: string[], title: string | null): Promise<OverlayFeed> {
  const valid = ids.filter((id) => UUID_RE.test(id));
  if (!valid.length) throw new OverlayFeedError('Pasá al menos un ID de partido en `ids`.', 400);
  const db = await getReadClient();
  const { data, error } = await db.from('matches').select(MATCH_SELECT).in('id', valid);
  if (error) throw new OverlayFeedError('No se pudieron leer los partidos.', 502);
  const byId = new Map(visible((data ?? []) as Row[]).map((row) => [String(row.id), row]));
  // En el orden en que los eligió el productor, no en el de la base.
  const rows = valid.map((id) => byId.get(id)).filter((row): row is Row => Boolean(row));
  const tournaments = new Set(rows.map((row) => str(rel(row.tournament)?.name)).filter(Boolean));
  const onlyTournament = tournaments.size === 1 ? rel(rows[0]?.tournament) : null;
  return {
    kind: 'partidos',
    title: title ?? (onlyTournament ? String(onlyTournament.name) : 'Partidos'),
    subtitle: null,
    logo: onlyTournament ? tournamentLogo(onlyTournament) : null,
    // Si se eligieron partidos de varios torneos, cada fila dice de cuál es.
    matches: rows.map((row) => toPayload(row, { tournament: !onlyTournament })),
  };
}

/* ─── una fecha de un torneo ─── */

export async function feedRound(tournamentId: string, roundId: string | null, title: string | null): Promise<OverlayFeed> {
  const db = await getReadClient();
  const tournament = await loadTournament(db, tournamentId);

  let round: { id: string | null; label: string | null } = { id: null, label: null };
  if (roundId && UUID_RE.test(roundId)) {
    round = { id: roundId, label: null };
  } else {
    // Sin fecha elegida: la que está más cerca de HOY (la que se juega este
    // fin de semana, o la última jugada). Ventana acotada para no leer
    // temporadas enteras: PostgREST corta en 1000 filas.
    const now = Date.now();
    const { data, error } = await db
      .from('matches')
      .select('round_uuid, round_label, date_time, status')
      .eq('tournament_id', tournamentId)
      .gte('date_time', new Date(now - 200 * 86_400_000).toISOString())
      .lte('date_time', new Date(now + 120 * 86_400_000).toISOString())
      .not('date_time', 'is', null)
      .limit(1000);
    if (error) throw new OverlayFeedError('No se pudieron leer las fechas del torneo.', 502);
    let best: Row | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const row of (data ?? []) as Row[]) {
      if (!row.round_uuid && !row.round_label) continue;
      const distance = Math.abs(Date.parse(String(row.date_time)) - now);
      // Un partido en juego gana siempre: es la fecha que se está transmitiendo.
      const score = row.status === 'live' ? -1 : distance;
      if (score < bestScore) {
        bestScore = score;
        best = row;
      }
    }
    if (!best) throw new OverlayFeedError('El torneo no tiene fechas cerca de hoy. Elegí una con `ronda`.', 404);
    round = { id: str(best.round_uuid), label: str(best.round_label) };
  }

  let query = db.from('matches').select(MATCH_SELECT).eq('tournament_id', tournamentId);
  query = round.id ? query.eq('round_uuid', round.id) : query.eq('round_label', round.label);
  const [{ data, error }, roundRow] = await Promise.all([
    query.order('date_time', { ascending: true }).limit(MAX_MATCHES),
    round.id
      ? db.from('tournament_rounds').select('name').eq('id', round.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (error) throw new OverlayFeedError('No se pudieron leer los partidos de la fecha.', 502);
  const rows = visible((data ?? []) as Row[]);
  const roundName = str((roundRow as { data: Row | null }).data?.name) ?? str(rows[0]?.round_label) ?? round.label ?? 'Fecha';

  return {
    kind: 'fecha',
    title: title ?? String(tournament.name),
    subtitle: roundName,
    logo: tournamentLogo(tournament),
    // La fecha ya está en la bajada: cada fila dice solo su fase y su zona.
    matches: rows.map((row) => toPayload(row, { round: false })),
  };
}

/* ─── un día ─── */

export async function feedDay(dateKey: string | null, tournamentIds: string[], title: string | null): Promise<OverlayFeed> {
  const day = dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : formatDateKey(new Date(), APP_TIMEZONE);
  const start = combineLocalDateTimeToUtcIso(day, '00:00', APP_TIMEZONE);
  const end = combineLocalDateTimeToUtcIso(addDaysToIsoDate(day, 1), '00:00', APP_TIMEZONE);
  if (!start || !end) throw new OverlayFeedError('Fecha inválida (usá AAAA-MM-DD).', 400);

  const db = await getReadClient();
  let query = db.from('matches').select(MATCH_SELECT).gte('date_time', start).lt('date_time', end);
  const validTournaments = tournamentIds.filter((id) => UUID_RE.test(id));
  if (validTournaments.length) query = query.in('tournament_id', validTournaments);
  const { data, error } = await query.order('date_time', { ascending: true }).limit(MAX_MATCHES + 1);
  if (error) throw new OverlayFeedError('No se pudieron leer los partidos del día.', 502);
  const all = visible((data ?? []) as Row[]);
  const rows = all.slice(0, MAX_MATCHES);

  const tournaments = new Set(rows.map((row) => str(rel(row.tournament)?.name)).filter(Boolean));
  const onlyTournament = tournaments.size === 1 ? rel(rows[0]?.tournament) : null;
  const label = new Date(`${day}T12:00:00Z`).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });

  return {
    kind: 'dia',
    title: title ?? (onlyTournament ? String(onlyTournament.name) : 'Partidos del día'),
    subtitle: label.charAt(0).toUpperCase() + label.slice(1),
    logo: onlyTournament ? tournamentLogo(onlyTournament) : null,
    // Un día mezcla torneos: van agrupados con el nombre del torneo arriba.
    matches: rows.map((row) => ({ ...toPayload(row), group: str(rel(row.tournament)?.name) ?? 'Otros' })),
    truncated: all.length > MAX_MATCHES,
  };
}

/* ─── cuadro de playoff ─── */

export async function feedPlayoff(tournamentId: string, phaseId: string | null, title: string | null): Promise<OverlayFeed> {
  const db = await getReadClient();
  const tournament = await loadTournament(db, tournamentId);

  let phase = phaseId && UUID_RE.test(phaseId) ? phaseId : null;
  if (!phase) {
    // La fase de playoff más reciente que tenga cuadro armado.
    const { data } = await db
      .from('matches')
      .select('phase_id, date_time')
      .eq('tournament_id', tournamentId)
      .not('bracket_match_code', 'is', null)
      .order('date_time', { ascending: false, nullsFirst: false })
      .limit(1);
    phase = str(((data ?? []) as Row[])[0]?.phase_id);
  }
  if (!phase) throw new OverlayFeedError('El torneo no tiene un cuadro de playoff armado.', 404);

  const [board, phaseRow, matchRows] = await Promise.all([
    loadPlayoffBracket(db, phase),
    db.from('tournament_phases').select('name').eq('id', phase).maybeSingle(),
    db.from('matches').select(MATCH_SELECT).eq('phase_id', phase).not('bracket_match_code', 'is', null).limit(200),
  ]);
  if (!board.hasBracket) throw new OverlayFeedError('Esa fase no tiene cuadro de playoff.', 404);

  // El tablero trae el orden (copa → ronda → llave); los datos del partido
  // (reloj, estado, escudos por proxy) salen de la lectura propia.
  const payloadById = new Map(
    visible(((matchRows as { data: Row[] | null }).data ?? []) as Row[]).map((row) => [String(row.id), toPayload(row)]),
  );
  const cups: OverlayBracketCup[] = board.cups.map((cup) => ({
    name: cup.name,
    rounds: cup.rounds.map((round) => ({
      name: round.name,
      matches: round.matches
        .flatMap((match): Row[] => {
          const payload = payloadById.get(match.id);
          return payload ? [{ ...payload, code: match.code, winnerSide: winnerSide(match) }] : [];
        }),
    })),
  }));

  return {
    kind: 'playoff',
    title: title ?? String(tournament.name),
    subtitle: str((phaseRow as { data: Row | null }).data?.name) ?? 'Playoff',
    logo: tournamentLogo(tournament),
    bracket: { cups },
  };
}

function winnerSide(match: { winnerClubId: string | null; homeClubId: string | null; awayClubId: string | null }) {
  if (!match.winnerClubId) return null;
  if (match.winnerClubId === match.homeClubId) return 'home';
  if (match.winnerClubId === match.awayClubId) return 'away';
  return null;
}

/* ─── jugador ─── */

export async function feedPlayer(personId: string, tournamentId: string | null, title: string | null): Promise<OverlayFeed> {
  if (!UUID_RE.test(personId)) throw new OverlayFeedError('El jugador tiene que ser un ID (o el link de su ficha).', 400);
  // Mismo criterio que /api/players: la ficha se lee con service_role y sale
  // la versión PÚBLICA (edad, sin fecha de nacimiento, talla ni peso).
  const db = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : await getReadClient();
  const full = await getLocalPlayerProfile(db, personId);
  if (!full) throw new OverlayFeedError('No se encontró el jugador.', 404);
  const profile = toPublicLocalPlayerProfile(full);

  const season = tournamentId ? profile.seasons.find((item) => item.tournamentId === tournamentId) ?? null : null;
  const totals = season ?? profile.totals;
  const scopedMatches = (tournamentId ? profile.matches.filter((m) => m.tournamentId === tournamentId) : profile.matches)
    .filter((m) => m.status === 'final')
    .slice()
    .sort((a, b) => Date.parse(b.date ?? '') - Date.parse(a.date ?? ''))
    .slice(0, 5);

  const player: OverlayPlayer = {
    id: profile.id,
    name: profile.name,
    photo: profile.photo ? `/api/players/${profile.id}/foto` : null,
    position: profile.position,
    number: profile.mainNumber ?? profile.number,
    age: profile.age,
    club: profile.club
      ? {
          name: profile.club.name,
          short: profile.club.shortName ?? profile.club.name,
          logo: buildTeamLogoProxyUrl({ key: profile.club.id, name: profile.club.name }),
          color: profile.club.primaryColor,
        }
      : null,
    scope: season ? season.tournamentName : 'Carrera en G22',
    stats: {
      matches: totals.matches,
      starts: totals.starts,
      points: totals.points,
      tries: totals.tries,
      conversions: totals.conversions,
      penalties: totals.penalties,
      dropGoals: totals.dropGoals,
      yellowCards: totals.yellowCards,
      redCards: totals.redCards,
      wins: totals.wins,
      draws: totals.draws,
      losses: totals.losses,
      minutes: totals.minutesKnown > 0 ? totals.minutes : null,
    },
    recent: scopedMatches.map((m) => ({
      id: m.id,
      date: m.date,
      result: m.result,
      rival: m.side === 'home' ? m.away.shortName ?? m.away.name : m.home.shortName ?? m.home.name,
      score: m.home.score !== null && m.away.score !== null
        ? (m.side === 'away' ? `${m.away.score}-${m.home.score}` : `${m.home.score}-${m.away.score}`)
        : null,
      points: m.points,
    })),
  };

  return {
    kind: 'jugador',
    title: title ?? profile.name,
    subtitle: player.scope,
    logo: null,
    player,
  };
}

/* ─── opciones para el generador ─── */

export async function feedTournamentOptions(tournamentId: string) {
  const db = await getReadClient();
  const tournament = await loadTournament(db, tournamentId);
  const { data: phases } = await db
    .from('tournament_phases')
    .select('id, name, phase_type, order_index, created_at')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: false })
    .limit(30);
  const phaseIds = ((phases ?? []) as Row[]).map((phase) => String(phase.id));
  const { data: rounds } = phaseIds.length
    ? await db
        .from('tournament_rounds')
        .select('id, name, phase_id, order_index, start_date')
        .in('phase_id', phaseIds)
        .order('order_index', { ascending: true })
        .limit(400)
    : { data: [] };
  const { data: bracketRows } = await db
    .from('matches')
    .select('phase_id')
    .eq('tournament_id', tournamentId)
    .not('bracket_match_code', 'is', null)
    .limit(200);
  const bracketPhases = new Set(((bracketRows ?? []) as Row[]).map((row) => String(row.phase_id)));
  const { data: groups } = phaseIds.length
    ? await db.from('tournament_groups').select('id, name, phase_id, order_index').in('phase_id', phaseIds).order('order_index', { ascending: true }).limit(200)
    : { data: [] };
  const phaseName = new Map(((phases ?? []) as Row[]).map((phase) => [String(phase.id), str(phase.name) ?? 'Fase']));

  return {
    tournament: { id: tournament.id, name: tournament.name },
    rounds: ((rounds ?? []) as Row[]).map((round) => ({
      id: String(round.id),
      name: str(round.name) ?? 'Fecha',
      phase: phaseName.get(String(round.phase_id)) ?? null,
    })),
    playoffPhases: [...bracketPhases].map((id) => ({ id, name: phaseName.get(id) ?? 'Playoff' })),
    phases: ((phases ?? []) as Row[]).map((phase) => ({ id: String(phase.id), name: str(phase.name) ?? 'Fase' })),
    groups: ((groups ?? []) as Row[]).map((group) => ({
      id: String(group.id),
      name: str(group.name) ?? 'Zona',
      phaseId: String(group.phase_id),
      phase: phaseName.get(String(group.phase_id)) ?? null,
    })),
  };
}
