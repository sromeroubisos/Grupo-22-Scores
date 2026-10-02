/**
 * Cliente de SporTI (plataforma.sporti.com.br), el sistema de competiciones de
 * la CBRu y de sus federaciones. Sin login y sin cookies.
 *
 * brasilrugby.com.br está detrás de un desafío de Cloudflare, pero esa página
 * solo embebe SporTI en un iframe; SporTI contesta directo a un fetch común
 * (medido el 2026-10-02, también las súmulas).
 *
 * Dos rutas son JSON, las del catálogo:
 *
 *   /api/campeonatos/obtercampeonatosporidorganizacaoeano?idOrganizacao=185&idLiga=&ano=2026
 *   /api/campeonatos/obterfasescampeonatofiltro?idCampeonato=3542
 *
 * Contestan la lista de un <select> (`{ Text, Value }`, con un primer
 * "< Selecione >" vacío). Todo lo demás es HTML y lo lee `parse.ts`.
 *
 * Misma política de errores que el resto de los conectores de la casa: una
 * caída o una página con otra forma NUNCA se degrada a "no había nada". Una
 * vista de partidos sin una sola tarjeta sale como `HTTP_FORMA_INESPERADA`
 * —una fase nace con el fixture cargado—, salvo que el que llama avise que la
 * fase puede estar vacía (una final con los equipos sin definir).
 */
import { parsePartidos, parseSumula, parseTabla, type FilaTablaSporti, type PartidoSporti, type SumulaSporti } from './parse.ts';
import { SPORTI_ORGANIZACAO_CBRU } from './nombres.ts';

export const SPORTI_WEB = 'https://plataforma.sporti.com.br';
const API = `${SPORTI_WEB}/api/campeonatos`;
export const PAUSA_MS = 250;
export const HTTP_FORMA_INESPERADA = -1;
const TIMEOUT_MS = 20_000;
const HEADERS = { 'user-agent': 'Mozilla/5.0 (compatible; G22Scores)', accept: 'text/html,application/json' };

export interface Resultado<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

export const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pedirTexto(url: string): Promise<Resultado<string>> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: control.signal, headers: HEADERS, cache: 'no-store' });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: res.status, data: await res.text() };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

const urlDeVista = (campeonato: string, fase: string, vista: 1 | 3) =>
  `${API}/obterdadosetapacampeonato?idCampeonato=${encodeURIComponent(campeonato)}&etapa=${encodeURIComponent(`${fase}-${vista}`)}`;

/** Las tarjetas de partido de una fase. */
export async function fetchPartidos(campeonato: string, fase: string, opciones: { puedeEstarVacia?: boolean } = {}): Promise<Resultado<PartidoSporti[]>> {
  const r = await pedirTexto(urlDeVista(campeonato, fase, 1));
  if (!r.ok || r.data === null) return { ok: false, status: r.status, data: null };
  const partidos = parsePartidos(r.data);
  if (!partidos.length && !opciones.puedeEstarVacia) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  return { ok: true, status: r.status, data: partidos };
}

/** La tabla oficial de una fase de grupos. */
export async function fetchTabla(campeonato: string, fase: string): Promise<Resultado<FilaTablaSporti[]>> {
  const r = await pedirTexto(urlDeVista(campeonato, fase, 3));
  if (!r.ok || r.data === null) return { ok: false, status: r.status, data: null };
  const filas = parseTabla(r.data);
  if (!filas.length) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  return { ok: true, status: r.status, data: filas };
}

/**
 * La planilla de un partido. El slug del campeonato en la URL es decorativo
 * (SporTI contesta la misma súmula con cualquiera), así que no hace falta
 * guardarlo.
 */
export async function fetchSumula(sumulaId: string): Promise<Resultado<SumulaSporti>> {
  const r = await pedirTexto(`${SPORTI_WEB}/CBRU/campeonatos/c/sumula/${encodeURIComponent(sumulaId)}`);
  if (!r.ok || r.data === null) return { ok: false, status: r.status, data: null };
  const s = parseSumula(r.data);
  if (!s.local || !s.visitante) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  return { ok: true, status: r.status, data: s };
}

export interface OpcionSporti {
  /** `1367-3`: id de fase y tipo (1 = rodadas o llaves, 3 = grupos). */
  valor: string;
  texto: string;
}

async function pedirOpciones(url: string): Promise<Resultado<OpcionSporti[]>> {
  const r = await pedirTexto(url);
  if (!r.ok || r.data === null) return { ok: false, status: r.status, data: null };
  try {
    const lista = JSON.parse(r.data) as { Text?: string; Value?: string }[];
    if (!Array.isArray(lista)) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
    return {
      ok: true,
      status: r.status,
      data: lista.filter((o) => o?.Value).map((o) => ({ valor: String(o.Value), texto: String(o.Text ?? '').trim() })),
    };
  } catch {
    return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  }
}

/** Las fases de un campeonato, como las publica el selector. */
export const fetchFases = (campeonato: string) =>
  pedirOpciones(`${API}/obterfasescampeonatofiltro?idCampeonato=${encodeURIComponent(campeonato)}`);

/** Los campeonatos de un año; `liga` vacía = los de la propia CBRu. */
export const fetchCampeonatos = (ano: number, liga = '') =>
  pedirOpciones(`${API}/obtercampeonatosporidorganizacaoeano?idOrganizacao=${SPORTI_ORGANIZACAO_CBRU}&idLiga=${encodeURIComponent(liga)}&ano=${ano}`);

/** `1367-3` → fase `1367`, tipo `3`. */
export function partirFase(valor: string): { fase: string; tipo: string } | null {
  const m = /^(\d+)-(\d+)$/.exec(valor.trim());
  return m ? { fase: m[1], tipo: m[2] } : null;
}
