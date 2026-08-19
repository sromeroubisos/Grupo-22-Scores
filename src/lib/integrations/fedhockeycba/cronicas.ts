/**
 * Resultados desde las crónicas de la federación.
 *
 * Los resultados de los torneos oficiales no salen en una tabla: salen en el
 * cuerpo de posts de WordPress, escritos en prosa con dos formas observadas:
 *
 *   "Jockey Club 2-1 a Tala RC"            → el primero anota el primer número
 *   "Tala RC 1 🆚 Jockey Club Córdoba 2"   → cada número pega a su equipo
 *
 * La prosa no delimita dónde empieza el nombre del equipo, así que acá no se
 * adivina con la regex: se toma una VENTANA de palabras alrededor del marcador
 * y se prueba contra el resolvedor de alias (del más largo al más corto). Un
 * resultado existe sólo cuando LOS DOS lados resuelven a un club conocido: esa
 * exigencia doble es el filtro contra falsos positivos ("Sub 14", fechas,
 * "3 fechas de suspensión").
 *
 * El módulo es puro: el resolvedor entra por parámetro (en el route es el mapa
 * de alias del torneo, así que la resolución ya trae el alcance correcto).
 */

export interface ResultadoDeCronica {
  /** lo que devolvió el resolvedor para cada lado (en G22, `clubs.id`) */
  clubA: string;
  clubB: string;
  golesA: number;
  golesB: number;
  /** el recorte de texto que originó el resultado, para el reporte del sync */
  texto: string;
  /**
   * Número de fecha cuando la fuente lo trae ESTRUCTURADO (estoeshockey).
   * Las crónicas en prosa no lo llenan; habilita crear el partido si falta.
   */
  fechaNro?: number;
}

const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ',
  laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
};

/** El HTML de `content.rendered` como texto plano, con las entidades resueltas. */
export function htmlATexto(html: string): string {
  return String(html ?? '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (_, n: string) => ENTIDADES[n] ?? ENTIDADES[n.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Hasta cuántas palabras puede tener el nombre de un equipo en la ventana. */
const VENTANA = 6;
/** Un marcador de hockey no pasa de esto; lo que pasa es otra cosa (un año, una fecha). */
const MAX_GOLES = 30;

type Resolver = (claveDeNombre: string) => string | null;

/** Prueba sufijos de la ventana (el nombre termina donde empieza el marcador). */
function resolverSufijo(palabras: string[], clave: (s: string) => string, resolver: Resolver): { id: string; usado: string } | null {
  const cola = palabras.slice(-VENTANA);
  for (let i = 0; i < cola.length; i++) {
    const usado = cola.slice(i).join(' ');
    const id = resolver(clave(usado));
    if (id) return { id, usado };
  }
  return null;
}

/** Prueba prefijos de la ventana (el nombre empieza justo después del conector). */
function resolverPrefijo(palabras: string[], clave: (s: string) => string, resolver: Resolver): { id: string; usado: string } | null {
  const frente = palabras.slice(0, VENTANA);
  for (let i = frente.length; i > 0; i--) {
    const usado = frente.slice(0, i).join(' ');
    const id = resolver(clave(usado));
    if (id) return { id, usado };
  }
  return null;
}

export function extraerResultados(
  texto: string,
  resolver: Resolver,
  clave: (s: string) => string,
): ResultadoDeCronica[] {
  const resultados: ResultadoDeCronica[] = [];
  const vistos = new Set<string>();
  const anotar = (r: ResultadoDeCronica) => {
    const k = [r.clubA, r.golesA, r.clubB, r.golesB].join('|');
    if (!vistos.has(k)) { vistos.add(k); resultados.push(r); }
  };

  // ── forma "X 2-1 a Y": el ganador primero, con su marcador ─────────────
  const conA = /(\d{1,2})\s*[-–]\s*(\d{1,2})\s+a\s+/g;
  for (let m = conA.exec(texto); m; m = conA.exec(texto)) {
    const golesA = Number(m[1]);
    const golesB = Number(m[2]);
    if (golesA > MAX_GOLES || golesB > MAX_GOLES) continue;
    const antes = texto.slice(0, m.index).trim().split(/\s+/);
    const despues = texto.slice(m.index + m[0].length).trim().split(/\s+/);
    const a = resolverSufijo(antes, clave, resolver);
    const b = resolverPrefijo(despues, clave, resolver);
    if (!a || !b || a.id === b.id) continue;
    anotar({ clubA: a.id, clubB: b.id, golesA, golesB, texto: `${a.usado} ${golesA}-${golesB} a ${b.usado}` });
  }

  // ── forma "X 1 🆚 Y 2": cada número pega a su equipo ───────────────────
  const conVs = /(\d{1,2})\s*(?:🆚|vs\.?|VS\.?)\s+/g;
  for (let m = conVs.exec(texto); m; m = conVs.exec(texto)) {
    const golesA = Number(m[1]);
    if (golesA > MAX_GOLES) continue;
    const antes = texto.slice(0, m.index).trim().split(/\s+/);
    const despues = texto.slice(m.index + m[0].length).trim().split(/\s+/);
    const a = resolverSufijo(antes, clave, resolver);
    if (!a) continue;
    // El nombre de B termina donde aparece SU marcador: se busca el número
    // que sigue dentro de la ventana y se resuelve lo que quedó en el medio.
    for (let corte = 1; corte <= Math.min(VENTANA + 1, despues.length); corte++) {
      const golesB = Number(despues[corte]);
      if (!/^\d{1,2}$/.test(despues[corte] ?? '') || golesB > MAX_GOLES) continue;
      const b = resolverPrefijo(despues.slice(0, corte), clave, resolver);
      if (!b || b.usado.split(/\s+/).length !== corte || a.id === b.id) continue;
      anotar({ clubA: a.id, clubB: b.id, golesA, golesB, texto: `${a.usado} ${golesA} vs ${b.usado} ${golesB}` });
      break;
    }
  }

  return resultados;
}
