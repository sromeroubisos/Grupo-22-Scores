'use client';

import type { ReactNode } from 'react';
import type { MinigameGrade, MinigameSetup, PendingMoment } from '@/features/captain';
import { MECHANIC_LABEL, gradeIsGood } from '@/features/captain';
import styles from '../capitan.module.css';

/**
 * EL MARCO DE UN MINIJUEGO — el cartel, el contexto y el veredicto.
 *
 * Las siete pantallas comparten todo menos el verbo, así que todo menos el verbo
 * vive acá: el minuto, el marcador, el título, las líneas que cuentan la jugada
 * y la frase del final pintada de verde o de rojo.
 *
 * ── Por qué un marco y no siete cabeceras iguales ──
 * Porque son SESENTA Y CINCO minijuegos entrando por siete pantallas, y la
 * diferencia entre uno y otro tiene que ser el verbo y nada más. Con la cabecera
 * repetida siete veces, el día que el marcador se muestre distinto hay que
 * acordarse de siete lugares — y a los tres meses hay dos que dicen otra cosa.
 *
 * ── Lo que este componente NO decide ──
 * La nota. La calcula el motor con la misma función que va a usar `resolve`, y
 * acá solo se pinta. Es la regla de siempre: la pantalla reporta lo que el
 * jugador hizo, en crudo, y el motor decide qué significa.
 */
export function MinigameShell({
    moment,
    setup,
    grade,
    veredicto,
    children,
}: {
    moment: PendingMoment;
    setup: MinigameSetup;
    /** `null` mientras la jugada no terminó. */
    grade: MinigameGrade | null;
    /** La frase del final. La escribe cada pantalla en el idioma de su verbo. */
    veredicto?: string;
    children: ReactNode;
}) {
    // EL MARCO. Casi todos los minijuegos son una jugada de un partido y llevan
    // el minuto y el marcador arriba; el que declara `sinPartido` no tiene ni una
    // cosa ni la otra. Sin esta rama, la academia provincial abría con «Minuto 0
    // · memoria. Están empatados.» — dos mentiras en la primera línea.
    const contexto = setup.sinPartido
        ? ''
        : moment.scoreDelta === 0
            ? 'Están empatados.'
            : moment.scoreDelta > 0
                ? `Están ${moment.scoreDelta} arriba.`
                : `Están ${Math.abs(moment.scoreDelta)} abajo.`;

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>
                {setup.sinPartido
                    ? MECHANIC_LABEL[setup.mechanic]
                    : `Minuto ${moment.minute} · ${MECHANIC_LABEL[setup.mechanic].toLowerCase()}`}
            </span>
            <h2 className={styles.cardTitle}>{setup.title}</h2>
            <p className={styles.cardText}>{contexto ? `${contexto} ` : ''}{setup.brief}</p>

            {children}

            {grade && veredicto && (
                <p
                    className={`${styles.momentVerdict} ${gradeIsGood(grade) ? styles.verdictGood : styles.verdictBad}`}
                >
                    {veredicto}
                </p>
            )}
        </div>
    );
}

/**
 * El cronómetro de `lectura`: cuenta HACIA ADELANTE y no tiene fondo.
 *
 * ── Por qué ya no es una barra que se vacía ──
 * Los verbos de decisión no se juegan contra el reloj. Una cuenta regresiva que
 * al llegar a cero resolvía la jugada sola convertía el pensar en un castigo:
 * el que se tomaba dos segundos más para leer la seña no perdía la nota, perdía
 * el turno. Ahora la jugada espera lo que haga falta.
 *
 * El tiempo sigue a la vista porque sigue contando —decidir rápido y bien vale
 * más que decidir lento y bien, y eso lo resuelve el motor (`lecturaGrade`)—,
 * pero lo hace como dato y no como amenaza. Un número que sube no apura a nadie;
 * una barra que se vacía, sí.
 *
 * `punto` no lo lleva: allá el tiempo nunca entró en la nota, así que un reloj
 * era apuro puro.
 */
export function MinigameStopwatch({ ms }: { ms: number }) {
    // `aria-hidden` porque mientras la jugada está abierta se refresca diez veces
    // por segundo: leído en voz alta tapa la tarjeta entera. Y no se pierde nada
    // silenciándolo — ninguna decisión depende de este número: el jugador no
    // puede quedarse sin tiempo, y el veredicto dice en palabras si la leyó
    // antes que nadie o si la eligió bien y punto.
    return (
        <span className={styles.mgStopwatch} aria-hidden="true">
            {(ms / 1000).toFixed(1).replace('.', ',')} s
        </span>
    );
}
