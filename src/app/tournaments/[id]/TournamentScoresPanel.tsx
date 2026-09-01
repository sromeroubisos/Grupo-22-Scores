'use client';

import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { type TeamOfWeekData, type TeamOfWeekPlayerData } from '@/components/ExportImage';

// Los tipos se borran al compilar; el componente son ~900 KB que solo hacen falta si
// alguien abre el modal, asi que entra en diferido como en el resto de las rutas.
const ExportImage = dynamic(() => import('@/components/ExportImage'), { ssr: false });
import styles from './TournamentScoresPanel.module.css';

type ScoresSubTab = 'scores' | 'team-of-round' | 'history';
type ScoreMode = 'average' | 'individual';
type MatchSide = 'home' | 'away';

type TeamInfo = {
  id: string | null;
  name: string;
  shortName: string | null;
  logo: string | null;
};

type LineupPlayer = {
  id: string | null;
  name: string;
  number: number | null;
  position: string | null;
  role: string | null;
  rating: number | null;
  isCaptain: boolean;
};

type ScoreEntry = {
  key: string;
  playerId: string | null;
  playerName: string;
  number: number | null;
  position: string | null;
  role: string | null;
  rating: number;
  side: MatchSide;
  teamId: string | null;
  teamName: string;
  teamLogo: string | null;
  opponentName: string;
  matchId: string;
  matchLabel: string;
  matchTimestamp: number;
  dateLabel: string;
  roundKey: string;
  roundLabel: string;
};

type TeamSlot = {
  positionKey: string;
  positionLabel: string;
  sortNumber: number | null;
  entry: ScoreEntry;
};

type RoundSnapshot = {
  key: string;
  label: string;
  sortNumber: number | null;
  firstTimestamp: number;
  matchCount: number;
  clubCount: number;
  entries: ScoreEntry[];
  team: TeamSlot[];
};

type ExternalOverride = {
  matchId: string;
  lineups: {
    home: LineupPlayer[];
    away: LineupPlayer[];
  };
  ratedAt?: string | null;
  provider?: string | null;
};

type TournamentScoresPanelProps = {
  tournamentId: string;
  tournamentName?: string | null;
  tournamentLogo?: string | null;
  sportId?: string | null;
  matches: unknown[];
};

const FINAL_STATUSES = new Set(['finished', 'final', 'ft', 'complete', 'completed']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ROLE_LABELS = new Set(['starter', 'titular', 'substitute', 'suplente', 'finisher']);

const DATE_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const SUB_TABS: Array<{ id: ScoresSubTab; label: string }> = [
  { id: 'scores', label: 'Puntajes' },
  { id: 'team-of-round', label: 'Equipo de la fecha' },
  { id: 'history', label: 'Historial' },
];

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readRating(value: unknown): number | null {
  const parsed = readNumber(value);
  if (parsed === null) return null;
  return Math.round(Math.min(10, Math.max(0, parsed)) * 10) / 10;
}

function normalizeKey(value: unknown) {
  return readString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatRating(value: number, digits = 1) {
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function getInitials(value: string) {
  const parts = readString(value).split(' ').filter(Boolean);
  const first = parts[0]?.[0] || '';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : parts[0]?.[1] || '';
  return `${first}${second}`.toUpperCase() || 'EQ';
}

function getLogoStyle(logo: string | null): CSSProperties | undefined {
  const src = readString(logo);
  if (!src || src.startsWith('data:')) return undefined;
  return {
    backgroundImage: `url("${src.replace(/["\n\r]/g, '')}")`,
  };
}

function getMatchId(match: Record<string, unknown>) {
  return readString(
    match.match_id ??
    match.id ??
    match.event_id ??
    match.EVENT_ID,
  );
}

function getMatchTimestamp(match: Record<string, unknown>) {
  const raw =
    readNumber(match.timestamp) ??
    readNumber(match.start_time) ??
    readNumber(match.time) ??
    readNumber(match.event_timestamp);

  if (raw !== null) return raw > 9999999999 ? Math.floor(raw / 1000) : raw;

  const dateValue = readString(match.date_time ?? match.date ?? match.startDate);
  if (!dateValue) return 0;

  const parsed = new Date(dateValue).getTime();
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function formatDate(timestamp: number) {
  if (!timestamp) return 'Sin fecha';
  return DATE_FORMATTER.format(new Date(timestamp * 1000));
}

function isFinalMatch(match: Record<string, unknown>) {
  const status = readString(match.status).toLowerCase();
  return FINAL_STATUSES.has(status);
}

function getTeam(match: Record<string, unknown>, side: MatchSide): TeamInfo {
  const direct = toRecord(
    match[`${side}_team`] ??
    match[side] ??
    match[`${side}Team`],
  );

  const id = readString(
    direct.id ??
    direct.team_id ??
    direct.club_id ??
    match[`${side}_club_id`] ??
    match[`${side}ClubId`],
  ) || null;

  const name =
    readString(direct.name) ||
    readString(direct.team_name) ||
    readString(match[`${side}_team_name`]) ||
    (side === 'home' ? 'Local' : 'Visitante');

  return {
    id,
    name,
    shortName: readString(direct.short_name ?? direct.shortName) || null,
    logo: readString(direct.logo ?? direct.logo_url ?? direct.team_logo ?? direct.image) || null,
  };
}

function getMatchScoreLabel(match: Record<string, unknown>) {
  const score = toRecord(match.scores ?? match.score);
  const home = readNumber(score.home ?? score.home_score ?? score.HOME_SCORE);
  const away = readNumber(score.away ?? score.away_score ?? score.AWAY_SCORE);

  if (home === null || away === null) return 'vs';
  return `${home}-${away}`;
}

function getRoundInfo(match: Record<string, unknown>, timestamp: number, matchId: string) {
  const rawRound =
    readString(match.round_label) ||
    readString(match.roundLabel) ||
    readString(match.round) ||
    readString(match.stage);

  if (rawRound) {
    return {
      key: normalizeKey(rawRound) || rawRound,
      label: rawRound,
      sortNumber: parseRoundNumber(rawRound),
    };
  }

  const fallbackLabel = timestamp ? formatDate(timestamp) : 'Sin fecha';
  return {
    key: timestamp ? `date-${new Date(timestamp * 1000).toISOString().slice(0, 10)}` : `match-${matchId || 'unknown'}`,
    label: fallbackLabel,
    sortNumber: null,
  };
}

function parseRoundNumber(label: string) {
  const match = label.match(/(?:fecha|jornada|round|ronda|f)\s*#?\s*(\d+)/i) || label.match(/\b(\d+)\b/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLineupArray(rawLineups: unknown, side: MatchSide): unknown[] {
  const lineups = toRecord(rawLineups);
  const sideValue =
    lineups[side] ??
    lineups[side.toUpperCase()] ??
    toRecord(lineups.teams)[side] ??
    toRecord(lineups.lineups)[side];

  if (Array.isArray(sideValue)) return sideValue;

  const sideRecord = toRecord(sideValue);
  if (Array.isArray(sideRecord.players)) return sideRecord.players;
  if (Array.isArray(sideRecord.starting)) return sideRecord.starting;

  return [];
}

function normalizeLineupPlayers(rawLineups: unknown, side: MatchSide): LineupPlayer[] {
  return getLineupArray(rawLineups, side)
    .map((rawPlayer, index) => {
      const source = toRecord(rawPlayer);
      const playerRecord = toRecord(source.player);
      const id =
        readString(source.id) ||
        readString(source.playerId) ||
        readString(source.player_id) ||
        readString(playerRecord.id) ||
        null;
      const name =
        readString(source.name) ||
        readString(source.playerName) ||
        readString(source.player_name) ||
        readString(source.PLAYER_NAME) ||
        readString(playerRecord.name);

      if (!name) return null;

      const number =
        readNumber(source.number) ??
        readNumber(source.jerseyNumber) ??
        readNumber(source.player_number) ??
        readNumber(source.PLAYER_NUMBER) ??
        readNumber(playerRecord.number);

      const position =
        readString(source.position) ||
        readString(source.player_position) ||
        readString(source.PLAYER_POSITION) ||
        readString(playerRecord.position) ||
        null;

      const role =
        readString(source.role) ||
        readString(source.player_role) ||
        readString(source.PLAYER_ROLE) ||
        readString(source.type) ||
        null;

      return {
        id,
        name,
        number: number !== null ? Math.round(number) : index + 1,
        position,
        role,
        rating: readRating(
          source.rating ??
          source.playerRating ??
          source.player_rating ??
          source.PLAYER_RATING ??
          toRecord(source.stats).rating ??
          toRecord(source.statistics).rating,
        ),
        isCaptain: Boolean(source.isCaptain || source.captain || source.player_captain),
      };
    })
    .filter((player): player is LineupPlayer => Boolean(player));
}

export function hasRatedLineups(rawLineups: unknown) {
  return (['home', 'away'] as MatchSide[]).some((side) =>
    normalizeLineupPlayers(rawLineups, side).some((player) => typeof player.rating === 'number'),
  );
}

/**
 * Sonda sincrónica para el padre: ¿la pestaña Puntajes tiene algo que mostrar?
 *
 * Contesta sin montar el panel. `hasLocalRatings` alcanza para mostrar la
 * pestaña; si es false pero hay `overrideCandidateIds`, la respuesta depende
 * del endpoint de lineup-overrides (los mismos ids que pediría este panel).
 * Sin ratings locales ni candidatos, la pestaña no tiene nada que ofrecer.
 */
export function sondaDePuntajes(matches: unknown[]): {
  hasLocalRatings: boolean;
  overrideCandidateIds: string[];
} {
  const finales = matches.map(toRecord).filter(isFinalMatch);
  const hasLocalRatings = finales.some((match) => hasRatedLineups(match.lineups));
  if (hasLocalRatings) return { hasLocalRatings, overrideCandidateIds: [] };

  const overrideCandidateIds = finales
    .map(getMatchId)
    .filter((matchId) => matchId && !UUID_RE.test(matchId))
    .slice(0, 120);
  return { hasLocalRatings, overrideCandidateIds };
}

function buildScoreEntries(
  matches: unknown[],
  overrides: Record<string, ExternalOverride>,
): ScoreEntry[] {
  return matches.flatMap((rawMatch) => {
    const match = toRecord(rawMatch);
    if (!isFinalMatch(match)) return [];

    const matchId = getMatchId(match);
    const timestamp = getMatchTimestamp(match);
    const home = getTeam(match, 'home');
    const away = getTeam(match, 'away');
    const round = getRoundInfo(match, timestamp, matchId);
    const overrideLineups = matchId ? overrides[matchId]?.lineups : null;
    const matchLineups = hasRatedLineups(overrideLineups) ? overrideLineups : match.lineups;
    const scoreLabel = getMatchScoreLabel(match);
    const matchLabel = `${home.shortName || home.name} ${scoreLabel} ${away.shortName || away.name}`;

    return (['home', 'away'] as MatchSide[]).flatMap((side) => {
      const team = side === 'home' ? home : away;
      const opponent = side === 'home' ? away : home;

      return normalizeLineupPlayers(matchLineups, side)
        .filter((player) => typeof player.rating === 'number')
        .map((player) => ({
          key: `${matchId || 'match'}:${side}:${player.id || normalizeKey(player.name)}:${player.number ?? 'n'}`,
          playerId: player.id,
          playerName: player.name,
          number: player.number,
          position: player.position,
          role: player.role,
          rating: player.rating!,
          side,
          teamId: team.id,
          teamName: team.name,
          teamLogo: team.logo,
          opponentName: opponent.name,
          matchId,
          matchLabel,
          matchTimestamp: timestamp,
          dateLabel: formatDate(timestamp),
          roundKey: round.key,
          roundLabel: round.label,
        }));
    });
  });
}

function isRugbySport(sportId?: string | null) {
  return readString(sportId).toLowerCase().includes('rugby');
}

function isStarter(entry: ScoreEntry, sportId?: string | null) {
  const role = readString(entry.role).toLowerCase();
  if (role === 'starter' || role === 'titular') return true;
  if (role === 'substitute' || role === 'suplente' || role === 'finisher') return false;
  return isRugbySport(sportId) && typeof entry.number === 'number' ? entry.number <= 15 : true;
}

function getTeamPool(entries: ScoreEntry[], sportId?: string | null) {
  const starters = entries.filter((entry) => isStarter(entry, sportId));
  return starters.length > 0 ? starters : entries;
}

function getPositionLabel(entry: ScoreEntry, sportId?: string | null) {
  const position = readString(entry.position);
  const role = readString(entry.role);
  const hasNumber = typeof entry.number === 'number' && entry.number > 0;

  if (isRugbySport(sportId) && hasNumber && entry.number! <= 23) {
    return position ? `${entry.number}. ${position}` : `Puesto ${entry.number}`;
  }

  if (position) return position;
  if (role && !GENERIC_ROLE_LABELS.has(role.toLowerCase())) return role;
  return hasNumber ? `Puesto ${entry.number}` : 'Sin posicion';
}

function getPositionSortNumber(entry: ScoreEntry, sportId?: string | null) {
  if (isRugbySport(sportId) && typeof entry.number === 'number' && entry.number > 0 && entry.number <= 23) {
    return entry.number;
  }
  return null;
}

function getPositionNumberFromLabel(label: string) {
  const match = readString(label).match(/(?:puesto\s*)?(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPositionSlotKey(entry: ScoreEntry, sportId?: string | null) {
  const sortNumber = getPositionSortNumber(entry, sportId);
  if (sortNumber !== null) return `number:${sortNumber}`;

  const positionLabel = getPositionLabel(entry, sportId);
  return normalizeKey(positionLabel) || positionLabel;
}

function getSlotPositionMeta(slot: TeamSlot) {
  const number = slot.sortNumber ?? getPositionNumberFromLabel(slot.positionLabel);
  const rawLabel = readString(slot.positionLabel);

  if (!number) {
    return {
      numberLabel: rawLabel.slice(0, 2).toUpperCase() || '?',
      positionLabel: rawLabel || 'Sin posicion',
    };
  }

  const detail = rawLabel.match(/^\d+\.\s*(.+)$/)?.[1]?.trim();
  return {
    numberLabel: String(number),
    positionLabel: detail ? `Puesto ${number} - ${detail}` : `Puesto ${number}`,
  };
}

function mapSlotToTeamOfWeekPlayer(slot: TeamSlot, index: number): TeamOfWeekPlayerData {
  const positionMeta = getSlotPositionMeta(slot);

  return {
    id: slot.entry.playerId,
    number: slot.sortNumber ?? slot.entry.number ?? index + 1,
    name: slot.entry.playerName,
    position: positionMeta.positionLabel,
    team: slot.entry.teamName,
    teamLogo: slot.entry.teamLogo,
    rating: slot.entry.rating,
  };
}

function getTeamOfWeekReplacementEntries(entries: ScoreEntry[], starters: TeamSlot[], sportId?: string | null) {
  const starterKeys = new Set(starters.map((slot) => slot.entry.key));
  const candidates = entries.filter((entry) => !starterKeys.has(entry.key));
  const benchCandidates = candidates.filter((entry) => !isStarter(entry, sportId));
  const pool = benchCandidates.length > 0 ? benchCandidates : candidates;

  return [...pool]
    .sort((left, right) => {
      if (isRugbySport(sportId)) {
        const leftNumber = typeof left.number === 'number' ? left.number : 999;
        const rightNumber = typeof right.number === 'number' ? right.number : 999;
        if (leftNumber !== rightNumber) return leftNumber - rightNumber;
      }

      return (
        right.rating - left.rating ||
        left.playerName.localeCompare(right.playerName, 'es')
      );
    })
    .slice(0, 8);
}

function mapEntryToTeamOfWeekReplacement(entry: ScoreEntry, index: number, sportId?: string | null): TeamOfWeekPlayerData {
  return {
    id: entry.playerId,
    number: 16 + index,
    name: entry.playerName,
    position: getPositionLabel(entry, sportId),
    team: entry.teamName,
    teamLogo: entry.teamLogo,
    rating: entry.rating,
  };
}

function buildTeamByPosition(entries: ScoreEntry[], sportId?: string | null): TeamSlot[] {
  const slots = new Map<string, TeamSlot>();

  entries.forEach((entry) => {
    const positionLabel = getPositionLabel(entry, sportId);
    const positionKey = getPositionSlotKey(entry, sportId);
    const current = slots.get(positionKey);
    const nextSlot = {
      positionKey,
      positionLabel,
      sortNumber: getPositionSortNumber(entry, sportId),
      entry,
    };

    if (
      !current ||
      entry.rating > current.entry.rating ||
      (entry.rating === current.entry.rating && entry.matchTimestamp > current.entry.matchTimestamp)
    ) {
      slots.set(positionKey, nextSlot);
    }
  });

  return Array.from(slots.values()).sort((left, right) => {
    if (left.sortNumber !== null || right.sortNumber !== null) {
      return (left.sortNumber ?? 999) - (right.sortNumber ?? 999);
    }
    return left.positionLabel.localeCompare(right.positionLabel, 'es');
  });
}

function teamKey(entry: ScoreEntry) {
  return entry.teamId || normalizeKey(entry.teamName);
}

function buildLatestClubEntries(entries: ScoreEntry[]) {
  const latest = new Map<string, { matchId: string; timestamp: number }>();

  entries.forEach((entry) => {
    const key = teamKey(entry);
    if (!key) return;

    const current = latest.get(key);
    if (!current || entry.matchTimestamp > current.timestamp) {
      latest.set(key, { matchId: entry.matchId, timestamp: entry.matchTimestamp });
    }
  });

  return {
    clubCount: latest.size,
    entries: entries.filter((entry) => latest.get(teamKey(entry))?.matchId === entry.matchId),
  };
}

function buildRoundSnapshots(entries: ScoreEntry[], sportId?: string | null): RoundSnapshot[] {
  const groups = new Map<string, {
    label: string;
    sortNumber: number | null;
    firstTimestamp: number;
    matchIds: Set<string>;
    clubKeys: Set<string>;
    entries: ScoreEntry[];
  }>();

  entries.forEach((entry) => {
    const current = groups.get(entry.roundKey) ?? {
      label: entry.roundLabel,
      sortNumber: parseRoundNumber(entry.roundLabel),
      firstTimestamp: entry.matchTimestamp || Number.MAX_SAFE_INTEGER,
      matchIds: new Set<string>(),
      clubKeys: new Set<string>(),
      entries: [],
    };

    current.firstTimestamp = Math.min(current.firstTimestamp, entry.matchTimestamp || current.firstTimestamp);
    current.matchIds.add(entry.matchId);
    current.clubKeys.add(teamKey(entry));
    current.entries.push(entry);
    groups.set(entry.roundKey, current);
  });

  return Array.from(groups.entries())
    .map(([key, group]) => {
      const pool = getTeamPool(group.entries, sportId);
      return {
        key,
        label: group.label,
        sortNumber: group.sortNumber,
        firstTimestamp: group.firstTimestamp === Number.MAX_SAFE_INTEGER ? 0 : group.firstTimestamp,
        matchCount: group.matchIds.size,
        clubCount: group.clubKeys.size,
        entries: group.entries,
        team: buildTeamByPosition(pool, sportId),
      };
    })
    .sort((left, right) => {
      if (left.sortNumber !== null || right.sortNumber !== null) {
        return (right.sortNumber ?? -1) - (left.sortNumber ?? -1);
      }
      return right.firstTimestamp - left.firstTimestamp;
    });
}

function buildAverageRows(entries: ScoreEntry[]) {
  const rows = new Map<string, {
    key: string;
    playerName: string;
    teamName: string;
      position: string | null;
      teamLogo: string | null;
      ratings: number[];
    best: number;
    lastRating: number;
    lastTimestamp: number;
    lastMatchId: string;
    lastMatchLabel: string;
  }>();

  entries.forEach((entry) => {
    const key = entry.playerId || `${normalizeKey(entry.playerName)}:${normalizeKey(entry.teamName)}`;
    const current = rows.get(key) ?? {
      key,
      playerName: entry.playerName,
      teamName: entry.teamName,
      position: entry.position,
      teamLogo: entry.teamLogo,
      ratings: [],
      best: entry.rating,
      lastRating: entry.rating,
      lastTimestamp: entry.matchTimestamp,
      lastMatchId: entry.matchId,
      lastMatchLabel: entry.matchLabel,
    };

    current.ratings.push(entry.rating);
    current.best = Math.max(current.best, entry.rating);
    if (!current.position && entry.position) current.position = entry.position;
    if (!current.teamLogo && entry.teamLogo) current.teamLogo = entry.teamLogo;
    if (entry.matchTimestamp >= current.lastTimestamp) {
      current.lastRating = entry.rating;
      current.lastTimestamp = entry.matchTimestamp;
      current.lastMatchId = entry.matchId;
      current.lastMatchLabel = entry.matchLabel;
    }
    rows.set(key, current);
  });

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      matches: row.ratings.length,
      average: row.ratings.reduce((sum, rating) => sum + rating, 0) / row.ratings.length,
    }))
    .sort((left, right) =>
      right.average - left.average ||
      right.matches - left.matches ||
      left.playerName.localeCompare(right.playerName, 'es'),
    );
}

function renderRatingPill(value: number, strong = false) {
  return (
    <span className={`${styles.ratingPill} ${strong ? styles.ratingPillStrong : ''}`}>
      {formatRating(value)}
    </span>
  );
}

export default function TournamentScoresPanel({
  tournamentId,
  tournamentName,
  tournamentLogo,
  sportId,
  matches,
}: TournamentScoresPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<ScoresSubTab>('scores');
  const [scoreMode, setScoreMode] = useState<ScoreMode>('average');
  const [selectedRoundKey, setSelectedRoundKey] = useState<string | null>(null);
  const [externalOverrides, setExternalOverrides] = useState<Record<string, ExternalOverride>>({});
  const [overridesLoading, setOverridesLoading] = useState(false);

  const overrideMatchIds = useMemo(() => {
    return matches
      .map((rawMatch) => toRecord(rawMatch))
      .filter((match) => !hasRatedLineups(match.lineups))
      .map(getMatchId)
      .filter((matchId) => matchId && !UUID_RE.test(matchId))
      .slice(0, 120);
  }, [matches]);

  const overrideMatchIdsKey = overrideMatchIds.join(',');

  useEffect(() => {
    if (!overrideMatchIdsKey) {
      setExternalOverrides({});
      return;
    }

    let active = true;
    setOverridesLoading(true);

    fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/lineup-overrides?matchIds=${encodeURIComponent(overrideMatchIdsKey)}`, {
      cache: 'no-store',
    })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!active) return;

        const next: Record<string, ExternalOverride> = {};
        if (Array.isArray(payload?.overrides)) {
          payload.overrides.forEach((override: ExternalOverride) => {
            if (override?.matchId) next[override.matchId] = override;
          });
        }
        setExternalOverrides(next);
      })
      .catch(() => {
        if (active) setExternalOverrides({});
      })
      .finally(() => {
        if (active) setOverridesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [overrideMatchIdsKey, tournamentId]);

  const scoreEntries = useMemo(
    () => buildScoreEntries(matches, externalOverrides),
    [matches, externalOverrides],
  );

  const averageRows = useMemo(() => buildAverageRows(scoreEntries), [scoreEntries]);
  const individualRows = useMemo(
    () => [...scoreEntries].sort((left, right) =>
      right.matchTimestamp - left.matchTimestamp ||
      right.rating - left.rating ||
      left.playerName.localeCompare(right.playerName, 'es'),
    ),
    [scoreEntries],
  );

  const latestClubData = useMemo(() => buildLatestClubEntries(scoreEntries), [scoreEntries]);
  const currentTeam = useMemo(
    () => buildTeamByPosition(getTeamPool(latestClubData.entries, sportId), sportId),
    [latestClubData.entries, sportId],
  );
  const roundSnapshots = useMemo(
    () => buildRoundSnapshots(scoreEntries, sportId),
    [scoreEntries, sportId],
  );

  useEffect(() => {
    if (roundSnapshots.length === 0) {
      setSelectedRoundKey(null);
      return;
    }

    if (!selectedRoundKey || !roundSnapshots.some((round) => round.key === selectedRoundKey)) {
      setSelectedRoundKey(roundSnapshots[0].key);
    }
  }, [roundSnapshots, selectedRoundKey]);

  const selectedRound = roundSnapshots.find((round) => round.key === selectedRoundKey) ?? roundSnapshots[0] ?? null;
  const tournamentLabel = readString(tournamentName) || 'Torneo';
  const hasEntries = scoreEntries.length > 0;
  const teamOfRoundExportData = useMemo<TeamOfWeekData | null>(() => {
    if (currentTeam.length === 0) return null;

    const latestTimestamp = latestClubData.entries.reduce(
      (maxTimestamp, entry) => Math.max(maxTimestamp, entry.matchTimestamp || 0),
      0,
    );
    const dateLabel = latestTimestamp ? formatDate(latestTimestamp) : '';
    const clubLabel = `${latestClubData.clubCount} club${latestClubData.clubCount === 1 ? '' : 'es'}`;
    const replacements = getTeamOfWeekReplacementEntries(latestClubData.entries, currentTeam, sportId)
      .map((entry, index) => mapEntryToTeamOfWeekReplacement(entry, index, sportId));

    return {
      title: 'Equipo de la semana',
      subtitle: tournamentLabel,
      tournament: tournamentLabel,
      tournamentLogo: readString(tournamentLogo) || undefined,
      date: dateLabel,
      meta: [dateLabel, clubLabel].filter(Boolean).join(' - '),
      venue: 'Equipo de la semana',
      players: currentTeam.slice(0, 15).map(mapSlotToTeamOfWeekPlayer),
      replacements,
    };
  }, [currentTeam, latestClubData.clubCount, latestClubData.entries, sportId, tournamentLabel, tournamentLogo]);
  const teamOfRoundExportFilename = `equipo-semana-${normalizeKey(tournamentLabel) || tournamentId}`;

  const renderEmptyState = (title: string, detail: string) => (
    <div className={styles.emptyState}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );

  const renderTeamSlots = (slots: TeamSlot[]) => {
    if (slots.length === 0) {
      return renderEmptyState(
        'Sin equipo armado',
        'Todavia no hay jugadores con puntaje y posicion para esta vista.',
      );
    }

    return (
      <div className={styles.teamGrid}>
        {slots.map((slot) => {
          const positionMeta = getSlotPositionMeta(slot);
          return (
            <article key={`${slot.positionKey}-${slot.entry.key}`} className={styles.teamSlot}>
              <div className={styles.slotIdentity}>
                <span
                  className={styles.teamCrest}
                  style={getLogoStyle(slot.entry.teamLogo)}
                  aria-label={`Escudo de ${slot.entry.teamName}`}
                  role="img"
                >
                  {!slot.entry.teamLogo ? getInitials(slot.entry.teamName) : null}
                </span>
                <div className={styles.identityText}>
                  <strong className={styles.playerName}>{slot.entry.playerName}</strong>
                  <span className={styles.clubPosition}>
                    {slot.entry.teamName} - {positionMeta.positionLabel}
                  </span>
                </div>
                <span className={styles.positionNumber}>{positionMeta.numberLabel}</span>
              </div>

              <div className={styles.scoreBlock}>
                <span>Puntaje</span>
                <strong>{formatRating(slot.entry.rating)}</strong>
              </div>

              {slot.entry.matchId ? (
                <Link className={styles.matchLink} href={`/matches/${slot.entry.matchId}`}>
                  <span>Partido</span>
                  {slot.entry.matchLabel}
                </Link>
              ) : (
                <span className={styles.matchLinkMuted}>
                  <span>Partido</span>
                  {slot.entry.matchLabel}
                </span>
              )}
            </article>
          );
        })}
      </div>
    );
  };

  return (
    <section className={styles.shell}>
      <div className={styles.header}>
        <div>
          <span className={styles.kicker}>Puntajes</span>
          <h2>{tournamentLabel}</h2>
          <p>Promedios, partido por partido y equipos por fecha desde las alineaciones guardadas.</p>
        </div>

        <div className={styles.metrics}>
          <div>
            <span>Jugadores</span>
            <strong>{averageRows.length}</strong>
          </div>
          <div>
            <span>Registros</span>
            <strong>{scoreEntries.length}</strong>
          </div>
          <div>
            <span>Fechas</span>
            <strong>{roundSnapshots.length}</strong>
          </div>
        </div>
      </div>

      <div className={styles.subTabs} role="tablist" aria-label="Vistas de puntajes">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.subTab} ${activeSubTab === tab.id ? styles.subTabActive : ''}`}
            onClick={() => setActiveSubTab(tab.id)}
            role="tab"
            aria-selected={activeSubTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!hasEntries && (
        renderEmptyState(
          overridesLoading ? 'Buscando puntajes guardados' : 'Sin puntajes cargados',
          overridesLoading
            ? 'Estamos revisando overrides de alineaciones externas.'
            : 'Cuando un partido tenga alineaciones con rating, va a aparecer aca.',
        )
      )}

      {hasEntries && activeSubTab === 'scores' && (
        <div className={styles.panel}>
          <div className={styles.panelToolbar}>
            <div>
              <h3>Puntajes</h3>
              <span>{scoreMode === 'average' ? 'Ranking por promedio' : 'Cada actuacion cargada'}</span>
            </div>
            <div className={styles.segmented} aria-label="Modo de puntajes">
              <button
                type="button"
                className={scoreMode === 'average' ? styles.segmentActive : ''}
                onClick={() => setScoreMode('average')}
              >
                Promedios
              </button>
              <button
                type="button"
                className={scoreMode === 'individual' ? styles.segmentActive : ''}
                onClick={() => setScoreMode('individual')}
              >
                Partido por partido
              </button>
            </div>
          </div>

          {scoreMode === 'average' ? (
            <div className={styles.tableWrap}>
              <table className={styles.scoreTable}>
                <thead>
                  <tr>
                    <th>Jugador</th>
                    <th>Equipo</th>
                    <th>Posicion</th>
                    <th>PJ</th>
                    <th>Prom</th>
                    <th>Mejor</th>
                    <th>Ultimo</th>
                  </tr>
                </thead>
                <tbody>
                  {averageRows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <strong>{row.playerName}</strong>
                      </td>
                      <td>
                        <span className={styles.teamCell}>
                          <span
                            className={styles.tableCrest}
                            style={getLogoStyle(row.teamLogo)}
                            aria-hidden="true"
                          >
                            {!row.teamLogo ? getInitials(row.teamName) : null}
                          </span>
                          {row.teamName}
                        </span>
                      </td>
                      <td>{row.position || 'Sin posicion'}</td>
                      <td>{row.matches}</td>
                      <td>{renderRatingPill(row.average, true)}</td>
                      <td>{renderRatingPill(row.best)}</td>
                      <td>
                        {row.lastMatchId ? (
                          <Link className={styles.tableLink} href={`/matches/${row.lastMatchId}`}>
                            {formatRating(row.lastRating)}
                          </Link>
                        ) : (
                          formatRating(row.lastRating)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.scoreTable}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Jugador</th>
                    <th>Equipo</th>
                    <th>Partido</th>
                    <th>Puntaje</th>
                  </tr>
                </thead>
                <tbody>
                  {individualRows.map((entry) => (
                    <tr key={entry.key}>
                      <td>{entry.dateLabel}</td>
                      <td>
                        <strong>{entry.playerName}</strong>
                        <span className={styles.cellMeta}>{entry.position || entry.role || 'Sin posicion'}</span>
                      </td>
                      <td>
                        <span className={styles.teamCell}>
                          <span
                            className={styles.tableCrest}
                            style={getLogoStyle(entry.teamLogo)}
                            aria-hidden="true"
                          >
                            {!entry.teamLogo ? getInitials(entry.teamName) : null}
                          </span>
                          {entry.teamName}
                        </span>
                      </td>
                      <td>
                        {entry.matchId ? (
                          <Link className={styles.tableLink} href={`/matches/${entry.matchId}`}>
                            {entry.matchLabel}
                          </Link>
                        ) : (
                          entry.matchLabel
                        )}
                      </td>
                      <td>{renderRatingPill(entry.rating, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {hasEntries && activeSubTab === 'team-of-round' && (
        <div className={styles.panel}>
          <div className={styles.panelToolbar}>
            <div>
              <h3>Equipo de la fecha</h3>
              <span>Ultimo partido con puntaje de cada club: {latestClubData.clubCount} clubes</span>
            </div>
            {teamOfRoundExportData && (
              <ExportImage
                template="teamOfWeek"
                filename={teamOfRoundExportFilename}
                data={teamOfRoundExportData}
              />
            )}
          </div>
          {renderTeamSlots(currentTeam)}
        </div>
      )}

      {hasEntries && activeSubTab === 'history' && (
        <div className={styles.historyLayout}>
          <aside className={styles.roundRail} aria-label="Fechas con puntajes">
            {roundSnapshots.map((round) => (
              <button
                key={round.key}
                type="button"
                className={`${styles.roundButton} ${selectedRound?.key === round.key ? styles.roundButtonActive : ''}`}
                onClick={() => setSelectedRoundKey(round.key)}
              >
                <strong>{round.label}</strong>
                <span>{round.matchCount} partidos · {round.clubCount} clubes</span>
              </button>
            ))}
          </aside>

          <div className={styles.panel}>
            {selectedRound ? (
              <>
                <div className={styles.panelToolbar}>
                  <div>
                    <h3>{selectedRound.label}</h3>
                    <span>{selectedRound.matchCount} partidos con {selectedRound.entries.length} puntajes</span>
                  </div>
                </div>
                {renderTeamSlots(selectedRound.team)}
              </>
            ) : (
              renderEmptyState('Sin fechas', 'No hay fechas con puntajes guardados para mostrar.')
            )}
          </div>
        </div>
      )}
    </section>
  );
}
