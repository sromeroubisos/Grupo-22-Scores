/**
 * El plan de escritura de UN torneo: qué partidos se crean, cuáles se adoptan
 * y cuáles se actualizan, a partir del fixture y las crónicas de la web.
 *
 * La diferencia de fondo con el planificador de URBA: acá los partidos ya
 * cargados en el gestor NACIERON a mano, con `external_id` NULL. El conector
 * no puede identificarlos por id externo — los empareja por CONTENIDO (par de
 * clubes sin orden + día) y los ADOPTA: les escribe su `external_id` para que
 * la próxima corrida ya los encuentre por identidad. Nunca crea un duplicado
 * de una fila que una persona cargó.
 *
 * Reglas que este plan no rompe:
 * - Un partido `final` no se le pisa el resultado: si la crónica dice otra
 *   cosa, sale en `omitidos` para que lo mire alguien.
 * - Un resultado que matchea con más de un partido pendiente del par (ida y
 *   vuelta) se resuelve por cercanía con `hoy`; si sigue ambiguo, se omite.
 * - Un equipo que no resuelve a un club conocido no se escribe: se reporta.
 *   Agregar el alias es una fila en `club_external_ids`, no un deploy.
 *
 * Módulo PURO: sin red, sin reloj (por eso `hoy` entra por parámetro), sin
 * Supabase. La traducción resultado → puntos usa el sistema del torneo.
 */
import { claveDeNombre, claveDePar, buildMatchExternalId } from './nombres.ts';
import type { PartidoDeFixture, SeccionDeFixture } from './fixture-parser.ts';
import type { ResultadoDeCronica } from './cronicas.ts';

/** Hockey de la federación: 3 la victoria, 1 el empate. Es el sistema con el
 * que el gestor cargó los partidos existentes (base 3/0 y bonus 0). */
export const PUNTOS_HOCKEY = { win: 3, draw: 1, loss: 0 };

/** Sin hora en el PDF, el partido queda a media tarde de Córdoba en vez de a
 * medianoche: menos raro en el feed y fácil de distinguir de una hora real. */
const HORA_POR_DEFECTO = '15:00';
/** Córdoba no tiene horario de verano: el offset es fijo. */
const OFFSET = '-03:00';

export interface ExistenteHockey {
  id: string;
  external_id: string | null;
  home_club_id: string;
  away_club_id: string;
  date_time: string | null;
  status: string | null;
  score: { home: number; away: number } | null;
  phase_id: string | null;
}

export interface AltaDePartido {
  external_id: string;
  home_club_id: string;
  away_club_id: string;
  date_time: string;
  status: 'scheduled' | 'final';
  score: { home: number; away: number } | null;
  venue: string | null;
  round_label: string | null;
  points_autocalculated: false;
  home_base_points: number;
  away_base_points: number;
  home_bonus_points: 0;
  away_bonus_points: 0;
}

export type MotivoOmision =
  | 'equipo_no_resuelto'
  | 'mismo_equipo_en_ambos_lados'
  | 'par_ambiguo'
  | 'resultado_sin_partido'
  | 'resultado_ambiguo'
  | 'resultado_contradice_final';

export interface PlanHockey {
  crear: AltaDePartido[];
  actualizar: { id: string; patch: Record<string, unknown>; cambios: string[]; phase_id: string | null }[];
  omitidos: { motivo: MotivoOmision; detalle: string }[];
  sinCambios: number;
  /** clubes que juegan según este plan; el route completa los participantes que falten */
  clubesInvolucrados: Set<string>;
}

const diaDe = (iso: string | null): string => (iso ?? '').slice(0, 10);

const fechaHora = (dia: string, hora: string | null): string => {
  const [h, m] = (hora ?? HORA_POR_DEFECTO).split(':');
  return `${dia}T${h.padStart(2, '0')}:${m}:00${OFFSET}`;
};

function puntosDe(golesPropios: number, golesRival: number, puntos: { win: number; draw: number; loss: number }): number {
  if (golesPropios > golesRival) return puntos.win;
  if (golesPropios < golesRival) return puntos.loss;
  return puntos.draw;
}

interface FilaEnPlan {
  existente: ExistenteHockey | null;
  alta: AltaDePartido | null;
  patch: Record<string, unknown>;
  cambios: string[];
}

export function planTournamentMatches(input: {
  /** mitad derecha del external_id del torneo (`fedhockeycba:{slug}`) */
  slug: string;
  /** secciones del fixture que pertenecen a ESTE torneo */
  secciones: SeccionDeFixture[];
  /** qué división del PDF alimenta este torneo ('1' = primera) */
  division: string;
  /** resultados de crónicas ya resueltos con los alias de ESTE torneo */
  resultados: ResultadoDeCronica[];
  resolverClub: (clave: string) => string | null;
  existentes: ExistenteHockey[];
  puntos?: { win: number; draw: number; loss: number };
  /** día de la corrida, ISO yyyy-mm-dd; desempata la ida de la vuelta */
  hoy: string;
  /**
   * Cómo se arma el external_id de un partido nuevo. Por defecto el de
   * fedhockeycba; el conector de la AHL pasa el suyo — el PLAN es el mismo
   * para las dos federaciones, la identidad lleva el prefijo del provider.
   */
  buildExternalId?: (slug: string, dia: string, localId: string, visitanteId: string) => string;
  /**
   * Permite que un resultado SIN partido a la vista cree la fila final,
   * en vez de reportarse. Solo para fuentes estructuradas que traen el
   * número de fecha (estoeshockey): el día sale de `diaDeFecha` — el route
   * lo estima por la cadencia semanal cuando la fecha es anterior a los
   * boletines disponibles. Una crónica en prosa nunca entra acá.
   */
  crearDesdeResultado?: { diaDeFecha: (fechaNro: number) => string | null };
}): PlanHockey {
  const { slug, secciones, division, resultados, resolverClub, existentes, hoy } = input;
  const puntos = input.puntos ?? PUNTOS_HOCKEY;
  const armarExternalId = input.buildExternalId ?? buildMatchExternalId;

  const omitidos: PlanHockey['omitidos'] = [];
  const filas: FilaEnPlan[] = existentes.map((e) => ({ existente: e, alta: null, patch: {}, cambios: [] }));
  const porParYDia = new Map<string, FilaEnPlan>();
  for (const f of filas) {
    const e = f.existente!;
    porParYDia.set(claveDePar(e.home_club_id, e.away_club_id, diaDe(e.date_time)), f);
  }
  const parDe = (f: FilaEnPlan): [string, string] =>
    f.existente
      ? [f.existente.home_club_id, f.existente.away_club_id]
      : [f.alta!.home_club_id, f.alta!.away_club_id];

  // ── 1. el fixture: altas, adopciones y reprogramaciones ────────────────
  for (const seccion of secciones) {
    const partidos = seccion.partidos.filter((p: PartidoDeFixture) => p.division === division);
    for (const p of partidos) {
      const localId = resolverClub(claveDeNombre(p.local));
      const visitanteId = resolverClub(claveDeNombre(p.visitante));
      if (!localId || !visitanteId) {
        const quien = [!localId ? p.local : null, !visitanteId ? p.visitante : null].filter(Boolean).join(' y ');
        omitidos.push({ motivo: 'equipo_no_resuelto', detalle: `${seccion.torneo} ${seccion.dia}: sin alias para ${quien}` });
        continue;
      }
      if (localId === visitanteId) {
        omitidos.push({ motivo: 'mismo_equipo_en_ambos_lados', detalle: `${p.local} vs ${p.visitante} → ${localId}` });
        continue;
      }

      const roundLabel = seccion.fechaNro != null ? `Fecha ${seccion.fechaNro}` : seccion.fase;
      const dateTime = fechaHora(seccion.dia, p.hora);
      const clavePar = claveDePar(localId, visitanteId, seccion.dia);

      let fila = porParYDia.get(clavePar) ?? null;
      if (!fila) {
        // Mismo par en OTRO día y todavía sin jugar: una reprogramación, no
        // un partido nuevo — siempre que el candidato sea único.
        const candidatos = filas.filter((f) => {
          if (f.alta || !f.existente) return false;
          const [a, b] = parDe(f);
          const mismoPar = (a === localId && b === visitanteId) || (a === visitanteId && b === localId);
          return mismoPar && String(f.existente.status).toLowerCase() !== 'final';
        });
        if (candidatos.length === 1) fila = candidatos[0];
        else if (candidatos.length > 1) {
          omitidos.push({ motivo: 'par_ambiguo', detalle: `${p.local} vs ${p.visitante} ${seccion.dia}: ${candidatos.length} pendientes en la base` });
          continue;
        }
      }

      if (!fila) {
        const alta: AltaDePartido = {
          external_id: armarExternalId(slug, seccion.dia, localId, visitanteId),
          home_club_id: localId,
          away_club_id: visitanteId,
          date_time: dateTime,
          status: 'scheduled',
          score: null,
          venue: p.cancha,
          round_label: roundLabel,
          points_autocalculated: false,
          home_base_points: 0,
          away_base_points: 0,
          home_bonus_points: 0,
          away_bonus_points: 0,
        };
        fila = { existente: null, alta, patch: {}, cambios: [] };
        filas.push(fila);
        porParYDia.set(clavePar, fila);
        continue;
      }

      // La misma sección repetida contra un alta ya planificada: nada nuevo.
      if (fila.alta) continue;

      const e = fila.existente!;
      // La guarda de `patch` hace idempotente la sección repetida: el mismo
      // PDF cuelga del pre boletín y del boletín, y llega dos veces.
      if (!e.external_id && !('external_id' in fila.patch)) {
        fila.patch.external_id = armarExternalId(slug, seccion.dia, localId, visitanteId);
        fila.cambios.push('external_id (adoptado)');
      }
      // La agenda es de la web mientras el partido no esté jugado; un `final`
      // no se mueve por un PDF viejo. La comparación es por INSTANTE: la base
      // guarda `+00:00` y el conector produce `-03:00`, y el mismo momento con
      // otro texto no es un cambio. Y sin hora en el PDF no se pisa una hora
      // cargada a mano: sólo el cambio de día justifica mover el partido.
      const diaCambia = diaDe(e.date_time) !== seccion.dia;
      const instanteCambia = Date.parse(e.date_time ?? '') !== Date.parse(dateTime);
      if (String(e.status).toLowerCase() !== 'final' && instanteCambia && (p.hora !== null || diaCambia) && !('date_time' in fila.patch)) {
        fila.patch.date_time = dateTime;
        fila.cambios.push(`date_time (${diaDe(e.date_time) || 'sin fecha'} → ${seccion.dia} ${p.hora ?? HORA_POR_DEFECTO})`);
        porParYDia.set(clavePar, fila);
      }
    }
  }

  // ── 2. las crónicas: resultados sobre lo que ya está en el plan ────────
  for (const r of resultados) {
    const candidatos = filas.filter((f) => {
      const [a, b] = parDe(f);
      return (a === r.clubA && b === r.clubB) || (a === r.clubB && b === r.clubA);
    });
    if (!candidatos.length) {
      // Fuente estructurada con número de fecha: el resultado CREA su partido
      // (final, con puntos) en vez de perderse — sin esto las primeras fechas
      // del Clausura, cuyos boletines ya no están publicados, dejarían la
      // tabla incompleta para siempre.
      const dia = r.fechaNro != null ? input.crearDesdeResultado?.diaDeFecha(r.fechaNro) ?? null : null;
      if (input.crearDesdeResultado && dia) {
        const alta: AltaDePartido = {
          external_id: armarExternalId(slug, dia, r.clubA, r.clubB),
          home_club_id: r.clubA,
          away_club_id: r.clubB,
          date_time: fechaHora(dia, null),
          status: 'final',
          score: { home: r.golesA, away: r.golesB },
          venue: null,
          round_label: `Fecha ${r.fechaNro}`,
          points_autocalculated: false,
          home_base_points: puntosDe(r.golesA, r.golesB, puntos),
          away_base_points: puntosDe(r.golesB, r.golesA, puntos),
          home_bonus_points: 0,
          away_bonus_points: 0,
        };
        const fila: FilaEnPlan = { existente: null, alta, patch: {}, cambios: [] };
        filas.push(fila);
        porParYDia.set(claveDePar(r.clubA, r.clubB, dia), fila);
        continue;
      }
      omitidos.push({ motivo: 'resultado_sin_partido', detalle: r.texto });
      continue;
    }

    const pendientes = candidatos.filter((f) => {
      const status = f.alta ? f.alta.status : String(f.existente!.status).toLowerCase();
      return status !== 'final';
    });
    let fila: FilaEnPlan | null = null;
    if (pendientes.length === 1) fila = pendientes[0];
    else if (pendientes.length > 1) {
      // Ida y vuelta pendientes: el resultado es del partido más cercano a hoy
      // que no esté en el futuro lejano. Dos a la misma distancia = ambiguo.
      const conDia = pendientes
        .map((f) => ({ f, dia: f.alta ? diaDe(f.alta.date_time) : diaDe(f.existente!.date_time) }))
        .filter((x) => x.dia && x.dia <= hoy)
        .sort((x, y) => y.dia.localeCompare(x.dia));
      if (conDia.length && (conDia.length === 1 || conDia[0].dia !== conDia[1].dia)) fila = conDia[0].f;
      else {
        omitidos.push({ motivo: 'resultado_ambiguo', detalle: `${r.texto}: ${pendientes.length} partidos pendientes del par` });
        continue;
      }
    }

    if (!fila) {
      // Todos los del par ya están finales: si alguno tiene el mismo marcador
      // es la misma noticia repetida; si no, la web contradice a la base.
      const coincide = candidatos.some((f) => {
        const e = f.existente;
        if (!e?.score) return false;
        const esHome = e.home_club_id === r.clubA;
        return e.score.home === (esHome ? r.golesA : r.golesB) && e.score.away === (esHome ? r.golesB : r.golesA);
      });
      if (!coincide) omitidos.push({ motivo: 'resultado_contradice_final', detalle: r.texto });
      continue;
    }

    const [home] = parDe(fila);
    const esHomeA = home === r.clubA;
    const score = { home: esHomeA ? r.golesA : r.golesB, away: esHomeA ? r.golesB : r.golesA };
    const base = {
      home: puntosDe(score.home, score.away, puntos),
      away: puntosDe(score.away, score.home, puntos),
    };

    if (fila.alta) {
      fila.alta.status = 'final';
      fila.alta.score = score;
      fila.alta.home_base_points = base.home;
      fila.alta.away_base_points = base.away;
    } else {
      Object.assign(fila.patch, {
        status: 'final',
        score,
        points_autocalculated: false,
        home_base_points: base.home,
        away_base_points: base.away,
        home_bonus_points: 0,
        away_bonus_points: 0,
      });
      fila.cambios.push(`resultado ${score.home}-${score.away}`);
    }
  }

  // ── 3. el plan ─────────────────────────────────────────────────────────
  const crear = filas.filter((f) => f.alta).map((f) => f.alta!);
  const actualizar = filas
    .filter((f) => f.existente && f.cambios.length)
    .map((f) => ({ id: f.existente!.id, patch: f.patch, cambios: f.cambios, phase_id: f.existente!.phase_id }));
  const sinCambios = filas.filter((f) => f.existente && !f.cambios.length).length;

  const clubesInvolucrados = new Set<string>();
  for (const f of filas) if (f.alta || f.cambios.length) {
    const [a, b] = parDe(f);
    clubesInvolucrados.add(a);
    clubesInvolucrados.add(b);
  }

  return { crear, actualizar, omitidos, sinCambios, clubesInvolucrados };
}
