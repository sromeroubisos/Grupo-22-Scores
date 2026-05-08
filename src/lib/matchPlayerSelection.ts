export type MatchPlayerSelectionTeam = 'home' | 'away';

export interface MatchPlayerSelectionPlayer {
  id?: string | null;
  number?: number | string | null;
  name?: string | null;
  position?: string | null;
  role?: string | null;
}

export interface MatchPlayerSelectionEvent {
  id?: string | null;
  minute?: number | string | null;
  sequence?: number | null;
  type?: string | null;
  team?: MatchPlayerSelectionTeam | null;
  playerId?: string | null;
  player_id?: string | null;
  playerName?: string | null;
  player_name?: string | null;
  secondaryPlayerId?: string | null;
  secondary_player_id?: string | null;
  secondaryPlayerName?: string | null;
  secondary_player_name?: string | null;
  subPlayerId?: string | null;
  sub_player_id?: string | null;
  subPlayer?: string | null;
  sub_player?: string | null;
  detail?: string | null;
}

export interface MatchPlayerSelectionOption {
  key: string;
  playerId: string | null;
  name: string;
  number: number | string | null;
  position: string | null;
  role: string | null;
}

export interface MatchPlayerSelectionGroups {
  active: MatchPlayerSelectionOption[];
  substitutes: MatchPlayerSelectionOption[];
}

interface IndexedPlayerOption extends MatchPlayerSelectionOption {
  initialIndex: number;
}

function normalizeLookupKey(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeRole(value: unknown) {
  return normalizeLookupKey(value).replace(/\s+/g, '_');
}

function parseJerseyNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value ?? '').match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function comparePlayerOptions(left: IndexedPlayerOption, right: IndexedPlayerOption) {
  const leftNumber = parseJerseyNumber(left.number);
  const rightNumber = parseJerseyNumber(right.number);

  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  if (leftNumber !== null && rightNumber === null) return -1;
  if (leftNumber === null && rightNumber !== null) return 1;

  const byName = left.name.localeCompare(right.name, 'es', { sensitivity: 'base' });
  if (byName !== 0) return byName;
  return left.initialIndex - right.initialIndex;
}

function isStarterRole(player: MatchPlayerSelectionOption) {
  const role = normalizeRole(player.role);
  if (role === 'starter' || role === 'titular' || role === 'starting' || role === 'start') return true;
  if (role === 'substitute' || role === 'suplente' || role === 'bench' || role === 'reserve' || role === 'reserva') return false;

  const number = parseJerseyNumber(player.number);
  return number === null || number <= 15;
}

function toPlayerOption(player: MatchPlayerSelectionPlayer, index: number): IndexedPlayerOption | null {
  const name = String(player.name || '').trim();
  if (!name) return null;
  const playerId = String(player.id || '').trim() || null;
  return {
    key: playerId ? `id:${playerId}` : `name:${normalizeLookupKey(name)}`,
    playerId,
    name,
    number: player.number ?? null,
    position: String(player.position || '').trim() || null,
    role: String(player.role || '').trim() || null,
    initialIndex: index,
  };
}

function createFallbackOption(name: string, initialIndex: number): IndexedPlayerOption {
  const trimmedName = name.trim();
  return {
    key: `name:${normalizeLookupKey(trimmedName)}`,
    playerId: null,
    name: trimmedName,
    number: null,
    position: null,
    role: null,
    initialIndex,
  };
}

function parseEventMinute(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').match(/\d+/)?.[0] ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSubstitutionIncoming(detail: unknown) {
  const match = String(detail || '').match(/Entra:\s*(.+)$/i);
  return match?.[1]?.trim() || '';
}

function getEventPlayerId(event: MatchPlayerSelectionEvent, secondary = false) {
  if (secondary) {
    return String(event.secondaryPlayerId ?? event.secondary_player_id ?? event.subPlayerId ?? event.sub_player_id ?? '').trim();
  }
  return String(event.playerId ?? event.player_id ?? '').trim();
}

function getEventPlayerName(event: MatchPlayerSelectionEvent, secondary = false) {
  if (secondary) {
    return String(
      event.secondaryPlayerName
      ?? event.secondary_player_name
      ?? event.subPlayer
      ?? event.sub_player
      ?? parseSubstitutionIncoming(event.detail)
      ?? ''
    ).trim();
  }
  return String(event.playerName ?? event.player_name ?? '').trim();
}

function getSelectionKey(playerId: string, name: string) {
  if (playerId) return `id:${playerId}`;
  const normalizedName = normalizeLookupKey(name);
  return normalizedName ? `name:${normalizedName}` : '';
}

function matchesSelection(player: MatchPlayerSelectionOption, playerId: string, name: string) {
  if (playerId && player.playerId === playerId) return true;
  return Boolean(name) && normalizeLookupKey(player.name) === normalizeLookupKey(name);
}

function sortSubstitutionEvents(events: MatchPlayerSelectionEvent[]) {
  return events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.type === 'substitution')
    .sort((left, right) => {
      const minuteDiff = parseEventMinute(left.event.minute) - parseEventMinute(right.event.minute);
      if (minuteDiff !== 0) return minuteDiff;

      const leftSequence = typeof left.event.sequence === 'number' ? left.event.sequence : 0;
      const rightSequence = typeof right.event.sequence === 'number' ? right.event.sequence : 0;
      if (leftSequence !== rightSequence) return leftSequence - rightSequence;

      return left.index - right.index;
    })
    .map(({ event }) => event);
}

export function buildMatchPlayerSelectionGroups(
  players: MatchPlayerSelectionPlayer[],
  events: MatchPlayerSelectionEvent[],
  team: MatchPlayerSelectionTeam,
  options?: { excludeEventId?: string | null },
): MatchPlayerSelectionGroups {
  const indexedPlayers = players
    .map(toPlayerOption)
    .filter((player): player is IndexedPlayerOption => player !== null);

  const playerByKey = new Map(indexedPlayers.map((player) => [player.key, player]));
  const playersByName = new Map(indexedPlayers.map((player) => [normalizeLookupKey(player.name), player]));
  const starterSlots = indexedPlayers
    .filter(isStarterRole)
    .sort(comparePlayerOptions)
    .map((player) => ({ player }));
  const unavailableKeys = new Set<string>();

  for (const event of sortSubstitutionEvents(events)) {
    if (event.team !== team) continue;
    if (options?.excludeEventId && event.id === options.excludeEventId) continue;

    const outgoingId = getEventPlayerId(event);
    const outgoingName = getEventPlayerName(event);
    const incomingId = getEventPlayerId(event, true);
    const incomingName = getEventPlayerName(event, true);
    if (!outgoingName || !incomingName) continue;

    const outgoingIndex = starterSlots.findIndex(({ player }) => matchesSelection(player, outgoingId, outgoingName));
    const incomingKey = getSelectionKey(incomingId, incomingName);
    const incomingPlayer =
      (incomingKey ? playerByKey.get(incomingKey) : undefined)
      || playersByName.get(normalizeLookupKey(incomingName))
      || createFallbackOption(incomingName, indexedPlayers.length + unavailableKeys.size);

    if (outgoingIndex >= 0) {
      starterSlots[outgoingIndex] = { player: incomingPlayer };
    }

    const outgoingKey = getSelectionKey(outgoingId, outgoingName);
    if (outgoingKey) unavailableKeys.add(outgoingKey);
  }

  const active = starterSlots.map(({ player }) => player);
  const activeKeys = new Set(active.map((player) => player.key));
  const substitutes = indexedPlayers
    .filter((player) => !activeKeys.has(player.key) && !unavailableKeys.has(player.key))
    .sort(comparePlayerOptions);

  return { active, substitutes };
}

export function formatMatchPlayerOptionLabel(option: MatchPlayerSelectionOption) {
  const numberLabel = option.number !== null && option.number !== undefined && String(option.number).trim()
    ? `#${option.number} `
    : '';
  const positionLabel = option.position ? ` (${option.position})` : '';
  return `${numberLabel}${option.name}${positionLabel}`;
}

export function findMatchPlayerSelectionOption(
  groups: MatchPlayerSelectionGroups,
  value: string | null | undefined,
) {
  const key = normalizeLookupKey(value);
  if (!key) return null;
  return [...groups.active, ...groups.substitutes].find((option) => normalizeLookupKey(option.name) === key) || null;
}

export function preserveMatchPlayerOption(
  players: MatchPlayerSelectionPlayer[],
  groups: MatchPlayerSelectionGroups,
  value: string | null | undefined,
) {
  const name = String(value || '').trim();
  if (!name || findMatchPlayerSelectionOption(groups, name)) return null;
  const normalizedName = normalizeLookupKey(name);
  const existing = players
    .map(toPlayerOption)
    .filter((player): player is IndexedPlayerOption => player !== null)
    .find((player) => normalizeLookupKey(player.name) === normalizedName);

  return existing || createFallbackOption(name, players.length);
}
