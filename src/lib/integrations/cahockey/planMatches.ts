/**
 * Qué escribir en `matches` a partir de lo que SICAH publica de un torneo.
 *
 * Es puro a propósito —recibe la página parseada y las filas que ya hay, y
 * devuelve altas, patches y omitidos— para que el cron pueda mostrar el plan
 * en seco y para que se pruebe sin red ni base.
 *
 * Tres cosas que decide, y por qué:
 *
 *  - **La identidad es el número de partido.** El Argentino de Selecciones
 *    publica la llave entera antes de jugarse con los cruces escritos como
 *    "1° Zona A" o "Ganador N°13". El importador los omitió (no son clubes) y
 *    este planificador los da de alta recién cuando SICAH los reemplaza por un
 *    equipo real, con el mismo `cahockey:<torneo>:<nro>` que tendrían desde el
 *    principio. Un partido de zona que cambia de local (pasa) conserva su fila.
 *
 *  - **La etapa decide la fase.** "Zona A" es fase de grupos; "Cuadrangular",
 *    "Semifinales" y "Finales" son llave. Si van todos a la misma fase de liga,
 *    la tabla de la zona suma los cruces y un equipo termina con 5 jugados
 *    donde jugó 3 — que es exactamente lo que le pasa hoy al Sub 14 A Damas.
 *    El que llama resuelve el `phase_id` de cada tipo; acá sólo se clasifica.
 *
 *  - **Un resultado es final cuando el partido ya terminó.** SICAH no dice si el
 *    marcador es parcial. Un partido de hockey dura ~70 minutos con los cuartos
 *    y los descansos: con goles cargados antes de eso se marca `live`; después,
 *    `final`. Un partido sin goles nunca se toca por tiempo — ni se inventa un
 *    0-0 ni se lo da por suspendido.
 */

import { AMBITO_CAH, buildMatchExternalId, esClubReal, idDeClub, nombreLimpio } from './nombres.ts';
import { esEtapaDeZona, fechaDelDia, type PartidoSicah, type TorneoSicah } from './sicah.ts';

/** Todo el país sin horario de verano: -03:00 fijo. */
const OFFSET_AR = '-03:00';
/** Los resultados de SICAH traen hora; si un partido no la trae, esta. */
const HORA_POR_DEFECTO = '15:00';
/** Hockey: 3/1/0 sin bonus, como el ruleset con el que nacieron los torneos. */
const PUNTOS = { win: 3, draw: 1, loss: 0 };
/** Cuatro cuartos de 15 minutos más descansos: pasado esto, un marcador cargado es final. */
const DURACION_PARTIDO_MS = 70 * 60_000;

export type ScoreHockey = {
  home: number;
  away: number;
  penalties?: { home: number; away: number };
};

export type ExistenteCah = {
  id: string;
  external_id: string | null;
  home_club_id: string;
  away_club_id: string;
  date_time: string;
  status: string | null;
  score: ScoreHockey | null;
  phase_id: string | null;
  round_label: string | null;
  venue: string | null;
};

export type AltaCah = {
  external_id: string;
  home_club_id: string;
  away_club_id: string;
  date_time: string;
  status: 'scheduled' | 'live' | 'final';
  score: ScoreHockey | null;
  round_label: string | null;
  venue: string | null;
  points_autocalculated: false;
  home_base_points: number;
  away_base_points: number;
  home_bonus_points: 0;
  away_bonus_points: 0;
  /** de qué fase es: el que escribe lo traduce a `phase_id` */
  fase: 'zona' | 'llave';
};

export type CambioCah = {
  id: string;
  external_id: string;
  phase_id: string | null;
  fase: 'zona' | 'llave';
  patch: Partial<Omit<AltaCah, 'fase' | 'external_id'>>;
  cambios: string[];
};

export type PlanCah = {
  crear: AltaCah[];
  actualizar: CambioCah[];
  sinCambios: number;
  omitidos: { motivo: string; detalle: string }[];
  /** clubes que aparecen en el fixture y la base no tiene: no se inventan */
  clubesDesconocidos: string[];
};

type Args = {
  torneoExternalId: string;
  sicah: TorneoSicah;
  existentes: ExistenteCah[];
  /** id de club por nombre de la fuente: primero el alias, después el id derivado */
  resolverClub: (nombre: string) => string | null;
  /** clubes que existen en `clubs`: un partido con un club desconocido se omite */
  clubConocido: (clubId: string) => boolean;
  /** instante de la corrida, ISO — decide `live` contra `final` */
  ahora: string;
};

function puntosDe(propios: number, ajenos: number): number {
  return propios > ajenos ? PUNTOS.win : propios < ajenos ? PUNTOS.loss : PUNTOS.draw;
}

function scoreDe(p: PartidoSicah): ScoreHockey | null {
  const gl = p.local?.goles;
  const gv = p.visitante?.goles;
  if (gl === null || gl === undefined || gv === null || gv === undefined) return null;
  const score: ScoreHockey = { home: gl, away: gv };
  const pl = p.local?.penales;
  const pv = p.visitante?.penales;
  if (pl !== null && pl !== undefined && pv !== null && pv !== undefined) {
    score.penalties = { home: pl, away: pv };
  }
  return score;
}

function mismoScore(a: ScoreHockey | null, b: ScoreHockey | null): boolean {
  if (!a || !b) return a === b;
  return a.home === b.home && a.away === b.away
    && (a.penalties?.home ?? null) === (b.penalties?.home ?? null)
    && (a.penalties?.away ?? null) === (b.penalties?.away ?? null);
}

function mismoInstante(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
}

export function planTournamentMatches(args: Args): PlanCah {
  const { torneoExternalId, sicah, existentes, resolverClub, clubConocido, ahora } = args;
  const plan: PlanCah = { crear: [], actualizar: [], sinCambios: 0, omitidos: [], clubesDesconocidos: [] };
  const porExternalId = new Map(existentes.filter((e) => e.external_id).map((e) => [e.external_id as string, e]));
  const ahoraMs = Date.parse(ahora);
  const desconocidos = new Set<string>();

  for (const p of sicah.partidos) {
    const local = nombreLimpio(p.local?.equipo ?? '');
    const visitante = nombreLimpio(p.visitante?.equipo ?? '');
    if (!esClubReal(local) || !esClubReal(visitante)) {
      plan.omitidos.push({ motivo: 'cruce por definir', detalle: `${p.nro}: ${local || '?'} vs ${visitante || '?'}` });
      continue;
    }
    const localId = resolverClub(local) ?? idDeClub(local, AMBITO_CAH);
    const visitanteId = resolverClub(visitante) ?? idDeClub(visitante, AMBITO_CAH);
    const faltan = [localId, visitanteId].filter((id) => !clubConocido(id));
    if (faltan.length) {
      for (const id of faltan) desconocidos.add(id);
      plan.omitidos.push({ motivo: 'club desconocido', detalle: `${p.nro}: ${local} vs ${visitante}` });
      continue;
    }

    const fecha = fechaDelDia(p.dia, sicah.desde, sicah.hasta);
    if (!fecha) {
      plan.omitidos.push({ motivo: 'día fuera del rango del torneo', detalle: `${p.nro}: ${p.dia ?? '?'} · ${local} vs ${visitante}` });
      continue;
    }
    const dateTime = `${fecha}T${p.hora ?? HORA_POR_DEFECTO}:00${OFFSET_AR}`;
    const score = scoreDe(p);
    const kickoffMs = Date.parse(dateTime);
    const status: AltaCah['status'] = !score
      ? 'scheduled'
      : Number.isFinite(kickoffMs) && Number.isFinite(ahoraMs) && ahoraMs < kickoffMs + DURACION_PARTIDO_MS
        ? 'live'
        : 'final';
    const [ptsLocal, ptsVisitante] = score && status === 'final'
      ? [puntosDe(score.home, score.away), puntosDe(score.away, score.home)]
      : [0, 0];
    const fase: AltaCah['fase'] = esEtapaDeZona(p.etapa) ? 'zona' : 'llave';
    const externalId = buildMatchExternalId(torneoExternalId, p.nro);

    const existente = porExternalId.get(externalId);
    if (!existente) {
      plan.crear.push({
        external_id: externalId,
        home_club_id: localId,
        away_club_id: visitanteId,
        date_time: dateTime,
        status,
        score,
        round_label: p.etapa,
        venue: p.cancha,
        points_autocalculated: false,
        home_base_points: ptsLocal,
        away_base_points: ptsVisitante,
        home_bonus_points: 0,
        away_bonus_points: 0,
        fase,
      });
      continue;
    }

    const cambio: CambioCah = { id: existente.id, external_id: externalId, phase_id: existente.phase_id, fase, patch: {}, cambios: [] };
    if (existente.home_club_id !== localId || existente.away_club_id !== visitanteId) {
      cambio.patch.home_club_id = localId;
      cambio.patch.away_club_id = visitanteId;
      cambio.cambios.push(`equipos ${existente.home_club_id} vs ${existente.away_club_id} → ${localId} vs ${visitanteId}`);
    }
    if (!mismoInstante(existente.date_time, dateTime)) {
      cambio.patch.date_time = dateTime;
      cambio.cambios.push(`horario ${existente.date_time} → ${dateTime}`);
    }
    if ((existente.round_label ?? null) !== (p.etapa ?? null)) {
      cambio.patch.round_label = p.etapa;
      cambio.cambios.push(`etapa ${existente.round_label ?? '—'} → ${p.etapa ?? '—'}`);
    }
    if (p.cancha && (existente.venue ?? null) !== p.cancha) {
      cambio.patch.venue = p.cancha;
      cambio.cambios.push(`cancha ${existente.venue ?? '—'} → ${p.cancha}`);
    }
    // Un resultado que la base tiene y SICAH ya no muestra NO se borra: la
    // fuente a veces vacía un partido mientras lo corrige, y un final que
    // vuelve a "programado" apaga el partido en la portada.
    if (score && (!mismoScore(existente.score, score) || String(existente.status ?? '').toLowerCase() !== status)) {
      cambio.patch.score = score;
      cambio.patch.status = status;
      cambio.patch.points_autocalculated = false;
      cambio.patch.home_base_points = ptsLocal;
      cambio.patch.away_base_points = ptsVisitante;
      cambio.patch.home_bonus_points = 0;
      cambio.patch.away_bonus_points = 0;
      const pen = score.penalties ? ` (${score.penalties.home}-${score.penalties.away} pen.)` : '';
      cambio.cambios.push(`resultado ${score.home}-${score.away}${pen} · ${status}`);
    }

    if (cambio.cambios.length) plan.actualizar.push(cambio);
    else plan.sinCambios++;
  }

  plan.clubesDesconocidos = [...desconocidos].sort();
  return plan;
}
