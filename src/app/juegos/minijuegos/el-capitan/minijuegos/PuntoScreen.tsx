'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CaptainState, MinigameSetup, MomentOutcome, PuntoSetup } from '@/features/captain';
import { puntoGrade } from '@/features/captain';
import { MinigameShell } from './MinigameShell';
import styles from '../capitan.module.css';

/**
 * PUNTO — elegir un lugar.
 *
 * Una fila de lugares en orden espacial y uno bueno. El orden importa: los
 * botones están de izquierda a derecha como están en la cancha, así que "el de
 * al lado" quiere decir lo mismo en la pantalla que en el motor.
 *
 * ── Acá no hay reloj ──
 * Y no es que se lo sacamos a la pantalla: el tiempo NUNCA entró en la nota de
 * este verbo. `puntoGrade` mira el lugar que elegiste y nada más. La cuenta
 * regresiva que había solo podía hacer una cosa —resolverte la jugada como
 * errada por no haber tocado a tiempo—, o sea apurar sin premiar. Ahora la
 * jugada espera.
 *
 * `play.segundos` sigue viajando en el setup guardado y la pantalla ya no lo
 * lee. Sacarlo cambiaría la forma del guardado y obligaría a tirar las partidas
 * en curso por un campo que no mueve una nota.
 */
export default function PuntoScreen({
    state,
    onResolve,
}: {
    state: CaptainState;
    onResolve: (outcome: MomentOutcome) => void;
}) {
    const moment = state.pendingMoment!;
    const setup = moment.setup as MinigameSetup;
    const play = setup.play as PuntoSetup;

    const [elegido, setElegido] = useState<number | null>(null);
    const [cerrado, setCerrado] = useState(false);

    const elegir = useCallback((i: number) => {
        if (cerrado) return;
        setElegido(i);
        setCerrado(true);
    }, [cerrado]);

    const grade = cerrado ? puntoGrade(play, elegido) : null;

    useEffect(() => {
        if (!cerrado) return;
        const id = setTimeout(() => onResolve({ kind: setup.kind, play: { elegido } }), 1400);
        return () => clearTimeout(id);
    }, [cerrado, elegido, onResolve, setup.kind]);

    // La jugada solo se cierra cuando el jugador toca un lugar, así que `elegido`
    // nunca llega en `null`. El motor lo sigue contemplando porque de ahí salen
    // las jugadas simuladas.
    const veredicto = grade === 'clavado' ? 'Justo ahí era.'
        : grade === 'logrado' ? 'Cerca, y alcanzó.'
            : grade === 'tibio' ? 'Te quedaste al lado.'
                : 'No era por ahí.';

    return (
        <MinigameShell moment={moment} setup={setup} grade={grade} veredicto={veredicto}>
            <p className={styles.mgEscena}>{play.escena}</p>

            <div className={styles.mgGrid} role="group" aria-label={setup.title}>
                {play.lugares.map((lugar, i) => (
                    <button
                        key={i}
                        type="button"
                        className={`${styles.mgSpot} ${
                            cerrado && i === play.correcto ? styles.mgSpotRight : ''
                        } ${cerrado && i === elegido && i !== play.correcto ? styles.mgSpotWrong : ''} ${
                            i === elegido ? styles.mgSpotPicked : ''
                        }`}
                        onClick={() => elegir(i)}
                        disabled={cerrado}
                    >
                        {lugar}
                    </button>
                ))}
            </div>

            <span className={styles.momentCta}>{cerrado ? ' ' : 'Elegí'}</span>
        </MinigameShell>
    );
}
