/**
 * El plan de escritura de UN torneo de la AAHBA: qué partidos se crean, cuáles
 * se adoptan y cuáles se actualizan, a partir del fixture que publica el
 * tracker.
 *
 * Es puro salvo por una cosa: necesita saber qué día es, porque una de las
 * reglas mira el reloj (ver "El partido que nadie cargó"). El `ahora` entra
 * por parámetro, así que el plan se sigue pudiendo testear sin red ni fecha
 * del sistema.
 *
 * ## La identidad
 *
 * El tracker numera cada partido y ese número es único en todo el sistema, así
 * que `aahba:m{id}` es la identidad y una reprogramación es un UPDATE de
 * `date_time`, nunca un duplicado.
 *
 * Pero los 364 partidos de los dos Metropolitanos ya estaban cargados a mano,
 * con `external_id` en NULL. Esas filas se ADOPTAN antes de crear nada, y la
 * llave de adopción es el PAR ORDENADO (local, visitante): en un todos contra
 * todos ida y vuelta cada par ordenado aparece exactamente una vez, y está
 * verificado contra la fuente —182 partidos, 182 pares distintos en los dos
 * torneos—. La adopción corre una sola vez: después todas las filas tienen su
 * `external_id` y el par deja de importar.
 *
 * Si el par no aparece, el partido se CREA. Si aparece más de una vez, no se
 * adivina: sale en `omitidos` con el motivo `par_ambiguo` para que lo mire
 * alguien. Un par duplicado en la base significa que el fixture se cargó mal
 * —nos pasó con la fecha 1 de Caballeros, que entró con local y visitante
 * invertidos— y elegir uno al azar sería pisar el partido equivocado.
 *
 * ## El partido que nadie cargó
 *
 * Una fecha que ya pasó y sigue sin resultado no es un partido que viene. A
 * los `DIAS_PARA_POSTERGAR` días el plan lo pasa a `postponed`, que es el
 * estado que el resto del proyecto ya entiende: la tabla de posiciones lo
 * ignora (`FINAL_STANDINGS_STATUSES` no lo incluye) y la pantalla del torneo
 * no lo elige como "próximo partido" (`getFeaturedMatch` saltea los
 * suspendidos). Tres días y no uno: la AAHBA carga las planillas con atraso y
 * un lunes a la mañana todavía no es una postergación.
 *
 * El camino de vuelta también existe, que es lo que se olvidó ARUSA: si la
 * asociación reprograma y el partido vuelve a tener fecha futura, el plan lo
 * devuelve a `scheduled`. Un estado al que solo se entra es una ficha que
 * queda mintiendo para siempre.
 *
 * ## Lo que este plan NO hace
 *
 * No pone `live`. El tracker trae un flag `playing`, pero un flag que se
 * prende en la fuente y no se apaga deja el partido en vivo para siempre, y
 * el proyecto ya tiene `live-sync` para eso. Acá un partido está programado
 * hasta que la AAHBA dice que se jugó.
 *
 * No copia la tabla de posiciones. El tracker la publica, pero las posiciones
 * son locales: las recalcula el proyecto con el sistema de puntos del torneo.
 *
 * ## Un final que la fuente contradice SÍ se pisa
 *
 * Esto es al revés que en los otros conectores de la casa, y es una decisión
 * tomada con el dato a la vista: había diez partidos cerrados con un marcador
 * distinto al de la asociación (la fecha 5 tenía Quilmes 1-2 San Fernando
 * cuando la planilla dice 1-3). El tracker es la planilla oficial y publica el
 * PDF de cada partido, así que gana. Lo que no se negocia es el silencio:
 * cada corrección sale en `correcciones` con el antes y el después.
 */
import { buildMatchExternalId, claveDeNombre } from './nombres.ts';
import { PUNTOS_HOCKEY, type AltaDePartido, type ExistenteHockey } from '../fedhockeycba/planMatches.ts';
import type { PartidoCrudo } from './client.ts';

export { PUNTOS_HOCKEY };

/** Días sin resultado después de la fecha para dar un partido por postergado. */
export const DIAS_PARA_POSTERGAR = 3;
/** Buenos Aires no tiene horario de verano: el offset es fijo. */
const OFFSET = '-03:00';

export interface ExistenteAahba extends ExistenteHockey {
  round_label: string | null;
  venue: string | null;
  referee: string | null;
}

export type MotivoOmision =
  | 'equipo_no_resuelto'
  | 'mismo_equipo_en_ambos_lados'
  | 'horario_ilegible'
  /** el par (local, visitante) aparece más de una vez en la base */
  | 'par_ambiguo';

export interface PlanAahba {
  crear: AltaDePartido[];
  actualizar: { id: string; patch: Record<string, unknown>; cambios: string[]; phase_id: string | null }[];
  omitidos: { motivo: MotivoOmision; detalle: string }[];
  /** finales que estaban cargados con otro marcador; el de la fuente ganó */
  correcciones: string[];
  /** jugados sin uno de los dos equipos presente: los mira una persona */
  sinPresentacion: string[];
  sinCambios: number;
  clubesInvolucrados: Set<string>;
}

function puntosDe(propios: number, rival: number, puntos: { win: number; draw: number; loss: number }): number {
  if (propios > rival) return puntos.win;
  if (propios < rival) return puntos.loss;
  return puntos.draw;
}

/** `"2026/03/08 16:00:00"` → `"2026-03-08T16:00:00-03:00"`. `null` si no es eso. */
export function horarioIso(horario: string): string | null {
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec((horario ?? '').trim());
  if (!m) return null;
  const [, a, mes, d, h, min, s] = m;
  if (Number(mes) < 1 || Number(mes) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${a}-${mes}-${d}T${h}:${min}:${s}${OFFSET}`;
}

const limpio = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
};

/** Dos instantes son el mismo si coinciden al minuto: los segundos no importan. */
const mismoInstante = (a: string | null, b: string | null): boolean => {
  if (!a || !b) return a === b;
  const ta = Date.parse(a), tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return Math.abs(ta - tb) < 60_000;
};

export function planAahbaMatches(input: {
  partidos: PartidoCrudo[];
  /** de la clave del nombre del equipo a nuestro club_id; `null` si no lo conoce */
  resolverClub: (clave: string) => string | null;
  existentes: ExistenteAahba[];
  /** el instante contra el que se mide la regla de los tres días */
  ahora: Date;
  puntos?: { win: number; draw: number; loss: number };
}): PlanAahba {
  const { partidos, resolverClub, existentes, ahora } = input;
  const puntos = input.puntos ?? PUNTOS_HOCKEY;

  const plan: PlanAahba = {
    crear: [], actualizar: [], omitidos: [], correcciones: [], sinPresentacion: [],
    sinCambios: 0, clubesInvolucrados: new Set(),
  };

  const porExternalId = new Map<string, ExistenteAahba>();
  const porPar = new Map<string, ExistenteAahba[]>();
  for (const e of existentes) {
    if (e.external_id) porExternalId.set(e.external_id, e);
    else {
      const k = `${e.home_club_id}>${e.away_club_id}`;
      porPar.set(k, [...(porPar.get(k) ?? []), e]);
    }
  }
  const adoptados = new Set<string>();
  const limitePostergar = ahora.getTime() - DIAS_PARA_POSTERGAR * 24 * 60 * 60 * 1000;

  for (const p of partidos) {
    const rotulo = `${p.nombreLocal.trim()} vs ${p.nombreVisitante.trim()}`;
    const home = resolverClub(claveDeNombre(p.nombreLocal));
    const away = resolverClub(claveDeNombre(p.nombreVisitante));
    if (!home || !away) {
      plan.omitidos.push({ motivo: 'equipo_no_resuelto', detalle: `${rotulo} (${!home ? p.nombreLocal.trim() : p.nombreVisitante.trim()})` });
      continue;
    }
    if (home === away) {
      plan.omitidos.push({ motivo: 'mismo_equipo_en_ambos_lados', detalle: `${rotulo} → ${home}` });
      continue;
    }
    const dateTime = horarioIso(p.horario);
    if (!dateTime) {
      plan.omitidos.push({ motivo: 'horario_ilegible', detalle: `${rotulo}: "${p.horario}"` });
      continue;
    }

    plan.clubesInvolucrados.add(home);
    plan.clubesInvolucrados.add(away);

    const jugado = p.played;
    const gl = Number(p.golesLocal), gv = Number(p.golesVisitante);
    const marcadorValido = jugado && Number.isFinite(gl) && Number.isFinite(gv);
    const yaPasoElPlazo = Date.parse(dateTime) < limitePostergar;

    const status: 'final' | 'postponed' | 'scheduled' =
      marcadorValido ? 'final' : yaPasoElPlazo ? 'postponed' : 'scheduled';
    const score = marcadorValido ? { home: gl, away: gv } : null;
    const roundLabel = p.numeroFecha ? `Fecha ${p.numeroFecha}` : null;
    const venue = limpio(p.campoJuegoNombre);
    const referee = limpio(p.arbitros);

    if (marcadorValido && (!p.presenteLocal || !p.presenteVisitante)) {
      plan.sinPresentacion.push(`${rotulo} ${gl}-${gv} (sin presentación)`);
    }

    const externalId = buildMatchExternalId(p.id);
    let existente = porExternalId.get(externalId);
    if (!existente) {
      const candidatos = (porPar.get(`${home}>${away}`) ?? []).filter((e) => !adoptados.has(e.id));
      if (candidatos.length > 1) {
        plan.omitidos.push({ motivo: 'par_ambiguo', detalle: `${rotulo}: ${candidatos.length} filas en la base con ese par` });
        continue;
      }
      existente = candidatos[0];
      if (existente) adoptados.add(existente.id);
    }

    if (!existente) {
      plan.crear.push({
        external_id: externalId,
        home_club_id: home,
        away_club_id: away,
        date_time: dateTime,
        // `AltaDePartido` solo contempla programado o final; un alta postergada
        // se crea programada y la corrida siguiente la posterga.
        status: status === 'final' ? 'final' : 'scheduled',
        score,
        venue,
        round_label: roundLabel,
        points_autocalculated: false,
        home_base_points: score ? puntosDe(score.home, score.away, puntos) : 0,
        away_base_points: score ? puntosDe(score.away, score.home, puntos) : 0,
        home_bonus_points: 0,
        away_bonus_points: 0,
      });
      continue;
    }

    const patch: Record<string, unknown> = {};
    const cambios: string[] = [];

    if (existente.external_id !== externalId) {
      patch.external_id = externalId;
      cambios.push(existente.external_id ? `external_id ${existente.external_id} → ${externalId}` : 'adoptado');
    }
    if (existente.status !== status) {
      patch.status = status;
      cambios.push(`estado ${existente.status} → ${status}`);
    }
    const scoreViejo = existente.score;
    const mismoScore = score === null
      ? scoreViejo === null
      : scoreViejo != null && scoreViejo.home === score.home && scoreViejo.away === score.away;
    if (!mismoScore) {
      patch.score = score;
      patch.home_base_points = score ? puntosDe(score.home, score.away, puntos) : 0;
      patch.away_base_points = score ? puntosDe(score.away, score.home, puntos) : 0;
      patch.points_autocalculated = false;
      const antes = scoreViejo ? `${scoreViejo.home}-${scoreViejo.away}` : 'sin marcador';
      const despues = score ? `${score.home}-${score.away}` : 'sin marcador';
      cambios.push(`marcador ${antes} → ${despues}`);
      if (existente.status === 'final' && score) {
        plan.correcciones.push(`${rotulo}: estaba ${antes}, la AAHBA publica ${despues}`);
      }
    }
    if (!mismoInstante(existente.date_time, dateTime)) {
      patch.date_time = dateTime;
      cambios.push(`fecha ${existente.date_time ?? 'sin fecha'} → ${dateTime}`);
    }
    if (roundLabel && existente.round_label !== roundLabel) {
      patch.round_label = roundLabel;
      cambios.push(`fecha nro → ${roundLabel}`);
    }
    if (venue && existente.venue !== venue) {
      patch.venue = venue;
      cambios.push('cancha');
    }
    if (referee && existente.referee !== referee) {
      patch.referee = referee;
      cambios.push('árbitros');
    }

    if (cambios.length === 0) plan.sinCambios++;
    else plan.actualizar.push({ id: existente.id, patch, cambios, phase_id: existente.phase_id });
  }

  return plan;
}
