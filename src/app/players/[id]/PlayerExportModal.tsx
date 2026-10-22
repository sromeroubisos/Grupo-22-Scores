'use client';

/**
 * Exportar la ficha del jugador: tres placas (identidad, estadisticas, ultimos
 * partidos) en 4:5 o 9:16. La vista previa es EL MISMO dibujo que se descarga.
 *
 * El color sigue al torneo: se exporta una competicion y el acento sale de ella
 * (ver `playerExport.ts`). Se puede pasar al color del club o elegir uno a mano.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { LocalPlayerProfile } from '@/lib/services/localPlayerProfile';
import { EXPORT_BACKGROUND_OPTIONS } from '@/lib/exports/tournamentThemes';
import {
    PLAYER_PLATES,
    renderPlayerPlate,
    resolvePlayerAccent,
    sharePlayerPlates,
    type PlayerColorSource,
    type PlayerExportFormat,
    type PlayerExportOptions,
    type PlayerPlate,
} from './playerExport';
import styles from './PlayerExportModal.module.css';

const ORIGIN_LABEL: Record<string, string> = {
    manual: 'elegido a mano',
    tema: 'tema del torneo',
    torneo: 'color del torneo',
    'logo-torneo': 'tomado del logo del torneo',
    club: 'color del club',
    escudo: 'tomado del escudo del club',
    default: 'color de G22',
};

export default function PlayerExportModal({ profile, onClose }: { profile: LocalPlayerProfile; onClose: () => void }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [plate, setPlate] = useState<PlayerPlate>('identidad');
    const [format, setFormat] = useState<PlayerExportFormat>('4:5');
    const [seasonKey, setSeasonKey] = useState<string | null>(profile.seasons[0]?.key ?? null);
    const [colorSource, setColorSource] = useState<PlayerColorSource>('torneo');
    const [manualColor, setManualColor] = useState<string | null>(null);
    const [accentInfo, setAccentInfo] = useState<{ accent: string; origin: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [rendering, setRendering] = useState(true);
    const [busy, setBusy] = useState<'one' | 'all' | null>(null);
    const [done, setDone] = useState<string | null>(null);

    const [background, setBackground] = useState<string>('auto');

    const options = useMemo<PlayerExportOptions>(
        () => ({ seasonKey, colorSource, accentOverride: manualColor, background }),
        [seasonKey, colorSource, manualColor, background],
    );

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [onClose]);

    // Vista previa: se vuelve a dibujar al cambiar cualquier opcion; lo que
    // llega tarde de un dibujo anterior se descarta.
    useEffect(() => {
        let cancelled = false;
        const timer = window.setTimeout(async () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            setRendering(true);
            setError(null);
            try {
                const resolved = await resolvePlayerAccent(profile, options);
                if (cancelled) return;
                setAccentInfo(resolved);
                const work = document.createElement('canvas');
                await renderPlayerPlate(work, profile, plate, format, options, resolved.accent);
                if (cancelled) return;
                canvas.width = work.width;
                canvas.height = work.height;
                canvas.getContext('2d')?.drawImage(work, 0, 0);
            } catch (caught) {
                if (!cancelled) setError(caught instanceof Error ? caught.message : 'No se pudo dibujar la placa.');
            } finally {
                if (!cancelled) setRendering(false);
            }
        }, 120);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [profile, plate, format, options]);

    const deliver = async (plates: PlayerPlate[], mode: 'one' | 'all') => {
        setBusy(mode);
        setError(null);
        setDone(null);
        try {
            const result = await sharePlayerPlates(profile, plates, format, options);
            setDone(result === 'shared' ? 'Listo para compartir.' : plates.length > 1 ? 'Descargadas las 3 placas.' : 'Placa descargada.');
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'No se pudo generar la imagen.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className={styles.backdrop} onClick={onClose}>
            <div
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-label={`Exportar la ficha de ${profile.name}`}
                onClick={(event) => event.stopPropagation()}
            >
                <header className={styles.head}>
                    <h2 className={styles.title}>Exportar ficha</h2>
                    <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
                        <X size={20} aria-hidden="true" />
                    </button>
                </header>

                <div className={styles.body}>
                    <div className={styles.preview}>
                        <canvas
                            ref={canvasRef}
                            className={`${styles.canvas} ${rendering ? styles.canvasBusy : ''}`}
                            aria-label="Vista previa de la placa"
                        />
                        {error && (
                            <p className={styles.error} role="alert">
                                {error}
                            </p>
                        )}
                    </div>

                    <div className={styles.controls}>
                        <fieldset className={styles.group}>
                            <legend className={styles.legend}>Placa</legend>
                            <div className={styles.segment} role="radiogroup" aria-label="Placa">
                                {PLAYER_PLATES.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={plate === item.id}
                                        className={`${styles.seg} ${plate === item.id ? styles.segActive : ''}`}
                                        onClick={() => setPlate(item.id)}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </fieldset>

                        <fieldset className={styles.group}>
                            <legend className={styles.legend}>Formato</legend>
                            <div className={styles.segment} role="radiogroup" aria-label="Formato">
                                {(['4:5', '9:16'] as const).map((item) => (
                                    <button
                                        key={item}
                                        type="button"
                                        role="radio"
                                        aria-checked={format === item}
                                        className={`${styles.seg} ${format === item ? styles.segActive : ''}`}
                                        onClick={() => setFormat(item)}
                                    >
                                        {item === '4:5' ? 'Post 4:5' : 'Historia 9:16'}
                                    </button>
                                ))}
                            </div>
                        </fieldset>

                        {profile.seasons.length > 0 && (
                            <fieldset className={styles.group}>
                                <legend className={styles.legend}>Competición</legend>
                                <div className={styles.chips} role="radiogroup" aria-label="Competición">
                                    {[{ key: null as string | null, label: 'Todas' }, ...profile.seasons.map((season) => ({
                                        key: season.key as string | null,
                                        label: [season.tournamentName, season.year].filter(Boolean).join(' · '),
                                    }))].map((option) => (
                                        <button
                                            key={option.key ?? 'todas'}
                                            type="button"
                                            role="radio"
                                            aria-checked={seasonKey === option.key}
                                            className={`${styles.chip} ${seasonKey === option.key ? styles.chipActive : ''}`}
                                            onClick={() => setSeasonKey(option.key)}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </fieldset>
                        )}

                        <fieldset className={styles.group}>
                            <legend className={styles.legend}>Fondo</legend>
                            <div className={styles.bgRow} role="radiogroup" aria-label="Fondo">
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={background === 'auto'}
                                    className={`${styles.chip} ${background === 'auto' ? styles.chipActive : ''}`}
                                    onClick={() => setBackground('auto')}
                                >
                                    Del torneo
                                </button>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={background === 'none'}
                                    className={`${styles.chip} ${background === 'none' ? styles.chipActive : ''}`}
                                    onClick={() => setBackground('none')}
                                >
                                    Liso
                                </button>
                                {EXPORT_BACKGROUND_OPTIONS.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={background === option.id}
                                        aria-label={`Fondo ${option.label}`}
                                        title={option.label}
                                        className={`${styles.thumb} ${background === option.id ? styles.thumbActive : ''}`}
                                        style={{ backgroundImage: `url(${option.image})`, backgroundColor: option.bg }}
                                        onClick={() => setBackground(option.id)}
                                    />
                                ))}
                            </div>
                        </fieldset>

                        <fieldset className={styles.group}>
                            <legend className={styles.legend}>Color</legend>
                            <div className={styles.segment} role="radiogroup" aria-label="Origen del color">
                                {([['torneo', 'Del torneo'], ['club', 'Del club']] as const).map(([id, label]) => (
                                    <button
                                        key={id}
                                        type="button"
                                        role="radio"
                                        aria-checked={colorSource === id && !manualColor}
                                        className={`${styles.seg} ${colorSource === id && !manualColor ? styles.segActive : ''}`}
                                        onClick={() => {
                                            setColorSource(id);
                                            setManualColor(null);
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className={styles.colorRow}>
                                <label className={styles.colorLabel}>
                                    <input
                                        type="color"
                                        value={manualColor ?? accentInfo?.accent ?? '#00a365'}
                                        onChange={(event) => setManualColor(event.target.value)}
                                        className={styles.colorInput}
                                        aria-label="Elegir el color a mano"
                                    />
                                    <span>Elegir a mano</span>
                                </label>
                                {accentInfo && (
                                    <span className={styles.origin}>
                                        <span className={styles.swatch} style={{ background: accentInfo.accent }} aria-hidden="true" />
                                        {ORIGIN_LABEL[accentInfo.origin] ?? accentInfo.origin}
                                    </span>
                                )}
                            </div>
                        </fieldset>

                        <div className={styles.actions}>
                            <button
                                type="button"
                                className={styles.primary}
                                disabled={busy !== null || rendering || Boolean(error)}
                                onClick={() => deliver([plate], 'one')}
                            >
                                {busy === 'one' ? 'Generando…' : 'Descargar esta placa'}
                            </button>
                            <button
                                type="button"
                                className={styles.secondary}
                                disabled={busy !== null || Boolean(error)}
                                onClick={() => deliver(PLAYER_PLATES.map((item) => item.id), 'all')}
                            >
                                {busy === 'all' ? 'Generando las 3…' : 'Descargar las 3'}
                            </button>
                            {done && (
                                <p className={styles.done} role="status">
                                    {done}
                                </p>
                            )}
                            {(rendering || error) && busy === null && (
                                <p className={styles.hint}>
                                    {error ? 'Resolvé el error de arriba para poder descargar.' : 'Dibujando la vista previa…'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
