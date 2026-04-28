import styles from './ClubMatchWorkspace.module.css';
import {
  formatMatchTimelineEventDescription,
  isGoalKickAttemptEvent,
  isGoalKickMade,
  parseKickMetersFromDetail,
} from '@/lib/matchEventStats';
import type {
  AvailabilityStatus,
  ClubCallup,
  ClubLiveControl,
  ClubLiveEvent,
  ClubLineupsState,
  ClubMediaPlan,
  Division,
  LiveActionType,
  LiveComposerState,
  LivePhase,
  MatchClockState,
  MatchData,
  MatchDraftState,
  MatchEventTeam,
  MatchLineupPlayer,
  MatchStats,
  MatchStatus,
  PlayerEventStats,
  SectionTab,
} from './ClubMatchWorkspace.types';

export const TABS: Array<{ id: SectionTab; label: string }> = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'alineacion', label: 'Alineación' },
  { id: 'vivo', label: 'En Vivo' },
  { id: 'estadisticas', label: 'Estadísticas' },
  { id: 'postpartido', label: 'Postpartido' },
  { id: 'contenido', label: 'Contenido' },
];

export const MATCH_STATUS_OPTIONS: Array<{ value: MatchStatus; label: string }> = [
  { value: 'scheduled', label: 'Programado' },
  { value: 'live', label: 'En Juego' },
  { value: 'final', label: 'Finalizado' },
  { value: 'suspended', label: 'Suspendido' },
  { value: 'postponed', label: 'Postergado' },
];

export const LEGACY_EVENT_TYPES = [
  { value: 'goal', label: 'Gol / score' },
  { value: 'try', label: 'Try' },
  { value: 'card_yellow', label: 'Amarilla' },
  { value: 'card_red', label: 'Roja' },
  { value: 'substitution', label: 'Cambio' },
  { value: 'injury', label: 'Lesión' },
  { value: 'note', label: 'Nota' },
];

export const EVENT_TYPES = [
  { value: 'try', label: 'Try' },
  { value: 'penalty_try', label: 'Penalty Try' },
  { value: 'conversion', label: 'Conversión' },
  { value: 'penalty', label: 'Penal' },
  { value: 'scrum', label: 'Scrum' },
  { value: 'line', label: 'Line' },
  { value: 'free_kick', label: 'Free Kick' },
  { value: 'card_yellow', label: 'Amarilla' },
  { value: 'card_red', label: 'Roja' },
  { value: 'kick', label: 'Kick' },
  { value: 'knock_on', label: 'Knock On' },
  { value: 'forward_pass', label: 'Pase Forward' },
  { value: 'tackle', label: 'Tackle' },
  { value: 'pass', label: 'Pase' },
  { value: 'substitution', label: 'Sustitución' },
  { value: 'match_start', label: 'Inicio Partido' },
  { value: 'match_half', label: 'Entretiempo' },
  { value: 'match_end', label: 'Final Partido' },
  { value: 'ruck', label: 'Ruck' },
  { value: 'entradas_22', label: 'Entradas en 22' },
  { value: 'note', label: 'Nota' },
];

export const LIVE_SUBVIEWS: Array<{ id: LiveSubview; label: string }> = [
  { id: 'eventos', label: 'En vivo' },
  { id: 'datos', label: 'Datos rápidos' },
];

export const LIVE_PHASE_OPTIONS: Array<{ value: LivePhase; label: string }> = [
  { value: '1T', label: '1T' },
  { value: 'HT', label: 'HT' },
  { value: '2T', label: '2T' },
  { value: 'FT', label: 'Final' },
];

export const LIVE_EVENT_ACTIONS: Array<{
  id: LiveActionType;
  label: string;
  glyph: string;
  tone: 'green' | 'yellow' | 'blue' | 'neutral' | 'red' | 'brown';
}> = [
  { id: 'try', label: 'Try', glyph: 'TR', tone: 'green' },
  { id: 'penalty_try', label: 'Penalty Try', glyph: 'PT', tone: 'green' },
  { id: 'conversion', label: 'Conversión', glyph: 'CV', tone: 'blue' },
  { id: 'penalty', label: 'Penal', glyph: 'PN', tone: 'yellow' },
  { id: 'scrum', label: 'Scrum', glyph: 'SC', tone: 'brown' },
  { id: 'line', label: 'Line', glyph: 'LN', tone: 'neutral' },
  { id: 'free_kick', label: 'Free Kick', glyph: 'FK', tone: 'blue' },
  { id: 'card', label: 'Tarjeta', glyph: 'TC', tone: 'red' },
  { id: 'kick', label: 'Kick', glyph: 'PK', tone: 'blue' },
  { id: 'knock_on', label: 'Knock On', glyph: 'KO', tone: 'neutral' },
  { id: 'forward_pass', label: 'Pase Fwd', glyph: 'PF', tone: 'neutral' },
  { id: 'tackle', label: 'Tackle', glyph: 'TK', tone: 'neutral' },
  { id: 'pass', label: 'Pase', glyph: 'PS', tone: 'blue' },
  { id: 'substitution', label: 'Sustitución', glyph: 'SU', tone: 'blue' },
  { id: 'match_start', label: 'Inicio', glyph: 'IN', tone: 'green' },
  { id: 'match_half', label: 'HT', glyph: 'HT', tone: 'yellow' },
  { id: 'match_end', label: 'Fin', glyph: 'FN', tone: 'red' },
  { id: 'entradas_22', label: 'Entradas en 22', glyph: '22', tone: 'green' },
];

export const KICK_TYPES: Array<{ value: LiveComposerState['kickType']; label: string }> = [
  { value: 'touch', label: 'Al touch' },
  { value: '50_22', label: '50/22' },
  { value: 'drop_ingoal', label: 'Drop ingoal' },
  { value: '22_exit', label: 'Salida de 22' },
  { value: 'clearance', label: 'Clearance' },
  { value: 'box_kick', label: 'Box kick' },
  { value: 'up_and_under', label: 'Up and under' },
  { value: 'cross_kick', label: 'Cross kick' },
];

export const PENALTY_REASONS: Array<{ value: string; label: string }> = [
  { value: 'not_releasing', label: 'No soltar (Not releasing)' },
  { value: 'not_rolling_away', label: 'No salir (Not rolling away)' },
  { value: 'side_entry', label: 'Entrada lateral (Side entry)' },
  { value: 'off_feet', label: 'Pescar sin apoyo (Off feet)' },
  { value: 'offside_ruck', label: 'Offside en ruck/maul' },
  { value: 'offside_open', label: 'Offside en juego abierto' },
  { value: 'high_tackle', label: 'Tacle alto' },
  { value: 'tackle_in_air', label: 'Tacle en el aire' },
  { value: 'shoulder_charge', label: 'Shoulder charge' },
  { value: 'dangerous_clean', label: 'Limpieza peligrosa' },
  { value: 'scrum_collapse', label: 'Derrumbar scrum' },
  { value: 'maul_crossing', label: 'Cruzar en maul' },
  { value: 'other', label: 'Otra infracción' },
];

export function normalizeStatus(status: string | null | undefined): MatchStatus {
  const value = String(status || '').toLowerCase();
  if (value === 'live' || value === 'in_play') return 'live';
  if (value === 'final' || value === 'finished' || value === 'ft') return 'final';
  if (value === 'suspended') return 'suspended';
  if (value === 'postponed') return 'postponed';
  return 'scheduled';
}

export function getStatusLabel(status: MatchStatus) {
  return MATCH_STATUS_OPTIONS.find((option) => option.value === status)?.label || 'Programado';
}

export function getStatusClass(status: MatchStatus) {
  if (status === 'live') return styles.statusLive;
  if (status === 'final') return styles.statusFinal;
  if (status === 'suspended') return styles.statusSuspended;
  if (status === 'postponed') return styles.statusPostponed;
  return styles.statusScheduled;
}

export function formatDateTime(value: string | null) {
  if (!value) return { date: 'Fecha a confirmar', time: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: 'Fecha a confirmar', time: '' };
  return {
    date: new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date),
  };
}

export function toDateTimeLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function fromDateTimeLocalInput(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function ensureString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export function ensureInputString(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function ensureArray<T>(value: unknown, mapper: (row: Record<string, unknown>) => T) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => mapper((row && typeof row === 'object' ? row : {}) as Record<string, unknown>));
}

export function ensureBoolean(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function normalizeClockState(source: unknown): MatchClockState | null {
  if (!source || typeof source !== 'object') return null;
  const row = source as Record<string, unknown>;
  const minute = parseNumericInput(ensureInputString(row.minute));
  const seconds = parseNumericInput(ensureInputString(row.seconds));
  return {
    minute,
    seconds: seconds === null ? 0 : Math.max(0, Math.min(59, seconds)),
    period: ensureString(row.period) || null,
    running: typeof row.running === 'boolean' ? row.running : ensureBoolean(row.running),
    syncedAt: ensureString(row.syncedAt ?? row.synced_at) || null,
  };
}

export function resolveLivePhase(value: unknown): LivePhase {
  const normalized = ensureString(value).toUpperCase();
  if (normalized === 'HT') return 'HT';
  if (normalized === '2T' || normalized === '2ND' || normalized === 'SECOND HALF') return '2T';
  if (normalized === 'FT' || normalized === 'FINAL') return 'FT';
  return '1T';
}

export function createDefaultLiveControl(): ClubLiveControl {
  return {
    phase: '1T',
    minute: '',
    homeResult: 'draw',
    awayResult: 'draw',
    homeTablePoints: '',
    awayTablePoints: '',
    homeBonusOffensive: false,
    awayBonusOffensive: false,
    homeBonusDefensive: false,
    awayBonusDefensive: false,
  };
}

export function ensureLineupsState(source: unknown, clock?: unknown): ClubLineupsState {
  const base = source && typeof source === 'object' ? { ...(source as Record<string, unknown>) } : {};
  const liveControlBase = (base.liveControl && typeof base.liveControl === 'object'
    ? base.liveControl
    : {}) as Record<string, unknown>;
  const clockState = normalizeClockState(clock);
  return {
    ...base,
    home: ensureArray(base.home, (player) => ({
      id: ensureString(player.id) || undefined,
      number: ensureInputString(player.number) || ensureInputString(player.jerseyNumber),
      name: ensureString(player.name),
      position: ensureString(player.position),
      role: ensureString(player.role),
      rating: parseNumericInput(ensureInputString(player.rating ?? player.playerRating)),
      isCaptain: Boolean(player.isCaptain),
      squadMemberId: ensureString(player.squadMemberId) || null,
      divisionId: ensureString(player.divisionId) || null,
    })),
    away: ensureArray(base.away, (player) => ({
      id: ensureString(player.id) || undefined,
      number: ensureInputString(player.number) || ensureInputString(player.jerseyNumber),
      name: ensureString(player.name),
      position: ensureString(player.position),
      role: ensureString(player.role),
      rating: parseNumericInput(ensureInputString(player.rating ?? player.playerRating)),
      isCaptain: Boolean(player.isCaptain),
      squadMemberId: ensureString(player.squadMemberId) || null,
      divisionId: ensureString(player.divisionId) || null,
    })),
    callups: ensureArray(base.callups, (row) => ({
      name: ensureString(row.name),
      status: (ensureString(row.status) as AvailabilityStatus) || 'pending',
      attendance: ensureString(row.attendance),
      position: ensureString(row.position),
      note: ensureString(row.note),
    })),
    tacticalNotes: ensureString(base.tacticalNotes ?? base.tactical_notes),
    postmatch: {
      analysis: ensureString((base.postmatch as Record<string, unknown> | undefined)?.analysis),
      report: ensureString((base.postmatch as Record<string, unknown> | undefined)?.report),
      recovery: ensureString((base.postmatch as Record<string, unknown> | undefined)?.recovery),
      nextSteps: ensureString((base.postmatch as Record<string, unknown> | undefined)?.nextSteps),
    },
    media: {
      headline: ensureString((base.media as Record<string, unknown> | undefined)?.headline),
      socialCopy: ensureString((base.media as Record<string, unknown> | undefined)?.socialCopy),
      assetStatus: (ensureString((base.media as Record<string, unknown> | undefined)?.assetStatus) as ClubMediaPlan['assetStatus']) || 'pending',
    },
    statsSummary: {
      overview: ensureString((base.statsSummary as Record<string, unknown> | undefined)?.overview),
      keyNumbers: ensureString((base.statsSummary as Record<string, unknown> | undefined)?.keyNumbers),
      pendingFocus: ensureString((base.statsSummary as Record<string, unknown> | undefined)?.pendingFocus),
    },
    workflow: {
      preMatch: ensureString((base.workflow as Record<string, unknown> | undefined)?.preMatch),
      postMatch: ensureString((base.workflow as Record<string, unknown> | undefined)?.postMatch),
    },
    liveControl: {
      ...createDefaultLiveControl(),
      phase: (ensureString(liveControlBase.phase) as LivePhase) || resolveLivePhase(clockState?.period),
      minute: ensureInputString(liveControlBase.minute) || ensureInputString(clockState?.minute),
      homeResult: (ensureString(liveControlBase.homeResult) as ClubLiveControl['homeResult']) || 'draw',
      awayResult: (ensureString(liveControlBase.awayResult) as ClubLiveControl['awayResult']) || 'draw',
      homeTablePoints: ensureInputString(liveControlBase.homeTablePoints),
      awayTablePoints: ensureInputString(liveControlBase.awayTablePoints),
      homeBonusOffensive: ensureBoolean(liveControlBase.homeBonusOffensive),
      awayBonusOffensive: ensureBoolean(liveControlBase.awayBonusOffensive),
      homeBonusDefensive: ensureBoolean(liveControlBase.homeBonusDefensive),
      awayBonusDefensive: ensureBoolean(liveControlBase.awayBonusDefensive),
    },
  };
}

export function ensureEvents(source: unknown): ClubLiveEvent[] {
  return ensureArray(source, (row) => {
    const type = ensureString(row.type) || 'note';
    const detail = ensureString(row.detail);
    const secondaryPlayerName =
      ensureString(row.secondaryPlayerName ?? row.secondary_player_name ?? row.subPlayer ?? row.sub_player) ||
      (type === 'substitution' ? parseSubstitutionIncoming(detail) : '');
    return {
      id: ensureString(row.id) || crypto.randomUUID(),
      minute: ensureInputString(row.minute),
      type,
      team: row.team === 'home' || row.team === 'away' ? row.team : null,
      playerId: ensureString(row.playerId ?? row.player_id) || null,
      playerName: ensureString(row.playerName ?? row.player_name),
      secondaryPlayerId: ensureString(row.secondaryPlayerId ?? row.secondary_player_id ?? row.subPlayerId ?? row.sub_player_id) || null,
      secondaryPlayerName,
      detail: detail || (type === 'substitution' && secondaryPlayerName ? `Entra: ${secondaryPlayerName}` : ''),
      videoTime: ensureString(row.videoTime ?? row.video_time) || '',
      parentEventId: ensureString(row.parentEventId ?? row.parent_event_id) || undefined,
      sequence: typeof row.sequence === 'number' ? row.sequence : undefined,
    };
  });
}

export function serializeLiveEvent(event: ClubLiveEvent) {
  return {
    id: event.id,
    minute: parseNumericInput(event.minute) ?? 0,
    type: event.type,
    team: event.team,
    playerId: event.playerId || null,
    playerName: event.playerName.trim(),
    secondaryPlayerId: event.secondaryPlayerId || null,
    secondaryPlayerName: event.secondaryPlayerName?.trim() || '',
    subPlayerId: event.secondaryPlayerId || null,
    subPlayer: event.secondaryPlayerName?.trim() || '',
    detail: event.detail.trim(),
    videoTime: event.videoTime?.trim() || null,
    parentEventId: event.parentEventId,
    sequence: event.sequence,
  };
}

export function ensureScoreValue(value: number | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function buildDraftState(match: MatchData): MatchDraftState {
  return {
    status: normalizeStatus(match.status),
    dateTime: toDateTimeLocalInput(match.date_time),
    venue: match.venue || '',
    referee: match.referee || '',
    broadcastUrl: match.broadcast_url || '',
    score: {
      home: ensureScoreValue(match.score?.home),
      away: ensureScoreValue(match.score?.away),
    },
  };
}

export function buildClockPayload(liveControl: ClubLiveControl, status: MatchStatus, existingClock: unknown): MatchClockState | null {
  const base = normalizeClockState(existingClock);
  const minute = parseNumericInput(liveControl.minute);
  const hasClockSignal = minute !== null || Boolean(liveControl.phase) || Boolean(base);

  if (!hasClockSignal) return null;

  return {
    minute: minute ?? base?.minute ?? 0,
    seconds: base?.seconds ?? 0,
    period: liveControl.phase || base?.period || '1T',
    running: status === 'live' && liveControl.phase !== 'HT' && liveControl.phase !== 'FT',
    syncedAt: new Date().toISOString(),
  };
}

export function buildScorePayload(existingScore: MatchData['score'], draftScore: MatchDraftState['score']) {
  const nextHome = parseNumericInput(draftScore.home);
  const nextAway = parseNumericInput(draftScore.away);
  const base = existingScore && typeof existingScore === 'object'
    ? { ...(existingScore as Record<string, unknown>) }
    : {};

  if (nextHome !== null && nextAway !== null && nextHome !== nextAway) {
    base.penalties = null;
  }

  return {
    ...base,
    home: nextHome,
    away: nextAway,
  };
}

export function parseNumericInput(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createEmptyCallup(): ClubCallup {
  return { name: '', status: 'pending', attendance: '', position: '', note: '' };
}

export function createDefaultCallup(index: number): ClubCallup {
  return {
    name: '',
    status: 'pending',
    attendance: '',
    position: '',
    note: `Lugar ${index + 1}`,
  };
}

export function createEmptyLineupPlayer(): MatchLineupPlayer {
  return { number: '', name: '', position: '', role: 'starter', isCaptain: false };
}

export function createEmptyEvent(): ClubLiveEvent {
  return { id: crypto.randomUUID(), minute: '', type: 'note', team: null, playerName: '', detail: '' };
}

export function createLiveComposer(action: LiveActionType, defaults?: Partial<LiveComposerState>): LiveComposerState {
  return {
    mode: 'create',
    action,
    minute: '',
    team: 'home',
    playerName: '',
    secondaryPlayerName: '',
    outcome: '',
    zone: '',
    reason: '',
    followUpAction: '',
    followUpOutcome: '',
    secondaryTeam: 'home',
    penaltyReason: '',
    kickDistance: '',
    kickType: '',
    videoTime: '',
    passType: '',
    ...defaults,
  };
}

export function getEventTypeLabel(type: string) {
  return EVENT_TYPES.find((option) => option.value === type)?.label
    || LEGACY_EVENT_TYPES.find((option) => option.value === type)?.label
    || 'Evento';
}

export function getEventGlyph(type: string) {
  if (type === 'try') return 'TR';
  if (type === 'penalty_try') return 'PT';
  if (type === 'conversion') return 'CV';
  if (type === 'penalty') return 'PN';
  if (type === 'free_kick') return 'FK';
  if (type === 'tackle') return 'TK';
  if (type === 'substitution') return 'SU';
  if (type === 'scrum') return 'SC';
  if (type === 'line') return 'LN';
  if (type === 'knock_on') return 'KO';
  if (type === 'forward_pass') return 'PF';
  if (type === 'card_yellow') return 'TA';
  if (type === 'card_red') return 'TR';
  if (type === 'kick') return 'PK';
  if (type === 'ruck') return 'RC';
  if (type === 'pass') return 'PS';
  if (type === 'match_start') return 'IN';
  if (type === 'match_half') return 'HT';
  if (type === 'match_end') return 'FN';
  if (type === 'entradas_22') return '22';
  if (type === 'penalty_goal') return 'PG';
  if (type === 'drop_goal') return 'DG';
  return 'EV';
}

export function getEventTone(type: string) {
  if (type === 'try' || type === 'penalty_try') return styles.liveToneGreen;
  if (type === 'penalty' || type === 'card_yellow' || type === 'free_kick') return styles.liveToneYellow;
  if (type === 'conversion' || type === 'substitution') return styles.liveToneBlue;
  if (type === 'card_red') return styles.liveToneRed;
  if (type === 'scrum') return styles.liveToneBrown;
  if (type === 'kick') return styles.liveToneBlue;
  if (type === 'ruck') return styles.liveToneBrown;
  if (type === 'pass') return styles.liveToneBlue;
  if (type === 'match_start') return styles.liveToneGreen;
  if (type === 'match_half') return styles.liveToneYellow;
  if (type === 'match_end') return styles.liveToneRed;
  if (type === 'entradas_22') return styles.liveToneGreen;
  if (type === 'penalty_goal' || type === 'drop_goal') return styles.liveToneBlue;
  return styles.liveToneNeutral;
}

export function parseSubstitutionIncoming(detail: string) {
  const match = detail.match(/Entra:\s*(.+)$/i);
  return match?.[1]?.trim() || '';
}

export function parsePenaltyOutcome(detail: string) {
  const value = detail.toLowerCase();
  if (value.includes('convertido')) return 'converted';
  if (value.includes('fallado')) return 'missed';
  if (value.includes('touch')) return 'touch';
  if (value.includes('rapido')) return 'quick';
  if (value.includes('scrum')) return 'scrum';
  if (value.includes('tap')) return 'tap';
  return '';
}

export function parsePenaltyReason(detail: string): string {
  if (!detail.includes('Causa:')) return '';
  const match = detail.match(/Causa:\s*([^|]+)/);
  const label = match?.[1]?.trim();
  if (!label) return '';
  return PENALTY_REASONS.find((r) => r.label === label)?.value || '';
}

export function parseKickType(detail: string): LiveComposerState['kickType'] {
  const match = detail.match(/Tipo:\s*([^|]+)/);
  const label = match?.[1]?.trim();
  if (!label) return '';
  return KICK_TYPES.find((t) => t.label === label)?.value || '';
}

export function parseKickDistance(detail: string): string {
  const m = parseKickMetersFromDetail(detail);
  return m > 0 ? String(m) : '';
}

export function formatPenaltyDetail(outcome: string, zone: string, playerName: string, penaltyReason: string) {
  const labels: Record<string, string> = {
    converted: 'Penal convertido',
    missed: 'Penal fallado',
    touch: 'Penal al touch',
    quick: 'Penal rapido',
    scrum: 'Penal a scrum',
    tap: 'Tap and go',
  };
  const reasonLabel = PENALTY_REASONS.find((r) => r.value === penaltyReason)?.label;
  const parts = [labels[outcome] || 'Penal'];
  if (reasonLabel) parts.push(`Causa: ${reasonLabel}`);
  if (playerName.trim()) parts.push(`Patea: ${playerName.trim()}`);
  if (zone.trim()) parts.push(`Zona: ${zone.trim()}`);
  return parts.join(' | ');
}

export function getEventSummary(event: ClubLiveEvent) {
  if (event.type === 'conversion') {
    const made = event.detail.toLowerCase().includes('convertida') || event.detail.toLowerCase().includes('acertada');
    return `${getEventTypeLabel(event.type)} ${made ? 'OK' : 'X'}`;
  }
  if (event.type === 'card_yellow') return 'Tarjeta amarilla';
  if (event.type === 'card_red') return 'Tarjeta roja';
  if (event.type === 'penalty_try') return 'Penalty Try (+7)';
  if (event.type === 'entradas_22') return 'Entradas en 22';
  if (event.type === 'penalty_goal') return 'Penal a los palos';
  if (event.type === 'drop_goal') return 'Drop';
  return getEventTypeLabel(event.type);
}

export function getEventPoints(event: ClubLiveEvent) {
  if (event.team !== 'home' && event.team !== 'away') return 0;
  if (event.type === 'try') return 5;
  if (event.type === 'penalty_try') return 7;
  if (event.type === 'conversion' && isGoalKickMade('conversion', event.detail)) return 2;
  if (event.type === 'penalty_goal' && isGoalKickMade('penalty_goal', event.detail)) return 3;
  if (event.type === 'penalty' && isGoalKickAttemptEvent(event) && isGoalKickMade('penalty', event.detail)) return 3;
  if (event.type === 'drop_goal' && isGoalKickMade('drop_goal', event.detail)) return 3;
  return 0;
}

export function applyScoreDelta(
  score: MatchDraftState['score'],
  team: MatchEventTeam,
  delta: number
) {
  if ((team !== 'home' && team !== 'away') || delta === 0) return score;
  const nextValue = Math.max(0, (parseNumericInput(score[team]) ?? 0) + delta);
  return {
    ...score,
    [team]: String(nextValue),
  };
}

export function buildEventFromComposer(composer: LiveComposerState): ClubLiveEvent {
  if (composer.action === 'try') {
    const parts = ['Try apoyado'];
    if (composer.secondaryPlayerName.trim()) parts.push(`Asiste: ${composer.secondaryPlayerName.trim()}`);
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'try',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: parts.join(' | '),
    };
  }

  if (composer.action === 'penalty_try') {
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'penalty_try',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: 'Penalty Try (+7)',
    };
  }

  if (composer.action === 'conversion') {
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'conversion',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: composer.outcome === 'made' ? 'Conversión convertida' : 'Conversión fallada',
    };
  }

  if (composer.action === 'penalty') {
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'penalty',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: formatPenaltyDetail(composer.outcome, composer.zone, composer.playerName, composer.penaltyReason),
    };
  }

  if (composer.action === 'free_kick') {
    const labels: Record<string, string> = {
      touch: 'Free Kick al touch',
      scrum: 'Free Kick a scrum',
      tap: 'Tap and go',
    };
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'free_kick',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: labels[composer.outcome] || 'Free Kick',
    };
  }

  if (composer.action === 'card') {
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: composer.outcome === 'red' ? 'card_red' : 'card_yellow',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: composer.reason.trim(),
    };
  }

  if (composer.action === 'substitution') {
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'substitution',
      team: composer.team,
      playerName: composer.playerName.trim(),
      secondaryPlayerName: composer.secondaryPlayerName.trim(),
      detail: composer.secondaryPlayerName.trim() ? `Entra: ${composer.secondaryPlayerName.trim()}` : '',
    };
  }

  if (composer.action === 'scrum') {
    const outcome = composer.followUpOutcome;
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'scrum',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: outcome === 'won' ? 'Scrum ganado' : outcome === 'lost' ? 'Scrum perdido' : composer.zone.trim() || 'Scrum',
    };
  }

  if (composer.action === 'line') {
    const outcome = composer.followUpOutcome;
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'line',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: outcome === 'won' ? 'Lineout ganado' : outcome === 'lost' ? 'Lineout perdido' : composer.zone.trim() || 'Lineout',
    };
  }

  if (composer.action === 'knock_on') {
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'knock_on',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: 'Knock On',
    };
  }

  if (composer.action === 'forward_pass') {
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'forward_pass',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: 'Pase Forward',
    };
  }

  if (composer.action === 'kick') {
    const kickTypeLabel = KICK_TYPES.find((t) => t.value === composer.kickType)?.label || 'Kick';
    const parts = [kickTypeLabel];
    if (composer.kickDistance.trim()) parts.push(`Dist: ${composer.kickDistance.trim()}m`);
    if (composer.playerName.trim()) parts.push(`Patea: ${composer.playerName.trim()}`);
    if (composer.zone.trim()) parts.push(`Zona: ${composer.zone.trim()}`);
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'kick',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: parts.join(' | '),
    };
  }

  if (composer.action === 'ruck') {
    const outcome = composer.followUpOutcome;
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'ruck',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: outcome === 'won' ? 'Ruck ganado' : outcome === 'lost' ? 'Ruck perdido' : composer.zone.trim() || 'Ruck',
    };
  }

  if (composer.action === 'entradas_22') {
    const base = 'Entrada a 22 rival';
    const note = composer.zone.trim();
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'entradas_22',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: note ? `${base} | ${note}` : base,
    };
  }

  if (composer.action === 'pass') {
    const passLabels: Record<string, string> = { long: 'Pase largo', short: 'Pase corto', inside: 'Pase adentro', outside: 'Pase afuera', miss: 'Pase errado', offload: 'Offload' };
    const passType = passLabels[composer.passType] || 'Pase';
    const outcomeLabels: Record<string, string> = { completed: 'Completado', intercepted: 'Interceptado', dropped: 'Tocado', forward: 'Forward' };
    const outcome = outcomeLabels[composer.outcome] || '';
    const parts = [passType];
    if (outcome) parts.push(outcome);
    if (composer.playerName.trim()) parts.push(`De: ${composer.playerName.trim()}`);
    if (composer.secondaryPlayerName.trim()) parts.push(`A: ${composer.secondaryPlayerName.trim()}`);
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'pass',
      team: composer.team,
      playerName: composer.playerName.trim(),
      detail: parts.join(' | '),
    };
  }

  if (composer.action === 'match_start') {
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'match_start',
      team: composer.team,
      playerName: '',
      detail: 'Inicio del partido',
    };
  }

  if (composer.action === 'match_half') {
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'match_half',
      team: composer.team,
      playerName: '',
      detail: 'Entretiempo',
    };
  }

  if (composer.action === 'match_end') {
    return {
      id: composer.eventId || crypto.randomUUID(),
      minute: composer.minute,
      videoTime: composer.videoTime,
      type: 'match_end',
      team: composer.team,
      playerName: '',
      detail: 'Final del partido',
    };
  }

  return {
    id: composer.eventId || crypto.randomUUID(),
    minute: composer.minute,
    videoTime: composer.videoTime,
    type: 'tackle',
    team: composer.team,
    playerName: composer.playerName.trim(),
    detail: composer.reason.trim(),
  };
}

export function composerFromEvent(event: ClubLiveEvent): LiveComposerState {
  if (event.type === 'conversion') {
    return createLiveComposer('conversion', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
      outcome: /convertida|acertada/i.test(event.detail) ? 'made' : 'missed',
    });
  }

  if (event.type === 'penalty') {
    return createLiveComposer('penalty', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
      outcome: parsePenaltyOutcome(event.detail),
      penaltyReason: parsePenaltyReason(event.detail),
      zone: event.detail.includes('Zona:') ? event.detail.split('Zona:')[1]?.trim() || '' : '',
    });
  }

  if (event.type === 'card_yellow' || event.type === 'card_red') {
    return createLiveComposer('card', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
      outcome: event.type === 'card_red' ? 'red' : 'yellow',
      reason: event.detail,
    });
  }

  if (event.type === 'substitution') {
    return createLiveComposer('substitution', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
      secondaryPlayerName: event.secondaryPlayerName || parseSubstitutionIncoming(event.detail),
    });
  }

  if (event.type === 'scrum') {
    return createLiveComposer('scrum', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
      followUpOutcome: event.detail.includes('ganado') ? 'won' : event.detail.includes('perdido') ? 'lost' : '',
      zone: event.detail,
    });
  }

  if (event.type === 'line') {
    return createLiveComposer('line', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
      followUpOutcome: event.detail.includes('ganado') ? 'won' : event.detail.includes('perdido') ? 'lost' : '',
      zone: event.detail,
    });
  }

  if (event.type === 'try') {
    const assistantMatch = event.detail.match(/Asiste:\s*(.+?)(?:\s*\||$)/);
    return createLiveComposer('try', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
      secondaryPlayerName: assistantMatch?.[1]?.trim() || '',
    });
  }

  if (event.type === 'penalty_try') {
    return createLiveComposer('penalty_try', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
    });
  }

  if (event.type === 'knock_on') {
    return createLiveComposer('knock_on', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
    });
  }

  if (event.type === 'forward_pass') {
    return createLiveComposer('forward_pass', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
    });
  }

  if (event.type === 'free_kick') {
    return createLiveComposer('free_kick', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
    });
  }

  if (event.type === 'kick') {
    return createLiveComposer('kick', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
      kickType: parseKickType(event.detail),
      kickDistance: parseKickDistance(event.detail),
      zone: event.detail.includes('Zona:') ? event.detail.split('Zona:')[1]?.trim() || '' : '',
    });
  }

  if (event.type === 'ruck') {
    return createLiveComposer('ruck', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
      followUpOutcome: event.detail.includes('ganado') ? 'won' : event.detail.includes('perdido') ? 'lost' : '',
      zone: event.detail,
    });
  }

  if (event.type === 'pass') {
    const passMatch = event.detail.match(/^Pase\s+(largo|corto|adentro|afuera|errado|Offload)/);
    const outcomeMatch = event.detail.match(/(Completado|Interceptado|Tocado|Forward)/);
    return createLiveComposer('pass', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
      passType: passMatch?.[1] === 'largo' ? 'long' : passMatch?.[1] === 'corto' ? 'short' : passMatch?.[1] === 'adentro' ? 'inside' : passMatch?.[1] === 'afuera' ? 'outside' : passMatch?.[1] === 'errado' ? 'miss' : passMatch?.[1] === 'Offload' ? 'offload' : '',
      outcome: outcomeMatch?.[1] === 'Completado' ? 'completed' : outcomeMatch?.[1] === 'Interceptado' ? 'intercepted' : outcomeMatch?.[1] === 'Tocado' ? 'dropped' : outcomeMatch?.[1] === 'Forward' ? 'forward' : '',
      secondaryPlayerName: event.detail.includes('A:') ? event.detail.split('A:')[1]?.trim() || '' : '',
    });
  }

  if (event.type === 'match_start') {
    return createLiveComposer('match_start', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: '',
    });
  }

  if (event.type === 'match_half') {
    return createLiveComposer('match_half', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: '',
    });
  }

  if (event.type === 'match_end') {
    return createLiveComposer('match_end', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: '',
    });
  }

  if (event.type === 'entradas_22') {
    const note = event.detail.includes('|') ? (event.detail.split('|').slice(1).join('|').trim()) : '';
    return createLiveComposer('entradas_22', {
      mode: 'edit',
      eventId: event.id,
      minute: event.minute,
      videoTime: event.videoTime || '',
      team: event.team || 'home',
      playerName: event.playerName,
      zone: note,
    });
  }

  return createLiveComposer('tackle', {
    mode: 'edit',
    eventId: event.id,
    minute: event.minute,
    videoTime: event.videoTime || '',
    team: event.team || 'home',
    playerName: event.playerName,
    reason: event.detail,
  });
}

export function getLiveActionFromEventType(type: string): LiveActionType {
  if (type === 'card_yellow' || type === 'card_red') return 'card';
  if (type === 'knock_on') return 'knock_on';
  if (type === 'forward_pass') return 'forward_pass';
  if (type === 'free_kick') return 'free_kick';
  if (type === 'penalty_try') return 'penalty_try';
  if (type === 'kick') return 'kick';
  if (type === 'ruck') return 'ruck';
  if (type === 'pass') return 'pass';
  if (type === 'match_start') return 'match_start';
  if (type === 'match_half') return 'match_half';
  if (type === 'match_end') return 'match_end';
  if (type === 'entradas_22') return 'entradas_22';
  return type as LiveActionType;
}

export function countEvents(events: ClubLiveEvent[], types: string[]) {
  return events.filter((event) => types.includes(event.type)).length;
}

export function findLineupPlayerId(players: MatchLineupPlayer[], name: string) {
  const normalized = ensureString(name).trim().toLowerCase();
  if (!normalized) return null;
  return players.find((player) => ensureString(player.name).trim().toLowerCase() === normalized)?.id || null;
}

export function ensureTwentyThreeCallups(existing: ClubCallup[]) {
  const next = [...existing];
  while (next.length < 23) {
    next.push(createDefaultCallup(next.length));
  }
  return next.slice(0, 23);
}

export function applyQuickCallupLoad(source: string, existing: ClubCallup[]) {
  const rows = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const segments = line.split(',').map((part) => part.trim());
      return {
        name: segments[0] || '',
        position: segments[1] || '',
        status: (segments[2] as AvailabilityStatus) || 'confirmed',
      };
    });

  if (rows.length === 0) return existing;

  return rows.map((row, index) => ({
    name: row.name,
    position: row.position,
    status: row.status,
    attendance: '',
    note: `Carga rápida ${index + 1}`,
  }));
}

interface MatchStats {
  tries: { home: number; away: number };
  conversions: { home: number; away: number };
  penalties: { home: number; away: number };
  penaltyGoals: { home: number; away: number };
  dropGoals: { home: number; away: number };
  penaltyTries: { home: number; away: number };
  entradas22: { home: number; away: number };
  freeKicks: { home: number; away: number };
  knockOns: { home: number; away: number };
  forwardPasses: { home: number; away: number };
  kicks: { home: number; away: number };
  kickMeters: { home: number; away: number };
  rucks: { home: number; away: number };
  passes: { home: number; away: number };
  scrums: { home: { won: number; lost: number }; away: { won: number; lost: number } };
  lines: { home: { won: number; lost: number }; away: { won: number; lost: number } };
  cards: { home: { yellow: number; red: number }; away: { yellow: number; red: number } };
  tackles: { home: number; away: number };
  substitutions: { home: number; away: number };
}

export function normalizeVideoUrl(url: string): { type: 'iframe' | 'video' | 'unsupported'; src: string; message?: string } {
  if (!url.trim()) return { type: 'unsupported', src: '', message: '' };

  try {
    const parsed = new URL(url);

    // YouTube
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
      let videoId = '';
      if (parsed.hostname.includes('youtu.be')) {
        videoId = parsed.pathname.slice(1);
      } else {
        videoId = parsed.searchParams.get('v') || '';
        if (!videoId && parsed.pathname.startsWith('/embed/')) {
          videoId = parsed.pathname.split('/embed/')[1]?.split('/')[0] || '';
        }
        if (!videoId && parsed.pathname.startsWith('/live/')) {
          videoId = parsed.pathname.split('/live/')[1]?.split('/')[0] || '';
        }
      }
      if (videoId) {
        return { type: 'iframe', src: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0` };
      }
    }

    // Vimeo
    if (parsed.hostname.includes('vimeo.com')) {
      const vimeoId = parsed.pathname.split('/').filter(Boolean)[0];
      if (vimeoId) {
        return { type: 'iframe', src: `https://player.vimeo.com/video/${vimeoId}?api=1&playsinline=1` };
      }
    }

    // Dropbox: convertir a descarga directa
    if (parsed.hostname.includes('dropbox.com') || parsed.hostname.includes('dropboxusercontent.com')) {
      let directUrl = url;
      if (parsed.hostname.includes('dropbox.com')) {
        directUrl = url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('dropbox.com', 'dl.dropboxusercontent.com');
      }
      directUrl = directUrl.replace(/[?&]dl=0/, '?dl=1');
      if (!directUrl.includes('dl=1')) {
        directUrl += (directUrl.includes('?') ? '&' : '?') + 'dl=1';
      }
      return { type: 'video', src: directUrl };
    }

    // Google Drive
    if (parsed.hostname.includes('drive.google.com')) {
      const fileId = parsed.pathname.split('/d/')[1]?.split('/')[0];
      if (fileId) {
        return { type: 'iframe', src: `https://drive.google.com/file/d/${fileId}/preview` };
      }
    }

    // RTMP: no soportado nativamente
    if (url.startsWith('rtmp://') || url.startsWith('rtmps://')) {
      return { type: 'unsupported', src: '', message: 'RTMP requiere un reproductor HLS. Convertí la URL a HLS (.m3u8) o usá Restream/YouTube para verlo aquí.' };
    }

    // Archivos directos de video
    if (/\.(mp4|webm|ogg|m3u8|mov)(\?|$)/i.test(url)) {
      return { type: 'video', src: url };
    }

    // Fallback: intentar como iframe (para embeds genéricos)
    return { type: 'iframe', src: url };
  } catch {
    // Si no es una URL válida, intentar como video directo si termina en extensión de video
    if (/\.(mp4|webm|ogg|m3u8|mov)(\?|$)/i.test(url)) {
      return { type: 'video', src: url };
    }
    return { type: 'unsupported', src: '', message: 'URL no reconocida. Probá con YouTube, Vimeo, Dropbox, Google Drive o un archivo .mp4 directo.' };
  }
}

export function buildMatchStats(events: ClubLiveEvent[]): MatchStats {
  const stats: MatchStats = {
    tries: { home: 0, away: 0 },
    conversions: { home: 0, away: 0 },
    penalties: { home: 0, away: 0 },
    penaltyGoals: { home: 0, away: 0 },
    dropGoals: { home: 0, away: 0 },
    penaltyTries: { home: 0, away: 0 },
    entradas22: { home: 0, away: 0 },
    freeKicks: { home: 0, away: 0 },
    knockOns: { home: 0, away: 0 },
    forwardPasses: { home: 0, away: 0 },
    kicks: { home: 0, away: 0 },
    kickMeters: { home: 0, away: 0 },
    rucks: { home: 0, away: 0 },
    passes: { home: 0, away: 0 },
    scrums: { home: { won: 0, lost: 0 }, away: { won: 0, lost: 0 } },
    lines: { home: { won: 0, lost: 0 }, away: { won: 0, lost: 0 } },
    cards: { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } },
    tackles: { home: 0, away: 0 },
    substitutions: { home: 0, away: 0 },
  };

  for (const event of events) {
    const team = event.team === 'home' || event.team === 'away' ? event.team : null;
    if (!team) continue;

    if (event.type === 'try') stats.tries[team]++;
    if (event.type === 'conversion' && isGoalKickMade('conversion', event.detail)) stats.conversions[team]++;
    if (event.type === 'penalty' && isGoalKickAttemptEvent(event) && isGoalKickMade('penalty', event.detail)) stats.penalties[team]++;
    if (event.type === 'penalty_goal' && isGoalKickMade('penalty_goal', event.detail)) stats.penaltyGoals[team]++;
    if (event.type === 'drop_goal' && isGoalKickMade('drop_goal', event.detail)) stats.dropGoals[team]++;
    if (event.type === 'penalty_try') stats.penaltyTries[team]++;
    if (event.type === 'entradas_22') stats.entradas22[team]++;
    if (event.type === 'free_kick') stats.freeKicks[team]++;
    if (event.type === 'knock_on') stats.knockOns[team]++;
    if (event.type === 'forward_pass') stats.forwardPasses[team]++;
    if (event.type === 'kick') {
      stats.kicks[team]++;
      stats.kickMeters[team] += parseKickMetersFromDetail(event.detail);
    }
    if (event.type === 'ruck') stats.rucks[team]++;
    if (event.type === 'pass') stats.passes[team]++;
    if (event.type === 'scrum') {
      if (/ganado/i.test(event.detail)) stats.scrums[team].won++;
      else if (/perdido/i.test(event.detail)) stats.scrums[team].lost++;
      else { stats.scrums[team].won++; stats.scrums[team].lost++; }
    }
    if (event.type === 'line') {
      if (/ganado/i.test(event.detail)) stats.lines[team].won++;
      else if (/perdido/i.test(event.detail)) stats.lines[team].lost++;
      else { stats.lines[team].won++; stats.lines[team].lost++; }
    }
    if (event.type === 'card_yellow') stats.cards[team].yellow++;
    if (event.type === 'card_red') stats.cards[team].red++;
    if (event.type === 'tackle') stats.tackles[team]++;
    if (event.type === 'substitution') stats.substitutions[team]++;
  }

  return stats;
}

export function formatTasa22FromStats(stats: MatchStats, team: 'home' | 'away'): string {
  const d = stats.entradas22[team];
  if (d === 0) return '—';
  const n =
    stats.tries[team]
    + stats.penaltyTries[team]
    + stats.penalties[team]
    + stats.penaltyGoals[team]
    + stats.dropGoals[team];
  return `${((n / d) * 100).toFixed(1)}%`;
}

interface PlayerEventStats {
  name: string;
  team: 'home' | 'away' | null;
  points: number;
  tries: number;
  conversions: number;
  penaltyTries: number;
  convertedPenalties: number;
  attackPenalties: number;
  defensePenalties: number;
  knockOns: number;
  forwardPasses: number;
  kicks: number;
  kickMeters: number;
  passes: number;
  rucksFor: number;
  rucksAgainst: number;
  scrumsFor: number;
  scrumsAgainst: number;
  linesFor: number;
  linesAgainst: number;
  yellowCards: number;
  redCards: number;
  tackles: number;
  substitutions: number;
  notes: number;
  total: number;
}

export const PLAYER_ATTRIBUTABLE_EVENT_TYPES = new Set<ClubLiveEvent['type']>([
  'try',
  'conversion',
  'penalty',
  'penalty_try',
  'free_kick',
  'knock_on',
  'forward_pass',
  'kick',
  'ruck',
  'pass',
  'card_yellow',
  'card_red',
  'tackle',
  'substitution',
]);

export function resolvePlayerStatsName(event: ClubLiveEvent): string | null {
  const normalized = event.playerName.trim();
  if (normalized) return normalized;
  if (PLAYER_ATTRIBUTABLE_EVENT_TYPES.has(event.type)) return 'No identificado';
  return null;
}

export function getPlayerAttackTotal(player: PlayerEventStats) {
  return player.tries
    + player.conversions
    + player.penaltyTries
    + player.convertedPenalties
    + player.attackPenalties
    + player.kicks
    + player.passes
    + player.scrumsFor
    + player.linesFor
    + player.rucksFor
    + player.knockOns
    + player.forwardPasses;
}

export function getPlayerDefenseTotal(player: PlayerEventStats) {
  return player.defensePenalties
    + player.scrumsAgainst
    + player.rucksAgainst
    + player.tackles
    + player.linesAgainst;
}

export function extractZoneLabel(detail: string): string {
  const match = detail.match(/Zona:\s*([^|]+)/i);
  return match?.[1]?.trim() || '';
}

export function normalizeZoneLabel(zone: string): string {
  return zone
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isDefensiveZone(zone: string): boolean {
  const normalized = normalizeZoneLabel(zone);
  if (!normalized) return false;

  return [
    'propia',
    'propio',
    'defen',
    'nuestro',
    'salida',
    '22 propia',
    '22 defensiva',
    'campo propio',
    'ingoal propio',
    'ingoal defensivo',
  ].some((token) => normalized.includes(token));
}

export function classifyPenaltyPhase(detail: string): 'attack' | 'defense' {
  return isDefensiveZone(extractZoneLabel(detail)) ? 'defense' : 'attack';
}

export function buildPlayerStats(events: ClubLiveEvent[]): PlayerEventStats[] {
  const map = new Map<string, PlayerEventStats>();

  for (const event of events) {
    const name = resolvePlayerStatsName(event);
    if (!name) continue;
    const key = `${name.toLowerCase()}|${event.team || 'neutral'}`;
    if (!map.has(key)) {
      map.set(key, {
        name,
        team: event.team === 'home' || event.team === 'away' ? event.team : null,
        points: 0,
        tries: 0, conversions: 0, penaltyTries: 0, convertedPenalties: 0, attackPenalties: 0, defensePenalties: 0,
        knockOns: 0, forwardPasses: 0, kicks: 0, kickMeters: 0, passes: 0,
        rucksFor: 0, rucksAgainst: 0, scrumsFor: 0, scrumsAgainst: 0, linesFor: 0, linesAgainst: 0,
        yellowCards: 0, redCards: 0, tackles: 0,
        substitutions: 0, notes: 0, total: 0,
      });
    }
    const p = map.get(key)!;
    p.total++;
    p.points += getEventPoints(event);
    if (event.type === 'try') p.tries++;
    if (event.type === 'conversion' && isGoalKickMade('conversion', event.detail)) p.conversions++;
    if (event.type === 'penalty') {
      if (isGoalKickAttemptEvent(event) && isGoalKickMade('penalty', event.detail)) p.convertedPenalties++;
      if (classifyPenaltyPhase(event.detail) === 'defense') p.defensePenalties++;
      else p.attackPenalties++;
    }
    if (event.type === 'penalty_try') p.penaltyTries++;
    if (event.type === 'knock_on') p.knockOns++;
    if (event.type === 'forward_pass') p.forwardPasses++;
    if (event.type === 'kick') {
      p.kicks++;
      p.kickMeters += parseKickMetersFromDetail(event.detail);
    }
    if (event.type === 'ruck') {
      if (/perdido/i.test(event.detail)) p.rucksAgainst++;
      else p.rucksFor++;
    }
    if (event.type === 'pass') p.passes++;
    if (event.type === 'scrum') {
      if (/perdido/i.test(event.detail)) p.scrumsAgainst++;
      else p.scrumsFor++;
    }
    if (event.type === 'line') {
      if (/perdido/i.test(event.detail)) p.linesAgainst++;
      else p.linesFor++;
    }
    if (event.type === 'card_yellow') p.yellowCards++;
    if (event.type === 'card_red') p.redCards++;
    if (event.type === 'tackle') p.tackles++;
    if (event.type === 'substitution') p.substitutions++;
    if (event.type === 'note') p.notes++;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.team === b.team) return a.name.localeCompare(b.name);
    if (a.team === 'home') return -1;
    if (b.team === 'home') return 1;
    if (a.team === 'away') return -1;
    return 1;
  });
}

export function generateInsights(stats: MatchStats, score: { home: string; away: string }): string[] {
  const homeScore = parseInt(score.home || '0', 10) || 0;
  const awayScore = parseInt(score.away || '0', 10) || 0;
  const insights: string[] = [];

  if (homeScore > awayScore) {
    if (stats.penalties.home > stats.penalties.away) {
      insights.push('El equipo local se impuso con mayor efectividad desde los penales.');
    }
    if (stats.tries.home > stats.tries.away) {
      insights.push('Superioridad ofensiva del local con más tries anotados.');
    }
  } else if (awayScore > homeScore) {
    if (stats.penalties.away > stats.penalties.home) {
      insights.push('El visitante capitalizó mejor las oportunidades de penal.');
    }
    if (stats.tries.away > stats.tries.home) {
      insights.push('El visitante fue más incisivo en ataque.');
    }
  }

  if (stats.knockOns.home + stats.knockOns.away + stats.forwardPasses.home + stats.forwardPasses.away > 5) {
    insights.push('Partido con muchos errores de manos, clave en la posesión.');
  }

  if (stats.cards.home.red + stats.cards.away.red > 0) {
    insights.push('La indisciplina marcó el partido con tarjetas rojas.');
  }

  if (insights.length === 0) {
    insights.push('Partido parejo donde los detalles definieron el resultado.');
  }

  return insights;
}
export function buildPostMatchStatGroups(stats: MatchStats) {
  return {
    scoring: [
      { label: 'Tries', home: stats.tries.home, away: stats.tries.away },
      { label: 'Penalty Tries', home: stats.penaltyTries.home, away: stats.penaltyTries.away },
      { label: 'Conversiones', home: stats.conversions.home, away: stats.conversions.away },
      { label: 'Penales', home: stats.penalties.home, away: stats.penalties.away },
      { label: 'Free Kicks', home: stats.freeKicks.home, away: stats.freeKicks.away },
    ],
    juego: [
      { label: 'Entradas en 22', home: stats.entradas22.home, away: stats.entradas22.away },
    ],
    continuity: [
      { label: 'Kicks', home: stats.kicks.home, away: stats.kicks.away },
      { label: 'Metros patada (juego)', home: stats.kickMeters.home, away: stats.kickMeters.away },
      { label: 'Pases', home: stats.passes.home, away: stats.passes.away },
      { label: 'Rucks', home: stats.rucks.home, away: stats.rucks.away },
      { label: 'Knock Ons', home: stats.knockOns.home, away: stats.knockOns.away },
      { label: 'Pases Forward', home: stats.forwardPasses.home, away: stats.forwardPasses.away },
    ],
    setPiece: [
      { label: 'Scrums ganados', home: stats.scrums.home.won, away: stats.scrums.away.won },
      { label: 'Scrums perdidos', home: stats.scrums.home.lost, away: stats.scrums.away.lost },
      { label: 'Lines ganados', home: stats.lines.home.won, away: stats.lines.away.won },
      { label: 'Lines perdidos', home: stats.lines.home.lost, away: stats.lines.away.lost },
    ],
    discipline: [
      { label: 'Tackles', home: stats.tackles.home, away: stats.tackles.away },
      { label: 'Tarjetas amarillas', home: stats.cards.home.yellow, away: stats.cards.away.yellow },
      { label: 'Tarjetas rojas', home: stats.cards.home.red, away: stats.cards.away.red },
      { label: 'Sustituciones', home: stats.substitutions.home, away: stats.substitutions.away },
      { label: 'Penales concedidos', home: stats.penalties.away, away: stats.penalties.home },
    ],
  };
}
