import type {
    PlayerChip,
    LinePath,
    BallState,
    ViewBox,
    EasingPreset,
    MovementArrow,
    TimelineFrame,
    TimelineSegment,
    ResolvedPlayerState,
    ResolvedBallState,
    ResolvedLineLayer,
    ResolvedArrowLayer,
    ResolvedBoardState,
    BoardOrientation,
} from './types';
import {
    SVG_W,
    SVG_H,
    DEFAULT_VIEWBOX,
    DEFAULT_FORMATIONS,
} from './constants';

export function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

export function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

export function easeInOut(t: number) {
    return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

export function easeOut(t: number) {
    return 1 - (1 - t) ** 3;
}

export function rugbyBurst(t: number) {
    if (t < 0.18) return easeOut(t / 0.18) * 0.3;
    if (t < 0.82) return 0.3 + ((t - 0.18) / 0.64) * 0.55;
    return 0.85 + easeInOut((t - 0.82) / 0.18) * 0.15;
}

export function applyEasing(easing: EasingPreset, t: number) {
    const value = clamp(t, 0, 1);
    switch (easing) {
        case 'linear':
            return value;
        case 'easeOut':
            return easeOut(value);
        case 'rugbyBurst':
            return rugbyBurst(value);
        default:
            return easeInOut(value);
    }
}

export function getDefaultFrameTransition(index: number): Pick<TimelineFrame, 'duration' | 'holdBefore' | 'holdAfter' | 'easing'> {
    return {
        duration: 800,
        holdBefore: index === 0 ? 180 : 0,
        holdAfter: 120,
        easing: 'easeInOut',
    };
}

export function getDefaultBoardOrientation(sport: string): BoardOrientation {
    return sport === 'rugby' ? 'horizontal' : 'vertical';
}

export function getCanvasSize(orientation: BoardOrientation) {
    return orientation === 'horizontal'
        ? { width: SVG_H, height: SVG_W }
        : { width: SVG_W, height: SVG_H };
}

export function mapDisplayPointToBase(x: number, y: number, orientation: BoardOrientation) {
    if (orientation === 'horizontal') {
        return { x: SVG_W - y, y: x };
    }
    return { x, y };
}

export function mapBaseViewBoxToDisplay(viewBox: ViewBox, orientation: BoardOrientation): ViewBox {
    if (orientation === 'horizontal') {
        return {
            x: viewBox.y,
            y: SVG_W - viewBox.x - viewBox.w,
            w: viewBox.h,
            h: viewBox.w,
        };
    }
    return viewBox;
}

export function getBoardTransform(orientation: BoardOrientation) {
    return orientation === 'horizontal' ? `translate(0 ${SVG_W}) rotate(-90)` : undefined;
}

export function getOrientationLabel(orientation: BoardOrientation) {
    return orientation === 'horizontal' ? 'Horizontal' : 'Vertical';
}

export function normalizeSport(sport?: string | null): string {
    if (!sport) return 'rugby';
    const s = sport.toLowerCase().trim();
    if (s.includes('rugby')) return 'rugby';
    if (s.includes('foot') || s.includes('soccer')) return 'football';
    if (s.includes('basket')) return 'basketball';
    if (s.includes('hockey')) return 'hockey';
    return 'rugby';
}

function getFormationKey(sport: string) {
    const key = Object.keys(DEFAULT_FORMATIONS).find((k) => sport.includes(k)) || 'rugby';
    return key in DEFAULT_FORMATIONS ? key : 'rugby';
}

function getBaseFormationPlayers(sport: string): PlayerChip[] {
    const key = getFormationKey(sport);
    return (DEFAULT_FORMATIONS[key] || DEFAULT_FORMATIONS.rugby).map((player) => ({ ...player }));
}

function buildMirroredPlayerId(playerId: string, targetTeam: 'home' | 'away') {
    if (targetTeam === 'away') {
        if (playerId.startsWith('home-')) return `away-${playerId.slice(5)}`;
        if (playerId.startsWith('h')) return `a${playerId.slice(1)}`;
        return `away-${playerId}`;
    }

    if (playerId.startsWith('away-')) return `home-${playerId.slice(5)}`;
    if (playerId.startsWith('a')) return `h${playerId.slice(1)}`;
    return `home-${playerId}`;
}

function mirrorPlayers(players: PlayerChip[], targetTeam: 'home' | 'away'): PlayerChip[] {
    return players.map((player) => ({
        ...player,
        id: buildMirroredPlayerId(player.id, targetTeam),
        y: clamp(100 - player.y, 0, 100),
        team: targetTeam,
    }));
}

export function ensurePlayersHaveBothTeams(players: PlayerChip[], sport: string): PlayerChip[] {
    const normalizedPlayers = clonePlayers(players);
    const homePlayers = normalizedPlayers.filter((player) => player.team !== 'away');
    const awayPlayers = normalizedPlayers.filter((player) => player.team === 'away');

    if (homePlayers.length > 0 && awayPlayers.length > 0) {
        return normalizedPlayers;
    }

    if (homePlayers.length > 0) {
        return [...homePlayers, ...mirrorPlayers(homePlayers, 'away')];
    }

    if (awayPlayers.length > 0) {
        return [...mirrorPlayers(awayPlayers, 'home'), ...awayPlayers];
    }

    const basePlayers = getBaseFormationPlayers(sport);
    return [...basePlayers, ...mirrorPlayers(basePlayers, 'away')];
}

export function getInitialPlayers(sport: string): PlayerChip[] {
    return ensurePlayersHaveBothTeams(getBaseFormationPlayers(sport), sport);
}

export function getSportLabel(sport: string) {
    switch (sport) {
        case 'football':
            return 'futbol';
        case 'basketball':
            return 'basquet';
        case 'hockey':
            return 'hockey';
        default:
            return 'rugby';
    }
}

export function getSportOrientation(sport: string) {
    switch (sport) {
        case 'football':
            return 'Ataca de abajo hacia arriba, con zoom, paneo y animacion.';
        case 'basketball':
            return 'Media cancha vertical para dibujar sistemas y rotaciones.';
        case 'hockey':
            return 'Ordena lineas, presion y salidas sobre la cancha.';
        default:
            return 'Ataca de abajo hacia arriba y ordena jugadas por fases.';
    }
}

/* Cloners */
export function clonePlayers(list: PlayerChip[]): PlayerChip[] {
    return list.map((p) => ({ ...p }));
}

export function cloneLines(list: LinePath[]): LinePath[] {
    return list.map((l) => ({ ...l, points: l.points.map((p) => ({ ...p })) }));
}

export function cloneArrows(list: MovementArrow[]): MovementArrow[] {
    return list.map((a) => ({ ...a, points: a.points.map((p) => ({ ...p })) }));
}

export function cloneBall(b: BallState): BallState {
    return {
        ...b,
        anchor: b.anchor
            ? { ...b.anchor }
            : b.anchor ?? null,
    };
}

export function cloneViewBox(viewBox: ViewBox): ViewBox {
    return { ...viewBox };
}

export function cloneTimelineFrame(frame: TimelineFrame, index = 0): TimelineFrame {
    const defaults = getDefaultFrameTransition(index);
    return {
        ...frame,
        players: clonePlayers(frame.players),
        lines: cloneLines(frame.lines),
        ball: cloneBall(frame.ball),
        viewBox: cloneViewBox(frame.viewBox ?? DEFAULT_VIEWBOX),
        arrows: Array.isArray(frame.arrows) ? cloneArrows(frame.arrows) : [],
        duration: typeof frame.duration === 'number' && Number.isFinite(frame.duration) ? Math.max(100, frame.duration) : defaults.duration,
        holdBefore: typeof frame.holdBefore === 'number' && Number.isFinite(frame.holdBefore) ? Math.max(0, frame.holdBefore) : defaults.holdBefore,
        holdAfter: typeof frame.holdAfter === 'number' && Number.isFinite(frame.holdAfter) ? Math.max(0, frame.holdAfter) : defaults.holdAfter,
        easing: frame.easing ?? defaults.easing,
    };
}

export function cloneTimeline(list: TimelineFrame[]): TimelineFrame[] {
    return list.map((frame, index) => cloneTimelineFrame(frame, index));
}

export function areLineSetsEquivalent(a: LinePath[], b: LinePath[]) {
    if (a.length !== b.length) return false;
    return a.every((line, index) => {
        const other = b[index];
        if (!other) return false;
        if (line.id !== other.id || line.color !== other.color || line.width !== other.width || line.points.length !== other.points.length) {
            return false;
        }
        return line.points.every((point, pointIndex) => {
            const otherPoint = other.points[pointIndex];
            return !!otherPoint && point.x === otherPoint.x && point.y === otherPoint.y;
        });
    });
}

/* Timeline */
export function buildTimelineSegments(frames: TimelineFrame[]): TimelineSegment[] {
    if (frames.length < 2) return [];

    const segments: TimelineSegment[] = [];
    let cursor = 0;

    for (let i = 0; i < frames.length - 1; i++) {
        const fromFrame = cloneTimelineFrame(frames[i], i);
        const toFrame = cloneTimelineFrame(frames[i + 1], i + 1);
        const holdStart = cursor;
        const motionStart = holdStart + fromFrame.holdBefore;
        const motionEnd = motionStart + fromFrame.duration;
        const segmentEnd = motionEnd + fromFrame.holdAfter;

        segments.push({
            id: `${fromFrame.id}->${toFrame.id}`,
            fromFrame,
            toFrame,
            segmentIndex: i,
            holdStart,
            motionStart,
            motionEnd,
            segmentEnd,
            duration: fromFrame.duration,
            easing: fromFrame.easing,
        });

        cursor = segmentEnd;
    }

    return segments;
}

export function resolvePlayersBetweenFrames(fromPlayers: PlayerChip[], toPlayers: PlayerChip[], progress: number): ResolvedPlayerState[] {
    const fromMap = new Map(fromPlayers.map((player) => [player.id, player]));
    const toMap = new Map(toPlayers.map((player) => [player.id, player]));
    const ids = Array.from(new Set([...fromMap.keys(), ...toMap.keys()]));

    return ids
        .map((id) => {
            const from = fromMap.get(id);
            const to = toMap.get(id);

            if (from && to) {
                return {
                    ...to,
                    number: progress < 0.5 ? from.number : to.number,
                    team: progress < 0.5 ? from.team : to.team,
                    x: lerp(from.x, to.x, progress),
                    y: lerp(from.y, to.y, progress),
                    opacity: 1,
                };
            }

            if (from) {
                return {
                    ...from,
                    opacity: 1 - progress,
                };
            }

            if (to) {
                return {
                    ...to,
                    opacity: progress,
                };
            }

            return null;
        })
        .filter((player): player is ResolvedPlayerState => !!player && player.opacity > 0.01);
}

export function resolveBallBetweenFrames(fromBall: BallState, toBall: BallState, progress: number): ResolvedBallState {
    const fromVisible = fromBall.visible ? 1 : 0;
    const toVisible = toBall.visible ? 1 : 0;
    const opacity = lerp(fromVisible, toVisible, progress);

    return {
        x: lerp(fromBall.x, toBall.x, progress),
        y: lerp(fromBall.y, toBall.y, progress),
        visible: opacity > 0.01,
        opacity,
    };
}

export function resolveBallAnchorPosition<T extends { id: string; x: number; y: number }>(
    ball: BallState,
    players: T[]
): Pick<BallState, 'x' | 'y'> {
    const anchor = ball.anchor;
    if (!anchor?.playerId) {
        return { x: ball.x, y: ball.y };
    }

    const player = players.find((candidate) => candidate.id === anchor.playerId);
    if (!player) {
        return { x: ball.x, y: ball.y };
    }

    return {
        x: clamp(player.x + anchor.offsetX, 0, 100),
        y: clamp(player.y + anchor.offsetY, 0, 100),
    };
}

function resolveStaticBall(ball: BallState, players: Array<{ id: string; x: number; y: number }>): ResolvedBallState {
    const anchored = resolveBallAnchorPosition(ball, players);
    return {
        ...ball,
        ...anchored,
        opacity: ball.visible ? 1 : 0,
    };
}

function resolveTransitionBall(
    fromBall: BallState,
    toBall: BallState,
    fromPlayers: Array<{ id: string; x: number; y: number }>,
    currentPlayers: Array<{ id: string; x: number; y: number }>,
    progress: number
): ResolvedBallState {
    const fromVisible = fromBall.visible ? 1 : 0;
    const toVisible = toBall.visible ? 1 : 0;
    const opacity = lerp(fromVisible, toVisible, progress);
    const fromAnchor = fromBall.anchor;
    const toAnchor = toBall.anchor;
    const fromStart = resolveBallAnchorPosition(fromBall, fromPlayers);
    const target = resolveBallAnchorPosition(toBall, currentPlayers);

    if (fromAnchor?.playerId && toAnchor?.playerId && fromAnchor.playerId === toAnchor.playerId) {
        const player = currentPlayers.find((candidate) => candidate.id === toAnchor.playerId);
        if (player) {
            return {
                ...toBall,
                x: clamp(player.x + lerp(fromAnchor.offsetX, toAnchor.offsetX, progress), 0, 100),
                y: clamp(player.y + lerp(fromAnchor.offsetY, toAnchor.offsetY, progress), 0, 100),
                visible: opacity > 0.01,
                opacity,
                anchor: { ...toAnchor },
            };
        }
    }

    return {
        ...toBall,
        x: lerp(fromStart.x, target.x, progress),
        y: lerp(fromStart.y, target.y, progress),
        visible: opacity > 0.01,
        opacity,
        anchor: toAnchor ? { ...toAnchor } : null,
    };
}

export function samplePolylineAt(points: Array<{ x: number; y: number }>, t: number): { x: number; y: number } | null {
    if (!points || points.length === 0) return null;
    if (points.length === 1) return { x: points[0].x, y: points[0].y };
    const clamped = clamp(t, 0, 1);
    const segmentLengths: number[] = [];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        const len = Math.hypot(dx, dy);
        segmentLengths.push(len);
        total += len;
    }
    if (total === 0) return { x: points[0].x, y: points[0].y };
    const target = clamped * total;
    let acc = 0;
    for (let i = 0; i < segmentLengths.length; i += 1) {
        const segLen = segmentLengths[i];
        if (acc + segLen >= target) {
            const localT = segLen === 0 ? 0 : (target - acc) / segLen;
            const a = points[i];
            const b = points[i + 1];
            return { x: lerp(a.x, b.x, localT), y: lerp(a.y, b.y, localT) };
        }
        acc += segLen;
    }
    const last = points[points.length - 1];
    return { x: last.x, y: last.y };
}

export function resolveArrowLayers(toArrows: MovementArrow[] | undefined, progress: number): ResolvedArrowLayer[] {
    const arrows = Array.isArray(toArrows) ? toArrows : [];
    if (arrows.length === 0) {
        return [{ id: 'arrows-empty', arrows: [], opacity: 0 }];
    }
    return [{ id: 'arrows', arrows: cloneArrows(arrows), opacity: clamp(progress, 0, 1) }];
}

export function resolveLineLayers(fromLines: LinePath[], toLines: LinePath[], progress: number): ResolvedLineLayer[] {
    if (areLineSetsEquivalent(fromLines, toLines)) {
        return [{ id: 'stable', lines: cloneLines(toLines), opacity: 1 }];
    }

    const layers: ResolvedLineLayer[] = [];

    if (fromLines.length > 0 && progress < 0.999) {
        layers.push({
            id: 'from',
            lines: cloneLines(fromLines),
            opacity: 1 - progress,
        });
    }

    if (toLines.length > 0 && progress > 0.001) {
        layers.push({
            id: 'to',
            lines: cloneLines(toLines),
            opacity: progress,
        });
    }

    if (layers.length === 0) {
        return [{ id: 'empty', lines: [], opacity: 1 }];
    }

    return layers;
}

export function resolveBoardStateAtTime(
    frames: TimelineFrame[],
    segments: TimelineSegment[],
    playheadTime: number,
    fallbackState: Omit<ResolvedBoardState, 'activeSegmentIndex' | 'focusFrameIndex' | 'localProgress'>
): ResolvedBoardState {
    if (frames.length === 0 || segments.length === 0) {
        return {
            ...fallbackState,
            activeSegmentIndex: -1,
            focusFrameIndex: frames.length > 0 ? 0 : -1,
            localProgress: 0,
        };
    }

    const totalDuration = segments[segments.length - 1]?.segmentEnd ?? 0;
    const clampedTime = clamp(playheadTime, 0, totalDuration);
    const segment =
        segments.find((candidate) => clampedTime <= candidate.segmentEnd) ??
        segments[segments.length - 1];

    if (clampedTime <= segment.motionStart) {
        const staticPlayers = resolvePlayersBetweenFrames(segment.fromFrame.players, segment.fromFrame.players, 0);
        return {
            players: staticPlayers,
            ball: resolveStaticBall(segment.fromFrame.ball, staticPlayers),
            viewBox: cloneViewBox(segment.fromFrame.viewBox),
            lineLayers: [{ id: segment.fromFrame.id, lines: cloneLines(segment.fromFrame.lines), opacity: 1 }],
            arrowLayers: resolveArrowLayers(segment.fromFrame.arrows, 1),
            activeSegmentIndex: segment.segmentIndex,
            focusFrameIndex: segment.segmentIndex,
            localProgress: 0,
        };
    }

    if (clampedTime >= segment.motionEnd) {
        const staticPlayers = resolvePlayersBetweenFrames(segment.toFrame.players, segment.toFrame.players, 1);
        return {
            players: staticPlayers,
            ball: resolveStaticBall(segment.toFrame.ball, staticPlayers),
            viewBox: cloneViewBox(segment.toFrame.viewBox),
            lineLayers: [{ id: segment.toFrame.id, lines: cloneLines(segment.toFrame.lines), opacity: 1 }],
            arrowLayers: resolveArrowLayers(segment.toFrame.arrows, 1),
            activeSegmentIndex: segment.segmentIndex,
            focusFrameIndex: segment.segmentIndex + 1,
            localProgress: 1,
        };
    }

    const localProgress = clamp((clampedTime - segment.motionStart) / Math.max(segment.duration, 1), 0, 1);
    const eased = applyEasing(segment.easing, localProgress);

    const interpolatedPlayers = resolvePlayersBetweenFrames(segment.fromFrame.players, segment.toFrame.players, eased);

    const arrows = Array.isArray(segment.toFrame.arrows) ? segment.toFrame.arrows : [];
    const playerArrowMap = new Map<string, MovementArrow>();
    let ballArrow: MovementArrow | undefined;
    for (const arrow of arrows) {
        if (arrow.targetType === 'player') {
            playerArrowMap.set(arrow.targetId, arrow);
        } else if (arrow.targetType === 'ball') {
            ballArrow = arrow;
        }
    }

    const toPlayerMap = new Map(segment.toFrame.players.map((player) => [player.id, player]));
    const exactPlayerArrowIds = new Set(
        arrows
            .filter((arrow) => arrow.targetType === 'player' && toPlayerMap.has(arrow.targetId))
            .map((arrow) => arrow.id)
    );
    const fallbackPlayerArrowIds = new Set<string>();
    const findPlayerArrowByEndpoint = (playerId: string) => {
        const toPlayer = toPlayerMap.get(playerId);
        if (!toPlayer) return undefined;

        let bestArrow: MovementArrow | undefined;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const arrow of arrows) {
            if (arrow.targetType !== 'player' || exactPlayerArrowIds.has(arrow.id) || fallbackPlayerArrowIds.has(arrow.id)) {
                continue;
            }
            const last = arrow.points[arrow.points.length - 1];
            if (!last) continue;
            const distance = Math.hypot(last.x - toPlayer.x, last.y - toPlayer.y);
            if (distance < bestDistance) {
                bestArrow = arrow;
                bestDistance = distance;
            }
        }

        if (bestArrow && bestDistance <= 2) {
            fallbackPlayerArrowIds.add(bestArrow.id);
            return bestArrow;
        }

        return undefined;
    };

    const followedPlayers = playerArrowMap.size === 0
        ? interpolatedPlayers
        : interpolatedPlayers.map((player) => {
            const arrow = playerArrowMap.get(player.id) ?? findPlayerArrowByEndpoint(player.id);
            if (!arrow) return player;
            const sample = samplePolylineAt(arrow.points, eased);
            return sample ? { ...player, x: sample.x, y: sample.y } : player;
        });

    const fromStaticPlayers = resolvePlayersBetweenFrames(segment.fromFrame.players, segment.fromFrame.players, 0);
    const transitionedBall = resolveTransitionBall(
        segment.fromFrame.ball,
        segment.toFrame.ball,
        fromStaticPlayers,
        followedPlayers,
        eased
    );

    const followedBall = ballArrow
        ? (() => {
            const sample = samplePolylineAt(ballArrow.points, eased);
            return sample ? { ...transitionedBall, x: sample.x, y: sample.y } : transitionedBall;
        })()
        : transitionedBall;

    return {
        players: followedPlayers,
        ball: followedBall,
        viewBox: {
            x: lerp(segment.fromFrame.viewBox.x, segment.toFrame.viewBox.x, eased),
            y: lerp(segment.fromFrame.viewBox.y, segment.toFrame.viewBox.y, eased),
            w: lerp(segment.fromFrame.viewBox.w, segment.toFrame.viewBox.w, eased),
            h: lerp(segment.fromFrame.viewBox.h, segment.toFrame.viewBox.h, eased),
        },
        lineLayers: resolveLineLayers(segment.fromFrame.lines, segment.toFrame.lines, eased),
        arrowLayers: resolveArrowLayers(segment.toFrame.arrows, eased),
        activeSegmentIndex: segment.segmentIndex,
        focusFrameIndex: eased < 0.5 ? segment.segmentIndex : segment.segmentIndex + 1,
        localProgress: eased,
    };
}

/* Formatting / SVG helpers */
export function isSameViewBox(a: ViewBox, b: ViewBox) {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function formatDurationLabel(duration: number) {
    if (duration <= 0) return '0 ms';
    if (duration < 1000) return `${Math.round(duration)} ms`;
    return `${(duration / 1000).toFixed(1)} s`;
}

export function pointsToSvgPath(
    points: Array<{ x: number; y: number }>,
    fieldW: number,
    fieldH: number,
    padX: number,
    padY: number
): string {
    if (points.length === 0) return '';
    const toAbs = (p: { x: number; y: number }) => ({
        x: padX + (p.x / 100) * fieldW,
        y: padY + (p.y / 100) * fieldH,
    });
    let d = `M ${toAbs(points[0]).x} ${toAbs(points[0]).y}`;
    for (let i = 1; i < points.length; i++) {
        const a = toAbs(points[i]);
        d += ` L ${a.x} ${a.y}`;
    }
    return d;
}

export function vbToString(vb: ViewBox) {
    return `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
}
