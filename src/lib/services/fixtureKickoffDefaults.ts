/**
 * Horarios habituales para la importación de fixtures.
 *
 * Una planilla de fixture casi nunca trae la hora: la trae el club local, que
 * juega siempre a la misma hora en su cancha. En vez de tipear cuarenta veces
 * «15:30», el torneo guarda los horarios habituales de cada club —y uno general
 * de respaldo— y el importador los SUGIERE en las filas sin hora. Sugerir, no
 * escribir: la hora sugerida se ve en la fila, se puede cambiar, y sólo se
 * graba al confirmar.
 *
 * Vive en `tournaments.ruleset.fixtureImport.kickoffDefaults` y no en una tabla
 * propia: es configuración del torneo, `ruleset` ya es el lugar donde el torneo
 * guarda su configuración, y así no depende de una migración.
 *
 * Módulo puro (sin Supabase ni React) para que lo usen el servidor, la UI y los
 * tests de Node por igual.
 */
import type {
  FixtureKickoffDefaults,
  FixtureKickoffSource,
} from '../types/fixture-import.ts';

export const KICKOFF_SOURCES: FixtureKickoffSource[] = ['home', 'away', 'tournament'];

/** Tope por club: más de seis «horarios habituales» ya no es un hábito. */
const MAX_TIMES_PER_OWNER = 6;

export function emptyKickoffDefaults(): FixtureKickoffDefaults {
  return { source: 'home', tournamentTimes: [], teamTimes: {} };
}

/** `HH:mm` válido o null. Acepta `9:05` y lo devuelve como `09:05`. */
export function normalizeKickoffTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Lista limpia: válidas, sin repetir, en el orden en que se cargaron. */
function sanitizeTimes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const time = normalizeKickoffTime(item);
    if (!time || seen.has(time)) continue;
    seen.add(time);
    out.push(time);
    if (out.length >= MAX_TIMES_PER_OWNER) break;
  }
  return out;
}

/**
 * Lleva cualquier cosa —lo que vino en un body, lo que había en el ruleset— a
 * una configuración válida. Nunca tira: una configuración rota es una vacía.
 *
 * `allowedClubIds`, si viene, descarta los clubes que no participan del torneo
 * (el servidor lo pasa al guardar para que el ruleset no junte basura).
 */
export function sanitizeKickoffDefaults(
  value: unknown,
  allowedClubIds?: ReadonlySet<string>,
): FixtureKickoffDefaults {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const source = KICKOFF_SOURCES.includes(record.source as FixtureKickoffSource)
    ? record.source as FixtureKickoffSource
    : 'home';

  const teamTimes: Record<string, string[]> = {};
  const rawTeams = record.teamTimes && typeof record.teamTimes === 'object' && !Array.isArray(record.teamTimes)
    ? record.teamTimes as Record<string, unknown>
    : {};
  // Orden estable por id: el JSON que se guarda no depende del orden en que
  // el usuario tocó los clubes.
  for (const clubId of Object.keys(rawTeams).sort()) {
    if (!clubId || (allowedClubIds && !allowedClubIds.has(clubId))) continue;
    const times = sanitizeTimes(rawTeams[clubId]);
    if (times.length) teamTimes[clubId] = times;
  }

  return { source, tournamentTimes: sanitizeTimes(record.tournamentTimes), teamTimes };
}

/** Lee la configuración guardada en el ruleset de un torneo. */
export function readKickoffDefaults(ruleset: unknown): FixtureKickoffDefaults {
  const record = ruleset && typeof ruleset === 'object' && !Array.isArray(ruleset)
    ? ruleset as Record<string, unknown>
    : {};
  const fixtureImport = record.fixtureImport && typeof record.fixtureImport === 'object'
    ? record.fixtureImport as Record<string, unknown>
    : {};
  return sanitizeKickoffDefaults(fixtureImport.kickoffDefaults);
}

/**
 * Devuelve el ruleset con la configuración nueva, tocando SÓLO su clave. El
 * resto del ruleset —puntos, desempates, fases, integraciones— pasa intacto.
 */
export function withKickoffDefaults(ruleset: unknown, defaults: FixtureKickoffDefaults): Record<string, unknown> {
  const record = ruleset && typeof ruleset === 'object' && !Array.isArray(ruleset)
    ? ruleset as Record<string, unknown>
    : {};
  const fixtureImport = record.fixtureImport && typeof record.fixtureImport === 'object' && !Array.isArray(record.fixtureImport)
    ? record.fixtureImport as Record<string, unknown>
    : {};
  return { ...record, fixtureImport: { ...fixtureImport, kickoffDefaults: defaults } };
}

export interface KickoffSuggestion {
  time: string;
  origin: FixtureKickoffSource;
  /** Otros horarios cargados que aplican al partido, para cambiar con un toque. */
  alternatives: string[];
}

/**
 * La hora que se sugiere para un partido sin hora.
 *
 * La fuente elegida manda; si ese club no tiene horario cargado, se cae al
 * general del torneo. No se salta al OTRO club: si el torneo dice «juega a la
 * hora del local», sugerir la del visitante sería contradecir la regla sin
 * avisar. El general sí es un respaldo explícito.
 */
export function suggestKickoff(
  defaults: FixtureKickoffDefaults,
  homeClubId: string | null | undefined,
  awayClubId: string | null | undefined,
): KickoffSuggestion | null {
  const home = homeClubId ? defaults.teamTimes[homeClubId] ?? [] : [];
  const away = awayClubId ? defaults.teamTimes[awayClubId] ?? [] : [];
  const general = defaults.tournamentTimes;

  const chain: Array<[FixtureKickoffSource, string[]]> =
    defaults.source === 'home'
      ? [['home', home], ['tournament', general]]
      : defaults.source === 'away'
        ? [['away', away], ['tournament', general]]
        : [['tournament', general]];

  const hit = chain.find(([, times]) => times.length > 0);
  if (!hit) return null;

  const [origin, times] = hit;
  const time = times[0];
  const alternatives: string[] = [];
  for (const candidate of [...times.slice(1), ...home, ...away, ...general]) {
    if (candidate !== time && !alternatives.includes(candidate)) alternatives.push(candidate);
  }
  return { time, origin, alternatives };
}
