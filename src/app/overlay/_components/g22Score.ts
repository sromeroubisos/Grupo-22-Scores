import { toOverlayMatch } from '@/lib/overlay/matchOverlayModel';

/**
 * El resultado de un partido de G22, para el marcador manual vinculado.
 *
 * El overlay al aire y el panel se releen cada segundo; G22 no hace falta tan
 * seguido. La primera vez se espera la respuesta (si no, sale 0-0 un instante);
 * después se devuelve lo último y se refresca por detrás cada 5 segundos.
 */

export type G22Score = { home: number; away: number };

const MAX_AGE_MS = 5_000;
const cache = new Map<string, { at: number; value: G22Score | null; pending: Promise<G22Score | null> | null }>();

async function load(matchId: string): Promise<G22Score | null> {
  try {
    const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}?overlay=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return cache.get(matchId)?.value ?? null;
    const match = toOverlayMatch(await response.json());
    if (!match) return cache.get(matchId)?.value ?? null;
    // Antes de empezar G22 no publica resultado: 0-0.
    return { home: match.home.score ?? 0, away: match.away.score ?? 0 };
  } catch {
    // Sin red: queda lo último que se supo.
    return cache.get(matchId)?.value ?? null;
  }
}

export async function g22ScoreOf(matchId: string): Promise<G22Score | null> {
  const entry = cache.get(matchId);
  const fresh = entry && Date.now() - entry.at < MAX_AGE_MS;
  if (fresh || entry?.pending) return entry?.value ?? null;
  const pending = load(matchId).then((value) => {
    cache.set(matchId, { at: Date.now(), value, pending: null });
    return value;
  });
  cache.set(matchId, { at: entry?.at ?? 0, value: entry?.value ?? null, pending });
  // La primera vez se espera; después, se usa lo último sin frenar el overlay.
  return entry ? entry.value : pending;
}
