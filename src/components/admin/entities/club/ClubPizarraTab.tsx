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
    cloneBall,
    cloneViewBox,
    cloneTimeline,
    buildTimelineSegments,
    resolveBoardStateAtTime,
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
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);

    /* ── Drag / Pan ── */
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [draggingBall, setDraggingBall] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef<{ x: number; y: number; vb: ViewBox } | null>(null);

    /* ── Flash feedback ── */
    const [flashCapture, setFlashCapture] = useState(false);

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

    const applyBoardStateSnapshot = useCallback((snapshot: PersistedBoardState) => {
        setIsPlaying(false);
        setPlaybackTime(0);
        setCurrentLine(null);
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

    const timelineSegments = useMemo(() => buildTimelineSegments(timeline), [timeline]);
    const totalDuration = useMemo(() => {
        if (timelineSegments.length === 0) return 0;
        return timelineSegments[timelineSegments.length - 1]?.segmentEnd ?? 0;
    }, [timelineSegments]);
    const hasPlaybackFrames = timeline.length >= 2;
    const isPlaybackPreview = hasPlaybackFrames && (isPlaying || playbackTime > 0);
    const isPlaybackLocked = hasPlaybackFrames && (isPlaying || playbackTime > 0);

    const resolvedPlaybackState = useMemo(() => {
        const fallbackPlayers = clonePlayers(players).map((p) => ({ ...p, opacity: 1 }));
        const fallbackBall = { ...ball, opacity: ball.visible ? 1 : 0 };
        const fallbackState = {
            players: fallbackPlayers,
            ball: fallbackBall,
            viewBox: cloneViewBox(viewBox),
            lineLayers: [{ id: 'editor-lines', lines: cloneLines(lines), opacity: 1 }],
        };

        if (!isPlaybackPreview) {
            return {
                ...fallbackState,
                activeSegmentIndex: -1,
                focusFrameIndex: timeline.length > 0 ? timeline.length - 1 : -1,
                localProgress: 0,
            };
        }

        return resolveBoardStateAtTime(timeline, timelineSegments, playbackTime, fallbackState);
    }, [isPlaybackPreview, players, ball, viewBox, lines, timeline, timelineSegments, playbackTime]);

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
            if (mode !== 'select' || isPlaybackLocked || draggingId || draggingBall) return;
            const target = e.target as HTMLElement;
            if (target.closest('.pizarra-draggable')) return;
            const { sx, sy } = svgXYToSvgPercent(e.clientX, e.clientY);
            panStartRef.current = { x: sx, y: sy, vb: { ...viewBox } };
            setIsPanning(true);
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        },
        [mode, isPlaybackLocked, draggingId, draggingBall, svgXYToSvgPercent, viewBox]
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

    /* ── Drag players / ball ── */
    const handlePlayerPointerDown = useCallback(
        (id: string) => {
            if (isPlaybackLocked || mode === 'draw') return;
            setDraggingId(id);
        },
        [isPlaybackLocked, mode]
    );

    const handleBallPointerDown = useCallback(() => {
        if (isPlaybackLocked || mode === 'draw') return;
        setDraggingBall(true);
    }, [isPlaybackLocked, mode]);

    const handlePointerMove = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (isPlaybackLocked) return;
            if (mode === 'draw') {
                handleSvgPointerMove(e);
                return;
            }
            const { x, y } = svgToPercent(e.clientX, e.clientY);
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
            }
            if (draggingBall) {
                setBall((prev) => (
                    prev.x === x && prev.y === y
                        ? prev
                        : { ...prev, x, y }
                ));
            }
            if (isPanning) doPan(e);
        },
        [isPlaybackLocked, mode, draggingId, draggingBall, isPanning, svgToPercent, doPan, handleSvgPointerMove]
    );

    const handlePointerUp = useCallback(() => {
        setDraggingId(null);
        setDraggingBall(false);
        handleSvgPointerUp();
        endPan();
    }, [handleSvgPointerUp, endPan]);

    const handleCanvasPointerDown = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            handleSvgPointerDown(e);
            startPan(e);
        },
        [handleSvgPointerDown, startPan]
    );

    /* ── Wheel zoom ── */
    const handleWheel = useCallback(
        (e: React.WheelEvent<SVGSVGElement>) => {
            e.preventDefault();
            if (isPlaybackLocked) return;
            const factor = e.deltaY > 0 ? 1.08 : 0.92;
            setViewBox((prev) => {
                const nw = Math.min(Math.max(prev.w * factor, 200), 800);
                const nh = Math.min(Math.max(prev.h * factor, 200), 1100);
                let nx = prev.x + (prev.w - nw) / 2;
                let ny = prev.y + (prev.h - nh) / 2;
                nx = Math.max(0, Math.min(800 - nw, nx));
                ny = Math.max(0, Math.min(1100 - nh, ny));
                return { x: nx, y: ny, w: nw, h: nh };
            });
        },
        [isPlaybackLocked]
    );

    /* ── Zoom controls ── */
    const zoomIn = useCallback(() => {
        if (isPlaybackLocked) return;
        setViewBox((prev) => {
            const nw = prev.w * 0.85;
            const nh = prev.h * 0.85;
            return { x: prev.x + (prev.w - nw) / 2, y: prev.y + (prev.h - nh) / 2, w: nw, h: nh };
        });
    }, [isPlaybackLocked]);

    const zoomOut = useCallback(() => {
        if (isPlaybackLocked) return;
        setViewBox((prev) => {
            const nw = Math.min(prev.w * 1.15, 800);
            const nh = Math.min(prev.h * 1.15, 1100);
            let nx = prev.x - (nw - prev.w) / 2;
            let ny = prev.y - (nh - prev.h) / 2;
            nx = Math.max(0, Math.min(800 - nw, nx));
            ny = Math.max(0, Math.min(1100 - nh, ny));
            return { x: nx, y: ny, w: nw, h: nh };
        });
    }, [isPlaybackLocked]);

    const resetZoom = useCallback(() => {
        if (isPlaybackLocked) return;
        setViewBox(DEFAULT_VIEWBOX);
    }, [isPlaybackLocked]);

    const applyZoomPreset = useCallback((preset: ViewBox) => {
        if (isPlaybackLocked) return;
        setViewBox(preset);
    }, [isPlaybackLocked]);

    /* ── Actions ── */
    const handleReset = useCallback(() => {
        applyBoardStateSnapshot(createDefaultBoardState(normalizedSport));
    }, [applyBoardStateSnapshot, normalizedSport]);

    const handleAddPlayer = useCallback(() => {
        if (isPlaybackLocked) return;
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
    }, [players, isPlaybackLocked]);

    const handleRemovePlayer = useCallback(() => {
        if (isPlaybackLocked) return;
        setPlayers((prev) => {
            if (prev.length === 0) return prev;

            const homeCount = prev.filter((player) => player.team !== 'away').length;
            const awayCount = prev.filter((player) => player.team === 'away').length;
            const targetTeam = awayCount >= homeCount ? 'away' : 'home';

            for (let index = prev.length - 1; index >= 0; index -= 1) {
                const player = prev[index];
                const playerTeam = player.team === 'away' ? 'away' : 'home';
                if (playerTeam === targetTeam) {
                    return prev.filter((_, playerIndex) => playerIndex !== index);
                }
            }

            return prev.slice(0, -1);
        });
    }, [isPlaybackLocked]);

    const handleClearLines = useCallback(() => {
        if (isPlaybackLocked) return;
        setLines([]);
        setCurrentLine(null);
    }, [isPlaybackLocked]);

    const handleUndoLine = useCallback(() => {
        if (isPlaybackLocked) return;
        setLines((prev) => prev.slice(0, -1));
    }, [isPlaybackLocked]);

    const handleToggleBall = useCallback(() => {
        if (isPlaybackLocked) return;
        setBall((prev) => ({ ...prev, visible: !prev.visible }));
    }, [isPlaybackLocked]);

    /* ── Presets ── */
    const applyPreset = useCallback(
        (preset: RugbyPreset | SavedPreset) => {
            if (isPlaybackLocked) return;

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
        [isPlaybackLocked, applyBoardStateSnapshot, normalizedSport]
    );

    /* ── Frames / Timeline ── */
    const handleCaptureFrame = useCallback(() => {
        if (isPlaybackLocked) return;
        const nextNum = timeline.length + 1;
        const transitionDefaults = { duration: 800, holdBefore: timeline.length === 0 ? 180 : 0, holdAfter: 120, easing: 'easeInOut' as const };
        setTimeline((prev) => [
            ...prev,
            {
                id: `frame-${Date.now()}`,
                name: `Frame ${nextNum}`,
                players: clonePlayers(players),
                lines: cloneLines(lines),
                ball: cloneBall(ball),
                viewBox: cloneViewBox(viewBox),
                ...transitionDefaults,
            },
        ]);
        setFlashCapture(true);
        setTimeout(() => setFlashCapture(false), 350);
    }, [players, lines, ball, viewBox, timeline.length, isPlaybackLocked]);

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
    }, []);

    const handleClearTimeline = useCallback(() => {
        setIsPlaying(false);
        setTimeline([]);
        setPlaybackTime(0);
    }, []);

    const handleDeleteFrame = useCallback((frameId: string) => {
        setTimeline((prev) => prev.filter((f) => f.id !== frameId));
    }, []);

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
            };
            const next = [...prev];
            next.splice(idx + 1, 0, copy);
            return next;
        });
    }, []);

    const handleMoveFrame = useCallback((frameId: string, direction: -1 | 1) => {
        setTimeline((prev) => {
            const idx = prev.findIndex((f) => f.id === frameId);
            if (idx < 0) return prev;
            const newIdx = idx + direction;
            if (newIdx < 0 || newIdx >= prev.length) return prev;
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
                        onClick={() => setBoardOrientation('horizontal')}
                    >
                        Horizontal
                    </button>
                    <button
                        type="button"
                        className={`pizarra-orientation-btn ${boardOrientation === 'vertical' ? 'active' : ''}`}
                        onClick={() => setBoardOrientation('vertical')}
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
                </div>

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
                        currentLine={currentLine}
                        viewBox={viewBox}
                        orientation={boardOrientation}
                        showNumbers={showNumbers}
                        homeColor={homeColor}
                        normalizedSport={normalizedSport}
                        onZoomIn={zoomIn}
                        onZoomOut={zoomOut}
                        onResetZoom={resetZoom}
                        onApplyZoomPreset={applyZoomPreset}
                        onToggleOrientation={() => setBoardOrientation((prev) => (prev === 'horizontal' ? 'vertical' : 'horizontal'))}
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
                            onCaptureFrame={handleCaptureFrame}
                            onScrub={handleScrub}
                            onMoveFrame={handleMoveFrame}
                            onDuplicateFrame={handleDuplicateFrame}
                            onDeleteFrame={handleDeleteFrame}
                            onRenameFrame={handleRenameFrame}
                            onUpdateFrameDuration={handleUpdateFrameDuration}
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
                        showNumbers={showNumbers}
                        ballVisible={ball.visible}
                        lineColor={lineColor}
                        lineWidth={lineWidth}
                        playbackSpeed={playbackSpeed}
                        timelineLength={timeline.length}
                        linesCount={lines.length}
                        onSetEditMode={setMode}
                        onToggleNumbers={() => setShowNumbers((v) => !v)}
                        onToggleBall={handleToggleBall}
                        onAddPlayer={handleAddPlayer}
                        onRemovePlayer={handleRemovePlayer}
                        onReset={handleReset}
                        onSetLineColor={setLineColor}
                        onSetLineWidth={setLineWidth}
                        onUndoLine={handleUndoLine}
                        onClearLines={handleClearLines}
                        onPlayPause={handlePlayPause}
                        onStop={handleStop}
                        onCaptureFrame={handleCaptureFrame}
                        onClearTimeline={handleClearTimeline}
                        onSetPlaybackSpeed={setPlaybackSpeed}
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
                            <span className="pizarra-export-message" style={{ color: '#22c55e' }}>Video exportado</span>
                        </div>
                    </div>
                )}

                {exportState.status === 'error' && (
                    <div className="pizarra-export-overlay">
                        <div className="pizarra-export-panel">
                            <span className="pizarra-export-message" style={{ color: '#ef4444' }}>{exportState.message}</span>
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
                        showNumbers={showNumbers}
                        ballVisible={ball.visible}
                        lineColor={lineColor}
                        lineWidth={lineWidth}
                        playbackSpeed={playbackSpeed}
                        timelineLength={timeline.length}
                        linesCount={lines.length}
                        onSetEditMode={setMode}
                        onToggleNumbers={() => setShowNumbers((v) => !v)}
                        onToggleBall={handleToggleBall}
                        onAddPlayer={handleAddPlayer}
                        onRemovePlayer={handleRemovePlayer}
                        onReset={handleReset}
                        onSetLineColor={setLineColor}
                        onSetLineWidth={setLineWidth}
                        onUndoLine={handleUndoLine}
                        onClearLines={handleClearLines}
                        onPlayPause={handlePlayPause}
                        onStop={handleStop}
                        onCaptureFrame={handleCaptureFrame}
                        onClearTimeline={handleClearTimeline}
                        onSetPlaybackSpeed={setPlaybackSpeed}
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
                    currentLine={currentLine}
                    viewBox={viewBox}
                    orientation={boardOrientation}
                    showNumbers={showNumbers}
                    homeColor={homeColor}
                    normalizedSport={normalizedSport}
                    onZoomIn={zoomIn}
                    onZoomOut={zoomOut}
                    onResetZoom={resetZoom}
                    onApplyZoomPreset={applyZoomPreset}
                    onToggleOrientation={() => setBoardOrientation((prev) => (prev === 'horizontal' ? 'vertical' : 'horizontal'))}
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

            {/* Config panel */}
            {uiMode === 'config' && orientationControls}

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
                    onCaptureFrame={handleCaptureFrame}
                    onScrub={handleScrub}
                    onMoveFrame={handleMoveFrame}
                    onDuplicateFrame={handleDuplicateFrame}
                    onDeleteFrame={handleDeleteFrame}
                    onRenameFrame={handleRenameFrame}
                    onUpdateFrameDuration={handleUpdateFrameDuration}
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
                        <span className="pizarra-export-message" style={{ color: '#22c55e' }}>Video exportado</span>
                    </div>
                </div>
            )}

            {exportState.status === 'error' && (
                <div className="pizarra-export-overlay">
                    <div className="pizarra-export-panel">
                        <span className="pizarra-export-message" style={{ color: '#ef4444' }}>{exportState.message}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
