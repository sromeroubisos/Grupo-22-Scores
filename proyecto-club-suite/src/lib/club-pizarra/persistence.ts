import type {
    PersistedBoardState,
    TimelineFrame,
    PlayerChip,
    LinePath,
    BallState,
    ViewBox,
    EasingPreset,
    MovementArrow,
    Point,
    ArrowTargetType,
    SavedPreset,
} from './types';
import {
    DEFAULT_VIEWBOX,
    DEFAULT_BALL,
    DEFAULT_LINE_COLOR,
    DEFAULT_LINE_WIDTH,
    DEFAULT_PLAYBACK_SPEED,
    BOARD_STORAGE_VERSION,
} from './constants';
import {
    clonePlayers,
    cloneLines,
    cloneArrows,
    cloneBall,
    cloneViewBox,
    cloneTimelineFrame,
    getDefaultFrameTransition,
    getDefaultBoardOrientation,
    getInitialPlayers,
    ensurePlayersHaveBothTeams,
} from './utils';

type PartialBoardState = Partial<PersistedBoardState> & {
    timeline?: Array<Partial<TimelineFrame>>;
};

type LegacySavedPresetShape = Partial<SavedPreset> & {
    players?: unknown;
    lines?: unknown;
    ball?: unknown;
    viewBox?: unknown;
    timeline?: unknown;
    showNumbers?: unknown;
    mode?: unknown;
    orientation?: unknown;
    lineColor?: unknown;
    lineWidth?: unknown;
    playbackSpeed?: unknown;
    boardState?: unknown;
};

export function buildBoardStorageKey(clubId: string, sport: string) {
    return `club-pizarra:${clubId}:${sport}`;
}

export function buildSavedPresetsKey(clubId: string, sport: string) {
    return `club-pizarra-presets:${clubId}:${sport}`;
}

export function createDefaultBoardState(sport: string): PersistedBoardState {
    return {
        version: BOARD_STORAGE_VERSION,
        players: getInitialPlayers(sport),
        lines: [],
        ball: cloneBall(DEFAULT_BALL),
        viewBox: { ...DEFAULT_VIEWBOX },
        timeline: [],
        showNumbers: true,
        mode: 'select',
        orientation: getDefaultBoardOrientation(sport),
        lineColor: DEFAULT_LINE_COLOR,
        lineWidth: DEFAULT_LINE_WIDTH,
        playbackSpeed: DEFAULT_PLAYBACK_SPEED,
    };
}

function normalizeArrows(input: unknown): MovementArrow[] {
    if (!Array.isArray(input)) return [];
    return input
        .map((raw, index): MovementArrow | null => {
            if (!raw || typeof raw !== 'object') return null;
            const arrow = raw as Partial<MovementArrow>;
            const points = Array.isArray(arrow.points)
                ? (arrow.points as Point[]).filter((point) =>
                      point && typeof point === 'object'
                          && typeof point.x === 'number' && Number.isFinite(point.x)
                          && typeof point.y === 'number' && Number.isFinite(point.y)
                  ).map((point) => ({ x: point.x, y: point.y }))
                : [];
            if (points.length < 2) return null;
            const targetType: ArrowTargetType = arrow.targetType === 'ball' ? 'ball' : 'player';
            const targetId = typeof arrow.targetId === 'string' && arrow.targetId.trim()
                ? arrow.targetId
                : targetType === 'ball' ? 'ball' : '';
            if (!targetId) return null;
            return {
                id: typeof arrow.id === 'string' && arrow.id.trim() ? arrow.id : `arrow-restored-${index}`,
                targetType,
                targetId,
                points,
                color: typeof arrow.color === 'string' && arrow.color.trim() ? arrow.color : '#facc15',
                width: typeof arrow.width === 'number' && Number.isFinite(arrow.width) ? Math.max(1, arrow.width) : 3,
            };
        })
        .filter((value): value is MovementArrow => value !== null);
}

function normalizeBall(input: unknown, fallback = DEFAULT_BALL): BallState {
    if (!input || typeof input !== 'object') {
        return cloneBall(fallback);
    }

    const raw = input as Partial<BallState>;
    const anchor = raw.anchor && typeof raw.anchor === 'object'
        ? raw.anchor as Partial<NonNullable<BallState['anchor']>>
        : null;
    const normalizedAnchor = anchor
        && typeof anchor.playerId === 'string'
        && anchor.playerId.trim()
        && typeof anchor.offsetX === 'number'
        && Number.isFinite(anchor.offsetX)
        && typeof anchor.offsetY === 'number'
        && Number.isFinite(anchor.offsetY)
        ? {
            playerId: anchor.playerId,
            offsetX: anchor.offsetX,
            offsetY: anchor.offsetY,
        }
        : null;

    return {
        x: typeof raw.x === 'number' && Number.isFinite(raw.x) ? raw.x : fallback.x,
        y: typeof raw.y === 'number' && Number.isFinite(raw.y) ? raw.y : fallback.y,
        visible: typeof raw.visible === 'boolean' ? raw.visible : fallback.visible,
        anchor: normalizedAnchor,
    };
}

function normalizeTimeline(
    timeline: Array<Partial<TimelineFrame>> | undefined,
    fallback: PersistedBoardState,
    sport: string
) {
    if (!Array.isArray(timeline)) {
        return cloneTimeline(fallback.timeline);
    }

    return timeline.map((frame, index) => cloneTimelineFrame({
        id: typeof frame.id === 'string' && frame.id.trim() ? frame.id : `frame-restored-${index}`,
        name: typeof frame.name === 'string' && frame.name.trim() ? frame.name : `Frame ${index + 1}`,
        players: Array.isArray(frame.players)
            ? ensurePlayersHaveBothTeams(frame.players as PlayerChip[], sport)
            : clonePlayers(fallback.players),
        lines: Array.isArray(frame.lines) ? cloneLines(frame.lines as LinePath[]) : [],
        ball: normalizeBall(frame.ball, DEFAULT_BALL),
        viewBox: frame.viewBox ? cloneViewBox(frame.viewBox as ViewBox) : cloneViewBox(fallback.viewBox),
        arrows: cloneArrows(normalizeArrows((frame as { arrows?: unknown }).arrows)),
        duration: typeof frame.duration === 'number' && Number.isFinite(frame.duration)
            ? Math.max(100, frame.duration)
            : getDefaultFrameTransition(index).duration,
        holdBefore: typeof frame.holdBefore === 'number' && Number.isFinite(frame.holdBefore)
            ? Math.max(0, frame.holdBefore)
            : getDefaultFrameTransition(index).holdBefore,
        holdAfter: typeof frame.holdAfter === 'number' && Number.isFinite(frame.holdAfter)
            ? Math.max(0, frame.holdAfter)
            : getDefaultFrameTransition(index).holdAfter,
        easing: (frame.easing as EasingPreset | undefined) ?? getDefaultFrameTransition(index).easing,
    }, index));
}

export function normalizePersistedBoardState(input: unknown, sport: string): PersistedBoardState {
    const fallback = createDefaultBoardState(sport);
    if (!input || typeof input !== 'object') {
        return fallback;
    }

    const parsed = input as PartialBoardState;
    const version = typeof parsed.version === 'number' ? parsed.version : BOARD_STORAGE_VERSION;
    if (version > BOARD_STORAGE_VERSION) {
        return fallback;
    }

    const persistedViewBox = parsed.viewBox ? cloneViewBox(parsed.viewBox) : cloneViewBox(fallback.viewBox);
    const persistedPlayers = Array.isArray(parsed.players)
        ? ensurePlayersHaveBothTeams(parsed.players as PlayerChip[], sport)
        : clonePlayers(fallback.players);

    return {
        version: BOARD_STORAGE_VERSION,
        players: persistedPlayers,
        lines: Array.isArray(parsed.lines) ? cloneLines(parsed.lines) : cloneLines(fallback.lines),
        ball: normalizeBall(parsed.ball, fallback.ball),
        viewBox: persistedViewBox,
        timeline: normalizeTimeline(
            parsed.timeline,
            { ...fallback, players: clonePlayers(persistedPlayers), viewBox: persistedViewBox },
            sport
        ),
        showNumbers: typeof parsed.showNumbers === 'boolean' ? parsed.showNumbers : fallback.showNumbers,
        mode: parsed.mode === 'draw' ? 'draw' : 'select',
        orientation: parsed.orientation === 'vertical' ? 'vertical' : fallback.orientation,
        lineColor: typeof parsed.lineColor === 'string' && parsed.lineColor.trim() ? parsed.lineColor : fallback.lineColor,
        lineWidth: typeof parsed.lineWidth === 'number' && Number.isFinite(parsed.lineWidth) ? parsed.lineWidth : fallback.lineWidth,
        playbackSpeed: typeof parsed.playbackSpeed === 'number' && Number.isFinite(parsed.playbackSpeed)
            ? parsed.playbackSpeed
            : fallback.playbackSpeed,
    };
}

function normalizeSavedPreset(input: unknown, sport: string, index: number): SavedPreset | null {
    if (!input || typeof input !== 'object') {
        return null;
    }

    const preset = input as LegacySavedPresetShape;
    const id = typeof preset.id === 'string' && preset.id.trim() ? preset.id : `preset-restored-${index}`;
    const name = typeof preset.name === 'string' && preset.name.trim() ? preset.name.trim() : `Jugada ${index + 1}`;
    const category = typeof preset.category === 'string' && preset.category.trim() ? preset.category.trim() : 'Mis jugadas';
    const createdAt = typeof preset.createdAt === 'number' && Number.isFinite(preset.createdAt) ? preset.createdAt : Date.now();
    const updatedAt = typeof preset.updatedAt === 'number' && Number.isFinite(preset.updatedAt) ? preset.updatedAt : createdAt;

    const boardSource = preset.boardState && typeof preset.boardState === 'object'
        ? preset.boardState
        : {
            version: BOARD_STORAGE_VERSION,
            players: preset.players,
            lines: preset.lines,
            ball: preset.ball,
            viewBox: preset.viewBox,
            timeline: preset.timeline,
            showNumbers: preset.showNumbers,
            mode: preset.mode,
            orientation: preset.orientation,
            lineColor: preset.lineColor,
            lineWidth: preset.lineWidth,
            playbackSpeed: preset.playbackSpeed,
        };

    return {
        id,
        name,
        category,
        boardState: normalizePersistedBoardState(boardSource, sport),
        createdAt,
        updatedAt,
    };
}

export function normalizeSavedPresets(input: unknown, sport: string): SavedPreset[] {
    if (!Array.isArray(input)) {
        return [];
    }

    return input
        .map((item, index) => normalizeSavedPreset(item, sport, index))
        .filter((preset): preset is SavedPreset => Boolean(preset))
        .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function loadPersistedBoardState(storageKey: string, sport: string): PersistedBoardState {
    const fallback = createDefaultBoardState(sport);
    if (typeof window === 'undefined') {
        return fallback;
    }

    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
            return fallback;
        }

        return normalizePersistedBoardState(JSON.parse(raw), sport);
    } catch {
        return fallback;
    }
}

export function loadSavedPresets(storageKey: string, sport: string): SavedPreset[] {
    if (typeof window === 'undefined') return [];

    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return [];
        return normalizeSavedPresets(JSON.parse(raw), sport);
    } catch {
        return [];
    }
}

export function savePersistedBoardState(storageKey: string, state: PersistedBoardState) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(state));
}

export function saveSavedPresets(storageKey: string, presets: SavedPreset[]) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(presets));
}

export function savePreset(storageKey: string, preset: SavedPreset, sport: string) {
    if (typeof window === 'undefined') return;
    const presets = loadSavedPresets(storageKey, sport);
    const existingIndex = presets.findIndex((item) => item.id === preset.id);
    if (existingIndex >= 0) {
        presets[existingIndex] = preset;
    } else {
        presets.unshift(preset);
    }
    saveSavedPresets(storageKey, presets);
}

export function deletePreset(storageKey: string, presetId: string, sport: string) {
    if (typeof window === 'undefined') return;
    const presets = loadSavedPresets(storageKey, sport).filter((preset) => preset.id !== presetId);
    saveSavedPresets(storageKey, presets);
}

export function createSavedPresetSnapshot(
    name: string,
    boardState: PersistedBoardState,
    sport: string,
    category = 'Mis jugadas'
): SavedPreset {
    const now = Date.now();

    return {
        id: `preset-${now}`,
        name: name.trim(),
        category,
        boardState: normalizePersistedBoardState(boardState, sport),
        createdAt: now,
        updatedAt: now,
    };
}

function cloneTimeline(list: TimelineFrame[]) {
    return list.map((frame, index) => cloneTimelineFrame(frame, index));
}
