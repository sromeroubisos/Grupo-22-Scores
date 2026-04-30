'use client';

import Link from 'next/link';
import { useState, useCallback, useRef, useMemo, useEffect, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import type {
    PlayerChip,
    LinePath,
    BallState,
    ViewBox,
    BoardOrientation,
    TimelineFrame,
    PizarraUIMode,
    BoardMode,
    MovementArrow,
    RugbyPreset,
    SavedPreset,
    PersistedBoardState,
} from '@/lib/club-pizarra/types';
import {
    DEFAULT_VIEWBOX,
    DEFAULT_LINE_COLOR,
    DEFAULT_LINE_WIDTH,
    DEFAULT_PLAYBACK_SPEED,
    BOARD_STORAGE_VERSION,
    HOME_TEAM_COLOR,
    RUGBY_PRESETS,
} from '@/lib/club-pizarra/constants';
import {
    normalizeSport,
    clonePlayers,
    cloneLines,
    cloneArrows,
    cloneBall,
    cloneViewBox,
    cloneTimeline,
    buildTimelineSegments,
    resolveBoardStateAtTime,
    resolveBallAnchorPosition,
    mapBaseViewBoxToDisplay,
    mapDisplayPointToBase,
    getSportLabel,
    getSportOrientation,
    getDefaultBoardOrientation,
} from '@/lib/club-pizarra/utils';
import {
    buildBoardStorageKey,
    loadPersistedBoardState,
    normalizePersistedBoardState,
    normalizeSavedPresets,
    savePersistedBoardState,
    buildSavedPresetsKey,
    loadSavedPresets,
    saveSavedPresets,
    createSavedPresetSnapshot,
    createDefaultBoardState,
} from '@/lib/club-pizarra/persistence';
import { exportVideo, downloadBlob, type ExportProgress } from '@/lib/club-pizarra/videoExport';
import { ModeSelector } from './pizarra/ModeSelector';
import { PizarraToolbar } from './pizarra/PizarraToolbar';
import { PizarraCanvas } from './pizarra/PizarraCanvas';
import { PizarraTimeline } from './pizarra/PizarraTimeline';
import { PresetsDrawer } from './pizarra/PresetsDrawer';
import './pizarra/pizarra.css';

interface ClubPizarraTabProps {
    clubId: string;
    sport?: string | null;
    primaryColor?: string | null;
    clubName?: string;
    backHref?: string;
    mobileCanvasFirst?: boolean;
    onBack?: () => void;
}

type StorageMode = 'club' | 'local';

type BoardUndoSnapshot = Pick<
    PersistedBoardState,
    'players' | 'lines' | 'ball' | 'viewBox' | 'showNumbers' | 'mode' | 'orientation' | 'lineColor' | 'lineWidth' | 'playbackSpeed'
> & {
    pendingArrows: MovementArrow[];
};

type PizarraWorkspaceResponse = {
    ok?: boolean;
    data?: {
        boardState?: unknown;
        savedPresets?: unknown;
        storageMode?: StorageMode;
        available?: boolean;
        workspaceFound?: boolean;
        updatedAt?: string | null;
        canEdit?: boolean;
    };
    error?: string;
};

function buildWorkspaceSignature(boardState: PersistedBoardState, savedPresets: SavedPreset[]) {
    return JSON.stringify({
        boardState,
        savedPresets,
    });
}

function formatLastSavedLabel(timestamp: number | null) {
    if (!timestamp || Number.isNaN(timestamp)) return 'Sin sincronizacion todavia';

    return `Actualizado ${new Intl.DateTimeFormat('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp))}`;
}

export function ClubPizarraTab({
    clubId,
    sport,
    clubName,
    backHref = '/club-admin',
    mobileCanvasFirst = false,
    onBack,
}: ClubPizarraTabProps) {
    const normalizedSport = normalizeSport(sport);
    const homeColor = HOME_TEAM_COLOR;
    const storageKey = useMemo(() => buildBoardStorageKey(clubId, normalizedSport), [clubId, normalizedSport]);
    const initialBoardState = useMemo(() => loadPersistedBoardState(storageKey, normalizedSport), [storageKey, normalizedSport]);
    const savedPresetsKey = useMemo(() => buildSavedPresetsKey(clubId, normalizedSport), [clubId, normalizedSport]);
    const initialSavedPresets = useMemo(() => loadSavedPresets(savedPresetsKey, normalizedSport), [savedPresetsKey, normalizedSport]);
    const initialWorkspaceSignature = useMemo(
        () => buildWorkspaceSignature(initialBoardState, initialSavedPresets),
        [initialBoardState, initialSavedPresets]
    );

    /* ── UI Mode ── */
    const [uiMode, setUiMode] = useState<PizarraUIMode>('edit');

    /* ── Board state ── */
    const [players, setPlayers] = useState<PlayerChip[]>(() => clonePlayers(initialBoardState.players));
    const [lines, setLines] = useState<LinePath[]>(() => cloneLines(initialBoardState.lines));
    const [ball, setBall] = useState<BallState>(() => cloneBall(initialBoardState.ball));
    const [viewBox, setViewBox] = useState<ViewBox>(() => ({ ...initialBoardState.viewBox }));
    const [boardOrientation, setBoardOrientation] = useState<BoardOrientation>(initialBoardState.orientation);
    const [showNumbers, setShowNumbers] = useState(initialBoardState.showNumbers);
    const [mode, setMode] = useState<BoardMode>(initialBoardState.mode);
    const [lineColor, setLineColor] = useState(initialBoardState.lineColor);
    const [lineWidth, setLineWidth] = useState(initialBoardState.lineWidth);
    const [currentLine, setCurrentLine] = useState<LinePath | null>(null);

    /* ── Animation ── */
    const [timeline, setTimeline] = useState<TimelineFrame[]>(() => cloneTimeline(initialBoardState.timeline));
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackTime, setPlaybackTime] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(initialBoardState.playbackSpeed);
    const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
    const [pendingArrows, setPendingArrows] = useState<MovementArrow[]>([]);
    const [currentArrow, setCurrentArrow] = useState<MovementArrow | null>(null);
    const currentArrowRef = useRef<MovementArrow | null>(null);
    const arrowTargetRef = useRef<{ type: 'player' | 'ball'; id: string } | null>(null);
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);

    /* ── Drag / Pan ── */
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [draggingBall, setDraggingBall] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef<{ x: number; y: number; vb: ViewBox } | null>(null);
    const wheelUndoTimerRef = useRef<number | null>(null);

    /* ── Flash feedback ── */
    const [flashCapture, setFlashCapture] = useState(false);
    const undoStackRef = useRef<BoardUndoSnapshot[]>([]);
    const [undoDepth, setUndoDepth] = useState(0);

    /* ── Video export ── */
    const [exportState, setExportState] = useState<ExportProgress>({ status: 'idle', progress: 0, message: '' });

    /* ── Header height for sticky positioning ── */
    const [appHeaderHeight, setAppHeaderHeight] = useState(72);
    const [isCompactMobile, setIsCompactMobile] = useState(false);

    useEffect(() => {
        const media = window.matchMedia('(max-width: 900px)');
        const sync = () => setIsCompactMobile(media.matches);
        sync();
        media.addEventListener('change', sync);
        return () => media.removeEventListener('change', sync);
    }, []);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const syncHeaderHeight = () => {
            const headerEl = document.querySelector('.main-header') as HTMLElement | null;
            const headerIsSticky = headerEl ? window.getComputedStyle(headerEl).position === 'sticky' : false;
            const nextHeight = headerIsSticky ? Math.round(headerEl?.getBoundingClientRect().height ?? 72) : 0;
            setAppHeaderHeight((prev) => (prev === nextHeight ? prev : nextHeight));
        };
        syncHeaderHeight();
        window.addEventListener('resize', syncHeaderHeight);
        const headerEl = document.querySelector('.main-header') as HTMLElement | null;
        let observer: ResizeObserver | null = null;
        if (headerEl && typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => syncHeaderHeight());
            observer.observe(headerEl);
        }
        return () => {
            window.removeEventListener('resize', syncHeaderHeight);
            if (observer) observer.disconnect();
        };
    }, []);
    useEffect(() => () => {
        if (wheelUndoTimerRef.current) {
            window.clearTimeout(wheelUndoTimerRef.current);
        }
    }, []);

    /* ── Presets drawer ── */
    const [presetsOpen, setPresetsOpen] = useState(false);

    /* ── Saved presets ── */
    const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(() => initialSavedPresets);
    const [storageMode, setStorageMode] = useState<StorageMode>('local');
    const [storageMessage, setStorageMessage] = useState('Buscando el espacio privado del club...');
    const [storageError, setStorageError] = useState<string | null>(null);
    const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
    const [isWorkspaceSaving, setIsWorkspaceSaving] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    const lastPersistedSignatureRef = useRef(initialWorkspaceSignature);
    const canSyncClubWorkspaceRef = useRef(true);

    const buildBoardStateSnapshot = useCallback((): PersistedBoardState => ({
        version: BOARD_STORAGE_VERSION,
        players: clonePlayers(players),
        lines: cloneLines(lines),
        ball: cloneBall(ball),
        viewBox: cloneViewBox(viewBox),
        timeline: cloneTimeline(timeline),
        showNumbers,
        mode,
        orientation: boardOrientation,
        lineColor,
        lineWidth,
        playbackSpeed,
    }), [
        players,
        lines,
        ball,
        viewBox,
        timeline,
        showNumbers,
        mode,
        boardOrientation,
        lineColor,
        lineWidth,
        playbackSpeed,
    ]);

    const buildUndoSnapshot = useCallback((): BoardUndoSnapshot => ({
        players: clonePlayers(players),
        lines: cloneLines(lines),
        ball: cloneBall(ball),
        viewBox: cloneViewBox(viewBox),
        showNumbers,
        mode,
        orientation: boardOrientation,
        lineColor,
        lineWidth,
        playbackSpeed,
        pendingArrows: cloneArrows(pendingArrows),
    }), [
        players,
        lines,
        ball,
        viewBox,
        showNumbers,
        mode,
        boardOrientation,
        lineColor,
        lineWidth,
        playbackSpeed,
        pendingArrows,
    ]);

    const pushUndoSnapshot = useCallback(() => {
        const snapshot = buildUndoSnapshot();
        const signature = JSON.stringify(snapshot);
        const stack = undoStackRef.current;
        const last = stack[stack.length - 1];
        if (last && JSON.stringify(last) === signature) return;
        const nextStack = [...stack, snapshot].slice(-50);
        undoStackRef.current = nextStack;
        setUndoDepth(nextStack.length);
    }, [buildUndoSnapshot]);

    const handleUndoBoardChange = useCallback(() => {
        const previous = undoStackRef.current.pop();
        if (!previous) return;
        setUndoDepth(undoStackRef.current.length);
        setIsPlaying(false);
        setPlaybackTime(0);
        setCurrentLine(null);
        currentArrowRef.current = null;
        arrowTargetRef.current = null;
        setCurrentArrow(null);
        setDraggingId(null);
        setDraggingBall(false);
        setIsPanning(false);
        panStartRef.current = null;
        setPlayers(clonePlayers(previous.players));
        setLines(cloneLines(previous.lines));
        setBall(cloneBall(previous.ball));
        setViewBox(cloneViewBox(previous.viewBox));
        setShowNumbers(previous.showNumbers);
        setMode(previous.mode);
        setBoardOrientation(previous.orientation);
        setLineColor(previous.lineColor);
        setLineWidth(previous.lineWidth);
        setPlaybackSpeed(previous.playbackSpeed);
        setPendingArrows(cloneArrows(previous.pendingArrows));
    }, []);

    const applyBoardStateSnapshot = useCallback((snapshot: PersistedBoardState) => {
        setIsPlaying(false);
        setPlaybackTime(0);
        setCurrentLine(null);
        currentArrowRef.current = null;
        setCurrentArrow(null);
        setPendingArrows([]);
        setEditingFrameId(null);
        setPlayers(clonePlayers(snapshot.players));
        setLines(cloneLines(snapshot.lines));
        setBall(cloneBall(snapshot.ball));
        setViewBox(cloneViewBox(snapshot.viewBox));
        setTimeline(cloneTimeline(snapshot.timeline));
        setShowNumbers(snapshot.showNumbers);
        setMode(snapshot.mode);
        setBoardOrientation(snapshot.orientation);
        setLineColor(snapshot.lineColor);
        setLineWidth(snapshot.lineWidth);
        setPlaybackSpeed(snapshot.playbackSpeed);
    }, []);

    const handleSavePreset = useCallback(
        (name: string) => {
            const newPreset = createSavedPresetSnapshot(name, buildBoardStateSnapshot(), normalizedSport);
            setSavedPresets((prev) => [newPreset, ...prev.filter((preset) => preset.id !== newPreset.id)]);
        },
        [buildBoardStateSnapshot, normalizedSport]
    );

    const handleDeletePreset = useCallback((presetId: string) => {
        setSavedPresets((prev) => prev.filter((preset) => preset.id !== presetId));
    }, []);

    /* ── Derived ── */
    useEffect(() => {
        let cancelled = false;

        async function loadWorkspace() {
            setIsWorkspaceLoading(true);
            setStorageError(null);
            setStorageMessage('Cargando pizarra privada del club...');

            try {
                const response = await fetch(
                    `/api/club-admin/pizarra?club=${encodeURIComponent(clubId)}&sport=${encodeURIComponent(normalizedSport)}`,
                    {
                        credentials: 'same-origin',
                        cache: 'no-store',
                    }
                );
                const payload = await response.json() as PizarraWorkspaceResponse;

                if (!response.ok) {
                    throw new Error(payload.error || 'No se pudo cargar la pizarra del club');
                }

                if (cancelled) return;

                const storage = payload.data?.storageMode === 'club' ? 'club' : 'local';
                const canEdit = payload.data?.canEdit !== false;
                const effectiveStorageMode: StorageMode = storage === 'club' && canEdit ? 'club' : 'local';
                const workspaceFound = Boolean(payload.data?.workspaceFound);
                const remoteBoardState = payload.data?.boardState != null
                    ? normalizePersistedBoardState(payload.data.boardState, normalizedSport)
                    : null;
                const remoteSavedPresets = normalizeSavedPresets(payload.data?.savedPresets, normalizedSport);

                setStorageMode(effectiveStorageMode);
                canSyncClubWorkspaceRef.current = storage === 'club' && payload.data?.available !== false && canEdit;

                if (remoteBoardState) {
                    applyBoardStateSnapshot(remoteBoardState);
                    savePersistedBoardState(storageKey, remoteBoardState);
                }

                if (workspaceFound) {
                    setSavedPresets(remoteSavedPresets);
                    saveSavedPresets(savedPresetsKey, remoteSavedPresets);
                    lastPersistedSignatureRef.current = buildWorkspaceSignature(
                        remoteBoardState ?? initialBoardState,
                        remoteSavedPresets
                    );
                } else if (storage === 'local') {
                    lastPersistedSignatureRef.current = buildWorkspaceSignature(initialBoardState, initialSavedPresets);
                } else {
                    lastPersistedSignatureRef.current = '';
                }

                if (workspaceFound && payload.data?.updatedAt) {
                    const parsedUpdatedAt = Date.parse(payload.data.updatedAt);
                    setLastSavedAt(Number.isNaN(parsedUpdatedAt) ? Date.now() : parsedUpdatedAt);
                }

                setStorageMessage(
                    effectiveStorageMode === 'club'
                        ? 'Espacio del club activo. Las jugadas quedan aisladas por club.'
                        : storage === 'club' && !canEdit
                            ? 'Pizarra del club en modo lectura. Los cambios se guardan localmente en este dispositivo.'
                        : 'Guardado local activo en este dispositivo.'
                );
            } catch (error) {
                if (cancelled) return;

                console.error('Pizarra workspace load error:', error);
                setStorageMode('local');
                setStorageError(error instanceof Error ? error.message : 'No se pudo cargar el espacio del club');
                setStorageMessage('Seguimos trabajando con guardado local en este dispositivo.');
                canSyncClubWorkspaceRef.current = false;
                lastPersistedSignatureRef.current = buildWorkspaceSignature(initialBoardState, initialSavedPresets);
            } finally {
                if (!cancelled) {
                    setIsWorkspaceLoading(false);
                }
            }
        }

        void loadWorkspace();

        return () => {
            cancelled = true;
        };
    }, [
        clubId,
        normalizedSport,
        storageKey,
        savedPresetsKey,
        applyBoardStateSnapshot,
        initialBoardState,
        initialSavedPresets,
    ]);

    const playbackTimeline = useMemo(() => {
        const overlayFrameId = editingFrameId ?? (pendingArrows.length > 0 ? timeline[timeline.length - 1]?.id : null);
        if (!overlayFrameId) return timeline;
        return timeline.map((frame) =>
            frame.id === overlayFrameId
                ? {
                    ...frame,
                    players: clonePlayers(players),
                    lines: cloneLines(lines),
                    ball: cloneBall(ball),
                    viewBox: cloneViewBox(viewBox),
                    arrows: cloneArrows(pendingArrows),
                }
                : frame
        );
    }, [editingFrameId, timeline, players, lines, ball, viewBox, pendingArrows]);

    const timelineSegments = useMemo(() => buildTimelineSegments(playbackTimeline), [playbackTimeline]);
    const totalDuration = useMemo(() => {
        if (timelineSegments.length === 0) return 0;
        return timelineSegments[timelineSegments.length - 1]?.segmentEnd ?? 0;
    }, [timelineSegments]);
    const hasPlaybackFrames = playbackTimeline.length >= 2;
    const isPlaybackPreview = hasPlaybackFrames && (isPlaying || playbackTime > 0);
    const isPlaybackLocked = hasPlaybackFrames && (isPlaying || playbackTime > 0);

    const resolvedPlaybackState = useMemo(() => {
        const fallbackPlayers = clonePlayers(players).map((p) => ({ ...p, opacity: 1 }));
        const fallbackBall = { ...ball, ...resolveBallAnchorPosition(ball, players), opacity: ball.visible ? 1 : 0 };
        const editorArrows = cloneArrows(pendingArrows);
        const fallbackState = {
            players: fallbackPlayers,
            ball: fallbackBall,
            viewBox: cloneViewBox(viewBox),
            lineLayers: [{ id: 'editor-lines', lines: cloneLines(lines), opacity: 1 }],
            arrowLayers: [{ id: 'editor-arrows', arrows: editorArrows, opacity: 1 }],
        };

        if (!isPlaybackPreview) {
            return {
                ...fallbackState,
                activeSegmentIndex: -1,
                focusFrameIndex: playbackTimeline.length > 0 ? playbackTimeline.length - 1 : -1,
                localProgress: 0,
            };
        }

        return resolveBoardStateAtTime(playbackTimeline, timelineSegments, playbackTime, fallbackState);
    }, [isPlaybackPreview, players, ball, viewBox, lines, playbackTimeline, timelineSegments, playbackTime, pendingArrows]);

    /* ── Playback loop ── */
    useEffect(() => {
        if (!isPlaying) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            return;
        }
        if (timeline.length < 2) return;
        lastTimeRef.current = performance.now();
        const tick = (now: number) => {
            const dt = now - lastTimeRef.current;
            lastTimeRef.current = now;
            let reachedEnd = false;
            setPlaybackTime((prev) => {
                const next = prev + dt * playbackSpeed;
                if (next >= totalDuration) {
                    reachedEnd = true;
                    return totalDuration;
                }
                return next;
            });
            if (reachedEnd) {
                setIsPlaying(false);
                rafRef.current = null;
                return;
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isPlaying, timeline, totalDuration, playbackSpeed]);

    /* ── Persistence ── */
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const timer = window.setTimeout(() => {
            savePersistedBoardState(storageKey, buildBoardStateSnapshot());
        }, 150);
        return () => window.clearTimeout(timer);
    }, [storageKey, buildBoardStateSnapshot]);

    useEffect(() => {
        saveSavedPresets(savedPresetsKey, savedPresets);
    }, [savedPresetsKey, savedPresets]);

    useEffect(() => {
        if (isWorkspaceLoading) return;

        const boardStateSnapshot = buildBoardStateSnapshot();
        const signature = buildWorkspaceSignature(boardStateSnapshot, savedPresets);
        if (signature === lastPersistedSignatureRef.current) {
            return;
        }

        if (!canSyncClubWorkspaceRef.current || storageMode !== 'club') {
            lastPersistedSignatureRef.current = signature;
            setLastSavedAt(Date.now());
            setStorageMessage('Guardado local activo en este dispositivo.');
            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(async () => {
            if (cancelled) return;

            setIsWorkspaceSaving(true);
            setStorageError(null);
            setStorageMessage('Guardando configuracion en el espacio del club...');

            try {
                const response = await fetch('/api/club-admin/pizarra', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        clubId,
                        sport: normalizedSport,
                        boardState: boardStateSnapshot,
                        savedPresets,
                    }),
                });
                const payload = await response.json() as PizarraWorkspaceResponse;

                if (!response.ok) {
                    throw new Error(payload.error || 'No se pudo guardar la pizarra del club');
                }

                if (cancelled) return;

                lastPersistedSignatureRef.current = signature;
                setLastSavedAt(Date.now());
                setStorageMode(payload.data?.storageMode === 'club' ? 'club' : 'local');
                setStorageMessage(
                    payload.data?.storageMode === 'club'
                        ? 'Configuracion del club guardada.'
                        : 'Guardado local activo en este dispositivo.'
                );
            } catch (error) {
                if (cancelled) return;

                const message = error instanceof Error ? error.message : 'No se pudo guardar la pizarra del club';
                setStorageError(message);
                setStorageMode('local');
                setStorageMessage(
                    message === 'Sin permisos para este club'
                        ? 'No tenes permisos para sincronizar con el club. Seguimos guardando localmente.'
                        : 'La sincronizacion del club fallo. Seguimos guardando localmente.'
                );
                canSyncClubWorkspaceRef.current = false;
            } finally {
                if (!cancelled) {
                    setIsWorkspaceSaving(false);
                }
            }
        }, 500);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [
        clubId,
        normalizedSport,
        savedPresets,
        storageMode,
        isWorkspaceLoading,
        buildBoardStateSnapshot,
    ]);

    /* ── Coordinate helpers ── */
    const svgToPercent = useCallback(
        (clientX: number, clientY: number) => {
            const svgEl = document.querySelector('.pizarra-canvas-svg') as SVGSVGElement | null;
            if (!svgEl) return { x: 0, y: 0 };
            const rect = svgEl.getBoundingClientRect();
            const displayViewBox = mapBaseViewBoxToDisplay(viewBox, boardOrientation);
            const scaleX = displayViewBox.w / rect.width;
            const scaleY = displayViewBox.h / rect.height;
            const displayX = displayViewBox.x + (clientX - rect.left) * scaleX;
            const displayY = displayViewBox.y + (clientY - rect.top) * scaleY;
            const { x: svgX, y: svgY } = mapDisplayPointToBase(displayX, displayY, boardOrientation);
            return {
                x: Math.max(0, Math.min(100, ((svgX - 50) / 700) * 100)),
                y: Math.max(0, Math.min(100, ((svgY - 50) / 1000) * 100)),
            };
        },
        [viewBox, boardOrientation]
    );

    const svgXYToSvgPercent = useCallback(
        (clientX: number, clientY: number) => {
            const svgEl = document.querySelector('.pizarra-canvas-svg') as SVGSVGElement | null;
            if (!svgEl) return { sx: 0, sy: 0 };
            const rect = svgEl.getBoundingClientRect();
            const displayViewBox = mapBaseViewBoxToDisplay(viewBox, boardOrientation);
            const scaleX = displayViewBox.w / rect.width;
            const scaleY = displayViewBox.h / rect.height;
            const displayX = displayViewBox.x + (clientX - rect.left) * scaleX;
            const displayY = displayViewBox.y + (clientY - rect.top) * scaleY;
            const { x, y } = mapDisplayPointToBase(displayX, displayY, boardOrientation);
            return { sx: x, sy: y };
        },
        [viewBox, boardOrientation]
    );

    /* ── Drawing ── */
    const handleSvgPointerDown = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (mode !== 'draw' || isPlaybackLocked) return;
            // Cede el evento al pan si se usa boton medio o shift
            if (e.button === 1 || e.button === 2 || e.shiftKey) return;
            const target = e.target as HTMLElement;
            if (target.closest('.pizarra-draggable')) return;
            const { x, y } = svgToPercent(e.clientX, e.clientY);
            const newLine: LinePath = { id: `line-${Date.now()}`, points: [{ x, y }], color: lineColor, width: lineWidth };
            setCurrentLine(newLine);
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        },
        [mode, isPlaybackLocked, svgToPercent, lineColor, lineWidth]
    );

    const handleSvgPointerMove = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (mode === 'draw' && currentLine && !isPlaybackLocked) {
                const { x, y } = svgToPercent(e.clientX, e.clientY);
                setCurrentLine((prev) => {
                    if (!prev) return null;
                    const last = prev.points[prev.points.length - 1];
                    const dist = Math.hypot(x - last.x, y - last.y);
                    if (dist < 1.5) return prev;
                    return { ...prev, points: [...prev.points, { x, y }] };
                });
            }
        },
        [mode, currentLine, isPlaybackLocked, svgToPercent]
    );

    const handleSvgPointerUp = useCallback(() => {
        if (currentLine && currentLine.points.length > 1) {
            setLines((prev) => [...prev, currentLine]);
        }
        setCurrentLine(null);
    }, [currentLine]);

    /* ── Pan ── */
    const startPan = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (isPlaybackLocked || draggingId || draggingBall) return;
            const isMiddleButton = e.button === 1;
            const isPrimaryButton = e.button === 0;
            const isShiftDrag = isPrimaryButton && e.shiftKey;
            const allowDefaultPan = isPrimaryButton && (mode === 'select' || mode === 'arrow');
            if (!isMiddleButton && !isShiftDrag && !allowDefaultPan) return;
            const target = e.target as HTMLElement;
            if (!isMiddleButton && !isShiftDrag && target.closest('.pizarra-draggable')) return;
            pushUndoSnapshot();
            const { sx, sy } = svgXYToSvgPercent(e.clientX, e.clientY);
            panStartRef.current = { x: sx, y: sy, vb: { ...viewBox } };
            setIsPanning(true);
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        },
        [mode, isPlaybackLocked, draggingId, draggingBall, pushUndoSnapshot, svgXYToSvgPercent, viewBox]
    );

    const doPan = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (!isPanning || !panStartRef.current) return;
            const { sx, sy } = svgXYToSvgPercent(e.clientX, e.clientY);
            const start = panStartRef.current;
            const dx = start.x - sx;
            const dy = start.y - sy;
            let nx = start.vb.x + dx;
            let ny = start.vb.y + dy;
            nx = Math.max(0, Math.min(800 - start.vb.w, nx));
            ny = Math.max(0, Math.min(1100 - start.vb.h, ny));
            setViewBox((prev) => (
                prev.x === nx && prev.y === ny && prev.w === start.vb.w && prev.h === start.vb.h
                    ? prev
                    : { ...start.vb, x: nx, y: ny }
            ));
        },
        [isPanning, svgXYToSvgPercent]
    );

    const endPan = useCallback(() => {
        setIsPanning(false);
        panStartRef.current = null;
    }, []);

    /* ── Edicion de fotograma: derivados ── */
    const editingFrameIndex = useMemo(() => {
        if (!editingFrameId) return -1;
        return timeline.findIndex((frame) => frame.id === editingFrameId);
    }, [editingFrameId, timeline]);

    const editingFrame = editingFrameIndex >= 0 ? timeline[editingFrameIndex] : null;
    const previousEditingFrame = editingFrameIndex > 0 ? timeline[editingFrameIndex - 1] : null;

    /* ── Drag players / ball ── */
    const capturePointerOnSvg = useCallback((event: React.PointerEvent<SVGGElement>) => {
        const svg = (event.currentTarget as SVGGElement).ownerSVGElement;
        if (svg) {
            try { svg.setPointerCapture(event.pointerId); } catch { /* noop */ }
        }
    }, []);

    const handlePlayerPointerDown = useCallback(
        (id: string, event: React.PointerEvent<SVGGElement>) => {
            if (isPlaybackLocked || mode === 'draw') return;
            if (event.button !== 0) return;
            pushUndoSnapshot();
            if (mode === 'arrow') {
                if (!players.some((p) => p.id === id)) return;
                const start = svgToPercent(event.clientX, event.clientY);
                const nextArrow: MovementArrow = {
                    id: `arrow-${Date.now()}`,
                    targetType: 'player',
                    targetId: id,
                    points: [start],
                    color: lineColor,
                    width: lineWidth,
                };
                arrowTargetRef.current = { type: 'player', id };
                currentArrowRef.current = nextArrow;
                setCurrentArrow(nextArrow);
                capturePointerOnSvg(event);
                return;
            }
            setDraggingId(id);
            capturePointerOnSvg(event);
        },
        [isPlaybackLocked, mode, players, pushUndoSnapshot, svgToPercent, lineColor, lineWidth, capturePointerOnSvg]
    );

    const handleBallPointerDown = useCallback(
        (event: React.PointerEvent<SVGGElement>) => {
            if (isPlaybackLocked || mode === 'draw') return;
            if (event.button !== 0) return;
            pushUndoSnapshot();
            if (mode === 'arrow') {
                const start = svgToPercent(event.clientX, event.clientY);
                const nextArrow: MovementArrow = {
                    id: `arrow-${Date.now()}`,
                    targetType: 'ball',
                    targetId: 'ball',
                    points: [start],
                    color: lineColor,
                    width: lineWidth,
                };
                arrowTargetRef.current = { type: 'ball', id: 'ball' };
                currentArrowRef.current = nextArrow;
                setCurrentArrow(nextArrow);
                capturePointerOnSvg(event);
                return;
            }
            setDraggingBall(true);
            capturePointerOnSvg(event);
        },
        [isPlaybackLocked, mode, pushUndoSnapshot, svgToPercent, lineColor, lineWidth, capturePointerOnSvg]
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (isPlaybackLocked) return;
            if (isPanning) {
                doPan(e);
                return;
            }
            if (mode === 'draw') {
                handleSvgPointerMove(e);
                return;
            }
            const { x, y } = svgToPercent(e.clientX, e.clientY);
            if (mode === 'arrow' && currentArrowRef.current) {
                const prev = currentArrowRef.current;
                const last = prev.points[prev.points.length - 1];
                const dist = Math.hypot(x - last.x, y - last.y);
                if (dist >= 1.2) {
                    const nextArrow = { ...prev, points: [...prev.points, { x, y }] };
                    currentArrowRef.current = nextArrow;
                    setCurrentArrow(nextArrow);
                }
                return;
            }
            if (draggingId) {
                setPlayers((prev) => {
                    let changed = false;
                    const next = prev.map((player) => {
                        if (player.id !== draggingId) return player;
                        if (player.x === x && player.y === y) return player;
                        changed = true;
                        return { ...player, x, y };
                    });
                    return changed ? next : prev;
                });
                setBall((prev) => (
                    prev.anchor?.playerId === draggingId
                        ? {
                            ...prev,
                            x: Math.max(0, Math.min(100, x + prev.anchor.offsetX)),
                            y: Math.max(0, Math.min(100, y + prev.anchor.offsetY)),
                        }
                        : prev
                ));
            }
            if (draggingBall) {
                setBall((prev) => {
                    if (prev.x === x && prev.y === y && !prev.anchor?.playerId) return prev;
                    if (!prev.anchor?.playerId) return { ...prev, x, y };

                    const anchorPlayer = players.find((player) => player.id === prev.anchor?.playerId);
                    if (!anchorPlayer) return { ...prev, x, y, anchor: null };

                    return {
                        ...prev,
                        x,
                        y,
                        anchor: {
                            ...prev.anchor,
                            offsetX: x - anchorPlayer.x,
                            offsetY: y - anchorPlayer.y,
                        },
                    };
                });
            }
        },
        [isPlaybackLocked, mode, draggingId, draggingBall, isPanning, players, svgToPercent, doPan, handleSvgPointerMove]
    );

    const handlePointerUp = useCallback(() => {
        const finishedArrow = currentArrowRef.current ?? currentArrow;
        if (finishedArrow && arrowTargetRef.current) {
            const target = arrowTargetRef.current;
            const points = finishedArrow.points;
            const last = points[points.length - 1];
            const first = points[0];
            const totalLen = points.slice(1).reduce((acc, p, idx) => acc + Math.hypot(p.x - points[idx].x, p.y - points[idx].y), 0);
            const isMeaningful = points.length >= 2 && last && totalLen >= 2 && Math.hypot(last.x - first.x, last.y - first.y) >= 2;
            if (isMeaningful) {
                if (target.type === 'player') {
                    setPlayers((prev) =>
                        prev.map((p) => (p.id === target.id ? { ...p, x: last.x, y: last.y } : p))
                    );
                    setBall((prev) => (
                        prev.anchor?.playerId === target.id
                            ? {
                                ...prev,
                                x: Math.max(0, Math.min(100, last.x + prev.anchor.offsetX)),
                                y: Math.max(0, Math.min(100, last.y + prev.anchor.offsetY)),
                            }
                            : prev
                    ));
                } else {
                    setBall((prev) => ({ ...prev, x: last.x, y: last.y, anchor: null }));
                }
                setPendingArrows((prev) => [
                    ...prev.filter((a) => !(a.targetType === target.type && a.targetId === target.id)),
                    finishedArrow,
                ]);
            }
            arrowTargetRef.current = null;
            currentArrowRef.current = null;
            setCurrentArrow(null);
        }
        setDraggingId(null);
        setDraggingBall(false);
        handleSvgPointerUp();
        endPan();
    }, [currentArrow, handleSvgPointerUp, endPan]);

    const handleCanvasPointerDown = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            handleSvgPointerDown(e);
            startPan(e);
        },
        [handleSvgPointerDown, startPan]
    );

    /* ── Wheel zoom (relativo al cursor) ── */
    const handleWheel = useCallback(
        (e: React.WheelEvent<SVGSVGElement>) => {
            e.preventDefault();
            if (isPlaybackLocked) return;
            if (!wheelUndoTimerRef.current) {
                pushUndoSnapshot();
            } else {
                window.clearTimeout(wheelUndoTimerRef.current);
            }
            wheelUndoTimerRef.current = window.setTimeout(() => {
                wheelUndoTimerRef.current = null;
            }, 350);
            const factor = e.deltaY > 0 ? 1.1 : 0.9;
            const { sx, sy } = svgXYToSvgPercent(e.clientX, e.clientY);
            setViewBox((prev) => {
                const nw = Math.min(Math.max(prev.w * factor, 200), 800);
                const nh = Math.min(Math.max(prev.h * factor, 200), 1100);
                const ratioX = nw / prev.w;
                const ratioY = nh / prev.h;
                let nx = sx - (sx - prev.x) * ratioX;
                let ny = sy - (sy - prev.y) * ratioY;
                nx = Math.max(0, Math.min(800 - nw, nx));
                ny = Math.max(0, Math.min(1100 - nh, ny));
                return { x: nx, y: ny, w: nw, h: nh };
            });
        },
        [isPlaybackLocked, pushUndoSnapshot, svgXYToSvgPercent]
    );

    /* ── Zoom controls ── */
    const zoomIn = useCallback(() => {
        if (isPlaybackLocked) return;
        pushUndoSnapshot();
        setViewBox((prev) => {
            const nw = prev.w * 0.85;
            const nh = prev.h * 0.85;
            return { x: prev.x + (prev.w - nw) / 2, y: prev.y + (prev.h - nh) / 2, w: nw, h: nh };
        });
    }, [isPlaybackLocked, pushUndoSnapshot]);

    const zoomOut = useCallback(() => {
        if (isPlaybackLocked) return;
        pushUndoSnapshot();
        setViewBox((prev) => {
            const nw = Math.min(prev.w * 1.15, 800);
            const nh = Math.min(prev.h * 1.15, 1100);
            let nx = prev.x - (nw - prev.w) / 2;
            let ny = prev.y - (nh - prev.h) / 2;
            nx = Math.max(0, Math.min(800 - nw, nx));
            ny = Math.max(0, Math.min(1100 - nh, ny));
            return { x: nx, y: ny, w: nw, h: nh };
        });
    }, [isPlaybackLocked, pushUndoSnapshot]);

    const resetZoom = useCallback(() => {
        if (isPlaybackLocked) return;
        pushUndoSnapshot();
        setViewBox(DEFAULT_VIEWBOX);
    }, [isPlaybackLocked, pushUndoSnapshot]);

    const applyZoomPreset = useCallback((preset: ViewBox) => {
        if (isPlaybackLocked) return;
        pushUndoSnapshot();
        setViewBox(preset);
    }, [isPlaybackLocked, pushUndoSnapshot]);

    const handleSetBoardOrientation = useCallback((orientation: BoardOrientation) => {
        if (isPlaybackLocked) return;
        if (boardOrientation === orientation) return;
        pushUndoSnapshot();
        setBoardOrientation(orientation);
    }, [isPlaybackLocked, boardOrientation, pushUndoSnapshot]);

    const handleToggleBoardOrientation = useCallback(() => {
        if (isPlaybackLocked) return;
        pushUndoSnapshot();
        setBoardOrientation((prev) => (prev === 'horizontal' ? 'vertical' : 'horizontal'));
    }, [isPlaybackLocked, pushUndoSnapshot]);

    const handleToggleNumbers = useCallback(() => {
        if (isPlaybackLocked) return;
        pushUndoSnapshot();
        setShowNumbers((value) => !value);
    }, [isPlaybackLocked, pushUndoSnapshot]);

    const handleSetEditMode = useCallback((nextMode: BoardMode) => {
        if (isPlaybackLocked) return;
        if (mode === nextMode) return;
        pushUndoSnapshot();
        setMode(nextMode);
    }, [isPlaybackLocked, mode, pushUndoSnapshot]);

    const handleSetLineColor = useCallback((color: string) => {
        if (lineColor === color) return;
        pushUndoSnapshot();
        setLineColor(color);
    }, [lineColor, pushUndoSnapshot]);

    const handleSetLineWidth = useCallback((width: number) => {
        if (lineWidth === width) return;
        pushUndoSnapshot();
        setLineWidth(width);
    }, [lineWidth, pushUndoSnapshot]);

    const handleSetPlaybackSpeed = useCallback((speed: number) => {
        if (playbackSpeed === speed) return;
        pushUndoSnapshot();
        setPlaybackSpeed(speed);
    }, [playbackSpeed, pushUndoSnapshot]);

    /* ── Actions ── */
    const handleReset = useCallback(() => {
        pushUndoSnapshot();
        applyBoardStateSnapshot(createDefaultBoardState(normalizedSport));
    }, [pushUndoSnapshot, applyBoardStateSnapshot, normalizedSport]);

    const handleAddPlayer = useCallback(() => {
        if (isPlaybackLocked) return;
        pushUndoSnapshot();
        const homePlayers = players.filter((player) => player.team !== 'away');
        const awayPlayers = players.filter((player) => player.team === 'away');
        const nextTeam = homePlayers.length <= awayPlayers.length ? 'home' : 'away';
        const teamPlayers = nextTeam === 'home' ? homePlayers : awayPlayers;
        const nextNum = teamPlayers.length > 0 ? Math.max(...teamPlayers.map((player) => player.number)) + 1 : 1;
        const columnOffsets = [-16, -8, 0, 8, 16];
        const nextIndex = teamPlayers.length;
        const x = Math.max(8, Math.min(92, 50 + columnOffsets[nextIndex % columnOffsets.length]));
        const yBase = nextTeam === 'home' ? 72 : 28;
        const rowOffset = Math.floor(nextIndex / columnOffsets.length) * 6;
        const y = nextTeam === 'home' ? yBase + rowOffset : yBase - rowOffset;

        setPlayers((prev) => [
            ...prev,
            {
                id: `${nextTeam === 'home' ? 'h' : 'a'}-${Date.now()}`,
                number: nextNum,
                x,
                y: Math.max(6, Math.min(94, y)),
                team: nextTeam,
            },
        ]);
    }, [players, isPlaybackLocked, pushUndoSnapshot]);

    const handleRemovePlayer = useCallback(() => {
        if (isPlaybackLocked) return;
        if (players.length === 0) return;
        pushUndoSnapshot();

        const homeCount = players.filter((player) => player.team !== 'away').length;
        const awayCount = players.filter((player) => player.team === 'away').length;
        const targetTeam = awayCount >= homeCount ? 'away' : 'home';
        let targetIndex = players.length - 1;

        for (let index = players.length - 1; index >= 0; index -= 1) {
            const playerTeam = players[index].team === 'away' ? 'away' : 'home';
            if (playerTeam === targetTeam) {
                targetIndex = index;
                break;
            }
        }

        const removedPlayerId = players[targetIndex]?.id;
        setPlayers((prev) => prev.filter((_, playerIndex) => playerIndex !== targetIndex));
        if (removedPlayerId) {
            setBall((prev) => (
                prev.anchor?.playerId === removedPlayerId
                    ? { ...prev, anchor: null }
                    : prev
            ));
        }
    }, [players, isPlaybackLocked, pushUndoSnapshot]);

    const handleClearLines = useCallback(() => {
        if (isPlaybackLocked) return;
        if (lines.length === 0) return;
        pushUndoSnapshot();
        setLines([]);
        setCurrentLine(null);
    }, [isPlaybackLocked, lines.length, pushUndoSnapshot]);

    const handleUndoLine = useCallback(() => {
        if (isPlaybackLocked) return;
        if (lines.length === 0) return;
        pushUndoSnapshot();
        setLines((prev) => prev.slice(0, -1));
    }, [isPlaybackLocked, lines.length, pushUndoSnapshot]);

    const handleToggleBall = useCallback(() => {
        if (isPlaybackLocked) return;
        pushUndoSnapshot();
        setBall((prev) => ({ ...prev, visible: !prev.visible }));
    }, [isPlaybackLocked, pushUndoSnapshot]);

    const ballAnchorPlayer = useMemo(
        () => ball.anchor?.playerId
            ? players.find((player) => player.id === ball.anchor?.playerId) ?? null
            : null,
        [ball.anchor?.playerId, players]
    );
    const ballAnchorLabel = ballAnchorPlayer ? `#${ballAnchorPlayer.number}` : null;
    const canAnchorBall = ball.visible && players.length > 0;

    const handleToggleBallAnchor = useCallback(() => {
        if (isPlaybackLocked || !ball.visible || players.length === 0) return;
        pushUndoSnapshot();

        if (ball.anchor?.playerId && players.some((player) => player.id === ball.anchor?.playerId)) {
            setBall((prev) => ({ ...prev, anchor: null }));
            return;
        }

        const closest = players.reduce((best, player) => {
            const distance = Math.hypot(ball.x - player.x, ball.y - player.y);
            if (!best || distance < best.distance) {
                return { player, distance };
            }
            return best;
        }, null as { player: PlayerChip; distance: number } | null);

        if (!closest) return;

        setBall((prev) => ({
            ...prev,
            visible: true,
            anchor: {
                playerId: closest.player.id,
                offsetX: prev.x - closest.player.x,
                offsetY: prev.y - closest.player.y,
            },
        }));
    }, [isPlaybackLocked, ball, players, pushUndoSnapshot]);

    /* ── Presets ── */
    const applyPreset = useCallback(
        (preset: RugbyPreset | SavedPreset) => {
            if (isPlaybackLocked) return;
            pushUndoSnapshot();

            if ('boardState' in preset) {
                applyBoardStateSnapshot(normalizePersistedBoardState(preset.boardState, normalizedSport));
                return;
            }

            const nextState = normalizePersistedBoardState({
                version: BOARD_STORAGE_VERSION,
                players: preset.players,
                lines: preset.lines,
                ball: preset.ball,
                viewBox: preset.viewBox,
                timeline: [],
                showNumbers: true,
                mode: 'select',
                orientation: getDefaultBoardOrientation(normalizedSport),
                lineColor: DEFAULT_LINE_COLOR,
                lineWidth: DEFAULT_LINE_WIDTH,
                playbackSpeed: DEFAULT_PLAYBACK_SPEED,
            }, normalizedSport);

            applyBoardStateSnapshot(nextState);
        },
        [isPlaybackLocked, pushUndoSnapshot, applyBoardStateSnapshot, normalizedSport]
    );

    /* ── Frames / Timeline ── */
    const createCurrentFrameSnapshot = useCallback((name: string, index: number, id = `frame-${Date.now()}`): TimelineFrame => ({
        id,
        name,
        players: clonePlayers(players),
        lines: cloneLines(lines),
        ball: cloneBall(ball),
        viewBox: cloneViewBox(viewBox),
        arrows: cloneArrows(pendingArrows),
        duration: 800,
        holdBefore: index === 0 ? 180 : 0,
        holdAfter: 120,
        easing: 'easeInOut' as const,
    }), [players, lines, ball, viewBox, pendingArrows]);

    const handleCaptureFrame = useCallback(() => {
        if (isPlaybackLocked) return;
        const nextIndex = timeline.length;
        const nextName = nextIndex === 0 ? 'Configuracion base' : `Frame ${nextIndex + 1}`;
        const nextFrame = createCurrentFrameSnapshot(nextName, nextIndex);
        setTimeline((prev) => [
            ...prev,
            nextFrame,
        ]);
        setPendingArrows([]);
        setFlashCapture(true);
        setTimeout(() => setFlashCapture(false), 350);
    }, [createCurrentFrameSnapshot, timeline.length, isPlaybackLocked]);

    const handlePlayPause = useCallback(() => {
        if (!hasPlaybackFrames) return;
        if (isPlaying) {
            setIsPlaying(false);
            return;
        }
        setPlaybackTime((prev) => (prev >= totalDuration ? 0 : prev));
        setIsPlaying(true);
    }, [hasPlaybackFrames, isPlaying, totalDuration]);

    const handleStop = useCallback(() => {
        setIsPlaying(false);
        setPlaybackTime(0);
        setUiMode('edit');
    }, []);

    const handleClearTimeline = useCallback(() => {
        setIsPlaying(false);
        setPlaybackTime(0);
        setEditingFrameId(null);
        setPendingArrows([]);
        currentArrowRef.current = null;
        setCurrentArrow(null);
        setCurrentLine(null);
        setUiMode('edit');

        const baseFrame = timeline[0];
        if (!baseFrame) {
            return;
        }
        pushUndoSnapshot();

        const nextBaseFrame = {
            ...baseFrame,
            players: clonePlayers(baseFrame.players),
            lines: cloneLines(baseFrame.lines),
            ball: cloneBall(baseFrame.ball),
            viewBox: cloneViewBox(baseFrame.viewBox),
            arrows: cloneArrows(baseFrame.arrows ?? []),
        };

        setTimeline([nextBaseFrame]);
        setPlayers(clonePlayers(nextBaseFrame.players));
        setLines(cloneLines(nextBaseFrame.lines));
        setBall(cloneBall(nextBaseFrame.ball));
        setViewBox(cloneViewBox(nextBaseFrame.viewBox));
    }, [timeline, pushUndoSnapshot]);

    const handleDeleteFrame = useCallback((frameId: string) => {
        const frameIndex = timeline.findIndex((frame) => frame.id === frameId);
        if (frameIndex <= 0) return;

        setTimeline((prev) => prev.filter((f) => f.id !== frameId));
        setEditingFrameId((prev) => (prev === frameId ? null : prev));
        if (editingFrameId === frameId) {
            setPendingArrows([]);
            currentArrowRef.current = null;
            setCurrentArrow(null);
        }
    }, [editingFrameId, timeline]);

    const handleDuplicateFrame = useCallback((frameId: string) => {
        setTimeline((prev) => {
            const idx = prev.findIndex((f) => f.id === frameId);
            if (idx < 0) return prev;
            const frame = prev[idx];
            const copy: TimelineFrame = {
                ...frame,
                id: `frame-${Date.now()}`,
                name: `${frame.name} (copia)`,
                players: clonePlayers(frame.players),
                lines: cloneLines(frame.lines),
                ball: cloneBall(frame.ball),
                viewBox: cloneViewBox(frame.viewBox),
                arrows: cloneArrows(frame.arrows ?? []),
            };
            const next = [...prev];
            next.splice(idx + 1, 0, copy);
            return next;
        });
    }, []);

    const handleCreateEditableCopyFromFrame = useCallback((frameId: string) => {
        const sourceFrame = editingFrameId === frameId
            ? {
                id: frameId,
                name: editingFrame?.name ?? 'Fotograma',
                players: clonePlayers(players),
                lines: cloneLines(lines),
                ball: cloneBall(ball),
                viewBox: cloneViewBox(viewBox),
                arrows: cloneArrows(pendingArrows),
                duration: editingFrame?.duration ?? 800,
                holdBefore: editingFrame?.holdBefore ?? 0,
                holdAfter: editingFrame?.holdAfter ?? 120,
                easing: editingFrame?.easing ?? 'easeInOut',
            } satisfies TimelineFrame
            : timeline.find((frame) => frame.id === frameId);
        if (!sourceFrame) return;
        pushUndoSnapshot();

        const copyId = `frame-${Date.now()}`;
        const copy: TimelineFrame = {
            ...sourceFrame,
            id: copyId,
            name: `${sourceFrame.name} editable`,
            players: clonePlayers(sourceFrame.players),
            lines: cloneLines(sourceFrame.lines),
            ball: cloneBall(sourceFrame.ball),
            viewBox: cloneViewBox(sourceFrame.viewBox),
            arrows: cloneArrows(sourceFrame.arrows ?? []),
            holdBefore: 0,
        };

        setIsPlaying(false);
        setPlaybackTime(0);
        setCurrentLine(null);
        currentArrowRef.current = null;
        setCurrentArrow(null);
        setTimeline((prev) => {
            const saved = editingFrameId
                ? prev.map((frame) => frame.id === editingFrameId
                    ? {
                        ...frame,
                        players: clonePlayers(players),
                        lines: cloneLines(lines),
                        ball: cloneBall(ball),
                        viewBox: cloneViewBox(viewBox),
                        arrows: cloneArrows(pendingArrows),
                    }
                    : frame)
                : prev;
            const idx = saved.findIndex((frame) => frame.id === frameId);
            if (idx < 0) return saved;
            const next = [...saved];
            next.splice(idx + 1, 0, copy);
            return next;
        });
        setPlayers(clonePlayers(copy.players));
        setLines(cloneLines(copy.lines));
        setBall(cloneBall(copy.ball));
        setViewBox(cloneViewBox(copy.viewBox));
        setPendingArrows(cloneArrows(copy.arrows ?? []));
        setEditingFrameId(copyId);
        setMode('select');
        setUiMode('animate');
    }, [editingFrameId, editingFrame, timeline, players, lines, ball, viewBox, pendingArrows, pushUndoSnapshot]);

    const handleMoveFrame = useCallback((frameId: string, direction: -1 | 1) => {
        setTimeline((prev) => {
            const idx = prev.findIndex((f) => f.id === frameId);
            if (idx < 0) return prev;
            const newIdx = idx + direction;
            if (idx === 0 || newIdx <= 0 || newIdx >= prev.length) return prev;
            const next = [...prev];
            [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
            return next;
        });
    }, []);

    const handleUpdateFrameDuration = useCallback((index: number, duration: number) => {
        setTimeline((prev) => {
            const next = [...prev];
            if (next[index]) next[index] = { ...next[index], duration: Math.max(100, duration) };
            return next;
        });
    }, []);

    const handleRenameFrame = useCallback((index: number, name: string) => {
        setTimeline((prev) => {
            const next = [...prev];
            if (next[index]) next[index] = { ...next[index], name };
            return next;
        });
    }, []);

    const handleScrub = useCallback((time: number) => {
        setPlaybackTime(time);
    }, []);

    /* ── Edicion de fotograma individual ── */
    const handleStartEditFrame = useCallback((frameId: string) => {
        pushUndoSnapshot();
        setIsPlaying(false);
        setPlaybackTime(0);
        setCurrentLine(null);
        currentArrowRef.current = null;
        setCurrentArrow(null);
        setTimeline((prev) => {
            const next = editingFrameId
                ? prev.map((f) => f.id === editingFrameId
                    ? { ...f, players: clonePlayers(players), lines: cloneLines(lines), ball: cloneBall(ball), viewBox: cloneViewBox(viewBox), arrows: cloneArrows(pendingArrows) }
                    : f)
                : prev;
            const frame = next.find((f) => f.id === frameId);
            if (frame) {
                setPlayers(clonePlayers(frame.players));
                setLines(cloneLines(frame.lines));
                setBall(cloneBall(frame.ball));
                setViewBox(cloneViewBox(frame.viewBox));
                setPendingArrows(cloneArrows(frame.arrows ?? []));
            }
            return next;
        });
        setEditingFrameId(frameId);
        setMode('select');
    }, [editingFrameId, players, lines, ball, viewBox, pendingArrows, pushUndoSnapshot]);

    const handleFinishEditFrame = useCallback(() => {
        if (!editingFrameId) return;
        setTimeline((prev) =>
            prev.map((frame) =>
                frame.id === editingFrameId
                    ? {
                        ...frame,
                        players: clonePlayers(players),
                        lines: cloneLines(lines),
                        ball: cloneBall(ball),
                        viewBox: cloneViewBox(viewBox),
                        arrows: cloneArrows(pendingArrows),
                    }
                    : frame
            )
        );
        setEditingFrameId(null);
        setPendingArrows([]);
        currentArrowRef.current = null;
        setCurrentArrow(null);
    }, [editingFrameId, players, lines, ball, viewBox, pendingArrows]);

    const handleCancelEditFrame = useCallback(() => {
        setEditingFrameId(null);
        setPendingArrows([]);
        currentArrowRef.current = null;
        setCurrentArrow(null);
        setCurrentLine(null);
    }, []);

    const handleClearArrowsForFrame = useCallback(() => {
        if (!editingFrameId) return;
        setPendingArrows([]);
    }, [editingFrameId]);

    const handleUndoArrow = useCallback(() => {
        setPendingArrows((prev) => prev.slice(0, -1));
    }, []);

    /* ── Sport labels ── */
    const sportLabel = getSportLabel(normalizedSport);
    const sportOrientation = getSportOrientation(normalizedSport);
    const isCanvasFirstMode = mobileCanvasFirst && isCompactMobile;
    const quickMobilePresets = useMemo(
        () => (
            normalizedSport === 'rugby'
                ? RUGBY_PRESETS.filter((preset) => ['scrum-center', 'line-mid-7', 'kickoff', 'exit-22'].includes(preset.id))
                : []
        ),
        [normalizedSport]
    );
    const mobileStatusLabel = isWorkspaceLoading
        ? 'Cargando'
        : isWorkspaceSaving
            ? 'Guardando'
            : storageError
                ? 'Modo local'
                : storageMode === 'club'
                    ? 'Guardado'
                    : 'Local';
    const mobileStatusMeta = storageError
        ? 'Sin sincronizacion de club'
        : storageMode === 'club'
            ? formatLastSavedLabel(lastSavedAt)
            : `${savedPresets.length} jugada${savedPresets.length === 1 ? '' : 's'}`;
    const orientationControls = (
        <div className="pizarra-config-panel">
            <div className="pizarra-config-row">
                <span>Orientacion</span>
                <div className="pizarra-orientation-switch">
                    <button
                        type="button"
                        className={`pizarra-orientation-btn ${boardOrientation === 'horizontal' ? 'active' : ''}`}
                        onClick={() => handleSetBoardOrientation('horizontal')}
                    >
                        Horizontal
                    </button>
                    <button
                        type="button"
                        className={`pizarra-orientation-btn ${boardOrientation === 'vertical' ? 'active' : ''}`}
                        onClick={() => handleSetBoardOrientation('vertical')}
                    >
                        Vertical
                    </button>
                </div>
            </div>
            {isCanvasFirstMode ? (
                <div className="pizarra-mobile-config-meta">
                    <p>Accede a jugadas guardadas y presets desde el dock inferior.</p>
                </div>
            ) : null}
        </div>
    );

    /* ── Render ── */
    if (isCanvasFirstMode) {
        return (
            <div className="pizarra-shell pizarra-shell-mobile" style={{ '--app-header-height': `${appHeaderHeight}px` } as CSSProperties}>
                <div className="pizarra-mobile-topbar">
                    {onBack ? (
                        <button type="button" className="pizarra-mobile-back" onClick={onBack}>
                            Volver
                        </button>
                    ) : (
                        <Link href={backHref} className="pizarra-mobile-back">
                            Volver
                        </Link>
                    )}

                    <div className="pizarra-mobile-title">
                        <strong>Pizarra</strong>
                        <small>{clubName || 'Club'} · {sportLabel}</small>
                    </div>

                    <div className="pizarra-mobile-sync" data-state={storageError ? 'error' : isWorkspaceSaving ? 'saving' : 'ok'}>
                        <span className="pizarra-mobile-sync-dot" />
                        <div>
                            <strong>{mobileStatusLabel}</strong>
                            <small>{mobileStatusMeta}</small>
                        </div>
                    </div>
                </div>

                <div className="pizarra-mobile-modebar">
                    <ModeSelector mode={uiMode} onChange={setUiMode} />
                    <div className="pizarra-orientation-switch pizarra-orientation-switch-mobile">
                        <button
                            type="button"
                            className={`pizarra-orientation-btn ${boardOrientation === 'horizontal' ? 'active' : ''}`}
                            onClick={() => handleSetBoardOrientation('horizontal')}
                            title="Horizontal"
                        >
                            H
                        </button>
                        <button
                            type="button"
                            className={`pizarra-orientation-btn ${boardOrientation === 'vertical' ? 'active' : ''}`}
                            onClick={() => handleSetBoardOrientation('vertical')}
                            title="Vertical"
                        >
                            V
                        </button>
                    </div>
                </div>

                {editingFrame ? (
                    <div className="pizarra-frame-edit-banner is-mobile">
                        <div className="pizarra-frame-edit-info">
                            <strong>Editando: {editingFrame.name}</strong>
                            <small>
                                {previousEditingFrame
                                    ? `Flechas desde "${previousEditingFrame.name}"`
                                    : 'Sin fotograma anterior'}
                                {pendingArrows.length > 0 ? ` · ${pendingArrows.length} flecha${pendingArrows.length === 1 ? '' : 's'}` : ''}
                            </small>
                        </div>
                        <div className="pizarra-frame-edit-actions">
                            <button type="button" className="pizarra-frame-edit-btn is-ghost" onClick={handleCancelEditFrame}>Cancelar</button>
                            <button type="button" className="pizarra-frame-edit-btn is-primary" onClick={handleFinishEditFrame}>Guardar</button>
                        </div>
                    </div>
                ) : null}

                {uiMode === 'edit' && quickMobilePresets.length > 0 ? (
                    <div className="pizarra-mobile-presets" aria-label="Presets rapidos">
                        {quickMobilePresets.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                className="pizarra-mobile-preset-chip"
                                onClick={() => applyPreset(preset)}
                                disabled={isPlaybackLocked}
                            >
                                <strong>{preset.name}</strong>
                                <span>{preset.category}</span>
                            </button>
                        ))}
                    </div>
                ) : null}

                <div className="pizarra-mobile-stage">
                    <PizarraCanvas
                        uiMode={uiMode}
                        editMode={mode}
                        isPlaying={isPlaying}
                        isPlaybackLocked={isPlaybackLocked}
                        players={resolvedPlaybackState.players}
                        ball={resolvedPlaybackState.ball}
                        lineLayers={resolvedPlaybackState.lineLayers}
                        arrowLayers={resolvedPlaybackState.arrowLayers}
                        currentLine={currentLine}
                        currentArrow={currentArrow}
                        viewBox={viewBox}
                        orientation={boardOrientation}
                        showNumbers={showNumbers}
                        homeColor={homeColor}
                        normalizedSport={normalizedSport}
                        onZoomIn={zoomIn}
                        onZoomOut={zoomOut}
                        onResetZoom={resetZoom}
                        onApplyZoomPreset={applyZoomPreset}
                        onToggleOrientation={handleToggleBoardOrientation}
                        onPlayerDragStart={handlePlayerPointerDown}
                        onBallDragStart={handleBallPointerDown}
                        onPointerDown={handleCanvasPointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onWheel={handleWheel}
                        draggingId={draggingId}
                        draggingBall={draggingBall}
                        isPanning={isPanning}
                    />
                </div>

                {uiMode === 'animate' ? (
                    <div className="pizarra-mobile-sheet pizarra-mobile-sheet-timeline">
                        <PizarraTimeline
                            frames={timeline}
                            totalDuration={totalDuration}
                            playbackTime={playbackTime}
                            isPlaying={isPlaying}
                            isPlaybackLocked={isPlaybackLocked}
                            homeColor={homeColor}
                            orientation={boardOrientation}
                            editingFrameId={editingFrameId}
                            onCaptureFrame={handleCaptureFrame}
                            onScrub={handleScrub}
                            onMoveFrame={handleMoveFrame}
                            onDuplicateFrame={handleDuplicateFrame}
                            onDeleteFrame={handleDeleteFrame}
                            onCreateEditableCopyFromFrame={handleCreateEditableCopyFromFrame}
                            onRenameFrame={handleRenameFrame}
                            onUpdateFrameDuration={handleUpdateFrameDuration}
                            onStartEditFrame={handleStartEditFrame}
                            onFinishEditFrame={handleFinishEditFrame}
                        />
                    </div>
                ) : null}

                {uiMode === 'config' ? (
                    <div className="pizarra-mobile-sheet pizarra-mobile-sheet-config">
                        {orientationControls}
                    </div>
                ) : null}

                <div className="pizarra-mobile-dock">
                    <PizarraToolbar
                        mobileCanvasFirst
                        uiMode={uiMode}
                        editMode={mode}
                        isPlaying={isPlaying}
                        isPlaybackLocked={isPlaybackLocked}
                        hasPlaybackFrames={hasPlaybackFrames}
                        canUndoBoard={undoDepth > 0}
                        showNumbers={showNumbers}
                        ballVisible={ball.visible}
                        ballAnchorLabel={ballAnchorLabel}
                        canAnchorBall={canAnchorBall}
                        lineColor={lineColor}
                        lineWidth={lineWidth}
                        playbackSpeed={playbackSpeed}
                        timelineLength={timeline.length}
                        linesCount={lines.length}
                        onSetEditMode={handleSetEditMode}
                        onUndoBoard={handleUndoBoardChange}
                        onToggleNumbers={handleToggleNumbers}
                        onToggleBall={handleToggleBall}
                        onToggleBallAnchor={handleToggleBallAnchor}
                        onAddPlayer={handleAddPlayer}
                        onRemovePlayer={handleRemovePlayer}
                        onReset={handleReset}
                        onSetLineColor={handleSetLineColor}
                        onSetLineWidth={handleSetLineWidth}
                        onUndoLine={handleUndoLine}
                        onClearLines={handleClearLines}
                        onPlayPause={handlePlayPause}
                        onStop={handleStop}
                        onCaptureFrame={handleCaptureFrame}
                        onClearTimeline={handleClearTimeline}
                        onSetPlaybackSpeed={handleSetPlaybackSpeed}
                        onOpenPresets={() => setPresetsOpen(true)}
                        onExportVideo={async () => {
                            if (totalDuration <= 0 || isPlaying || exportState.status !== 'idle') return;
                            try {
                                const renderFrame = async (time: number) => {
                                    flushSync(() => {
                                        setPlaybackTime(time);
                                    });
                                    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                                };
                                const blob = await exportVideo(
                                    totalDuration,
                                    playbackSpeed,
                                    15,
                                    (p) => setExportState(p),
                                    renderFrame,
                                    () => document.querySelector('.pizarra-canvas-svg') as SVGSVGElement | null
                                );
                                setExportState({ status: 'done', progress: 1, message: 'Descargando...' });
                                downloadBlob(blob, `jugada-${clubId}-${Date.now()}.webm`);
                                setTimeout(() => setExportState({ status: 'idle', progress: 0, message: '' }), 2000);
                            } catch (error) {
                                console.error('Export error:', error);
                                setExportState({ status: 'error', progress: 0, message: 'Error al exportar' });
                                setTimeout(() => setExportState({ status: 'idle', progress: 0, message: '' }), 3000);
                            } finally {
                                setPlaybackTime(0);
                            }
                        }}
                        isExporting={exportState.status === 'recording' || exportState.status === 'preparing' || exportState.status === 'finalizing'}
                    />
                </div>

                <PresetsDrawer
                    isOpen={presetsOpen}
                    onClose={() => setPresetsOpen(false)}
                    onSelect={applyPreset}
                    onSavePreset={handleSavePreset}
                    onDeletePreset={handleDeletePreset}
                    savedPresets={savedPresets}
                    storageMode={storageMode}
                    statusMessage={storageMessage}
                    disabled={isPlaybackLocked}
                />

                {flashCapture && <div className="pizarra-capture-flash" />}

                {exportState.status !== 'idle' && exportState.status !== 'done' && exportState.status !== 'error' && (
                    <div className="pizarra-export-overlay">
                        <div className="pizarra-export-panel">
                            <div className="pizarra-export-spinner" />
                            <span className="pizarra-export-message">{exportState.message}</span>
                            <div className="pizarra-export-track">
                                <div className="pizarra-export-fill" style={{ width: `${exportState.progress * 100}%` }} />
                            </div>
                        </div>
                    </div>
                )}

                {exportState.status === 'done' && (
                    <div className="pizarra-export-overlay">
                        <div className="pizarra-export-panel">
                            <span className="pizarra-export-message" style={{ color: 'var(--ca-success)' }}>Video exportado</span>
                        </div>
                    </div>
                )}

                {exportState.status === 'error' && (
                    <div className="pizarra-export-overlay">
                        <div className="pizarra-export-panel">
                            <span className="pizarra-export-message" style={{ color: 'var(--ca-danger)' }}>{exportState.message}</span>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="pizarra-shell" style={{ '--app-header-height': `${appHeaderHeight}px` } as CSSProperties}>
            {/* Top bar */}
            <div className="pizarra-topbar">
                <div className="pizarra-header-copy">
                    <div className="card-title">Pizarra tactica</div>
                    <h3>Campo de {sportLabel}</h3>
                    <p>{sportOrientation}</p>
                </div>
                <div className="pizarra-storage-card">
                    <span className={`pizarra-storage-pill ${storageMode === 'club' ? 'is-club' : 'is-local'}`}>
                        {storageMode === 'club' ? 'Espacio del club' : 'Guardado local'}
                    </span>
                    <strong>{savedPresets.length} jugada{savedPresets.length === 1 ? '' : 's'} guardada{savedPresets.length === 1 ? '' : 's'}</strong>
                    <small>
                        {isWorkspaceLoading
                            ? 'Cargando pizarra privada...'
                            : isWorkspaceSaving
                                ? 'Sincronizando cambios del club...'
                                : storageMessage}
                    </small>
                    <small>{formatLastSavedLabel(lastSavedAt)}</small>
                    {storageError ? <small className="pizarra-storage-error">{storageError}</small> : null}
                </div>
                <ModeSelector mode={uiMode} onChange={setUiMode} />
            </div>

            {editingFrame ? (
                <div className="pizarra-frame-edit-banner">
                    <div className="pizarra-frame-edit-info">
                        <strong>Editando: {editingFrame.name}</strong>
                        <small>
                            {previousEditingFrame
                                ? `Las flechas se anclan a la posicion en "${previousEditingFrame.name}".`
                                : 'No hay fotograma anterior; las flechas inician en la posicion actual.'}
                            {pendingArrows.length > 0 ? ` ${pendingArrows.length} flecha${pendingArrows.length === 1 ? '' : 's'} en este frame.` : ''}
                        </small>
                    </div>
                    <div className="pizarra-frame-edit-actions">
                        <button type="button" className="pizarra-frame-edit-btn" onClick={handleUndoArrow} disabled={pendingArrows.length === 0}>
                            Deshacer flecha
                        </button>
                        <button type="button" className="pizarra-frame-edit-btn" onClick={handleClearArrowsForFrame} disabled={pendingArrows.length === 0}>
                            Limpiar flechas
                        </button>
                        <button type="button" className="pizarra-frame-edit-btn is-ghost" onClick={handleCancelEditFrame}>
                            Cancelar
                        </button>
                        <button type="button" className="pizarra-frame-edit-btn is-primary" onClick={handleFinishEditFrame}>
                            Guardar fotograma
                        </button>
                    </div>
                </div>
            ) : null}

            {/* Workspace */}
            <div className="pizarra-workspace">
                {/* Toolbar lateral */}
                <div className="pizarra-toolbar-panel">
                    <PizarraToolbar
                        uiMode={uiMode}
                        editMode={mode}
                        isPlaying={isPlaying}
                        isPlaybackLocked={isPlaybackLocked}
                        hasPlaybackFrames={hasPlaybackFrames}
                        canUndoBoard={undoDepth > 0}
                        showNumbers={showNumbers}
                        ballVisible={ball.visible}
                        ballAnchorLabel={ballAnchorLabel}
                        canAnchorBall={canAnchorBall}
                        lineColor={lineColor}
                        lineWidth={lineWidth}
                        playbackSpeed={playbackSpeed}
                        timelineLength={timeline.length}
                        linesCount={lines.length}
                        onSetEditMode={handleSetEditMode}
                        onUndoBoard={handleUndoBoardChange}
                        onToggleNumbers={handleToggleNumbers}
                        onToggleBall={handleToggleBall}
                        onToggleBallAnchor={handleToggleBallAnchor}
                        onAddPlayer={handleAddPlayer}
                        onRemovePlayer={handleRemovePlayer}
                        onReset={handleReset}
                        onSetLineColor={handleSetLineColor}
                        onSetLineWidth={handleSetLineWidth}
                        onUndoLine={handleUndoLine}
                        onClearLines={handleClearLines}
                        onPlayPause={handlePlayPause}
                        onStop={handleStop}
                        onCaptureFrame={handleCaptureFrame}
                        onClearTimeline={handleClearTimeline}
                        onSetPlaybackSpeed={handleSetPlaybackSpeed}
                        onOpenPresets={() => setPresetsOpen(true)}
                        onExportVideo={async () => {
                            if (totalDuration <= 0 || isPlaying || exportState.status !== 'idle') return;
                            try {
                                const renderFrame = async (time: number) => {
                                    flushSync(() => {
                                        setPlaybackTime(time);
                                    });
                                    // Wait for paint
                                    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                                };
                                const blob = await exportVideo(
                                    totalDuration,
                                    playbackSpeed,
                                    15,
                                    (p) => setExportState(p),
                                    renderFrame,
                                    () => document.querySelector('.pizarra-canvas-svg') as SVGSVGElement | null
                                );
                                setExportState({ status: 'done', progress: 1, message: 'Descargando...' });
                                downloadBlob(blob, `jugada-${clubId}-${Date.now()}.webm`);
                                setTimeout(() => setExportState({ status: 'idle', progress: 0, message: '' }), 2000);
                            } catch (error) {
                                console.error('Export error:', error);
                                setExportState({ status: 'error', progress: 0, message: 'Error al exportar' });
                                setTimeout(() => setExportState({ status: 'idle', progress: 0, message: '' }), 3000);
                            } finally {
                                setPlaybackTime(0);
                            }
                        }}
                        isExporting={exportState.status === 'recording' || exportState.status === 'preparing' || exportState.status === 'finalizing'}
                    />
                </div>

                {/* Canvas */}
                <PizarraCanvas
                    uiMode={uiMode}
                    editMode={mode}
                    isPlaying={isPlaying}
                    isPlaybackLocked={isPlaybackLocked}
                    players={resolvedPlaybackState.players}
                    ball={resolvedPlaybackState.ball}
                    lineLayers={resolvedPlaybackState.lineLayers}
                    arrowLayers={resolvedPlaybackState.arrowLayers}
                    currentLine={currentLine}
                    currentArrow={currentArrow}
                    viewBox={viewBox}
                    orientation={boardOrientation}
                    showNumbers={showNumbers}
                    homeColor={homeColor}
                    normalizedSport={normalizedSport}
                    onZoomIn={zoomIn}
                    onZoomOut={zoomOut}
                    onResetZoom={resetZoom}
                    onApplyZoomPreset={applyZoomPreset}
                    onToggleOrientation={handleToggleBoardOrientation}
                    onPlayerDragStart={handlePlayerPointerDown}
                    onBallDragStart={handleBallPointerDown}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onWheel={handleWheel}
                    draggingId={draggingId}
                    draggingBall={draggingBall}
                    isPanning={isPanning}
                />
            </div>

            {/* Config panel — orientation siempre visible */}
            {orientationControls}

            {/* Timeline */}
            {uiMode === 'animate' && (
                <PizarraTimeline
                    frames={timeline}
                    totalDuration={totalDuration}
                    playbackTime={playbackTime}
                    isPlaying={isPlaying}
                    isPlaybackLocked={isPlaybackLocked}
                    homeColor={homeColor}
                    orientation={boardOrientation}
                    editingFrameId={editingFrameId}
                    onCaptureFrame={handleCaptureFrame}
                    onScrub={handleScrub}
                    onMoveFrame={handleMoveFrame}
                    onDuplicateFrame={handleDuplicateFrame}
                    onDeleteFrame={handleDeleteFrame}
                    onCreateEditableCopyFromFrame={handleCreateEditableCopyFromFrame}
                    onRenameFrame={handleRenameFrame}
                    onUpdateFrameDuration={handleUpdateFrameDuration}
                    onStartEditFrame={handleStartEditFrame}
                    onFinishEditFrame={handleFinishEditFrame}
                />
            )}

            {/* Presets drawer */}
            <PresetsDrawer
                isOpen={presetsOpen}
                onClose={() => setPresetsOpen(false)}
                onSelect={applyPreset}
                onSavePreset={handleSavePreset}
                onDeletePreset={handleDeletePreset}
                savedPresets={savedPresets}
                storageMode={storageMode}
                statusMessage={storageMessage}
                disabled={isPlaybackLocked}
            />

            {/* Capture flash */}
            {flashCapture && <div className="pizarra-capture-flash" />}

            {/* Video export overlay */}
            {exportState.status !== 'idle' && exportState.status !== 'done' && exportState.status !== 'error' && (
                <div className="pizarra-export-overlay">
                    <div className="pizarra-export-panel">
                        <div className="pizarra-export-spinner" />
                        <span className="pizarra-export-message">{exportState.message}</span>
                        <div className="pizarra-export-track">
                            <div className="pizarra-export-fill" style={{ width: `${exportState.progress * 100}%` }} />
                        </div>
                    </div>
                </div>
            )}

            {exportState.status === 'done' && (
                <div className="pizarra-export-overlay">
                    <div className="pizarra-export-panel">
                        <span className="pizarra-export-message" style={{ color: 'var(--ca-success)' }}>Video exportado</span>
                    </div>
                </div>
            )}

            {exportState.status === 'error' && (
                <div className="pizarra-export-overlay">
                    <div className="pizarra-export-panel">
                        <span className="pizarra-export-message" style={{ color: 'var(--ca-danger)' }}>{exportState.message}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
