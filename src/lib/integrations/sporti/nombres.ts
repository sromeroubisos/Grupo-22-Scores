/**
 * Identidad de SporTI (plataforma.sporti.com.br, el sistema de competiciones
 * de la Confederação Brasileira de Rugby y de sus federaciones) dentro del
 * proyecto.
 *
 * SporTI numera todo y los números son estables:
 *
 *   organización  `185` = CBRu (las federaciones son "ligas" de la 185)
 *   campeonato    `3542` Super 12 Primeira 2026          → `tournaments.external_id = sporti:3542`
 *   fase          `1367` Fase de Grupos del 3542          → `tournament_phases.settings.sporti.fase`
 *   súmula        `106461` (el id de la planilla)         → `matches.external_id = sporti:s106461`
 *   equipo        `farrapos-rugby-clube` (un slug)        → `club_external_ids` (provider `sporti`, `equipe:farrapos-rugby-clube`)
 *
 * El id de campeonato ya es por temporada (2025 y 2026 son campeonatos
 * distintos), así que no hace falta la temporada en el external_id.
 *
 * ## El slug es del CLUB, no del equipo
 *
 * Al revés que en iSquad, SporTI usa el mismo slug para la primera masculina y
 * para el femenino de un club: Charrua juega el Super 12 y la Copa do Brasil
 * Femenina como `charrua-rugby-clube`. Acá cada equipo es su propia ficha
 * (`-femenino`), así que la clave del alias lleva la RAMA del torneo:
 * `equipe:charrua-rugby-clube` es la masculina y
 * `equipe:charrua-rugby-clube:feminino` la femenina. La rama la declara la
 * temporada (`settings.sporti.rama`).
 */

export const SPORTI_PROVIDER = 'sporti';
export const SPORTI_ID_PREFIX = 'sporti:';
/** La CBRu dentro de SporTI. */
export const SPORTI_ORGANIZACAO_CBRU = 185;
/** El fixture se publica en hora de Brasilia. */
export const SPORTI_ZONA_HORARIA = 'America/Sao_Paulo';

export type RamaSporti = 'masculino' | 'feminino';

/** `sporti:3542` → campeonato `3542`. */
export function parseTournamentExternalId(externalId: string): { campeonato: string } | null {
  const m = /^sporti:(\d+)$/.exec(externalId ?? '');
  return m ? { campeonato: m[1] } : null;
}

export const buildTournamentExternalId = (campeonato: string | number) => `${SPORTI_ID_PREFIX}${campeonato}`;

export const buildMatchExternalId = (sumulaId: string | number) => `${SPORTI_ID_PREFIX}s${sumulaId}`;

export const claveDeEquipo = (slug: string, rama: RamaSporti = 'masculino') =>
  rama === 'feminino' ? `equipe:${slug}:feminino` : `equipe:${slug}`;

const RONDAS_DE_LLAVE: Record<string, string> = {
  'OITAVAS DE FINAL': 'Octavos de final',
  'QUARTAS DE FINAL': 'Cuartos de final',
  'SEMI FINAL': 'Semifinal',
  SEMIFINAL: 'Semifinal',
  'DISPUTA DE 3º LUGAR': 'Tercer puesto',
  FINAL: 'Final',
};

/**
 * El título de una columna de SporTI → el nombre de la ronda acá: "Rodada 3"
 * queda igual y las llaves se traducen. Lo usan el alta (para crear la ronda)
 * y el cron (para colgarle el partido), así que tiene que ser una sola función.
 */
export function nombreDeRonda(columna: string): string {
  const limpia = columna.trim().replace(/\s+/g, ' ');
  const rodada = /^rodada\s+(\d+)$/i.exec(limpia);
  if (rodada) return `Rodada ${rodada[1]}`;
  return RONDAS_DE_LLAVE[limpia.toUpperCase()] ?? limpia.charAt(0).toUpperCase() + limpia.slice(1).toLowerCase();
}

/**
 * Hora de pared de Brasilia → instante ISO con su offset.
 *
 * Brasil no tiene horario de verano desde 2019, pero el offset se le pide
 * igual a `Intl` para ESE día: si vuelve, esto no se entera tarde. Se mide al
 * mediodía UTC, lejos de cualquier cambio de hora.
 */
export function brasiliaAIso(fecha: string, hora: string): string | null {
  const f = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((fecha ?? '').trim());
  const h = /^(\d{1,2}):(\d{2})$/.exec((hora ?? '').trim());
  if (!f || !h) return null;
  const [, d, mes, a] = f;
  if (Number(mes) < 1 || Number(mes) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  if (Number(h[1]) > 23 || Number(h[2]) > 59) return null;
  const mediodia = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d), 12));
  const nombre = new Intl.DateTimeFormat('en-US', { timeZone: SPORTI_ZONA_HORARIA, timeZoneName: 'shortOffset' })
    .formatToParts(mediodia)
    .find((p) => p.type === 'timeZoneName')?.value ?? '';
  const o = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(nombre);
  if (!o) return null;
  const offset = `${o[1]}${o[2].padStart(2, '0')}:${o[3] ?? '00'}`;
  return `${a}-${mes}-${d}T${h[1].padStart(2, '0')}:${h[2]}:00${offset}`;
}
