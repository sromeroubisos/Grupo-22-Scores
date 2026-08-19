'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptainState, LecturaSetup, MinigameSetup, MomentOutcome } from '@/features/captain';
import { lecturaGrade } from '@/features/captain';
import { MinigameShell, MinigameStopwatch } from './MinigameShell';
import styles from '../capitan.module.css';

/**
 * LECTURA — leer y decidir.
 *
 * La seña está A LA VISTA, arriba de las opciones, y es lo que cambia cuál
 * opción vale. La misma tarjeta con otra seña tiene otra respuesta, así que no
 * hay nada que aprender de memoria.
 *
 * ── El tiempo cuenta, pero no hay tiempo para atrás ──
 * `clavado` y `logrado` se separan por el TIEMPO y no por la opción: decidir
 * rápido y bien es mejor que decidir lento y bien. Por eso la pantalla mide
 * desde que se monta y manda los milisegundos en crudo — la clasificación la
 * hace el motor contra el umbral que le puso el margen del jugador.
 *
 * Lo que NO hay es cuenta regresiva. El cronómetro corre hacia adelante y la
 * jugada espera: nadie te resuelve la decisión por haberte tomado un segundo
 * más. Tardar te cuesta la diferencia entre clavarla y lograrla, que es un
 * precio, no un portazo.
 *
 * Cada opción muestra su `hint`, que dice el COSTO y no solo el beneficio: el
 * jugador tiene que poder elegir entendiendo qué resigna.
 */
export default function LecturaScreen({
    state,
    onResolve,
}: {
    state: CaptainState;
    onResolve: (outcome: MomentOutcome) => void;
}) {
    const moment = state.pendingMoment!;
    const setup = moment.setup as MinigameSetup;
    const play = setup.play as LecturaSetup;

    const [elegida, setElegida] = useState<number | null>(null);
    const [cerrado, setCerrado] = useState(false);
    // El mismo número corre a la vista y viaja al motor: mientras la jugada está
    // abierta lo mueve el cronómetro, y al elegir queda congelado en el instante
    // exacto de la decisión. Dos estados —uno para mostrar y otro para puntuar—
    // serían dos relojes que un día dicen distinto.
    const [ms, setMs] = useState(0);
    const desde = useRef<number | null>(null);

    // El cronómetro arranca en un efecto y no en el render: `performance.now()`
    // es impura y llamarla mientras se renderiza da un valor distinto cada vez
    // que React decida volver a renderizar. Acá eso no sería un detalle de
    // estilo — el tiempo de decisión es la mitad de la nota de este verbo.
    useEffect(() => {
        if (desde.current === null) desde.current = performance.now();
    }, []);

    const decidir = useCallback((i: number) => {
        if (cerrado) return;
        const ahora = performance.now();
        setMs(Math.round(ahora - (desde.current ?? ahora)));
        setElegida(i);
        setCerrado(true);
    }, [cerrado]);

    // El cronómetro. Cada décima vuelve a preguntarle al reloj del navegador en
    // vez de sumar 100 a lo que había: un intervalo que se atrasa —una pestaña en
    // segundo plano, el navegador ahorrando batería— dejaría un contador que
    // miente contra el `performance.now()` que sí se le manda al motor.
    useEffect(() => {
        if (cerrado) return;
        const id = setInterval(() => {
            const ahora = performance.now();
            setMs(Math.round(ahora - (desde.current ?? ahora)));
        }, 100);
        return () => clearInterval(id);
    }, [cerrado]);

    const grade = cerrado ? lecturaGrade(play, elegida, ms) : null;

    useEffect(() => {
        if (!cerrado) return;
        const id = setTimeout(() => onResolve({ kind: setup.kind, play: { elegida, ms } }), 1500);
        return () => clearTimeout(id);
    }, [cerrado, elegida, ms, onResolve, setup.kind]);

    // Sin cuenta regresiva no existe el «no decidiste»: la jugada solo se cierra
    // cuando el jugador toca una opción, así que `elegida` nunca llega en `null`.
    // El motor lo sigue contemplando porque de ahí salen las jugadas simuladas.
    const veredicto = grade === 'clavado' ? 'La leíste antes que nadie.'
        : grade === 'logrado' ? 'Elegiste bien.'
            : grade === 'tibio' ? 'No era la mejor.'
                : 'No era esa.';

    return (
        <MinigameShell moment={moment} setup={setup} grade={grade} veredicto={veredicto}>
            <div className={styles.mgSena}>
                <span className={styles.mgSenaLabel}>{play.sena.label}</span>
                <span className={styles.mgSenaDetalle}>{play.sena.detalle}</span>
            </div>

            {/* Sigue a la vista después de decidir, congelado: es el número que
                explica por qué el veredicto dice «la leíste antes que nadie» y
                no «elegiste bien». Escondido en el momento del desenlace, el
                jugador ve dos frases distintas para la misma opción y no tiene
                con qué atar una cosa con la otra. */}
            <MinigameStopwatch ms={ms} />

            <div className={styles.mgOptions} role="group" aria-label={setup.title}>
                {play.opciones.map((op, i) => (
                    <button
                        key={i}
                        type="button"
                        className={`${styles.mgOption} ${
                            cerrado && i === play.mejor ? styles.mgOptionRight : ''
                        } ${cerrado && i === elegida && i !== play.mejor ? styles.mgOptionWrong : ''}`}
                        onClick={() => decidir(i)}
                        disabled={cerrado}
                    >
                        <span className={styles.mgOptionLabel}>{op.label}</span>
                        <span className={styles.mgOptionHint}>{op.hint}</span>
                    </button>
                ))}
            </div>

            <span className={styles.momentCta}>{cerrado ? ' ' : 'Decidí'}</span>
        </MinigameShell>
    );
}
