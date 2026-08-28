import { isUuid } from '@/lib/utils/postgrest';

/**
 * Normalizacion y control de una formacion que llega por la API.
 *
 * Vive aca y no en la ruta porque `route.ts` de Next no admite exports que no
 * sean handlers, y esto es justo lo que hay que poder probar: que dos
 * capitanes, un numero repetido o un jugador sin nombre no lleguen a la base.
 */

/** Puesto por numero de camiseta, la convencion del rugby de XV. */
const POSITION_BY_NUMBER: Record<number, string> = {
  1: 'Pilar',
  2: 'Hooker',
  3: 'Pilar',
  4: 'Segunda linea',
  5: 'Segunda linea',
  6: 'Tercera linea',
  7: 'Tercera linea',
  8: 'Tercera linea',
  9: 'Medio scrum',
  10: 'Apertura',
  11: 'Wing',
  12: 'Centro',
  13: 'Centro',
  14: 'Wing',
  15: 'Fullback',
};

export type LineupPlayer = {
  id: string | null;
  number: number | null;
  name: string;
  position: string | null;
  role: 'starter' | 'substitute';
  rating: null;
  isCaptain: boolean;
};

export type LineupParseResult = {
  /** `null` en un lado que no vino: ese lado NO se toca. */
  home: LineupPlayer[] | null;
  away: LineupPlayer[] | null;
  /** Todo lo que no cierra, en castellano y listo para mostrar. */
  issues: string[];
};

type PlayerInput = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }
  const raw = text(value);
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/**
 * Acepta las claves en castellano y en ingles. El JSON con el que se cargan las
 * fechas de URBA esta escrito en castellano (`numero`, `nombre`, `capitan`), y
 * obligar a traducirlo seria un paso de mas para nada.
 */
function normalizePlayer(
  raw: PlayerInput,
  fallbackRole: 'starter' | 'substitute',
  issues: string[],
  where: string,
): LineupPlayer | null {
  const name = text(raw.name) || text(raw.nombre);
  if (!name) {
    issues.push(`${where}: hay un jugador sin nombre`);
    return null;
  }

  const id = text(raw.id);
  if (id && !isUuid(id)) {
    issues.push(`${where}: el id de "${name}" no es un uuid`);
    return null;
  }

  const number = toNumber(raw.number ?? raw.numero);
  const declaredRole = text(raw.role);
  const role =
    declaredRole === 'substitute'
      ? 'substitute'
      : declaredRole === 'starter'
        ? 'starter'
        : fallbackRole;

  return {
    id: id || null,
    number,
    name,
    position:
      text(raw.position) ||
      text(raw.puesto) ||
      (number !== null ? (POSITION_BY_NUMBER[number] ?? null) : null),
    role,
    rating: null,
    isCaptain: raw.isCaptain === true || raw.capitan === true,
  };
}

/**
 * Un lado viene como lista plana (con `role` en cada jugador) o partido en
 * `titulares`/`starters` y `suplentes`/`substitutes`.
 */
function normalizeSide(raw: unknown, where: string, issues: string[]): LineupPlayer[] | null {
  if (raw === undefined || raw === null) {
    return null;
  }

  if (Array.isArray(raw)) {
    return raw
      .map((player) => normalizePlayer((player ?? {}) as PlayerInput, 'starter', issues, where))
      .filter((player): player is LineupPlayer => player !== null);
  }

  if (typeof raw !== 'object') {
    issues.push(`${where}: se esperaba una lista de jugadores`);
    return null;
  }

  const source = raw as Record<string, unknown>;
  const starters = source.starters ?? source.titulares;
  const substitutes = source.substitutes ?? source.suplentes;

  if (!Array.isArray(starters) && !Array.isArray(substitutes)) {
    issues.push(`${where}: se esperaba una lista de jugadores, o titulares y suplentes`);
    return null;
  }

  return [
    ...(Array.isArray(starters) ? starters : []).map((player) =>
      normalizePlayer((player ?? {}) as PlayerInput, 'starter', issues, `${where} (titulares)`),
    ),
    ...(Array.isArray(substitutes) ? substitutes : []).map((player) =>
      normalizePlayer((player ?? {}) as PlayerInput, 'substitute', issues, `${where} (suplentes)`),
    ),
  ].filter((player): player is LineupPlayer => player !== null);
}

/** Dos capitanes del mismo lado, o dos veces la misma camiseta, es un error de carga. */
function checkSide(players: LineupPlayer[], where: string, issues: string[]) {
  const captains = players.filter((player) => player.isCaptain);
  if (captains.length > 1) {
    issues.push(
      `${where}: hay ${captains.length} capitanes (${captains.map((c) => c.name).join(', ')})`,
    );
  }

  const seen = new Map<number, string>();
  for (const player of players) {
    if (player.number === null) {
      continue;
    }

    const previous = seen.get(player.number);
    if (previous) {
      issues.push(`${where}: el numero ${player.number} esta repetido (${previous} y ${player.name})`);
    } else {
      seen.set(player.number, player.name);
    }
  }
}

/**
 * Lee `{ home, away }` — o `{ lineups: { home, away } }`, o `local`/`visitante` —
 * y devuelve los dos lados normalizados mas la lista de problemas.
 *
 * Un lado ausente vuelve como `null`, no como lista vacia: la diferencia es la
 * que evita que cargar la formacion local borre la visitante.
 */
export function parseLineupPayload(payload: Record<string, unknown>): LineupParseResult {
  const container = (payload.lineups ?? payload) as Record<string, unknown>;
  const issues: string[] = [];

  const home = normalizeSide(container.home ?? container.local, 'local', issues);
  const away = normalizeSide(container.away ?? container.visitante, 'visitante', issues);

  if (home) {
    checkSide(home, 'local', issues);
  }
  if (away) {
    checkSide(away, 'visitante', issues);
  }

  return { home, away, issues };
}
