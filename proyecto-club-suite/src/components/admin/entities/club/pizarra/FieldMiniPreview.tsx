'use client';

import type { TimelineFrame, BoardOrientation } from '@/lib/club-pizarra/types';
import { FRAME_THUMB, AWAY_TEAM_COLOR } from '@/lib/club-pizarra/constants';
import { pointsToSvgPath } from '@/lib/club-pizarra/utils';

interface FieldMiniPreviewProps {
    frame: TimelineFrame;
    isActive?: boolean;
    homeColor?: string;
    orientation?: BoardOrientation;
}

export function FieldMiniPreview({ frame, isActive, homeColor = '#3b82f6', orientation = 'vertical' }: FieldMiniPreviewProps) {
    const previewCanvas =
        orientation === 'horizontal'
            ? { width: FRAME_THUMB.svgHeight, height: FRAME_THUMB.svgWidth }
            : { width: FRAME_THUMB.svgWidth, height: FRAME_THUMB.svgHeight };

    return (
        <svg
            viewBox={`0 0 ${previewCanvas.width} ${previewCanvas.height}`}
            className={`club-pizarra-frame-thumb ${isActive ? 'active' : ''}`}
        >
            <rect x="0" y="0" width={previewCanvas.width} height={previewCanvas.height} rx="18" fill="#05070b" />
            <g transform={orientation === 'horizontal' ? `translate(0 ${FRAME_THUMB.svgWidth}) rotate(-90)` : undefined}>
                <rect
                    x={FRAME_THUMB.padX}
                    y={FRAME_THUMB.padY}
                    width={FRAME_THUMB.width}
                    height={FRAME_THUMB.height}
                    rx="14"
                    fill="#136a35"
                    stroke="rgba(255,255,255,0.24)"
                    strokeWidth="1.4"
                />
                <rect x={FRAME_THUMB.padX} y={FRAME_THUMB.padY} width={FRAME_THUMB.width} height="10" fill="#0f5d2f" />
                <rect x={FRAME_THUMB.padX} y={FRAME_THUMB.padY + FRAME_THUMB.height - 10} width={FRAME_THUMB.width} height="10" fill="#0f5d2f" />
                <line x1={FRAME_THUMB.padX} y1={FRAME_THUMB.padY + 30} x2={FRAME_THUMB.padX + FRAME_THUMB.width} y2={FRAME_THUMB.padY + 30} stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" strokeDasharray="3 3" />
                <line x1={FRAME_THUMB.padX} y1={FRAME_THUMB.padY + FRAME_THUMB.height - 30} x2={FRAME_THUMB.padX + FRAME_THUMB.width} y2={FRAME_THUMB.padY + FRAME_THUMB.height - 30} stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" strokeDasharray="3 3" />
                <line x1={FRAME_THUMB.padX} y1={FRAME_THUMB.padY + FRAME_THUMB.height / 2} x2={FRAME_THUMB.padX + FRAME_THUMB.width} y2={FRAME_THUMB.padY + FRAME_THUMB.height / 2} stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
                <circle cx={FRAME_THUMB.padX + FRAME_THUMB.width / 2} cy={FRAME_THUMB.padY + FRAME_THUMB.height / 2} r="7" fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth="1" />

                {frame.lines.map((line) => (
                    <path
                        key={line.id}
                        d={pointsToSvgPath(line.points, FRAME_THUMB.width, FRAME_THUMB.height, FRAME_THUMB.padX, FRAME_THUMB.padY)}
                        fill="none"
                        stroke={line.color}
                        strokeWidth={Math.max(1, line.width * 0.3)}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                ))}

                {frame.players.map((player) => {
                    const px = FRAME_THUMB.padX + (player.x / 100) * FRAME_THUMB.width;
                    const py = FRAME_THUMB.padY + (player.y / 100) * FRAME_THUMB.height;
                    const fill = player.team === 'away' ? AWAY_TEAM_COLOR : homeColor;
                    return (
                        <g key={player.id} transform={`translate(${px}, ${py})`}>
                            <circle cx="0" cy="0.75" r="4" fill="rgba(0,0,0,0.18)" />
                            <circle cx="0" cy="0" r="4" fill={fill} stroke="#fff" strokeWidth="0.9" />
                        </g>
                    );
                })}

                {frame.ball.visible ? (
                    <g transform={`translate(${FRAME_THUMB.padX + (frame.ball.x / 100) * FRAME_THUMB.width}, ${FRAME_THUMB.padY + (frame.ball.y / 100) * FRAME_THUMB.height})`}>
                        <ellipse cx="0" cy="0.75" rx="2.4" ry="1.8" fill="rgba(0,0,0,0.18)" />
                        <ellipse cx="0" cy="0" rx="2.4" ry="1.8" fill="#fff" stroke="#111" strokeWidth="0.5" />
                    </g>
                ) : null}
            </g>
        </svg>
    );
}
