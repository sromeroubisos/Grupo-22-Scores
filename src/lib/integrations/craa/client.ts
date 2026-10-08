/**
 * Cliente de las planillas de la CRAA (CSV público de Google Sheets). Sin
 * login: son las mismas URL que baja craa.rugby desde el navegador.
 *
 * Misma política de errores que el resto de los conectores de la casa: una
 * caída o una planilla con otra cabecera NUNCA se degrada a "no había nada".
 * Google contesta 200 con una página HTML de login cuando una planilla deja de
 * ser pública: eso sale como `HTTP_FORMA_INESPERADA`, no como cero filas.
 */
import { parseFixture, parseTabla, type FilaCraa, type FilaTablaCraa } from './parse.ts';

export const HTTP_FORMA_INESPERADA = -1;
const TIMEOUT_MS = 20_000;
const HEADERS = { 'user-agent': 'Mozilla/5.0 (compatible; G22Scores)', accept: 'text/csv,text/plain' };

export interface Resultado<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

/**
 * Las planillas publicadas redirigen a `googleusercontent.com`, que suelta un
 * 500 de vez en cuando (medido el 2026-10-08: uno en diez pedidos seguidos, y
 * el siguiente contestó bien). Un 5xx o una caída de red se reintenta una vez.
 */
async function pedirCsv(url: string): Promise<Resultado<string>> {
  const r = await pedirCsvUnaVez(url);
  if (r.ok || (r.status !== 0 && r.status < 500)) return r;
  await new Promise((listo) => setTimeout(listo, 1_500));
  return pedirCsvUnaVez(url);
}

async function pedirCsvUnaVez(url: string): Promise<Resultado<string>> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: control.signal, headers: HEADERS, cache: 'no-store', redirect: 'follow' });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    const tipo = res.headers.get('content-type') ?? '';
    if (tipo.includes('text/html')) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
    return { ok: true, status: res.status, data: await res.text() };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Las filas de una pestaña de fixture. */
export async function fetchPestana(url: string): Promise<Resultado<FilaCraa[]>> {
  const r = await pedirCsv(url);
  if (!r.ok || r.data === null) return { ok: false, status: r.status, data: null };
  const filas = parseFixture(r.data);
  return filas ? { ok: true, status: r.status, data: filas } : { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
}

/** La tabla oficial de una división (hoy solo la D1A la publica). */
export async function fetchTabla(url: string): Promise<Resultado<FilaTablaCraa[]>> {
  const r = await pedirCsv(url);
  if (!r.ok || r.data === null) return { ok: false, status: r.status, data: null };
  const filas = parseTabla(r.data);
  return filas && filas.length ? { ok: true, status: r.status, data: filas } : { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
}
