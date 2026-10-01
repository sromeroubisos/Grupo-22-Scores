/**
 * Cliente de iSquad, el sistema de resultados de la Real Federación Española
 * de Rugby (resultadosrugby.isquad.es). Sin login y sin cookies.
 *
 * Una sola ruta es JSON, el árbol de campeonatos de una temporada:
 *
 *   POST rugby.isquad.es/json/api/call.php/resultados/campeonato/tree?token=…
 *        ambitos=1&seleccion=0&id_superficie=1&id_temporada=2627
 *
 * El `token` viaja en claro en el HTML de cualquier página del sitio
 * (`let token = "…"`) y la API contesta lo mismo a cualquiera que lo mande: es
 * un parámetro del front, no una credencial nuestra. Si un día lo cambian, el
 * árbol contesta otra cosa y sale `HTTP_FORMA_INESPERADA` — el sync de
 * resultados no lo usa, solo el chequeo de fases nuevas.
 *
 * Todo lo demás es HTML que arma el servidor y lee `parse.ts`.
 *
 * Misma política de errores que el resto de los conectores de la casa: una
 * caída o una página con otra forma NUNCA se degrada a "no había nada". Una
 * página de resultados sin un solo partido sale como `HTTP_FORMA_INESPERADA`,
 * porque un grupo de iSquad nace con el fixture entero cargado.
 */
import { parseActa, parseClasificacion, parseResultados, type ActaIsquad, type FilaTablaIsquad, type PartidoIsquad } from './parse.ts';

export const ISQUAD_WEB = 'https://resultadosrugby.isquad.es';
const ISQUAD_API = 'https://rugby.isquad.es/json/api/call.php';
const TOKEN_PUBLICO = '0637d0dcc2655d3a804f66da887a8ce2';
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

async function pedirTexto(url: string, init?: RequestInit): Promise<Resultado<string>> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: control.signal, headers: { ...HEADERS, ...(init?.headers ?? {}) }, cache: 'no-store' });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: res.status, data: await res.text() };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

const urlDeGrupo = (pagina: string, grupoId: string) =>
  `${ISQUAD_WEB}/${pagina}?seleccion=0&id=${encodeURIComponent(grupoId)}&id_ambito=1&id_territorial=9999&id_superficie=1`;

/** Todas las jornadas de un grupo, con marcadores. */
export async function fetchResultados(grupoId: string): Promise<Resultado<PartidoIsquad[]>> {
  const r = await pedirTexto(urlDeGrupo('resultados_completos.php', grupoId));
  if (!r.ok || r.data === null) return { ok: false, status: r.status, data: null };
  const partidos = parseResultados(r.data);
  if (!partidos.length) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  return { ok: true, status: r.status, data: partidos };
}

/** La tabla oficial de un grupo. */
export async function fetchClasificacion(grupoId: string): Promise<Resultado<FilaTablaIsquad[]>> {
  const r = await pedirTexto(urlDeGrupo('clasificacion.php', grupoId));
  if (!r.ok || r.data === null) return { ok: false, status: r.status, data: null };
  const filas = parseClasificacion(r.data);
  if (!filas.length) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  return { ok: true, status: r.status, data: filas };
}

/** La cronología de un partido. Un acta sin eventos es válida: el que llama decide. */
export async function fetchActa(partidoId: string): Promise<Resultado<ActaIsquad>> {
  const r = await pedirTexto(`${ISQUAD_WEB}/acta.php?id_partido=${encodeURIComponent(partidoId)}`);
  if (!r.ok || r.data === null) return { ok: false, status: r.status, data: null };
  const acta = parseActa(r.data);
  if (!acta.local || !acta.visitante) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  return { ok: true, status: r.status, data: acta };
}

export interface GrupoDelArbol {
  /** El id que iSquad llama "torneo": el de `resultados_completos.php?id=`. */
  id: number;
  grupo: string;
  nombre_fase: string;
  inscritos: number;
  id_campeonato: number;
}

export interface CampeonatoDelArbol {
  id: number;
  nombre: string;
  competiciones: { id: number; nombre: string; sexo: string; nombre_edad: string; torneos: GrupoDelArbol[] }[];
}

/** El catálogo de una temporada (`2627` = 2026/27): campeonatos → fases → grupos. */
export async function fetchArbol(temporada: string): Promise<Resultado<CampeonatoDelArbol[]>> {
  const cuerpo = new URLSearchParams({ ambitos: '1', seleccion: '0', id_superficie: '1', id_temporada: temporada });
  const r = await pedirTexto(`${ISQUAD_API}/resultados/campeonato/tree?token=${TOKEN_PUBLICO}`, {
    method: 'POST',
    body: cuerpo.toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  if (!r.ok || r.data === null) return { ok: false, status: r.status, data: null };
  try {
    const arbol = JSON.parse(r.data) as CampeonatoDelArbol[];
    if (!Array.isArray(arbol) || !arbol.every((c) => Array.isArray(c?.competiciones))) {
      return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
    }
    return { ok: true, status: r.status, data: arbol };
  } catch {
    return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  }
}

/** Los grupos de un campeonato, aplanados. */
export function gruposDe(arbol: CampeonatoDelArbol[], campeonato: string): GrupoDelArbol[] {
  const c = arbol.find((x) => String(x.id) === campeonato);
  return c ? c.competiciones.flatMap((k) => k.torneos ?? []) : [];
}
