'use client';

import { useRef, useMemo, useEffect } from 'react';
import type {
    LinePath,
    MovementArrow,
    ViewBox,
    BoardOrientation,
    PizarraUIMode,
    BoardMode,
    ResolvedLineLayer,
    ResolvedArrowLayer,
    ResolvedPlayerState,
    ResolvedBallState,
} from '@/lib/club-pizarra/types';
import {
    FIELD_PAD,
    FIELD_W,
    FIELD_H,
    AWAY_TEAM_COLOR,
} from '@/lib/club-pizarra/constants';
import {
    mapBaseViewBoxToDisplay,
    getBoardTransform,
    getCanvasSize,
    pointsToSvgPath,
    vbToString,
} from '@/lib/club-pizarra/utils';
import { RugbyField } from './fields/RugbyField';
import { FootballField } from './fields/FootballField';
import { BasketballField } from './fields/BasketballField';
import { HockeyField } from './fields/HockeyField';
import { ZoomControls } from './ZoomControls';

interface PizarraCanvasProps {
    uiMode: PizarraUIMode;
    editMode: BoardMode;
    isPlaying: boolean;
    isPlaybackLocked: boolean;
    players: ResolvedPlayerState[];
    ball: ResolvedBallState;
    lineLayers: ResolvedLineLayer[];
    arrowLayers: ResolvedArrowLayer[];
    currentLine: LinePath | null;
    currentArrow: MovementArrow | null;
    viewBox: ViewBox;
    orientation: BoardOrientation;
    showNumbers: boolean;
    homeColor: string;
    normalizedSport: string;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetZoom: () => void;
    onApplyZoomPreset: (preset: ViewBox) => void;
    onToggleOrientation: () => void;
    onPlayerDragStart: (id: string, event: React.PointerEvent<SVGGElement>) => void;
    onBallDragStart: (event: React.PointerEvent<SVGGElement>) => void;
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
    onWheel: (e: React.WheelEvent<SVGSVGElement>) => void;
    draggingId: string | null;
    draggingBall: boolean;
    isPanning: boolean;
}

export function PizarraCanvas({
    editMode,
    isPlaying,
    isPlaybackLocked,
    players,
    ball,
    lineLayers,
    arrowLayers,
    currentLine,
    currentArrow,
    viewBox,
    orientation,
    showNumbers,
    homeColor,
    normalizedSport,
    onZoomIn,
    onZoomOut,
    onResetZoom,
    onApplyZoomPreset,
    onToggleOrientation,
    onPlayerDragStart,
    onBallDragStart,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    draggingId,
    draggingBall,
    isPanning,
}: PizarraCanvasProps) {
    const fieldWrapRef = useRef<HTMLDivElement>(null);

    const isDrawing = editMode === 'draw';
    const isArrowing = editMode === 'arrow';

    const canvasSize = getCanvasSize(orientation);
    const renderedViewBox = mapBaseViewBoxToDisplay(viewBox, orientation);

    const cursorClass = isPlaybackLocked
        ? 'default'
        : isPanning
            ? 'grabbing'
        : isDrawing
            ? 'crosshair'
            : isArrowing
                ? 'crosshair'
                : draggingId || draggingBall
                    ? 'grabbing'
                    : 'grab';

    const FieldComponent = useMemo(() => {
        switch (normalizedSport) {
            case 'football':
                return FootballField;
            case 'basketball':
                return BasketballField;
            case 'hockey':
                return HockeyField;
            default:
                return RugbyField;
        }
    }, [normalizedSport]);

    /* Prevent page scroll on wheel */
    useEffect(() => {
        const el = fieldWrapRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
        };
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
    }, []);

    return (
        <div
            className={`pizarra-canvas-wrap ${orientation === 'horizontal' ? 'is-horizontal' : 'is-vertical'}`}
            ref={fieldWrapRef}
            style={{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}` }}
        >
            <svg
                viewBox={vbToString(renderedViewBox)}
                className="pizarra-canvas-svg"
                preserveAspectRatio="xMidYMid meet"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onWheel={onWheel}
                style={{ touchAction: 'none', cursor: cursorClass }}
            >
                <g transform={getBoardTransform(orientation)}>
                    <FieldComponent />

                    {lineLayers.map((layer) => (
                        <g key={layer.id} opacity={layer.opacity}>
                            {layer.lines.map((line) => (
                                <path
                                    key={line.id}
                                    d={pointsToSvgPath(line.points, FIELD_W, FIELD_H, FIELD_PAD.x, FIELD_PAD.y)}
                                    fill="none"
                                    stroke={line.color}
                                    strokeWidth={line.width}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ pointerEvents: 'none' }}
                                />
                            ))}
                        </g>
                    ))}

                    {currentLine && (
                        <path
                            d={pointsToSvgPath(currentLine.points, FIELD_W, FIELD_H, FIELD_PAD.x, FIELD_PAD.y)}
                            fill="none"
                            stroke={currentLine.color}
                            strokeWidth={currentLine.width}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ pointerEvents: 'none' }}
                        />
                    )}

                    {arrowLayers.map((layer) => (
                        <g key={layer.id} opacity={layer.opacity} style={{ pointerEvents: 'none' }}>
                            {layer.arrows.map((arrow) => (
                                <ArrowShape key={arrow.id} arrow={arrow} />
                            ))}
                        </g>
                    ))}

                    {currentArrow && (
                        <g style={{ pointerEvents: 'none' }}>
                            <ArrowShape arrow={currentArrow} dashed />
                        </g>
                    )}

                    {players.map((player) => {
                        const px = FIELD_PAD.x + (player.x / 100) * FIELD_W;
                        const py = FIELD_PAD.y + (player.y / 100) * FIELD_H;
                        const isDragging = !isPlaying && draggingId === player.id;
                        const playerFill = player.team === 'away' ? AWAY_TEAM_COLOR : homeColor;
                        return (
                            <g
                                key={player.id}
                                className="pizarra-draggable"
                                transform={`translate(${px}, ${py})`}
                                onPointerDown={(e) => {
                                    if (e.button === 1 || (e.button === 0 && e.shiftKey)) return;
                                    e.stopPropagation();
                                    onPlayerDragStart(player.id, e);
                                }}
                                style={{
                                    cursor: isPlaybackLocked ? 'default' : isDrawing ? 'default' : isDragging ? 'grabbing' : 'grab',
                                    touchAction: 'none',
                                    opacity: player.opacity,
                                }}
                            >
                                <circle cx="0" cy="2" r="18" fill="rgba(0,0,0,0.18)" />
                                <circle
                                    cx="0"
                                    cy="0"
                                    r="18"
                                    fill={playerFill}
                                    stroke="#fff"
                                    strokeWidth="2.5"
                                    style={{ filter: isDragging ? 'brightness(1.3)' : 'none', transition: 'filter 0.15s ease' }}
                                />
                                {showNumbers && (
                                    <text
                                        x="0"
                                        y="1"
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        fill="#fff"
                                        fontSize="14"
                                        fontWeight="800"
                                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                                    >
                                        {player.number}
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    {ball.visible && (
                        <g
                            className="pizarra-draggable"
                            transform={`translate(${FIELD_PAD.x + (ball.x / 100) * FIELD_W}, ${FIELD_PAD.y + (ball.y / 100) * FIELD_H})`}
                            onPointerDown={(e) => {
                                if (e.button === 1 || (e.button === 0 && e.shiftKey)) return;
                                e.stopPropagation();
                                onBallDragStart(e);
                            }}
                            style={{
                                cursor: isPlaybackLocked ? 'default' : isDrawing ? 'default' : draggingBall ? 'grabbing' : 'grab',
                                touchAction: 'none',
                                opacity: ball.opacity,
                            }}
                        >
                            {ball.anchor?.playerId ? (
                                <ellipse cx="0" cy="0" rx="14" ry="10" fill="none" stroke="#facc15" strokeWidth="2" strokeDasharray="4 3" opacity="0.9" />
                            ) : null}
                            <ellipse cx="0" cy="3" rx="10" ry="7" fill="rgba(0,0,0,0.16)" />
                            <ellipse cx="0" cy="0" rx="10" ry="7" fill="#fff" stroke="#111" strokeWidth="1.5" />
                            <ellipse cx="0" cy="0" rx="10" ry="7" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
                            <line x1="-6" y1="-2" x2="6" y2="-2" stroke="#111" strokeWidth="0.8" opacity="0.4" />
                            <line x1="-6" y1="2" x2="6" y2="2" stroke="#111" strokeWidth="0.8" opacity="0.4" />
                        </g>
                    )}
                </g>
            </svg>

            <ZoomControls
                viewBox={viewBox}
                orientation={orientation}
                onZoomIn={onZoomIn}
                onZoomOut={onZoomOut}
                onReset={onResetZoom}
                onPreset={onApplyZoomPreset}
                onToggleOrientation={onToggleOrientation}
                isRugby={normalizedSport === 'rugby'}
                disabled={isPlaybackLocked}
            />
        </div>
    );
}

function ArrowShape({ arrow, dashed = false }: { arrow: MovementArrow; dashed?: boolean }) {
    const points = arrow.points;
    if (points.length < 2) return null;

    const toAbs = (p: { x: number; y: number }) => ({
        x: FIELD_PAD.x + (p.x / 100) * FIELD_W,
        y: FIELD_PAD.y + (p.y / 100) * FIELD_H,
    });

    const last = toAbs(points[points.length - 1]);
    let refIdx = points.length - 2;
    let prev = toAbs(points[refIdx]);
    while (refIdx > 0 && Math.hypot(last.x - prev.x, last.y - prev.y) < 6) {
        refIdx -= 1;
        prev = toAbs(points[refIdx]);
    }
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
    const headLen = Math.max(12, arrow.width * 4);
    const headHalf = Math.max(8, arrow.width * 2.6);
    const ax1 = last.x - headLen * Math.cos(angle) + headHalf * Math.sin(angle);
    const ay1 = last.y - headLen * Math.sin(angle) - headHalf * Math.cos(angle);
    const ax2 = last.x - headLen * Math.cos(angle) - headHalf * Math.sin(angle);
    const ay2 = last.y - headLen * Math.sin(angle) + headHalf * Math.cos(angle);

    return (
        <g>
            <path
                d={pointsToSvgPath(points, FIELD_W, FIELD_H, FIELD_PAD.x, FIELD_PAD.y)}
                fill="none"
                stroke={arrow.color}
                strokeWidth={arrow.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={dashed ? `${arrow.width * 3} ${arrow.width * 2}` : undefined}
            />
            <polygon
                points={`${last.x},${last.y} ${ax1},${ay1} ${ax2},${ay2}`}
                fill={arrow.color}
                stroke={arrow.color}
                strokeLinejoin="round"
                strokeWidth={Math.max(1, arrow.width * 0.4)}
            />
        </g>
    );
}
