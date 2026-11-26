import type { OverlaySearchMatch } from '@/lib/server/overlaySearch';

/**
 * Lo que necesita un marcador manual de un partido de G22: los dos equipos
 * (nombre, sigla, color, escudo y plantel), el deporte y el torneo. Lo usan el
 * generador (al crear el marcador) y el panel de control (para cambiarlos en
 * pleno partido), así que vive en un solo lugar.
 */

export type ManualSport = 'rugby' | 'futbol' | 'hockey' | 'basquet' | 'otro';
export type TeamInfo = { name: string; short: string; color: string | null; logo: string | null };
export type MatchTeams = {
  home: (TeamInfo & { players: string[] }) | null;
  away: (TeamInfo & { players: string[] }) | null;
  sport: ManualSport;
  title: string | null;
  /** Seven: tiempos de 7' y amarilla de 2' (en vez de 40' y 10'). */
  sevens: boolean;
};

/** Lo que cambia en el reloj del marcador manual si el partido es de seven. */
export function sevensClockPatch(teams: MatchTeams): { sinBin: number; clock: { limit: number } } | null {
  return teams.sevens ? { sinBin: 2 * 60, clock: { limit: 7 * 60 } } : null;
}

/** El deporte de G22 → los botones de anotar del marcador manual. */
export function manualSportFrom(sportId: unknown): ManualSport {
  const id = String(sportId ?? '').toLowerCase();
  if (id.includes('rugby') || id.includes('seven')) return 'rugby';
  if (id.includes('hockey')) return 'hockey';
  if (id.includes('basket')) return 'basquet';
  if (id === 'football' || id.includes('futbol') || id.includes('soccer') || id === 'futsal') return 'futbol';
  return 'otro';
}

/** Un club como lo devuelven las APIs (homeClub/awayClub) → nombre, sigla, color y escudo. */
export function teamFromClub(raw: unknown): TeamInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const name = typeof row.name === 'string' ? row.name : '';
  if (!name) return null;
  // Un escudo en base64 no viaja al marcador: pesa cientos de KB.
  const logo = typeof row.logo === 'string' ? row.logo
    : typeof row.logo_url === 'string' && !row.logo_url.startsWith('data:') ? row.logo_url : null;
  return {
    name,
    short: typeof row.short_name === 'string' && row.short_name ? row.short_name : name,
    color: typeof row.primary_color === 'string' ? row.primary_color : null,
    logo,
  };
}

function roster(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : []).map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const number = row.number ?? row.jerseyNumber;
    const name = String(row.name ?? row.playerName ?? '').trim();
    return name ? `${number ?? ''} ${name}`.trim() : '';
  }).filter(Boolean).slice(0, 40);
}

/** Trae los equipos de un partido. Si salió del buscador, sus datos de club mandan. */
export async function teamsFromMatch(id: string, found: OverlaySearchMatch | null): Promise<MatchTeams> {
  const response = await fetch(`/api/matches/${encodeURIComponent(id)}`, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  const lineups = (body?.lineups ?? body?.match?.lineups ?? {}) as Record<string, unknown>;
  const home = found ? found.home : teamFromClub(body?.homeClub ?? body?.match?.homeClub);
  const away = found ? found.away : teamFromClub(body?.awayClub ?? body?.match?.awayClub);
  const pick = (team: TeamInfo) => ({ name: team.name, short: team.short, color: team.color, logo: team.logo });
  const tournament = body?.tournament?.name ?? found?.tournament ?? null;
  const ruleset = (body?.tournament?.ruleset ?? {}) as Record<string, unknown>;
  const names = [tournament, home?.name, away?.name].filter((item): item is string => typeof item === 'string').join(' ');
  const sevens = ruleset.rugbyModality === 'sevens' || /\b7s\b|\bseven\b|rugby 7\b/i.test(names);
  return {
    sevens,
    home: home ? { ...pick(home), players: roster(lineups.home) } : null,
    away: away ? { ...pick(away), players: roster(lineups.away) } : null,
    sport: manualSportFrom(body?.sport_id ?? body?.match?.sport_id ?? body?.tournament?.sport_id),
    title: typeof tournament === 'string' ? tournament : null,
  };
}
