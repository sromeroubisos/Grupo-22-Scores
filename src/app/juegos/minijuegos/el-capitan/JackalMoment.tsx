'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptainState, JackalSetup, MomentOutcome } from '@/features/captain';
import { jackalBeat } from '@/features/captain';
import styles from './capitan.module.css';

/**
 * EL JACKAL — esperar y tocar, tres veces.
 *
 * El jackal real no es puntería ni fuerza: es TIMING sobre una ventana que
 * existe y se cierra. Hay un instante en que la pelota está en el piso y es
 * legal; antes de eso te vas de offside y después te limpian. El minijuego es
 * esa línea y nada más.
 *
 * ── Qué decide esta pantalla y qué no ──
 * Decide NADA. Mide un tiempo de reacción y lo manda en crudo. Los delays y las
 * ventanas ya venían sorteados en el Setup —viajaron en el guardado— y la
 * clasificación de cada ronda la hace `jackalBeat`, que es del motor. Si la
 * pantalla sorteara el delay, recargar antes de tocar cambiaría la jugada; si
 * clasificara ella, el motor no podría reproducirla sin el navegador.
 *
 * ── Determinismo ──
 * Acá se usa `performance.now()` y está bien: esto es la pantalla, no el motor.
 * Lo que sale de este componente es UNA ENTRADA DEL JUGADOR.
 */

/** Cuánto se espera una respuesta después del destello antes de darla por perdida. */
const PACIENCIA_MS = 1400;

/** El beat entre que se resuelve una ronda y arranca la siguiente. */
const ENTRE_RONDAS_MS = 1000;

type Fase = 'esperando' | 'abierta' | 'resuelta';

export default function JackalMoment({
    state,
    onResolve,
}: {
    state: CaptainState;
    onResolve: (outcome: MomentOutcome) => void;
}) {
    const moment = state.pendingMoment!;
    const setup = moment.setup as JackalSetup;

    const [ronda, setRonda] = useState(0);
    const [fase, setFase] = useState<Fase>('esperando');
    const [reacciones, setReacciones] = useState<(number | null)[]>([]);

    /** Cuándo aparece el destello de ESTA ronda, en el reloj del navegador. */
    const destelloEn = useRef<number | null>(null);
    /** Una ronda se contesta una sola vez, venga del dedo o del teclado. */
    const contestada = useRef(false);

    const terminada = ronda >= setup.windows.length;

    // Programa la ronda: el destello sale a los `delays[ronda]` ms, y si nadie
    // toca en `PACIENCIA_MS` se da por limpiado.
    useEffect(() => {
        if (terminada) return;

        contestada.current = false;
        destelloEn.current = performance.now() + setup.delays[ronda];
        setFase('esperando');

        const abrir = setTimeout(() => setFase('abierta'), setup.delays[ronda]);
        const cerrar = setTimeout(() => {
            if (contestada.current) return;
            contestada.current = true;
            setReacciones((previas) => [...previas, null]);
            setFase('resuelta');
        }, setup.delays[ronda] + PACIENCIA_MS);

        return () => {
            clearTimeout(abrir);
            clearTimeout(cerrar);
        };
    }, [ronda, setup.delays, terminada]);

    // Entre una ronda y la otra hay un beat para leer qué pasó.
    useEffect(() => {
        if (fase !== 'resuelta' || terminada) return;
        const id = setTimeout(() => setRonda((n) => n + 1), ENTRE_RONDAS_MS);
        return () => clearTimeout(id);
    }, [fase, terminada, reacciones.length]);

    // Con las tres jugadas, la mano se manda al motor.
    useEffect(() => {
        if (!terminada) return;
        const id = setTimeout(() => onResolve({ kind: 'jackal', reactions: reacciones }), ENTRE_RONDAS_MS);
        return () => clearTimeout(id);
    }, [terminada, reacciones, onResolve]);

    const tocar = useCallback(() => {
        if (contestada.current || terminada || destelloEn.current === null) return;
        contestada.current = true;
        // Negativo es haber tocado ANTES del destello. El motor lo lee como
        // offside: entrar al ruck por el costado no es "fallar el timing".
        setReacciones((previas) => [...previas, Math.round(performance.now() - destelloEn.current!)]);
        setFase('resuelta');
    }, [terminada]);

    // Un minijuego de un solo dedo no puede quedar fuera del alcance de quien
    // navega con teclado.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); tocar(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [tocar]);

    const contexto = moment.scoreDelta === 0
        ? 'Están empatados.'
        : moment.scoreDelta > 0
            ? `Están ${moment.scoreDelta} arriba.`
            : `Están ${Math.abs(moment.scoreDelta)} abajo.`;

    const ultima = reacciones.length > 0 ? reacciones[reacciones.length - 1] : undefined;
    const beat = fase === 'resuelta' && ultima !== undefined
        ? jackalBeat(ultima, setup.windows[Math.min(ronda, setup.windows.length - 1)])
        : null;

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>Minuto {moment.minute} · el momento</span>
            <h2 className={styles.cardTitle}>La pelota queda en el piso</h2>
            <p className={styles.cardText}>
                {contexto} Llegaste antes que el sostén. Tres rucks, y en cada uno esperá a que la
                pelota esté libre y tocá. Si entrás antes, es penal en contra.
            </p>

            <div className={styles.jackalRounds} aria-hidden="true">
                {setup.windows.map((_, i) => (
                    <span
                        key={i}
                        className={`${styles.jackalPip} ${
                            i < reacciones.length
                                ? jackalBeat(reacciones[i], setup.windows[i]) === 'turnover'
                                    ? styles.jackalPipWon
                                    : jackalBeat(reacciones[i], setup.windows[i]) === 'offside'
                                        ? styles.jackalPipFoul
                                        : styles.jackalPipLost
                                : i === ronda ? styles.jackalPipNow : ''
                        }`}
                    />
                ))}
            </div>

            <button
                type="button"
                className={`${styles.jackalZone} ${fase === 'abierta' ? styles.jackalOpen : ''}`}
                onClick={tocar}
                disabled={terminada || fase === 'resuelta'}
                aria-label={`Ruck ${Math.min(ronda + 1, setup.windows.length)} de ${setup.windows.length}: tocar cuando la pelota esté libre`}
            >
                <span className={styles.jackalLight} />
                <span className={styles.jackalCta} aria-live="polite">
                    {fase === 'esperando' && 'Todavía no'}
                    {fase === 'abierta' && 'Ahora'}
                    {fase === 'resuelta' && beat === 'turnover' && 'Manos sobre la pelota'}
                    {fase === 'resuelta' && beat === 'offside' && 'Entraste antes. Penal'}
                    {fase === 'resuelta' && beat === 'limpiado' && 'Te limpiaron'}
                </span>
            </button>

            {beat && (
                <p className={`${styles.momentVerdict} ${
                    beat === 'turnover' ? styles.verdictGood : beat === 'offside' ? styles.verdictBad : ''
                }`}>
                    {beat === 'turnover' && 'Aguantaste y el referee marcó para tu lado.'}
                    {beat === 'offside' && 'Te tiraste antes de que la pelota estuviera en el piso.'}
                    {beat === 'limpiado' && 'Llegó el sostén y te sacó de encima.'}
                </p>
            )}

            {/* La ventana se achica ronda a ronda. Se dice en voz alta porque si
                no parece que el juego se puso injusto de la nada. */}
            {ronda === setup.windows.length - 1 && fase !== 'resuelta' && (
                <p className={styles.momentWarn}>
                    Tercer ruck del partido. Llegás más tarde y la ventana es más corta.
                </p>
            )}
        </div>
    );
}
