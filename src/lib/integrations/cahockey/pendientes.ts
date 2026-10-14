/**
 * Torneos de la CAH que se cargan ANTES de que la CAH los publique.
 *
 * El fixture de un Argentino de Selecciones circula en PDF (lo cuelga la
 * federación sede) días antes de que el torneo aparezca en cahockey.org.ar, y
 * a veces la CAH lo sube recién el día que empieza. Sin id de la CAH no hay
 * `cahockey:<id>` y el cron no lo puede seguir. Entonces el torneo se carga
 * desde el PDF con un external_id PENDIENTE que describe qué buscar:
 *
 *   cahockey-pendiente:<categoría>:<rama>      p. ej. cahockey-pendiente:mayores:damas
 *   cahockey-pendiente:<categoría>:<rama>:<nro> el partido <nro> del PDF
 *
 * (`cahockey-pendiente:` no empieza con `cahockey:`: el sync normal no lo
 * levanta ni le pide nada a SICAH.)
 *
 * Cada pasada completa del cron mira el listado de la CAH, toma los torneos de
 * esa rama en las fechas del PDF y lee el SICAH de cada uno. Cuando hay UNO que
 * tiene todos los partidos del PDF, lo vincula: el torneo pasa a
 * `cahockey:<id>` y cada partido del PDF adopta el número de SICAH del partido
 * que juegan los mismos dos equipos ese día. Desde ahí lo sigue el sync de
 * siempre — resultados, cruces, tablas.
 *
 * La adopción es por PAR DE EQUIPOS Y DÍA, no por el número del PDF: nada
 * garantiza que SICAH numere igual, y un número que no coincide le cambiaría
 * los equipos a un partido. Y es todo o nada: si un partido del PDF no tiene
 * pareja en SICAH, no se vincula —el sync crearía el de SICAH al lado del
 * huérfano y quedaría duplicado—, se avisa en `errors` y se reintenta en la
 * corrida siguiente. Dos candidatos válidos también es error: eso lo decide
 * una persona.
 *
 * Es puro: el listado y la página de SICAH llegan parseados.
 */

import { claveDeNombre } from '../fedhockeycba/nombres.ts';
import { buildMatchExternalId, esClubReal, nombreLimpio } from './nombres.ts';
import { fechaDelDia, type TorneoSicah } from './sicah.ts';

export const CAHOCKEY_PENDIENTE_PREFIX = 'cahockey-pendiente:';

export type Pendiente = { categoria: string; rama: 'damas' | 'caballeros' };

/** `cahockey-pendiente:mayores:damas` → { categoria: 'mayores', rama: 'damas' } */
export function parsearPendiente(externalId: string): Pendiente | null {
  if (!externalId.startsWith(CAHOCKEY_PENDIENTE_PREFIX)) return null;
  const [categoria, rama] = externalId.slice(CAHOCKEY_PENDIENTE_PREFIX.length).split(':');
  if (!categoria || (rama !== 'damas' && rama !== 'caballeros')) return null;
  return { categoria, rama };
}

export type TorneoListadoCah = { id: string; nombre: string; desde: string | null; hasta: string | null };

function fechaIso(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
}

/**
 * El acordeón por años de una sección de cahockey.org.ar:
 * `<a href="#" class="ampliar_torneo" id="1589">NOMBRE</a><br> Desde el 17/09/2026 al 20/09/2026`.
 */
export function parsearListadoCah(html: string): TorneoListadoCah[] {
  const salida: TorneoListadoCah[] = [];
  const re = /class="ampliar_torneo"\s+id="(\d+)"[^>]*>([^<]+)<\/a>\s*(?:<br\s*\/?>)?\s*(?:Desde el (\d{2}\/\d{2}\/\d{4}) al (\d{2}\/\d{2}\/\d{4}))?/g;
  for (const m of html.matchAll(re)) {
    salida.push({
      id: m[1],
      nombre: m[2].replace(/\s+/g, ' ').trim(),
      desde: m[3] ? fechaIso(m[3]) : null,
      hasta: m[4] ? fechaIso(m[4]) : null,
    });
  }
  return salida;
}

const RAMA_CONTRARIA = { damas: 'caballeros', caballeros: 'damas' } as const;
const DIA_MS = 86_400_000;

/**
 * Los torneos del listado que PUEDEN ser el pendiente: nombran la rama (y no
 * la contraria), no son de otra categoría de edad ni de pista (salvo que la
 * pendiente lo sea), y empiezan dentro del rango de fechas del PDF (con tres
 * días de gracia: la CAH a veces pone de "desde" la reunión técnica).
 *
 * El nombre NO alcanza para elegir. Medido en 2026: el de Córdoba se publicó
 * como "…SELECCIONADOS CAMPEONATOS CABALLEROS", sin "mayor", y el mismo fin de
 * semana la CAH subió los Ascenso B y C de Mayores de otras sedes. Esto filtra
 * lo grueso; el que se queda es el único cuyo SICAH tiene TODOS los partidos
 * del PDF (`planAdopcion` sin huérfanos), y eso lo decide el cron.
 */
export function candidatosDelListado(
  listado: TorneoListadoCah[],
  pendiente: Pendiente,
  rango: { desde: string; hasta: string },
): TorneoListadoCah[] {
  const palabras = claveDeNombre(pendiente.categoria).split(' ');
  const inicio = Date.parse(`${rango.desde}T12:00:00Z`) - 3 * DIA_MS;
  const fin = Date.parse(`${rango.hasta}T12:00:00Z`);
  return listado.filter((t) => {
    const clave = ` ${claveDeNombre(t.nombre)} `;
    if (!clave.includes(` ${pendiente.rama} `) || clave.includes(` ${RAMA_CONTRARIA[pendiente.rama]} `)) return false;
    if (/ sub ?\d/.test(clave) && !palabras.includes('sub')) return false;
    if (clave.includes(' pista ') && !palabras.includes('pista')) return false;
    if (!t.desde) return false;
    const desde = Date.parse(`${t.desde}T12:00:00Z`);
    return desde >= inicio && desde <= fin;
  });
}

export type FilaPendiente = {
  id: string;
  external_id: string | null;
  home_club_id: string;
  away_club_id: string;
  date_time: string;
};

export type Adopcion = {
  adoptados: { id: string; de: string | null; a: string }[];
  /** partidos del PDF sin pareja (o con más de una) en SICAH */
  sinPareja: string[];
};

const par = (a: string, b: string) => [a, b].sort().join('|');

/** El día en Argentina (-03:00 fijo) de un instante. */
function diaAr(dateTime: string): string {
  return new Date(Date.parse(dateTime) - 3 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Qué número de SICAH le corresponde a cada partido cargado desde el PDF.
 * Pareja = los mismos dos clubes (sin importar quién es local) el mismo día;
 * si el par se repite en el torneo y el día no desempata, no hay pareja.
 */
export function planAdopcion(args: {
  filas: FilaPendiente[];
  sicah: TorneoSicah;
  nuevoTorneoExternalId: string;
  resolverClub: (nombre: string) => string;
}): Adopcion {
  const { filas, sicah, nuevoTorneoExternalId, resolverClub } = args;
  const porPar = new Map<string, { nro: string; fecha: string | null }[]>();
  for (const p of sicah.partidos) {
    const local = nombreLimpio(p.local?.equipo ?? '');
    const visitante = nombreLimpio(p.visitante?.equipo ?? '');
    if (!esClubReal(local) || !esClubReal(visitante)) continue;
    const clave = par(resolverClub(local), resolverClub(visitante));
    const lista = porPar.get(clave) ?? [];
    lista.push({ nro: p.nro, fecha: fechaDelDia(p.dia, sicah.desde, sicah.hasta) });
    porPar.set(clave, lista);
  }

  const salida: Adopcion = { adoptados: [], sinPareja: [] };
  const tomados = new Set<string>();
  for (const f of filas) {
    const opciones = (porPar.get(par(f.home_club_id, f.away_club_id)) ?? []).filter((o) => !tomados.has(o.nro));
    const mismoDia = opciones.filter((o) => o.fecha === diaAr(f.date_time));
    const elegido = opciones.length === 1 ? opciones[0] : mismoDia.length === 1 ? mismoDia[0] : null;
    if (!elegido) {
      salida.sinPareja.push(`${f.external_id ?? f.id}: ${f.home_club_id} vs ${f.away_club_id} (${diaAr(f.date_time)})${opciones.length > 1 ? ` · ${opciones.length} candidatos` : ''}`);
      continue;
    }
    tomados.add(elegido.nro);
    salida.adoptados.push({ id: f.id, de: f.external_id, a: buildMatchExternalId(nuevoTorneoExternalId, elegido.nro) });
  }
  return salida;
}
