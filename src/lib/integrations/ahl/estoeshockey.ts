/**
 * Resultados del hockey del Litoral desde estoeshockey.com.
 *
 * La AHL no publica marcadores (viven en SICAH), pero este sitio de Rosario
 * los carga por campeonato en HTML server-rendered: pestañas por fecha, cada
 * partido con sus dos equipos y el marcador ("3:3", con el parcial entre
 * paréntesis al lado). La URL es `/?page=resultados&campeonato={id}` — el id
 * es de ELLOS y va mapeado a mano en el route (246-249 = Clausura Litoral
 * A-D, 244 = Interprovincial Caballeros).
 *
 * El parser es PURO y devuelve los nombres tal como los escribe el sitio
 * ("J.C.R. A", "C.A.P. B"): la resolución a clubes pasa por los alias con
 * alcance por torneo, como todo lo demás. Un partido sin marcador (fecha
 * futura) no se emite.
 */

export const ESTOESHOCKEY_BASE = 'https://estoeshockey.com';
const TIMEOUT_MS = 30_000;

export interface ResultadoCrudo {
  fecha: number | null;
  local: string;
  visitante: string;
  golesLocal: number;
  golesVisitante: number;
}

export async function fetchResultadosCampeonato(campeonato: number): Promise<{ ok: boolean; status: number; html: string | null }> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ESTOESHOCKEY_BASE}/?page=resultados&campeonato=${campeonato}`, {
      signal: control.signal,
      headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; G22Scores)' },
    });
    if (!res.ok) return { ok: false, status: res.status, html: null };
    return { ok: true, status: res.status, html: await res.text() };
  } catch {
    return { ok: false, status: 0, html: null };
  } finally {
    clearTimeout(timer);
  }
}

/** El campeonato que la página dice tener seleccionado: la guarda contra un
 * selector que dejó de responder al parámetro y devuelve siempre el default. */
export function campeonatoSeleccionado(html: string): number | null {
  const m = html.match(/<option value="[^"]*campeonato=(\d+)"\s+selected/);
  return m ? Number(m[1]) : null;
}

export function parseResultados(html: string): ResultadoCrudo[] {
  const resultados: ResultadoCrudo[] = [];

  // Pestañas por fecha; lo que quede fuera de una pestaña entra con fecha null.
  const bloques: { fecha: number | null; html: string }[] = [];
  const re = /id="fecha_(\d+)" role="tabpanel"/g;
  let previo: { fecha: number | null; desde: number } | null = null;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (previo) bloques.push({ fecha: previo.fecha, html: html.slice(previo.desde, m.index) });
    previo = { fecha: Number(m[1]), desde: m.index };
  }
  if (previo) bloques.push({ fecha: previo.fecha, html: html.slice(previo.desde) });
  if (!bloques.length) bloques.push({ fecha: null, html });

  for (const bloque of bloques) {
    for (const partido of bloque.html.split('match-item match-section').slice(1)) {
      const nombres = [...partido.matchAll(/team-name">([^<]+)<\/span>/g)].map((m) => m[1].trim());
      if (nombres.length < 2) continue;
      const marcador = partido.match(/result-match-text">\s*(\d{1,2}):(\d{1,2})/);
      if (!marcador) continue; // partido futuro: sin marcador todavía
      resultados.push({
        fecha: bloque.fecha,
        local: nombres[0],
        visitante: nombres[1],
        golesLocal: Number(marcador[1]),
        golesVisitante: Number(marcador[2]),
      });
    }
  }
  return resultados;
}
