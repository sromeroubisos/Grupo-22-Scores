'use client';

import { useCallback, useState } from 'react';
import type { AnclaSetup, CaptainState, MomentOutcome } from '@/features/captain';
import styles from './capitan.module.css';

/**
 * EL ANCLA — insistir en el scrum.
 *
 * El único de los cinco Momentos que NO se juega con el reloj, y por eso es el
 * único cuya pantalla no tiene una barra ni un destello: son dos botones y una
 * pregunta que se repite. Un juego de puestos donde los quince minijuegos midan
 * reflejos no es un juego de puestos.
 *
 * ── Qué decide esta pantalla y qué no ──
 * Decide nada, otra vez. El punto de quiebre del scrum ya venía sorteado en el
 * Setup y viajó en el guardado; acá solo se cuenta cuántas veces el jugador
 * apretó "Insistir" y se le muestra el resultado de cada una. La revelación se
 * hace comparando contra `setup.breakAt`, que es dato, no dado.
 *
 * ── Por qué se revela de a una ──
 * Porque si no, no es una apuesta: pedir el número de insistidas de entrada
 * sería elegir a ciegas, y elegir a ciegas entre tres números no es decidir
 * (CLAUDE.md §3). Insistir sabiendo que la anterior aguantó es otra cosa.
 */
export default function AnclaMoment({
    state,
    onResolve,
}: {
    state: CaptainState;
    onResolve: (outcome: MomentOutcome) => void;
}) {
    const moment = state.pendingMoment!;
    const setup = moment.setup as AnclaSetup;

    /** Cuántas veces apretó "Insistir". */
    const [pushes, setPushes] = useState(0);
    const [cerrado, setCerrado] = useState(false);

    const derrumbado = pushes >= setup.breakAt;
    const aguantadas = Math.min(pushes, setup.breakAt - 1);
    const sinMargen = pushes >= setup.maxPushes;

    const insistir = useCallback(() => {
        if (cerrado || derrumbado || sinMargen) return;
        const siguiente = pushes + 1;
        setPushes(siguiente);
        // Si se cayó, la jugada termina sola: no hay nada más que decidir.
        if (siguiente >= setup.breakAt) {
            setCerrado(true);
            setTimeout(() => onResolve({ kind: 'ancla', pushes: siguiente }), 1400);
        }
    }, [cerrado, derrumbado, sinMargen, pushes, setup.breakAt, onResolve]);

    const soltar = useCallback(() => {
        if (cerrado) return;
        setCerrado(true);
        setTimeout(() => onResolve({ kind: 'ancla', pushes }), 900);
    }, [cerrado, pushes, onResolve]);

    const contexto = moment.scoreDelta === 0
        ? 'Están empatados.'
        : moment.scoreDelta > 0
            ? `Están ${moment.scoreDelta} arriba.`
            : `Están ${Math.abs(moment.scoreDelta)} abajo.`;

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>Minuto {moment.minute} · el momento</span>
            <h2 className={styles.cardTitle}>Scrum a cinco metros</h2>
            <p className={styles.cardText}>
                {contexto} Scrum a favor y el pilar de enfrente ya sabe lo que viene. Cada vez que
                vuelvan a entrar podés apretar un poco más: el referee mira, ellos ceden, el penal se
                acerca. Si te pasás, se viene abajo y el señalado sos vos.
            </p>

            <div className={styles.anclaTally} aria-hidden="true">
                {Array.from({ length: setup.maxPushes }, (_, i) => (
                    <span
                        key={i}
                        className={`${styles.anclaMark} ${
                            i < aguantadas ? styles.anclaMarkHeld
                                : derrumbado && i === setup.breakAt - 1 ? styles.anclaMarkBroken
                                    : ''
                        }`}
                    />
                ))}
            </div>

            <p className={styles.anclaState} aria-live="polite">
                {derrumbado
                    ? 'Se vino abajo. El referee levanta el brazo para el otro lado.'
                    : aguantadas === 0
                        ? 'Están entrando. El scrum todavía no dijo nada.'
                        : `${aguantadas} ${aguantadas === 1 ? 'penal' : 'penales'} de scrum. Ellos ya miran al referee.`}
            </p>

            {!cerrado && (
                <div className={styles.anclaChoices}>
                    <button
                        type="button"
                        className={styles.primary}
                        onClick={insistir}
                        disabled={sinMargen}
                    >
                        Insistir
                    </button>
                    <span className={styles.primaryHint}>
                        {sinMargen
                            ? 'El referee ya te avisó. No hay una más.'
                            : 'Otro penal si aguanta. Si no, el derrumbe es tuyo.'}
                    </span>
                    <button type="button" className={styles.ghost} onClick={soltar}>
                        {aguantadas === 0 ? 'Empujar y salir limpia' : 'Soltar y quedarse con lo ganado'}
                    </button>
                </div>
            )}

            {/* El scrum es lo primero que se va con el cuerpo. Se dice en voz alta
                porque si no el derrumbe parece mala suerte y no desgaste. */}
            {state.damage.cuerpo > 45 && !cerrado && (
                <p className={styles.momentWarn}>
                    Estás roto. La espalda no aguanta lo que aguantaba a los veinticinco.
                </p>
            )}
        </div>
    );
}
