import 'server-only';

/**
 * Lo que un usuario puede gestionar, para trabajar sin conexión.
 *
 * El alcance sale de las funciones de siempre:
 * - partidos: el mismo criterio que `ensureMatchManagementAccess`
 *   (global admin · membresía partido/torneo/deporte/unión · `resolveTournamentAdminScope`);
 * - torneos y clubes: los de esos partidos, más los del alcance del usuario.
 * Solo una ventana de fechas (lo reciente y lo próximo): un operador en una
 * cancha no necesita el histórico, y un super admin tiene cientos de torneos.
 *
 * Dos modos:
 * - FOTO COMPLETA: la primera vez, si cambió el alcance del usuario (`scopeHash`
 *   distinto: le dieron o sacaron un torneo) o si el cursor es muy viejo.
 * - INCREMENTAL (`since`): solo filas con `updated_at` posterior al cursor, los
 *   partidos que entraron a la ventana de fechas y los borrados
 *   (`sync_tombstones`). Con cientos de celulares pidiendo novedades cada minuto,
 *   esto es lo que evita bajar miles de filas por pedido. Cada consulta usa los
 *   índices por `updated_at` de la migración mobile_sync_v2.
 */
import { createHash } from 'node:crypto';
import { canManageMatchContext, type UserAccessContext } from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES, isGlobalAdminRole } from '@/lib/auth/roles';
import { resolveTournamentAdminScope, isScopeAllowedTournament } from '@/lib/auth/tournamentAdminScope';
import { resolveClubFamilyIds } from '@/lib/club-admin/managedClubFamily';
import { createAdminClient } from '@/lib/supabase/admin';
import type { LooseSupabaseClient } from '@/lib/supabase/loose';
import { PROTOCOL_VERSION, type AccessPayload, type SnapshotResponse, type SyncEntity, type Tombstone } from './protocol';
import { selectIn, selectWhere, type CentralRow } from './rows';
import type { MobileSession } from './session';

const DAY = 86_400_000;
const CLOCK_SNAPSHOT_EVENT_TYPE = '__clock_state__';
/** Margen hacia atrás del cursor: una escritura que se confirmó durante la consulta anterior no se pierde. */
const OVERLAP_MS = 2 * 60_000;
/** Con un cursor más viejo que esto se manda la foto completa. */
const MAX_DELTA_AGE_MS = 7 * DAY;
/** Si hubo más borrados que esto desde el cursor, conviene la foto completa. */
const MAX_TOMBSTONES = 5_000;
/** Lo mínimo de un partido para decidir el alcance (sin marcador, eventos ni alineaciones). */
const LITE_MATCH_COLUMNS = 'id, tournament_id, home_club_id, away_club_id, sport_id, sport, date_time';
const LITE_PARTICIPANT_COLUMNS = 'id, tournament_id, club_id';
const SYNC_ENTITIES: ReadonlySet<string> = new Set(['tournaments', 'tournament_phases', 'clubs', 'tournament_participants', 'people', 'matches', 'match_events']);

export interface SnapshotOptions {
  since?: string | null;
  scopeHash?: string | null;
}

function membershipIds(context: UserAccessContext, scopeType: string): string[] {
  return context.memberships
    .filter((membership) => membership.scopeType === scopeType && membership.scopeId && MANAGEMENT_MEMBERSHIP_ROLES.has(membership.role as never))
    .map((membership) => membership.scopeId as string);
}

interface Scope {
  window: { from: string; to: string };
  /** Cuánto mira hacia adelante la ventana (para saber qué partidos entraron desde el cursor). */
  forwardMs: number;
  /** Partidos que puede gestionar (livianos o completos, según cómo se pidió). */
  matches: CentralRow[];
  tournamentsById: Map<string, CentralRow>;
  tournamentIds: Set<string>;
  participants: CentralRow[];
  clubIds: Set<string>;
  access: AccessPayload;
  hash: string;
}

/** El alcance del usuario. `lite`: solo lo necesario para decidirlo (para el modo incremental). */
async function resolveScope(session: MobileSession, admin: LooseSupabaseClient, lite: boolean): Promise<Scope> {
  const { context, userClient } = session;
  const global = isGlobalAdminRole(context.role);
  const scope = await resolveTournamentAdminScope(userClient, context);
  const matchColumns = lite ? LITE_MATCH_COLUMNS : undefined;

  const now = Date.now();
  const unlimited = global || scope.isUnlimited;
  const backMs = (unlimited ? 3 : 14) * DAY;
  const forwardMs = (unlimited ? 14 : 60) * DAY;
  const window = { from: new Date(now - backMs).toISOString(), to: new Date(now + forwardMs).toISOString() };
  const inWindow = (query: any) => query.gte('date_time', window.from).lte('date_time', window.to);

  // ─── Partidos candidatos ───────────────────────────────────────────────
  const explicitTournamentIds = new Set<string>([...scope.tournamentIds, ...membershipIds(context, 'tournament')]);
  const sportIds = membershipIds(context, 'sport');
  const unionIds = membershipIds(context, 'union');
  const matchMembershipIds = membershipIds(context, 'match');

  let candidates: CentralRow[];
  if (unlimited) {
    candidates = await selectWhere(admin, 'matches', inWindow, matchColumns);
  } else {
    const broad = new Set<string>(explicitTournamentIds);
    if (sportIds.length) (await selectIn(admin, 'tournaments', 'sport_id', sportIds, undefined, 'id')).forEach((row) => broad.add(row.id));
    if (unionIds.length) (await selectIn(admin, 'tournaments', 'union_id', unionIds, undefined, 'id')).forEach((row) => broad.add(row.id));
    const byTournament = broad.size ? await selectIn(admin, 'matches', 'tournament_id', broad, inWindow, matchColumns) : [];
    const byMembership = matchMembershipIds.length ? await selectIn(admin, 'matches', 'id', matchMembershipIds, undefined, matchColumns) : [];
    candidates = [...new Map([...byTournament, ...byMembership].map((row) => [row.id, row])).values()];
  }

  const tournamentsById = new Map(
    (await selectIn(admin, 'tournaments', 'id', new Set([...candidates.map((row) => String(row.tournament_id ?? '')).filter(Boolean), ...explicitTournamentIds]))).map((row) => [
      row.id,
      row,
    ]),
  );

  // ─── Partidos que puede gestionar (criterio de ensureMatchManagementAccess) ──
  const matches = candidates.filter((match) => {
    if (global) return true;
    const tournament = tournamentsById.get(String(match.tournament_id ?? ''));
    const target = {
      matchId: match.id,
      tournamentId: (match.tournament_id as string | null) ?? null,
      sportId: (match.sport_id as string | null) ?? (tournament?.sport_id as string | null) ?? (match.sport as string | null) ?? null,
      unionId: (tournament?.union_id as string | null) ?? null,
    };
    if (canManageMatchContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) return true;
    return Boolean(target.tournamentId && isScopeAllowedTournament(scope, target.tournamentId));
  });

  const tournamentIds = new Set<string>([...explicitTournamentIds, ...matches.map((row) => String(row.tournament_id ?? '')).filter(Boolean)]);
  const participants = await selectIn(admin, 'tournament_participants', 'tournament_id', tournamentIds, undefined, lite ? LITE_PARTICIPANT_COLUMNS : undefined);

  const clubFamilies: Record<string, string[]> = {};
  const familyRoots = context.memberships.filter((membership) => membership.scopeType === 'club_family' && membership.scopeId).map((m) => m.scopeId as string);
  for (const root of familyRoots) {
    const family = await resolveClubFamilyIds(userClient, root).catch(() => ({ rootClubId: root, clubIds: [root] }));
    for (const clubId of family.clubIds) clubFamilies[clubId] = family.clubIds;
  }
  const clubIds = new Set<string>(
    [
      ...participants.map((row) => String(row.club_id ?? '')),
      ...matches.flatMap((row) => [String(row.home_club_id ?? ''), String(row.away_club_id ?? '')]),
      ...scope.clubIds,
      ...membershipIds(context, 'club'),
      ...Object.keys(clubFamilies),
    ].filter(Boolean),
  );

  const access: AccessPayload = {
    userId: session.userId,
    email: session.email,
    displayName: session.displayName,
    role: context.role,
    memberships: context.memberships.map((membership) => ({ scopeType: membership.scopeType, scopeId: membership.scopeId, role: membership.role })),
    tournamentScope: { unlimited: scope.isUnlimited, tournamentIds: [...scope.tournamentIds], clubIds: [...scope.clubIds] },
    clubFamilies,
  };

  // Cambia si al usuario le dan o le sacan un torneo, un club o un rol: entonces va la foto completa.
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        role: context.role,
        memberships: access.memberships.map((m) => `${m.scopeType}:${m.scopeId ?? ''}:${m.role}`).sort(),
        tournaments: [...tournamentIds].sort(),
        clubs: [...clubIds].sort(),
        forwardMs,
      }),
    )
    .digest('hex')
    .slice(0, 32);

  return { window, forwardMs, matches, tournamentsById, tournamentIds, participants, clubIds, access, hash };
}

const isPlayer = (row: CentralRow) => row.role === null || row.role === undefined || row.role === 'player';

async function buildFull(session: MobileSession, admin: LooseSupabaseClient, cursor: string): Promise<SnapshotResponse> {
  const scope = await resolveScope(session, admin, false);
  const tournaments = [...scope.tournamentIds].map((id) => scope.tournamentsById.get(id)).filter((row): row is CentralRow => Boolean(row));
  const [phases, clubs, people, events] = await Promise.all([
    selectIn(admin, 'tournament_phases', 'tournament_id', scope.tournamentIds),
    selectIn(admin, 'clubs', 'id', scope.clubIds),
    selectIn(admin, 'people', 'club_id', scope.clubIds),
    selectIn(admin, 'match_events', 'match_id', scope.matches.map((row) => row.id)),
  ]);
  return {
    protocolVersion: PROTOCOL_VERSION,
    serverTime: new Date().toISOString(),
    access: scope.access,
    window: scope.window,
    mode: 'full',
    cursor,
    scopeHash: scope.hash,
    tombstones: [],
    data: {
      tournaments,
      tournament_phases: phases,
      clubs,
      tournament_participants: scope.participants,
      people: people.filter(isPlayer),
      matches: scope.matches,
      match_events: events.filter((row) => row.event_type !== CLOCK_SNAPSHOT_EVENT_TYPE),
    },
  };
}

/** Borrados desde `sinceIso`. null = demasiados (conviene la foto completa). */
async function tombstonesSince(admin: LooseSupabaseClient, sinceIso: string): Promise<Tombstone[] | null> {
  const { data, error } = await admin
    .from('sync_tombstones')
    .select('entity, record_id')
    .gt('deleted_at', sinceIso)
    .order('id', { ascending: true })
    .limit(MAX_TOMBSTONES + 1);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ entity: string; record_id: string }>;
  if (rows.length > MAX_TOMBSTONES) return null;
  return rows.filter((row) => SYNC_ENTITIES.has(row.entity)).map((row) => ({ entity: row.entity as SyncEntity, id: row.record_id }));
}

export async function buildSnapshot(session: MobileSession, options: SnapshotOptions = {}): Promise<SnapshotResponse> {
  const admin = createAdminClient();
  // El cursor es la hora de ANTES de consultar: lo que se escriba durante la consulta entra en la próxima.
  const startedAt = Date.now();
  const cursor = new Date(startedAt).toISOString();
  maybePruneTombstones(admin);

  const sinceMs = options.since ? Date.parse(options.since) : NaN;
  if (!Number.isFinite(sinceMs) || startedAt - sinceMs > MAX_DELTA_AGE_MS || sinceMs > startedAt + 60_000) {
    return buildFull(session, admin, cursor);
  }

  const scope = await resolveScope(session, admin, true);
  if (!options.scopeHash || options.scopeHash !== scope.hash) return buildFull(session, admin, cursor);

  const sinceIso = new Date(sinceMs - OVERLAP_MS).toISOString();
  const tombstones = await tombstonesSince(admin, sinceIso);
  if (tombstones === null) return buildFull(session, admin, cursor);

  const changed = (query: any) => query.gt('updated_at', sinceIso);
  const permitted = new Set(scope.matches.map((row) => row.id));
  // Partidos que entraron a la ventana de fechas desde el cursor (la ventana se corre con el tiempo).
  const previousWindowTo = new Date(sinceMs + scope.forwardMs).toISOString();
  const entered = scope.matches.filter((row) => typeof row.date_time === 'string' && row.date_time > previousWindowTo).map((row) => row.id);

  const [changedMatchIds, changedEvents, enteredEvents, tournaments, phases, participants, clubs, people] = await Promise.all([
    selectWhere(admin, 'matches', changed, 'id'),
    selectWhere(admin, 'match_events', changed),
    entered.length ? selectIn(admin, 'match_events', 'match_id', entered) : Promise.resolve([] as CentralRow[]),
    selectWhere(admin, 'tournaments', changed),
    selectWhere(admin, 'tournament_phases', changed),
    selectWhere(admin, 'tournament_participants', changed),
    selectWhere(admin, 'clubs', changed),
    selectWhere(admin, 'people', changed),
  ]);

  const matchIds = new Set<string>([...changedMatchIds.map((row) => row.id).filter((id) => permitted.has(id)), ...entered]);
  const matches = matchIds.size ? await selectIn(admin, 'matches', 'id', matchIds) : [];
  const events = new Map<string, CentralRow>();
  for (const row of [...changedEvents, ...enteredEvents]) {
    if (permitted.has(String(row.match_id ?? '')) && row.event_type !== CLOCK_SNAPSHOT_EVENT_TYPE) events.set(row.id, row);
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    serverTime: new Date().toISOString(),
    access: scope.access,
    window: scope.window,
    mode: 'delta',
    cursor,
    scopeHash: scope.hash,
    tombstones,
    data: {
      tournaments: tournaments.filter((row) => scope.tournamentIds.has(row.id)),
      tournament_phases: phases.filter((row) => scope.tournamentIds.has(String(row.tournament_id ?? ''))),
      clubs: clubs.filter((row) => scope.clubIds.has(row.id)),
      tournament_participants: participants.filter((row) => scope.tournamentIds.has(String(row.tournament_id ?? ''))),
      people: people.filter((row) => scope.clubIds.has(String(row.club_id ?? '')) && isPlayer(row)),
      matches,
      match_events: [...events.values()],
    },
  };
}

/** Purga los borrados de más de 30 días, de vez en cuando (1 de cada 100 pedidos), sin demorar la respuesta. */
function maybePruneTombstones(admin: LooseSupabaseClient): void {
  if (Math.random() >= 0.01) return;
  void admin
    .from('sync_tombstones')
    .delete()
    .lt('deleted_at', new Date(Date.now() - 30 * DAY).toISOString())
    .then(({ error }: { error: unknown }) => {
      if (error) console.error('[mobileSync] no se pudieron purgar los borrados viejos:', error);
    });
}
