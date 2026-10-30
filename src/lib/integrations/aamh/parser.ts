/**
 * Lectura del HTML de aamh.com.ar. Módulo PURO: sin red, sin reloj, sin
 * Supabase — entra el HTML que trajo `client.ts` y salen datos.
 *
 * El tema no usa tablas: todo es `div` con clases estables (`.positions`,
 * `.matches`, `.players-table`). Se parsea con expresiones regulares, como el
 * resto de los conectores del proyecto — no hay ningún parser de HTML entre
 * las dependencias y traer uno por esto no se justifica.
 *
 * Dos cosas que el parser NO hace a propósito:
 *
 * - No compone la fecha. El fixture publica `DD/MM` sin año, y el año lo sabe
 *   el torneo, no la fila. Componer acá obligaría a pasarle el año a una
 *   función que no lo necesita para nada más.
 * - No resuelve clubes. Devuelve los nombres tal como los escribe la AAMH
 *   ("MAR DEL PLATA CLUB B"); el mapeo a `clubs.id` pasa por los alias, como
 *   en todos los conectores.
 */

/** Un torneo tal como lo lista el menú del año. */
export interface TorneoDelCatalogo {
  tid: number;
  cid: number;
  /** Primera, Intermedia, Sub 19, Sub 16, Sub 15, Sub 14 */
  division: string;
  /** Damas o Caballeros ('' si el menú no lo separa) */
  genero: string;
  /** Preparación A, Top Nivel 1 A Tira, ... */
  nombre: string;
}

export interface FilaDePosiciones {
  posicion: number;
  equipo: string;
  pts: number | null;
  pj: number | null;
  pg: number | null;
  pe: number | null;
  pp: number | null;
  gf: number | null;
  gc: number | null;
}

export interface PartidoDeFixture {
  /** el id del sitio; es la identidad del partido */
  mid: number;
  /** día como lo publica el fixture: `DD/MM`, sin año */
  dia: string;
  local: string;
  visitante: string;
  golesLocal: number | null;
  golesVisitante: number | null;
  jugado: boolean;
}

export interface RuedaDeFixture {
  nro: number;
  rotulo: string;
  partidos: PartidoDeFixture[];
}

export interface TorneoParseado {
  titulo: string;
  posiciones: FilaDePosiciones[];
  ruedas: RuedaDeFixture[];
  goleadores: { nombre: string; goles: number }[];
  amarillas: { nombre: string; cantidad: number }[];
  rojas: { nombre: string; cantidad: number }[];
}

export interface PartidoParseado {
  mid: number;
  categoria: string;
  /** `DD/MM/YYYY HH:MM` como lo escribe el sitio, o '' si no lo publica */
  fechaHora: string;
  cancha: string;
  local: string;
  visitante: string;
  golesLocal: number | null;
  golesVisitante: number | null;
}

/** El orden en que el tema emite los `.value` de una fila de posiciones. */
const COLUMNAS = ['pts', 'pj', 'pg', 'pe', 'pp', 'gf', 'gc'] as const;

/** Texto plano de un fragmento de HTML: sin etiquetas, sin entidades, sin espacio de más. */
function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&ordm;/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const entero = (s: string): number | null => {
  const m = /-?\d+/.exec(s);
  return m ? Number(m[0]) : null;
};

/**
 * Los `div` de una clase dada, con su contenido. Recorre a mano contando la
 * apertura y el cierre porque los bloques anidan (`.item` tiene adentro
 * `.results` con más `div`) y un regex perezoso cortaría en el primer
 * `</div>`.
 */
function bloques(html: string, clase: string): string[] {
  const salida: string[] = [];
  const apertura = new RegExp(`<div[^>]*class="[^"]*\\b${clase}\\b[^"]*"[^>]*>`, 'g');
  for (let m = apertura.exec(html); m; m = apertura.exec(html)) {
    let nivel = 1;
    let i = m.index + m[0].length;
    const desde = i;
    const tag = /<(\/?)div\b/g;
    tag.lastIndex = i;
    for (let t = tag.exec(html); t && nivel > 0; t = tag.exec(html)) {
      nivel += t[1] ? -1 : 1;
      i = t.index + t[0].length;
    }
    if (nivel !== 0) continue; // HTML cortado: mejor saltearlo que inventar
    salida.push(html.slice(desde, i - '</div'.length));
    apertura.lastIndex = i;
  }
  return salida;
}

/** El primer descendiente con esa clase, como texto plano. */
function campo(html: string, clase: string): string {
  const [primero] = bloques(html, clase);
  return primero === undefined ? '' : texto(primero);
}

/**
 * Lo mismo pero para las clases que el tema no cuelga de un `div`: el título
 * del torneo es un `h2`, la categoría de la ficha otro `h2` y la cancha un
 * `h5`. Ninguno anida, así que alcanza con un cierre perezoso.
 */
function campoTitulado(html: string, clase: string): string {
  const re = new RegExp(`<(h\\d)[^>]*class="[^"]*\\b${clase}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/\\1>`);
  return texto(re.exec(html)?.[2] ?? '');
}

// --------------------------------------------------------------------------
// catálogo del año
// --------------------------------------------------------------------------

/**
 * El menú de torneos: `ul.menu > li` por división, y adentro un `ul.sub-menu`
 * donde el género viaja como `li.menu-item-title` — un RÓTULO que separa los
 * grupos, no un ítem. Por eso se recorre en orden y se arrastra el último
 * rótulo visto.
 *
 * Los `li` que no apuntan a `/resultados/torneo/` se ignoran: Nivelación A y
 * B son páginas de WordPress con una tabla agregada, no torneos.
 */
export function parseCatalogo(html: string): TorneoDelCatalogo[] {
  const inicio = html.indexOf('tournaments-menu-container');
  if (inicio < 0) return [];
  const fin = html.indexOf('tournaments-year-selector', inicio);
  const menu = html.slice(inicio, fin < 0 ? undefined : fin);

  const salida: TorneoDelCatalogo[] = [];
  // Cada división abre con un <li ... menu-item-has-children>; lo que sigue
  // hasta el próximo es su sub-menú.
  const divisiones = menu.split(/<li[^>]*class="[^"]*menu-item-has-children[^"]*"[^>]*>/).slice(1);
  for (const bloque of divisiones) {
    const division = texto(/<a[^>]*>([\s\S]*?)<\/a>/.exec(bloque)?.[1] ?? '');
    let genero = '';
    const items = bloque.match(/<li[^>]*class="[^"]*menu-item[^"]*"[^>]*>[\s\S]*?<\/li>/g) ?? [];
    for (const item of items) {
      if (/menu-item-title/.test(item)) {
        genero = texto(item);
        continue;
      }
      const href = /<a[^>]*href="([^"]+)"/.exec(item)?.[1] ?? '';
      const ids = /\/resultados\/torneo\/(\d+)\/(\d+)/.exec(href);
      if (!ids) continue;
      salida.push({
        tid: Number(ids[1]),
        cid: Number(ids[2]),
        division,
        genero,
        nombre: texto(/<a[^>]*>([\s\S]*?)<\/a>/.exec(item)?.[1] ?? ''),
      });
    }
  }
  return salida;
}

// --------------------------------------------------------------------------
// página del torneo
// --------------------------------------------------------------------------

function parsePosiciones(html: string): FilaDePosiciones[] {
  const [tabla] = bloques(html, 'positions');
  if (!tabla) return [];
  const [items] = bloques(tabla, 'items');
  if (!items) return [];

  return bloques(items, 'item').map((fila) => {
    const valores = bloques(fila, 'value').map((v) => entero(texto(v)));
    const salida: FilaDePosiciones = {
      posicion: entero(campo(fila, 'position')) ?? 0,
      equipo: campo(fila, 'team'),
      pts: null, pj: null, pg: null, pe: null, pp: null, gf: null, gc: null,
    };
    COLUMNAS.forEach((col, i) => { salida[col] = valores[i] ?? null; });
    return salida;
  });
}

function parsePartido(anclaHtml: string, href: string): PartidoDeFixture | null {
  const mid = entero(/\/resultados\/partido\/(\d+)/.exec(href)?.[1] ?? '');
  if (mid === null) return null;

  const equipos = bloques(anclaHtml, 'team').map((t) => campo(t, 'name'));
  if (equipos.length < 2) return null;

  // El marcador viene en un solo `.goals` con los dos números y un guión.
  // Sin números el partido todavía no se jugó — y eso no es 0 a 0.
  const goles = campo(anclaHtml, 'goals').match(/\d+/g) ?? [];
  const jugado = goles.length === 2;

  return {
    mid,
    dia: campo(anclaHtml, 'date'),
    local: equipos[0],
    visitante: equipos[1],
    golesLocal: jugado ? Number(goles[0]) : null,
    golesVisitante: jugado ? Number(goles[1]) : null,
    jugado,
  };
}

/**
 * Las ruedas del fixture. Los rótulos viven en `.tabs-index` y los contenidos
 * en `.tabs-contents`, apareados por el id que va en el `onclick`
 * (`gah_select_tournament_tab(this, 'fixture-round-2')`). Emparejar por ese id
 * y no por el orden evita que una solapa nueva (Estadísticas, Posiciones)
 * corra los índices.
 */
function parseRuedas(html: string): RuedaDeFixture[] {
  const rotulos = new Map<string, string>();
  for (const m of html.matchAll(/<h6[^>]*class="tab[^"]*"[^>]*onclick="[^"]*'([\w-]+)'[^"]*"[^>]*>([\s\S]*?)<\/h6>/g)) {
    rotulos.set(m[1], texto(m[2]));
  }

  const salida: RuedaDeFixture[] = [];
  const inicio = html.indexOf('tabs-contents');
  if (inicio < 0) return salida;
  const contenidos = html.slice(inicio);

  for (const m of contenidos.matchAll(/<div class="tab tab-(fixture-round-(\d+))"[^>]*>/g)) {
    const desde = (m.index ?? 0) + m[0].length;
    const hasta = contenidos.indexOf('<div class="tab tab-', desde);
    const cuerpo = contenidos.slice(desde, hasta < 0 ? undefined : hasta);

    const partidos: PartidoDeFixture[] = [];
    for (const a of cuerpo.matchAll(/<a href="(\/resultados\/partido\/\d+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const partido = parsePartido(a[2], a[1]);
      if (partido) partidos.push(partido);
    }

    salida.push({ nro: Number(m[2]), rotulo: rotulos.get(m[1]) ?? m[1], partidos });
  }
  return salida;
}

function parseJugadores(html: string, seccion: string, claseValor: string): { nombre: string; valor: number }[] {
  const inicio = html.indexOf(seccion);
  if (inicio < 0) return [];
  const [tabla] = bloques(html.slice(inicio), 'players-table');
  if (!tabla) return [];
  return bloques(tabla, 'player')
    .map((p) => ({ nombre: campo(p, 'name'), valor: entero(campo(p, claseValor)) ?? 0 }))
    .filter((p) => p.nombre !== '');
}

export function parseTorneo(html: string): TorneoParseado {
  const goleadores = parseJugadores(html, 'top-scorers', 'player-goals');
  const amarillas = parseJugadores(html, 'yellow-cards', 'player-cards');
  const rojas = parseJugadores(html, 'red-cards', 'player-cards');

  return {
    titulo: campoTitulado(html, 'block-title'),
    posiciones: parsePosiciones(html),
    ruedas: parseRuedas(html),
    goleadores: goleadores.map((g) => ({ nombre: g.nombre, goles: g.valor })),
    amarillas: amarillas.map((a) => ({ nombre: a.nombre, cantidad: a.valor })),
    rojas: rojas.map((r) => ({ nombre: r.nombre, cantidad: r.valor })),
  };
}

// --------------------------------------------------------------------------
// ficha del partido
// --------------------------------------------------------------------------

/**
 * La ficha trae lo único que el fixture no publica: la HORA y la cancha. El
 * cron la pide solo para los partidos de la ventana cercana — son ~2800 por
 * temporada y no entran en una corrida.
 */
export function parsePartidoDetalle(html: string, mid: number): PartidoParseado | null {
  const [info] = bloques(html, 'match-info');
  const [resultado] = bloques(html, 'match-results');
  if (!info || !resultado) return null;

  const equipos = bloques(resultado, 'team').map((t) => texto(t.replace(/<img[^>]*>/g, '')));
  const goles = campo(resultado, 'goals').match(/\d+/g) ?? [];

  return {
    mid,
    categoria: campoTitulado(info, 'category'),
    fechaHora: campo(info, 'datetime'),
    cancha: campoTitulado(info, 'court'),
    local: equipos[0] ?? '',
    visitante: equipos[1] ?? '',
    golesLocal: goles.length === 2 ? Number(goles[0]) : null,
    golesVisitante: goles.length === 2 ? Number(goles[1]) : null,
  };
}
