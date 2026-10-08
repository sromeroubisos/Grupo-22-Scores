/**
 * El plan de escritura de la CRAA: de las filas de las diez pestañas (cinco
 * divisiones × dos semestres) a qué partidos se crean y cuáles se actualizan.
 *
 * Puro salvo por el reloj, que entra por parámetro.
 *
 * ## Un partido, una fila
 *
 * Un cruce entre divisiones figura en las planillas de LAS DOS divisiones. Se
 * junta por (local, visitante, fecha) y queda en UN torneo: el de la división
 * a la que pertenece el local; si el local no es de ninguna de las dos, el del
 * visitante; si tampoco, el de la primera planilla en `DIVISIONES`. Si las dos
 * planillas dan distinto resultado manda la del dueño, y sale en
 * `discrepancias`.
 *
 * ## La identidad
 *
 * `craa:{temporada}:{local}~{visitante}:{n}` con los club_id: n es la vez que
 * ese local recibe a ese visitante en la temporada, por orden de fecha. Así una
 * reprogramación mueve el partido en vez de duplicarlo, y un nombre que la
 * planilla escribe de dos maneras ("Cal" y "California") es el mismo partido
 * porque los dos alias dan el mismo club.
 *
 * ## Estado
 *
 * La planilla no tiene estado: con los dos tanteos el partido está jugado, sin
 * ellos pendiente. Uno que pasó hace más de `DIAS_SIN_RESULTADO` días sin
 * tanteo sigue `scheduled` y lo dice la nota: NO pasa a `postponed`. Medido el
 * 2026-10-08: la D1AA tenía 13 partidos pasados sin resultado que se jugaron
 * (la CRAA carga a mano y a la D1AA casi no le carga nada); "Postergado"
 * habría sido informar algo falso. Tres días le dan el fin de semana a la CRAA
 * para cargarlo antes de que aparezca la nota.
 */
import type { FilaCraa } from './parse.ts';
import {
  buildMatchExternalId, horaLocalAIso, nombreDeCompetencia, noEsEquipo, type RamaCraa,
} from './fuentes.ts';

export const PUNTOS_CRAA = { win: 2, draw: 1, loss: 0 } as const;
export const DIAS_SIN_RESULTADO = 3;
/** Sin horario, el partido se ubica a la 1 de la tarde del lugar. */
export const HORA_POR_DEFECTO = '13:00';
/** Si no se conoce el huso del local, el del Este (donde juega la mayoría de la D1A). */
export const ZONA_POR_DEFECTO = 'America/New_York';
/** Las notas que escribe el conector empiezan así: una nota escrita por una persona no se pisa. */
export const PREFIJO_NOTA = 'CRAA · ';
export const NOTA_SIN_HORARIO = 'Horario a confirmar';
export const NOTA_SIN_RESULTADO = 'Resultado no publicado por la CRAA';

export type EstadoG22 = 'scheduled' | 'final';

export interface MarcadorCraa {
  home: number;
  away: number;
}

export interface PestanaCraa {
  division: string;
  rama: RamaCraa;
  filas: FilaCraa[];
}

/** A dónde va un partido de una división: su torneo, su fase y su temporada. */
export interface DestinoCraa {
  tournamentId: string;
  phaseId: string;
  seasonId: string | null;
}

export interface Ronda {
  id: string | null;
  nombre: string;
}

export interface ExistenteCraa {
  id: string;
  external_id: string | null;
  tournament_id: string | null;
  season_id: string | null;
  phase_id: string | null;
  home_club_id: string | null;
  away_club_id: string | null;
  date_time: string | null;
  status: string | null;
  score: MarcadorCraa | null;
  round_uuid: string | null;
  round_label: string | null;
  notes: string | null;
  home_base_points: number | null;
  away_base_points: number | null;
  home_bonus_points: number | null;
  away_bonus_points: number | null;
}

export interface FilaPartido {
  external_id: string;
  tournament_id: string;
  season_id: string | null;
  phase_id: string;
  home_club_id: string;
  away_club_id: string;
  date_time: string;
  status: EstadoG22;
  score: MarcadorCraa | null;
  round_uuid: string | null;
  round_label: string | null;
  notes: string;
  points_autocalculated: false;
  home_base_points: number;
  away_base_points: number;
  home_bonus_points: 0;
  away_bonus_points: 0;
}

export type MotivoOmision = 'equipo_no_resuelto' | 'mismo_equipo_en_ambos_lados' | 'fecha_ilegible' | 'division_sin_torneo';

export interface PlanCraa {
  crear: FilaPartido[];
  actualizar: { id: string; tournamentId: string; patch: Partial<FilaPartido>; cambios: string[] }[];
  omitidos: { motivo: MotivoOmision; detalle: string }[];
  /** nombres de la planilla sin alias, agrupados: son los que hay que sumar a `datos.mjs` */
  equiposSinAlias: string[];
  /** filas con algo en el tanteo que no es un número: se cargan sin resultado */
  marcadoresRaros: string[];
  /** el mismo partido con distinto resultado en dos planillas */
  discrepancias: string[];
  /** finales que estaban con otro marcador; manda la CRAA */
  correcciones: string[];
  /** cuántas filas eran el mismo partido en otra planilla */
  repetidosEntreDivisiones: number;
  /** partidos guardados que ya no están en ninguna planilla (no se borran) */
  huerfanos: string[];
  sinCambios: number;
}

export function puntosDeBase(propios: number, rival: number): number {
  if (propios > rival) return PUNTOS_CRAA.win;
  if (propios < rival) return PUNTOS_CRAA.loss;
  return PUNTOS_CRAA.draw;
}

const mismoInstante = (a: string | null, b: string | null): boolean => {
  if (!a || !b) return a === b;
  const ta = Date.parse(a), tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return Math.abs(ta - tb) < 60_000;
};

const mismoMarcador = (a: MarcadorCraa | null, b: MarcadorCraa | null) =>
  a === null || b === null ? a === b : a.home === b.home && a.away === b.away;

const textoMarcador = (s: MarcadorCraa | null) => (s ? `${s.home}-${s.away}` : 'sin marcador');

interface Candidato {
  division: string;
  orden: number;
  home: string;
  away: string;
  fila: FilaCraa;
  fecha: string;
}

export function planCraa(input: {
  pestanas: PestanaCraa[];
  temporada: string;
  /** nombre de la planilla → club_id; `null` si no lo conoce */
  resolverEquipo: (nombre: string, rama: RamaCraa) => string | null;
  /** huso del campus del club (el partido se juega en la cancha del local) */
  zonaDe: (clubId: string) => string | null;
  /** clubes de cada división (los participantes de su torneo) */
  integrantes: Map<string, Set<string>>;
  destinoDe: (division: string) => DestinoCraa | null;
  /** la semana del partido, por la fecha de pared del lugar */
  rondaDe: (division: string, fecha: string) => Ronda | null;
  existentes: ExistenteCraa[];
  ahora: Date;
}): PlanCraa {
  const { pestanas, temporada, resolverEquipo, zonaDe, integrantes, destinoDe, rondaDe, existentes, ahora } = input;
  const plan: PlanCraa = {
    crear: [], actualizar: [], omitidos: [], equiposSinAlias: [], marcadoresRaros: [], discrepancias: [],
    correcciones: [], repetidosEntreDivisiones: 0, huerfanos: [], sinCambios: 0,
  };
  const sinAlias = new Map<string, number>();
  const ordenDe = new Map<string, number>();
  pestanas.forEach((p) => { if (!ordenDe.has(p.division)) ordenDe.set(p.division, ordenDe.size); });

  // 1. Filas → candidatos con los clubes resueltos.
  const candidatos: Candidato[] = [];
  for (const p of pestanas) {
    for (const fila of p.filas) {
      if (!fila.local || !fila.visitante || noEsEquipo(fila.local) || noEsEquipo(fila.visitante)) continue;
      const home = resolverEquipo(fila.local, p.rama);
      const away = resolverEquipo(fila.visitante, p.rama);
      if (!home || !away) {
        for (const [nombre, club] of [[fila.local, home], [fila.visitante, away]] as const) {
          const k = `${p.rama}: ${nombre}`;
          if (!club) sinAlias.set(k, (sinAlias.get(k) ?? 0) + 1);
        }
        plan.omitidos.push({ motivo: 'equipo_no_resuelto', detalle: `${p.division}: ${fila.texto}` });
        continue;
      }
      if (home === away) {
        plan.omitidos.push({ motivo: 'mismo_equipo_en_ambos_lados', detalle: `${p.division}: ${fila.texto}` });
        continue;
      }
      if (!fila.fecha) {
        plan.omitidos.push({ motivo: 'fecha_ilegible', detalle: `${p.division}: ${fila.texto}` });
        continue;
      }
      if (fila.marcadorRaro) plan.marcadoresRaros.push(`${p.division}: ${fila.texto}`);
      candidatos.push({ division: p.division, orden: ordenDe.get(p.division) ?? 0, home, away, fila, fecha: fila.fecha });
    }
  }
  plan.equiposSinAlias = [...sinAlias.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([nombre, veces]) => `${nombre} (${veces})`);

  // 2. El mismo partido en dos planillas → uno, en el torneo del dueño.
  const grupos = new Map<string, Candidato[]>();
  for (const c of candidatos) {
    const k = `${c.home}|${c.away}|${c.fecha}`;
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  const partidos: Candidato[] = [];
  for (const grupo of grupos.values()) {
    grupo.sort((a, b) => a.orden - b.orden);
    plan.repetidosEntreDivisiones += grupo.length - 1;
    const esDe = (c: Candidato, club: string) => integrantes.get(c.division)?.has(club) ?? false;
    const dueno = grupo.find((c) => esDe(c, c.home)) ?? grupo.find((c) => esDe(c, c.away)) ?? grupo[0];
    const conTanteo = grupo.filter((c) => c.fila.puntosLocal !== null && c.fila.puntosVisitante !== null);
    if (new Set(conTanteo.map((c) => `${c.fila.puntosLocal}-${c.fila.puntosVisitante}`)).size > 1) {
      plan.discrepancias.push(`${dueno.fila.local} vs ${dueno.fila.visitante} (${dueno.fecha}): ${conTanteo.map((c) => `${c.division} ${c.fila.puntosLocal}-${c.fila.puntosVisitante}`).join(' / ')}`);
    }
    // Manda el dueño; lo que su planilla no trae (el resultado, la hora) se toma de la otra.
    const otro = conTanteo[0];
    const conHora = grupo.find((c) => c.fila.hora);
    const fila = {
      ...dueno.fila,
      ...(dueno.fila.puntosLocal === null && otro && { puntosLocal: otro.fila.puntosLocal, puntosVisitante: otro.fila.puntosVisitante }),
      ...(!dueno.fila.hora && conHora && { hora: conHora.fila.hora }),
    };
    partidos.push({ ...dueno, fila });
  }

  // 3. La identidad: la n-ésima vez que este local recibe a este visitante.
  partidos.sort((a, b) => a.fecha.localeCompare(b.fecha)
    || (a.fila.hora ?? '').localeCompare(b.fila.hora ?? '')
    || a.home.localeCompare(b.home) || a.away.localeCompare(b.away));
  const vecesDelCruce = new Map<string, number>();
  const porExternal = new Map(existentes.filter((e) => e.external_id).map((e) => [e.external_id as string, e]));
  const vistos = new Set<string>();
  const limiteSinResultado = ahora.getTime() - DIAS_SIN_RESULTADO * 24 * 60 * 60 * 1000;

  for (const c of partidos) {
    const destino = destinoDe(c.division);
    if (!destino) {
      plan.omitidos.push({ motivo: 'division_sin_torneo', detalle: `${c.division}: ${c.fila.texto}` });
      continue;
    }
    const cruce = `${c.home}~${c.away}`;
    const n = (vecesDelCruce.get(cruce) ?? 0) + 1;
    vecesDelCruce.set(cruce, n);
    const externalId = buildMatchExternalId(temporada, c.home, c.away, n);
    vistos.add(externalId);

    const hora = c.fila.hora ?? HORA_POR_DEFECTO;
    const dateTime = horaLocalAIso(c.fecha, hora, zonaDe(c.home) ?? ZONA_POR_DEFECTO)
      ?? (horaLocalAIso(c.fecha, hora, ZONA_POR_DEFECTO) as string);
    const jugado = c.fila.puntosLocal !== null && c.fila.puntosVisitante !== null;
    const score = jugado ? { home: c.fila.puntosLocal as number, away: c.fila.puntosVisitante as number } : null;
    const status: EstadoG22 = jugado ? 'final' : 'scheduled';
    const sinResultado = !jugado && Date.parse(dateTime) < limiteSinResultado;
    const notes = PREFIJO_NOTA + [
      nombreDeCompetencia(c.fila.competencia) ?? 'CRAA',
      sinResultado ? NOTA_SIN_RESULTADO : c.fila.hora ? null : NOTA_SIN_HORARIO,
    ].filter(Boolean).join(' · ');
    const ronda = rondaDe(c.division, c.fecha);

    const deseado: FilaPartido = {
      external_id: externalId,
      tournament_id: destino.tournamentId,
      season_id: destino.seasonId,
      phase_id: destino.phaseId,
      home_club_id: c.home,
      away_club_id: c.away,
      date_time: dateTime,
      status,
      score,
      round_uuid: ronda?.id ?? null,
      round_label: ronda?.nombre ?? null,
      notes,
      points_autocalculated: false,
      home_base_points: score ? puntosDeBase(score.home, score.away) : 0,
      away_base_points: score ? puntosDeBase(score.away, score.home) : 0,
      home_bonus_points: 0,
      away_bonus_points: 0,
    };

    const existente = porExternal.get(externalId);
    if (!existente) {
      plan.crear.push(deseado);
      continue;
    }

    const patch: Partial<FilaPartido> = {};
    const cambios: string[] = [];
    const poner = <K extends keyof FilaPartido>(k: K, etiqueta: string) => {
      (patch as Record<string, unknown>)[k] = deseado[k];
      cambios.push(etiqueta);
    };

    if (existente.tournament_id !== deseado.tournament_id) poner('tournament_id', 'torneo');
    if (existente.phase_id !== deseado.phase_id) poner('phase_id', 'fase');
    if ((existente.season_id ?? null) !== deseado.season_id) poner('season_id', 'temporada');
    if (existente.status !== status) poner('status', `estado ${existente.status} → ${status}`);
    if (!mismoMarcador(existente.score, score)) {
      if (existente.status === 'final' && existente.score && score) {
        plan.correcciones.push(`${c.fila.local} vs ${c.fila.visitante} (${c.fecha}): estaba ${textoMarcador(existente.score)}, la CRAA publica ${textoMarcador(score)}`);
      }
      poner('score', `marcador ${textoMarcador(existente.score)} → ${textoMarcador(score)}`);
    }
    if (Number(existente.home_base_points ?? 0) !== deseado.home_base_points
      || Number(existente.away_base_points ?? 0) !== deseado.away_base_points
      || Number(existente.home_bonus_points ?? 0) !== 0
      || Number(existente.away_bonus_points ?? 0) !== 0) {
      patch.home_base_points = deseado.home_base_points;
      patch.away_base_points = deseado.away_base_points;
      patch.home_bonus_points = 0;
      patch.away_bonus_points = 0;
      patch.points_autocalculated = false;
      cambios.push(`puntos ${deseado.home_base_points} / ${deseado.away_base_points}`);
    }
    if (!mismoInstante(existente.date_time, dateTime)) poner('date_time', `fecha ${existente.date_time ?? 'sin fecha'} → ${dateTime}`);
    if (deseado.round_uuid && existente.round_uuid !== deseado.round_uuid) poner('round_uuid', 'ronda');
    if (deseado.round_label && existente.round_label !== deseado.round_label) poner('round_label', `ronda → ${deseado.round_label}`);
    const notaNuestra = existente.notes === null || existente.notes.startsWith(PREFIJO_NOTA);
    if (notaNuestra && existente.notes !== notes) poner('notes', `nota → ${notes}`);

    if (cambios.length === 0) plan.sinCambios++;
    else plan.actualizar.push({ id: existente.id, tournamentId: deseado.tournament_id, patch, cambios });
  }

  for (const e of existentes) {
    if (e.external_id && !vistos.has(e.external_id)) plan.huerfanos.push(`${e.external_id} (${e.status ?? '?'}, ${e.date_time ?? 'sin fecha'})`);
  }
  return plan;
}

/** Lunes y domingo de la semana de una fecha `yyyy-mm-dd`: una fecha es un fin de semana. */
export function semanaDe(iso: string): { desde: string; hasta: string } {
  const d = new Date(`${iso}T12:00:00Z`);
  const lunes = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  const domingo = new Date(lunes.getTime() + 6 * 86_400_000);
  return { desde: lunes.toISOString().slice(0, 10), hasta: domingo.toISOString().slice(0, 10) };
}
