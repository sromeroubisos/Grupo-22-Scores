'use client';

import { Camera } from 'lucide-react';

interface EmptyTimelineProps {
    onCapture: () => void;
    disabled?: boolean;
}

export function EmptyTimeline({ onCapture, disabled }: EmptyTimelineProps) {
    return (
        <div className="pizarra-empty-timeline">
            <div className="pizarra-empty-illustration">
                <div className="pizarra-empty-field">
                    <div className="pizarra-empty-line" />
                    <div className="pizarra-empty-line" />
                    <div className="pizarra-empty-dot" />
                </div>
            </div>
            <h4>Tu timeline esta vacio</h4>
            <p>Captura frames para crear una animacion de la jugada.</p>
            <button type="button" className="btn btn-primary pizarra-cta-btn" onClick={onCapture} disabled={disabled}>
                <Camera className="w-4 h-4" />
                Capturar tu primer movimiento
            </button>
        </div>
    );
}
