/**
 * Cliente de ahl.com.ar (el WordPress de la Asociación de Hockey del Litoral).
 *
 * A diferencia de fedhockeycba, acá la programación no cuelga de posts: los
 * Boletines Competencia se listan en una PÁGINA fija (/boletin-competencia/),
 * del más nuevo al más viejo. El ciclo del cron: pedir esa página por la API
 * REST (su `modified` cambia cuando suben un boletín), tomar los primeros
 * PDFs y parsearlos. Misma política de errores que el resto: una caída o una
 * forma desconocida NUNCA se degrada a "no había nada".
 */

export const AHL_BASE = 'https://ahl.com.ar';
export const PAUSA_MS = 400;
export const HTTP_FORMA_INESPERADA = -1;
const TIMEOUT_MS = 30_000;

export interface Resultado<T> {
  ok: boolean;
  status: number;
  data: T | null;
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

export interface PaginaBoletines {
  modified: string;
  /** URLs de PDF en el orden de la página: la AHL lista el más nuevo primero */
  pdfs: string[];
}

/** La página /boletin-competencia/ con sus links a PDF, vía la API REST. */
export async function fetchPaginaBoletinCompetencia(): Promise<Resultado<PaginaBoletines>> {
  const url = `${AHL_BASE}/wp-json/wp/v2/pages?slug=boletin-competencia&_fields=modified,content`;
  const { status, res } = await traer(url);
  if (!res || !res.ok) return { ok: false, status, data: null };

  let crudo: unknown;
  try {
    crudo = await res.json();
  } catch {
    return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  }
  const pagina = Array.isArray(crudo) ? (crudo[0] as { modified?: unknown; content?: { rendered?: unknown } } | undefined) : undefined;
  if (!pagina || typeof pagina.modified !== 'string') return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };

  const html = String(pagina.content?.rendered ?? '');
  const pdfs: string[] = [];
  const re = /href="([^"]+\.pdf)"/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (!pdfs.includes(m[1])) pdfs.push(m[1]);
  }
  if (!pdfs.length) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  return { ok: true, status, data: { modified: pagina.modified, pdfs } };
}

/** Un PDF del propio sitio; el magic number frena páginas de error con 200. */
export async function fetchPdf(url: string): Promise<Resultado<Uint8Array>> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  }
  if (host !== new URL(AHL_BASE).host) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };

  const { status, res } = await traer(url);
  if (!res || !res.ok) return { ok: false, status, data: null };
  const bytes = new Uint8Array(await res.arrayBuffer());
  const esPdf = bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (!esPdf) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  return { ok: true, status, data: bytes };
}
