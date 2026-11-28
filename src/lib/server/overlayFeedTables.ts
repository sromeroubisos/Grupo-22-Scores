import 'server-only';

/**
 * Más versiones de overlay: tabla de posiciones, goleadores/tryman, la home
 * (todos los deportes y proveedores) y una noticia. Mismas reglas que
 * `overlayFeed.ts`: solo lo público, escudos por proxy.
 */
import { NextRequest } from 'next/server';
import { GET as standingsGET } from '@/app/api/db/standings/route';
import { GET as matchesGET } from '@/app/api/matches/route';
import { buildOfficialPlayerRows, readOfficialLeaders } from '@/app/tournaments/[id]/officialLeaders';
import { buildMatchEventDefinitionMap, getDefaultMatchEventDefinitions } from '@/lib/matchEventCatalog';
import { getConfiguredEventPoints } from '@/lib/matchStatsFromEvents';
import { isGoalKickMade } from '@/lib/matchEventStats';
import { newsIdFromSegment, newsPath } from '@/lib/news/newsUrl';
import { fetchTournamentData } from '@/lib/server/fetchTournamentData';
import { getReadClient } from '@/lib/supabase/read';
import { APP_TIMEZONE, formatDateKey } from '@/lib/timezone';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import type { OverlayFeed, OverlayLeaderRow, OverlayStandingRow } from '@/lib/overlay/overlayFeedTypes';
import { MATCH_SELECT, OverlayFeedError, UUID_RE, loadTournament, rel, str, toPayload, tournamentLogo, visible } from './overlayFeed';

type Row = Record<string, unknown>;

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/* ─── tabla de posiciones ─── */

/**
 * Reusa el GET de `/api/db/standings` tal cual (cálculo en vivo con el motor de
 * la tabla, zonas, arrastre de puntos): una segunda cuenta acá sería una
 * segunda fuente de verdad contra la tabla pública.
 */
export async function feedStandings(
  tournamentId: string,
  phaseId: string | null,
  groupId: string | null,
  title: string | null,
): Promise<OverlayFeed> {
  const db = await getReadClient();
  const tournament = await loadTournament(db, tournamentId);
  const params = new URLSearchParams({ tournament: tournamentId });
  if (phaseId && UUID_RE.test(phaseId)) params.set('phase', phaseId);
  if (groupId && UUID_RE.test(groupId)) params.set('group', groupId);

  const response = await standingsGET(new NextRequest(`http://overlay.local/api/db/standings?${params}`));
  const body = (await response.json().catch(() => null)) as Row | null;
  if (!response.ok || !body || !Array.isArray(body.standings)) {
    throw new OverlayFeedError(str(body?.error) ?? 'No se pudo armar la tabla.', response.status >= 400 ? response.status : 502);
  }

  const [phaseRow, groupRow] = await Promise.all([
    body.phase_id ? db.from('tournament_phases').select('name').eq('id', body.phase_id).maybeSingle() : Promise.resolve({ data: null }),
    body.group_id ? db.from('tournament_groups').select('name').eq('id', body.group_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  // La tabla GUARDADA de un torneo trae filas de todas sus fases (medido:
  // 24 filas, cada equipo dos veces, en un torneo de dos fases). Al aire va
  // solo la fase pedida, y si tiene zonas, una zona detrás de la otra.
  const phaseOf = str(body.phase_id);
  const scoped = (body.standings as Row[])
    .filter((row) => !phaseOf || !str(row.phase_id) || str(row.phase_id) === phaseOf);
  const groupIds = [...new Set(scoped.map((row) => str(row.group_id)).filter((id): id is string => Boolean(id)))];
  const { data: groupRows } = groupIds.length
    ? await db.from('tournament_groups').select('id, name, order_index').in('id', groupIds)
    : { data: [] };
  const groupName = new Map(((groupRows ?? []) as Row[]).map((group) => [String(group.id), str(group.name) ?? 'Zona']));
  const groupOrder = new Map(((groupRows ?? []) as Row[]).map((group) => [String(group.id), num(group.order_index)]));
  scoped.sort((a, b) =>
    (groupOrder.get(str(a.group_id) ?? '') ?? 0) - (groupOrder.get(str(b.group_id) ?? '') ?? 0)
    || num(a.position) - num(b.position));

  const rows: OverlayStandingRow[] = scoped.map((row, index) => {
    const team = rel(row.team);
    const teamId = str(row.team_id) ?? str(team?.id);
    const name = str(row.team_name) ?? str(team?.name) ?? 'Equipo';
    return {
      position: num(row.position) || index + 1,
      teamId,
      name,
      // El escudo SIEMPRE por proxy: `team_logo` puede venir en base64.
      logo: teamId ? buildTeamLogoProxyUrl({ key: teamId, name }) : null,
      played: num(row.matches_total),
      won: num(row.wins_total),
      drawn: num(row.draws_total),
      lost: num(row.losses_total),
      pointsFor: num(row.goals_for),
      pointsAgainst: num(row.goals_against),
      diff: num(row.goal_difference),
      bonus: num(row.bonus_points),
      points: num(row.points_total),
      form: str(row.form),
      group: groupIds.length > 1 ? groupName.get(str(row.group_id) ?? '') ?? null : null,
    };
  });

  const subtitle = [str((phaseRow as { data: Row | null }).data?.name), str((groupRow as { data: Row | null }).data?.name)]
    .filter(Boolean)
    .join(' · ') || 'Tabla de posiciones';

  return {
    kind: 'tabla',
    title: title ?? String(tournament.name),
    subtitle,
    logo: tournamentLogo(tournament),
    table: { rows, sport: str(tournament.sport_id) },
  };
}

/* ─── goleadores / tryman / anotadores ─── */

export const LEADER_STATS: Record<string, { label: string; unit: string; official: string }> = {
  puntos: { label: 'Máximos anotadores', unit: 'PTS', official: 'points' },
  tries: { label: 'Tryman', unit: 'TRIES', official: 'tries' },
  goles: { label: 'Goleadores', unit: 'GOLES', official: 'goals' },
  conversiones: { label: 'Conversiones', unit: 'CONV', official: 'conversions' },
  penales: { label: 'Penales', unit: 'PEN', official: 'penalties' },
  tarjetas: { label: 'Tarjetas', unit: 'TARJ', official: 'cards' },
};

const TRY_TYPES = new Set(['try', 'penalty_try']);
const GOAL_TYPES = new Set(['goal']);
const CARD_TYPES = new Set(['yellow_card', 'red_card', 'card_yellow', 'card_red', 'green_card', 'blue_card']);

function isRugby(sportId: string | null) {
  return !sportId || sportId.includes('rugby');
}

/**
 * El ranking de jugadores de un torneo. Si el torneo trae los goleadores
 * OFICIALES de la fuente (`ruleset.official_player_leaders`), mandan esos —
 * igual que en la página del torneo. Si no, se cuenta evento por evento con
 * la misma regla del marcador: una patada errada no suma.
 */
export async function feedLeaders(tournamentId: string, rawStat: string | null, limit: number, title: string | null): Promise<OverlayFeed> {
  if (!UUID_RE.test(tournamentId)) throw new OverlayFeedError('El torneo tiene que ser un ID (o el link del torneo).', 400);
  const data = await fetchTournamentData(tournamentId);
  if (!data?.tournament) throw new OverlayFeedError('No se encontró el torneo.', 404);
  const tournament = data.tournament as Row;
  const sportId = str(tournament.sport_id) ?? str(tournament.sport);
  const stat = rawStat && LEADER_STATS[rawStat] ? rawStat : isRugby(sportId) ? 'puntos' : 'goles';
  const spec = LEADER_STATS[stat];
  const max = Math.min(Math.max(limit, 3), 20);

  // 1) Oficiales, si existen para esa categoría.
  const official = readOfficialLeaders(tournament.ruleset);
  const category = official?.categories.find((item) => item.id === spec.official);
  if (official && category) {
    const merged = buildOfficialPlayerRows(official) as Row[];
    const byName = new Map(merged.map((row) => [String(row.entityName).toLowerCase(), row]));
    const rows: OverlayLeaderRow[] = category.rows.slice(0, max).map((row) => {
      const clubId = row.club_id ?? str(byName.get(row.name.toLowerCase())?.teamId);
      return {
        rank: row.rank,
        name: row.name,
        club: row.club_name ?? null,
        clubLogo: clubId ? buildTeamLogoProxyUrl({ key: clubId, name: row.club_name ?? '' }) : null,
        value: row.value,
        matches: row.matches ?? null,
      };
    });
    return {
      kind: 'goleadores',
      title: title ?? String(tournament.name),
      subtitle: category.label || spec.label,
      logo: tournamentLogo(tournament),
      leaders: { stat, label: category.label || spec.label, unit: category.unit || spec.unit, rows, official: true },
    };
  }

  // 2) Contados de los partidos jugados.
  const definitions = buildMatchEventDefinitionMap(getDefaultMatchEventDefinitions(sportId));
  type Tally = { name: string; clubId: string | null; club: string | null; value: number; matches: Set<string> };
  const tallies = new Map<string, Tally>();

  for (const raw of data.matches as Row[]) {
    if (str(raw.status) !== 'final' || raw.is_visible === false) continue;
    const matchId = String(raw.id);
    const home = rel(raw.home) ?? rel(raw.homeClub);
    const away = rel(raw.away) ?? rel(raw.awayClub);
    const events = Array.isArray(raw.events) ? (raw.events as Row[]) : [];
    for (const event of events) {
      const type = str(event.type) ?? '';
      const detail = str(event.detail) ?? str(event.description) ?? '';
      const side = event.team === 'home' ? home : event.team === 'away' ? away : null;
      const name = str(event.playerName) ?? str(event.player_name);
      if (!name || !side) continue;

      let value = 0;
      if (stat === 'puntos') value = getConfiguredEventPoints({ type, detail }, definitions);
      else if (stat === 'tries') value = TRY_TYPES.has(type) ? 1 : 0;
      else if (stat === 'goles') value = GOAL_TYPES.has(type) || (type === 'penalty_goal' && !isRugby(sportId)) ? 1 : 0;
      else if (stat === 'conversiones') value = type === 'conversion' && isGoalKickMade(type, detail) ? 1 : 0;
      else if (stat === 'penales') value = type === 'penalty_goal' && isRugby(sportId) && isGoalKickMade(type, detail) ? 1 : 0;
      else if (stat === 'tarjetas') value = CARD_TYPES.has(type) ? 1 : 0;
      if (value <= 0) continue;

      const clubId = str(side.id);
      const key = str(event.playerId) ?? str(event.player_id) ?? `${name.toLowerCase()}|${clubId}`;
      const tally = tallies.get(key) ?? { name, clubId, club: str(side.name), value: 0, matches: new Set<string>() };
      tally.value += value;
      tally.matches.add(matchId);
      tallies.set(key, tally);
    }
  }

  const sorted = [...tallies.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'es'));
  let lastValue = Number.NaN;
  let lastRank = 0;
  const rows: OverlayLeaderRow[] = sorted.slice(0, max).map((tally, index) => {
    // Empatados comparten puesto: 1, 2, 2, 4.
    const rank = tally.value === lastValue ? lastRank : index + 1;
    lastValue = tally.value;
    lastRank = rank;
    return {
      rank,
      name: tally.name,
      club: tally.club,
      clubLogo: tally.clubId ? buildTeamLogoProxyUrl({ key: tally.clubId, name: tally.club ?? '' }) : null,
      value: tally.value,
      matches: tally.matches.size,
    };
  });

  return {
    kind: 'goleadores',
    title: title ?? String(tournament.name),
    subtitle: spec.label,
    logo: tournamentLogo(tournament),
    leaders: { stat, label: spec.label, unit: spec.unit, rows, official: false },
  };
}

/* ─── la home: todos los deportes y proveedores ─── */

/**
 * El mismo listado que la home (`GET /api/matches`): partidos propios y de
 * proveedores externos, del deporte que se pida. Se puede quedar solo con
 * algunos torneos (`torneos=`, por ID local o del proveedor) y solo con lo que
 * está en juego (`vivo=1`).
 */
export async function feedHome(
  dateKey: string | null,
  sport: string | null,
  tournamentIds: string[],
  liveOnly: boolean,
  title: string | null,
): Promise<OverlayFeed> {
  const day = dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : formatDateKey(new Date(), APP_TIMEZONE);
  const params = new URLSearchParams({ date: day });
  if (sport && /^[a-z-]{2,30}$/.test(sport) && sport !== 'all') params.set('sport', sport);
  if (liveOnly) params.set('live', 'true');

  const response = await matchesGET(new Request(`http://overlay.local/api/matches?${params}`));
  const body = (await response.json().catch(() => null)) as Row | null;
  if (!response.ok || !body || !Array.isArray(body.data)) {
    throw new OverlayFeedError(str(body?.error) ?? 'No se pudo leer la home.', response.status >= 400 ? response.status : 502);
  }

  const wanted = new Set(tournamentIds.map((id) => id.toLowerCase()));
  const items = (body.data as Row[]).filter((item) => {
    if (!wanted.size) return true;
    const tournament = rel(item.tournament);
    const ids = [str(item.tournamentId), str(tournament?.id)].filter(Boolean).map((id) => String(id).toLowerCase());
    return ids.some((id) => wanted.has(id));
  });

  const matches = items.slice(0, 80).map((item) => {
    const tournament = rel(item.tournament);
    const home = rel(item.homeTeam) ?? {};
    const away = rel(item.awayTeam) ?? {};
    const clock = rel(item.clock);
    const isExternal = str(item.source) !== 'db';
    const minute = str(clock?.period);
    return {
      id: item.id,
      status: str(item.status) ?? 'scheduled',
      date_time: item.dateTime,
      score: item.score,
      // El reloj fino solo existe en los partidos propios (y la home no lo
      // trae): de los externos se muestra el minuto que publica el proveedor.
      clock: null,
      provider_time: isExternal && minute && /\d/.test(minute) ? minute : null,
      sport_id: str(tournament?.sport),
      group: str(tournament?.name) ?? 'Otros',
      // De los externos, la instancia que publica el proveedor ("Cuartos de final").
      context_label: str(tournament?.stageName),
      homeClub: { name: str(home.name) ?? 'Local', short_name: str(home.shortName) ?? str(home.name), logo: str(home.logo) },
      awayClub: { name: str(away.name) ?? 'Visitante', short_name: str(away.shortName) ?? str(away.name), logo: str(away.logo) },
      tournament: tournament ? { name: tournament.name } : null,
    };
  });

  // Agrupados por torneo, en el orden en que la home los muestra.
  const order = new Map<string, number>();
  matches.forEach((match, index) => { if (!order.has(String(match.group))) order.set(String(match.group), index); });
  matches.sort((a, b) => (order.get(String(a.group)) ?? 0) - (order.get(String(b.group)) ?? 0));

  const label = new Date(`${day}T12:00:00Z`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return {
    kind: 'home',
    title: title ?? (liveOnly ? 'En vivo' : 'Partidos del día'),
    subtitle: label.charAt(0).toUpperCase() + label.slice(1),
    logo: null,
    matches,
    truncated: items.length > 80,
  };
}

/* ─── noticia ─── */

export async function feedNews(rawId: string, title: string | null): Promise<OverlayFeed> {
  const id = newsIdFromSegment(rawId);
  if (!UUID_RE.test(id)) throw new OverlayFeedError('Pegá el link de la noticia.', 400);
  const db = await getReadClient();
  const { data, error } = await db
    .from('news')
    .select('id, title, summary, image_url, published_at, sport, status')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw new OverlayFeedError('No se pudo leer la noticia.', 502);
  if (!data) throw new OverlayFeedError('No se encontró la noticia (o no está publicada).', 404);
  const row = data as Row;
  const image = str(row.image_url);
  return {
    kind: 'noticia',
    title: title ?? 'G22 Noticias',
    subtitle: str(row.sport),
    logo: null,
    news: {
      id,
      title: str(row.title) ?? '',
      summary: str(row.summary),
      // Una imagen en base64 pesaría cientos de KB en cada lectura: se descarta.
      image: image && !image.startsWith('data:') ? image : null,
      publishedAt: str(row.published_at),
      sport: str(row.sport),
      path: newsPath({ id, title: str(row.title) }),
    },
  };
}

/* ─── una zona: sus partidos y su tabla ─── */

/** Tope de partidos de una zona: una zona de 6 equipos ida y vuelta son 30. */
const MAX_GROUP_MATCHES = 30;

/**
 * Los partidos de UNA zona (jugados, en juego y por jugar) y la tabla de esa
 * misma zona, para mostrarlos juntos. Sin zona elegida, la primera del torneo
 * (o de la fase pedida). La tabla sale de `feedStandings`: la misma cuenta que
 * la tabla pública.
 */
export async function feedGroup(
  tournamentId: string,
  phaseId: string | null,
  groupId: string | null,
  title: string | null,
): Promise<OverlayFeed> {
  const db = await getReadClient();
  const tournament = await loadTournament(db, tournamentId);

  const { data: phases, error: phasesError } = await db
    .from('tournament_phases')
    .select('id, name, order_index, created_at')
    .eq('tournament_id', tournamentId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(50);
  if (phasesError) throw new OverlayFeedError('No se pudieron leer las fases del torneo.', 502);
  const phaseRows = (phases ?? []) as Row[];
  const phaseIds = phaseRows.map((phase) => String(phase.id));
  const { data: groups, error: groupsError } = phaseIds.length
    ? await db.from('tournament_groups').select('id, name, phase_id, order_index').in('phase_id', phaseIds).limit(200)
    : { data: [], error: null };
  if (groupsError) throw new OverlayFeedError('No se pudieron leer las zonas del torneo.', 502);
  const phaseOrder = new Map(phaseIds.map((id, index) => [id, index]));
  const ordered = ((groups ?? []) as Row[]).sort((a, b) =>
    (phaseOrder.get(String(a.phase_id)) ?? 0) - (phaseOrder.get(String(b.phase_id)) ?? 0)
    || num(a.order_index) - num(b.order_index)
    || String(a.name ?? '').localeCompare(String(b.name ?? '')));

  const wanted = groupId && UUID_RE.test(groupId) ? groupId : null;
  const wantedPhase = phaseId && UUID_RE.test(phaseId) ? phaseId : null;
  const group = wanted
    ? ordered.find((item) => String(item.id) === wanted)
    : ordered.find((item) => !wantedPhase || String(item.phase_id) === wantedPhase);
  if (!group) {
    throw new OverlayFeedError(wanted ? 'Esa zona no es de este torneo.' : 'El torneo no tiene zonas armadas.', 404);
  }
  const groupKey = String(group.id);
  const phaseKey = String(group.phase_id);

  const [{ data: matchRows, error: matchesError }, standings] = await Promise.all([
    db.from('matches').select(MATCH_SELECT).eq('group_id', groupKey).order('date_time', { ascending: true }).limit(MAX_GROUP_MATCHES + 1),
    // Si la tabla falla, los partidos igual salen: la tabla queda vacía.
    feedStandings(tournamentId, phaseKey, groupKey, null).catch(() => null),
  ]);
  if (matchesError) throw new OverlayFeedError('No se pudieron leer los partidos de la zona.', 502);
  const rows = visible((matchRows ?? []) as Row[]);

  const phaseName = str(phaseRows.find((phase) => String(phase.id) === phaseKey)?.name);
  const groupName = str(group.name) ?? 'Zona';
  const onePhase = phaseRows.length <= 1;

  return {
    kind: 'grupo',
    title: title ?? String(tournament.name),
    subtitle: [onePhase ? null : phaseName, groupName].filter(Boolean).join(' · '),
    logo: tournamentLogo(tournament),
    // Cada cuadrito dice solo su fecha: torneo, fase y zona ya están arriba.
    matches: rows.slice(0, MAX_GROUP_MATCHES).map((row) => ({
      ...toPayload(row),
      context_label: str(rel(row.roundRow)?.name) ?? str(row.round_label),
    })),
    table: { rows: (standings?.table?.rows ?? []).map((row) => ({ ...row, group: null })), sport: str(tournament.sport_id) },
    truncated: rows.length > MAX_GROUP_MATCHES,
  };
}
