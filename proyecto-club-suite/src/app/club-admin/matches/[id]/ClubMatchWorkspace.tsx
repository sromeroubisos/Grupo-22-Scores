'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  Calendar,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronUp,
  Clock3,
  ExternalLink,
  Eye,
  FileText,
  Maximize2,
  MapPin,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Save,
  Settings,
  Undo2,
  X,
} from 'lucide-react';
import styles from './ClubMatchWorkspace.module.css';
import { formatMatchTimelineEventDescription } from '@/lib/matchEventStats';
import {
  compareMatchPeriodValues,
  getEventPeriodForType,
  getMatchPeriodLabel,
  getNextActivePeriodAfterEvent,
  normalizeMatchPeriod,
} from '@/lib/matchPeriods';
import {
  buildMatchPlayerSelectionGroups,
  findMatchPlayerSelectionOption,
  formatMatchPlayerOptionLabel,
  preserveMatchPlayerOption,
  type MatchPlayerSelectionGroups,
  type MatchPlayerSelectionOption,
} from '@/lib/matchPlayerSelection';
import {
  calculateMatchPointsPreview,
  DEFAULT_MATCH_POINTS_RULES,
  type MatchPointsPreview,
} from '@/lib/standings/matchPointsPreview';
import type {
  ClubInfo,
  ClubCallup,
  ClubLineupsState,
  ClubLiveControl,
  ClubLiveEvent,
  ClubMediaPlan,
  Division,
  LiveActionType,
  LiveComposerState,
  LivePhase,
  LiveSubview,
  MatchData,
  MatchDraftState,
  MatchEventTeam,
  MatchLineupPlayer,
  MatchStatus,
  PlayerEventStats,
  SaveFeedback,
  SaveUiState,
  SectionTab,
} from './ClubMatchWorkspace.types';
import {
  TABS,
  MATCH_STATUS_OPTIONS,
  EVENT_TYPES,
  LIVE_SUBVIEWS,
  LIVE_PHASE_OPTIONS,
  CLUB_EVENT_PANEL_ACTIONS,
  CLUB_EVENT_PANEL_GROUPS,
  KICK_TYPES,
  PENALTY_REASONS,
  normalizeStatus,
  getStatusLabel,
  getStatusClass,
  formatDateTime,
  toDateTimeLocalInput,
  fromDateTimeLocalInput,
  buildDraftState,
  ensureLineupsState,
  ensureEvents,
  buildClockPayload,
  buildScorePayload,
  parseNumericInput,
  createEmptyLineupPlayer,
  createEmptyEvent,
  createLiveComposer,
  getEventTypeLabel,
  getEventGlyph,
  getEventTone,
  getEventSummary,
  getEventPoints,
  applyScoreDelta,
  buildEventFromComposer,
  composerFromEvent,
  getLiveActionFromEventType,
  getLiveActionGroupTone,
  countEvents,
  findLineupPlayerId,
  normalizeVideoUrl,
  buildMatchStats,
  buildPlayerStats,
  generateInsights,
  buildPostMatchStatGroups,
  formatTasa22FromStats,
  getPlayerAttackTotal,
  getPlayerDefenseTotal,
  resolvePlayerStatsName,
  serializeLiveEvent,
  buildEventSnapshot,
  buildEventPatch,
  type SerializedEvent,
  type EventSnapshot,
} from './ClubMatchWorkspace.utils';
import { ComparisonBarChart, MiniBarChart, RadarChart } from './ClubMatchWorkspace.charts';
import { ChartConfigPanel } from '@/components/admin/charts/ChartConfigPanel';
import { STAT_CATALOG_POSTMATCH } from '@/components/admin/charts/statCatalogs';
import { exportMatchSheetPdf } from '@/lib/matchSheetPdf';

const PLAYER_SELECTION_ACTIONS = new Set<LiveActionType>([
  'try',
  'conversion',
  'drop_goal',
  'tackle',
  'card_yellow',
  'card_red',
  'card',
  'knock_on',
  'forward_pass',
  'handling_error',
  'turnover_lost',
  'injury',
  'penalty_try',
  'kick',
  'ruck',
  'maul',
  'recovery',
  'turnover_won',
  'pass',
  'entradas_22',
]);

const DETAIL_ACTION_LABELS: Partial<Record<LiveActionType, string>> = {
  tackle: 'Contacto dominante, tackle salvador...',
  handling_error: 'Pase bajo presion, pelota mojada...',
  turnover_lost: 'Aislado en contacto, ruck perdido...',
  injury: 'Zona del golpe, sale atendido...',
  recovery: 'Pesca, pelota suelta, presion...',
  turnover_won: 'Ruck ganado, jackal, contraataque...',
};

const RESULT_OPTIONS: Array<{ value: ClubLiveControl['homeResult']; label: string }> = [
  { value: 'win', label: 'Win' },
  { value: 'draw', label: 'Draw' },
  { value: 'loss', label: 'Loss' },
];

function isPlayerSelectionAction(action: LiveActionType) {
  return PLAYER_SELECTION_ACTIONS.has(action);
}

function resultCodeToLiveResult(result: MatchPointsPreview['homeResult']): ClubLiveControl['homeResult'] {
  if (result === 'W') return 'win';
  if (result === 'L') return 'loss';
  return 'draw';
}

function formatPointValue(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function formatPointBreakdown(base: number, bonus: number) {
  const baseText = formatPointValue(base);
  const bonusText = formatPointValue(bonus);
  return bonus > 0 ? `Base ${baseText} + bonus ${bonusText}` : `Base ${baseText}`;
}

function normalizeEventOrder(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function getEventOrder(event: ClubLiveEvent, fallback: number) {
  return normalizeEventOrder(event.order, fallback);
}

function getNextEventOrder(events: ClubLiveEvent[]) {
  return events.reduce((maxOrder, event, index) => Math.max(maxOrder, getEventOrder(event, index)), -1) + 1;
}

function compareClubEventsChronologically(
  left: ClubLiveEvent,
  right: ClubLiveEvent,
  leftIndex: number,
  rightIndex: number,
) {
  const periodDiff = compareMatchPeriodValues(left.period, right.period);
  if (periodDiff !== 0) return periodDiff;

  const orderDiff = getEventOrder(left, leftIndex) - getEventOrder(right, rightIndex);
  if (orderDiff !== 0) return orderDiff;

  const leftMinute = parseNumericInput(left.minute) ?? 0;
  const rightMinute = parseNumericInput(right.minute) ?? 0;
  if (leftMinute !== rightMinute) return leftMinute - rightMinute;

  const leftSequence = left.sequence ?? (left.parentEventId ? 1 : 0);
  const rightSequence = right.sequence ?? (right.parentEventId ? 1 : 0);
  if (leftSequence !== rightSequence) return leftSequence - rightSequence;

  return String(left.id).localeCompare(String(right.id));
}

function sortClubEventsChronologically(events: ClubLiveEvent[]) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => compareClubEventsChronologically(left.event, right.event, left.index, right.index))
    .map(({ event }) => event);
}

function resolveLivePhaseAfterEvent(current: LivePhase, eventType: string): LivePhase {
  const nextPeriod = getNextActivePeriodAfterEvent(eventType, current);
  if (nextPeriod === 'HT' || nextPeriod === '2T' || nextPeriod === 'FT') return nextPeriod;
  return '1T';
}

type PlayerSelectMode = 'active' | 'substitute' | 'activeWithDisabledSubstitutes';

function playerOptionMatchesName(option: MatchPlayerSelectionOption, value: string | null | undefined) {
  return option.name.trim().toLowerCase() === String(value || '').trim().toLowerCase();
}

function getEnabledPlayerOptions(groups: MatchPlayerSelectionGroups, mode: PlayerSelectMode) {
  if (mode === 'substitute') return groups.substitutes;
  return groups.active;
}

function renderPlayerSelectOptions({
  groups,
  players,
  mode,
  selectedValue,
  placeholder,
}: {
  groups: MatchPlayerSelectionGroups;
  players: MatchLineupPlayer[];
  mode: PlayerSelectMode;
  selectedValue?: string | null;
  placeholder: string;
}) {
  const enabledOptions = getEnabledPlayerOptions(groups, mode);
  const selectedStillEnabled = enabledOptions.some((option) => playerOptionMatchesName(option, selectedValue));
  const selectedOption = !selectedStillEnabled && selectedValue
    ? findMatchPlayerSelectionOption(groups, selectedValue) || preserveMatchPlayerOption(players, groups, selectedValue)
    : null;

  return (
    <>
      <option value="">{placeholder}</option>
      {selectedOption ? (
        <optgroup label="Seleccionado en este evento">
          <option value={selectedOption.name}>{formatMatchPlayerOptionLabel(selectedOption)}</option>
        </optgroup>
      ) : null}
      {mode !== 'substitute' && groups.active.length > 0 ? (
        <optgroup label="Titulares / activos">
          {groups.active.map((player) => (
            <option key={`active-${player.key}`} value={player.name}>
              {formatMatchPlayerOptionLabel(player)}
            </option>
          ))}
        </optgroup>
      ) : null}
      {mode === 'substitute' && groups.substitutes.length > 0 ? (
        <optgroup label="Suplentes disponibles">
          {groups.substitutes.map((player) => (
            <option key={`sub-${player.key}`} value={player.name}>
              {formatMatchPlayerOptionLabel(player)}
            </option>
          ))}
        </optgroup>
      ) : null}
      {mode === 'activeWithDisabledSubstitutes' && groups.substitutes.length > 0 ? (
        <optgroup label="Suplentes disponibles">
          {groups.substitutes.map((player) => (
            <option key={`disabled-sub-${player.key}`} value={player.name} disabled>
              {formatMatchPlayerOptionLabel(player)}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}

type EventPanelDensity = 'compact' | 'comfortable';
type CustomEventTone = 'green' | 'yellow' | 'blue' | 'red' | 'neutral' | 'brown';
type CustomEventCauseMode = 'none' | 'text' | 'options';
type CustomEventOutcomeMode = 'none' | 'made_missed' | 'won_lost' | 'custom';
type CustomEventPointsMode = 'none' | 'fixed' | 'by_outcome';

interface CustomEventDef {
  id: string;
  label: string;
  glyph: string;
  tone: CustomEventTone;
  group: string;
  causeMode: CustomEventCauseMode;
  causeOptions: string[];
  hasPlayer: boolean;
  outcomeMode: CustomEventOutcomeMode;
  outcomeOptions: string[];
  pointsMode: CustomEventPointsMode;
  pointsFixed: number;
  pointsByOutcome: Record<string, number>;
}

interface EventPanelConfig {
  hidden: LiveActionType[];
  desktopColumns: number;
  mobileColumns: number;
  density: EventPanelDensity;
  customEvents: CustomEventDef[];
}

const EVENT_PANEL_CONFIG_STORAGE_KEY = 'clubAdmin:liveActionPanel:v1';

const DEFAULT_EVENT_PANEL_CONFIG: EventPanelConfig = {
  hidden: [],
  desktopColumns: 5,
  mobileColumns: 2,
  density: 'comfortable',
  customEvents: [],
};

const CUSTOM_EVENT_TONES: CustomEventTone[] = ['green', 'yellow', 'blue', 'red', 'neutral', 'brown'];
const CUSTOM_EVENT_TONE_LABELS: Record<CustomEventTone, string> = {
  green: 'Verde (positivo)',
  yellow: 'Amarillo (atención)',
  blue: 'Azul (neutro+)',
  red: 'Rojo (sanción)',
  neutral: 'Gris (informativo)',
  brown: 'Marrón (forwards)',
};
const CUSTOM_EVENT_TONE_TO_STYLE: Record<CustomEventTone, string> = {
  green: 'liveActionBtnGreen',
  yellow: 'liveActionBtnYellow',
  blue: 'liveActionBtnBlue',
  red: 'liveActionBtnRed',
  neutral: 'liveActionBtnNeutral',
  brown: 'liveActionBtnBrown',
};
const CUSTOM_EVENT_TONE_TO_TIMELINE: Record<CustomEventTone, string> = {
  green: 'liveToneGreen',
  yellow: 'liveToneYellow',
  blue: 'liveToneBlue',
  red: 'liveToneRed',
  neutral: 'liveToneNeutral',
  brown: 'liveToneBrown',
};

const CUSTOM_EVENT_GROUPS = ['Marcador', 'Disciplina', 'Juego', 'Plantel', 'Reloj', 'Personalizado'] as const;

const OUTCOME_PRESETS: Record<CustomEventOutcomeMode, string[]> = {
  none: [],
  made_missed: ['made', 'missed'],
  won_lost: ['won', 'lost'],
  custom: [],
};

const OUTCOME_PRESET_LABELS: Record<string, string> = {
  made: 'Convertida',
  missed: 'Fallada',
  won: 'Ganado',
  lost: 'Perdido',
};

function getOutcomeLabel(def: CustomEventDef, outcomeValue: string): string {
  if (!outcomeValue) return '';
  if (def.outcomeMode === 'custom') return outcomeValue;
  return OUTCOME_PRESET_LABELS[outcomeValue] || outcomeValue;
}

function getOutcomeValuesForDef(def: CustomEventDef): string[] {
  if (def.outcomeMode === 'none') return [];
  if (def.outcomeMode === 'custom') return def.outcomeOptions;
  return OUTCOME_PRESETS[def.outcomeMode];
}

function computeCustomEventPoints(def: CustomEventDef, outcomeValue: string): number {
  if (def.pointsMode === 'fixed') return def.pointsFixed;
  if (def.pointsMode === 'by_outcome') return def.pointsByOutcome[outcomeValue] ?? 0;
  return 0;
}

function parseCustomEventStoredPoints(detail: string): number {
  const match = detail.match(/Pts:\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : 0;
}

function buildCustomEventDetail(def: CustomEventDef, cause: string, outcomeValue: string, points: number): string {
  const parts: string[] = [];
  if (cause) parts.push(`Causa: ${cause}`);
  if (outcomeValue) parts.push(`Resultado: ${getOutcomeLabel(def, outcomeValue)}`);
  if (points !== 0) parts.push(`Pts: ${points}`);
  return parts.join(' | ');
}

function createEmptyCustomEventDef(): CustomEventDef {
  return {
    id: `custom:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`,
    label: '',
    glyph: '',
    tone: 'neutral',
    group: 'Personalizado',
    causeMode: 'none',
    causeOptions: [],
    hasPlayer: false,
    outcomeMode: 'none',
    outcomeOptions: [],
    pointsMode: 'none',
    pointsFixed: 0,
    pointsByOutcome: {},
  };
}

function sanitizeCustomEventDef(input: unknown): CustomEventDef | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<CustomEventDef>;
  if (typeof raw.id !== 'string' || !raw.id.startsWith('custom:')) return null;
  if (typeof raw.label !== 'string' || !raw.label.trim()) return null;
  const glyph = (typeof raw.glyph === 'string' && raw.glyph.trim().slice(0, 3).toUpperCase()) || raw.label.trim().slice(0, 2).toUpperCase();
  const tone: CustomEventTone = CUSTOM_EVENT_TONES.includes(raw.tone as CustomEventTone) ? (raw.tone as CustomEventTone) : 'neutral';
  const group = typeof raw.group === 'string' && (CUSTOM_EVENT_GROUPS as readonly string[]).includes(raw.group) ? raw.group : 'Personalizado';
  const causeMode: CustomEventCauseMode = raw.causeMode === 'text' || raw.causeMode === 'options' ? raw.causeMode : 'none';
  const causeOptions = Array.isArray(raw.causeOptions) ? raw.causeOptions.filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).map((v) => v.trim()) : [];
  const hasPlayer = Boolean(raw.hasPlayer);
  const outcomeMode: CustomEventOutcomeMode = raw.outcomeMode === 'made_missed' || raw.outcomeMode === 'won_lost' || raw.outcomeMode === 'custom' ? raw.outcomeMode : 'none';
  const outcomeOptions = Array.isArray(raw.outcomeOptions) ? raw.outcomeOptions.filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).map((v) => v.trim()) : [];
  const pointsMode: CustomEventPointsMode = raw.pointsMode === 'fixed' || raw.pointsMode === 'by_outcome' ? raw.pointsMode : 'none';
  const pointsFixed = Number.isFinite(Number(raw.pointsFixed)) ? Number(raw.pointsFixed) : 0;
  const pointsByOutcome: Record<string, number> = {};
  if (raw.pointsByOutcome && typeof raw.pointsByOutcome === 'object') {
    for (const [key, value] of Object.entries(raw.pointsByOutcome)) {
      if (Number.isFinite(Number(value))) pointsByOutcome[key] = Number(value);
    }
  }
  return {
    id: raw.id,
    label: raw.label.trim(),
    glyph,
    tone,
    group,
    causeMode,
    causeOptions,
    hasPlayer,
    outcomeMode,
    outcomeOptions,
    pointsMode,
    pointsFixed,
    pointsByOutcome,
  };
}

function sanitizeEventPanelConfig(input: unknown): EventPanelConfig {
  if (!input || typeof input !== 'object') return DEFAULT_EVENT_PANEL_CONFIG;
  const raw = input as Partial<EventPanelConfig>;
  const validIds = new Set(CLUB_EVENT_PANEL_ACTIONS.map((action) => action.id));
  const hidden = Array.isArray(raw.hidden)
    ? (raw.hidden.filter((id): id is LiveActionType => typeof id === 'string' && validIds.has(id as LiveActionType)))
    : [];
  const desktopColumns = [3, 4, 5].includes(Number(raw.desktopColumns)) ? Number(raw.desktopColumns) : 5;
  const mobileColumns = [2, 3].includes(Number(raw.mobileColumns)) ? Number(raw.mobileColumns) : 2;
  const density: EventPanelDensity = raw.density === 'compact' ? 'compact' : 'comfortable';
  const customEvents: CustomEventDef[] = Array.isArray(raw.customEvents)
    ? raw.customEvents
        .map((entry) => sanitizeCustomEventDef(entry))
        .filter((entry): entry is CustomEventDef => entry !== null)
    : [];
  return { hidden, desktopColumns, mobileColumns, density, customEvents };
}

function buildLiveControlWithPoints(
  liveControl: ClubLiveControl,
  preview: MatchPointsPreview,
): ClubLiveControl {
  return {
    ...liveControl,
    homeResult: resultCodeToLiveResult(preview.homeResult),
    awayResult: resultCodeToLiveResult(preview.awayResult),
    homeTablePoints: formatPointValue(preview.homeBasePoints),
    awayTablePoints: formatPointValue(preview.awayBasePoints),
    homeBonusOffensive: preview.homeOffensiveBonus,
    awayBonusOffensive: preview.awayOffensiveBonus,
    homeBonusDefensive: preview.homeDefensiveBonus,
    awayBonusDefensive: preview.awayDefensiveBonus,
  };
}

export default function ClubMatchWorkspace({
  match,
  clubId,
  divisions,
  initialSection,
  isHome,
}: {
  match: MatchData;
  clubId: string;
  divisions: Division[];
  initialSection: string;
  isHome: boolean;
  isAway: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SectionTab>(
    (TABS.some((tab) => tab.id === initialSection) ? initialSection : 'resumen') as SectionTab
  );
  const [liveSubview, setLiveSubview] = useState<LiveSubview>('eventos');
  const [postTab, setPostTab] = useState<'resumen' | 'estadisticas' | 'ataque' | 'defensa' | 'eventos' | 'comparativo' | 'graficos'>('resumen');
  const [playerStatsTab, setPlayerStatsTab] = useState<'ataque' | 'defensa'>('ataque');
  const [playerStatsTeamFilter, setPlayerStatsTeamFilter] = useState<'all' | 'home' | 'away'>('all');
  const [playerStatsSortMetric, setPlayerStatsSortMetric] = useState<
    'category_total'
    | 'points'
    | 'tries'
    | 'penaltyTries'
    | 'convertedPenalties'
    | 'conversions'
    | 'scrumsFor'
    | 'linesFor'
    | 'kicks'
    | 'kickMeters'
    | 'passes'
    | 'attackPenalties'
    | 'forwardPasses'
    | 'knockOns'
    | 'rucksFor'
    | 'defensePenalties'
    | 'scrumsAgainst'
    | 'rucksAgainst'
    | 'tackles'
    | 'linesAgainst'
  >('category_total');
  const [playerStatsSortDirection, setPlayerStatsSortDirection] = useState<'desc' | 'asc'>('desc');
  const [lineupViewTab, setLineupViewTab] = useState<'home' | 'away'>(isHome ? 'home' : 'away');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);
  const [saveUiState, setSaveUiState] = useState<SaveUiState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [quickLoadValue, setQuickLoadValue] = useState('');
  const [matchState, setMatchState] = useState<MatchData>(match);
  const [matchDraft, setMatchDraft] = useState<MatchDraftState>(() => buildDraftState(match));
  const [notes, setNotes] = useState(match.notes || '');
  const [lineupsState, setLineupsState] = useState<ClubLineupsState>(() => ensureLineupsState(match.lineups, match.clock));
  const [events, setEvents] = useState<ClubLiveEvent[]>(() => ensureEvents(match.events));
  const [liveComposer, setLiveComposer] = useState<LiveComposerState | null>(null);
  const [lastRemovedEvent, setLastRemovedEvent] = useState<{ event: ClubLiveEvent; index: number } | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [videoExpanded, setVideoExpanded] = useState(false);
  const [eventsPanelCollapsed, setEventsPanelCollapsed] = useState(false);
  const [videoComposerOverlayOpen, setVideoComposerOverlayOpen] = useState(false);
  const [eventPanelConfig, setEventPanelConfig] = useState<EventPanelConfig>(DEFAULT_EVENT_PANEL_CONFIG);
  const [eventPanelConfigOpen, setEventPanelConfigOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(EVENT_PANEL_CONFIG_STORAGE_KEY);
      if (raw) setEventPanelConfig(sanitizeEventPanelConfig(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(EVENT_PANEL_CONFIG_STORAGE_KEY, JSON.stringify(eventPanelConfig));
    } catch {
      /* ignore */
    }
  }, [eventPanelConfig]);

  const hiddenEventActions = useMemo(() => new Set(eventPanelConfig.hidden), [eventPanelConfig.hidden]);

  const toggleEventActionVisibility = useCallback((id: LiveActionType) => {
    setEventPanelConfig((current) => {
      const isHidden = current.hidden.includes(id);
      return {
        ...current,
        hidden: isHidden ? current.hidden.filter((entry) => entry !== id) : [...current.hidden, id],
      };
    });
  }, []);

  const resetEventPanelConfig = useCallback(() => {
    setEventPanelConfig(DEFAULT_EVENT_PANEL_CONFIG);
  }, []);

  const [customEventDraft, setCustomEventDraft] = useState<CustomEventDef | null>(null);
  const [customComposer, setCustomComposer] = useState<{
    mode: 'create' | 'edit';
    eventId?: string;
    defId: string;
    minute: string;
    videoTime: string;
    team: 'home' | 'away';
    playerName: string;
    cause: string;
    outcome: string;
  } | null>(null);

  const customEventDefMap = useMemo(() => {
    const map = new Map<string, CustomEventDef>();
    for (const def of eventPanelConfig.customEvents) map.set(def.id, def);
    return map;
  }, [eventPanelConfig.customEvents]);

  const upsertCustomEventDef = useCallback((def: CustomEventDef) => {
    setEventPanelConfig((current) => {
      const exists = current.customEvents.some((entry) => entry.id === def.id);
      const customEvents = exists
        ? current.customEvents.map((entry) => (entry.id === def.id ? def : entry))
        : [...current.customEvents, def];
      return { ...current, customEvents };
    });
  }, []);

  const deleteCustomEventDef = useCallback((id: string) => {
    setEventPanelConfig((current) => ({
      ...current,
      customEvents: current.customEvents.filter((entry) => entry.id !== id),
    }));
  }, []);

  const resolveEventGlyph = useCallback((type: string) => {
    const def = customEventDefMap.get(type);
    return def ? def.glyph : getEventGlyph(type);
  }, [customEventDefMap]);

  const resolveEventTypeLabel = useCallback((type: string) => {
    const def = customEventDefMap.get(type);
    return def ? def.label : getEventTypeLabel(type);
  }, [customEventDefMap]);

  const resolveEventToneClass = useCallback((type: string) => {
    const def = customEventDefMap.get(type);
    if (def) return styles[CUSTOM_EVENT_TONE_TO_TIMELINE[def.tone]];
    return getEventTone(type);
  }, [customEventDefMap]);

  const resolveEventSummary = useCallback((event: ClubLiveEvent) => {
    const def = customEventDefMap.get(event.type);
    if (!def) return getEventSummary(event);
    const outcomeMatch = event.detail.match(/Resultado:\s*([^|]+)/);
    const outcomeLabel = outcomeMatch?.[1]?.trim();
    return outcomeLabel ? `${def.label} · ${outcomeLabel}` : def.label;
  }, [customEventDefMap]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const shouldResumePlaybackRef = useRef(false);
  const lastSavedPayloadRef = useRef('');
  const saveUiResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRequestSeqRef = useRef(0);
  const eventAutosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventAutosaveSignatureRef = useRef('');
  // Set de eventos tal como quedo en el servidor tras el ultimo guardado
  // exitoso. `undefined` = todavia sin inicializar (se llena abajo con lo que
  // vino del server); `null` = no se puede diffear y hay que mandar el array
  // completo.
  const lastPersistedEventsRef = useRef<EventSnapshot | null | undefined>(undefined);
  if (lastPersistedEventsRef.current === undefined) {
    lastPersistedEventsRef.current = buildEventSnapshot(ensureEvents(match.events).map(serializeLiveEvent));
  }

  useEffect(() => {
    const handler = () => {
      const container = videoContainerRef.current;
      const fullscreenNode = document.fullscreenElement;
      setVideoExpanded(Boolean(container && fullscreenNode && (fullscreenNode === container || container.contains(fullscreenNode))));
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Interceptar fullscreen nativo del video para redirigir al contenedor
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const original = video.requestFullscreen.bind(video);
    video.requestFullscreen = function () {
      if (videoContainerRef.current) {
        return videoContainerRef.current.requestFullscreen();
      }
      return original();
    };
    return () => {
      video.requestFullscreen = original;
    };
  }, [matchDraft.broadcastUrl]);

  const toggleVideoFullscreen = useCallback(async () => {
    if (!videoContainerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await videoContainerRef.current.requestFullscreen();
    }
  }, []);

  const pausePlaybackForComposer = useCallback((forceResume = false) => {
    let shouldResume = forceResume;
    if (videoRef.current) {
      shouldResume = forceResume || (!videoRef.current.paused && !videoRef.current.ended);
      if (shouldResume) {
        videoRef.current.pause();
      }
    } else if (iframeRef.current) {
      const iframe = iframeRef.current;
      const src = iframe.src;
      if (src.includes('youtube.com') || src.includes('youtu.be')) {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
        shouldResume = forceResume || shouldResume;
      } else if (src.includes('vimeo.com')) {
        iframe.contentWindow?.postMessage({ method: 'pause' }, '*');
        shouldResume = forceResume || shouldResume;
      }
    }
    shouldResumePlaybackRef.current = shouldResume;
  }, []);
  void pausePlaybackForComposer;

  const resumePlaybackAfterComposer = useCallback(() => {
    if (!shouldResumePlaybackRef.current) return;
    shouldResumePlaybackRef.current = false;
    if (videoRef.current) {
      void videoRef.current.play().catch(() => undefined);
      return;
    }
    if (iframeRef.current) {
      const iframe = iframeRef.current;
      const src = iframe.src;
      if (src.includes('youtube.com') || src.includes('youtu.be')) {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
      } else if (src.includes('vimeo.com')) {
        iframe.contentWindow?.postMessage({ method: 'play' }, '*');
      }
    }
  }, []);

  const seekVideo = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + seconds);
      return;
    }
    if (iframeRef.current) {
      const iframe = iframeRef.current;
      const src = iframe.src;
      if (src.includes('youtube.com') || src.includes('youtu.be')) {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'seekBy', args: [seconds, true] }), '*');
      } else if (src.includes('vimeo.com')) {
        iframe.contentWindow?.postMessage({ method: 'seekTo', value: seconds }, '*');
      }
    }
  }, []);

  const seekVideoTo = useCallback((timeStr: string) => {
    const parts = timeStr.split(':');
    const minutes = parseInt(parts[0] || '0', 10);
    const seconds = parseInt(parts[1] || '0', 10);
    const totalSeconds = minutes * 60 + seconds;
    if (videoRef.current && !isNaN(totalSeconds)) {
      videoRef.current.currentTime = Math.max(0, totalSeconds);
      return;
    }
    if (iframeRef.current) {
      const iframe = iframeRef.current;
      const src = iframe.src;
      if (src.includes('youtube.com') || src.includes('youtu.be')) {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [totalSeconds, true] }), '*');
      } else if (src.includes('vimeo.com')) {
        iframe.contentWindow?.postMessage({ method: 'seekTo', value: totalSeconds }, '*');
      }
    }
  }, []);

  const getCurrentVideoTime = useCallback((): string => {
    if (videoRef.current) {
      const totalSeconds = Math.floor(videoRef.current.currentTime);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return '';
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setLineupsState((current) => {
        const currentMinute = parseInt(current.liveControl.minute || '0', 10) || 0;
        return {
          ...current,
          liveControl: { ...current.liveControl, minute: String(currentMinute + 1) },
        };
      });
    }, 60000);
    return () => clearInterval(id);
  }, [timerRunning]);

  const accentColor = (isHome ? matchState.homeClub?.primary_color : matchState.awayClub?.primary_color) || '#3b82f6';
  const when = formatDateTime(fromDateTimeLocalInput(matchDraft.dateTime));
  const homeClub = matchState.homeClub;
  const awayClub = matchState.awayClub;
  const lineupKey: 'home' | 'away' = isHome ? 'home' : 'away';
  const myLineup = lineupsState[lineupKey];
  const divisionCount = divisions.length;
  const publicHref = `/matches/${encodeURIComponent(matchState.id)}`;
  const backHref = `/club-admin?club=${encodeURIComponent(clubId)}&tab=partidos`;
  const hasResult = matchDraft.score.home.trim() !== '' || matchDraft.score.away.trim() !== '';

  const callupsCount = lineupsState.callups.filter((player) => player.name.trim()).length;
  const pendingCallups = lineupsState.callups.filter((player) => player.name.trim() && player.status === 'pending').length;
  const confirmedLineup = myLineup.filter((player) => player.name.trim()).length;
  const eventProgress = Math.min(100, events.length * 15);
  const contentPieces = [lineupsState.media.headline, lineupsState.media.socialCopy, matchDraft.broadcastUrl].filter(Boolean).length;
  const currentMinute = lineupsState.liveControl.minute.trim() || '00';
  const liveStats = {
    tries: countEvents(events, ['try']),
    penalties: countEvents(events, ['penalty']),
    cards: countEvents(events, ['card_yellow', 'card_red']),
    substitutions: countEvents(events, ['substitution']),
  };
  const livePanelGameStats = buildMatchStats(events);
  const timelineEventsChronological = useMemo(() => sortClubEventsChronologically(events), [events]);
  const timelineEventIndexById = useMemo(
    () => new Map(timelineEventsChronological.map((event, index) => [event.id, index])),
    [timelineEventsChronological],
  );
  const timelineEventsRecentFirst = timelineEventsChronological;
  const playerSelectionEvents = useMemo(
    () => (liveComposer?.mode === 'edit' && liveComposer.eventId
      ? timelineEventsChronological.filter((event) => event.id !== liveComposer.eventId)
      : timelineEventsChronological),
    [liveComposer?.eventId, liveComposer?.mode, timelineEventsChronological],
  );
  const playerSelections = useMemo(() => ({
    home: buildMatchPlayerSelectionGroups(lineupsState.home, playerSelectionEvents, 'home'),
    away: buildMatchPlayerSelectionGroups(lineupsState.away, playerSelectionEvents, 'away'),
  }), [lineupsState.away, lineupsState.home, playerSelectionEvents]);
  const renderTeamPlayerOptions = useCallback((
    team: 'home' | 'away',
    mode: PlayerSelectMode,
    selectedValue: string | null | undefined,
    placeholder: string,
  ) => renderPlayerSelectOptions({
    groups: playerSelections[team],
    players: lineupsState[team],
    mode,
    selectedValue,
    placeholder,
  }), [lineupsState, playerSelections]);
  const timelineScoreById = useMemo(() => {
    const map = new Map<string, { home: number; away: number; points: number }>();
    let home = 0;
    let away = 0;

    timelineEventsChronological.forEach((event) => {
      const points = getEventPoints(event);
      if (points > 0 && event.team === 'home') home += points;
      if (points > 0 && event.team === 'away') away += points;
      map.set(event.id, { home, away, points });
    });

    return map;
  }, [timelineEventsChronological]);
  const scoreForPointsPreview = useMemo(
    () => buildScorePayload(matchState.score, matchDraft.score),
    [matchDraft.score, matchState.score],
  );
  const pointsRules = matchState.pointsRules ?? DEFAULT_MATCH_POINTS_RULES;
  const pointsPreview = useMemo(
    () => calculateMatchPointsPreview(matchDraft.status, scoreForPointsPreview, events, pointsRules),
    [events, matchDraft.status, pointsRules, scoreForPointsPreview],
  );
  const liveControlPreview = useMemo(
    () => buildLiveControlWithPoints(lineupsState.liveControl, pointsPreview),
    [lineupsState.liveControl, pointsPreview],
  );
  const totalHomeTablePoints = pointsPreview.homeBasePoints + pointsPreview.homeBonusPoints;
  const totalAwayTablePoints = pointsPreview.awayBasePoints + pointsPreview.awayBonusPoints;
  const getLiveControlForPayload = useCallback((
    overrides: Partial<Record<string, unknown>> | undefined,
    fallbackScore: ReturnType<typeof buildScorePayload>,
  ) => {
    const nextStatus = typeof overrides?.status === 'string' ? overrides.status : matchDraft.status;
    const nextScore = (overrides?.score ?? fallbackScore) as ReturnType<typeof buildScorePayload>;
    const nextEvents = Array.isArray(overrides?.events)
      ? overrides.events as Array<{ type?: unknown; team?: unknown }>
      : events;

    return buildLiveControlWithPoints(
      lineupsState.liveControl,
      calculateMatchPointsPreview(nextStatus, nextScore, nextEvents, pointsRules),
    );
  }, [events, lineupsState.liveControl, matchDraft.status, pointsRules]);

  const buildLineupsPayload = useCallback((
    liveControl: ClubLiveControl,
    score: ReturnType<typeof buildScorePayload>,
    status: MatchStatus,
    nextEvents: Array<{ type?: unknown; team?: unknown }>,
  ) => ({
    ...lineupsState,
    liveControl: buildLiveControlWithPoints(
      liveControl,
      calculateMatchPointsPreview(status, score, nextEvents, pointsRules),
    ),
    home: lineupsState.home.map((player) => ({
      ...player,
      name: player.name.trim(),
      position: player.position?.trim() || '',
      role: player.role?.trim() || 'starter',
    })),
    away: lineupsState.away.map((player) => ({
      ...player,
      name: player.name.trim(),
      position: player.position?.trim() || '',
      role: player.role?.trim() || 'starter',
    })),
  }), [lineupsState, pointsRules]);

  const kpis = [
    { label: 'Convocatoria', value: callupsCount ? `${callupsCount} / 23` : 'Sin carga', tone: pendingCallups > 0 || callupsCount === 0 ? 'yellow' : 'green' },
    { label: 'Alineación', value: confirmedLineup >= 15 ? 'Lista' : confirmedLineup > 0 ? 'Incompleta' : 'Vacía', tone: confirmedLineup >= 15 ? 'green' : confirmedLineup > 0 ? 'yellow' : 'red' },
    { label: 'Contenido', value: contentPieces ? `${contentPieces} piezas` : 'Pendiente', tone: contentPieces > 1 ? 'green' : contentPieces === 1 ? 'yellow' : 'red' },
    { label: 'Estadísticas en vivo', value: `${eventProgress}%`, tone: eventProgress >= 60 ? 'green' : eventProgress > 0 ? 'yellow' : 'red' },
  ] as const;

  const syncFromServer = useCallback((nextMatch: MatchData) => {
    setMatchState(nextMatch);
    setMatchDraft(buildDraftState(nextMatch));
    setNotes(nextMatch.notes || '');
    setLineupsState(ensureLineupsState(nextMatch.lineups, nextMatch.clock));
    const nextEvents = ensureEvents(nextMatch.events);
    setEvents(nextEvents);
    // El server acaba de decirnos cual es el set real: rebasamos el snapshot
    // para que el proximo diff parta de ahi y no de un estado local viejo.
    lastPersistedEventsRef.current = buildEventSnapshot(nextEvents.map(serializeLiveEvent));
  }, []);

  const buildPayload = useCallback((overrides?: Partial<Record<string, unknown>>) => {
    const score = buildScorePayload(matchState.score, matchDraft.score);
    const nextDateTime = fromDateTimeLocalInput(matchDraft.dateTime);
    const serializedEvents = events.map(serializeLiveEvent);
    const nextStatus = typeof overrides?.status === 'string' ? overrides.status as MatchStatus : matchDraft.status;
    const nextEvents = Array.isArray(overrides?.events)
      ? overrides.events as Array<{ type?: unknown; team?: unknown }>
      : serializedEvents;
    const nextScore = (overrides?.score ?? score) as ReturnType<typeof buildScorePayload>;
    const nextLiveControl = getLiveControlForPayload(overrides, score);
    const payload: Record<string, unknown> = {
      status: matchDraft.status,
      venue: matchDraft.venue.trim() || null,
      referee: matchDraft.referee.trim() || null,
      broadcast_url: matchDraft.broadcastUrl.trim() || null,
      score,
      notes: notes.trim() || null,
      clock: buildClockPayload(lineupsState.liveControl, matchDraft.status, matchState.clock),
      lineups: buildLineupsPayload(nextLiveControl, nextScore, nextStatus, nextEvents),
      events: serializedEvents,
    };

    if (nextDateTime) {
      payload.date_time = nextDateTime;
    }

    return {
      ...payload,
      ...overrides,
    };
  }, [buildLineupsPayload, events, getLiveControlForPayload, lineupsState.liveControl, matchDraft, matchState.clock, matchState.score, notes]);

  const currentPayloadSignature = JSON.stringify(buildPayload());
  const eventAutosaveSignature = JSON.stringify({
    events: events.map(serializeLiveEvent),
    score: buildScorePayload(matchState.score, matchDraft.score),
  });
  const hasUnsavedChanges = lastSavedPayloadRef.current === ''
    ? false
    : currentPayloadSignature !== lastSavedPayloadRef.current;
  const lastSavedLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const saveStatusText =
    saveUiState === 'saving'
      ? 'Guardando cambios...'
      : saveUiState === 'saved'
        ? 'Cambios guardados'
        : saveUiState === 'unchanged'
          ? 'Sin cambios para guardar'
          : saveUiState === 'error'
            ? 'Error al guardar'
            : hasUnsavedChanges
              ? 'Hay cambios sin guardar'
              : lastSavedLabel
                ? `Guardado a las ${lastSavedLabel}`
                : 'Todo guardado';

  useEffect(() => {
    if (!lastSavedPayloadRef.current) {
      lastSavedPayloadRef.current = currentPayloadSignature;
    }
  }, [currentPayloadSignature]);

  useEffect(() => {
    if (saving) return;
    if (hasUnsavedChanges && (saveUiState === 'saved' || saveUiState === 'unchanged' || saveUiState === 'error')) {
      setSaveUiState('idle');
    }
  }, [hasUnsavedChanges, saveUiState, saving]);

  useEffect(() => () => {
    if (saveUiResetTimeoutRef.current) {
      clearTimeout(saveUiResetTimeoutRef.current);
    }
    if (eventAutosaveTimeoutRef.current) {
      clearTimeout(eventAutosaveTimeoutRef.current);
    }
  }, []);

  const performSave = useCallback(async (
    overrides?: Partial<Record<string, unknown>>,
    successMessage = 'Cambios guardados',
    options?: { syncResponse?: boolean; quietSuccess?: boolean }
  ) => {
    if (!overrides && !hasUnsavedChanges) {
      setSaveUiState('unchanged');
      setFeedback({ tone: 'info', message: 'No hay cambios para guardar.' });
      return true;
    }

    if (saveUiResetTimeoutRef.current) {
      clearTimeout(saveUiResetTimeoutRef.current);
      saveUiResetTimeoutRef.current = null;
    }

    setSaving(true);
    setSaveUiState('saving');
    setFeedback(null);
    const requestSeq = ++saveRequestSeqRef.current;
    try {
      const requestPayload = buildPayload(overrides);
      const savedPayloadSignature = JSON.stringify(requestPayload);

      // Patch incremental: `events` sigue viajando como snapshot (el server lo
      // usa para recalcular puntos) pero la ESCRITURA la hace el eventPatch,
      // que solo toca los eventos que cambiaron. Sin esto, cada guardado
      // reemplazaba el set completo y borraba lo que otro operador acababa de
      // cargar. Si no hay snapshot previo o falta algun id, `eventPatch` queda
      // en null y el server cae al reemplazo completo de siempre.
      const sentEvents = Array.isArray(requestPayload.events)
        ? requestPayload.events as SerializedEvent[]
        : null;
      const eventPatch = sentEvents ? buildEventPatch(lastPersistedEventsRef.current, sentEvents) : null;
      if (eventPatch) {
        requestPayload.eventPatch = eventPatch;
      }

      const response = await fetch(`/api/club-admin/matches/${matchState.id}?club=${encodeURIComponent(clubId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload && typeof payload.error === 'string' ? payload.error : 'No se pudo guardar el partido.';
        throw new Error(message);
      }
      if (options?.syncResponse !== false && payload && typeof payload === 'object' && requestSeq === saveRequestSeqRef.current) {
        syncFromServer(payload as MatchData);
      }
      if (requestSeq !== saveRequestSeqRef.current) {
        return true;
      }
      lastSavedPayloadRef.current = savedPayloadSignature;
      // El set persistido es exactamente el snapshot que acabamos de mandar.
      // Si no se puede snapshotear (algun evento sin id), queda null y el
      // proximo guardado vuelve al reemplazo completo.
      if (sentEvents) {
        lastPersistedEventsRef.current = buildEventSnapshot(sentEvents);
      }
      setLastSavedAt(new Date().toISOString());
      setSaveUiState('saved');
      if (!options?.quietSuccess) {
        setFeedback({ tone: 'success', message: successMessage });
      }
      saveUiResetTimeoutRef.current = setTimeout(() => {
        setSaveUiState('idle');
      }, 1000);
      return true;
    } catch (error: unknown) {
      if (requestSeq !== saveRequestSeqRef.current) {
        return false;
      }
      setSaveUiState('error');
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Error inesperado al guardar.' });
      return false;
    } finally {
      if (requestSeq === saveRequestSeqRef.current) {
        setSaving(false);
      }
    }
  }, [buildPayload, clubId, hasUnsavedChanges, matchState.id, syncFromServer]);

  // Los guardados se encolan en vez de dispararse en paralelo. Cargar dos
  // eventos rapido mandaba dos PATCH concurrentes y, como el server reemplaza
  // el set completo de eventos (upsert + delete de lo que no vino en el
  // payload), el request mas viejo llegando ultimo borraba el evento del mas
  // nuevo. Serializarlos garantiza que cada payload sea superset del anterior.
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const saveMatch = useCallback((
    overrides?: Partial<Record<string, unknown>>,
    successMessage = 'Cambios guardados',
    options?: { syncResponse?: boolean; quietSuccess?: boolean }
  ) => {
    const queued = saveQueueRef.current
      .catch(() => false)
      .then(() => performSave(overrides, successMessage, options));
    saveQueueRef.current = queued;
    return queued;
  }, [performSave]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      lastEventAutosaveSignatureRef.current = eventAutosaveSignature;
      if (eventAutosaveTimeoutRef.current) {
        clearTimeout(eventAutosaveTimeoutRef.current);
        eventAutosaveTimeoutRef.current = null;
      }
      return;
    }

    if (saving) return;
    if (eventAutosaveSignature === lastEventAutosaveSignatureRef.current) return;

    if (eventAutosaveTimeoutRef.current) {
      clearTimeout(eventAutosaveTimeoutRef.current);
    }

    const pendingSignature = eventAutosaveSignature;
    const nextEvents = events.map(serializeLiveEvent);
    const nextScore = buildScorePayload(matchState.score, matchDraft.score);

    eventAutosaveTimeoutRef.current = setTimeout(() => {
      void (async () => {
        const saved = await saveMatch(
          { events: nextEvents, score: nextScore },
          'Eventos autoguardados.',
          { syncResponse: false, quietSuccess: true }
        );

        if (saved) {
          lastEventAutosaveSignatureRef.current = pendingSignature;
        }
      })();
    }, 700);

    return () => {
      if (eventAutosaveTimeoutRef.current) {
        clearTimeout(eventAutosaveTimeoutRef.current);
        eventAutosaveTimeoutRef.current = null;
      }
    };
  }, [eventAutosaveSignature, events, hasUnsavedChanges, matchDraft.score, matchState.score, saveMatch, saving]);

  const openLiveComposer = useCallback((action: LiveActionType, event?: ClubLiveEvent) => {
    if (event) {
      setTimerRunning(false);
      setLineupsState((current) => ({
        ...current,
        liveControl: {
          ...current.liveControl,
          phase: normalizeMatchPeriod(event.period, current.liveControl.phase) as LivePhase,
          minute: event.minute || current.liveControl.minute,
        },
      }));
      setLiveComposer(composerFromEvent(event));
      return;
    }
    setLiveComposer(createLiveComposer(action, {
      minute: lineupsState.liveControl.minute || '',
      team: lineupKey,
      videoTime: getCurrentVideoTime(),
    }));
  }, [lineupKey, lineupsState.liveControl.minute, getCurrentVideoTime]);

  const closeLiveComposer = useCallback((resumePlayback = true) => {
    setVideoComposerOverlayOpen(false);
    setLiveComposer(null);
    if (resumePlayback) {
      resumePlaybackAfterComposer();
    } else {
      shouldResumePlaybackRef.current = false;
    }
  }, [resumePlaybackAfterComposer]);

  const openFullscreenAction = useCallback((action: LiveActionType) => {
    pausePlaybackForComposer(true);
    setVideoComposerOverlayOpen(true);
    openLiveComposer(action);
  }, [openLiveComposer, pausePlaybackForComposer]);

  const openCustomComposer = useCallback((def: CustomEventDef, existingEvent?: ClubLiveEvent) => {
    if (existingEvent) {
      setTimerRunning(false);
      setLineupsState((current) => ({
        ...current,
        liveControl: {
          ...current.liveControl,
          phase: normalizeMatchPeriod(existingEvent.period, current.liveControl.phase) as LivePhase,
          minute: existingEvent.minute || current.liveControl.minute,
        },
      }));
      const causeMatch = existingEvent.detail.match(/Causa:\s*([^|]+)/);
      const outcomeMatch = existingEvent.detail.match(/Resultado:\s*([^|]+)/);
      const cause = causeMatch?.[1]?.trim() || '';
      const outcomeLabel = outcomeMatch?.[1]?.trim() || '';
      let outcomeValue = '';
      if (outcomeLabel) {
        const presetEntry = Object.entries(OUTCOME_PRESET_LABELS).find(([, label]) => label === outcomeLabel);
        outcomeValue = presetEntry ? presetEntry[0] : outcomeLabel;
      }
      setCustomComposer({
        mode: 'edit',
        eventId: existingEvent.id,
        defId: def.id,
        minute: existingEvent.minute,
        videoTime: existingEvent.videoTime || '',
        team: (existingEvent.team === 'home' || existingEvent.team === 'away') ? existingEvent.team : 'home',
        playerName: existingEvent.playerName,
        cause,
        outcome: outcomeValue,
      });
      return;
    }
    setCustomComposer({
      mode: 'create',
      defId: def.id,
      minute: lineupsState.liveControl.minute || '',
      videoTime: getCurrentVideoTime(),
      team: lineupKey,
      playerName: '',
      cause: def.causeMode === 'options' && def.causeOptions[0] ? def.causeOptions[0] : '',
      outcome: '',
    });
  }, [getCurrentVideoTime, lineupKey, lineupsState.liveControl.minute]);

  const saveCustomComposer = useCallback(() => {
    if (!customComposer) return;
    const def = customEventDefMap.get(customComposer.defId);
    if (!def) return;

    const points = computeCustomEventPoints(def, customComposer.outcome);
    const detail = buildCustomEventDetail(def, customComposer.cause.trim(), customComposer.outcome, points);
    const eventId = customComposer.eventId || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const previous = customComposer.mode === 'edit' ? events.find((entry) => entry.id === eventId) : undefined;
    const eventPeriod = previous?.period || getEventPeriodForType(def.id, lineupsState.liveControl.phase);
    const newEvent: ClubLiveEvent = {
      id: eventId,
      minute: customComposer.minute,
      videoTime: customComposer.videoTime,
      period: eventPeriod,
      order: previous?.order ?? getNextEventOrder(events),
      type: def.id,
      team: customComposer.team,
      playerName: def.hasPlayer ? customComposer.playerName.trim() : '',
      detail,
    };

    const scoreDelta = points;

    if (customComposer.mode === 'edit') {
      const previousPoints = previous ? parseCustomEventStoredPoints(previous.detail) : 0;
      const previousTeam = previous?.team;
      setEvents((current) => current.map((entry) => (entry.id === eventId ? newEvent : entry)));
      setMatchDraft((current) => {
        let nextScore = current.score;
        if (previous && (previousTeam === 'home' || previousTeam === 'away') && previousPoints !== 0) {
          nextScore = applyScoreDelta(nextScore, previousTeam, -previousPoints);
        }
        if (scoreDelta !== 0) {
          nextScore = applyScoreDelta(nextScore, customComposer.team, scoreDelta);
        }
        return { ...current, score: nextScore };
      });
    } else {
      setEvents((current) => [...current, newEvent]);
      if (scoreDelta !== 0) {
        setMatchDraft((current) => ({
          ...current,
          score: applyScoreDelta(current.score, customComposer.team, scoreDelta),
        }));
      }
    }

    setCustomComposer(null);
    setFeedback({ tone: 'success', message: customComposer.mode === 'edit' ? 'Evento personalizado actualizado.' : 'Evento personalizado registrado.' });
  }, [customComposer, customEventDefMap, events, lineupsState.liveControl.phase]);

  const openVideoEventComposer = useCallback((event: ClubLiveEvent) => {
    pausePlaybackForComposer(true);
    if (event.videoTime) {
      seekVideoTo(event.videoTime);
    }
    setTimerRunning(false);
    setLineupsState((current) => ({
      ...current,
      liveControl: {
        ...current.liveControl,
        phase: normalizeMatchPeriod(event.period, current.liveControl.phase) as LivePhase,
        minute: event.minute || current.liveControl.minute,
      },
    }));
    setVideoComposerOverlayOpen(true);
    openLiveComposer(getLiveActionFromEventType(event.type), event);
  }, [openLiveComposer, pausePlaybackForComposer, seekVideoTo]);

  const submitLiveComposer = useCallback(async () => {
    if (!liveComposer) return;
    if (liveComposer.action === 'substitution') {
      const outgoingName = liveComposer.playerName.trim();
      const incomingName = liveComposer.secondaryPlayerName.trim();

      if (!outgoingName || !incomingName) {
        setFeedback({ tone: 'error', message: 'Para registrar un cambio, seleccioná el jugador que sale y el que entra.' });
        return;
      }

      if (outgoingName.toLowerCase() === incomingName.toLowerCase()) {
        setFeedback({ tone: 'error', message: 'El jugador que entra debe ser distinto al que sale.' });
        return;
      }
    }

    const selectedPlayers = liveComposer.team === 'home'
      ? lineupsState.home
      : liveComposer.team === 'away'
        ? lineupsState.away
        : [];
    const previousEvent = liveComposer.mode === 'edit' && liveComposer.eventId
      ? events.find((event) => event.id === liveComposer.eventId)
      : undefined;
    const nextOrder = previousEvent?.order ?? getNextEventOrder(events);
    const nextPeriod = previousEvent?.period || getEventPeriodForType(liveComposer.action, lineupsState.liveControl.phase);
    const nextEvent = {
      ...buildEventFromComposer(liveComposer),
      period: nextPeriod,
      order: nextOrder,
      playerId: findLineupPlayerId(selectedPlayers, liveComposer.playerName),
      secondaryPlayerId: liveComposer.action === 'substitution'
        ? findLineupPlayerId(selectedPlayers, liveComposer.secondaryPlayerName)
        : undefined,
    };
    const nextDelta = getEventPoints(nextEvent);
    const serializeEventsForSave = (nextEvents: ClubLiveEvent[]) => nextEvents.map(serializeLiveEvent);

    if (liveComposer.mode === 'edit' && liveComposer.eventId) {
      const nextEvents = events.map((event) => event.id === liveComposer.eventId ? nextEvent : event);
      let nextScore = matchDraft.score;
      if (previousEvent) {
        nextScore = applyScoreDelta(nextScore, previousEvent.team, -getEventPoints(previousEvent));
      }
      nextScore = applyScoreDelta(nextScore, nextEvent.team, nextDelta);
      setEvents(nextEvents);
      setMatchDraft((current) => ({ ...current, score: nextScore }));
      closeLiveComposer();
      void saveMatch({
        score: buildScorePayload(matchState.score, nextScore),
        events: serializeEventsForSave(nextEvents),
      }, 'Evento actualizado.', { syncResponse: false });
      return;
    }

    let childEvent: ClubLiveEvent | null = null;
    const needsChild = ['knock_on', 'forward_pass', 'penalty', 'free_kick'].includes(liveComposer.action);

    if (needsChild) {
      if (liveComposer.action === 'knock_on' || liveComposer.action === 'forward_pass') {
        const oppositeTeam = liveComposer.team === 'home' ? 'away' : 'home';
        childEvent = {
          id: crypto.randomUUID(),
          minute: liveComposer.minute,
          videoTime: liveComposer.videoTime,
          type: 'scrum',
          team: oppositeTeam,
          playerName: '',
          detail: `Scrum (derivado de ${liveComposer.action === 'knock_on' ? 'Knock On' : 'Pase Forward'})`,
          parentEventId: nextEvent.id,
          sequence: 1,
          period: nextPeriod,
          order: nextOrder + 1,
        };
      }
      if ((liveComposer.action === 'penalty' || liveComposer.action === 'free_kick') && liveComposer.outcome === 'scrum') {
        childEvent = {
          id: crypto.randomUUID(),
          minute: liveComposer.minute,
          videoTime: liveComposer.videoTime,
          type: 'scrum',
          team: liveComposer.team,
          playerName: liveComposer.playerName.trim(),
          detail: `Scrum (derivado de ${liveComposer.action === 'penalty' ? 'Penal' : 'Free Kick'})`,
          parentEventId: nextEvent.id,
          sequence: 1,
          period: nextPeriod,
          order: nextOrder + 1,
        };
      }
      if ((liveComposer.action === 'penalty' || liveComposer.action === 'free_kick') && liveComposer.outcome === 'touch') {
        childEvent = {
          id: crypto.randomUUID(),
          minute: liveComposer.minute,
          videoTime: liveComposer.videoTime,
          type: 'line',
          team: liveComposer.team,
          playerName: liveComposer.playerName.trim(),
          detail: `Lineout (derivado de ${liveComposer.action === 'penalty' ? 'Penal' : 'Free Kick'})`,
          parentEventId: nextEvent.id,
          sequence: 1,
          period: nextPeriod,
          order: nextOrder + 1,
        };
      }
    }

    const nextEvents = [...events, nextEvent, ...(childEvent ? [childEvent] : [])];
    const nextScore = applyScoreDelta(matchDraft.score, nextEvent.team, nextDelta);
    const nextPhase = resolveLivePhaseAfterEvent(lineupsState.liveControl.phase, nextEvent.type);
    const liveControlChanged = nextPhase !== lineupsState.liveControl.phase;
    const nextLiveControl = liveControlChanged
      ? { ...lineupsState.liveControl, phase: nextPhase }
      : lineupsState.liveControl;
    const nextStatus = nextEvent.type === 'match_end'
      ? 'final'
      : nextEvent.type === 'match_start' || nextEvent.type === 'match_half'
        ? 'live'
        : matchDraft.status;
    const successMessage = childEvent
      ? `${getEventTypeLabel(nextEvent.type)} registrado. ${getEventTypeLabel(childEvent.type)} generado.`
      : liveComposer.action === 'try'
        ? 'Try guardado. Pod\u00e9s cargar la conversi\u00f3n aparte si corresponde.'
        : 'Evento agregado al timeline.';

    setEvents(nextEvents);
    setMatchDraft((current) => ({ ...current, status: nextStatus, score: nextScore }));
    if (liveControlChanged) {
      setLineupsState((current) => ({ ...current, liveControl: nextLiveControl }));
    }
    closeLiveComposer();
    const serializedNextEvents = serializeEventsForSave(nextEvents);
    const nextScorePayload = buildScorePayload(matchState.score, nextScore);
    void saveMatch({
      status: nextStatus,
      score: nextScorePayload,
      events: serializedNextEvents,
      ...(liveControlChanged ? {
        clock: buildClockPayload(nextLiveControl, nextStatus, matchState.clock),
        lineups: buildLineupsPayload(nextLiveControl, nextScorePayload, nextStatus, serializedNextEvents),
      } : {}),
    }, successMessage, { syncResponse: false });
  }, [buildLineupsPayload, closeLiveComposer, events, lineupsState.away, lineupsState.home, lineupsState.liveControl, liveComposer, matchDraft.score, matchDraft.status, matchState.clock, matchState.score, saveMatch]);

  const removeLiveEvent = useCallback((eventId: string) => {
    const eventIndex = events.findIndex((event) => event.id === eventId);
    if (eventIndex < 0) return;
    const targetEvent = events[eventIndex];
    const childEvents = events.filter((event) => event.parentEventId === eventId);
    const removedCount = 1 + childEvents.length;
    const resolvePoints = (entry: ClubLiveEvent) => (
      entry.type.startsWith('custom:')
        ? parseCustomEventStoredPoints(entry.detail)
        : getEventPoints(entry)
    );
    setLastRemovedEvent({ event: targetEvent, index: eventIndex });
    setEvents((current) => current.filter((event) => event.id !== eventId && event.parentEventId !== eventId));
    setMatchDraft((current) => {
      let nextScore = current.score;
      nextScore = applyScoreDelta(nextScore, targetEvent.team, -resolvePoints(targetEvent));
      childEvents.forEach((child) => {
        nextScore = applyScoreDelta(nextScore, child.team, -resolvePoints(child));
      });
      return { ...current, score: nextScore };
    });
    setFeedback({
      tone: 'success',
      message: removedCount > 1
        ? `${removedCount} eventos eliminados. Pod\u00e9s deshacer la \u00faltima acci\u00f3n.`
        : 'Evento eliminado. Pod\u00e9s deshacer la \u00faltima acci\u00f3n.',
    });
  }, [events]);

  const restoreLastRemovedEvent = useCallback(() => {
    if (!lastRemovedEvent) return;
    setEvents((current) => {
      const next = [...current];
      next.splice(lastRemovedEvent.index, 0, lastRemovedEvent.event);
      return next;
    });
    setMatchDraft((current) => {
      const restored = lastRemovedEvent.event;
      const points = restored.type.startsWith('custom:')
        ? parseCustomEventStoredPoints(restored.detail)
        : getEventPoints(restored);
      return {
        ...current,
        score: applyScoreDelta(current.score, restored.team, points),
      };
    });
    setLastRemovedEvent(null);
    setFeedback({ tone: 'success', message: 'Se restaur\u00f3 el \u00faltimo evento.' });
  }, [lastRemovedEvent]);

  const getLineupTeamLabel = (team: 'home' | 'away') => (
    team === 'home'
      ? homeClub?.short_name || homeClub?.name || 'Local'
      : awayClub?.short_name || awayClub?.name || 'Visitante'
  );

  const handleExportMatchSheetPdf = useCallback(async () => {
    const homeName = homeClub?.name || homeClub?.short_name || 'Local';
    const awayName = awayClub?.name || awayClub?.short_name || 'Visitante';
    const homeShortName = homeClub?.short_name || homeName;
    const awayShortName = awayClub?.short_name || awayName;
    const statGroups = buildPostMatchStatGroups(buildMatchStats(events));
    const eventStatsByType = new Map<string, { label: string; home: number; away: number }>();
    timelineEventsChronological.forEach((event) => {
      if (event.team !== 'home' && event.team !== 'away') return;
      const label = resolveEventTypeLabel(event.type);
      const current = eventStatsByType.get(event.type) || { label, home: 0, away: 0 };
      current[event.team] += 1;
      eventStatsByType.set(event.type, current);
    });
    const eventStatRows = Array.from(eventStatsByType.values())
      .sort((left, right) => left.label.localeCompare(right.label, 'es'));
    const formatLineup = (players: MatchLineupPlayer[]) => players.map((player) => ({
      number: String(player.number ?? '').trim(),
      name: player.name,
      position: player.position || '',
      role: player.role || '',
      isCaptain: Boolean(player.isCaptain),
    }));

    const opened = await exportMatchSheetPdf({
      title: `Planilla: ${homeName} vs ${awayName}`,
      status: matchDraft.status,
      statusLabel: getStatusLabel(matchDraft.status),
      date: when.date,
      time: when.time || 'Hora a confirmar',
      venue: matchDraft.venue || 'Sede a confirmar',
      referee: matchDraft.referee || 'A confirmar',
      roundLabel: matchState.roundLabel || matchState.round_id || 'Sin jornada',
      category: matchState.category || 'Sin categoria',
      accentColor,
      tournament: {
        name: matchState.tournament?.name || 'Competicion',
        logoUrl: matchState.tournament?.logo_url || null,
      },
      home: {
        name: homeName,
        shortName: homeShortName,
        logoUrl: homeClub?.logo_url || null,
        score: matchDraft.score.home.trim() || '0',
        points: formatPointValue(totalHomeTablePoints),
        pointsDetail: formatPointBreakdown(pointsPreview.homeBasePoints, pointsPreview.homeBonusPoints),
        lineup: formatLineup(lineupsState.home),
      },
      away: {
        name: awayName,
        shortName: awayShortName,
        logoUrl: awayClub?.logo_url || null,
        score: matchDraft.score.away.trim() || '0',
        points: formatPointValue(totalAwayTablePoints),
        pointsDetail: formatPointBreakdown(pointsPreview.awayBasePoints, pointsPreview.awayBonusPoints),
        lineup: formatLineup(lineupsState.away),
      },
      timeline: timelineEventsChronological.map((event, index) => {
        const eventScore = timelineScoreById.get(event.id);
        return {
          period: getMatchPeriodLabel(event.period),
          minute: event.minute || '--',
          summary: resolveEventSummary(event),
          team: event.team === 'home' ? homeShortName : event.team === 'away' ? awayShortName : 'Neutral',
          detail: formatMatchTimelineEventDescription(event, timelineEventsChronological, index, 'Sin detalle adicional'),
          score: eventScore && eventScore.points > 0 ? `${eventScore.home} - ${eventScore.away}` : undefined,
        };
      }),
      statSections: [
        { title: 'Resumen de eventos', rows: eventStatRows },
        { title: 'Puntos y definicion', rows: statGroups.scoring },
        { title: 'Juego y 22m', rows: statGroups.juego },
        { title: 'Continuidad', rows: statGroups.continuity },
        { title: 'Juego fijo', rows: statGroups.setPiece },
        { title: 'Disciplina y defensa', rows: statGroups.discipline },
      ],
      notes,
    });

    if (!opened) {
      setFeedback({
        tone: 'error',
        message: 'No se pudo abrir la ventana de impresion. Revisá el bloqueo de pop-ups del navegador.',
      });
    }
  }, [
    accentColor,
    awayClub,
    events,
    homeClub,
    lineupsState.away,
    lineupsState.home,
    matchDraft.referee,
    matchDraft.score.away,
    matchDraft.score.home,
    matchDraft.status,
    matchDraft.venue,
    matchState.category,
    matchState.roundLabel,
    matchState.round_id,
    matchState.tournament?.logo_url,
    matchState.tournament?.name,
    notes,
    pointsPreview.awayBasePoints,
    pointsPreview.awayBonusPoints,
    pointsPreview.homeBasePoints,
    pointsPreview.homeBonusPoints,
    resolveEventTypeLabel,
    resolveEventSummary,
    timelineEventsChronological,
    timelineScoreById,
    totalAwayTablePoints,
    totalHomeTablePoints,
    when.date,
    when.time,
  ]);

  const addLineupPlayer = useCallback((team: 'home' | 'away') => {
    setLineupViewTab(team);
    setLineupsState((current) => ({
      ...current,
      [team]: [...current[team], createEmptyLineupPlayer()],
    }));
  }, []);

  const renderLineupRows = (team: 'home' | 'away') => (
    <div className={styles.playerList}>
      {lineupsState[team].length === 0 ? <div className={styles.emptyState}>No hay alineacion cargada.</div> : null}
      {lineupsState[team].map((player, index) => (
        <div key={`${team}-${player.id || 'lineup'}-${index}`} className={styles.playerFormRow}>
          <input className={styles.input} value={String(player.number ?? '')} onChange={(event) => updateMyLineupPlayer(setLineupsState, team, index, { number: event.target.value })} placeholder="01" />
          <input className={styles.input} value={player.name} onChange={(event) => updateMyLineupPlayer(setLineupsState, team, index, { name: event.target.value })} placeholder="Jugador" />
          <input className={styles.input} value={player.position || ''} onChange={(event) => updateMyLineupPlayer(setLineupsState, team, index, { position: event.target.value })} placeholder="Posicion" />
          <select className={styles.select} value={player.role || 'starter'} onChange={(event) => updateMyLineupPlayer(setLineupsState, team, index, { role: event.target.value })}>
            <option value="starter">Titular</option>
            <option value="substitute">Suplente</option>
            <option value="reserve">Reserva</option>
          </select>
          <select className={styles.select} value={player.isCaptain ? 'captain' : 'none'} onChange={(event) => updateMyLineupPlayer(setLineupsState, team, index, { isCaptain: event.target.value === 'captain' })}>
            <option value="none">Sin capitania</option>
            <option value="captain">Capitan</option>
          </select>
          <button className={styles.rowMenu} type="button" aria-label="Eliminar jugador" onClick={() => removeLineupPlayer(setLineupsState, team, index)}><X size={14} /></button>
        </div>
      ))}
    </div>
  );

  const renderLiveComposerCard = (extraClassName?: string) => {
    if (!liveComposer) return null;

    return (
      <div className={[styles.liveComposerCard, extraClassName].filter(Boolean).join(' ')}>
        <div className={styles.liveComposerHeader}>
          <div>
            <h3>{liveComposer.mode === 'edit' ? 'Editar evento' : `Nuevo ${CLUB_EVENT_PANEL_ACTIONS.find((action) => action.id === liveComposer.action)?.label || 'evento'}`}</h3>
            <p>Formulario corto para operar el partido con la menor fricción posible.</p>
          </div>
          <button className={styles.miniBtn} type="button" onClick={() => closeLiveComposer()}>
            Cancelar
          </button>
        </div>

        <div className={styles.liveComposerGrid}>
          <label className={styles.field}>
            <span>Minuto</span>
            <input className={styles.input} value={liveComposer.minute} onChange={(event) => setLiveComposer((current) => current ? { ...current, minute: event.target.value } : current)} placeholder={currentMinute} />
          </label>
          <label className={styles.field}>
            <span>Periodo</span>
            <input
              className={styles.input}
              value={getMatchPeriodLabel(getEventPeriodForType(liveComposer.action, lineupsState.liveControl.phase))}
              readOnly
              title="El evento se guarda en el periodo activo."
            />
          </label>
          <label className={styles.field}>
            <span>Tiempo video</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className={styles.input}
                value={liveComposer.videoTime}
                onChange={(event) => setLiveComposer((current) => current ? { ...current, videoTime: event.target.value } : current)}
                placeholder="MM:SS"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className={styles.miniBtn}
                onClick={() => setLiveComposer((current) => current ? { ...current, videoTime: getCurrentVideoTime() } : current)}
                title="Capturar tiempo actual del video"
              >
                <Clock3 size={14} />
              </button>
            </div>
          </label>
          <label className={styles.field}>
            <span>Equipo</span>
            <select className={styles.select} value={liveComposer.team} onChange={(event) => setLiveComposer((current) => current ? { ...current, team: event.target.value as 'home' | 'away', playerName: '', secondaryPlayerName: '' } : current)}>
              <option value="home">{homeClub?.short_name || homeClub?.name || 'Local'}</option>
              <option value="away">{awayClub?.short_name || awayClub?.name || 'Visitante'}</option>
            </select>
          </label>

          {isPlayerSelectionAction(liveComposer.action) ? (
            <label className={styles.field}>
              <span>Jugador</span>
              <select className={styles.select} value={liveComposer.playerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, playerName: event.target.value } : current)}>
                {renderTeamPlayerOptions(liveComposer.team, 'activeWithDisabledSubstitutes', liveComposer.playerName, 'Seleccionar jugador')}
              </select>
            </label>
          ) : null}

          {liveComposer.action === 'entradas_22' ? (
            <label className={styles.field}>
              <span>Nota (opcional)</span>
              <input className={styles.input} value={liveComposer.zone} onChange={(event) => setLiveComposer((current) => current ? { ...current, zone: event.target.value } : current)} placeholder="Cómo entran al 22 rival" />
            </label>
          ) : null}

          {liveComposer.action === 'substitution' ? (
            <>
              <label className={styles.field}>
                <span>Sale</span>
                <select className={styles.select} value={liveComposer.playerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, playerName: event.target.value } : current)}>
                  {renderTeamPlayerOptions(liveComposer.team, 'active', liveComposer.playerName, 'Jugador que sale')}
                </select>
              </label>
              <label className={styles.field}>
                <span>Entra</span>
                <select className={styles.select} value={liveComposer.secondaryPlayerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, secondaryPlayerName: event.target.value } : current)}>
                  {renderTeamPlayerOptions(liveComposer.team, 'substitute', liveComposer.secondaryPlayerName, 'Jugador que entra')}
                </select>
              </label>
              <label className={styles.field} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" checked={liveComposer.isTemporary} onChange={(event) => setLiveComposer((current) => current ? { ...current, isTemporary: event.target.checked } : current)} />
                <span>Cambio temporal</span>
              </label>
            </>
          ) : null}

          {(liveComposer.action === 'scrum' || liveComposer.action === 'line' || liveComposer.action === 'maul') ? (
            <>
              <label className={styles.field}>
                <span>Jugador</span>
                <select className={styles.select} value={liveComposer.playerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, playerName: event.target.value } : current)}>
                  {renderTeamPlayerOptions(liveComposer.team, 'activeWithDisabledSubstitutes', liveComposer.playerName, 'Referente opcional')}
                </select>
              </label>
              <label className={styles.field}>
                <span>Zona</span>
                <input className={styles.input} value={liveComposer.zone} onChange={(event) => setLiveComposer((current) => current ? { ...current, zone: event.target.value } : current)} placeholder="5m, mitad, 22m..." />
              </label>
            </>
          ) : null}

          {(liveComposer.action === 'conversion' || liveComposer.action === 'drop_goal') ? (
            <label className={styles.field}>
              <span>Resultado</span>
              <select className={styles.select} value={liveComposer.outcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, outcome: event.target.value } : current)}>
                <option value="">Seleccionar</option>
                <option value="made">Convertida</option>
                <option value="missed">Fallada</option>
              </select>
            </label>
          ) : null}

          {liveComposer.action === 'penalty' ? (
            <>
              <label className={styles.field}>
                <span>Tipo de penal</span>
                <select className={styles.select} value={liveComposer.outcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, outcome: event.target.value } : current)}>
                  <option value="">Seleccionar</option>
                  <option value="converted">Tiro a palos (+3)</option>
                  <option value="missed">Tiro fallado</option>
                  <option value="touch">Kick al touch</option>
                  <option value="scrum">Scrum</option>
                  <option value="tap">Tap and go</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Causa de la infracción</span>
                <select className={styles.select} value={liveComposer.penaltyReason} onChange={(event) => setLiveComposer((current) => current ? { ...current, penaltyReason: event.target.value } : current)}>
                  <option value="">Seleccionar causa</option>
                  {PENALTY_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>{reason.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Pateador / detalle</span>
                <select className={styles.select} value={liveComposer.playerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, playerName: event.target.value } : current)}>
                  {renderTeamPlayerOptions(liveComposer.team, 'activeWithDisabledSubstitutes', liveComposer.playerName, 'Jugador que ejecuta')}
                </select>
              </label>
              <label className={styles.field}>
                <span>Zona</span>
                <input className={styles.input} value={liveComposer.zone} onChange={(event) => setLiveComposer((current) => current ? { ...current, zone: event.target.value } : current)} placeholder="Detalle opcional" />
              </label>
            </>
          ) : null}

          {liveComposer.action === 'penalty_committed' ? (
            <label className={styles.field}>
              <span>Motivo del penal</span>
              <select className={styles.select} value={liveComposer.penaltyReason} onChange={(event) => setLiveComposer((current) => current ? { ...current, penaltyReason: event.target.value } : current)}>
                <option value="">Seleccionar motivo</option>
                {PENALTY_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>{reason.label}</option>
                ))}
              </select>
            </label>
          ) : null}

          {liveComposer.action === 'free_kick' ? (
            <>
              <label className={styles.field}>
                <span>Opción</span>
                <select className={styles.select} value={liveComposer.outcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, outcome: event.target.value } : current)}>
                  <option value="">Seleccionar</option>
                  <option value="touch">Kick al touch</option>
                  <option value="scrum">Scrum</option>
                  <option value="tap">Tap and go</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Jugador</span>
                <select className={styles.select} value={liveComposer.playerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, playerName: event.target.value } : current)}>
                  {renderTeamPlayerOptions(liveComposer.team, 'activeWithDisabledSubstitutes', liveComposer.playerName, 'Jugador que ejecuta')}
                </select>
              </label>
              <label className={styles.field}>
                <span>Zona</span>
                <input className={styles.input} value={liveComposer.zone} onChange={(event) => setLiveComposer((current) => current ? { ...current, zone: event.target.value } : current)} placeholder="Detalle opcional" />
              </label>
            </>
          ) : null}

          {(liveComposer.action === 'knock_on' || liveComposer.action === 'forward_pass') ? (
            <label className={styles.field}>
              <span>Info</span>
              <div className={styles.input} style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                Se generará un scrum para el equipo contrario
              </div>
            </label>
          ) : null}

          {(liveComposer.action === 'card' || liveComposer.action === 'card_yellow' || liveComposer.action === 'card_red') ? (
            <>
              <label className={styles.field}>
                <span>Tipo</span>
                <select className={styles.select} value={liveComposer.outcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, outcome: event.target.value } : current)}>
                  <option value="yellow">Amarilla</option>
                  <option value="red">Roja</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Motivo</span>
                <input className={styles.input} value={liveComposer.reason} onChange={(event) => setLiveComposer((current) => current ? { ...current, reason: event.target.value } : current)} placeholder="Opcional" />
              </label>
            </>
          ) : null}

          {liveComposer.action === 'scrum' ? (
            <label className={styles.field}>
              <span>Resultado</span>
              <select className={styles.select} value={liveComposer.followUpOutcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, followUpOutcome: event.target.value as 'won' | 'lost' | '' } : current)}>
                <option value="">Seleccionar</option>
                <option value="won">Ganado</option>
                <option value="lost">Perdido</option>
              </select>
            </label>
          ) : null}

          {(liveComposer.action === 'line' || liveComposer.action === 'maul') ? (
            <label className={styles.field}>
              <span>Resultado</span>
              <select className={styles.select} value={liveComposer.followUpOutcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, followUpOutcome: event.target.value as 'won' | 'lost' | '' } : current)}>
                <option value="">Seleccionar</option>
                <option value="won">Ganado</option>
                <option value="lost">Perdido</option>
              </select>
            </label>
          ) : null}

          {liveComposer.action === 'try' ? (
            <label className={styles.field}>
              <span>Asistencia (opcional)</span>
              <select className={styles.select} value={liveComposer.secondaryPlayerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, secondaryPlayerName: event.target.value } : current)}>
                {renderTeamPlayerOptions(liveComposer.team, 'activeWithDisabledSubstitutes', liveComposer.secondaryPlayerName, 'Sin asistencia')}
              </select>
            </label>
          ) : null}

          {liveComposer.action === 'kick' ? (
            <>
              <label className={styles.field}>
                <span>Tipo de kick</span>
                <select className={styles.select} value={liveComposer.kickType} onChange={(event) => setLiveComposer((current) => current ? { ...current, kickType: event.target.value as LiveComposerState['kickType'] } : current)}>
                  <option value="">Seleccionar tipo</option>
                  {KICK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Distancia (m)</span>
                <input className={styles.input} value={liveComposer.kickDistance} onChange={(event) => setLiveComposer((current) => current ? { ...current, kickDistance: event.target.value } : current)} placeholder="40" />
              </label>
              <label className={styles.field}>
                <span>Zona</span>
                <input className={styles.input} value={liveComposer.zone} onChange={(event) => setLiveComposer((current) => current ? { ...current, zone: event.target.value } : current)} placeholder="Mitad, 22m, ingoal..." />
              </label>
            </>
          ) : null}

          {liveComposer.action === 'ruck' ? (
            <>
              <label className={styles.field}>
                <span>Resultado</span>
                <select className={styles.select} value={liveComposer.followUpOutcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, followUpOutcome: event.target.value as 'won' | 'lost' | '' } : current)}>
                  <option value="">Seleccionar</option>
                  <option value="won">Ganado</option>
                  <option value="lost">Perdido</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Zona</span>
                <input className={styles.input} value={liveComposer.zone} onChange={(event) => setLiveComposer((current) => current ? { ...current, zone: event.target.value } : current)} placeholder="Mitad, 22m, 5m..." />
              </label>
            </>
          ) : null}

          {liveComposer.action === 'pass' ? (
            <>
              <label className={styles.field}>
                <span>Tipo de pase</span>
                <select className={styles.select} value={liveComposer.passType} onChange={(event) => setLiveComposer((current) => current ? { ...current, passType: event.target.value as LiveComposerState['passType'] } : current)}>
                  <option value="">Seleccionar</option>
                  <option value="long">Largo</option>
                  <option value="short">Corto</option>
                  <option value="inside">Adentro</option>
                  <option value="outside">Afuera</option>
                  <option value="offload">Offload</option>
                  <option value="miss">Errado</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Resultado</span>
                <select className={styles.select} value={liveComposer.outcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, outcome: event.target.value } : current)}>
                  <option value="">Seleccionar</option>
                  <option value="completed">Completado</option>
                  <option value="intercepted">Interceptado</option>
                  <option value="dropped">Tocado</option>
                  <option value="forward">Forward</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Receptor</span>
                <select className={styles.select} value={liveComposer.secondaryPlayerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, secondaryPlayerName: event.target.value } : current)}>
                  {renderTeamPlayerOptions(liveComposer.team, 'activeWithDisabledSubstitutes', liveComposer.secondaryPlayerName, 'Seleccionar receptor')}
                </select>
              </label>
            </>
          ) : null}

          {DETAIL_ACTION_LABELS[liveComposer.action] ? (
            <label className={styles.field}>
              <span>Detalle</span>
              <input className={styles.input} value={liveComposer.reason} onChange={(event) => setLiveComposer((current) => current ? { ...current, reason: event.target.value } : current)} placeholder={DETAIL_ACTION_LABELS[liveComposer.action]} />
            </label>
          ) : null}
        </div>

        <div className={styles.liveComposerActions}>
          <button className={styles.btnGhost} type="button" onClick={() => closeLiveComposer()} disabled={saving}>
            Cerrar
          </button>
          <button className={styles.btnPrimary} type="button" onClick={() => { void submitLiveComposer(); }} disabled={saving}>
            {saving ? 'Guardando...' : liveComposer.mode === 'edit' ? 'Actualizar evento' : 'Guardar evento'}
          </button>
        </div>
      </div>
    );
  };
  void renderLiveComposerCard;

  return (
    <div className={styles.shell} style={{ ['--club-accent' as string]: accentColor }}>
      <div className={styles.appContainer}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
                return;
              }
              router.push(backHref);
            }}
          >
            <ChevronLeft size={14} />
            Volver
          </button>

          <div className={styles.breadcrumb}>
            <Link href={backHref} prefetch={false} className={styles.breadcrumbStrong}>Club Admin</Link>
            <span>/</span>
            <span>{matchState.tournament?.sport_id || 'Competencia'}</span>
            <span>/</span>
            <span>{matchState.category || 'Equipo Principal'}</span>
            <span>/</span>
            <span className={styles.breadcrumbStrong}>{matchState.roundLabel || 'Partido'}</span>
            <span className={`${styles.statusBadge} ${getStatusClass(matchDraft.status)}`}>{getStatusLabel(matchDraft.status)}</span>
          </div>

          <div className={styles.matchHeroBar}>
            <div className={styles.matchHero}>
              <div className={`${styles.team} ${styles.teamLocal}`}>
                <div className={styles.teamCopy}>
                  <span className={styles.teamMeta}>{isHome ? 'Tu club' : 'Local'}</span>
                  <span className={styles.teamName}>{homeClub?.short_name || homeClub?.name || 'Local'}</span>
                </div>
                <TeamShield club={homeClub} />
              </div>
              <div className={`${styles.vsBox} ${hasResult ? styles.scoreBox : ''}`}>
                {hasResult ? (
                  <>
                    <span className={styles.scoreValue}>{matchDraft.score.home || '0'}</span>
                    <span className={styles.scoreDivider}>-</span>
                    <span className={styles.scoreValue}>{matchDraft.score.away || '0'}</span>
                  </>
                ) : (
                  'VS'
                )}
              </div>
              <div className={`${styles.team} ${styles.teamVisitor}`}>
                <TeamShield club={awayClub} />
                <div className={styles.teamCopy}>
                  <span className={styles.teamMeta}>{!isHome ? 'Tu club' : 'Visitante'}</span>
                  <span className={styles.teamName}>{awayClub?.short_name || awayClub?.name || 'Visitante'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.headerMeta}>
            <div className={styles.metaGroup}>
              <div className={styles.metaItem}><Calendar size={14} /><span>{when.date}</span></div>
              <div className={styles.metaItem}><Clock3 size={14} /><b className={styles.metaValue}>{when.time || 'Hora a confirmar'}</b></div>
              <div className={styles.metaItem}><MapPin size={14} /><span>{matchDraft.venue || 'Cancha a confirmar'}</span></div>
              <div className={styles.metaItem}><span>{matchState.tournament?.name || 'Partido sin torneo'}</span></div>
              <div className={styles.metaItem}><span>{divisionCount > 0 ? `${divisionCount} planteles vinculados` : 'Plantel principal'}</span></div>
            </div>
            <div className={styles.saveCluster}>
              <div className={styles.actionStack}>
                <button
                  className={`${styles.btnGhost} ${saveUiState === 'saved' ? styles.btnGhostSaved : ''}`}
                  type="button"
                  onClick={() => { void saveMatch(undefined, 'Vista operativa actualizada'); }}
                  disabled={saving}
                >
                  <Save size={14} />
                  {saving ? 'Guardando...' : saveUiState === 'saved' ? 'Guardado' : 'Guardar'}
                </button>
                <button
                  className={`${styles.btnPrimary} ${saveUiState === 'saved' ? styles.btnPrimarySaved : ''}`}
                  type="button"
                  onClick={() => { void saveMatch(undefined, 'Partido actualizado'); }}
                  disabled={saving}
                >
                  {saveUiState === 'saved' ? 'Guardado' : 'Actualizar Partido'}
                </button>
              </div>
              <div className={`${styles.saveStatus} ${hasUnsavedChanges ? styles.saveStatusDirty : saveUiState === 'saved' ? styles.saveStatusSaved : saveUiState === 'error' ? styles.saveStatusError : styles.saveStatusNeutral}`}>
                {saveStatusText}
              </div>
            </div>
          </div>
        </header>

        <section className={styles.kpiStrip}>
          {kpis.map((kpi) => (
            <div key={kpi.label} className={styles.kpiCard}>
              <span className={styles.kpiLabel}>{kpi.label}</span>
              <div className={styles.kpiValue}>
                <span className={`${styles.dot} ${kpi.tone === 'green' ? styles.dotGreen : kpi.tone === 'yellow' ? styles.dotYellow : styles.dotRed}`} />
                {kpi.value}
              </div>
            </div>
          ))}
        </section>

        <main className={styles.mainLayout}>
          <section className={styles.workspace}>
            <nav className={styles.tabNav}>
              {TABS.map((tab) => (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ''}`}>
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className={styles.tabContent}>
              {activeTab === 'resumen' && (
                <>
                  <HeaderBlock title="Resumen del Partido" subtitle="Mesa operativa del club: logística, staff y estado general." />
                  <div className={styles.summaryGrid}>
                    <div className={styles.card}>
                      <div className={styles.cardTitle}>Información base</div>
                      <InfoRow label="Estado" value={getStatusLabel(matchDraft.status)} />
                      <InfoRow label="Fase" value={matchState.phase_id || 'Sin fase'} />
                      <InfoRow label="Jornada" value={matchState.roundLabel || matchState.round_id || 'Sin jornada'} />
                      <InfoRow label="Árbitro" value={matchDraft.referee || 'A confirmar'} />
                    </div>
                    <div className={styles.card}>
                      <div className={styles.cardTitle}>Notas internas</div>
                      <Area label="Notas del staff" rows={7} value={notes} onChange={setNotes} />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'alineacion' && (
                <>
                  <HeaderBlock title="Alineación y banco" subtitle="Titulares, suplentes y capitán de ambos equipos." action={
                    <button className={`${styles.miniPrimary} ${styles.lineupDesktopAction}`} type="button" onClick={() => addLineupPlayer(lineupViewTab)}>
                      + Agregar jugador
                    </button>
                  } />
                  <div className={`${styles.postTabs} ${styles.lineupDesktopOnly}`}>
                    <button
                      type="button"
                      className={`${styles.postTab}${lineupViewTab === 'home' ? ' ' + styles.postTabActive : ''}`}
                      onClick={() => setLineupViewTab('home')}
                    >
                      {homeClub?.short_name || homeClub?.name || 'Local'}
                    </button>
                    <button
                      type="button"
                      className={`${styles.postTab}${lineupViewTab === 'away' ? ' ' + styles.postTabActive : ''}`}
                      onClick={() => setLineupViewTab('away')}
                    >
                      {awayClub?.short_name || awayClub?.name || 'Visitante'}
                    </button>
                  </div>
                  <div className={`${styles.playerList} ${styles.lineupDesktopOnly}`}>
                    {lineupsState[lineupViewTab].length === 0 ? <div className={styles.emptyState}>No hay alineación cargada.</div> : null}
                    {lineupsState[lineupViewTab].map((player, index) => (
                      <div key={`${player.id || 'lineup'}-${index}`} className={styles.playerFormRow}>
                        <input className={styles.input} value={String(player.number ?? '')} onChange={(event) => updateMyLineupPlayer(setLineupsState, lineupViewTab, index, { number: event.target.value })} placeholder="01" />
                        <input className={styles.input} value={player.name} onChange={(event) => updateMyLineupPlayer(setLineupsState, lineupViewTab, index, { name: event.target.value })} placeholder="Jugador" />
                        <input className={styles.input} value={player.position || ''} onChange={(event) => updateMyLineupPlayer(setLineupsState, lineupViewTab, index, { position: event.target.value })} placeholder="Posición" />
                        <select className={styles.select} value={player.role || 'starter'} onChange={(event) => updateMyLineupPlayer(setLineupsState, lineupViewTab, index, { role: event.target.value })}>
                          <option value="starter">Titular</option>
                          <option value="substitute">Suplente</option>
                          <option value="reserve">Reserva</option>
                        </select>
                        <select className={styles.select} value={player.isCaptain ? 'captain' : 'none'} onChange={(event) => updateMyLineupPlayer(setLineupsState, lineupViewTab, index, { isCaptain: event.target.value === 'captain' })}>
                          <option value="none">Sin capitanía</option>
                          <option value="captain">Capitán</option>
                        </select>
                        <button className={styles.rowMenu} type="button" aria-label="Eliminar jugador" onClick={() => removeLineupPlayer(setLineupsState, lineupViewTab, index)}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <div className={styles.lineupMobileGrid}>
                    {(['home', 'away'] as const).map((team) => (
                      <section key={team} className={styles.lineupMobileCard}>
                        <div className={styles.lineupMobileHeader}>
                          <div className={styles.lineupMobileTeam}>
                            <span>{team === 'home' ? 'Local' : 'Visitante'}</span>
                            <strong>{getLineupTeamLabel(team)}</strong>
                            <small>{lineupsState[team].filter((player) => player.name.trim()).length} jugadores</small>
                          </div>
                          <button className={styles.lineupMobileAdd} type="button" onClick={() => addLineupPlayer(team)}>
                            + Jugador
                          </button>
                        </div>
                        {renderLineupRows(team)}
                      </section>
                    ))}
                  </div>
                </>
              )}

              {activeTab === 'vivo' && (
                <>
                  <HeaderBlock title="Operación en vivo" subtitle="Consola de carga rápida y panel de control del partido." />
                  <div className={styles.liveSubtabs}>
                    {LIVE_SUBVIEWS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`${styles.liveSubviewBtn} ${liveSubview === tab.id ? styles.liveSubviewBtnActive : ''}`}
                        onClick={() => setLiveSubview(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className={styles.liveScoreHeader}>
                    <div className={styles.liveScoreTeams}>
                      <div>
                        <span className={styles.liveHeaderLabel}>Local</span>
                        <strong>{homeClub?.short_name || homeClub?.name || 'Local'}</strong>
                      </div>
                      <div className={styles.liveScoreValue}>
                        <span>{matchDraft.score.home || '0'}</span>
                        <small>-</small>
                        <span>{matchDraft.score.away || '0'}</span>
                      </div>
                      <div>
                        <span className={styles.liveHeaderLabel}>Visitante</span>
                        <strong>{awayClub?.short_name || awayClub?.name || 'Visitante'}</strong>
                      </div>
                    </div>
                    <div className={styles.liveHeaderMeta}>
                      <label className={styles.liveHeaderField}>
                        <span>Estado</span>
                        <select
                          className={styles.select}
                          value={matchDraft.status}
                          onChange={(event) => setMatchDraft((current) => ({ ...current, status: event.target.value as MatchStatus }))}
                        >
                          {MATCH_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className={styles.liveHeaderField}>
                        <span>Tramo</span>
                        <select
                          className={styles.select}
                          value={lineupsState.liveControl.phase}
                          onChange={(event) => setLineupsState((current) => ({
                            ...current,
                            liveControl: { ...current.liveControl, phase: event.target.value as LivePhase },
                          }))}
                        >
                          {LIVE_PHASE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className={styles.liveHeaderField}>
                        <span>Minuto</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            className={styles.input}
                            value={lineupsState.liveControl.minute}
                            onChange={(event) => setLineupsState((current) => ({
                              ...current,
                              liveControl: { ...current.liveControl, minute: event.target.value },
                            }))}
                            placeholder="12"
                            style={{ width: 50, textAlign: 'center' }}
                          />
                          <button
                            type="button"
                            className={styles.miniBtn}
                            onClick={() => setTimerRunning((r) => !r)}
                            title={timerRunning ? 'Pausar timer' : 'Iniciar timer'}
                          >
                            {timerRunning ? <Pause size={14} /> : <Play size={14} />}
                          </button>
                          <button
                            type="button"
                            className={styles.miniBtn}
                            onClick={() => {
                              setTimerRunning(false);
                              setLineupsState((current) => ({
                                ...current,
                                liveControl: { ...current.liveControl, minute: '0' },
                              }));
                            }}
                            title="Resetear timer"
                          >
                            <RotateCcw size={14} />
                          </button>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className={styles.card} style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.6, fontWeight: 700 }}>Transmisión del partido</span>
                      <button
                        type="button"
                        className={styles.miniPrimary}
                        onClick={toggleVideoFullscreen}
                        title={videoExpanded ? 'Salir de pantalla completa' : 'Pantalla completa'}
                        style={{ fontSize: '1rem', padding: '6px 12px' }}
                      >
                        {videoExpanded ? <><Minimize2 size={14} /> Salir</> : <><Maximize2 size={14} /> Pantalla completa</>}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                      <input
                        className={styles.input}
                        value={matchDraft.broadcastUrl}
                        onChange={(event) => setMatchDraft((current) => ({ ...current, broadcastUrl: event.target.value }))}
                        placeholder="YouTube, Vimeo, Dropbox, Google Drive, MP4..."
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className={styles.miniPrimary}
                        onClick={() => {
                          setFeedback({ tone: 'success', message: 'URL de transmisión actualizada' });
                        }}
                      >
                        Cargar
                      </button>
                    </div>
                    {(() => {
                      const video = normalizeVideoUrl(matchDraft.broadcastUrl);
                      if (video.type === 'unsupported') {
                        return (
                          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                            {video.message || 'Cargá el link de transmisión para ver el partido aquí'}
                          </div>
                        );
                      }
                      return (
                        <div
                          ref={videoContainerRef}
                          className={`${styles.videoShell} ${videoExpanded ? styles.videoShellExpanded : ''}`}
                        >
                          <div className={styles.videoToolbar}>
                            <button type="button" className={styles.miniBtn} onClick={() => seekVideo(-10)} title="Retroceder 10s"><ChevronsLeft size={14} /> 10s</button>
                            <button type="button" className={styles.miniBtn} onClick={() => seekVideo(-5)} title="Retroceder 5s"><ChevronLeft size={14} /> 5s</button>
                            <button type="button" className={styles.miniBtn} onClick={() => seekVideo(5)} title="Avanzar 5s">5s <Play size={12} /></button>
                            <button type="button" className={styles.miniBtn} onClick={() => seekVideo(10)} title="Avanzar 10s">10s <ChevronsRight size={14} /></button>
                          </div>
                          <div className={styles.videoStage}>
                            {video.type === 'video' ? (
                              <video
                                ref={videoRef}
                                src={video.src}
                                controls
                                className={styles.videoViewport}
                                playsInline
                                controlsList="nofullscreen"
                              />
                            ) : (
                              <iframe
                                ref={iframeRef}
                                src={video.src}
                                className={styles.videoViewport}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            )}
                          </div>
                          {videoExpanded && (
                            <div className={styles.fullscreenActionsDock}>
                              <div className={styles.fullscreenActionsList}>
                                {CLUB_EVENT_PANEL_ACTIONS.map((action) => {
                                  const groupTone = getLiveActionGroupTone(action.id);
                                  return (
                                    <button
                                      key={action.id}
                                      type="button"
                                      className={`${styles.fullscreenActionBtn} ${styles[`liveActionBtn${groupTone.charAt(0).toUpperCase()}${groupTone.slice(1)}`]}`}
                                      onClick={() => {
                                        void openFullscreenAction(action.id);
                                      }}
                                      title={`Cargar ${action.label}`}
                                    >
                                      <span className={styles.fullscreenActionGlyph}>{action.glyph}</span>
                                      <span className={styles.fullscreenActionLabel}>{action.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {liveComposer && videoComposerOverlayOpen ? (
                            <div className={styles.fullscreenComposerOverlay}>
                              {renderLiveComposerCard(styles.liveComposerOverlayCard)}
                            </div>
                          ) : null}
                          {!videoExpanded && timelineEventsRecentFirst.length > 0 && (
                            <div className={styles.fullscreenEventsDock}>
                              <div className={styles.fullscreenEventsHeader}>
                                <span className={styles.fullscreenEventsLabel}>Eventos del partido</span>
                                <button
                                  type="button"
                                  className={styles.miniBtn}
                                  onClick={() => setEventsPanelCollapsed((c) => !c)}
                                  title={eventsPanelCollapsed ? 'Desplegar' : 'Comprimir'}
                                >
                                  {eventsPanelCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                </button>
                              </div>
                              {!eventsPanelCollapsed && (
                                <div className={styles.fullscreenEventsList}>
                                  {timelineEventsRecentFirst.map((event) => (
                                    <button
                                      key={event.id}
                                      type="button"
                                      onClick={() => openVideoEventComposer(event)}
                                      title={`${resolveEventTypeLabel(event.type)} - ${getMatchPeriodLabel(event.period)} - ${event.minute} min${event.videoTime ? ` - Video: ${event.videoTime}` : ''}`}
                                      className={styles.fullscreenEventCard}
                                    >
                                      <span className={styles.fullscreenEventGlyph}>{resolveEventGlyph(event.type)}</span>
                                      <span className={styles.fullscreenEventMinute}>{getMatchPeriodLabel(event.period)} - {event.minute} min</span>
                                      {event.videoTime ? <span className={styles.fullscreenEventTime}>Video {event.videoTime}</span> : null}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {liveSubview === 'eventos' ? (
                    <div className={styles.liveConsole}>
                      <div className={styles.eventPanelToolbar}>
                        <div className={styles.eventPanelToolbarMeta}>
                          <span>Botonera</span>
                          <small>
                            {CLUB_EVENT_PANEL_ACTIONS.length - hiddenEventActions.size} de {CLUB_EVENT_PANEL_ACTIONS.length} visibles
                          </small>
                        </div>
                        <button
                          type="button"
                          className={styles.miniBtn}
                          onClick={() => setEventPanelConfigOpen(true)}
                          title="Personalizar botonera"
                        >
                          <Settings size={14} />
                          Personalizar
                        </button>
                      </div>
                      <div
                        className={`${styles.liveEventPanel} ${eventPanelConfig.density === 'compact' ? styles.liveEventPanelCompact : ''}`}
                        style={{
                          ['--live-action-cols-desktop' as string]: String(eventPanelConfig.desktopColumns),
                          ['--live-action-cols-mobile' as string]: String(eventPanelConfig.mobileColumns),
                        }}
                      >
                        {CLUB_EVENT_PANEL_GROUPS.map((group) => {
                          const visibleActions = group.actions.filter((action) => !hiddenEventActions.has(action.id));
                          const customsForGroup = eventPanelConfig.customEvents.filter((def) => def.group === group.group);
                          if (visibleActions.length === 0 && customsForGroup.length === 0) return null;
                          return (
                            <section key={group.group} className={styles.liveEventGroup}>
                              <div className={styles.liveEventGroupHeader}>
                                <span>{group.group}</span>
                                <small>{visibleActions.length + customsForGroup.length} eventos</small>
                              </div>
                              <div className={styles.liveActionGrid}>
                                {visibleActions.map((action) => (
                                  <button
                                    key={action.id}
                                    type="button"
                                    className={`${styles.liveActionBtn} ${styles[`liveActionBtn${group.tone.charAt(0).toUpperCase()}${group.tone.slice(1)}`]} ${liveComposer?.action === action.id ? styles.liveActionBtnActive : ''}`}
                                    onClick={() => openLiveComposer(action.id)}
                                  >
                                    <span className={styles.liveActionGlyph}>{action.glyph}</span>
                                    <span className={styles.liveActionLabel}>{action.label}</span>
                                    <small className={styles.liveActionMeta}>{action.meta}</small>
                                  </button>
                                ))}
                                {customsForGroup.map((def) => (
                                  <button
                                    key={def.id}
                                    type="button"
                                    className={`${styles.liveActionBtn} ${styles[CUSTOM_EVENT_TONE_TO_STYLE[def.tone]]} ${customComposer?.defId === def.id ? styles.liveActionBtnActive : ''}`}
                                    onClick={() => openCustomComposer(def)}
                                  >
                                    <span className={styles.liveActionGlyph}>{def.glyph}</span>
                                    <span className={styles.liveActionLabel}>{def.label}</span>
                                    <small className={styles.liveActionMeta}>
                                      {def.pointsMode === 'fixed' ? `+${def.pointsFixed} pts` : def.pointsMode === 'by_outcome' ? 'Pts por outcome' : 'Personalizado'}
                                    </small>
                                  </button>
                                ))}
                              </div>
                            </section>
                          );
                        })}
                        {(() => {
                          const personalizedGroupExists = CLUB_EVENT_PANEL_GROUPS.some((group) => group.group === 'Personalizado');
                          if (personalizedGroupExists) return null;
                          const personalized = eventPanelConfig.customEvents.filter((def) => def.group === 'Personalizado');
                          if (personalized.length === 0) return null;
                          return (
                            <section className={styles.liveEventGroup}>
                              <div className={styles.liveEventGroupHeader}>
                                <span>Personalizado</span>
                                <small>{personalized.length} eventos</small>
                              </div>
                              <div className={styles.liveActionGrid}>
                                {personalized.map((def) => (
                                  <button
                                    key={def.id}
                                    type="button"
                                    className={`${styles.liveActionBtn} ${styles[CUSTOM_EVENT_TONE_TO_STYLE[def.tone]]} ${customComposer?.defId === def.id ? styles.liveActionBtnActive : ''}`}
                                    onClick={() => openCustomComposer(def)}
                                  >
                                    <span className={styles.liveActionGlyph}>{def.glyph}</span>
                                    <span className={styles.liveActionLabel}>{def.label}</span>
                                    <small className={styles.liveActionMeta}>
                                      {def.pointsMode === 'fixed' ? `+${def.pointsFixed} pts` : def.pointsMode === 'by_outcome' ? 'Pts por outcome' : 'Personalizado'}
                                    </small>
                                  </button>
                                ))}
                              </div>
                            </section>
                          );
                        })()}
                      </div>

                      {liveComposer ? (
                        <div className={styles.liveComposerCard}>
                          <div className={styles.liveComposerHeader}>
                            <div>
                              <h3>{liveComposer.mode === 'edit' ? 'Editar evento' : `Nuevo ${CLUB_EVENT_PANEL_ACTIONS.find((action) => action.id === liveComposer.action)?.label || 'evento'}`}</h3>
                              <p>Formulario corto para operar el partido con la menor fricción posible.</p>
                            </div>
                            <button className={styles.miniBtn} type="button" onClick={() => setLiveComposer(null)}>
                              Cancelar
                            </button>
                          </div>

                          <div className={styles.liveComposerGrid}>
                            <label className={styles.field}>
                              <span>Minuto</span>
                              <input className={styles.input} value={liveComposer.minute} onChange={(event) => setLiveComposer((current) => current ? { ...current, minute: event.target.value } : current)} placeholder={currentMinute} />
                            </label>
                            <label className={styles.field}>
                              <span>Tiempo video</span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input
                                  className={styles.input}
                                  value={liveComposer.videoTime}
                                  onChange={(event) => setLiveComposer((current) => current ? { ...current, videoTime: event.target.value } : current)}
                                  placeholder="MM:SS"
                                  style={{ flex: 1 }}
                                />
                                  <button
                                    type="button"
                                    className={styles.miniBtn}
                                    onClick={() => setLiveComposer((current) => current ? { ...current, videoTime: getCurrentVideoTime() } : current)}
                                    title="Capturar tiempo actual del video"
                                  >
                                    <Clock3 size={14} />
                                  </button>
                              </div>
                            </label>
                            <label className={styles.field}>
                              <span>Equipo</span>
                              <select className={styles.select} value={liveComposer.team} onChange={(event) => setLiveComposer((current) => current ? { ...current, team: event.target.value as 'home' | 'away', playerName: '', secondaryPlayerName: '' } : current)}>
                                <option value="home">{homeClub?.short_name || homeClub?.name || 'Local'}</option>
                                <option value="away">{awayClub?.short_name || awayClub?.name || 'Visitante'}</option>
                              </select>
                            </label>

                            {isPlayerSelectionAction(liveComposer.action) ? (
                              <label className={styles.field}>
                                <span>Jugador</span>
                                <select className={styles.select} value={liveComposer.playerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, playerName: event.target.value } : current)}>
                                  {renderTeamPlayerOptions(liveComposer.team, 'activeWithDisabledSubstitutes', liveComposer.playerName, 'Seleccionar jugador')}
                                </select>
                              </label>
                            ) : null}

                            {liveComposer.action === 'entradas_22' ? (
                              <label className={styles.field}>
                                <span>Nota (opcional)</span>
                                <input className={styles.input} value={liveComposer.zone} onChange={(event) => setLiveComposer((current) => current ? { ...current, zone: event.target.value } : current)} placeholder="Cómo entran al 22 rival" />
                              </label>
                            ) : null}

                            {liveComposer.action === 'substitution' ? (
                              <>
                                <label className={styles.field}>
                                  <span>Sale</span>
                                  <select className={styles.select} value={liveComposer.playerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, playerName: event.target.value } : current)}>
                                    {renderTeamPlayerOptions(liveComposer.team, 'active', liveComposer.playerName, 'Jugador que sale')}
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Entra</span>
                                  <select className={styles.select} value={liveComposer.secondaryPlayerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, secondaryPlayerName: event.target.value } : current)}>
                                    {renderTeamPlayerOptions(liveComposer.team, 'substitute', liveComposer.secondaryPlayerName, 'Jugador que entra')}
                                  </select>
                                </label>
                                <label className={styles.field} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                                  <input type="checkbox" checked={liveComposer.isTemporary} onChange={(event) => setLiveComposer((current) => current ? { ...current, isTemporary: event.target.checked } : current)} />
                                  <span>Cambio temporal</span>
                                </label>
                              </>
                            ) : null}

                            {(liveComposer.action === 'scrum' || liveComposer.action === 'line' || liveComposer.action === 'maul') ? (
                              <>
                                <label className={styles.field}>
                                  <span>Jugador</span>
                                  <select className={styles.select} value={liveComposer.playerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, playerName: event.target.value } : current)}>
                                    {renderTeamPlayerOptions(liveComposer.team, 'activeWithDisabledSubstitutes', liveComposer.playerName, 'Referente opcional')}
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Zona</span>
                                  <input className={styles.input} value={liveComposer.zone} onChange={(event) => setLiveComposer((current) => current ? { ...current, zone: event.target.value } : current)} placeholder="5m, mitad, 22m..." />
                                </label>
                              </>
                            ) : null}

                            {(liveComposer.action === 'conversion' || liveComposer.action === 'drop_goal') ? (
                              <label className={styles.field}>
                                <span>Resultado</span>
                                <select className={styles.select} value={liveComposer.outcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, outcome: event.target.value } : current)}>
                                  <option value="">Seleccionar</option>
                                  <option value="made">Convertida</option>
                                  <option value="missed">Fallada</option>
                                </select>
                              </label>
                            ) : null}

                            {liveComposer.action === 'penalty' ? (
                              <>
                                <label className={styles.field}>
                                  <span>Tipo de penal</span>
                                  <select className={styles.select} value={liveComposer.outcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, outcome: event.target.value } : current)}>
                                    <option value="">Seleccionar</option>
                                    <option value="converted">Tiro a palos (+3)</option>
                                    <option value="missed">Tiro fallado</option>
                                    <option value="touch">Kick al touch</option>
                                    <option value="scrum">Scrum</option>
                                    <option value="tap">Tap and go</option>
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Causa de la infracción</span>
                                  <select className={styles.select} value={liveComposer.penaltyReason} onChange={(event) => setLiveComposer((current) => current ? { ...current, penaltyReason: event.target.value } : current)}>
                                    <option value="">Seleccionar causa</option>
                                    {PENALTY_REASONS.map((reason) => (
                                      <option key={reason.value} value={reason.value}>{reason.label}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Pateador / detalle</span>
                                  <select className={styles.select} value={liveComposer.playerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, playerName: event.target.value } : current)}>
                                    {renderTeamPlayerOptions(liveComposer.team, 'activeWithDisabledSubstitutes', liveComposer.playerName, 'Jugador que ejecuta')}
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Zona</span>
                                  <input className={styles.input} value={liveComposer.zone} onChange={(event) => setLiveComposer((current) => current ? { ...current, zone: event.target.value } : current)} placeholder="Detalle opcional" />
                                </label>
                              </>
                            ) : null}

                            {liveComposer.action === 'penalty_committed' ? (
                              <label className={styles.field}>
                                <span>Motivo del penal</span>
                                <select className={styles.select} value={liveComposer.penaltyReason} onChange={(event) => setLiveComposer((current) => current ? { ...current, penaltyReason: event.target.value } : current)}>
                                  <option value="">Seleccionar motivo</option>
                                  {PENALTY_REASONS.map((reason) => (
                                    <option key={reason.value} value={reason.value}>{reason.label}</option>
                                  ))}
                                </select>
                              </label>
                            ) : null}

                            {liveComposer.action === 'free_kick' ? (
                              <>
                                <label className={styles.field}>
                                  <span>Opción</span>
                                  <select className={styles.select} value={liveComposer.outcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, outcome: event.target.value } : current)}>
                                    <option value="">Seleccionar</option>
                                    <option value="touch">Kick al touch</option>
                                    <option value="scrum">Scrum</option>
                                    <option value="tap">Tap and go</option>
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Jugador</span>
                                  <select className={styles.select} value={liveComposer.playerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, playerName: event.target.value } : current)}>
                                    {renderTeamPlayerOptions(liveComposer.team, 'activeWithDisabledSubstitutes', liveComposer.playerName, 'Jugador que ejecuta')}
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Zona</span>
                                  <input className={styles.input} value={liveComposer.zone} onChange={(event) => setLiveComposer((current) => current ? { ...current, zone: event.target.value } : current)} placeholder="Detalle opcional" />
                                </label>
                              </>
                            ) : null}

                            {(liveComposer.action === 'knock_on' || liveComposer.action === 'forward_pass') ? (
                              <label className={styles.field}>
                                <span>Info</span>
                                <div className={styles.input} style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                                  Se generará un scrum para el equipo contrario
                                </div>
                              </label>
                            ) : null}

                            {(liveComposer.action === 'card' || liveComposer.action === 'card_yellow' || liveComposer.action === 'card_red') ? (
                              <>
                                <label className={styles.field}>
                                  <span>Tipo</span>
                                  <select className={styles.select} value={liveComposer.outcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, outcome: event.target.value } : current)}>
                                    <option value="yellow">Amarilla</option>
                                    <option value="red">Roja</option>
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Motivo</span>
                                  <input className={styles.input} value={liveComposer.reason} onChange={(event) => setLiveComposer((current) => current ? { ...current, reason: event.target.value } : current)} placeholder="Opcional" />
                                </label>
                              </>
                            ) : null}

                            {liveComposer.action === 'scrum' ? (
                              <label className={styles.field}>
                                <span>Resultado</span>
                                <select className={styles.select} value={liveComposer.followUpOutcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, followUpOutcome: event.target.value as 'won' | 'lost' | '' } : current)}>
                                  <option value="">Seleccionar</option>
                                  <option value="won">Ganado</option>
                                  <option value="lost">Perdido</option>
                                </select>
                              </label>
                            ) : null}

                            {(liveComposer.action === 'line' || liveComposer.action === 'maul') ? (
                              <label className={styles.field}>
                                <span>Resultado</span>
                                <select className={styles.select} value={liveComposer.followUpOutcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, followUpOutcome: event.target.value as 'won' | 'lost' | '' } : current)}>
                                  <option value="">Seleccionar</option>
                                  <option value="won">Ganado</option>
                                  <option value="lost">Perdido</option>
                                </select>
                              </label>
                            ) : null}

                            {liveComposer.action === 'try' ? (
                              <label className={styles.field}>
                                <span>Asistencia (opcional)</span>
                                <select className={styles.select} value={liveComposer.secondaryPlayerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, secondaryPlayerName: event.target.value } : current)}>
                                  {renderTeamPlayerOptions(liveComposer.team, 'activeWithDisabledSubstitutes', liveComposer.secondaryPlayerName, 'Sin asistencia')}
                                </select>
                              </label>
                            ) : null}

                            {liveComposer.action === 'kick' ? (
                              <>
                                <label className={styles.field}>
                                  <span>Tipo de kick</span>
                                  <select className={styles.select} value={liveComposer.kickType} onChange={(event) => setLiveComposer((current) => current ? { ...current, kickType: event.target.value as LiveComposerState['kickType'] } : current)}>
                                    <option value="">Seleccionar tipo</option>
                                    {KICK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Distancia (m)</span>
                                  <input className={styles.input} value={liveComposer.kickDistance} onChange={(event) => setLiveComposer((current) => current ? { ...current, kickDistance: event.target.value } : current)} placeholder="40" />
                                </label>
                                <label className={styles.field}>
                                  <span>Zona</span>
                                  <input className={styles.input} value={liveComposer.zone} onChange={(event) => setLiveComposer((current) => current ? { ...current, zone: event.target.value } : current)} placeholder="Mitad, 22m, ingoal..." />
                                </label>
                              </>
                            ) : null}

                            {liveComposer.action === 'ruck' ? (
                              <>
                                <label className={styles.field}>
                                  <span>Resultado</span>
                                  <select className={styles.select} value={liveComposer.followUpOutcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, followUpOutcome: event.target.value as 'won' | 'lost' | '' } : current)}>
                                    <option value="">Seleccionar</option>
                                    <option value="won">Ganado</option>
                                    <option value="lost">Perdido</option>
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Zona</span>
                                  <input className={styles.input} value={liveComposer.zone} onChange={(event) => setLiveComposer((current) => current ? { ...current, zone: event.target.value } : current)} placeholder="Mitad, 22m, 5m..." />
                                </label>
                              </>
                            ) : null}

                            {liveComposer.action === 'pass' ? (
                              <>
                                <label className={styles.field}>
                                  <span>Tipo de pase</span>
                                  <select className={styles.select} value={liveComposer.passType} onChange={(event) => setLiveComposer((current) => current ? { ...current, passType: event.target.value as LiveComposerState['passType'] } : current)}>
                                    <option value="">Seleccionar</option>
                                    <option value="long">Largo</option>
                                    <option value="short">Corto</option>
                                    <option value="inside">Adentro</option>
                                    <option value="outside">Afuera</option>
                                    <option value="offload">Offload</option>
                                    <option value="miss">Errado</option>
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Resultado</span>
                                  <select className={styles.select} value={liveComposer.outcome} onChange={(event) => setLiveComposer((current) => current ? { ...current, outcome: event.target.value } : current)}>
                                    <option value="">Seleccionar</option>
                                    <option value="completed">Completado</option>
                                    <option value="intercepted">Interceptado</option>
                                    <option value="dropped">Tocado</option>
                                    <option value="forward">Forward</option>
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Receptor</span>
                                  <select className={styles.select} value={liveComposer.secondaryPlayerName} onChange={(event) => setLiveComposer((current) => current ? { ...current, secondaryPlayerName: event.target.value } : current)}>
                                    {renderTeamPlayerOptions(liveComposer.team, 'activeWithDisabledSubstitutes', liveComposer.secondaryPlayerName, 'Seleccionar receptor')}
                                  </select>
                                </label>
                              </>
                            ) : null}

                            {DETAIL_ACTION_LABELS[liveComposer.action] ? (
                              <label className={styles.field}>
                                <span>Detalle</span>
                                <input className={styles.input} value={liveComposer.reason} onChange={(event) => setLiveComposer((current) => current ? { ...current, reason: event.target.value } : current)} placeholder={DETAIL_ACTION_LABELS[liveComposer.action]} />
                              </label>
                            ) : null}
                          </div>

                          <div className={styles.liveComposerActions}>
                            <button className={styles.btnGhost} type="button" onClick={() => setLiveComposer(null)}>
                              Cerrar
                            </button>
                            <button className={styles.btnPrimary} type="button" onClick={submitLiveComposer}>
                              {liveComposer.mode === 'edit' ? 'Actualizar evento' : 'Guardar evento'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.liveHintCard}>
                          <strong>Botonera inteligente</strong>
                          <p>Elegí una acción de arriba para abrir una carga corta. El sistema actualiza el timeline y suma puntos automáticos cuando corresponde.</p>
                        </div>
                      )}

                      {customComposer ? (() => {
                        const def = customEventDefMap.get(customComposer.defId);
                        if (!def) return null;
                        const outcomeValues = getOutcomeValuesForDef(def);
                        const previewPoints = computeCustomEventPoints(def, customComposer.outcome);
                        return (
                          <div className={styles.liveComposerCard}>
                            <div className={styles.liveComposerHeader}>
                              <div>
                                <h3>{customComposer.mode === 'edit' ? 'Editar evento' : `Nuevo ${def.label}`}</h3>
                                <p>Evento personalizado · {def.group}{previewPoints !== 0 ? ` · ${previewPoints > 0 ? '+' : ''}${previewPoints} pts` : ''}</p>
                              </div>
                              <button className={styles.miniBtn} type="button" onClick={() => setCustomComposer(null)}>
                                Cancelar
                              </button>
                            </div>

                            <div className={styles.liveComposerGrid}>
                              <label className={styles.field}>
                                <span>Minuto</span>
                                <input className={styles.input} value={customComposer.minute} onChange={(event) => setCustomComposer((current) => current ? { ...current, minute: event.target.value } : current)} placeholder={currentMinute} />
                              </label>
                              <label className={styles.field}>
                                <span>Periodo</span>
                                <input className={styles.input} value={getMatchPeriodLabel(lineupsState.liveControl.phase)} readOnly />
                              </label>
                              <label className={styles.field}>
                                <span>Tiempo video</span>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <input
                                    className={styles.input}
                                    value={customComposer.videoTime}
                                    onChange={(event) => setCustomComposer((current) => current ? { ...current, videoTime: event.target.value } : current)}
                                    placeholder="MM:SS"
                                    style={{ flex: 1 }}
                                  />
                                  <button
                                    type="button"
                                    className={styles.miniBtn}
                                    onClick={() => setCustomComposer((current) => current ? { ...current, videoTime: getCurrentVideoTime() } : current)}
                                    title="Capturar tiempo actual del video"
                                  >
                                    <Clock3 size={14} />
                                  </button>
                                </div>
                              </label>
                              <label className={styles.field}>
                                <span>Equipo</span>
                                <select
                                  className={styles.select}
                                  value={customComposer.team}
                                  onChange={(event) => setCustomComposer((current) => current ? { ...current, team: event.target.value as 'home' | 'away', playerName: '' } : current)}
                                >
                                  <option value="home">{homeClub?.short_name || homeClub?.name || 'Local'}</option>
                                  <option value="away">{awayClub?.short_name || awayClub?.name || 'Visitante'}</option>
                                </select>
                              </label>

                              {def.hasPlayer ? (
                                <label className={styles.field}>
                                  <span>Jugador</span>
                                  <select
                                    className={styles.select}
                                    value={customComposer.playerName}
                                    onChange={(event) => setCustomComposer((current) => current ? { ...current, playerName: event.target.value } : current)}
                                  >
                                    {renderTeamPlayerOptions(customComposer.team, 'activeWithDisabledSubstitutes', customComposer.playerName, 'Seleccionar jugador')}
                                  </select>
                                </label>
                              ) : null}

                              {def.causeMode === 'text' ? (
                                <label className={styles.field}>
                                  <span>Causa</span>
                                  <input
                                    className={styles.input}
                                    value={customComposer.cause}
                                    onChange={(event) => setCustomComposer((current) => current ? { ...current, cause: event.target.value } : current)}
                                    placeholder="Detalle de la causa"
                                  />
                                </label>
                              ) : null}

                              {def.causeMode === 'options' ? (
                                <label className={styles.field}>
                                  <span>Causa</span>
                                  <select
                                    className={styles.select}
                                    value={customComposer.cause}
                                    onChange={(event) => setCustomComposer((current) => current ? { ...current, cause: event.target.value } : current)}
                                  >
                                    <option value="">Seleccionar causa</option>
                                    {def.causeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                                  </select>
                                </label>
                              ) : null}

                              {def.outcomeMode !== 'none' ? (
                                <label className={styles.field}>
                                  <span>Outcome</span>
                                  <select
                                    className={styles.select}
                                    value={customComposer.outcome}
                                    onChange={(event) => setCustomComposer((current) => current ? { ...current, outcome: event.target.value } : current)}
                                  >
                                    <option value="">Sin definir</option>
                                    {outcomeValues.map((value) => (
                                      <option key={value} value={value}>{getOutcomeLabel(def, value)}</option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}
                            </div>

                            <div className={styles.liveComposerActions}>
                              <button className={styles.btnGhost} type="button" onClick={() => setCustomComposer(null)}>
                                Cerrar
                              </button>
                              <button className={styles.btnPrimary} type="button" onClick={saveCustomComposer}>
                                {customComposer.mode === 'edit' ? 'Actualizar evento' : 'Guardar evento'}
                              </button>
                            </div>
                          </div>
                        );
                      })() : null}

                      <div className={styles.liveTimelineCard}>
                        <div className={styles.liveTimelineHeader}>
                          <div>
                            <h3>Timeline del partido</h3>
                            <p>Lo más reciente primero, editable y listo para corregir en cancha.</p>
                          </div>
                          {lastRemovedEvent ? (
                            <button className={styles.miniBtn} type="button" onClick={restoreLastRemovedEvent}>
                              <Undo2 size={14} /> Deshacer último
                            </button>
                          ) : null}
                        </div>

                        {timelineEventsRecentFirst.length === 0 ? <div className={styles.emptyState}>Todavía no hay eventos cargados en el partido.</div> : null}

                        <div className={styles.timelineList}>
                          {timelineEventsRecentFirst.map((event) => {
                            const chronologicalIndex = timelineEventIndexById.get(event.id) ?? -1;
                            const detailLine = chronologicalIndex >= 0
                              ? formatMatchTimelineEventDescription(event, timelineEventsChronological, chronologicalIndex, 'Sin detalle adicional')
                              : [event.playerName, event.detail].filter((value) => String(value || '').trim()).join(' · ') || 'Sin detalle adicional';

                            return (
                            <div key={event.id} className={`${styles.timelineRow}${event.parentEventId ? ' ' + styles.timelineRowChild : ''}`}>
                              <button
                                type="button"
                                className={styles.timelineMinute}
                                onClick={() => {
                                  setTimerRunning(false);
                                  setLineupsState((current) => ({
                                    ...current,
                                    liveControl: {
                                      ...current.liveControl,
                                      phase: normalizeMatchPeriod(event.period, current.liveControl.phase) as LivePhase,
                                      minute: event.minute || current.liveControl.minute,
                                    },
                                  }));
                                }}
                                title="Ajustar timer a este minuto"
                                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit' }}
                              >
                                <span>{event.minute || '--'}&apos;</span>
                                <small className={styles.timelinePeriod}>{getMatchPeriodLabel(event.period)}</small>
                              </button>
                              {event.videoTime ? (
                                <button
                                  type="button"
                                  onClick={() => seekVideoTo(event.videoTime || '')}
                                  title={`Saltar al ${event.videoTime} del video`}
                                  style={{ cursor: 'pointer', background: 'color-mix(in srgb, var(--club-accent) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--club-accent) 30%, transparent)', borderRadius: 4, padding: '2px 6px', fontSize: '0.7rem', color: 'var(--club-accent)', marginLeft: 6, whiteSpace: 'nowrap' }}
                                >
                                  <Play size={12} /> {event.videoTime}
                                </button>
                              ) : null}
                              <div className={`${styles.timelineGlyph} ${resolveEventToneClass(event.type)}`}>{resolveEventGlyph(event.type)}</div>
                              <div className={styles.timelineBody}>
                                <div className={styles.timelineTitleRow}>
                                  <strong>{resolveEventSummary(event)}</strong>
                                  <span>{event.team === 'home' ? (homeClub?.short_name || 'Local') : event.team === 'away' ? (awayClub?.short_name || 'Visitante') : 'Neutral'}</span>
                                </div>
                                <p>{detailLine}</p>
                                {(() => {
                                  const eventScore = timelineScoreById.get(event.id);
                                  return eventScore && eventScore.points > 0 ? (
                                    <p style={{ color: 'var(--success)', fontWeight: 800 }}>
                                      Marcador {eventScore.home} - {eventScore.away}
                                    </p>
                                  ) : null;
                                })()}
                              </div>
                              <div className={styles.timelineActions}>
                                <button className={styles.miniBtn} type="button" onClick={() => {
                                  const customDef = customEventDefMap.get(event.type);
                                  if (customDef) openCustomComposer(customDef, event);
                                  else openLiveComposer(getLiveActionFromEventType(event.type), event);
                                }}>
                                  Editar
                                </button>
                                <button className={styles.miniBtn} type="button" onClick={() => removeLiveEvent(event.id)}>
                                  Eliminar
                                </button>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      </div>

                      {eventPanelConfigOpen ? (
                        <div
                          className={styles.eventPanelConfigBackdrop}
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby="event-panel-config-title"
                          onClick={(event) => {
                            if (event.target === event.currentTarget) setEventPanelConfigOpen(false);
                          }}
                        >
                          <div className={styles.eventPanelConfigCard}>
                            <div className={styles.eventPanelConfigHeader}>
                              <div>
                                <h3 id="event-panel-config-title">Personalizar botonera</h3>
                                <p>Mostrá solo las acciones que tu equipo carga durante el partido. La configuración se guarda en este dispositivo.</p>
                              </div>
                              <button className={styles.miniBtn} type="button" onClick={() => setEventPanelConfigOpen(false)} aria-label="Cerrar">
                                <X size={14} />
                              </button>
                            </div>

                            <div className={styles.eventPanelConfigBody}>
                              <section className={styles.eventPanelConfigSection}>
                                <div className={styles.eventPanelConfigSectionHeader}>
                                  <span>Layout</span>
                                </div>
                                <div className={styles.eventPanelConfigOptions}>
                                  <label className={styles.field}>
                                    <span>Columnas en mobile</span>
                                    <select
                                      className={styles.select}
                                      value={eventPanelConfig.mobileColumns}
                                      onChange={(event) => setEventPanelConfig((current) => ({ ...current, mobileColumns: Number(event.target.value) }))}
                                    >
                                      <option value={2}>2 columnas</option>
                                      <option value={3}>3 columnas</option>
                                    </select>
                                  </label>
                                  <label className={styles.field}>
                                    <span>Columnas en desktop</span>
                                    <select
                                      className={styles.select}
                                      value={eventPanelConfig.desktopColumns}
                                      onChange={(event) => setEventPanelConfig((current) => ({ ...current, desktopColumns: Number(event.target.value) }))}
                                    >
                                      <option value={3}>3 columnas</option>
                                      <option value={4}>4 columnas</option>
                                      <option value={5}>5 columnas</option>
                                    </select>
                                  </label>
                                  <label className={styles.field}>
                                    <span>Tamaño</span>
                                    <select
                                      className={styles.select}
                                      value={eventPanelConfig.density}
                                      onChange={(event) => setEventPanelConfig((current) => ({ ...current, density: event.target.value as EventPanelDensity }))}
                                    >
                                      <option value="comfortable">Cómodo</option>
                                      <option value="compact">Compacto</option>
                                    </select>
                                  </label>
                                </div>
                              </section>

                              <section className={styles.eventPanelConfigSection}>
                                <div className={styles.eventPanelConfigSectionHeader}>
                                  <span>Acciones visibles</span>
                                  <small>{CLUB_EVENT_PANEL_ACTIONS.length - hiddenEventActions.size} de {CLUB_EVENT_PANEL_ACTIONS.length}</small>
                                </div>
                                {CLUB_EVENT_PANEL_GROUPS.map((group) => (
                                  <div key={`config-${group.group}`} className={styles.eventPanelConfigGroup}>
                                    <div className={styles.eventPanelConfigGroupHeader}>
                                      <span>{group.group}</span>
                                      <div className={styles.eventPanelConfigGroupActions}>
                                        <button
                                          type="button"
                                          className={styles.miniBtn}
                                          onClick={() => setEventPanelConfig((current) => ({
                                            ...current,
                                            hidden: current.hidden.filter((id) => !group.actions.some((action) => action.id === id)),
                                          }))}
                                        >
                                          Mostrar todo
                                        </button>
                                        <button
                                          type="button"
                                          className={styles.miniBtn}
                                          onClick={() => setEventPanelConfig((current) => {
                                            const groupIds = group.actions.map((action) => action.id);
                                            const next = new Set([...current.hidden, ...groupIds]);
                                            return { ...current, hidden: Array.from(next) };
                                          })}
                                        >
                                          Ocultar todo
                                        </button>
                                      </div>
                                    </div>
                                    <div className={styles.eventPanelConfigList}>
                                      {group.actions.map((action) => {
                                        const isHidden = hiddenEventActions.has(action.id);
                                        return (
                                          <label key={action.id} className={`${styles.eventPanelConfigItem} ${isHidden ? styles.eventPanelConfigItemHidden : ''}`}>
                                            <input
                                              type="checkbox"
                                              checked={!isHidden}
                                              onChange={() => toggleEventActionVisibility(action.id)}
                                            />
                                            <span className={styles.eventPanelConfigItemGlyph}>{action.glyph}</span>
                                            <span className={styles.eventPanelConfigItemLabel}>{action.label}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </section>

                              <section className={styles.eventPanelConfigSection}>
                                <div className={styles.eventPanelConfigSectionHeader}>
                                  <span>Eventos personalizados</span>
                                  <button
                                    type="button"
                                    className={styles.miniPrimary}
                                    onClick={() => setCustomEventDraft(createEmptyCustomEventDef())}
                                  >
                                    + Nuevo evento
                                  </button>
                                </div>

                                {eventPanelConfig.customEvents.length === 0 && !customEventDraft ? (
                                  <div className={styles.emptyState} style={{ padding: 14, fontSize: 12 }}>
                                    Creá tus propios eventos para registrar acciones específicas (causa, jugador, outcome y puntos a tu medida).
                                  </div>
                                ) : null}

                                {!customEventDraft && eventPanelConfig.customEvents.length > 0 ? (
                                  <div className={styles.customEventList}>
                                    {eventPanelConfig.customEvents.map((def) => (
                                      <div key={def.id} className={styles.customEventListItem}>
                                        <div className={`${styles.liveActionGlyph} ${styles[CUSTOM_EVENT_TONE_TO_TIMELINE[def.tone]]}`}>{def.glyph}</div>
                                        <div className={styles.customEventListInfo}>
                                          <strong>{def.label}</strong>
                                          <small>
                                            {def.group}
                                            {def.hasPlayer ? ' · jugador' : ''}
                                            {def.causeMode !== 'none' ? ' · causa' : ''}
                                            {def.outcomeMode !== 'none' ? ' · outcome' : ''}
                                            {def.pointsMode === 'fixed' ? ` · +${def.pointsFixed} pts` : ''}
                                            {def.pointsMode === 'by_outcome' ? ' · pts por outcome' : ''}
                                          </small>
                                        </div>
                                        <div className={styles.customEventListActions}>
                                          <button type="button" className={styles.miniBtn} onClick={() => setCustomEventDraft({ ...def })}>
                                            Editar
                                          </button>
                                          <button type="button" className={styles.miniBtn} onClick={() => deleteCustomEventDef(def.id)}>
                                            <X size={14} />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}

                                {customEventDraft ? (
                                  <div className={styles.customEventEditor}>
                                    <div className={styles.eventPanelConfigOptions}>
                                      <label className={styles.field}>
                                        <span>Nombre</span>
                                        <input
                                          className={styles.input}
                                          value={customEventDraft.label}
                                          onChange={(event) => setCustomEventDraft((current) => current ? { ...current, label: event.target.value } : current)}
                                          placeholder="Tackle dominante"
                                        />
                                      </label>
                                      <label className={styles.field}>
                                        <span>Glyph (2-3 letras)</span>
                                        <input
                                          className={styles.input}
                                          value={customEventDraft.glyph}
                                          onChange={(event) => setCustomEventDraft((current) => current ? { ...current, glyph: event.target.value.toUpperCase().slice(0, 3) } : current)}
                                          placeholder="TD"
                                          maxLength={3}
                                        />
                                      </label>
                                      <label className={styles.field}>
                                        <span>Grupo</span>
                                        <select
                                          className={styles.select}
                                          value={customEventDraft.group}
                                          onChange={(event) => setCustomEventDraft((current) => current ? { ...current, group: event.target.value } : current)}
                                        >
                                          {CUSTOM_EVENT_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
                                        </select>
                                      </label>
                                      <label className={styles.field}>
                                        <span>Color</span>
                                        <select
                                          className={styles.select}
                                          value={customEventDraft.tone}
                                          onChange={(event) => setCustomEventDraft((current) => current ? { ...current, tone: event.target.value as CustomEventTone } : current)}
                                        >
                                          {CUSTOM_EVENT_TONES.map((tone) => <option key={tone} value={tone}>{CUSTOM_EVENT_TONE_LABELS[tone]}</option>)}
                                        </select>
                                      </label>
                                    </div>

                                    <div className={styles.customEventEditorRow}>
                                      <label className={styles.liveCheckbox}>
                                        <input
                                          type="checkbox"
                                          checked={customEventDraft.hasPlayer}
                                          onChange={(event) => setCustomEventDraft((current) => current ? { ...current, hasPlayer: event.target.checked } : current)}
                                        />
                                        Tiene jugador asociado
                                      </label>
                                    </div>

                                    <div className={styles.eventPanelConfigOptions}>
                                      <label className={styles.field}>
                                        <span>Causa</span>
                                        <select
                                          className={styles.select}
                                          value={customEventDraft.causeMode}
                                          onChange={(event) => setCustomEventDraft((current) => current ? { ...current, causeMode: event.target.value as CustomEventCauseMode } : current)}
                                        >
                                          <option value="none">Sin causa</option>
                                          <option value="text">Texto libre</option>
                                          <option value="options">Lista de opciones</option>
                                        </select>
                                      </label>
                                      {customEventDraft.causeMode === 'options' ? (
                                        <label className={styles.field} style={{ gridColumn: 'span 2' }}>
                                          <span>Opciones de causa (separadas por coma)</span>
                                          <input
                                            className={styles.input}
                                            value={customEventDraft.causeOptions.join(', ')}
                                            onChange={(event) => setCustomEventDraft((current) => current ? {
                                              ...current,
                                              causeOptions: event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean),
                                            } : current)}
                                            placeholder="Offside, Maul tirado, Mano en ruck"
                                          />
                                        </label>
                                      ) : null}
                                    </div>

                                    <div className={styles.eventPanelConfigOptions}>
                                      <label className={styles.field}>
                                        <span>Outcome</span>
                                        <select
                                          className={styles.select}
                                          value={customEventDraft.outcomeMode}
                                          onChange={(event) => {
                                            const mode = event.target.value as CustomEventOutcomeMode;
                                            setCustomEventDraft((current) => current ? {
                                              ...current,
                                              outcomeMode: mode,
                                              pointsByOutcome: {},
                                            } : current);
                                          }}
                                        >
                                          <option value="none">Sin outcome</option>
                                          <option value="made_missed">Convertida / Fallada</option>
                                          <option value="won_lost">Ganado / Perdido</option>
                                          <option value="custom">Personalizado</option>
                                        </select>
                                      </label>
                                      {customEventDraft.outcomeMode === 'custom' ? (
                                        <label className={styles.field} style={{ gridColumn: 'span 2' }}>
                                          <span>Opciones outcome (separadas por coma)</span>
                                          <input
                                            className={styles.input}
                                            value={customEventDraft.outcomeOptions.join(', ')}
                                            onChange={(event) => setCustomEventDraft((current) => current ? {
                                              ...current,
                                              outcomeOptions: event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean),
                                            } : current)}
                                            placeholder="Limpio, Sucio, Robado"
                                          />
                                        </label>
                                      ) : null}
                                    </div>

                                    <div className={styles.eventPanelConfigOptions}>
                                      <label className={styles.field}>
                                        <span>Cálculo de puntos</span>
                                        <select
                                          className={styles.select}
                                          value={customEventDraft.pointsMode}
                                          onChange={(event) => setCustomEventDraft((current) => current ? { ...current, pointsMode: event.target.value as CustomEventPointsMode } : current)}
                                        >
                                          <option value="none">No suma puntos</option>
                                          <option value="fixed">Puntos fijos</option>
                                          <option value="by_outcome" disabled={customEventDraft.outcomeMode === 'none'}>Según outcome</option>
                                        </select>
                                      </label>
                                      {customEventDraft.pointsMode === 'fixed' ? (
                                        <label className={styles.field}>
                                          <span>Puntos</span>
                                          <input
                                            className={styles.input}
                                            type="number"
                                            value={customEventDraft.pointsFixed}
                                            onChange={(event) => setCustomEventDraft((current) => current ? { ...current, pointsFixed: Number(event.target.value) || 0 } : current)}
                                          />
                                        </label>
                                      ) : null}
                                    </div>

                                    {customEventDraft.pointsMode === 'by_outcome' && customEventDraft.outcomeMode !== 'none' ? (
                                      <div className={styles.eventPanelConfigOptions}>
                                        {(customEventDraft.outcomeMode === 'custom'
                                          ? customEventDraft.outcomeOptions
                                          : OUTCOME_PRESETS[customEventDraft.outcomeMode]
                                        ).map((outcomeValue) => (
                                          <label key={outcomeValue} className={styles.field}>
                                            <span>Puntos · {customEventDraft.outcomeMode === 'custom' ? outcomeValue : OUTCOME_PRESET_LABELS[outcomeValue] || outcomeValue}</span>
                                            <input
                                              className={styles.input}
                                              type="number"
                                              value={customEventDraft.pointsByOutcome[outcomeValue] ?? 0}
                                              onChange={(event) => setCustomEventDraft((current) => current ? {
                                                ...current,
                                                pointsByOutcome: { ...current.pointsByOutcome, [outcomeValue]: Number(event.target.value) || 0 },
                                              } : current)}
                                            />
                                          </label>
                                        ))}
                                      </div>
                                    ) : null}

                                    <div className={styles.customEventEditorActions}>
                                      <button type="button" className={styles.miniBtn} onClick={() => setCustomEventDraft(null)}>
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.miniPrimary}
                                        disabled={!customEventDraft.label.trim() || !customEventDraft.glyph.trim()}
                                        onClick={() => {
                                          if (!customEventDraft.label.trim() || !customEventDraft.glyph.trim()) return;
                                          const sanitized = sanitizeCustomEventDef(customEventDraft);
                                          if (!sanitized) return;
                                          upsertCustomEventDef(sanitized);
                                          setCustomEventDraft(null);
                                        }}
                                      >
                                        Guardar evento
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </section>
                            </div>

                            <div className={styles.eventPanelConfigFooter}>
                              <button type="button" className={styles.miniBtn} onClick={resetEventPanelConfig}>
                                <RotateCw size={14} /> Restablecer
                              </button>
                              <button type="button" className={styles.miniPrimary} onClick={() => setEventPanelConfigOpen(false)}>
                                Listo
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className={styles.liveDataGrid}>
                      <div className={styles.liveDataCard}>
                        <div className={styles.liveDataScoreboard}>
                          <div className={styles.liveDataTeam}>
                            <span>{homeClub?.short_name || homeClub?.name || 'Local'}</span>
                          </div>
                          <div className={styles.liveDataScore}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                              <input
                                className={styles.input}
                                value={matchDraft.score.home}
                                onChange={(event) => setMatchDraft((current) => ({ ...current, score: { ...current.score, home: event.target.value } }))}
                                placeholder="0"
                                style={{ width: 60, textAlign: 'center', fontSize: '2rem', fontWeight: 800, padding: '4px 8px' }}
                              />
                              <strong style={{ fontSize: '1.5rem', opacity: 0.5 }}>-</strong>
                              <input
                                className={styles.input}
                                value={matchDraft.score.away}
                                onChange={(event) => setMatchDraft((current) => ({ ...current, score: { ...current.score, away: event.target.value } }))}
                                placeholder="0"
                                style={{ width: 60, textAlign: 'center', fontSize: '2rem', fontWeight: 800, padding: '4px 8px' }}
                              />
                            </div>
                            <span>{getStatusLabel(matchDraft.status)} · {lineupsState.liveControl.phase}</span>
                          </div>
                          <div className={styles.liveDataTeam}>
                            <span>{awayClub?.short_name || awayClub?.name || 'Visitante'}</span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.liveDataGridInner}>
                        <div className={styles.card}>
                          <div className={styles.fieldGrid}>
                            <Field label="Cancha" value={matchDraft.venue} onChange={(value) => setMatchDraft((current) => ({ ...current, venue: value }))} />
                            <Field label="Fecha y hora" value={matchDraft.dateTime} onChange={(value) => setMatchDraft((current) => ({ ...current, dateTime: value }))} type="datetime-local" />
                            <Field label="Arbitro" value={matchDraft.referee} onChange={(value) => setMatchDraft((current) => ({ ...current, referee: value }))} />
                            <Field label="Torneo" value={matchState.tournament?.name || 'Sin torneo'} onChange={() => undefined} />
                            <Field label="Fase / Jornada" value={matchState.roundLabel || 'Sin jornada'} onChange={() => undefined} />
                          </div>
                        </div>

                        <div className={styles.card}>
                          <div className={styles.liveResultGrid}>
                            <SelectField
                              label="Condición del partido"
                              value={matchDraft.status}
                              onChange={(value) => setMatchDraft((current) => ({ ...current, status: value as MatchStatus }))}
                              options={MATCH_STATUS_OPTIONS}
                            />
                            <SelectField
                              label={`${homeClub?.short_name || homeClub?.name || 'Local'} resultado`}
                              value={liveControlPreview.homeResult}
                              onChange={() => undefined}
                              options={RESULT_OPTIONS}
                              disabled
                            />
                            <Field
                              label="Puntos base local"
                              value={liveControlPreview.homeTablePoints}
                              onChange={() => undefined}
                              readOnly
                            />
                            <SelectField
                              label={`${awayClub?.short_name || awayClub?.name || 'Visitante'} resultado`}
                              value={liveControlPreview.awayResult}
                              onChange={() => undefined}
                              options={RESULT_OPTIONS}
                              disabled
                            />
                            <Field
                              label="Puntos base visitante"
                              value={liveControlPreview.awayTablePoints}
                              onChange={() => undefined}
                              readOnly
                            />
                          </div>
                          <div className={styles.liveCheckboxGrid}>
                            <label className={styles.liveCheckbox}><input type="checkbox" checked={liveControlPreview.homeBonusOffensive} readOnly disabled /> Bonus ofensivo local</label>
                            <label className={styles.liveCheckbox}><input type="checkbox" checked={liveControlPreview.homeBonusDefensive} readOnly disabled /> Bonus defensivo local</label>
                            <label className={styles.liveCheckbox}><input type="checkbox" checked={liveControlPreview.awayBonusOffensive} readOnly disabled /> Bonus ofensivo visitante</label>
                            <label className={styles.liveCheckbox}><input type="checkbox" checked={liveControlPreview.awayBonusDefensive} readOnly disabled /> Bonus defensivo visitante</label>
                          </div>
                          <div className={styles.livePointsTotals}>
                            <div className={styles.livePointTotalCard}>
                              <span>Total local</span>
                              <strong>{formatPointValue(totalHomeTablePoints)}</strong>
                            </div>
                            <div className={styles.livePointTotalCard}>
                              <span>Total visitante</span>
                              <strong>{formatPointValue(totalAwayTablePoints)}</strong>
                            </div>
                            <span className={styles.liveAutoBadge}>
                              Reglas de tabla {matchDraft.status === 'final' ? 'aplicadas' : 'listas al finalizar'}
                              {pointsPreview.resolvedByShootout ? ' · definido por penales' : ''}
                            </span>
                          </div>
                        </div>

                        <div className={styles.card}>
                          <div className={styles.liveQuickActions}>
                            <button className={styles.btnPrimary} type="button" onClick={() => {
                              setMatchDraft((current) => ({ ...current, status: 'live' }));
                              setLineupsState((current) => ({ ...current, liveControl: { ...current.liveControl, phase: '1T', minute: current.liveControl.minute || '00' } }));
                            }}>
                              Iniciar partido
                            </button>
                            <button className={styles.btn} type="button" onClick={() => {
                              setMatchDraft((current) => ({ ...current, status: 'live' }));
                              setLineupsState((current) => ({ ...current, liveControl: { ...current.liveControl, phase: '2T' } }));
                            }}>
                              Marcar entretiempo
                            </button>
                            <button className={styles.btn} type="button" onClick={() => {
                              setMatchDraft((current) => ({ ...current, status: 'final' }));
                              setLineupsState((current) => ({ ...current, liveControl: { ...current.liveControl, phase: 'FT' } }));
                            }}>
                              Finalizar partido
                            </button>
                            <button className={styles.btnGhost} type="button" onClick={() => setMatchDraft((current) => ({ ...current, score: { home: '0', away: '0' } }))}>
                              Resetear marcador
                            </button>
                          </div>
                        </div>

                        <div className={styles.card}>
                          <div className={styles.liveMiniStats}>
                            <div className={styles.liveMiniStat}><span>Tries</span><strong>{liveStats.tries}</strong></div>
                            <div className={styles.liveMiniStat}><span>Penales</span><strong>{liveStats.penalties}</strong></div>
                            <div className={styles.liveMiniStat}><span>Tarjetas</span><strong>{liveStats.cards}</strong></div>
                            <div className={styles.liveMiniStat}><span>Cambios</span><strong>{liveStats.substitutions}</strong></div>
                          </div>
                        </div>

                        <div className={styles.card}>
                          <h4 style={{ marginBottom: 10, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.65 }}>Juego</h4>
                          <div className={styles.liveMiniStats}>
                            <div className={styles.liveMiniStat}><span>Entradas en 22</span><strong>{livePanelGameStats.entradas22.home} / {livePanelGameStats.entradas22.away}</strong></div>
                            <div className={styles.liveMiniStat}><span>Tasa de conversión 22</span><strong>{formatTasa22FromStats(livePanelGameStats, 'home')} · {formatTasa22FromStats(livePanelGameStats, 'away')}</strong></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {false && (
                <>
                  <HeaderBlock title="Operación en vivo" subtitle="Marcador, estado del partido e incidencias." action={
                    <button className={styles.miniPrimary} type="button" onClick={() => setEvents((current) => [...current, createEmptyEvent()])}>
                      + Evento
                    </button>
                  } />
                  <div className={styles.wideGrid}>
                    <div className={styles.card}>
                      <div className={styles.fieldGrid}>
                        <SelectField label="Estado" value={matchDraft.status} onChange={(value) => setMatchDraft((current) => ({ ...current, status: value as MatchStatus }))} options={MATCH_STATUS_OPTIONS} />
                        <Field label={homeClub?.short_name || homeClub?.name || 'Local'} value={matchDraft.score.home} onChange={(value) => setMatchDraft((current) => ({ ...current, score: { ...current.score, home: value } }))} />
                        <Field label={awayClub?.short_name || awayClub?.name || 'Visitante'} value={matchDraft.score.away} onChange={(value) => setMatchDraft((current) => ({ ...current, score: { ...current.score, away: value } }))} />
                        <Field label="Cancha" value={matchDraft.venue} onChange={(value) => setMatchDraft((current) => ({ ...current, venue: value }))} />
                      </div>
                    </div>
                    <div className={styles.card}>
                      <div className={styles.playerList}>
                        {events.length === 0 ? <div className={styles.emptyState}>Aún no hay incidencias deportivas cargadas.</div> : null}
                        {events.map((event, index) => (
                          <div key={event.id} className={styles.eventFormRow}>
                            <input className={styles.input} value={event.minute} onChange={(e) => updateEvent(setEvents, index, { minute: e.target.value })} placeholder="54" />
                            <select className={styles.select} value={event.type} onChange={(e) => updateEvent(setEvents, index, { type: e.target.value })}>
                              {EVENT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                            <select className={styles.select} value={event.team || 'neutral'} onChange={(e) => updateEvent(setEvents, index, { team: e.target.value === 'neutral' ? null : e.target.value as MatchEventTeam })}>
                              <option value="home">{homeClub?.short_name || homeClub?.name || 'Local'}</option>
                              <option value="away">{awayClub?.short_name || awayClub?.name || 'Visitante'}</option>
                              <option value="neutral">Neutral</option>
                            </select>
                            <input className={styles.input} value={event.playerName} onChange={(e) => updateEvent(setEvents, index, { playerName: e.target.value })} placeholder="Jugador / detalle corto" />
                            <button className={styles.rowMenu} type="button" aria-label="Eliminar evento" onClick={() => setEvents((current) => current.filter((_, currentIndex) => currentIndex !== index))}><X size={14} /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'estadisticas' && (() => {
                const playerStats = buildPlayerStats(timelineEventsChronological);
                const sortOptions =
                  playerStatsTab === 'ataque'
                    ? [
                        { id: 'category_total', label: 'Total ataque' },
                        { id: 'points', label: 'Puntos' },
                        { id: 'tries', label: 'Try' },
                        { id: 'penaltyTries', label: 'Try penal' },
                        { id: 'convertedPenalties', label: 'Penal convertido' },
                        { id: 'conversions', label: 'Conversión' },
                        { id: 'scrumsFor', label: 'Scrum propio' },
                        { id: 'linesFor', label: 'Line propia' },
                        { id: 'kicks', label: 'Kicks' },
                        { id: 'kickMeters', label: 'Metros kick' },
                        { id: 'passes', label: 'Pases' },
                        { id: 'attackPenalties', label: 'Penales en ataque' },
                        { id: 'forwardPasses', label: 'Pase forward' },
                        { id: 'knockOns', label: 'Knock on' },
                        { id: 'rucksFor', label: 'Ruck propio' },
                      ]
                    : [
                        { id: 'category_total', label: 'Total defensa' },
                        { id: 'defensePenalties', label: 'Penales en defensa' },
                        { id: 'scrumsAgainst', label: 'Scrum en contra' },
                        { id: 'rucksAgainst', label: 'Ruck en contra' },
                        { id: 'tackles', label: 'Tackles' },
                        { id: 'linesAgainst', label: 'Line en contra' },
                      ];
                const effectiveSortMetric = sortOptions.some((option) => option.id === playerStatsSortMetric)
                  ? playerStatsSortMetric
                  : 'category_total';
                const getSortValue = (player: PlayerEventStats) => {
                  switch (effectiveSortMetric) {
                    case 'category_total':
                      return playerStatsTab === 'ataque' ? getPlayerAttackTotal(player) : getPlayerDefenseTotal(player);
                    case 'points':
                      return player.points;
                    case 'tries':
                      return player.tries;
                    case 'penaltyTries':
                      return player.penaltyTries;
                    case 'convertedPenalties':
                      return player.convertedPenalties;
                    case 'conversions':
                      return player.conversions;
                    case 'scrumsFor':
                      return player.scrumsFor;
                    case 'linesFor':
                      return player.linesFor;
                    case 'kicks':
                      return player.kicks;
                    case 'kickMeters':
                      return player.kickMeters;
                    case 'passes':
                      return player.passes;
                    case 'attackPenalties':
                      return player.attackPenalties;
                    case 'forwardPasses':
                      return player.forwardPasses;
                    case 'knockOns':
                      return player.knockOns;
                    case 'rucksFor':
                      return player.rucksFor;
                    case 'defensePenalties':
                      return player.defensePenalties;
                    case 'scrumsAgainst':
                      return player.scrumsAgainst;
                    case 'rucksAgainst':
                      return player.rucksAgainst;
                    case 'tackles':
                      return player.tackles;
                    case 'linesAgainst':
                      return player.linesAgainst;
                    default:
                      return 0;
                  }
                };
                const filteredPlayerStats = [...playerStats]
                  .filter((player) => playerStatsTeamFilter === 'all' || player.team === playerStatsTeamFilter)
                  .sort((a, b) => {
                    const aValue = getSortValue(a);
                    const bValue = getSortValue(b);
                    if (aValue === bValue) {
                      return a.name.localeCompare(b.name, 'es');
                    }
                    return playerStatsSortDirection === 'desc' ? bValue - aValue : aValue - bValue;
                  });
                const handlePlayerStatsSort = (metric: typeof playerStatsSortMetric) => {
                  if (effectiveSortMetric === metric) {
                    setPlayerStatsSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'));
                    return;
                  }
                  setPlayerStatsSortMetric(metric);
                  setPlayerStatsSortDirection('desc');
                };
                const sortableHeaderButtonStyle: React.CSSProperties = {
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  width: '100%',
                  border: 0,
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                  font: 'inherit',
                  textTransform: 'inherit',
                  letterSpacing: 'inherit',
                };
                const renderSortableHeader = (
                  label: string,
                  metric: typeof playerStatsSortMetric,
                  tone?: string
                ) => (
                  <th
                    style={{
                      textAlign: 'center',
                      padding: '10px 8px',
                      color: effectiveSortMetric === metric ? tone || 'var(--text-main)' : 'var(--text-dim)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      fontSize: '0.7rem',
                      letterSpacing: '0.06em',
                    }}
                  >
                    <button type="button" style={sortableHeaderButtonStyle} onClick={() => handlePlayerStatsSort(metric)}>
                      <span>{label}</span>
                      {effectiveSortMetric === metric ? (
                        <span style={{ fontSize: '0.72rem', color: tone || 'var(--text-main)' }}>
                          {playerStatsSortDirection === 'desc' ? 'v' : '^'}
                        </span>
                      ) : null}
                    </button>
                  </th>
                );
                return (
                  <>
                    <HeaderBlock title="Estadísticas de jugadores" subtitle="Estadísticas individuales por jugador basadas en los eventos del partido." />
                    <div className={styles.postGrid}>
                      <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
                        <div className={styles.postTabs} style={{ marginBottom: 16 }}>
                          {[
                            { id: 'ataque', label: 'Ataque' },
                            { id: 'defensa', label: 'Defensa' },
                          ].map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              className={`${styles.postTab}${playerStatsTab === tab.id ? ' ' + styles.postTabActive : ''}`}
                              onClick={() => setPlayerStatsTab(tab.id as 'ataque' | 'defensa')}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                          <label style={{ display: 'grid', gap: 6, minWidth: 180, color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Equipo
                            <select
                              value={playerStatsTeamFilter}
                              onChange={(event) => setPlayerStatsTeamFilter(event.target.value as 'all' | 'home' | 'away')}
                              style={{
                                borderRadius: 10,
                                border: '1px solid var(--border)',
                                background: 'var(--surface-strong)',
                                color: 'var(--text)',
                                padding: '10px 12px',
                                fontSize: '0.9rem',
                              }}
                            >
                              <option value="all">Ambos clubes</option>
                              <option value="home">{homeClub?.short_name || 'Local'}</option>
                              <option value="away">{awayClub?.short_name || 'Visitante'}</option>
                            </select>
                          </label>
                          <label style={{ display: 'grid', gap: 6, minWidth: 180, color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Orden
                            <select
                              value={playerStatsSortDirection}
                              onChange={(event) => setPlayerStatsSortDirection(event.target.value as 'desc' | 'asc')}
                              style={{
                                borderRadius: 10,
                                border: '1px solid var(--border)',
                                background: 'var(--surface-strong)',
                                color: 'var(--text)',
                                padding: '10px 12px',
                                fontSize: '0.9rem',
                              }}
                            >
                              <option value="desc">Mayor a menor</option>
                              <option value="asc">Menor a mayor</option>
                            </select>
                          </label>
                        </div>
                        {playerStats.length === 0 ? (
                          <div className={styles.emptyState}>Aún no hay eventos cargados para mostrar estadísticas de jugadores.</div>
                        ) : filteredPlayerStats.length === 0 ? (
                          <div className={styles.emptyState}>No hay jugadores para el filtro seleccionado en esta categoría.</div>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                  <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.06em' }}>Jugador</th>
                                  <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.06em' }}>Equipo</th>
                                  {playerStatsTab === 'ataque' ? (
                                    <>
                                      {renderSortableHeader('Pts', 'points')}
                                      {renderSortableHeader('Try', 'tries')}
                                      {renderSortableHeader('Try Penal', 'penaltyTries')}
                                      {renderSortableHeader('Pen Conv', 'convertedPenalties')}
                                      {renderSortableHeader('Conv', 'conversions')}
                                      {renderSortableHeader('Scrum propio', 'scrumsFor')}
                                      {renderSortableHeader('Line propia', 'linesFor')}
                                      {renderSortableHeader('Kick', 'kicks')}
                                      {renderSortableHeader('M Kick', 'kickMeters')}
                                      {renderSortableHeader('Pase', 'passes')}
                                      {renderSortableHeader('Pen Ataque', 'attackPenalties')}
                                      {renderSortableHeader('Pase Fwd', 'forwardPasses')}
                                      {renderSortableHeader('Knock On', 'knockOns')}
                                      {renderSortableHeader('Ruck propio', 'rucksFor')}
                                      {renderSortableHeader('Atq Tot', 'category_total', 'var(--club-accent)')}
                                    </>
                                  ) : (
                                    <>
                                      {renderSortableHeader('Pen Defensa', 'defensePenalties')}
                                      {renderSortableHeader('Scrum contra', 'scrumsAgainst')}
                                      {renderSortableHeader('Ruck contra', 'rucksAgainst')}
                                      {renderSortableHeader('Tackle', 'tackles')}
                                      {renderSortableHeader('Line en contra', 'linesAgainst')}
                                      {renderSortableHeader('Def Tot', 'category_total', 'var(--danger)')}
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {filteredPlayerStats.map((player, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{player.name}</td>
                                    <td style={{ padding: '10px 8px', color: 'var(--text-dim)' }}>{player.team === 'home' ? (homeClub?.short_name || 'Local') : player.team === 'away' ? (awayClub?.short_name || 'Visitante') : '-'}</td>
                                    {playerStatsTab === 'ataque' ? (
                                      <>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontFamily: 'monospace' }}>{player.points || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.tries || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.penaltyTries || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.convertedPenalties || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.conversions || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.scrumsFor || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.linesFor || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.kicks || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.kickMeters ? `${player.kickMeters}m` : '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.passes || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.attackPenalties || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.forwardPasses || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.knockOns || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.rucksFor || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontFamily: 'monospace', color: 'var(--club-accent)' }}>{getPlayerAttackTotal(player) || '-'}</td>
                                      </>
                                    ) : (
                                      <>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.defensePenalties || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.scrumsAgainst || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.rucksAgainst || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.tackles || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{player.linesAgainst || '-'}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontFamily: 'monospace', color: 'var(--danger)' }}>{getPlayerDefenseTotal(player) || '-'}</td>
                                      </>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}

              {activeTab === 'postpartido' && (() => {
                const stats = buildMatchStats(events);
                const statGroups = buildPostMatchStatGroups(stats);
                const insights = generateInsights(stats, matchDraft.score);
                const allStatSections = [
                  { title: 'Puntos y definición', data: statGroups.scoring },
                  { title: 'Juego (22m)', data: statGroups.juego },
                  { title: 'Continuidad y uso', data: statGroups.continuity },
                  { title: 'Juego fijo', data: statGroups.setPiece },
                  { title: 'Disciplina y defensa', data: statGroups.discipline },
                ];
                const attackSections = [
                  { title: 'Finalización', data: statGroups.scoring },
                  { title: 'Continuidad ofensiva', data: statGroups.continuity },
                ];
                const defenseSections = [
                  { title: 'Defensa y disciplina', data: statGroups.discipline },
                  { title: 'Juego fijo defensivo', data: [
                    { label: 'Scrums perdidos', home: stats.scrums.home.lost, away: stats.scrums.away.lost },
                    { label: 'Lines perdidos', home: stats.lines.home.lost, away: stats.lines.away.lost },
                    { label: 'Penales concedidos', home: stats.penalties.away, away: stats.penalties.home },
                  ] },
                ];
                const comparisonMetrics = [
                  ...statGroups.scoring,
                  ...statGroups.continuity,
                  ...statGroups.setPiece,
                  ...statGroups.discipline,
                ].filter((metric) => !['Tries', 'Penales', 'Tackles'].includes(metric.label));
                return (
                  <>
                    <style dangerouslySetInnerHTML={{ __html: `
                      .postTabs { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
                      .postTab { padding: 10px 18px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text-dim); font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s ease; }
                      .postTab:hover { background: var(--surface-strong); color: var(--text-main); }
                      .postTabActive { background: color-mix(in srgb, var(--club-accent) 18%, transparent) !important; border-color: color-mix(in srgb, var(--club-accent) 35%, transparent) !important; color: var(--club-accent) !important; }
                      .scoreboardBig { display: grid; grid-template-columns: 1fr auto 1fr; gap: 24px; align-items: center; justify-items: center; padding: 24px; }
                      .scoreboardTeam { display: grid; gap: 8px; text-align: center; }
                      .scoreboardTeam strong { font-size: 1.1rem; font-weight: 800; color: var(--text-dim); }
                      .scoreboardTeam span { font-size: 3rem; font-weight: 900; letter-spacing: -0.04em; line-height: 1; color: var(--text-main); }
                      .scoreboardVersus { font-size: 1.5rem; font-weight: 800; color: var(--text-dim); opacity: 0.5; }
                      .kpiGrid { display: grid; gap: 10px; }
                      .kpiItem { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-radius: 8px; background: var(--surface); font-size: 0.85rem; }
                      .kpiItem span { color: var(--text-dim); }
                      .kpiItem strong { font-weight: 800; font-size: 1rem; color: var(--text-main); }
                      .timelineRowChild { margin-left: 24px !important; border-left: 3px solid rgba(59,130,246,0.4) !important; background: rgba(59,130,246,0.06) !important; }
                    ` }} />
                    <HeaderBlock title="Cierre postpartido" subtitle="Análisis, estadísticas e informe completo del partido." />
                    <div className={styles.postTabs}>
                      {[
                        { id: 'resumen', label: 'Resumen' },
                        { id: 'estadisticas', label: 'Estadísticas' },
                        { id: 'ataque', label: 'Ataque' },
                        { id: 'defensa', label: 'Defensa' },
                        { id: 'eventos', label: 'Desglose' },
                        { id: 'comparativo', label: 'Comparativo' },
                        { id: 'graficos', label: 'Mis gráficos' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          className={`${styles.postTab}${postTab === tab.id ? ' ' + styles.postTabActive : ''}`}
                          onClick={() => setPostTab(tab.id as typeof postTab)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {postTab === 'resumen' && (
                      <div className={styles.postGrid}>
                        <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
                          <div className={styles.scoreboardBig}>
                            <div className={styles.scoreboardTeam}>
                              <strong>{homeClub?.short_name || homeClub?.name || 'Local'}</strong>
                              <span>{matchDraft.score.home || '0'}</span>
                            </div>
                            <div className={styles.scoreboardVersus}>-</div>
                            <div className={styles.scoreboardTeam}>
                              <strong>{awayClub?.short_name || awayClub?.name || 'Visitante'}</strong>
                              <span>{matchDraft.score.away || '0'}</span>
                            </div>
                          </div>
                        </div>

                        <div className={styles.card}>
                          <h4 style={{ marginBottom: 12, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>Producción ofensiva</h4>
                          <div className={styles.kpiGrid}>
                            {statGroups.scoring.map((item) => (
                              <div key={item.label} className={styles.kpiItem}><span>{item.label}</span><strong>{item.home} - {item.away}</strong></div>
                            ))}
                          </div>
                        </div>

                        <div className={styles.card}>
                          <h4 style={{ marginBottom: 12, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>Continuidad y Juego Fijo</h4>
                          <div className={styles.kpiGrid}>
                            {[
                              ...statGroups.continuity.slice(0, 3),
                              ...statGroups.setPiece.slice(0, 2),
                            ].map((item) => (
                              <div key={item.label} className={styles.kpiItem}><span>{item.label}</span><strong>{item.home} - {item.away}</strong></div>
                            ))}
                          </div>
                        </div>

                        <div className={styles.card}>
                          <h4 style={{ marginBottom: 12, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>Insights</h4>
                          <ul style={{ display: 'grid', gap: 8, fontSize: '0.85rem' }}>
                            {insights.map((insight, i) => (
                              <li key={i} style={{ padding: '8px 12px', background: 'var(--surface)', borderRadius: 8, borderLeft: '3px solid var(--club-accent)' }}>{insight}</li>
                            ))}
                          </ul>
                        </div>

                        <div className={styles.card}><Area label="Análisis" rows={7} value={lineupsState.postmatch.analysis} onChange={(value) => setLineupsState((current) => ({ ...current, postmatch: { ...current.postmatch, analysis: value } }))} /></div>
                        <div className={styles.card}><Area label="Informe interno" rows={7} value={lineupsState.postmatch.report} onChange={(value) => setLineupsState((current) => ({ ...current, postmatch: { ...current.postmatch, report: value } }))} /></div>
                        <div className={styles.card}><Area label="Recuperación" rows={6} value={lineupsState.postmatch.recovery} onChange={(value) => setLineupsState((current) => ({ ...current, postmatch: { ...current.postmatch, recovery: value } }))} /></div>
                        <div className={styles.card}><Area label="Pendientes" rows={6} value={lineupsState.workflow.postMatch} onChange={(value) => setLineupsState((current) => ({ ...current, workflow: { ...current.workflow, postMatch: value } }))} /></div>
                      </div>
                    )}

                    {postTab === 'estadisticas' && (
                      <div className={styles.postGrid}>
                        {allStatSections.map((section) => (
                          <div key={section.title} className={styles.card}>
                            <h4 style={{ marginBottom: 12, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>{section.title}</h4>
                            <MiniBarChart data={section.data} />
                          </div>
                        ))}
                        <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
                          <h4 style={{ marginBottom: 8, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>Tasa de conversión 22</h4>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 12 }}>
                            (Try, try penal, penal a palos o drop) por cada visita al 22 rival.
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: '0.95rem' }}>
                            <div><span style={{ color: 'var(--success)', fontWeight: 700 }}>{homeClub?.short_name || 'Local'}</span>: <strong style={{ fontFamily: 'monospace' }}>{formatTasa22FromStats(stats, 'home')}</strong></div>
                            <div><span style={{ color: 'var(--club-accent)', fontWeight: 700 }}>{awayClub?.short_name || 'Visitante'}</span>: <strong style={{ fontFamily: 'monospace' }}>{formatTasa22FromStats(stats, 'away')}</strong></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {postTab === 'ataque' && (
                      <div className={styles.postGrid}>
                        {attackSections.map((section) => (
                          <div key={section.title} className={styles.card}>
                            <h4 style={{ marginBottom: 12, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>{section.title}</h4>
                            <MiniBarChart data={section.data} />
                          </div>
                        ))}
                      </div>
                    )}

                    {postTab === 'defensa' && (
                      <div className={styles.postGrid}>
                        {defenseSections.map((section) => (
                          <div key={section.title} className={styles.card}>
                            <h4 style={{ marginBottom: 12, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>{section.title}</h4>
                            <MiniBarChart data={section.data} />
                          </div>
                        ))}
                      </div>
                    )}

                    {postTab === 'eventos' && (
                      <div className={styles.postGrid}>
                        <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
                          <h4 style={{ marginBottom: 12, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>Desglose de eventos</h4>
                          <div className={styles.timelineList}>
                            {timelineEventsRecentFirst.map((event) => {
                              const chronologicalIndex = timelineEventIndexById.get(event.id) ?? -1;
                              const detailLine = chronologicalIndex >= 0
                                ? formatMatchTimelineEventDescription(event, timelineEventsChronological, chronologicalIndex, 'Sin detalle adicional')
                                : [event.playerName, event.detail].filter((value) => String(value || '').trim()).join(' · ') || 'Sin detalle adicional';

                              return (
                              <div key={event.id} className={`${styles.timelineRow}${event.parentEventId ? ' ' + styles.timelineRowChild : ''}`}>
                                <div className={styles.timelineMinute}>
                                  <span>{event.minute || '--'}&apos;</span>
                                  <small className={styles.timelinePeriod}>{getMatchPeriodLabel(event.period)}</small>
                                </div>
                                <div className={`${styles.timelineGlyph} ${resolveEventToneClass(event.type)}`}>{resolveEventGlyph(event.type)}</div>
                                <div className={styles.timelineBody}>
                                  <div className={styles.timelineTitleRow}>
                                    <strong>{resolveEventSummary(event)}</strong>
                                    <span>{event.team === 'home' ? (homeClub?.short_name || 'Local') : event.team === 'away' ? (awayClub?.short_name || 'Visitante') : 'Neutral'}</span>
                                  </div>
                                  <p>{detailLine}</p>
                                  {(() => {
                                    const eventScore = timelineScoreById.get(event.id);
                                    return eventScore && eventScore.points > 0 ? (
                                      <p style={{ color: 'var(--success)', fontWeight: 800 }}>
                                        Marcador {eventScore.home} - {eventScore.away}
                                      </p>
                                    ) : null;
                                  })()}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {postTab === 'comparativo' && (
                      <div className={styles.postGrid}>
                        <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
                          <h4 style={{ marginBottom: 12, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>Radar comparativo</h4>
                          <RadarChart axes={[
                            { label: 'Tries', home: stats.tries.home, away: stats.tries.away, max: 8 },
                            { label: 'Conv', home: stats.conversions.home, away: stats.conversions.away, max: 8 },
                            { label: 'Pen', home: stats.penalties.home, away: stats.penalties.away, max: 8 },
                            { label: 'Tack', home: Math.min(stats.tackles.home, 20), away: Math.min(stats.tackles.away, 20), max: 20 },
                            { label: 'Scrum', home: stats.scrums.home.won, away: stats.scrums.away.won, max: 15 },
                            { label: 'Line', home: stats.lines.home.won, away: stats.lines.away.won, max: 15 },
                          ]} />
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 12, fontSize: '0.8rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, background: 'var(--success)', borderRadius: 3 }} /> {homeClub?.short_name || 'Local'}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, background: 'var(--club-accent)', borderRadius: 3 }} /> {awayClub?.short_name || 'Visitante'}</span>
                          </div>
                        </div>
                        <div className={styles.card}>
                          <h4 style={{ marginBottom: 12, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>Producción ofensiva</h4>
                          <ComparisonBarChart home={stats.tries.home} away={stats.tries.away} />
                        </div>
                        <div className={styles.card}>
                          <h4 style={{ marginBottom: 12, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>Disciplina</h4>
                          <ComparisonBarChart home={stats.penalties.home} away={stats.penalties.away} />
                        </div>
                        <div className={styles.card}>
                          <h4 style={{ marginBottom: 12, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>Tackles</h4>
                          <ComparisonBarChart home={stats.tackles.home} away={stats.tackles.away} />
                        </div>
                        <div className={styles.card}>
                          <h4 style={{ marginBottom: 12, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>Juego fijo</h4>
                          <ComparisonBarChart home={stats.scrums.home.won + stats.lines.home.won} away={stats.scrums.away.won + stats.lines.away.won} />
                        </div>
                        {comparisonMetrics.map((metric) => (
                          <div key={metric.label} className={styles.card}>
                            <h4 style={{ marginBottom: 12, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>{metric.label}</h4>
                            <ComparisonBarChart home={metric.home} away={metric.away} />
                          </div>
                        ))}
                      </div>
                    )}

                    {postTab === 'graficos' && (
                      <ChartConfigPanel
                        clubId={clubId}
                        panelKey="postmatch"
                        catalog={STAT_CATALOG_POSTMATCH}
                        data={stats}
                        homeLabel={homeClub?.short_name || homeClub?.name || 'Local'}
                        awayLabel={awayClub?.short_name || awayClub?.name || 'Visitante'}
                        sectionTitle="Mis gráficos del partido"
                        emptyHint="Armá tus propios gráficos eligiendo el tipo y las estadísticas a comparar. Quedan guardados para todo el cuerpo técnico del club."
                      />
                    )}
                  </>
                );
              })()}

              {activeTab === 'contenido' && (
                <>
                  <HeaderBlock title="Contenido / Prensa" subtitle="Exports, piezas para redes y acceso rápido." />
                  <div className={styles.contentGrid}>
                    <div className={styles.card}>
                      <div className={styles.fieldGrid}>
                        <Field label="Titular interno" value={lineupsState.media.headline} onChange={(value) => setLineupsState((current) => ({ ...current, media: { ...current.media, headline: value } }))} />
                        <Area label="Copy para redes" rows={6} value={lineupsState.media.socialCopy} onChange={(value) => setLineupsState((current) => ({ ...current, media: { ...current.media, socialCopy: value } }))} />
                        <SelectField label="Estado del material" value={lineupsState.media.assetStatus} onChange={(value) => setLineupsState((current) => ({ ...current, media: { ...current.media, assetStatus: value as ClubMediaPlan['assetStatus'] } }))} options={[
                          { value: 'pending', label: 'Pendiente' },
                          { value: 'ready', label: 'Listo' },
                          { value: 'published', label: 'Publicado' },
                        ]} />
                      </div>
                    </div>
                    <div className={styles.card}>
                      <div className={styles.linkGrid}>
                        <Link href={publicHref} className={styles.quickLink}><span>Vista pública</span><Eye size={16} /></Link>
                        <Link href={`/club-admin?club=${encodeURIComponent(clubId)}&tab=contenido`} prefetch={false} className={styles.quickLink}><span>Exports del Club</span><ExternalLink size={16} /></Link>
                        <button className={styles.quickLink} type="button" onClick={handleExportMatchSheetPdf}><span>Exportar planilla PDF</span><FileText size={16} /></button>
                        <button className={styles.quickLink} type="button" onClick={() => saveMatch(undefined, 'Contenido interno guardado')}><span>Guardar Material</span><Save size={16} /></button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {feedback ? (
              <div className={`${styles.feedback} ${feedback.tone === 'success' ? styles.feedbackSuccess : feedback.tone === 'info' ? styles.feedbackInfo : styles.feedbackError}`} style={{ marginTop: 16 }}>
                {feedback.message}
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}

function TeamShield({ club }: { club?: ClubInfo | null }) {
  if (club?.logo_url) {
    return (
      <div className={styles.shield}>
        <Image src={club.logo_url} alt={club.name || 'Escudo'} width={72} height={72} unoptimized className={styles.shieldImage} />
      </div>
    );
  }

  const initials = (club?.short_name || club?.name || 'CL').split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
  return (
    <div className={styles.shield}>
      <span className={styles.shieldFallback}>{initials}</span>
    </div>
  );
}

function HeaderBlock({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.tabHeader}>
      <div>
        <h2 className={styles.tabTitle}>{title}</h2>
        <p className={styles.tabSubtitle}>{subtitle}</p>
      </div>
      {action ? <div className={styles.miniActions}>{action}</div> : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input className={styles.input} type={type} value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select className={styles.select} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function Area({
  label,
  rows,
  value,
  onChange,
}: {
  label: string;
  rows: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <textarea className={styles.textarea} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function updateCallup(
  setLineupsState: Dispatch<SetStateAction<ClubLineupsState>>,
  index: number,
  patch: Partial<ClubCallup>
) {
  setLineupsState((current) => ({
    ...current,
    callups: current.callups.map((player, currentIndex) => currentIndex === index ? { ...player, ...patch } : player),
  }));
}

function updateMyLineupPlayer(
  setLineupsState: Dispatch<SetStateAction<ClubLineupsState>>,
  lineupKey: 'home' | 'away',
  index: number,
  patch: Partial<MatchLineupPlayer>
) {
  setLineupsState((current) => ({
    ...current,
    [lineupKey]: current[lineupKey].map((player, currentIndex) => currentIndex === index ? { ...player, ...patch } : player),
  }));
}

function updateEvent(
  setEvents: Dispatch<SetStateAction<ClubLiveEvent[]>>,
  index: number,
  patch: Partial<ClubLiveEvent>
) {
  setEvents((current) => current.map((event, currentIndex) => currentIndex === index ? { ...event, ...patch } : event));
}

function removeCallup(setLineupsState: Dispatch<SetStateAction<ClubLineupsState>>, index: number) {
  setLineupsState((current) => ({ ...current, callups: current.callups.filter((_, currentIndex) => currentIndex !== index) }));
}

function removeLineupPlayer(
  setLineupsState: Dispatch<SetStateAction<ClubLineupsState>>,
  lineupKey: 'home' | 'away',
  index: number
) {
  setLineupsState((current) => ({
    ...current,
    [lineupKey]: current[lineupKey].filter((_, currentIndex) => currentIndex !== index),
  }));
}
