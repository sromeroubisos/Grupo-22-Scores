'use client';

import { useRef, useCallback } from 'react';
import { Clock } from 'lucide-react';
import type { TimelineFrame, BoardOrientation } from '@/lib/club-pizarra/types';
import { formatDurationLabel } from '@/lib/club-pizarra/utils';
import { FrameCard } from './FrameCard';
import { EmptyTimeline } from './EmptyTimeline';

interface PizarraTimelineProps {
    frames: TimelineFrame[];
    totalDuration: number;
    playbackTime: number;
    isPlaying: boolean;
    isPlaybackLocked: boolean;
    homeColor: string;
    orientation: BoardOrientation;
    onCaptureFrame: () => void;
    onScrub: (time: number) => void;
    onMoveFrame: (frameId: string, direction: -1 | 1) => void;
    onDuplicateFrame: (frameId: string) => void;
    onDeleteFrame: (frameId: string) => void;
    onRenameFrame: (index: number, name: string) => void;
    onUpdateFrameDuration: (index: number, duration: number) => void;
}

export function PizarraTimeline({
    frames,
    totalDuration,
    playbackTime,
    isPlaying,
    isPlaybackLocked,
    homeColor,
    orientation,
    onCaptureFrame,
    onScrub,
    onMoveFrame,
    onDuplicateFrame,
    onDeleteFrame,
    onRenameFrame,
    onUpdateFrameDuration,
}: PizarraTimelineProps) {
    const scrubRef = useRef<HTMLDivElement>(null);
    const isDraggingScrub = useRef(false);

    const progress = totalDuration > 0 ? Math.min((playbackTime / totalDuration) * 100, 100) : 0;

    const handleScrub = useCallback(
        (clientX: number) => {
            if (!scrubRef.current || totalDuration <= 0) return;
            const rect = scrubRef.current.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            onScrub(ratio * totalDuration);
        },
        [totalDuration, onScrub]
    );

    const handlePointerDown = (e: React.PointerEvent) => {
        isDraggingScrub.current = true;
        handleScrub(e.clientX);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isDraggingScrub.current) {
            handleScrub(e.clientX);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        isDraggingScrub.current = false;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    };

    if (frames.length === 0) {
        return (
            <div className="pizarra-timeline">
                <EmptyTimeline onCapture={onCaptureFrame} disabled={isPlaybackLocked} />
            </div>
        );
    }

    const focusFrameIndex = isPlaying
        ? Math.min(Math.floor((playbackTime / totalDuration) * frames.length), frames.length - 1)
        : frames.length - 1;

    return (
        <div className="pizarra-timeline">
            {/* Scrubber */}
            <div className="pizarra-scrubber-shell">
                <div className="pizarra-scrubber-label">
                    <Clock className="w-4 h-4" />
                    <span>
                        Timeline — {frames.length} keyframe{frames.length !== 1 ? 's' : ''} ({formatDurationLabel(totalDuration)})
                    </span>
                </div>
                <div
                    className="pizarra-scrubber-track"
                    ref={scrubRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                >
                    <div className="pizarra-scrubber-fill" style={{ width: `${progress}%` }} />
                    <div className="pizarra-playhead" style={{ left: `${progress}%` }} />
                </div>
                <span className="pizarra-scrubber-time">{formatDurationLabel(playbackTime)} / {formatDurationLabel(totalDuration)}</span>
            </div>

            {/* Frames grid */}
            <div className="pizarra-frames-grid">
                {frames.map((frame, idx) => (
                    <FrameCard
                        key={frame.id}
                        frame={frame}
                        index={idx}
                        isActive={idx === focusFrameIndex}
                        isPlaybackLocked={isPlaybackLocked}
                        homeColor={homeColor}
                        orientation={orientation}
                        onMove={(dir) => onMoveFrame(frame.id, dir)}
                        onDuplicate={() => onDuplicateFrame(frame.id)}
                        onDelete={() => onDeleteFrame(frame.id)}
                        onRename={(name) => onRenameFrame(idx, name)}
                        onUpdateDuration={(dur) => onUpdateFrameDuration(idx, dur)}
                    />
                ))}
            </div>
        </div>
    );
}
