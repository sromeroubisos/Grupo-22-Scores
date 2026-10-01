/**
 * Lectura del HTML de iSquad. Puro: entra un string, sale un objeto, sin red.
 *
 * iSquad no tiene API de resultados —la única ruta JSON es el árbol de
 * campeonatos, ver `client.ts`—, así que todo lo demás se lee de las páginas
 * que arma el servidor. Son tres:
 *
 *   resultados_completos.php?id={grupo}   todas las jornadas de un grupo
 *   clasificacion.php?id={grupo}          la tabla oficial
 *   acta.php?id_partido={id}              la cronología del partido
 *
 * ## Por qué se confía en el acta
 *
 * Medido el 2026-10-01 sobre 139 actas (Liga Iberdrola y DH 2025/26 completas,
 * y la 1ª jornada de las nueve fases de 2026/27): en las 139 la suma de los
 * eventos da el marcador, y los tries contados dan el EF de la tabla oficial en
 * los 81 clubes. Con eso se calcula el bonus ofensivo, que la federación no
 * publica por partido.
 *
 * El evento de palos cambió de nombre entre temporadas ("Puntapie de Castigo"
 * en 2025/26, "Puntapie de Castigo a palos" en 2026/27): los tipos se
 * reconocen por el PRINCIPIO del nombre. Lo que no suma (tarjetas) se guarda
 * igual en la cronología.
 */

export interface PartidoIsquad {
  /** El id de `mostrarPrevio(…)`: existe desde que el partido está en el fixture. */
  id: string;
  jornada: number | null;
  localId: string;
  visitanteId: string;
  /** `null` mientras no hay marcador. */
  puntosLocal: number | null;
  puntosVisitante: number | null;
  /** `dd/mm/yyyy` */
  fecha: string | null;
  /** `HH:MM`; `null` cuando iSquad publica `0:00`, que es "sin horario". */
  hora: string | null;
  cancha: string | null;
  /** Tal como lo escribe iSquad: Pendiente, Finalizado, Aplazado… */
  estado: string;
  /** `true` si el botón del acta está activo (el partido tiene cronología). */
  conActa: boolean;
  streaming: string | null;
}

export interface FilaTablaIsquad {
  equipoId: string;
  posicion: number;
  pts: number;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  tf: number;
  tc: number;
  /** tries a favor / en contra */
  ef: number;
  ec: number;
  bo: number;
  bd: number;
}

export type TipoEventoIsquad = 'try' | 'penalty_try' | 'conversion' | 'penalty_goal' | 'drop_goal' | 'yellow_card' | 'red_card' | 'otro';

export interface EventoIsquad {
  /** `"63:00"` tal cual. */
  minuto: string;
  tipo: TipoEventoIsquad;
  /** El texto original, para lo que no se clasifica. */
  texto: string;
  lado: 'local' | 'visitante' | null;
  jugador: string | null;
}

export interface ActaIsquad {
  local: string | null;
  visitante: string | null;
  /** En orden cronológico (iSquad los publica del último al primero). */
  eventos: EventoIsquad[];
}

const VALOR: Partial<Record<TipoEventoIsquad, number>> = {
  try: 5, penalty_try: 7, conversion: 2, penalty_goal: 3, drop_goal: 3,
};

const texto = (html: string) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

const filas = (html: string) => html.split(/<tr\b[^>]*>/i).slice(1);
const celdas = (fila: string) => [...fila.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
const entero = (s: string | undefined) => {
  const n = Number((s ?? '').trim());
  return Number.isFinite(n) && (s ?? '').trim() !== '' ? n : null;
};

/** Todas las jornadas de un grupo (`resultados_completos.php`). */
export function parseResultados(html: string): PartidoIsquad[] {
  const out: PartidoIsquad[] = [];
  let jornada: number | null = null;
  for (const fila of filas(html)) {
    const j = /Jornada\s+(\d+)/i.exec(texto(fila));
    if (j && !fila.includes('nombres-equipos')) { jornada = Number(j[1]); continue; }

    const nombres = /class="nombres-equipos">([\s\S]*?)<\/div>/.exec(fila)?.[1] ?? '';
    const equipos = [...nombres.matchAll(/id_equipo=(\d+)/g)].map((m) => m[1]);
    const id = /mostrarPrevio\((\d+)\)/.exec(fila)?.[1] ?? /mostrarActa\((\d+)\)/.exec(fila)?.[1];
    if (equipos.length < 2 || !id) continue;
    // Con un número impar de equipos, el que descansa figura contra `id_equipo=0`:
    // no es un partido.
    if (equipos[0] === '0' || equipos[1] === '0') continue;

    const marcador = /<span class='[^']*'>\s*(\d*)\s*<\/span>\s*-\s*<span class='[^']*'>\s*(\d*)\s*<\/span>/.exec(fila);
    const cuando = /<div\s*>\s*(\d{1,2}:\d{2})\s*<\/div>\s*<div class='negrita'>\s*(\d{2}\/\d{2}\/\d{4})/.exec(fila);
    const lugar = /class="col-lugar">([\s\S]*?)<\/td>/.exec(fila)?.[1];
    const estado = texto(/<circle[^>]*\/>([\s\S]*?)<\/span>/.exec(fila)?.[1] ?? '');
    const hora = cuando?.[1] && cuando[1] !== '0:00' && cuando[1] !== '00:00' ? cuando[1] : null;

    out.push({
      id,
      jornada,
      localId: equipos[0],
      visitanteId: equipos[1],
      puntosLocal: entero(marcador?.[1]),
      puntosVisitante: entero(marcador?.[2]),
      fecha: cuando?.[2] ?? null,
      hora,
      cancha: lugar ? texto(lugar) || null : null,
      estado,
      conActa: /onclick='mostrarActa\(\d+\);?'/.test(fila),
      streaming: /mostrar_modal_streaming\("([^"]+)"\)/.exec(fila)?.[1] ?? null,
    });
  }
  return out;
}

/**
 * La tabla oficial (`clasificacion.php`). Columnas, en orden:
 * PTS · PJ PG PE PP · TF TC DT · EF EC DE · BO BD.
 */
export function parseClasificacion(html: string): FilaTablaIsquad[] {
  const out: FilaTablaIsquad[] = [];
  for (const fila of filas(html)) {
    const equipoId = /id_equipo=(\d+)/.exec(fila)?.[1];
    if (!equipoId) continue;
    const posicion = entero(texto(/<td class='celda_peque'>([\s\S]*?)<\/td>/.exec(fila)?.[1] ?? ''));
    // Los porcentajes de PG/PE/PP vienen en un <div style> aparte: fuera.
    const n = celdas(fila)
      .map((c) => c.replace(/<div style[\s\S]*?<\/div>/g, ''))
      .map((c) => texto(c).split(' ')[0])
      .filter((v) => /^-?\d+$/.test(v))
      .map(Number);
    if (n.length < 13 || posicion === null) continue;
    const [pts, pj, pg, pe, pp, tf, tc, , ef, ec, , bo, bd] = n.slice(-13);
    out.push({ equipoId, posicion, pts, pj, pg, pe, pp, tf, tc, ef, ec, bo, bd });
  }
  return out;
}

function tipoDe(nombre: string): TipoEventoIsquad {
  const t = nombre.toLowerCase();
  if (t.startsWith('ensayo de castigo')) return 'penalty_try';
  if (t.startsWith('ensayo')) return 'try';
  if (t.startsWith('conversion') || t.startsWith('conversión')) return 'conversion';
  if (t.startsWith('puntapie de castigo') || t.startsWith('puntapié de castigo')) return 'penalty_goal';
  if (t.startsWith('drop')) return 'drop_goal';
  if (t.startsWith('expulsion definitiva') || t.startsWith('expulsión definitiva') || t.includes('(roja)')) return 'red_card';
  if (t.startsWith('expulsion temporal') || t.startsWith('expulsión temporal')) return 'yellow_card';
  return 'otro';
}

/** La cronología de un partido (`acta.php`). */
export function parseActa(html: string): ActaIsquad {
  const alts = [...html.matchAll(/alt='([^']+)'/g)].map((m) => m[1].trim());
  const local = alts[0] ?? null;
  const visitante = alts[1] ?? null;
  const eventos: EventoIsquad[] = [];
  for (const fila of filas(html)) {
    const c = celdas(fila);
    if (c.length < 4) continue;
    const minuto = texto(c[0]);
    if (!/^\d{1,3}:\d{2}$/.test(minuto)) continue;
    const nombre = texto(c[1]);
    const equipo = /alt='([^']+)'/.exec(c[3])?.[1]?.trim() ?? null;
    const lado = equipo && equipo === local ? 'local' : equipo && equipo === visitante ? 'visitante' : null;
    eventos.push({ minuto, tipo: tipoDe(nombre), texto: nombre, lado, jugador: c[4] ? texto(c[4]) || null : null });
  }
  return { local, visitante, eventos: eventos.reverse() };
}

export interface ResumenActa {
  puntosLocal: number;
  puntosVisitante: number;
  triesLocal: number;
  triesVisitante: number;
}

/** Puntos y tries que suma la cronología. Un evento sin lado no suma. */
export function resumirActa(acta: ActaIsquad): ResumenActa {
  const r: ResumenActa = { puntosLocal: 0, puntosVisitante: 0, triesLocal: 0, triesVisitante: 0 };
  for (const e of acta.eventos) {
    if (!e.lado) continue;
    const valor = VALOR[e.tipo] ?? 0;
    const esTry = e.tipo === 'try' || e.tipo === 'penalty_try';
    if (e.lado === 'local') { r.puntosLocal += valor; if (esTry) r.triesLocal++; }
    else { r.puntosVisitante += valor; if (esTry) r.triesVisitante++; }
  }
  return r;
}
