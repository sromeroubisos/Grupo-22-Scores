import { FIRING_PRESSURE, pressureBand } from '../../../../features/coach/index.ts';
import styles from './entrenador.module.css';

const BAND_TEXT: Record<ReturnType<typeof pressureBand>, string> = {
    tranquila: 'Tranquila',
    atenta: 'Atenta',
    caliente: 'Caliente',
    terminal: 'Al límite',
};

const BAND_CLASS: Record<ReturnType<typeof pressureBand>, string> = {
    tranquila: styles.pressureTranquila,
    atenta: styles.pressureAtenta,
    caliente: styles.pressureCaliente,
    terminal: styles.pressureTerminal,
};

/**
 * La presión como medidor: una barra con las cuatro bandas pintadas y la aguja
 * donde estás. Un número solo ("57") no dice nada; la barra dice cuánto falta
 * para que la subcomisión te agradezca los servicios.
 *
 * `previous` dibuja una segunda marca: de dónde venías. Es lo que hace legible
 * el cierre de temporada.
 */
export default function PressureGauge({
    value,
    previous,
    compact = false,
}: {
    value: number;
    previous?: number;
    compact?: boolean;
}) {
    const band = pressureBand(value);
    const pct = Math.max(0, Math.min(100, value));
    const delta = previous === undefined ? null : Math.round(value - previous);

    return (
        <div className={`${styles.gauge} ${compact ? styles.gaugeCompact : ''}`}>
            <div className={styles.gaugeHead}>
                <span className={styles.gaugeLabel}>Presión</span>
                <span className={`${styles.gaugeBand} ${BAND_CLASS[band]}`}>
                    {BAND_TEXT[band]}
                    {delta !== null && delta !== 0 && (
                        <span className={styles.gaugeDelta}> ({delta > 0 ? '+' : ''}{delta})</span>
                    )}
                </span>
            </div>
            <div
                className={styles.gaugeTrack}
                role="meter"
                aria-label="Presión de la subcomisión"
                aria-valuemin={0}
                aria-valuemax={FIRING_PRESSURE}
                aria-valuenow={Math.round(value)}
                aria-valuetext={`${Math.round(value)} de ${FIRING_PRESSURE}, ${BAND_TEXT[band]}`}
            >
                <span className={styles.gaugeZoneTranquila} />
                <span className={styles.gaugeZoneAtenta} />
                <span className={styles.gaugeZoneCaliente} />
                <span className={styles.gaugeZoneTerminal} />
                {previous !== undefined && (
                    <span className={styles.gaugeGhost} style={{ left: `${Math.max(0, Math.min(100, previous))}%` }} />
                )}
                <span className={styles.gaugeNeedle} style={{ left: `${pct}%` }} />
            </div>
            {!compact && (
                <p className={styles.gaugeHint}>
                    A {FIRING_PRESSURE} te agradecen los servicios. Baja cumpliendo lo que te piden; sube
                    fallando, descendiendo o dejando el club en rojo.
                </p>
            )}
        </div>
    );
}
