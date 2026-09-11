'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { EXPORT_PALETTES } from '@/lib/exports/exportPalettes';
import type { RivalExportColors, RivalHeadToHeadData } from './rivalHeadToHeadExport';
import styles from './page.module.css';

// La paleta G22 Dark es la de siempre del mano a mano. Se deriva de la lista
// compartida, igual que en el renderer, sin cargar el motor de dibujo.
export const DEFAULT_RIVAL_EXPORT_COLORS: RivalExportColors = {
    bg: EXPORT_PALETTES[0].bg,
    accent: EXPORT_PALETTES[0].accent,
};

// Ranking Navy se pensó para el afiche del ranking (sus puntos dorados no
// existen en el mano a mano): acá quedaría como un azul sobre azul sin gracia.
const PALETTES = EXPORT_PALETTES.filter((palette) => palette.id !== 'ranking-navy');

const STORAGE_KEY = 'g22:rival-export-colors';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const PREVIEW_DELAY_MS = 120;

function sameColors(a: RivalExportColors, b: RivalExportColors): boolean {
    return a.bg.toLowerCase() === b.bg.toLowerCase() && a.accent.toLowerCase() === b.accent.toLowerCase();
}

/**
 * Los colores del mano a mano para quien gestiona: se recuerdan en el
 * dispositivo, así el club que exporta con sus colores no los elige cada vez.
 * Sin permiso (`enabled` en falso) quedan siempre en G22 Dark.
 */
export function useRivalExportColors(enabled: boolean): [RivalExportColors, (next: RivalExportColors) => void] {
    const [colors, setColors] = useState<RivalExportColors>(DEFAULT_RIVAL_EXPORT_COLORS);

    useEffect(() => {
        if (!enabled) {
            setColors(DEFAULT_RIVAL_EXPORT_COLORS);
            return;
        }
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Partial<RivalExportColors> | null;
            if (typeof parsed?.bg === 'string' && HEX_COLOR.test(parsed.bg) && typeof parsed.accent === 'string' && HEX_COLOR.test(parsed.accent)) {
                setColors({ bg: parsed.bg.toLowerCase(), accent: parsed.accent.toLowerCase() });
            }
        } catch {
            // Sin acceso a localStorage (modo privado, cuota): se usa G22 Dark.
        }
    }, [enabled]);

    const update = useCallback((next: RivalExportColors) => {
        setColors(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            // Sin acceso a localStorage: la elección vale mientras la página siga abierta.
        }
    }, []);

    return [colors, update];
}

type RivalExportColorPanelProps = {
    id: string;
    data: RivalHeadToHeadData;
    colors: RivalExportColors;
    onChange: (next: RivalExportColors) => void;
};

export default function RivalExportColorPanel({ id, data, colors, onChange }: RivalExportColorPanelProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const paletteRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [previewStatus, setPreviewStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [previewError, setPreviewError] = useState<string | null>(null);

    // La vista previa es el MISMO dibujo que se exporta, en 4:5. Se dibuja
    // fuera de pantalla y se copia al terminar: mientras el selector de color
    // se arrastra, cada cambio cancela el anterior y la imagen visible nunca
    // queda a medio pintar ni con un color viejo que llegó tarde.
    useEffect(() => {
        let cancelled = false;
        const timer = window.setTimeout(async () => {
            try {
                const { renderRivalHeadToHead } = await import('./rivalHeadToHeadExport');
                const offscreen = document.createElement('canvas');
                await renderRivalHeadToHead(offscreen, data, '4:5', colors);
                const target = canvasRef.current;
                const ctx = target?.getContext('2d');
                if (cancelled || !target || !ctx) return;
                ctx.imageSmoothingQuality = 'high';
                ctx.clearRect(0, 0, target.width, target.height);
                ctx.drawImage(offscreen, 0, 0, target.width, target.height);
                setPreviewStatus('ready');
                setPreviewError(null);
            } catch (error) {
                if (cancelled) return;
                setPreviewStatus('error');
                setPreviewError(error instanceof Error ? error.message : 'No se pudo dibujar la vista previa.');
            }
        }, PREVIEW_DELAY_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [data, colors]);

    const activeIndex = PALETTES.findIndex((palette) => sameColors(palette, colors));
    const isDefault = sameColors(colors, DEFAULT_RIVAL_EXPORT_COLORS);

    // Flechas dentro del grupo de paletas, como en cualquier radiogroup.
    const handlePaletteKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const from = activeIndex >= 0 ? activeIndex : 0;
        const next = (from + step + PALETTES.length) % PALETTES.length;
        onChange({ bg: PALETTES[next].bg, accent: PALETTES[next].accent });
        paletteRefs.current[next]?.focus();
    };

    return (
        <div id={id} className={styles.rivalColorPanel}>
            <div className={styles.rivalColorPreview} data-status={previewStatus}>
                <canvas
                    ref={canvasRef}
                    width={540}
                    height={675}
                    role="img"
                    aria-label={`Vista previa del mano a mano entre ${data.teamName} y ${data.rivalName}`}
                />
                {previewStatus === 'loading' && <span className={styles.rivalColorPreviewNote}>Armando la vista previa…</span>}
                {previewStatus === 'error' && <span className={styles.rivalColorPreviewNote} role="alert">{previewError}</span>}
            </div>

            <div className={styles.rivalColorControls}>
                <span className={styles.rivalColorLabel} id={`${id}-palettes`}>Paleta</span>
                <div className={styles.rivalPaletteGrid} role="radiogroup" aria-labelledby={`${id}-palettes`} onKeyDown={handlePaletteKeyDown}>
                    {PALETTES.map((palette, index) => {
                        const checked = index === activeIndex;
                        return (
                            <button
                                key={palette.id}
                                ref={(node) => { paletteRefs.current[index] = node; }}
                                type="button"
                                role="radio"
                                aria-checked={checked}
                                tabIndex={checked || (activeIndex < 0 && index === 0) ? 0 : -1}
                                className={styles.rivalPaletteOption}
                                style={{ '--swatch-bg': palette.bg, '--swatch-accent': palette.accent } as CSSProperties}
                                onClick={() => onChange({ bg: palette.bg, accent: palette.accent })}
                                title={palette.description}
                            >
                                <span className={styles.rivalColorSwatch} aria-hidden="true" />
                                <span>{palette.name}</span>
                            </button>
                        );
                    })}
                </div>

                <span className={styles.rivalColorLabel}>Colores propios</span>
                <div className={styles.rivalColorInputs}>
                    <label className={styles.rivalColorInput}>
                        <input type="color" value={colors.bg} onChange={(event) => onChange({ ...colors, bg: event.target.value })} />
                        <span><strong>Fondo</strong><code>{colors.bg.toUpperCase()}</code></span>
                    </label>
                    <label className={styles.rivalColorInput}>
                        <input type="color" value={colors.accent} onChange={(event) => onChange({ ...colors, accent: event.target.value })} />
                        <span><strong>Acento</strong><code>{colors.accent.toUpperCase()}</code></span>
                    </label>
                </div>

                <div className={styles.rivalColorFooter}>
                    <small>{activeIndex < 0 ? 'Combinación propia. ' : ''}Se recuerda en este dispositivo.</small>
                    <button type="button" className={styles.rivalColorReset} disabled={isDefault} onClick={() => onChange(DEFAULT_RIVAL_EXPORT_COLORS)}>
                        Volver a G22 Dark
                    </button>
                </div>
            </div>
        </div>
    );
}
