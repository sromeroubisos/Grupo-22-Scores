'use client';

import { ChevronUp, ChevronDown, Copy, Trash2, Clock, Pencil, Check } from 'lucide-react';
import type { TimelineFrame, BoardOrientation } from '@/lib/club-pizarra/types';
import { FieldMiniPreview } from './FieldMiniPreview';

interface FrameCardProps {
    frame: TimelineFrame;
    index: number;
    isActive: boolean;
    isEditing: boolean;
    isPlaybackLocked: boolean;
    isBaseFrame: boolean;
    homeColor: string;
    orientation: BoardOrientation;
    onMove: (direction: -1 | 1) => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onCreateEditableCopy: () => void;
    onRename: (name: string) => void;
    onUpdateDuration: (duration: number) => void;
    onStartEdit: () => void;
    onFinishEdit: () => void;
}

export function FrameCard({
    frame,
    index,
    isActive,
    isEditing,
    isPlaybackLocked,
    isBaseFrame,
    homeColor,
    orientation,
    onMove,
    onDuplicate,
    onDelete,
    onCreateEditableCopy,
    onRename,
    onUpdateDuration,
    onStartEdit,
    onFinishEdit,
}: FrameCardProps) {
    const arrowsCount = frame.arrows?.length ?? 0;
    return (
        <div className={`club-pizarra-frame-card ${isActive ? 'active' : ''} ${isEditing ? 'editing' : ''}`}>
            <div className="club-pizarra-frame-order">
                <button type="button" className="club-pizarra-frame-arrow" onClick={() => onMove(-1)} disabled={index === 0 || isBaseFrame || isPlaybackLocked}>
                    <ChevronUp className="w-3 h-3" />
                </button>
                <div className="club-pizarra-frame-badge">{index + 1}</div>
                <button type="button" className="club-pizarra-frame-arrow" onClick={() => onMove(1)} disabled={isBaseFrame || isPlaybackLocked}>
                    <ChevronDown className="w-3 h-3" />
                </button>
            </div>
            <div className="club-pizarra-frame-body">
                <button
                    type="button"
                    className="club-pizarra-frame-thumb-btn"
                    onClick={isEditing ? onFinishEdit : onStartEdit}
                    disabled={isPlaybackLocked}
                    title={isEditing ? 'Guardar fotograma' : 'Editar fotograma'}
                >
                    <FieldMiniPreview frame={frame} isActive={isActive} homeColor={homeColor} orientation={orientation} />
                    {isEditing ? <span className="club-pizarra-frame-editing-badge">Editando</span> : null}
                    {!isEditing && isBaseFrame ? <span className="club-pizarra-frame-editing-badge">Base</span> : null}
                    {arrowsCount > 0 && !isEditing ? <span className="club-pizarra-frame-arrow-badge">{arrowsCount} flecha{arrowsCount === 1 ? '' : 's'}</span> : null}
                </button>
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
                    {isEditing ? (
                        <button
                            type="button"
                            className="club-pizarra-frame-action club-pizarra-frame-action-primary"
                            onClick={onFinishEdit}
                            title="Guardar fotograma"
                        >
                            <Check className="w-3 h-3" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="club-pizarra-frame-action"
                            onClick={onStartEdit}
                            disabled={isPlaybackLocked}
                            title="Editar fotograma"
                        >
                            <Pencil className="w-3 h-3" />
                        </button>
                    )}
                    <button
                        type="button"
                        className="club-pizarra-frame-action"
                        onClick={isBaseFrame ? onCreateEditableCopy : onDuplicate}
                        disabled={isPlaybackLocked}
                        title={isBaseFrame ? 'Editar una copia de la base' : 'Duplicar'}
                    >
                        <Copy className="w-3 h-3" />
                    </button>
                    <button type="button" className="club-pizarra-frame-action" onClick={onDelete} disabled={isBaseFrame || isPlaybackLocked} title={isBaseFrame ? 'La base no se borra' : 'Borrar'}>
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </div>
    );
}
