import { combineLocalDateTimeToUtcIso, ensureUtcDateTimeString } from '../../timezone.ts';
import { buildUrbaExternalId, buildUrbaMatchExternalId, corregirUrbaClubId } from './externalId.ts';

/**
 * Traduce un torneo de URBA a filas de `matches`, sin escribir nada.
 *
 * Es una función pura: recibe el payload, el resolvedor de clubes y lo que ya
 * hay en la base, y devuelve el plan. La escritura la hace otro. Así el mapeo
 * —que es donde viven los bugs que ensucian tablas— se puede probar sin base.
 */

// ── estados ─────────────────────────────────────────────────────────────────
// El CHECK de matches.status acepta SÓLO estos cinco. 'cancelled' NO está:
// escribirlo es un 23514. URBA tampoco lo informa, pero el mapa se declara acá
// para que agregar un estado nuevo obligue a mirar esta lista.
export const MATCH_STATUS_PERMITIDOS = ['scheduled', 'live', 'final', 'postponed', 'suspended'] as const;
export type MatchStatus = (typeof MATCH_STATUS_PERMITIDOS)[number];

export interface UrbaMatchLike {
  id: number;
  playdate: string | null;
  local_team_id: number | null;
  visit_team_id: number | null;
  local_team_score: number | null;
  visit_team_score: number | null;
  fulfilled: boolean;
  suspended: boolean;
  /**
   * Los cuatro bonus, por partido. El ofensivo NO se puede derivar: es "4+ tries"
   * y URBA no publica tries, sólo la bandera ya resuelta. O viene de acá o no
   * existe — sin él las tablas dan 0/14 en puntos contra /api/positions.
   */
  local_team_offensive_bonus?: number | null;
  visit_team_offensive_bonus?: number | null;
  local_team_defensive_bonus?: number | null;
  visit_team_defensive_bonus?: number | null;
}

export interface EstadoYResultado {
  status: MatchStatus;
  score: { home: number; away: number } | null;
}

/**
 * El orden importa y no es intercambiable.
 *
 * `fulfilled: false` trae los scores en CERO, no en null. Si esos ceros se
 * escriben como resultado, cada partido futuro entra como un 0-0 y las tablas se
 * llenan de empates falsos. El motor de posiciones sólo suma `status in (final,
 * finished, ft)`, así que hay una segunda barrera — pero la primera es ésta, y
 * es la que evita que el dato sucio llegue a la fila.
 */
export function mapEstadoYResultado(m: UrbaMatchLike): EstadoYResultado {
  if (m.fulfilled === true) {
    return {
      status: 'final',
      score: { home: Number(m.local_team_score ?? 0), away: Number(m.visit_team_score ?? 0) },
    };
  }
  if (m.suspended === true) return { status: 'suspended', score: null };
  return { status: 'scheduled', score: null };
}

const entero = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Para comparar contra la base, donde la columna puede venir NULL. */
const numeroONulo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Compara dos resultados por VALOR, no por su serialización.
 *
 * `JSON.stringify` acá es una trampa: Postgres normaliza las claves del `jsonb`
 * en orden alfabético y devuelve `{"away":25,"home":27}`, mientras que el
 * conector arma `{home, away}`. Las dos cadenas son distintas y los dos
 * resultados son el mismo. Comparándolas como texto, TODOS los partidos jugados
 * salían "cambiados": la primera pasada en seco del cron reportó 1.992
 * actualizaciones sobre 44 torneos, todas de `score` y ninguna finalizando.
 *
 * No es cosmético: cada UPDATE de más mueve `updated_at`, y un UPDATE de
 * `status` es lo que dispara el trigger de notificaciones.
 */
const mismoResultado = (
  a: unknown,
  b: { home: number; away: number } | null,
): boolean => {
  const norm = (v: unknown): { home: number; away: number } | null => {
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    const home = numeroONulo(o.home ?? o.home_score);
    const away = numeroONulo(o.away ?? o.away_score);
    return home === null || away === null ? null : { home, away };
  };
  const x = norm(a), y = norm(b);
  if (x === null || y === null) return x === y;
  return x.home === y.home && x.away === y.away;
};

/**
 * El puntaje base de URBA: 4 la victoria, 2 el empate, 0 la derrota.
 *
 * Se materializa en la fila por dos razones, y ninguna es de gusto:
 *  · `matches.home_base_points` es NOT NULL — dejarlo vacío es un 23502.
 *  · El único camino que el motor ofrece para un bonus que no puede derivar es
 *    `points_autocalculated = false`, y por ese camino el base sale de la fila
 *    (`m.home_base_points ?? …`), no del reglamento.
 *
 * O sea que el base queda congelado acá. Es el mismo 4/2/0 que declaran las 9
 * fases de URBA que existen en la base, así que hoy no hay divergencia; pero si
 * URBA cambiara su sistema de puntos, esta constante es lo que hay que tocar —
 * y las filas ya escritas habría que recalcularlas.
 */
export const PUNTOS_URBA = { win: 4, draw: 2, loss: 0 } as const;

/** Puntos base de cada lado. Un partido no jugado no reparte nada. */
export function basePorPartido(
  score: { home: number; away: number } | null,
  status: MatchStatus,
): { home: number; away: number } {
  if (status !== 'final' || !score) return { home: 0, away: 0 };
  if (score.home > score.away) return { home: PUNTOS_URBA.win, away: PUNTOS_URBA.loss };
  if (score.home < score.away) return { home: PUNTOS_URBA.loss, away: PUNTOS_URBA.win };
  return { home: PUNTOS_URBA.draw, away: PUNTOS_URBA.draw };
}

/**
 * Los puntos bonus de un partido, sumando ofensivo y defensivo por lado.
 *
 * Sólo tienen sentido en un partido jugado: `fulfilled: false` trae los cuatro
 * campos en cero, igual que los scores, y escribirlos sería inventar un dato en
 * cada fecha futura. Por eso se piden el estado ya resuelto y no se recalcula acá.
 */
export function bonusDeUrba(
  m: UrbaMatchLike,
  status: MatchStatus,
): { home: number; away: number } | null {
  if (status !== 'final') return null;
  return {
    home: entero(m.local_team_offensive_bonus) + entero(m.local_team_defensive_bonus),
    away: entero(m.visit_team_offensive_bonus) + entero(m.visit_team_defensive_bonus),
  };
}

/**
 * El horario por defecto cuando URBA no informa hora, por `subcategory`.
 *
 * URBA publica el DÍA, no la hora: todo llega como `T00:00:00` y el fixture
 * termina mostrando 00:00. El horario habitual de las divisiones superiores son
 * las 15:30, así que se completa acá.
 *
 * Va en el CONECTOR y no en la base a propósito. Escrito sólo en la fila, la
 * próxima pasada del cron ve `date_time` distinto del que calcula, lo marca como
 * cambio y lo reescribe con la medianoche de URBA — la corrección dura hasta la
 * siguiente corrida. Siendo regla del conector, las dos puntas calculan lo mismo
 * y el partido queda `sinCambios`.
 *
 * Las claves son valores de `tournaments.subcategory`, que sale de
 * `subcategoriaDeTorneoUrba`. Lo que no está acá se deja como viene: para
 * juveniles, femenino y formativo todavía no hay horario definido, y poner uno
 * inventado es peor que mostrar la medianoche, porque no se distingue del dato real.
 */
export const HORARIO_POR_SUBCATEGORIA: Readonly<Record<string, string>> = Object.freeze({
  Superior: '15:30',
});

/** `HH:MM` por defecto para una subcategoría, o null si no tiene uno definido. */
export function horarioPorDefectoDe(subcategory: string | null | undefined): string | null {
  const clave = String(subcategory ?? '').trim();
  return HORARIO_POR_SUBCATEGORIA[clave] ?? null;
}

/** URBA "no informó hora" se reconoce por la medianoche exacta del día local. */
const SIN_HORA = /^(\d{4}-\d{2}-\d{2})T00:00(?::00(?:\.000)?)?$/;

/**
 * `playdate` es hora LOCAL de Buenos Aires y llega siempre como `T00:00:00`:
 * URBA publica el día, no la hora.
 *
 * Interpretarlo sin zona es el error que ya se cometió una vez — un partido del
 * sábado leído como UTC cae en domingo. Tanto `combineLocalDateTimeToUtcIso` como
 * `ensureUtcDateTimeString` convierten explícitamente desde APP_TIMEZONE, así que
 * el día no corre: 15:30 de Buenos Aires es 18:30Z del MISMO día.
 *
 * La medianoche exacta es el centinela de "no hay hora". Es el único valor que
 * URBA produce cuando no la informa, y ningún partido de rugby arranca a las 00:00,
 * así que no se pisa ningún dato real. Si algún día URBA publicara la hora, ese
 * partido no matchea el centinela y pasa intacto.
 */
export function playdateToUtcIso(
  playdate: string | null | undefined,
  subcategory?: string | null,
): string | null {
  if (!playdate) return null;

  const sinHora = String(playdate).match(SIN_HORA);
  const porDefecto = sinHora ? horarioPorDefectoDe(subcategory) : null;
  if (sinHora && porDefecto) {
    return combineLocalDateTimeToUtcIso(sinHora[1], porDefecto);
  }

  const iso = ensureUtcDateTimeString(playdate);
  return typeof iso === 'string' ? iso : null;
}

export const esBye = (nombre: unknown): boolean => /^bye\b/i.test(String(nombre ?? '').trim());

/** Sufijo del nombre del equipo: la última palabra cuando es una letra de A a H. */
const sufijoDe = (nombre: string): string => {
  const m = String(nombre ?? '').trim().match(/\s+([A-H])$/);
  return m ? m[1] : '';
};

export interface MatchRow {
  external_id: string;
  tournament_id: string;
  home_club_id: string;
  away_club_id: string;
  date_time: string;
  status: MatchStatus;
  score: { home: number; away: number } | null;
  round_label: string | null;
  venue: null;
  /**
   * El único camino que el motor ofrece para un bonus que no puede derivar.
   * `StandingsEngine.buildTableRows` sólo mira `home_bonus_points` cuando
   * `points_autocalculated === false`; con `true` lo ignora y trata de deducir
   * el bonus de los eventos del partido, que en un partido importado no existen.
   */
  points_autocalculated: boolean;
  /** Ver `PUNTOS_URBA`: la columna es NOT NULL y el motor lee el base de la fila. */
  home_base_points: number;
  away_base_points: number;
  /**
   * También NOT NULL, así que un partido sin bonus lleva 0 y no NULL. El 0 de un
   * partido no jugado es inofensivo porque va con `points_autocalculated: true`,
   * y por ese camino el motor no mira el bonus. `bonusDeUrba` sí distingue: ahí
   * `null` significa "no hay dato", que es distinto de "el dato es cero".
   */
  home_bonus_points: number;
  away_bonus_points: number;
}

/**
 * Una fila de `tournament_participants`. Sin ella el torneo no tiene tabla:
 * `StandingsEngine.buildTableRows` arma el mapa desde los participantes y
 * descarta el partido si alguno de los dos clubes falta — sin error y sin aviso.
 */
export interface ParticipantRow {
  tournament_id: string;
  club_id: string;
  name: string;
  type: 'club';
  status: 'active';
}

export type MotivoOmision =
  | 'equipo_no_resuelto'
  | 'sin_fecha'
  | 'bye'
  | 'equipo_ausente_en_el_torneo'
  | 'mismo_equipo_en_ambos_lados';

export interface Omitido {
  urba_match_id: number;
  external_id: string;
  motivo: MotivoOmision;
  detalle: string;
}

export interface PlanTorneo {
  crear: MatchRow[];
  actualizar: { fila: MatchRow; cambios: string[] }[];
  sinCambios: number;
  omitidos: Omitido[];
  /** partidos que URBA trae para este torneo, sin contar los Bye */
  totalUrba: number;
  estados: Record<string, number>;
  /** participantes que faltan; los que ya están no se repiten */
  participantesCrear: ParticipantRow[];
  /** participantes que ya estaban en la base para este torneo */
  participantesExistentes: number;
}

export interface ExistenteEnBase {
  date_time: string | null;
  venue: string | null;
  status: string | null;
  score: unknown;
  round_label: string | null;
  home_bonus_points?: unknown;
  away_bonus_points?: unknown;
  home_base_points?: unknown;
  away_base_points?: unknown;
  points_autocalculated?: unknown;
}

/**
 * @param resolverClub recibe el `external_id` del triple y devuelve `clubs.id`.
 *        NUNCA crea un club: si no resuelve, el partido no se escribe.
 * @param participantesYaEnBase `clubs.id` que ya son participantes de este
 *        torneo. `tournament_participants` NO tiene UNIQUE (hay pares repetidos
 *        preexistentes de torneos ajenos a URBA), así que la protección contra
 *        el duplicado se hace acá y en el INSERT con NOT EXISTS — nunca con un
 *        ON CONFLICT que no tiene índice donde apoyarse.
 * @param nombreDeClub nombre para la fila de participante. Sin él se usa el
 *        nombre que publica URBA.
 */
export function planTournamentMatches(input: {
  championship: { teams: { id: number; club_id: number | null; name: string }[]; rounds: { name: string | null; matches: UrbaMatchLike[] }[] };
  tournamentId: string;
  /** categoría del TORNEO (stg_urba_torneos.age_grade), no del equipo */
  categoria: string;
  /**
   * `tournaments.subcategory`. Sólo decide el horario por defecto cuando URBA no
   * informa hora (ver `HORARIO_POR_SUBCATEGORIA`); no interviene en la identidad
   * del partido ni en el triple del club.
   */
  subcategory?: string | null;
  resolverClub: (tripleExternalId: string) => string | null;
  existentes: Map<string, ExistenteEnBase>;
  participantesYaEnBase?: Set<string>;
  nombreDeClub?: (clubId: string) => string | null;
}): PlanTorneo {
  const { championship, tournamentId, categoria, resolverClub, existentes } = input;
  const yaParticipan = input.participantesYaEnBase ?? new Set<string>();

  // teams[].id es EFÍMERO: sirve sólo para resolver matches[] dentro de ESTE
  // torneo. La identidad estable es el triple (club_id, categoría, sufijo).
  const porTeamId = new Map<number, { clubId: string | null; triple: string | null; nombre: string; bye: boolean }>();
  for (const t of championship.teams ?? []) {
    const bye = esBye(t.name) || t.club_id == null;
    let triple: string | null = null;
    let clubId: string | null = null;
    if (!bye) {
      try {
        // El club_id pasa por la corrección ANTES de entrar al triple: en
        // 2021-2023 URBA publicó los equipos de San Andrés con el id de San
        // Albano, y sin esto 553 partidos entran bajo el club equivocado sin
        // que falle nada. Ver `corregirUrbaClubId` en externalId.ts.
        const urbaClubId = corregirUrbaClubId(t.club_id as number, t.name);
        triple = buildUrbaExternalId({ urbaClubId, categoria, sufijo: sufijoDe(t.name) });
        clubId = resolverClub(triple);
      } catch {
        triple = null;   // categoría o sufijo fuera del canon: no resuelve
      }
    }
    porTeamId.set(t.id, { clubId, triple, nombre: String(t.name ?? ''), bye });
  }

  const plan: PlanTorneo = {
    crear: [], actualizar: [], sinCambios: 0, omitidos: [], totalUrba: 0, estados: {},
    participantesCrear: [], participantesExistentes: 0,
  };

  // Un participante por club, derivado de teams[] sin los Bye. Entran TODOS los
  // equipos del torneo, hayan jugado o no: un equipo sin partidos es una fila en
  // cero de la tabla, no una ausencia.
  const vistos = new Set<string>();
  for (const t of championship.teams ?? []) {
    const e = porTeamId.get(t.id);
    if (!e || e.bye || !e.clubId || vistos.has(e.clubId)) continue;
    vistos.add(e.clubId);
    if (yaParticipan.has(e.clubId)) { plan.participantesExistentes++; continue; }
    plan.participantesCrear.push({
      tournament_id: tournamentId,
      club_id: e.clubId,
      name: input.nombreDeClub?.(e.clubId) || e.nombre,
      type: 'club',
      status: 'active',
    });
  }

  for (const round of championship.rounds ?? []) {
    for (const m of round.matches ?? []) {
      const externalId = buildUrbaMatchExternalId(m.id);
      const local = m.local_team_id != null ? porTeamId.get(m.local_team_id) : undefined;
      const visita = m.visit_team_id != null ? porTeamId.get(m.visit_team_id) : undefined;

      if (local?.bye || visita?.bye) {
        plan.omitidos.push({ urba_match_id: m.id, external_id: externalId, motivo: 'bye', detalle: `${local?.nombre ?? '?'} vs ${visita?.nombre ?? '?'}` });
        continue;
      }
      plan.totalUrba++;

      if (!local || !visita) {
        plan.omitidos.push({ urba_match_id: m.id, external_id: externalId, motivo: 'equipo_ausente_en_el_torneo', detalle: `team_id ${m.local_team_id} / ${m.visit_team_id} no está en teams[]` });
        continue;
      }
      if (!local.clubId || !visita.clubId) {
        const cuales = [!local.clubId ? `local "${local.nombre}" (triple ${local.triple ?? 'inválido'})` : null,
        !visita.clubId ? `visitante "${visita.nombre}" (triple ${visita.triple ?? 'inválido'})` : null].filter(Boolean).join(' · ');
        plan.omitidos.push({ urba_match_id: m.id, external_id: externalId, motivo: 'equipo_no_resuelto', detalle: cuales });
        continue;
      }
      if (local.clubId === visita.clubId) {
        plan.omitidos.push({ urba_match_id: m.id, external_id: externalId, motivo: 'mismo_equipo_en_ambos_lados', detalle: `${local.nombre} vs ${visita.nombre} -> ${local.clubId}` });
        continue;
      }

      const dateTime = playdateToUtcIso(m.playdate, input.subcategory);
      if (!dateTime) {
        // matches.date_time es NOT NULL y sin default: sin fecha no hay fila.
        plan.omitidos.push({ urba_match_id: m.id, external_id: externalId, motivo: 'sin_fecha', detalle: `playdate=${JSON.stringify(m.playdate)}` });
        continue;
      }

      const { status, score } = mapEstadoYResultado(m);
      plan.estados[status] = (plan.estados[status] || 0) + 1;
      const bonus = bonusDeUrba(m, status);
      const base = basePorPartido(score, status);

      const fila: MatchRow = {
        external_id: externalId,
        tournament_id: tournamentId,
        home_club_id: local.clubId,
        away_club_id: visita.clubId,
        date_time: dateTime,
        status,
        score,
        round_label: round.name ?? null,
        venue: null,   // URBA no publica sede por partido
        points_autocalculated: bonus === null,
        home_base_points: base.home,
        away_base_points: base.away,
        home_bonus_points: bonus ? bonus.home : 0,
        away_bonus_points: bonus ? bonus.away : 0,
      };

      const ya = existentes.get(externalId);
      if (!ya) { plan.crear.push(fila); continue; }

      // Sólo se compara lo que el UPDATE va a tocar. is_visible, review_status y
      // lo editado a mano no entran ni en la comparación ni en la escritura.
      const cambios: string[] = [];
      if (ya.date_time && new Date(ya.date_time).toISOString() !== fila.date_time) cambios.push('date_time');
      if (!ya.date_time) cambios.push('date_time');
      if ((ya.status ?? null) !== fila.status) cambios.push('status');
      if (!mismoResultado(ya.score, fila.score)) cambios.push('score');
      if ((ya.round_label ?? null) !== fila.round_label) cambios.push('round_label');
      // El bonus y el base cambian cuando URBA corrige un partido ya cargado. Sin
      // esta comparación el partido quedaría "sin cambios" con el bonus viejo.
      // Se comparan sólo si el llamador los trajo: no haberlos seleccionado no es
      // lo mismo que haber cambiado, y confundirlo reescribiría la tabla entera.
      for (const c of ['home_bonus_points', 'away_bonus_points', 'home_base_points', 'away_base_points'] as const) {
        if (ya[c] !== undefined && numeroONulo(ya[c]) !== fila[c]) cambios.push(c);
      }
      if (ya.points_autocalculated !== undefined
        && Boolean(ya.points_autocalculated) !== fila.points_autocalculated) cambios.push('points_autocalculated');

      if (cambios.length) plan.actualizar.push({ fila, cambios });
      else plan.sinCambios++;
    }
  }

  return plan;
}
