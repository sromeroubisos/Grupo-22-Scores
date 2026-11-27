/**
 * Enlaces de overlay GUARDADOS: lo que se pega en OBS o vMix.
 *
 * Una URL de overlay sola (`/overlay/partido/<id>?estilo=…`) ya no sale al aire:
 * para eso hay que guardarla en "Mis overlays", que le pone `enlace=<token>`.
 * El enlace vale LINK_TTL_DAYS días desde que se guarda o se renueva; renovar
 * mantiene el MISMO token, así que la fuente de OBS no se toca.
 *
 * Puro (sin Supabase ni Next): lo usan la API, las páginas al aire y la UI.
 */

export const LINK_TTL_DAYS = 15;
/** Desde cuántos días restantes se avisa que vence. */
export const LINK_WARN_DAYS = 3;
export const MAX_LINKS_PER_USER = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Las rutas que salen al aire. El generador, el panel y la raíz no se guardan. */
const AIR_PATH_RE = /^\/overlay\/(partido|formacion|manual)\/[^/?#]+$|^\/overlay\/(partidos|fecha|dia|home|tabla|goleadores|noticia|playoff|jugador)$/;

/** Parámetros que el enlace no guarda: el token lo pone el servidor y `prueba` es solo para probar. */
const STRIPPED_PARAMS = ['enlace', 'prueba'];

const BASE = 'https://g22.invalid';

export function linkExpiry(from: number): string {
  return new Date(from + LINK_TTL_DAYS * DAY_MS).toISOString();
}

/**
 * Normaliza lo que manda el generador: solo rutas al aire, sin `enlace` ni
 * `prueba`, siempre relativa. Acepta la URL entera (con el dominio de G22) o
 * la ruta. Devuelve null si no es un overlay que se pueda guardar.
 */
export function normalizeLinkPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 4000) return null;
  let url: URL;
  try {
    url = new URL(raw.trim(), BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE && !/^https?:\/\/(([a-z0-9-]+\.)*g22scores\.com|localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/i.test(url.origin)) return null;
  if (!AIR_PATH_RE.test(url.pathname)) return null;
  for (const key of STRIPPED_PARAMS) url.searchParams.delete(key);
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ''}`;
}

/** Qué overlay es, a partir de la ruta (`partido`, `tabla`, `manual`…). */
export function linkKindFromPath(path: string): string {
  return path.split('?')[0].split('/')[2] || 'overlay';
}

/** La ruta que se pega en OBS: la guardada más el token. */
export function linkAirPath(path: string, token: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}enlace=${encodeURIComponent(token)}`;
}

/** ¿El token se guardó para ESTA página? Compara solo la ruta, no los ajustes. */
export function linkMatchesPath(savedPath: string, pathname: string): boolean {
  const clean = (value: string) => {
    const bare = value.split('?')[0].replace(/\/+$/, '');
    try {
      return decodeURIComponent(bare);
    } catch {
      return bare;
    }
  };
  return clean(savedPath) === clean(pathname);
}

export type LinkState = 'vigente' | 'por-vencer' | 'vencido';

export type LinkStatus = {
  state: LinkState;
  /** Días que faltan, redondeados (0 = vence en menos de un día; negativo = vencido). */
  daysLeft: number;
  /** "Vence en 15 días", "Vence mañana", "Vence en 5 horas", "Venció hace 2 días". */
  label: string;
};

export function linkStatus(expiresAt: string, now: number): LinkStatus {
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return { state: 'vencido', daysLeft: -1, label: 'Venció' };
  const left = end - now;
  if (left <= 0) {
    const ago = Math.floor(-left / DAY_MS);
    return {
      state: 'vencido',
      daysLeft: -Math.max(1, ago),
      label: ago < 1 ? 'Venció hoy' : ago === 1 ? 'Venció ayer' : `Venció hace ${ago} días`,
    };
  }
  // Menos de un día: en horas, que es lo que le sirve al productor.
  if (left < DAY_MS) {
    const hours = Math.ceil(left / (60 * 60 * 1000));
    return { state: 'por-vencer', daysLeft: 0, label: hours <= 1 ? 'Vence en menos de una hora' : `Vence en ${hours} horas` };
  }
  // Redondeado: recién guardado dice 15 aunque la hora de la pantalla tenga unos segundos.
  const days = Math.max(1, Math.round(left / DAY_MS));
  return {
    state: days <= LINK_WARN_DAYS ? 'por-vencer' : 'vigente',
    daysLeft: days,
    label: days === 1 ? 'Vence mañana' : `Vence en ${days} días`,
  };
}

/** Para el aviso de arriba: cuántos vencen pronto y cuántos ya vencieron. */
export function linksSummary(links: { expiresAt: string }[], now: number) {
  let soon = 0;
  let expired = 0;
  for (const link of links) {
    const { state } = linkStatus(link.expiresAt, now);
    if (state === 'por-vencer') soon += 1;
    if (state === 'vencido') expired += 1;
  }
  return { soon, expired };
}

export type SavedLink = {
  id: string;
  token: string;
  title: string;
  kind: string;
  path: string;
  createdAt: string;
  renewedAt: string;
  expiresAt: string;
};
