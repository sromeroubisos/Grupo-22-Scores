'use client';

import type { CSSProperties } from 'react';
import { ALL_POSITIONS, getPosition, positionLabel } from '@/features/career';
import type { Position } from '@/features/career';
import { useLocale } from './LocaleContext';
import styles from './carrera.module.css';

interface Props {
    value: Position | null;
    onChange: (pos: Position) => void;
}

/**
 * Los nueve puestos EN LA CANCHA, no en una lista.
 *
 * Una lista de nueve filas gasta alto y no dice nada que el jugador no supiera.
 * La formación sí: dónde para un segunda línea respecto de un wing es
 * información, y encima ocupa el ancho —que es lo que sobra— en vez del alto,
 * que es lo que falta.
 *
 * Coordenadas en % sobre la cancha, atacando hacia la derecha: el pack a la
 * izquierda, la línea de tres cuartos abriéndose hacia afuera y el fullback
 * último. Es la formación de un line-out desplegado, que es como se ve un
 * equipo de rugby desde arriba.
 *
 * EN EL TELÉFONO LA CANCHA SE PARA. Con 16/9 sobre 390 px quedaban 219 px de
 * alto para nueve puestos y se tapaban entre ellos: "Pilar" abajo de "Segunda
 * línea", "Hooker" abajo de "Tercera línea". No es un problema de tamaño de
 * letra sino de forma: un teléfono es alto y la cancha estaba acostada. Cada
 * puesto publica su posición en `--x` y `--y`, y el CSS decide cómo leerlas —
 * acostada en escritorio, parada en el teléfono. Así hay UN solo juego de
 * coordenadas y la formación sigue siendo la misma.
 */
const SPOT: Record<Position, { x: number; y: number }> = {
    hooker: { x: 10, y: 30 },
    prop: { x: 10, y: 66 },
    lock: { x: 24, y: 48 },
    backrow: { x: 37, y: 24 },
    scrumhalf: { x: 40, y: 68 },
    flyhalf: { x: 54, y: 50 },
    centre: { x: 68, y: 34 },
    wing: { x: 80, y: 74 },
    fullback: { x: 92, y: 48 },
};

export default function PitchPositions({ value, onChange }: Props) {
    const { locale } = useLocale();
    return (
        <div className={styles.pitch} role="radiogroup" aria-labelledby="crear-posicion">
            {/* Marcas de la cancha. Decorativas: la información la dan los
                puestos, no las líneas. */}
            {([[4, 'pitchTry'], [26, 'pitch22'], [50, 'pitchHalf'], [74, 'pitch22'], [96, 'pitchTry']] as const).map(([at, kind], i) => (
                <span
                    key={i}
                    className={`${styles.pitchLine} ${styles[kind]}`}
                    style={{ '--at': `${at}%` } as CSSProperties}
                    aria-hidden="true"
                />
            ))}

            {ALL_POSITIONS.map((pos) => {
                const def = getPosition(pos);
                const label = positionLabel(pos, def.labelEs, locale);
                const spot = SPOT[pos];
                const selected = value === pos;
                return (
                    <button
                        key={pos}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`${styles.pitchSpot} ${selected ? styles.pitchSpotOn : ''}`}
                        style={{ '--x': `${spot.x}%`, '--y': `${spot.y}%` } as CSSProperties}
                        onClick={() => onChange(pos)}
                        title={label}
                    >
                        {/* El NÚMERO manda. En rugby el puesto ES el número —
                            un 10 es un apertura y no hace falta leerlo— así que
                            va grande y el nombre debajo, chico. Al revés, que
                            era como estaba, obligaba a leer "Segunda línea"
                            partido en dos renglones de 9 px. */}
                        <span className={styles.pitchNum}>{def.numbers.join('·')}</span>
                        <span className={styles.pitchName}>{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
