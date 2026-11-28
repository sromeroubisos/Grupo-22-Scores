/**
 * Volver a abrir un overlay guardado: de su ruta (`/overlay/partido/<id>?estilo=…`)
 * sale qué gráfico es y con qué ajustes. Es la inversa de lo que arma el
 * editor en `relative`; si se agrega un parámetro allá, se lee acá.
 *
 * Puro: sin React ni fetch. Los nombres (del partido, del torneo) los pide el
 * editor después, con los ids que devuelve esto.
 */
import { KIND_DEFS, isScoreboardStyle, type Kind } from './catalog';

export type SavedTarget = {
  /** null solo para los manuales: qué manual es lo dice el overlay, no la ruta. */
  kind: Kind | null;
  /** El id de la ruta: partido, formación o manual. null en la muestra (`demo`). */
  routeId: string | null;
  params: URLSearchParams;
};

const LIST_ROUTES = new Set(['partidos', 'fecha', 'dia', 'home', 'tabla', 'grupo', 'goleadores', 'playoff', 'jugador', 'noticia']);

export function savedTarget(path: string): SavedTarget | null {
  const [pathname, query = ''] = path.split('?');
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'overlay' || !parts[1]) return null;
  const params = new URLSearchParams(query);
  const route = parts[1];
  const rawId = parts[2] ? decodeURIComponent(parts[2]) : null;
  const routeId = rawId && !rawId.startsWith('demo') ? rawId : null;

  if (route === 'partido') {
    const style = params.get('estilo');
    const kind = style && KIND_DEFS.has(style as Kind) && isScoreboardStyle(style as Kind) ? (style as Kind) : 'partido';
    return { kind, routeId, params };
  }
  if (route === 'formacion') return { kind: 'formacion', routeId, params };
  if (route === 'manual') return { kind: null, routeId, params };
  if (LIST_ROUTES.has(route)) return { kind: route as Kind, routeId: null, params };
  return null;
}

/** El tipo de overlay manual, como lo guarda `overlay_controls.kind`. */
export function manualKind(kind: string): Kind | null {
  if (kind === 'marcador') return 'manual-marcador';
  if (kind === 'titular') return 'manual-titular';
  if (kind === 'sponsors') return 'manual-sponsors';
  return null;
}

/** Lectores con su valor por defecto: lo que no está en la ruta es lo que el editor no cambió. */
export function reader(params: URLSearchParams | null) {
  const get = (key: string) => params?.get(key) ?? null;
  return {
    get,
    text: (key: string, fallback = '') => get(key) ?? fallback,
    flag: (key: string) => get(key) === '1',
    off: (key: string) => get(key) === '0',
    number: (key: string, fallback: number) => {
      const value = Number(get(key));
      return get(key) !== null && Number.isFinite(value) ? value : fallback;
    },
    color: (key: string) => {
      const value = get(key);
      return value && /^[0-9a-f]{3,8}$/i.test(value) ? `#${value}` : '';
    },
    oneOf: <T extends string>(key: string, options: readonly T[], fallback: T): T => {
      const value = get(key);
      return value && (options as readonly string[]).includes(value) ? (value as T) : fallback;
    },
    list: (key: string) => (get(key) ?? '').split(',').map((item) => item.trim()).filter(Boolean),
  };
}
