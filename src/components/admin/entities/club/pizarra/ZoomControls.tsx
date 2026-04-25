'use client';

import { ZoomIn, ZoomOut, Maximize2, RotateCw } from 'lucide-react';
import type { ViewBox, BoardOrientation } from '@/lib/club-pizarra/types';
import { ZOOM_PRESETS, GENERAL_ZOOM_PRESETS } from '@/lib/club-pizarra/constants';
import { isSameViewBox } from '@/lib/club-pizarra/utils';

interface ZoomControlsProps {
    viewBox: ViewBox;
    orientation: BoardOrientation;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onReset: () => void;
    onPreset: (preset: ViewBox) => void;
    onToggleOrientation: () => void;
    isRugby: boolean;
    disabled?: boolean;
}

export function ZoomControls({ viewBox, orientation, onZoomIn, onZoomOut, onReset, onPreset, onToggleOrientation, isRugby, disabled }: ZoomControlsProps) {
    const presets = isRugby ? ZOOM_PRESETS : GENERAL_ZOOM_PRESETS;
    const activePresetId = presets.find((p) => isSameViewBox(p.viewBox, viewBox))?.id ?? null;

    return (
        <div className="pizarra-zoom-controls">
            <button type="button" className="pizarra-zoom-btn" onClick={onZoomOut} disabled={disabled} title="Alejar">
                <ZoomOut className="w-4 h-4" />
            </button>
            <button type="button" className="pizarra-zoom-btn" onClick={onZoomIn} disabled={disabled} title="Acercar">
                <ZoomIn className="w-4 h-4" />
            </button>
            <button type="button" className="pizarra-zoom-btn" onClick={onReset} disabled={disabled} title="Reset">
                <Maximize2 className="w-4 h-4" />
            </button>
            <button
                type="button"
                className="pizarra-zoom-btn"
                onClick={onToggleOrientation}
                disabled={disabled}
                title={orientation === 'horizontal' ? 'Vertical' : 'Horizontal'}
            >
                <RotateCw className="w-4 h-4" />
            </button>
            <div className="pizarra-zoom-presets-mini">
                {presets.slice(0, 4).map((p) => (
                    <button
                        key={p.id}
                        type="button"
                        className={`pizarra-zoom-preset-mini ${activePresetId === p.id ? 'active' : ''}`}
                        onClick={() => onPreset(p.viewBox)}
                        disabled={disabled}
                        title={p.label}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
