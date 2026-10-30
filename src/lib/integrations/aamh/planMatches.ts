/**
 * El plan de escritura de UN torneo de la AAMH: qué partidos se crean y
 * cuáles se actualizan, a partir del fixture que publica el sitio.
 *
 * La diferencia con el planificador de fedhockeycba: allá la identidad de un
 * partido hay que RECONSTRUIRLA (par de clubes sin orden + día), porque la
 * web de Córdoba no publica ids y una reprogramación rompe el vínculo. Acá la
 * AAMH numera cada partido y ese número viaja en la URL, así que la identidad
 * es exacta: `aamh:m{mid}`. Consecuencias que valen la pena:
 *
 * - Una reprogramación es un UPDATE de `date_time`, nunca un duplicado.
 * - Ida y vuelta del mismo par no se confunden jamás: son dos mid distintos.
 * - No hace falta desempatar por cercanía con `hoy`, así que este plan no
 *   necesita saber qué día es. Es puro de verdad: sin red, sin reloj.
 *
 * Lo que SÍ se conserva del molde de la casa: los partidos que una persona
 * cargó a mano tienen `external_id` NULL y se ADOPTAN por contenido (par +
 * día) antes de crear nada. El conector nunca duplica una fila humana.
 *
 * Reglas que este plan no rompe:
 * - Un partido ya `final` no se le pisa el resultado: si el sitio dice otra
 *   cosa, sale en `omitidos` para que lo mire alguien.
 * - Un equipo que no resuelve a un club conocido no se escribe: se reporta.
 *   Agregar el alias es una fila en `club_external_ids`, no un deploy.
 * - Un partido sin marcador es `scheduled` con `score` null. No es 0 a 0.
 */
import { claveDeNombre, claveDePar, buildMatchExternalId } from './nombres.ts';
import { PUNTOS_HOCKEY, type AltaDePartido, type ExistenteHockey } from '../fedhockeycba/planMatches.ts';
import type { RuedaDeFixture } from './parser.ts';

export { PUNTOS_HOCKEY };

/** Lo mismo que en las otras federaciones, más el rótulo de fecha que acá se recalcula. */
export interface ExistenteAamh extends ExistenteHockey {
  round_label: string | null;
}

/**
 * Sin hora en el fixture, el partido queda a media mañana en vez de a
 * medianoche: es el horario habitual de las jornadas de la AAMH y se
 * distingue de una hora exacta traída de la ficha.
 */
const HORA_POR_DEFECTO = '10:00';
/** Buenos Aires no tiene horario de verano: el offset es fijo. */
const OFFSET = '-03:00';

export type MotivoOmision =
  | 'equipo_no_resuelto'
  | 'mismo_equipo_en_ambos_lados'
  /** el sitio lo publica sin fecha: la AAMH todavía no lo programó */
  | 'sin_programar'
  /** el sitio escribió en el día algo que no es una fecha: eso sí es raro */
  | 'dia_ilegible'
  | 'resultado_contradice_final';

export interface PlanAamh {
  crear: AltaDePartido[];
  actualizar: { id: string; patch: Record<string, unknown>; cambios: string[]; phase_id: string | null }[];
  omitidos: { motivo: MotivoOmision; detalle: string }[];
  sinCambios: number;
  /** clubes que juegan según este plan; el route completa los participantes que falten */
  clubesInvolucrados: Set<string>;
}

/** Lo que la ficha de un partido agrega y el fixture no tiene. */
export interface DetalleDePartido {
  /** `HH:MM` */
  hora?: string;
  cancha?: string;
}

function puntosDe(propios: number, rival: number, puntos: { win: number; draw: number; loss: number }): number {
  if (propios > rival) return puntos.win;
  if (propios < rival) return puntos.loss;
  return puntos.draw;
}

/** `DD/MM` + el año del torneo → `YYYY-MM-DD`. `null` si el sitio escribió otra cosa. */
function diaIso(dia: string, anio: number): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(dia.trim());
  if (!m) return null;
  const d = Number(m[1]);
  const mes = Number(m[2]);
  if (d < 1 || d > 31 || mes < 1 || mes > 12) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const fechaHora = (dia: string, hora: string | undefined): string => {
  const [h, m] = (hora ?? HORA_POR_DEFECTO).split(':');
  return `${dia}T${h.padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}:00${OFFSET}`;
};

/**
 * La jornada de cada día. El fixture agrupa por rueda, no por fecha, pero
 * dentro del torneo los días distintos EN ORDEN son las fechas — así la tabla
 * y el feed pueden hablar de "Fecha 7" como en el resto del proyecto.
 */
function jornadasPorDia(ruedas: RuedaDeFixture[], anio: number): Map<string, number> {
  const dias = new Set<string>();
  for (const rueda of ruedas) {
    for (const p of rueda.partidos) {
      const dia = diaIso(p.dia, anio);
      if (dia) dias.add(dia);
    }
  }
  return new Map([...dias].sort().map((dia, i) => [dia, i + 1]));
}

export function planAamhMatches(input: {
  /** el año del torneo: el fixture publica `DD/MM` sin año */
  anio: number;
  ruedas: RuedaDeFixture[];
  resolverClub: (clave: string) => string | null;
  existentes: ExistenteAamh[];
  /** lo que trajeron las fichas que el cron sí pidió, por `mid` */
  detalles?: Map<number, DetalleDePartido>;
  puntos?: { win: number; draw: number; loss: number };
}): PlanAamh {
  const { anio, ruedas, resolverClub, existentes, detalles } = input;
  const puntos = input.puntos ?? PUNTOS_HOCKEY;

  const porExternalId = new Map(existentes.filter((e) => e.external_id).map((e) => [e.external_id!, e]));
  // Solo las filas SIN external_id entran a la adopción por contenido: las que
  // ya tienen identidad se buscan por ella y nunca por parecido.
  const porPar = new Map<string, ExistenteAamh[]>();
  for (const e of existentes) {
    if (e.external_id) continue;
    const clave = claveDePar(e.home_club_id, e.away_club_id, (e.date_time ?? '').slice(0, 10));
    const lista = porPar.get(clave);
    if (lista) lista.push(e);
    else porPar.set(clave, [e]);
  }

  const jornada = jornadasPorDia(ruedas, anio);
  const plan: PlanAamh = {
    crear: [], actualizar: [], omitidos: [], sinCambios: 0, clubesInvolucrados: new Set(),
  };
  const adoptados = new Set<string>();

  for (const rueda of ruedas) {
    for (const p of rueda.partidos) {
      // Un partido que la AAMH todavía no programó se publica con el día
      // VACÍO y con un "0 - 0" de relleno. Está medido sobre la temporada
      // 2026 entera: los 715 partidos sin fecha son 715 ceros a cero. Ese
      // marcador no es un empate, y crearlos metería 715 empates falsos que
      // reparten puntos en la tabla. No se escriben hasta que tengan fecha:
      // cuando la AAMH los programe, el mismo `mid` los va a traer de vuelta.
      if (!p.dia.trim()) {
        plan.omitidos.push({ motivo: 'sin_programar', detalle: `${p.mid}: ${p.local} vs ${p.visitante}` });
        continue;
      }
      const dia = diaIso(p.dia, anio);
      if (!dia) {
        plan.omitidos.push({ motivo: 'dia_ilegible', detalle: `${p.mid}: "${p.dia}"` });
        continue;
      }

      const local = resolverClub(claveDeNombre(p.local));
      const visitante = resolverClub(claveDeNombre(p.visitante));
      if (!local || !visitante) {
        plan.omitidos.push({
          motivo: 'equipo_no_resuelto',
          detalle: `${!local ? p.local : p.visitante} (partido ${p.mid})`,
        });
        continue;
      }
      if (local === visitante) {
        plan.omitidos.push({ motivo: 'mismo_equipo_en_ambos_lados', detalle: `${p.mid}: ${p.local}` });
        continue;
      }

      plan.clubesInvolucrados.add(local);
      plan.clubesInvolucrados.add(visitante);

      const externalId = buildMatchExternalId(p.mid);
      const detalle = detalles?.get(p.mid);
      const cuando = fechaHora(dia, detalle?.hora);
      const rotulo = `Fecha ${jornada.get(dia) ?? rueda.nro}`;
      const marcador = p.jugado ? { home: p.golesLocal!, away: p.golesVisitante! } : null;
      const estado: 'scheduled' | 'final' = p.jugado ? 'final' : 'scheduled';

      // Identidad exacta primero; si no, una fila humana del mismo par y día.
      let existente = porExternalId.get(externalId) ?? null;
      let adoptar = false;
      if (!existente) {
        const candidatos = (porPar.get(claveDePar(local, visitante, dia)) ?? []).filter((c) => !adoptados.has(c.id));
        if (candidatos.length === 1) {
          existente = candidatos[0];
          adoptar = true;
          adoptados.add(existente.id);
        }
      }

      if (!existente) {
        plan.crear.push({
          external_id: externalId,
          home_club_id: local,
          away_club_id: visitante,
          date_time: cuando,
          status: estado,
          score: marcador,
          venue: detalle?.cancha ?? null,
          round_label: rotulo,
          points_autocalculated: false,
          home_base_points: marcador ? puntosDe(marcador.home, marcador.away, puntos) : 0,
          away_base_points: marcador ? puntosDe(marcador.away, marcador.home, puntos) : 0,
          home_bonus_points: 0,
          away_bonus_points: 0,
        });
        continue;
      }

      const patch: Record<string, unknown> = {};
      const cambios: string[] = [];

      if (adoptar) {
        patch.external_id = externalId;
        cambios.push('adoptado');
      }

      // El día manda; la hora solo se pisa cuando la ficha la trajo, para no
      // reemplazar una hora real por el 10:00 de relleno.
      const diaActual = (existente.date_time ?? '').slice(0, 10);
      if (diaActual !== dia || (detalle?.hora != null && existente.date_time !== cuando)) {
        patch.date_time = cuando;
        cambios.push(`fecha ${existente.date_time ?? 'sin fecha'} → ${cuando}`);
      }

      if (detalle?.cancha) patch.venue = detalle.cancha;

      if (existente.status !== 'final' && marcador) {
        patch.status = 'final';
        patch.score = marcador;
        patch.home_base_points = puntosDe(marcador.home, marcador.away, puntos);
        patch.away_base_points = puntosDe(marcador.away, marcador.home, puntos);
        cambios.push(`resultado ${marcador.home}-${marcador.away}`);
      } else if (existente.status === 'final' && marcador) {
        const ya = existente.score;
        if (!ya || ya.home !== marcador.home || ya.away !== marcador.away) {
          plan.omitidos.push({
            motivo: 'resultado_contradice_final',
            detalle: `${p.mid}: cargado ${ya ? `${ya.home}-${ya.away}` : 'sin marcador'}, el sitio dice ${marcador.home}-${marcador.away}`,
          });
        }
      }

      if (existente.round_label !== rotulo) {
        patch.round_label = rotulo;
        cambios.push(`rótulo → ${rotulo}`);
      }

      if (Object.keys(patch).length) {
        plan.actualizar.push({ id: existente.id, patch, cambios, phase_id: existente.phase_id });
      } else {
        plan.sinCambios++;
      }
    }
  }

  return plan;
}
