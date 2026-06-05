/**
 * Adapter: match-center payload (the object returned by `fetchMatchCenterMatch`)
 * → `LineupsData` consumed by `ExportImage` (template 'lineups').
 *
 * The export renderer draws whatever it is handed; tournament-scoping is
 * guaranteed at the data source (only scope-checked endpoints feed this), so
 * this adapter is a pure shape mapping with no fetching.
 */

import type { LineupsData, LineupExportPlayerData } from '@/components/ExportImage';

type LineupPlayerLike = {
  id?: string | null;
  number?: number | string | null;
  name?: string | null;
  position?: string | null;
  role?: string | null;
  rating?: number | string | null;
  isCaptain?: boolean | null;
};

type ClubLike = { name?: string | null; logo_url?: string | null; logo?: string | null } | null;

export type MatchCenterLineupsPayload = {
  lineups?: { home?: LineupPlayerLike[]; away?: LineupPlayerLike[] } | null;
  homeClub?: ClubLike;
  awayClub?: ClubLike;
  tournament?: { name?: string | null; display_name?: string | null; logo_url?: string | null } | null;
  dateTime?: string | null;
  venue?: string | null;
};

function mapPlayer(player: LineupPlayerLike): LineupExportPlayerData {
  return {
    id: player.id ?? null,
    number: player.number ?? null,
    name: String(player.name ?? '').trim(),
    position: player.position ?? null,
    role: player.role ?? null,
    rating: player.rating ?? null,
    isCaptain: Boolean(player.isCaptain),
  };
}

function isSubstitute(role: string | null | undefined): boolean {
  const n = String(role ?? '').toLowerCase();
  return n === 'substitute' || n === 'suplente' || n === 'sub' || n === 'bench';
}

export type ToLineupsDataOptions = {
  /** 'starters' (default) excludes substitutes; 'all' keeps the full 23. */
  scope?: 'starters' | 'all';
  homeTeamName?: string;
  awayTeamName?: string;
};

export function toLineupsData(
  payload: MatchCenterLineupsPayload,
  options: ToLineupsDataOptions = {},
): LineupsData {
  const scope = options.scope ?? 'all';
  const home = payload.lineups?.home ?? [];
  const away = payload.lineups?.away ?? [];

  const pick = (players: LineupPlayerLike[]) =>
    (scope === 'starters' ? players.filter((p) => !isSubstitute(p.role)) : players).map(
      mapPlayer,
    );

  const tournamentName =
    payload.tournament?.display_name?.trim() ||
    payload.tournament?.name?.trim() ||
    'Torneo';

  return {
    tournament: tournamentName,
    tournamentLogo: payload.tournament?.logo_url ?? undefined,
    venue: payload.venue ?? undefined,
    kickoffAt: payload.dateTime ?? null,
    homeTeam: {
      name: options.homeTeamName || payload.homeClub?.name?.trim() || 'Local',
      logo: payload.homeClub?.logo_url ?? payload.homeClub?.logo ?? undefined,
      starters: pick(home),
    },
    awayTeam: {
      name: options.awayTeamName || payload.awayClub?.name?.trim() || 'Visitante',
      logo: payload.awayClub?.logo_url ?? payload.awayClub?.logo ?? undefined,
      starters: pick(away),
    },
  };
}
