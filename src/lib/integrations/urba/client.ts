import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Cliente de la API de URBA.
 *
 * Reglas de consumo, que no son de estilo sino de no hacer daño:
 *  · secuencial, 250 ms entre pedidos
 *  · un 5xx es respuesta FINAL, no un error transitorio: no se reintenta
 *  · cada /championship/{id} se cachea en disco (gzip: el histórico completo son
 *    cientos de MB sin comprimir, 3,6 MB comprimido)
 *  · la lista de /championships/{año} NO se cachea NUNCA: 2026 pasó de 99 a 134
 *    torneos en el transcurso de este trabajo
 */

const BASE = 'https://api.urba.org.ar';
const PAUSA_MS = 250;

let ultimoPedido = 0;
async function esperarTurno() {
  const desde = Date.now() - ultimoPedido;
  if (desde < PAUSA_MS) await new Promise((r) => setTimeout(r, PAUSA_MS - desde));
  ultimoPedido = Date.now();
}

export interface UrbaFetchResult<T> {
  ok: boolean;
  data: T | null;
  /** 0 = fallo de red (sí se reintenta); >=400 = respuesta del servidor (no) */
  status: number;
  desdeCache: boolean;
}

async function pedir(url: string, reintentosDeRed = 2): Promise<{ ok: boolean; status: number; body: string | null }> {
  for (let intento = 0; ; intento++) {
    await esperarTurno();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      clearTimeout(timer);
      // 500 con id inexistente es la forma que tiene URBA de decir 404. Es final.
      if (!res.ok) return { ok: false, status: res.status, body: null };
      return { ok: true, status: res.status, body: await res.text() };
    } catch {
      if (intento >= reintentosDeRed) return { ok: false, status: 0, body: null };
      await new Promise((r) => setTimeout(r, 2000 * (intento + 1)));
    }
  }
}

export interface UrbaTeam {
  id: number;
  club_id: number | null;
  name: string;
}

export interface UrbaMatch {
  id: number;
  round_id: number;
  playdate: string | null;
  local_team_id: number | null;
  visit_team_id: number | null;
  local_team_score: number | null;
  visit_team_score: number | null;
  fulfilled: boolean;
  suspended: boolean;
}

export interface UrbaRound {
  id: number;
  name: string | null;
  playdate: string | null;
  matches: UrbaMatch[];
}

export interface UrbaChampionship {
  id: number;
  name: string;
  teams: UrbaTeam[];
  rounds: UrbaRound[];
}

/**
 * Un torneo completo. `championship` viene como ARRAY DE UN ELEMENTO — no es un
 * objeto, y confundirlo devuelve undefined en silencio.
 */
export async function fetchChampionship(
  urbaId: number | string,
  opciones: { cacheDir?: string } = {},
): Promise<UrbaFetchResult<UrbaChampionship>> {
  const cacheDir = opciones.cacheDir;
  const archivo = cacheDir ? path.join(cacheDir, `championship-${urbaId}.json.gz`) : null;

  if (archivo && fs.existsSync(archivo)) {
    try {
      const crudo = zlib.gunzipSync(fs.readFileSync(archivo)).toString('utf8');
      const ch = JSON.parse(crudo)?.championship?.[0] ?? null;
      if (ch) return { ok: true, data: ch as UrbaChampionship, status: 200, desdeCache: true };
    } catch {
      // Caché corrupta: se vuelve a pedir en vez de romper.
    }
  }

  const r = await pedir(`${BASE}/api/championship/${urbaId}`);
  if (!r.ok || !r.body) return { ok: false, data: null, status: r.status, desdeCache: false };

  if (archivo && cacheDir) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(archivo, zlib.gzipSync(Buffer.from(r.body, 'utf8')));
  }

  const ch = JSON.parse(r.body)?.championship?.[0] ?? null;
  return { ok: Boolean(ch), data: ch as UrbaChampionship | null, status: r.status, desdeCache: false };
}

export interface UrbaChampionshipListItem {
  id: number;
  name: string;
  season_id: number;
  closed: boolean;
}

/**
 * La lista de torneos de un año. NO se cachea nunca, a propósito: es la única
 * forma de enterarse de un torneo nuevo, y 2026 pasó de 93 a 99 a 134 en el
 * transcurso de este trabajo.
 */
export async function fetchChampionshipList(
  anio: number,
): Promise<UrbaFetchResult<UrbaChampionshipListItem[]>> {
  const r = await pedir(`${BASE}/api/championships/${anio}`);
  if (!r.ok || !r.body) return { ok: false, data: null, status: r.status, desdeCache: false };
  const lista = JSON.parse(r.body)?.championships ?? null;
  if (!Array.isArray(lista)) return { ok: false, data: null, status: r.status, desdeCache: false };
  return { ok: true, data: lista as UrbaChampionshipListItem[], status: r.status, desdeCache: false };
}

/** Tabla de posiciones publicada por URBA. Se usa para VERIFICAR, nunca para copiar. */
export async function fetchPositions(urbaId: number | string): Promise<UrbaFetchResult<any[]>> {
  const r = await pedir(`${BASE}/api/positions/${urbaId}`);
  if (!r.ok || !r.body) return { ok: false, data: null, status: r.status, desdeCache: false };
  return { ok: true, data: JSON.parse(r.body)?.positions ?? [], status: r.status, desdeCache: false };
}
