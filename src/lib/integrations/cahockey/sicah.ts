/**
 * SICAH (sicah.cahockey.org.ar): el sistema donde la Confederación Argentina de
 * Hockey carga los resultados de sus torneos.
 *
 * Son dos pedidos por torneo, y ninguno se puede saltear:
 *
 *  1. `POST cahockey.org.ar/updateTorneo` con `id=<n>` devuelve el fragmento
 *     del torneo, que trae un `<iframe>` a SICAH. Sin el header
 *     `X-Requested-With` contesta 200 con la página ENTERA en vez del
 *     fragmento — el scraper de Python ya se lo comió una vez.
 *  2. La página de SICAH viene en **iso-8859-1**. Decodificarla como UTF-8
 *     rompe cada tilde y con ella la clave de cada equipo ("Federaci�n").
 *
 * El parser es un puerto de `parsear_sicah` de `scripts/cahockey/scrape_cahockey.py`
 * y se prueba contra un torneo real ya jugado (`__fixtures__/sicah-1572.html`).
 * Es puro: recibe el HTML y devuelve datos, sin red ni base.
 */

const BASE = 'https://www.cahockey.org.ar';
const USER_AGENT = 'Mozilla/5.0 (compatible; G22Scores/1.0)';

export type LadoSicah = {
  equipo: string;
  goles: number | null;
  /** definición por penales, cuando la hubo: "G. Y ESGRIMA 6 (4)" */
  penales: number | null;
};

export type PartidoSicah = {
  /** "Partido 13" → "13". Es la identidad del partido dentro del torneo. */
  nro: string;
  /** "Zona A", "Cuadrangular", "Semifinales", "Finales" */
  etapa: string | null;
  /** día de la semana con el que SICAH agrupa la jornada: "Jueves" */
  dia: string | null;
  hora: string | null;
  cancha: string | null;
  local: LadoSicah | null;
  visitante: LadoSicah | null;
};

export type TorneoSicah = {
  nombre: string | null;
  desde: string | null;
  hasta: string | null;
  partidos: PartidoSicah[];
};

export type ResultadoHttp<T> = { ok: true; data: T; status: number } | { ok: false; data: null; status: number };

/** Del fragmento del torneo sale la URL del iframe de SICAH. */
export async function fetchSicahUrl(torneoId: string): Promise<ResultadoHttp<string>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/updateTorneo`, {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${BASE}/torneos-selecciones`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': USER_AGENT,
      },
      body: `id=${encodeURIComponent(torneoId)}`,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, data: null, status: 0 };
  }
  if (!res.ok) return { ok: false, data: null, status: res.status };
  const html = await res.text();
  const src = html.match(/<iframe[^>]+src="([^"]*sicah[^"]*)"/i)?.[1];
  // 200 sin iframe es la página entera: el sitio cambió o nos tomó por navegador.
  if (!src) return { ok: false, data: null, status: 200 };
  return { ok: true, data: src.replace(/&amp;/g, '&'), status: 200 };
}

/** La página de SICAH, decodificada con el charset que declara (iso-8859-1). */
export async function fetchSicahHtml(url: string): Promise<ResultadoHttp<string>> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, cache: 'no-store' });
  } catch {
    return { ok: false, data: null, status: 0 };
  }
  if (!res.ok) return { ok: false, data: null, status: res.status };
  const bytes = await res.arrayBuffer();
  const charset = res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ?? 'iso-8859-1';
  let html: string;
  try {
    html = new TextDecoder(charset).decode(bytes);
  } catch {
    html = new TextDecoder('iso-8859-1').decode(bytes);
  }
  return { ok: true, data: html, status: res.status };
}

// ---------------------------------------------------------------- parser

const ENTIDADES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&deg;': '°',
  '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú', '&ntilde;': 'ñ',
  '&Aacute;': 'Á', '&Eacute;': 'É', '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Uacute;': 'Ú', '&Ntilde;': 'Ñ',
};

function limpiar(texto: string): string {
  return texto
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z]+;|&#\d+;/g, (e) => ENTIDADES[e] ?? (e.startsWith('&#') ? String.fromCharCode(Number(e.slice(2, -1))) : e))
    .replace(/\s+/g, ' ')
    .trim();
}

function fechaIso(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Miercoles', 'Jueves', 'Viernes', 'Sábado', 'Sabado', 'Domingo'];
const RE_DIA_TITULO = new RegExp(`class="titulotabla"[^>]*>\\s*(${DIAS.join('|')})\\s*<`, 'g');

/**
 * "LOS TORDOS 5", "G. Y ESGRIMA 6 (4)" o "Federación Cordobesa -".
 *
 * El paréntesis es la definición por penales: sin contemplarlo el marcador se
 * queda pegado al nombre y nace un club llamado "Jockey Club 2 (3)". El guión
 * es un partido sin jugar.
 */
export function parsearLado(texto: string): LadoSicah | null {
  const limpio = limpiar(texto);
  if (!limpio) return null;
  const conGoles = limpio.match(/^(.+?)\s+(\d+)(?:\s*\((\d+)\))?$/);
  if (conGoles) {
    return {
      equipo: conGoles[1].trim(),
      goles: Number(conGoles[2]),
      penales: conGoles[3] ? Number(conGoles[3]) : null,
    };
  }
  const nombre = limpio.replace(/\s*[-–—]\s*$/, '').trim();
  return nombre ? { equipo: nombre, goles: null, penales: null } : null;
}

export function parsearSicah(html: string): TorneoSicah {
  const datos: TorneoSicah = { nombre: null, desde: null, hasta: null, partidos: [] };

  const cab = html.match(/Torneo ([^<]+)<br><span class="titulo_3">Desde el (\d{2}\/\d{2}\/\d{4}) hasta el (\d{2}\/\d{2}\/\d{4})/);
  if (cab) {
    datos.nombre = limpiar(cab[1]);
    datos.desde = fechaIso(cab[2]);
    datos.hasta = fechaIso(cab[3]);
  }

  // El titulotabla con el día precede a los modales de esa jornada: el día de
  // un partido es el último título que aparece antes de su modal.
  const diasPos: { pos: number; dia: string }[] = [];
  for (const m of html.matchAll(RE_DIA_TITULO)) diasPos.push({ pos: m.index ?? 0, dia: m[1] });
  const diaDe = (pos: number): string | null => {
    let actual: string | null = null;
    for (const d of diasPos) {
      if (d.pos < pos) actual = d.dia;
      else break;
    }
    return actual;
  };

  const RE_MODAL = /<div id="(basic-modal-content\d+)">([\s\S]*?)(?=<div id="basic-modal-content\d+">|<!-- modal content -->|$)/g;
  for (const m of html.matchAll(RE_MODAL)) {
    const pos = m.index ?? 0;
    const cuerpo = m[2];
    const encabezado = limpiar(cuerpo.match(/<h2>([\s\S]*?)<\/h2>/)?.[1]?.replace(/<br\s*\/?>/gi, ' | ') ?? '');
    const nro = encabezado.match(/Partido\s+(\d+)/)?.[1];
    if (!nro) continue;
    // "… | Partido 13 | Cuadrangular | 08:30hs. | Cancha #1 …": la etapa es el
    // tramo que sigue al número de partido.
    const etapa = encabezado.match(/Partido\s+\d+\s*\|\s*([^|]+?)\s*\|/)?.[1] ?? null;
    const hora = encabezado.match(/(\d{1,2}:\d{2})\s*hs/)?.[1] ?? null;
    const cancha = encabezado.match(/Cancha\s*(.+)$/)?.[1]?.trim() ?? null;

    const lados: LadoSicah[] = [];
    for (const h3 of cuerpo.matchAll(/<h3>([\s\S]*?)<\/h3>/g)) {
      const lado = parsearLado(h3[1]);
      if (lado) lados.push(lado);
    }

    datos.partidos.push({
      nro,
      etapa: etapa && /\S/.test(etapa) ? etapa : null,
      dia: diaDe(pos),
      hora: hora ? hora.padStart(5, '0') : null,
      cancha,
      local: lados[0] ?? null,
      visitante: lados[1] ?? null,
    });
  }

  return datos;
}

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

function claveDeDia(dia: string): string {
  return dia.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * SICAH agrupa los partidos por día de la semana ("Jueves") sin decir la fecha.
 * La fecha real sale del rango del torneo: como duran tres o cuatro días, cada
 * nombre de día cae una sola vez. Si no cae en el rango se devuelve null y el
 * partido se omite — una fecha inventada ensucia el fixture peor que la ausencia.
 */
export function fechaDelDia(dia: string | null, desde: string | null, hasta: string | null): string | null {
  if (!dia || !desde) return null;
  const objetivo = DIAS_SEMANA[claveDeDia(dia)];
  if (objetivo === undefined) return null;
  const inicio = new Date(`${desde}T12:00:00Z`);
  const fin = hasta ? new Date(`${hasta}T12:00:00Z`) : new Date(inicio.getTime() + 6 * 864e5);
  for (let d = new Date(inicio); d <= fin; d = new Date(d.getTime() + 864e5)) {
    if (d.getUTCDay() === objetivo) return d.toISOString().slice(0, 10);
  }
  return null;
}

/** "Zona A" es fase de grupos; todo lo demás (Cuadrangular, Semifinales, Finales) es llave. */
export function esEtapaDeZona(etapa: string | null): boolean {
  return /^zona\b/i.test(etapa ?? '');
}
