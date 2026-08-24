/**
 * Cliente mínimo de rugbyarchive.net.
 *
 * El sitio es una SPA de Angular; el HTML llega vacío y los datos salen de una
 * API JSON pública en `/api/` (nombres en italiano: `stagionicompetizione` =
 * temporadas de una competición). No hace falta scrapear HTML.
 *
 * Mismo contrato que el cliente de URBA: caché en disco primero, pausa entre
 * requests reales, y una respuesta no-ok es una respuesta final (no se
 * reintenta acá; el script decide).
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://www.rugbyarchive.net/api';
const PAUSA_MS = 400;

let ultimaLlamada = 0;

async function pausaCortesia() {
  const desde = Date.now() - ultimaLlamada;
  if (desde < PAUSA_MS) await new Promise((r) => setTimeout(r, PAUSA_MS - desde));
  ultimaLlamada = Date.now();
}

export interface FetchResult<T> {
  ok: boolean;
  data: T | null;
  fuente: 'cache' | 'red';
  error?: string;
}

async function fetchRa<T>(ruta: string, cacheFile: string | null): Promise<FetchResult<T>> {
  if (cacheFile && fs.existsSync(cacheFile)) {
    try {
      const raw = fs.readFileSync(cacheFile, 'utf8');
      if (raw.trim()) return { ok: true, data: JSON.parse(raw) as T, fuente: 'cache' };
    } catch {
      // Caché corrupta: se sigue a la red y se reescribe.
    }
  }

  await pausaCortesia();
  const url = `${BASE}/${ruta}?cultura=en`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, data: null, fuente: 'red', error: `HTTP ${res.status}` };
    const texto = await res.text();
    if (!texto.trim() || texto.trimStart().startsWith('<')) {
      // La SPA devuelve su index.html para rutas que la API no reconoce.
      return { ok: false, data: null, fuente: 'red', error: 'respuesta vacía o HTML' };
    }
    if (cacheFile) {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, texto, 'utf8');
    }
    return { ok: true, data: JSON.parse(texto) as T, fuente: 'red' };
  } catch (e) {
    return { ok: false, data: null, fuente: 'red', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Temporada de una competición: `/api/stagionicompetizione/{comp}/stagione/{año}/`.
 * Con `cacheDir`, el archivo `{comp}-{año}.json` manda: si existe no se toca la red.
 */
export async function fetchStagioneCompetizione<T = unknown>(
  compId: number,
  stagione: string,
  opts: { cacheDir?: string } = {},
): Promise<FetchResult<T>> {
  return fetchRa<T>(
    `stagionicompetizione/${compId}/stagione/${encodeURIComponent(stagione)}/`,
    opts.cacheDir ? path.join(opts.cacheDir, `${compId}-${stagione}.json`) : null,
  );
}

/**
 * Ficha de un equipo: `/api/squadra/{id}/`. Trae nombre, escudo (`urlBadge`),
 * últimas/próximas fechas, el palmarés agregado (`alboDOro`) y la historia por
 * temporada (`stagioniSquadra`, HTML con "Winner in ..."/"Second in ...").
 * La ficha cambia seguido (cada partido la mueve), así que acá NO se cachea
 * por omisión: pasá cacheDir solo para reintentos dentro de una misma corrida.
 */
export async function fetchSquadra<T = unknown>(
  teamId: number,
  opts: { cacheDir?: string } = {},
): Promise<FetchResult<T>> {
  return fetchRa<T>(
    `squadra/${teamId}/`,
    opts.cacheDir ? path.join(opts.cacheDir, `squadra-${teamId}.json`) : null,
  );
}

/**
 * Archivo de partidos de un equipo: `/api/archiviopartite/{id}/` devuelve
 * `anniAvversari` (una fila por temporada con agregados); el detalle por
 * temporada vive en `/api/archiviopartite/{id}/dettaglio/{temporada}/`.
 */
export async function fetchArchivioPartite<T = unknown>(
  teamId: number,
  opts: { cacheDir?: string } = {},
): Promise<FetchResult<T>> {
  return fetchRa<T>(
    `archiviopartite/${teamId}/`,
    opts.cacheDir ? path.join(opts.cacheDir, `archivio-${teamId}.json`) : null,
  );
}

export async function fetchArchivioPartiteDettaglio<T = unknown>(
  teamId: number,
  stagione: string,
  opts: { cacheDir?: string } = {},
): Promise<FetchResult<T>> {
  return fetchRa<T>(
    `archiviopartite/${teamId}/dettaglio/${encodeURIComponent(stagione)}/`,
    opts.cacheDir ? path.join(opts.cacheDir, `archivio-${teamId}-${stagione}.json`) : null,
  );
}
