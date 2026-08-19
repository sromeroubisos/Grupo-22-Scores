/**
 * Cliente de fedhockeycba.com.ar (el WordPress de la Federación Cordobesa).
 *
 * No hay API de datos: hay la API REST estándar de WordPress, que alcanza para
 * lo único que el conector necesita de la red — saber QUÉ cambió (posts con su
 * `modified`) y traer el contenido (HTML de crónicas, PDFs de fixtures).
 *
 * Política calcada de URBA y de la lección de FlashScore: una caída o una
 * respuesta con otra forma NUNCA se degrada a "no había nada". `ok: false`
 * viaja hasta la respuesta del cron con su estado, y `HTTP_FORMA_INESPERADA`
 * distingue "contestó algo que no entiendo" (se arregla tocando el conector)
 * de "está caído" (se arregla esperando).
 */

export const FEDHOCKEYCBA_BASE = 'https://fedhockeycba.com.ar';
/** Pausa entre requests: es la web de una federación amateur, no un feed. */
export const PAUSA_MS = 400;
export const HTTP_FORMA_INESPERADA = -1;
const TIMEOUT_MS = 30_000;

export interface Resultado<T> {
  ok: boolean;
  /** HTTP real, 0 para fallo de red, HTTP_FORMA_INESPERADA para payload irreconocible */
  status: number;
  data: T | null;
}

export interface WpPost {
  id: number;
  titulo: string;
  link: string;
  /** ISO local del sitio, p. ej. "2026-08-18T20:09:26" */
  modified: string;
  categorias: number[];
  contenidoHtml: string;
}

export const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function traer(url: string): Promise<{ status: number; res: Response | null }> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: control.signal, headers: { accept: '*/*' } });
    return { status: res.status, res };
  } catch {
    return { status: 0, res: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Los últimos posts por fecha de MODIFICACIÓN, con el contenido incluido.
 * 40 alcanza de sobra: la federación publica 4-6 posts por semana.
 */
export async function fetchPostsRecientes(): Promise<Resultado<WpPost[]>> {
  const url = `${FEDHOCKEYCBA_BASE}/wp-json/wp/v2/posts?per_page=40&orderby=modified&order=desc&_fields=id,title,link,modified,categories,content`;
  const { status, res } = await traer(url);
  if (!res || !res.ok) return { ok: false, status, data: null };

  let crudo: unknown;
  try {
    crudo = await res.json();
  } catch {
    return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  }
  if (!Array.isArray(crudo)) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };

  const posts: WpPost[] = [];
  for (const p of crudo) {
    const fila = p as { id?: unknown; title?: { rendered?: unknown }; link?: unknown; modified?: unknown; categories?: unknown; content?: { rendered?: unknown } };
    if (typeof fila.id !== 'number' || typeof fila.modified !== 'string') {
      return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
    }
    posts.push({
      id: fila.id,
      titulo: String(fila.title?.rendered ?? ''),
      link: String(fila.link ?? ''),
      modified: fila.modified,
      categorias: Array.isArray(fila.categories) ? (fila.categories as number[]) : [],
      contenidoHtml: String(fila.content?.rendered ?? ''),
    });
  }
  return { ok: true, status, data: posts };
}

/** Un PDF del propio sitio (los fixtures viven en wp-content/uploads). */
export async function fetchPdf(url: string): Promise<Resultado<Uint8Array>> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  }
  if (host !== new URL(FEDHOCKEYCBA_BASE).host) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };

  const { status, res } = await traer(url);
  if (!res || !res.ok) return { ok: false, status, data: null };
  const bytes = new Uint8Array(await res.arrayBuffer());
  // El magic number de PDF: una página de error con status 200 no pasa.
  const esPdf = bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (!esPdf) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  return { ok: true, status, data: bytes };
}

/** Todos los links a PDF dentro del HTML de un post ("cliquear para acceder"). */
export function pdfsDelPost(contenidoHtml: string): string[] {
  const urls: string[] = [];
  const re = /href="([^"]+\.pdf)"/gi;
  for (let m = re.exec(String(contenidoHtml ?? '')); m; m = re.exec(String(contenidoHtml ?? ''))) {
    if (!urls.includes(m[1])) urls.push(m[1]);
  }
  return urls;
}

/**
 * Los PDFs de FIXTURE de un post. El fixture semanal NO viaja en un post
 * propio: viaja adentro del boletín ("BOLETÍN Nº 27" adjunta
 * FIXTURE-No-27-2026.pdf junto al boletín y otros anexos), así que el filtro
 * es por el nombre del archivo, no por el título del post.
 */
export function pdfsDeFixture(contenidoHtml: string): string[] {
  return pdfsDelPost(contenidoHtml).filter((u) => /fixture/i.test(u.split('/').pop() ?? ''));
}
