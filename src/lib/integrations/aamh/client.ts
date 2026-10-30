/**
 * Cliente de aamh.com.ar (el WordPress de la Asociación Amateur Marplatense
 * de Hockey, tema propio con prefijo `gah-`).
 *
 * Todo lo que hace falta viene renderizado en el servidor: no hay que levantar
 * un navegador ni pegarle a ningún endpoint AJAX. Tres pedidos distintos:
 *
 *   /?gah-ty={año}                   el catálogo del año, en el menú de torneos
 *   /resultados/torneo/{tid}/{cid}/  posiciones + fixture + estadísticas
 *   /resultados/partido/{mid}/       hora real, cancha, formaciones
 *
 * El selector de año NO deja cookie: `?gah-ty=` se resuelve por pedido, así
 * que el catálogo de 2019 y el de 2026 se piden sin pisarse.
 *
 * Misma política de errores que el resto de los conectores: una caída o una
 * forma desconocida nunca se degrada a "no había nada". Si la respuesta llega
 * con 200 pero sin la marca del tema, sale `HTTP_FORMA_INESPERADA` y el que
 * llama decide — jamás una lista vacía que parezca una jornada sin partidos.
 */

export const AAMH_BASE = 'https://aamh.com.ar';
export const PAUSA_MS = 400;
export const HTTP_FORMA_INESPERADA = -1;
const TIMEOUT_MS = 30_000;

export interface Resultado<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

export const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function traerHtml(ruta: string): Promise<{ status: number; html: string | null }> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${AAMH_BASE}${ruta}`, {
      signal: control.signal,
      redirect: 'follow',
      headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; G22Scores)' },
    });
    if (!res.ok) return { status: res.status, html: null };
    return { status: res.status, html: await res.text() };
  } catch {
    return { status: 0, html: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * El menú de torneos del año pedido. La marca `tournaments-menu-container` es
 * la guarda: si el tema cambia o el sitio contesta una página de error con
 * 200, no hay menú que parsear y eso NO es un año sin torneos.
 */
export async function fetchCatalogoAnio(anio: number): Promise<Resultado<string>> {
  const { status, html } = await traerHtml(`/?gah-ty=${anio}`);
  if (html === null) return { ok: false, status, data: null };
  if (!html.includes('tournaments-menu-container')) {
    return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  }
  return { ok: true, status, data: html };
}

/**
 * La página de un torneo. La guarda es `single-tournament`: sin ella no hay
 * ni tabla ni fixture, y un torneo dado de baja tiene que verse como error y
 * no como un torneo que se quedó sin partidos.
 */
export async function fetchTorneo(tid: number, cid: number): Promise<Resultado<string>> {
  const { status, html } = await traerHtml(`/resultados/torneo/${tid}/${cid}/`);
  if (html === null) return { ok: false, status, data: null };
  if (!html.includes('single-tournament')) {
    return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  }
  return { ok: true, status, data: html };
}

/** La ficha de un partido: es la única página que trae la HORA y la cancha. */
export async function fetchPartido(mid: number): Promise<Resultado<string>> {
  const { status, html } = await traerHtml(`/resultados/partido/${mid}/`);
  if (html === null) return { ok: false, status, data: null };
  if (!html.includes('single-match')) {
    return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  }
  return { ok: true, status, data: html };
}
