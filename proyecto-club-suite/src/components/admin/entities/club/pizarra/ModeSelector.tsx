'use client';

import { Pencil, Play, Settings2 } from 'lucide-react';
import type { PizarraUIMode } from '@/lib/club-pizarra/types';

interface ModeSelectorProps {
    mode: PizarraUIMode;
    onChange: (mode: PizarraUIMode) => void;
}

const MODES: { id: PizarraUIMode; label: string; icon: typeof Pencil; desc: string }[] = [
    { id: 'edit', label: 'Edicion', icon: Pencil, desc: 'Mover, dibujar, ajustar' },
    { id: 'animate', label: 'Animacion', icon: Play, desc: 'Timeline y playback' },
    { id: 'config', label: 'Config', icon: Settings2, desc: 'Presets y vista' },
];

export function ModeSelector({ mode, onChange }: ModeSelectorProps) {
    return (
        <div className="pizarra-mode-selector">
            {MODES.map((m) => {
                const isActive = mode === m.id;
                return (
                    <button
                        key={m.id}
                        type="button"
                        className={`pizarra-mode-btn ${isActive ? 'active' : ''}`}
                        onClick={() => onChange(m.id)}
                    >
                        <span className="pizarra-mode-icon">
                            <m.icon className="w-4 h-4" />
                        </span>
                        <span className="pizarra-mode-label">
                            <strong>{m.label}</strong>
                            <small>{m.desc}</small>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
