/**
 * El plan de escritura de UNA fase de SporTI: qué partidos se crean y cuáles
 * se actualizan, a partir de las tarjetas de la vista `-1` y de las súmulas.
 *
 * Puro salvo por el reloj, que entra por parámetro (la regla de los tres días).
 *
 * ## La identidad
 *
 * El id de la súmula existe desde que el partido está en el fixture —las
 * rodadas que faltan ya tienen su link— y no cambia cuando se reprograma, así
 * que `sporti:s106461` es la identidad. No hay adopción por par: estos torneos
 * nacen del conector.
 *
 * ## El bonus, medido
 *
 * Reglamento de la CBRu, contrastado el 2026-10-02 contra las tablas oficiales
 * de los grupos del Super 12 2026 (Primeira, Segunda y Repescagem):
 *
 * - 4 / 2 / 0 más el ofensivo por marcar 4 tries o más (NO por diferencia, como
 *   en la FER) y el defensivo por perder por 7 o menos.
 * - El W.O. vale 24-0 y el ganador suma 5: la victoria y el ofensivo.
 * - Con eso cierran todos los clubes salvo tres con un punto de más en la
 *   tabla (POLI, São José, Tornados) que ningún resultado explica: son
 *   decisiones de la CBRu. Por eso las fases que publican tabla muestran la
 *   OFICIAL (`fully_manual`) y esta cuenta solo se contrasta; la que se dibuja
 *   con estos puntos es la de las fases sin tabla (el hexagonal).
 *
 * Los tries salen de la súmula, y solo si sus eventos suman el marcador. Si no
 * está o no suma, el partido se escribe igual —final, con el defensivo que no
 * necesita tries— y sale en `sinTries`; la corrida siguiente vuelve a pedirla,
 * porque un marcador sin `homeTries` ni `walkover` es la marca de "falta la
 * súmula".
 *
 * ## El partido que nadie cargó
 *
 * SporTI no publica un estado: un partido con marcador está jugado y uno sin
 * marcador, pendiente. Igual que en la AAHBA, uno que pasó hace más de
 * `DIAS_PARA_POSTERGAR` días sin marcador pasa a `postponed`, y vuelve a
 * `scheduled` si la CBRu le pone fecha nueva.
 */
import type { PartidoSporti, ResumenSumula } from './parse.ts';
import { sumulaCierra } from './parse.ts';
import { brasiliaAIso, buildMatchExternalId } from './nombres.ts';

export const PUNTOS_CBRU = { win: 4, draw: 2, loss: 0 } as const;
/** Tries para el bonus ofensivo. */
export const BONUS_OFENSIVO_TRIES = 4;
/** Margen de la derrota para el bonus defensivo. */
export const BONUS_DEFENSIVO_MARGEN = 7;
export const DIAS_PARA_POSTERGAR = 3;
/** Sin horario en la tarjeta, el partido se ubica a las 15 de Brasilia. */
const HORA_POR_DEFECTO = '15:00';
export const NOTA_SIN_HORARIO = 'Horario a confirmar';
export const NOTA_WO = 'Ganado por W.O.';

export type EstadoG22 = 'scheduled' | 'final' | 'postponed';

export interface MarcadorSporti {
  home: number;
  away: number;
  homeTries?: number;
  awayTries?: number;
  /** W.O.: no hay tries que pedir, y la súmula no se vuelve a bajar. */
  walkover?: boolean;
}

export interface ExistenteSporti {
  id: string;
  external_id: string | null;
  home_club_id: string | null;
  away_club_id: string | null;
  date_time: string | null;
  status: string | null;
  score: MarcadorSporti | null;
  phase_id: string | null;
  group_id: string | null;
  round_uuid: string | null;
  round_label: string | null;
  venue: string | null;
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
  score: MarcadorSporti | null;
  phase_id: string;
  group_id: string | null;
  round_uuid: string | null;
  round_label: string | null;
  venue: string | null;
  notes: string | null;
  points_autocalculated: false;
  home_base_points: number;
  away_base_points: number;
  home_bonus_points: number;
  away_bonus_points: number;
}

export type MotivoOmision = 'equipo_no_resuelto' | 'mismo_equipo_en_ambos_lados' | 'fecha_ilegible';

export interface Ronda {
  id: string | null;
  nombre: string | null;
}

export interface FinalDeLaFase {
  localSlug: string;
  visitanteSlug: string;
  score: MarcadorSporti;
  puntosLocal: number;
  puntosVisitante: number;
}

export interface PlanSporti {
  crear: FilaPartido[];
  actualizar: { id: string; patch: Partial<FilaPartido>; cambios: string[] }[];
  omitidos: { motivo: MotivoOmision; detalle: string }[];
  /** finales escritos sin tries (sin súmula o súmula que no suma): les falta el ofensivo */
  sinTries: string[];
  /** finales que estaban con otro marcador; manda SporTI */
  correcciones: string[];
  sinCambios: number;
  /** cómo quedan TODOS los finales de la fase, para contrastar con la tabla oficial */
  finales: FinalDeLaFase[];
}

export function puntosDeBase(propios: number, rival: number): number {
  if (propios > rival) return PUNTOS_CBRU.win;
  if (propios < rival) return PUNTOS_CBRU.loss;
  return PUNTOS_CBRU.draw;
}

/**
 * Bonus de un lado. `tries` en `null` = desconocidos: solo puede haber
 * defensivo. Un W.O. le da el ofensivo al ganador y nada al que no se presentó.
 */
export function bonusDe(propios: number, rival: number, tries: number | null, walkover = false): number {
  if (walkover) return propios > rival ? 1 : 0;
  let b = 0;
  if (propios < rival && rival - propios <= BONUS_DEFENSIVO_MARGEN) b += 1;
  if (tries !== null && tries >= BONUS_OFENSIVO_TRIES) b += 1;
  return b;
}

const tieneTries = (s: MarcadorSporti | null | undefined) =>
  s != null && Number.isFinite(s.homeTries) && Number.isFinite(s.awayTries);

/** El marcador ya está resuelto: con tries o como W.O. */
const resuelto = (s: MarcadorSporti | null | undefined) => tieneTries(s) || s?.walkover === true;

/**
 * Qué súmulas hay que pedir: las de los partidos jugados que todavía no tienen
 * tries (ni son W.O.), o cuyo marcador cambió (la súmula vieja ya no vale).
 */
export function sumulasQueFaltan(partidos: PartidoSporti[], existentes: ExistenteSporti[]): string[] {
  const porExternal = new Map(existentes.filter((e) => e.external_id).map((e) => [e.external_id as string, e]));
  return partidos
    .filter((p) => p.puntosLocal !== null && p.puntosVisitante !== null)
    .filter((p) => {
      const e = porExternal.get(buildMatchExternalId(p.sumulaId));
      if (!e || !resuelto(e.score)) return true;
      return e.score?.home !== p.puntosLocal || e.score?.away !== p.puntosVisitante;
    })
    .map((p) => p.sumulaId);
}

const mismoInstante = (a: string | null, b: string | null): boolean => {
  if (!a || !b) return a === b;
  const ta = Date.parse(a), tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return Math.abs(ta - tb) < 60_000;
};

const mismoMarcador = (a: MarcadorSporti | null, b: MarcadorSporti | null) => {
  if (a === null || b === null) return a === b;
  return a.home === b.home && a.away === b.away
    && (a.homeTries ?? null) === (b.homeTries ?? null)
    && (a.awayTries ?? null) === (b.awayTries ?? null)
    && (a.walkover ?? false) === (b.walkover ?? false);
};

const textoMarcador = (s: MarcadorSporti | null) => (s ? `${s.home}-${s.away}${s.walkover ? ' (W.O.)' : ''}` : 'sin marcador');

/** Las notas que escribe el conector: una nota escrita por una persona no se pisa. */
const NOTAS_NUESTRAS = new Set<string | null>([null, NOTA_SIN_HORARIO, NOTA_WO]);

export function planSportiMatches(input: {
  partidos: PartidoSporti[];
  /** slug de SporTI → club_id; `null` si no lo conoce */
  resolverEquipo: (slug: string) => string | null;
  existentes: ExistenteSporti[];
  /** resumen de la súmula por id (solo las que se pidieron) */
  sumulas: Map<string, ResumenSumula>;
  faseId: string;
  /** título de la columna → `tournament_groups.id` (fases de grupos) */
  grupoDe: (columna: string | null) => string | null;
  /** la jornada del partido: por columna ("Rodada 3", "FINAL") o por fin de semana */
  rondaDe: (columna: string | null, dateTime: string) => Ronda | null;
  ahora: Date;
}): PlanSporti {
  const { partidos, resolverEquipo, existentes, sumulas, faseId, grupoDe, rondaDe, ahora } = input;
  const plan: PlanSporti = { crear: [], actualizar: [], omitidos: [], sinTries: [], correcciones: [], sinCambios: 0, finales: [] };
  const porExternal = new Map(existentes.filter((e) => e.external_id).map((e) => [e.external_id as string, e]));
  const limitePostergar = ahora.getTime() - DIAS_PARA_POSTERGAR * 24 * 60 * 60 * 1000;

  for (const p of partidos) {
    const home = resolverEquipo(p.localSlug);
    const away = resolverEquipo(p.visitanteSlug);
    const rotulo = `${p.columna ?? '?'} ${p.localSigla ?? p.localSlug} vs ${p.visitanteSigla ?? p.visitanteSlug} (s${p.sumulaId})`;
    if (!home || !away) {
      plan.omitidos.push({ motivo: 'equipo_no_resuelto', detalle: `${rotulo}: falta ${!home ? p.localSlug : p.visitanteSlug}` });
      continue;
    }
    if (home === away) {
      plan.omitidos.push({ motivo: 'mismo_equipo_en_ambos_lados', detalle: `${rotulo} → ${home}` });
      continue;
    }
    const dateTime = p.fecha ? brasiliaAIso(p.fecha, p.hora ?? HORA_POR_DEFECTO) : null;
    if (!dateTime) {
      plan.omitidos.push({ motivo: 'fecha_ilegible', detalle: `${rotulo}: "${p.fecha ?? ''} ${p.hora ?? ''}"` });
      continue;
    }

    const externalId = buildMatchExternalId(p.sumulaId);
    const existente = porExternal.get(externalId);
    const jugado = p.puntosLocal !== null && p.puntosVisitante !== null;
    const status: EstadoG22 = jugado ? 'final' : Date.parse(dateTime) < limitePostergar ? 'postponed' : 'scheduled';

    let score: MarcadorSporti | null = null;
    let home_bonus_points = 0;
    let away_bonus_points = 0;
    if (jugado) {
      const hs = p.puntosLocal as number, as = p.puntosVisitante as number;
      const sumula = sumulas.get(p.sumulaId);
      const vigente = sumula && sumula.puntosLocal === hs && sumula.puntosVisitante === as ? sumula : null;
      // Lo ya guardado vale mientras el marcador sea el mismo.
      const guardado = existente && resuelto(existente.score) && existente.score?.home === hs && existente.score?.away === as
        ? existente.score : null;
      const walkover = vigente ? vigente.wo : guardado?.walkover === true;
      const tries = walkover ? null
        : vigente && sumulaCierra(vigente) ? { home: vigente.triesLocal, away: vigente.triesVisitante }
          : guardado && tieneTries(guardado) ? { home: guardado.homeTries as number, away: guardado.awayTries as number }
            : null;
      score = walkover ? { home: hs, away: as, walkover: true }
        : tries ? { home: hs, away: as, homeTries: tries.home, awayTries: tries.away }
          : { home: hs, away: as };
      if (!walkover && !tries) plan.sinTries.push(`${rotulo} ${hs}-${as}${vigente ? ' (la súmula no suma el marcador)' : ''}`);
      home_bonus_points = bonusDe(hs, as, tries?.home ?? null, walkover);
      away_bonus_points = bonusDe(as, hs, tries?.away ?? null, walkover);
    }

    const ronda = rondaDe(p.columna, dateTime);
    const deseado: FilaPartido = {
      external_id: externalId,
      home_club_id: home,
      away_club_id: away,
      date_time: dateTime,
      status,
      score,
      phase_id: faseId,
      group_id: grupoDe(p.columna),
      round_uuid: ronda?.id ?? null,
      round_label: ronda?.nombre ?? null,
      venue: p.cancha,
      notes: score?.walkover ? NOTA_WO : p.hora ? null : NOTA_SIN_HORARIO,
      points_autocalculated: false,
      home_base_points: score ? puntosDeBase(score.home, score.away) : 0,
      away_base_points: score ? puntosDeBase(score.away, score.home) : 0,
      home_bonus_points,
      away_bonus_points,
    };

    if (score) {
      plan.finales.push({
        localSlug: p.localSlug,
        visitanteSlug: p.visitanteSlug,
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
        plan.correcciones.push(`${rotulo}: estaba ${textoMarcador(existente.score)}, SporTI publica ${textoMarcador(score)}`);
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
    if (existente.group_id !== deseado.group_id) poner('group_id', 'grupo');
    if (deseado.round_uuid && existente.round_uuid !== deseado.round_uuid) poner('round_uuid', 'ronda');
    if (deseado.round_label && existente.round_label !== deseado.round_label) poner('round_label', `ronda → ${deseado.round_label}`);
    if (deseado.venue && existente.venue !== deseado.venue) poner('venue', 'cancha');
    if (NOTAS_NUESTRAS.has(existente.notes) && existente.notes !== deseado.notes) poner('notes', `nota → ${deseado.notes ?? 'sin nota'}`);

    if (cambios.length === 0) plan.sinCambios++;
    else plan.actualizar.push({ id: existente.id, patch, cambios });
  }

  return plan;
}

export interface DiferenciaConLaTabla {
  slug: string;
  campo: 'pts' | 'pj' | 'pf' | 'pc';
  nuestro: number;
  oficial: number;
}

/**
 * Nuestra cuenta contra la tabla oficial, club por club. No decide nada —en
 * las fases con tabla se publica la oficial—: sirve para ver un partido que
 * falta en el fixture o una decisión de la CBRu que cambió puntos.
 */
export function contrastarConTabla(
  finales: FinalDeLaFase[],
  tabla: { slug: string; pts: number; pj: number; pf: number; pc: number }[],
): DiferenciaConLaTabla[] {
  const cuenta = new Map<string, { pts: number; pj: number; pf: number; pc: number }>();
  const sumar = (slug: string, pts: number, pf: number, pc: number) => {
    const c = cuenta.get(slug) ?? { pts: 0, pj: 0, pf: 0, pc: 0 };
    c.pts += pts; c.pj += 1; c.pf += pf; c.pc += pc;
    cuenta.set(slug, c);
  };
  for (const f of finales) {
    sumar(f.localSlug, f.puntosLocal, f.score.home, f.score.away);
    sumar(f.visitanteSlug, f.puntosVisitante, f.score.away, f.score.home);
  }
  const out: DiferenciaConLaTabla[] = [];
  for (const fila of tabla) {
    const c = cuenta.get(fila.slug) ?? { pts: 0, pj: 0, pf: 0, pc: 0 };
    for (const campo of ['pts', 'pj', 'pf', 'pc'] as const) {
      if (c[campo] !== fila[campo]) out.push({ slug: fila.slug, campo, nuestro: c[campo], oficial: fila[campo] });
    }
  }
  return out;
}
