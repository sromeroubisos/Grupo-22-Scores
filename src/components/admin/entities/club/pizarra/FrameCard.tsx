'use client';

import { ChevronUp, ChevronDown, Copy, Trash2, Clock } from 'lucide-react';
import type { TimelineFrame, BoardOrientation } from '@/lib/club-pizarra/types';
import { FieldMiniPreview } from './FieldMiniPreview';

interface FrameCardProps {
    frame: TimelineFrame;
    index: number;
    isActive: boolean;
    isPlaybackLocked: boolean;
    homeColor: string;
    orientation: BoardOrientation;
    onMove: (direction: -1 | 1) => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onRename: (name: string) => void;
    onUpdateDuration: (duration: number) => void;
}

export function FrameCard({
    frame,
    index,
    isActive,
    isPlaybackLocked,
    homeColor,
    orientation,
    onMove,
    onDuplicate,
    onDelete,
    onRename,
    onUpdateDuration,
}: FrameCardProps) {
    return (
        <div className={`club-pizarra-frame-card ${isActive ? 'active' : ''}`}>
            <div className="club-pizarra-frame-order">
                <button type="button" className="club-pizarra-frame-arrow" onClick={() => onMove(-1)} disabled={index === 0 || isPlaybackLocked}>
                    <ChevronUp className="w-3 h-3" />
                </button>
                <div className="club-pizarra-frame-badge">{index + 1}</div>
                <button type="button" className="club-pizarra-frame-arrow" onClick={() => onMove(1)} disabled={isPlaybackLocked}>
                    <ChevronDown className="w-3 h-3" />
                </button>
            </div>
            <div className="club-pizarra-frame-body">
                <FieldMiniPreview frame={frame} isActive={isActive} homeColor={homeColor} orientation={orientation} />
                <input
                    className="club-pizarra-frame-name"
                    value={frame.name}
                    onChange={(e) => onRename(e.target.value)}
                    disabled={isPlaybackLocked}
                    placeholder="Nombre del frame"
                />
                <div className="club-pizarra-frame-row">
                    <label className="club-pizarra-frame-dur">
                        <Clock className="w-3 h-3" />
                        <input
                            type="number"
                            min={100}
                            max={10000}
                            step={100}
                            value={frame.duration}
                            onChange={(e) => onUpdateDuration(Number(e.target.value))}
                            disabled={isPlaybackLocked}
                        />
                        <span>ms</span>
                    </label>
                    <button type="button" className="club-pizarra-frame-action" onClick={onDuplicate} disabled={isPlaybackLocked} title="Duplicar">
                        <Copy className="w-3 h-3" />
                    </button>
                    <button type="button" className="club-pizarra-frame-action" onClick={onDelete} disabled={isPlaybackLocked} title="Borrar">
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </div>
    );
}
