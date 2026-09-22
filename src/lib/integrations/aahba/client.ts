/**
 * Cliente del TournamentTracker de la AAHBA (Asociación Amateur de Hockey
 * sobre césped de Buenos Aires), el sistema que la asociación publica en
 * tournamenttracker.buenosaireshockey.ar.
 *
 * La pantalla es una SPA, así que no hay HTML que parsear: todo sale de una
 * API JSON propia, sin login y sin cookies. Tres rutas alcanzan:
 *
 *   /get-context                         temporadas, ramas y categorías
 *   /torneos-x-division/{fed}/{temp}/{rama}/{cat}   el catálogo de torneos
 *   /torneos/{id}                        fixture entero, con marcadores y tabla
 *
 * Ojo con el orden de los cuatro segmentos: el front los arma
 * federación / temporada / rama / categoría, y si se invierten los dos
 * primeros la API contesta `[]` con 200 — o sea, un catálogo vacío que parece
 * "no hay torneos". Por eso `fetchTorneosXDivision` los recibe con nombre.
 *
 * ## Por qué hay una passphrase acá adentro
 *
 * Las respuestas vienen cifradas: el cuerpo es un string `"{iv}:{dato}"` en
 * hexa, AES-256-CTR sin padding. La clave NO es un secreto nuestro ni una
 * credencial de acceso: viaja en claro dentro del bundle JavaScript que el
 * sitio le sirve a cualquier navegador que entre, y la API contesta lo mismo
 * con o sin ella. Es ofuscación del lado del cliente, no autenticación.
 * Guardarla en una variable de entorno daría una falsa sensación de secreto y
 * además rompería el conector cada vez que se despliegue sin ella. Queda acá,
 * con este comentario, que es la única forma de que dentro de un año nadie la
 * confunda con una llave que haya que rotar.
 *
 * Misma política de errores que el resto de los conectores de la casa: una
 * caída o una forma desconocida NUNCA se degrada a "no había nada". Si el
 * cuerpo no descifra o no tiene la forma esperada sale `HTTP_FORMA_INESPERADA`
 * y el que llama decide — jamás una lista vacía que parezca una fecha sin
 * partidos.
 */
import { createDecipheriv } from 'node:crypto';

export const AAHBA_BASE = 'https://api.tournamenttracker.buenosaireshockey.ar';
/** El id de la AAHBA dentro del tracker, que es multi-federación. */
export const AAHBA_FEDERACION = '001';
export const PAUSA_MS = 300;
export const HTTP_FORMA_INESPERADA = -1;
const TIMEOUT_MS = 20_000;

/** Ver el bloque de arriba: esto es ofuscación pública, no una credencial. */
const PASSPHRASE = 'uweoEVNeycw7CFBXtHNCy3nbJZmUPl0EosXGRrNDgdU=';

export interface Resultado<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

export const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

function descifrar(cuerpo: unknown): unknown {
  if (typeof cuerpo !== 'string' || !cuerpo.includes(':')) return null;
  const [ivHex, datoHex] = cuerpo.split(':');
  if (!/^[0-9a-f]+$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(datoHex)) return null;
  try {
    const d = createDecipheriv('aes-256-ctr', Buffer.from(PASSPHRASE, 'base64'), Buffer.from(ivHex, 'hex'));
    const claro = Buffer.concat([d.update(Buffer.from(datoHex, 'hex')), d.final()]).toString('utf8');
    return JSON.parse(claro);
  } catch {
    return null;
  }
}

async function pedir<T>(ruta: string): Promise<Resultado<T>> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${AAHBA_BASE}${ruta}`, {
      signal: control.signal,
      headers: { accept: '*/*', 'user-agent': 'Mozilla/5.0 (compatible; G22Scores)' },
    });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    const claro = descifrar(await res.json());
    if (claro === null) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
    return { ok: true, status: res.status, data: claro as T };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

// ── lo que contesta la API, en lo que a nosotros nos importa ───────────────

export interface PartidoCrudo {
  /** Único en todo el tracker: es la identidad del partido. */
  id: string;
  idClubLocal: string;
  idClubVisitante: string;
  nombreLocal: string;
  nombreVisitante: string;
  golesLocal: string;
  golesVisitante: string;
  golesPenalLocal: string;
  golesPenalVisitante: string;
  /** `"2026/03/08 16:00:00"`, hora de Buenos Aires. */
  horario: string;
  numeroFecha: string;
  played: boolean;
  playing: boolean;
  presenteLocal: boolean;
  presenteVisitante: boolean;
  isGhostMatch: boolean;
  campoJuegoNombre: string;
  arbitros: string;
}

export interface TorneoCrudo {
  id: string;
  detalle: { nombreTorneo: string; rama: string };
  fases: { id: string; nombre: string; tipo: string; zonas?: { nombre: string; partidos: PartidoCrudo[] }[] }[];
  ultimaActualizacion: string;
}

export interface TorneoDelCatalogo {
  id: string;
  nombre: string;
  estado: string;
  fechaInicio: string;
  rama: string;
  categoriaId: string;
  temporadaId: string;
}

/**
 * Un torneo entero: fases, zonas, fixture y marcadores. La guarda es que
 * traiga `fases`: un id que no existe contesta 200 con otra cosa, y eso no es
 * un torneo sin partidos.
 */
export async function fetchTorneo(id: string): Promise<Resultado<TorneoCrudo>> {
  const r = await pedir<TorneoCrudo>(`/torneos/${id}`);
  if (!r.ok || !r.data) return r;
  if (!Array.isArray(r.data.fases) || !r.data.detalle) {
    return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  }
  return r;
}

/**
 * El catálogo de una categoría. Los cuatro segmentos van en ESTE orden
 * —federación, temporada, rama, categoría—; ver el comentario de arriba.
 */
export async function fetchTorneosXDivision(args: {
  temporadaId: string;
  rama: 'M' | 'F';
  categoriaId: string;
  federacionId?: string;
}): Promise<Resultado<TorneoDelCatalogo[]>> {
  const fed = args.federacionId ?? AAHBA_FEDERACION;
  const r = await pedir<{ divisiones?: { nombre: string; torneos: TorneoDelCatalogo[] }[] }[]>(
    `/torneos-x-division/${fed}/${args.temporadaId}/${args.rama}/${args.categoriaId}`,
  );
  if (!r.ok || !r.data) return { ok: r.ok, status: r.status, data: null };
  if (!Array.isArray(r.data)) return { ok: false, status: HTTP_FORMA_INESPERADA, data: null };
  const torneos = r.data.flatMap((f) => (f.divisiones ?? []).flatMap((d) => d.torneos ?? []));
  return { ok: true, status: r.status, data: torneos };
}

/** Todos los partidos de un torneo, aplanados: las zonas acá no nos sirven. */
export function partidosDe(torneo: TorneoCrudo): PartidoCrudo[] {
  return torneo.fases.flatMap((f) => (f.zonas ?? []).flatMap((z) => z.partidos ?? []));
}
