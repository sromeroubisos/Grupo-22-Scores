/**
 * El plan de escritura de UN grupo de iSquad: qué partidos se crean y cuáles
 * se actualizan, a partir de `resultados_completos.php` y de las actas.
 *
 * Puro salvo por el reloj, que entra por parámetro (la regla de los tres días).
 *
 * ## La identidad
 *
 * El id de partido de iSquad (`mostrarPrevio(17739)`) existe desde que el
 * partido está en el fixture y no cambia cuando se reprograma, así que
 * `isquad:p17739` es la identidad. No hay adopción por par: estos torneos
 * nacen del conector, no había nada cargado a mano.
 *
 * ## El bonus, medido
 *
 * Reglamento de la FER, verificado contra las tablas oficiales de 2025/26 (DH,
 * DH Élite y Liga Iberdrola: 29 de 29 clubes) y de la 1ª jornada de 2026/27:
 *
 * - **Ofensivo**: marcar TRES tries más que el rival. NO es "4 tries" como en
 *   la URBA ni en el Super Rugby: 6 contra 3 da bonus; 5 contra 3, no.
 * - **Defensivo**: perder por 7 o menos. Con 5 la cuenta falla en 16 de 29.
 * - Puntos: 4 / 2 / 0 más los dos bonus, y en todos los clubes
 *   `PTS = 4·G + 2·E + BO + BD`.
 *
 * Los tries salen del acta. Si el acta todavía no está o no suma el marcador,
 * el partido se escribe igual —final, con el defensivo que no necesita tries—
 * y sale en `sinTries`; la corrida siguiente lo vuelve a pedir, porque un
 * marcador sin `homeTries` es justamente la marca de "falta el acta".
 *
 * ## El partido que nadie cargó
 *
 * Igual que en la AAHBA: una jornada que pasó hace más de `DIAS_PARA_POSTERGAR`
 * días y sigue "Pendiente" pasa a `postponed`, y vuelve a `scheduled` si la
 * federación le pone fecha nueva. "Aplazado" es `postponed` directo.
 *
 * ## Lo que este plan NO hace
 *
 * No pone `live`: iSquad no publica un estado en juego confiable y el proyecto
 * ya tiene `live-sync`. Tampoco escribe la cronología del acta en
 * `match_events`; por ahora el acta solo aporta los tries.
 */
import type { PartidoIsquad, ResumenActa } from './parse.ts';
import { buildMatchExternalId, claveDeEquipo, madridAIso } from './nombres.ts';

export const PUNTOS_FER = { win: 4, draw: 2, loss: 0 } as const;
/** Tries de diferencia para el bonus ofensivo. */
export const BONUS_OFENSIVO_DIFERENCIA = 3;
/** Margen de la derrota para el bonus defensivo. */
export const BONUS_DEFENSIVO_MARGEN = 7;
export const DIAS_PARA_POSTERGAR = 3;
/** iSquad publica `0:00` cuando no hay horario: el partido se ubica al mediodía de Madrid. */
const HORA_POR_DEFECTO = '12:00';
export const NOTA_SIN_HORARIO = 'Horario a confirmar';

export type EstadoG22 = 'scheduled' | 'final' | 'postponed';

export interface MarcadorIsquad {
  home: number;
  away: number;
  homeTries?: number;
  awayTries?: number;
}

export interface ExistenteIsquad {
  id: string;
  external_id: string | null;
  home_club_id: string | null;
  away_club_id: string | null;
  date_time: string | null;
  status: string | null;
  score: MarcadorIsquad | null;
  phase_id: string | null;
  group_id: string | null;
  round_uuid: string | null;
  round_label: string | null;
  venue: string | null;
  stream_url: string | null;
  notes: string | null;
  home_base_points: number | null;
  away_base_points: number | null;
  home_bonus_points: number | null;
  away_bonus_points: number | null;
}

export interface FilaPartido {
  external_id: string;
  home_club_id: string;
  away_club_id: string;
  date_time: string;
  status: EstadoG22;
  score: MarcadorIsquad | null;
  phase_id: string;
  group_id: string | null;
  round_uuid: string | null;
  round_label: string | null;
  venue: string | null;
  stream_url: string | null;
  notes: string | null;
  points_autocalculated: false;
  home_base_points: number;
  away_base_points: number;
  home_bonus_points: number;
  away_bonus_points: number;
}

export type MotivoOmision = 'equipo_no_resuelto' | 'mismo_equipo_en_ambos_lados' | 'fecha_ilegible';

export interface PlanIsquad {
  crear: FilaPartido[];
  actualizar: { id: string; patch: Partial<FilaPartido>; cambios: string[] }[];
  omitidos: { motivo: MotivoOmision; detalle: string }[];
  /** finales escritos sin tries (sin acta o acta que no suma): les falta el ofensivo */
  sinTries: string[];
  /** estados de iSquad que el plan no conoce; el partido queda como estaba */
  estadosDesconocidos: string[];
  /** finales que estaban con otro marcador; manda iSquad */
  correcciones: string[];
  sinCambios: number;
  /** cómo quedan TODOS los finales del grupo, para contrastar con la tabla oficial */
  finales: FinalDelGrupo[];
}

export interface FinalDelGrupo {
  localId: string;
  visitanteId: string;
  score: MarcadorIsquad;
  puntosLocal: number;
  puntosVisitante: number;
}

export interface DiferenciaConLaTabla {
  equipoId: string;
  campo: 'pts' | 'pj' | 'tries';
  nuestro: number;
  oficial: number;
}

/**
 * Nuestra cuenta contra la tabla oficial, equipo por equipo: puntos, jugados y
 * tries a favor. Los tries solo se comparan si todos los partidos del equipo
 * los tienen. Vacío = la tabla que va a dibujar G22 es la de la federación.
 */
export function contrastarConTabla(
  finales: FinalDelGrupo[],
  tabla: { equipoId: string; pts: number; pj: number; ef: number }[],
): DiferenciaConLaTabla[] {
  const cuenta = new Map<string, { pts: number; pj: number; tries: number; triesCompletos: boolean }>();
  const sumar = (id: string, pts: number, tries: number | undefined) => {
    const c = cuenta.get(id) ?? { pts: 0, pj: 0, tries: 0, triesCompletos: true };
    c.pts += pts;
    c.pj += 1;
    if (Number.isFinite(tries)) c.tries += tries as number; else c.triesCompletos = false;
    cuenta.set(id, c);
  };
  for (const f of finales) {
    sumar(f.localId, f.puntosLocal, f.score.homeTries);
    sumar(f.visitanteId, f.puntosVisitante, f.score.awayTries);
  }
  const out: DiferenciaConLaTabla[] = [];
  for (const fila of tabla) {
    const c = cuenta.get(fila.equipoId) ?? { pts: 0, pj: 0, tries: 0, triesCompletos: true };
    if (c.pts !== fila.pts) out.push({ equipoId: fila.equipoId, campo: 'pts', nuestro: c.pts, oficial: fila.pts });
    if (c.pj !== fila.pj) out.push({ equipoId: fila.equipoId, campo: 'pj', nuestro: c.pj, oficial: fila.pj });
    if (c.triesCompletos && c.tries !== fila.ef) out.push({ equipoId: fila.equipoId, campo: 'tries', nuestro: c.tries, oficial: fila.ef });
  }
  return out;
}

export function puntosDeBase(propios: number, rival: number): number {
  if (propios > rival) return PUNTOS_FER.win;
  if (propios < rival) return PUNTOS_FER.loss;
  return PUNTOS_FER.draw;
}

/** Bonus de un lado. `tries` en `null` = desconocidos: solo puede haber defensivo. */
export function bonusDe(propios: number, rival: number, tries: { propios: number; rival: number } | null): number {
  let b = 0;
  if (propios < rival && rival - propios <= BONUS_DEFENSIVO_MARGEN) b += 1;
  if (tries && tries.propios - tries.rival >= BONUS_OFENSIVO_DIFERENCIA) b += 1;
  return b;
}

const ESTADOS_FINAL = new Set(['finalizado']);
const ESTADOS_APLAZADO = new Set(['aplazado', 'suspendido']);
const ESTADOS_PENDIENTE = new Set(['pendiente', '']);

const tieneTries = (s: MarcadorIsquad | null | undefined) =>
  s != null && Number.isFinite(s.homeTries) && Number.isFinite(s.awayTries);

/**
 * Qué actas hay que pedir: las de los partidos finalizados que todavía no
 * tienen tries guardados, o cuyo marcador cambió (el acta vieja ya no vale).
 */
export function partidosQueNecesitanActa(partidos: PartidoIsquad[], existentes: ExistenteIsquad[]): string[] {
  const porExternal = new Map(existentes.filter((e) => e.external_id).map((e) => [e.external_id as string, e]));
  return partidos
    .filter((p) => ESTADOS_FINAL.has(p.estado.toLowerCase()) && p.conActa && p.puntosLocal !== null && p.puntosVisitante !== null)
    .filter((p) => {
      const e = porExternal.get(buildMatchExternalId(p.id));
      if (!e || !tieneTries(e.score)) return true;
      return e.score?.home !== p.puntosLocal || e.score?.away !== p.puntosVisitante;
    })
    .map((p) => p.id);
}

const mismoInstante = (a: string | null, b: string | null): boolean => {
  if (!a || !b) return a === b;
  const ta = Date.parse(a), tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return Math.abs(ta - tb) < 60_000;
};

const mismoMarcador = (a: MarcadorIsquad | null, b: MarcadorIsquad | null) => {
  if (a === null || b === null) return a === b;
  return a.home === b.home && a.away === b.away
    && (a.homeTries ?? null) === (b.homeTries ?? null)
    && (a.awayTries ?? null) === (b.awayTries ?? null);
};

const textoMarcador = (s: MarcadorIsquad | null) => (s ? `${s.home}-${s.away}` : 'sin marcador');

export function planIsquadMatches(input: {
  partidos: PartidoIsquad[];
  /** `equipo:{id}` → club_id; `null` si no lo conoce */
  resolverEquipo: (clave: string) => string | null;
  existentes: ExistenteIsquad[];
  /** resumen del acta por id de partido de iSquad (solo los que se pidieron) */
  actas: Map<string, ResumenActa>;
  faseId: string;
  grupoId: string | null;
  /** jornada → `tournament_rounds.id` */
  rondaDe: (jornada: number | null) => string | null;
  ahora: Date;
}): PlanIsquad {
  const { partidos, resolverEquipo, existentes, actas, faseId, grupoId, rondaDe, ahora } = input;
  const plan: PlanIsquad = {
    crear: [], actualizar: [], omitidos: [], sinTries: [], estadosDesconocidos: [], correcciones: [], sinCambios: 0, finales: [],
  };
  const porExternal = new Map(existentes.filter((e) => e.external_id).map((e) => [e.external_id as string, e]));
  const limitePostergar = ahora.getTime() - DIAS_PARA_POSTERGAR * 24 * 60 * 60 * 1000;

  for (const p of partidos) {
    const home = resolverEquipo(claveDeEquipo(p.localId));
    const away = resolverEquipo(claveDeEquipo(p.visitanteId));
    const rotulo = `J${p.jornada ?? '?'} ${p.localId} vs ${p.visitanteId} (p${p.id})`;
    if (!home || !away) {
      plan.omitidos.push({ motivo: 'equipo_no_resuelto', detalle: `${rotulo}: falta equipo:${!home ? p.localId : p.visitanteId}` });
      continue;
    }
    if (home === away) {
      plan.omitidos.push({ motivo: 'mismo_equipo_en_ambos_lados', detalle: `${rotulo} → ${home}` });
      continue;
    }
    const dateTime = p.fecha ? madridAIso(p.fecha, p.hora ?? HORA_POR_DEFECTO) : null;
    if (!dateTime) {
      plan.omitidos.push({ motivo: 'fecha_ilegible', detalle: `${rotulo}: "${p.fecha} ${p.hora ?? ''}"` });
      continue;
    }

    const externalId = buildMatchExternalId(p.id);
    const existente = porExternal.get(externalId);
    const estadoFuente = p.estado.toLowerCase();
    const conMarcador = p.puntosLocal !== null && p.puntosVisitante !== null;

    let status: EstadoG22;
    if (ESTADOS_FINAL.has(estadoFuente) && conMarcador) status = 'final';
    else if (ESTADOS_APLAZADO.has(estadoFuente)) status = 'postponed';
    else if (ESTADOS_PENDIENTE.has(estadoFuente) || ESTADOS_FINAL.has(estadoFuente)) {
      status = Date.parse(dateTime) < limitePostergar ? 'postponed' : 'scheduled';
    } else {
      plan.estadosDesconocidos.push(`${rotulo}: "${p.estado}"`);
      status = (existente?.status as EstadoG22 | undefined) ?? 'scheduled';
    }

    let score: MarcadorIsquad | null = null;
    let home_bonus_points = 0;
    let away_bonus_points = 0;
    if (status === 'final') {
      const hs = p.puntosLocal as number, as = p.puntosVisitante as number;
      const acta = actas.get(p.id);
      // El acta vale solo si suma el marcador: si no, no se le cree ni un try.
      const actaValida = acta && acta.puntosLocal === hs && acta.puntosVisitante === as ? acta : null;
      // Sin acta nueva, los tries ya guardados siguen valiendo mientras el marcador sea el mismo.
      const guardados = !actaValida && existente && tieneTries(existente.score)
        && existente.score?.home === hs && existente.score?.away === as ? existente.score : null;
      const tries = actaValida
        ? { home: actaValida.triesLocal, away: actaValida.triesVisitante }
        : guardados ? { home: guardados.homeTries as number, away: guardados.awayTries as number } : null;
      score = tries ? { home: hs, away: as, homeTries: tries.home, awayTries: tries.away } : { home: hs, away: as };
      if (!tries) plan.sinTries.push(`${rotulo} ${hs}-${as}${acta ? ' (el acta no suma el marcador)' : ''}`);
      home_bonus_points = bonusDe(hs, as, tries ? { propios: tries.home, rival: tries.away } : null);
      away_bonus_points = bonusDe(as, hs, tries ? { propios: tries.away, rival: tries.home } : null);
    }

    const deseado: FilaPartido = {
      external_id: externalId,
      home_club_id: home,
      away_club_id: away,
      date_time: dateTime,
      status,
      score,
      phase_id: faseId,
      group_id: grupoId,
      round_uuid: rondaDe(p.jornada),
      round_label: p.jornada ? `Jornada ${p.jornada}` : null,
      venue: p.cancha,
      stream_url: p.streaming,
      notes: p.hora ? null : NOTA_SIN_HORARIO,
      points_autocalculated: false,
      home_base_points: score ? puntosDeBase(score.home, score.away) : 0,
      away_base_points: score ? puntosDeBase(score.away, score.home) : 0,
      home_bonus_points,
      away_bonus_points,
    };

    if (score) {
      plan.finales.push({
        localId: p.localId,
        visitanteId: p.visitanteId,
        score,
        puntosLocal: deseado.home_base_points + home_bonus_points,
        puntosVisitante: deseado.away_base_points + away_bonus_points,
      });
    }

    if (!existente) {
      plan.crear.push(deseado);
      continue;
    }

    const patch: Partial<FilaPartido> = {};
    const cambios: string[] = [];
    const poner = <K extends keyof FilaPartido>(k: K, etiqueta: string) => {
      patch[k] = deseado[k];
      cambios.push(etiqueta);
    };

    if (existente.home_club_id !== home || existente.away_club_id !== away) {
      poner('home_club_id', `local ${existente.home_club_id} → ${home}`);
      poner('away_club_id', `visitante ${existente.away_club_id} → ${away}`);
    }
    if (existente.status !== status) poner('status', `estado ${existente.status} → ${status}`);
    if (!mismoMarcador(existente.score, score)) {
      if (existente.status === 'final' && score && (existente.score?.home !== score.home || existente.score?.away !== score.away)) {
        plan.correcciones.push(`${rotulo}: estaba ${textoMarcador(existente.score)}, iSquad publica ${textoMarcador(score)}`);
      }
      poner('score', `marcador ${textoMarcador(existente.score)} → ${textoMarcador(score)}${score && tieneTries(score) && !tieneTries(existente.score) ? ' (+tries)' : ''}`);
    }
    if (Number(existente.home_base_points ?? 0) !== deseado.home_base_points
      || Number(existente.away_base_points ?? 0) !== deseado.away_base_points
      || Number(existente.home_bonus_points ?? 0) !== deseado.home_bonus_points
      || Number(existente.away_bonus_points ?? 0) !== deseado.away_bonus_points) {
      patch.home_base_points = deseado.home_base_points;
      patch.away_base_points = deseado.away_base_points;
      patch.home_bonus_points = deseado.home_bonus_points;
      patch.away_bonus_points = deseado.away_bonus_points;
      patch.points_autocalculated = false;
      cambios.push(`puntos ${deseado.home_base_points}+${deseado.home_bonus_points} / ${deseado.away_base_points}+${deseado.away_bonus_points}`);
    }
    if (!mismoInstante(existente.date_time, dateTime)) poner('date_time', `fecha ${existente.date_time ?? 'sin fecha'} → ${dateTime}`);
    if (existente.phase_id !== faseId) poner('phase_id', 'fase');
    if (existente.group_id !== grupoId) poner('group_id', 'grupo');
    if (deseado.round_uuid && existente.round_uuid !== deseado.round_uuid) poner('round_uuid', 'ronda');
    if (deseado.round_label && existente.round_label !== deseado.round_label) poner('round_label', `jornada → ${deseado.round_label}`);
    if (deseado.venue && existente.venue !== deseado.venue) poner('venue', 'cancha');
    if (deseado.stream_url && existente.stream_url !== deseado.stream_url) poner('stream_url', 'streaming');
    // La nota se toca solo si es la nuestra: una nota escrita por una persona no se pisa.
    const notaNuestra = existente.notes === null || existente.notes === NOTA_SIN_HORARIO;
    if (notaNuestra && existente.notes !== deseado.notes) poner('notes', deseado.notes ? 'horario a confirmar' : 'horario confirmado');

    if (cambios.length === 0) plan.sinCambios++;
    else plan.actualizar.push({ id: existente.id, patch, cambios });
  }

  return plan;
}
