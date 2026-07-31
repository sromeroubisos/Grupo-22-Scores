'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptainState, TackleZone } from '@/features/captain';
import { tackleZones, zoneAt } from '@/features/captain';
import styles from './capitan.module.css';

/**
 * EL TACKLE — la barra que también es el sistema disciplinario.
 *
 * La conversión que más rinde de todo el juego: frenar medio tarde no es "peor
 * timing", es un tackle alto, y un tackle alto es una amarilla. El minijuego y
 * la disciplina son la misma cosa, así que no hay que explicar ninguna de las
 * dos.
 *
 * Un solo dedo, menos de veinte segundos, y la regla entra en una línea.
 *
 * ── Determinismo ──
 * Acá se usa `performance.now()` y está bien: esto es la pantalla, no el motor.
 * Lo que sale de este componente es UNA ENTRADA DEL JUGADOR —en qué zona frenó—
 * y el motor la trata igual que a una decisión.
 */
export default function TackleMoment({
    state,
    onResolve,
}: {
    state: CaptainState;
    onResolve: (zone: TackleZone, at: number) => void;
}) {
    const moment = state.pendingMoment!;
    const zones = tackleZones(state.player, state.damage.cuerpo, moment.pressure);

    const [pos, setPos] = useState(0);
    const [frozen, setFrozen] = useState<number | null>(null);
    const raf = useRef<number | null>(null);
    const started = useRef<number | null>(null);

    // La barra cruza y vuelve. Si el jugador no frena nunca, en la tercera
    // pasada se resuelve sola como "tarde": dudar también es una respuesta.
    useEffect(() => {
        if (frozen !== null) return;

        const tick = (now: number) => {
            if (started.current === null) started.current = now;
            const t = (now - started.current) / zones.sweepMs;

            if (t >= 3) {
                setFrozen(1);
                return;
            }
            // Ida y vuelta: 0 → 1 → 0 → 1…
            const ciclo = t % 2;
            setPos(ciclo <= 1 ? ciclo : 2 - ciclo);
            raf.current = requestAnimationFrame(tick);
        };

        raf.current = requestAnimationFrame(tick);
        return () => {
            if (raf.current !== null) cancelAnimationFrame(raf.current);
        };
    }, [frozen, zones.sweepMs]);

    const stop = useCallback(() => {
        if (frozen !== null) return;
        setFrozen(pos);
    }, [frozen, pos]);

    // Un beat para que se vea dónde frenó antes de pasar de pantalla.
    useEffect(() => {
        if (frozen === null) return;
        const id = setTimeout(() => onResolve(zoneAt(frozen, zones), frozen), 1100);
        return () => clearTimeout(id);
    }, [frozen, zones, onResolve]);

    // El teclado también juega: barra o enter. Un minijuego de un solo dedo no
    // puede quedar fuera del alcance de quien navega con teclado.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); stop(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [stop]);

    const marcador = frozen ?? pos;
    const zonaActual = frozen !== null ? zoneAt(frozen, zones) : null;

    const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
    const contexto = moment.scoreDelta === 0
        ? 'Están empatados.'
        : moment.scoreDelta > 0
            ? `Están ${moment.scoreDelta} arriba.`
            : `Están ${Math.abs(moment.scoreDelta)} abajo.`;

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>Minuto {moment.minute} · el momento</span>
            <h2 className={styles.cardTitle}>Viene derecho a vos</h2>
            <p className={styles.cardText}>
                {contexto} Se les escapó el octavo por el medio y sos el único que llega.
                Frená la barra cuando estés encima.
            </p>

            <button
                type="button"
                className={styles.momentZone}
                onClick={stop}
                disabled={frozen !== null}
                aria-label="Frenar el tackle"
            >
                <span className={styles.bar}>
                    <span className={styles.zonePiernas} style={{ width: pct(zones.piernasEnd) }} />
                    <span className={styles.zoneLegal} style={{ width: pct(zones.legalEnd - zones.piernasEnd) }} />
                    <span className={styles.zoneAlto} style={{ width: pct(zones.altoEnd - zones.legalEnd) }} />
                    <span className={styles.zoneTarde} style={{ width: pct(1 - zones.altoEnd) }} />
                    <span
                        className={`${styles.needle} ${frozen !== null ? styles.needleStopped : ''}`}
                        style={{ left: pct(marcador) }}
                    />
                </span>

                <span className={styles.barLegend}>
                    <span>Piernas</span>
                    <span>Legal</span>
                    <span>Alto</span>
                    <span>Tarde</span>
                </span>

                <span className={styles.momentCta}>
                    {frozen === null ? 'Tocá para frenar' : ' '}
                </span>
            </button>

            {zonaActual && (
                <p className={`${styles.momentVerdict} ${zonaActual === 'legal' ? styles.verdictGood : zonaActual === 'alto' || zonaActual === 'tarde' ? styles.verdictBad : ''}`}>
                    {zonaActual === 'legal' && 'Justo. Lo frenaste en seco.'}
                    {zonaActual === 'piernas' && 'Llegaste abajo. Seguro, pero descargó.'}
                    {zonaActual === 'alto' && 'Alto. El referee cruza los brazos.'}
                    {zonaActual === 'tarde' && 'Tarde. Te pasó por arriba.'}
                </p>
            )}

            {/* El detalle que ningún juego modela: la zona peligrosa crece con
                el desgaste. Se dice en voz alta porque si no parece injusto. */}
            {state.damage.cuerpo > 45 && frozen === null && (
                <p className={styles.momentWarn}>
                    Estás roto. La franja de riesgo es más ancha de lo que era hace tres años.
                </p>
            )}
        </div>
    );
}
