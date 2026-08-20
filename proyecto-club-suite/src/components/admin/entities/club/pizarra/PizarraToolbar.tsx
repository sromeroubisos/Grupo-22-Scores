'use client';

import {
    MousePointer2,
    Pencil,
    Shirt,
    Circle,
    Plus,
    Minus,
    RotateCcw,
    Play,
    Pause,
    Square,
    Camera,
    Trash2,
    Palette,
    Eraser,
    Minus as LineIcon,
    LayoutGrid,
    Video,
    MoveUpRight,
    Link2,
    Undo2,
} from 'lucide-react';
import type { PizarraUIMode, BoardMode } from '@/lib/club-pizarra/types';
import { DRAW_COLORS, PLAYBACK_SPEEDS } from '@/lib/club-pizarra/constants';

interface PizarraToolbarProps {
    mobileCanvasFirst?: boolean;
    uiMode: PizarraUIMode;
    editMode: BoardMode;
    isPlaying: boolean;
    isPlaybackLocked: boolean;
    hasPlaybackFrames: boolean;
    canUndoBoard: boolean;
    showNumbers: boolean;
    ballVisible: boolean;
    ballAnchorLabel: string | null;
    canAnchorBall: boolean;
    lineColor: string;
    lineWidth: number;
    playbackSpeed: number;
    timelineLength: number;
    linesCount: number;
    onSetEditMode: (mode: BoardMode) => void;
    onUndoBoard: () => void;
    onToggleNumbers: () => void;
    onToggleBall: () => void;
    onToggleBallAnchor: () => void;
    onAddPlayer: () => void;
    onRemovePlayer: () => void;
    onReset: () => void;
    onSetLineColor: (color: string) => void;
    onSetLineWidth: (width: number) => void;
    onUndoLine: () => void;
    onClearLines: () => void;
    onPlayPause: () => void;
    onStop: () => void;
    onCaptureFrame: () => void;
    onClearTimeline: () => void;
    onSetPlaybackSpeed: (speed: number) => void;
    onOpenPresets: () => void;
    onExportVideo?: () => void;
    isExporting?: boolean;
}

export function PizarraToolbar({
    mobileCanvasFirst = false,
    uiMode,
    editMode,
    isPlaying,
    isPlaybackLocked,
    hasPlaybackFrames,
    canUndoBoard,
    showNumbers,
    ballVisible,
    ballAnchorLabel,
    canAnchorBall,
    lineColor,
    lineWidth,
    playbackSpeed,
    timelineLength,
    linesCount,
    onSetEditMode,
    onUndoBoard,
    onToggleNumbers,
    onToggleBall,
    onToggleBallAnchor,
    onAddPlayer,
    onRemovePlayer,
    onReset,
    onSetLineColor,
    onSetLineWidth,
    onUndoLine,
    onClearLines,
    onPlayPause,
    onStop,
    onCaptureFrame,
    onClearTimeline,
    onSetPlaybackSpeed,
    onOpenPresets,
    onExportVideo,
    isExporting,
}: PizarraToolbarProps) {
    const isDrawing = editMode === 'draw';
    const isArrowing = editMode === 'arrow';
    const isMoving = editMode === 'select';

    return (
        <div className="pizarra-toolbar">
            {/* EDICION */}
            {uiMode === 'edit' && (
                <>
                    <div className="pizarra-toolbar-segment">
                        <button
                            type="button"
                            className={`pizarra-tool-btn ${isMoving ? 'active' : ''}`}
                            onClick={() => onSetEditMode('select')}
                            disabled={isPlaybackLocked}
                            title="Mover"
                        >
                            <MousePointer2 className="w-4 h-4" />
                            <span>Mover</span>
                        </button>
                        <button
                            type="button"
                            className={`pizarra-tool-btn ${isDrawing ? 'active' : ''}`}
                            onClick={() => onSetEditMode('draw')}
                            disabled={isPlaybackLocked}
                            title="Dibujar"
                        >
                            <Pencil className="w-4 h-4" />
                            <span>Dibujar</span>
                        </button>
                        <button
                            type="button"
                            className={`pizarra-tool-btn ${isArrowing ? 'active' : ''}`}
                            onClick={() => onSetEditMode('arrow')}
                            disabled={isPlaybackLocked}
                            title="Flecha de movimiento"
                        >
                            <MoveUpRight className="w-4 h-4" />
                            <span>Flecha</span>
                        </button>
                        <button
                            type="button"
                            className="pizarra-tool-btn"
                            onClick={onUndoBoard}
                            disabled={isPlaybackLocked || !canUndoBoard}
                            title="Deshacer movimiento o configuracion"
                        >
                            <Undo2 className="w-4 h-4" />
                            <span>Deshacer</span>
                        </button>
                        <div className="pizarra-toolbar-divider" />
                        <button
                            type="button"
                            className={`pizarra-tool-btn ${showNumbers ? 'active' : ''}`}
                            onClick={onToggleNumbers}
                            disabled={isPlaybackLocked}
                            title="Numeros"
                        >
                            <Shirt className="w-4 h-4" />
                            <span>#{showNumbers ? 'On' : 'Off'}</span>
                        </button>
                        <button
                            type="button"
                            className={`pizarra-tool-btn ${ballVisible ? 'active' : ''}`}
                            onClick={onToggleBall}
                            disabled={isPlaybackLocked}
                            title="Pelota"
                        >
                            <Circle className="w-4 h-4" />
                            <span>Pelota</span>
                        </button>
                        <button
                            type="button"
                            className={`pizarra-tool-btn ${ballAnchorLabel ? 'active' : ''}`}
                            onClick={onToggleBallAnchor}
                            disabled={isPlaybackLocked || !canAnchorBall}
                            title={ballAnchorLabel ? `Soltar pelota de jugador ${ballAnchorLabel}` : 'Anclar pelota al jugador mas cercano'}
                        >
                            <Link2 className="w-4 h-4" />
                            <span>{ballAnchorLabel ? `Anclada ${ballAnchorLabel}` : 'Anclar'}</span>
                        </button>
                        <div className="pizarra-toolbar-divider" />
                        <button type="button" className="pizarra-tool-btn" onClick={onAddPlayer} disabled={isPlaybackLocked} title="Agregar jugador">
                            <Plus className="w-4 h-4" />
                            {mobileCanvasFirst ? <span>Jugador</span> : null}
                        </button>
                        <button type="button" className="pizarra-tool-btn" onClick={onRemovePlayer} disabled={isPlaybackLocked} title="Quitar jugador">
                            <Minus className="w-4 h-4" />
                            {mobileCanvasFirst ? <span>Quitar</span> : null}
                        </button>
                        <button type="button" className="pizarra-tool-btn" onClick={onReset} title="Resetear">
                            <RotateCcw className="w-4 h-4" />
                            {mobileCanvasFirst ? <span>Reset</span> : null}
                        </button>
                    </div>

                    {/* Sub-toolbar dibujo */}
                    {isDrawing && (
                        <div className="pizarra-toolbar-draw-row">
                            <div className="pizarra-color-picker">
                                <Palette className="w-4 h-4" />
                                {DRAW_COLORS.map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        className={`pizarra-color-swatch ${lineColor === c ? 'active' : ''}`}
                                        style={{ background: c }}
                                        onClick={() => onSetLineColor(c)}
                                    />
                                ))}
                            </div>
                            <div className="pizarra-width-picker">
                                <LineIcon className="w-3 h-3" />
                                <input type="range" min={1} max={8} step={0.5} value={lineWidth} onChange={(e) => onSetLineWidth(Number(e.target.value))} />
                                <span>{lineWidth}px</span>
                            </div>
                            <button type="button" className="pizarra-tool-btn" onClick={onUndoLine} disabled={linesCount === 0}>
                                <Eraser className="w-4 h-4" />
                                <span>Deshacer</span>
                            </button>
                            <button type="button" className="pizarra-tool-btn" onClick={onClearLines} disabled={linesCount === 0}>
                                <Trash2 className="w-4 h-4" />
                                <span>Borrar</span>
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* ANIMACION */}
            {uiMode === 'animate' && (
                <div className="pizarra-toolbar-segment">
                    <button
                        type="button"
                        className={`pizarra-tool-btn ${isPlaying ? 'active' : ''}`}
                        onClick={onPlayPause}
                        disabled={!hasPlaybackFrames}
                    >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        <span>{isPlaying ? 'Pausa' : 'Play'}</span>
                    </button>
                    <button type="button" className="pizarra-tool-btn" onClick={onStop} disabled={!hasPlaybackFrames} title="Salir de la reproduccion">
                        <Square className="w-4 h-4" />
                        {mobileCanvasFirst ? <span>Salir</span> : null}
                    </button>
                    <div className="pizarra-toolbar-divider" />
                    <button
                        type="button"
                        className="pizarra-tool-btn pizarra-cta-btn"
                        onClick={onCaptureFrame}
                        disabled={isPlaybackLocked}
                    >
                        <Camera className="w-4 h-4" />
                        <span>Frame</span>
                    </button>
                    <div className="pizarra-toolbar-divider" />
                    <div className="pizarra-speed-picker">
                        {PLAYBACK_SPEEDS.map((s) => (
                            <button
                                key={s}
                                type="button"
                                className={`pizarra-speed-chip ${playbackSpeed === s ? 'active' : ''}`}
                                onClick={() => onSetPlaybackSpeed(s)}
                            >
                                {s}x
                            </button>
                        ))}
                    </div>
                    <div className="pizarra-toolbar-divider" />
                    <button type="button" className="pizarra-tool-btn" onClick={onClearTimeline} disabled={timelineLength === 0} title="Reiniciar fotogramas a la base">
                        <Trash2 className="w-4 h-4" />
                        <span>{mobileCanvasFirst ? 'Reiniciar' : timelineLength}</span>
                    </button>
                    {onExportVideo && (
                        <>
                            <div className="pizarra-toolbar-divider" />
                            <button
                                type="button"
                                className="pizarra-tool-btn"
                                onClick={onExportVideo}
                                disabled={!hasPlaybackFrames || isExporting}
                                title="Exportar video"
                            >
                                <Video className="w-4 h-4" />
                                <span>Video</span>
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* CONFIG */}
            {uiMode === 'config' && (
                <div className="pizarra-toolbar-segment">
                    <button type="button" className="pizarra-tool-btn" onClick={onOpenPresets}>
                        <LayoutGrid className="w-4 h-4" />
                        <span>Presets</span>
                    </button>
                </div>
            )}
        </div>
    );
}
