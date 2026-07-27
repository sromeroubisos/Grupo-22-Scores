'use client';

import type { Position, StartRouteId } from '@/features/career';
import { ALL_POSITIONS, getPosition, SURNAME_MAX } from '@/features/career';
import CountryPicker from './CountryPicker';
import styles from './carrera.module.css';

interface Props {
    countryCode: string | null;
    position: Position | null;
    startRoute: StartRouteId | null;
    surname: string;
    number: number | null;
    onSurname: (value: string) => void;
    onNumber: (value: number) => void;
    onCountry: (code: string) => void;
    onPosition: (value: Position) => void;
    onStartRoute: (value: StartRouteId) => void;
    onStart: () => void;
}

/**
 * Las tres rutas. La dificultad se muestra con rombos y con una palabra, no solo
 * con color: es la única señal de que la elección tiene consecuencias.
 */
const ROUTES: { id: StartRouteId; label: string; text: string; level: number; tag: string }[] = [
    {
        id: 'amateur',
        label: 'Amateur',
        text: 'Trabajás o estudiás. Entrenás cuando podés. El techo está lejos, pero cada paso vale.',
        level: 1,
        tag: 'Difícil',
    },
    {
        id: 'development',
        label: 'Desarrollo',
        text: 'Entrás por la formación. Entrenás como un profesional antes de serlo.',
        level: 2,
        tag: 'Equilibrado',
    },
    {
        id: 'professional',
        label: 'Profesional',
        text: 'Contrato desde el arranque. Menos épica, más exigencia.',
        level: 3,
        tag: 'Directo',
    },
];

/**
 * El usuario elige TRES cosas: nacionalidad, posición y desde dónde arranca.
 * Origen, edad, club inicial, atributos, potencial y elegibilidad los resuelve el
 * motor — la ruta acota el universo de clubes, no elige el club.
 */
export default function CreatePlayer({ countryCode, position, startRoute, surname, number, onSurname, onNumber, onCountry, onPosition, onStartRoute, onStart }: Props) {
    const ready = countryCode !== null && position !== null && startRoute !== null;

    // Números de camiseta del puesto elegido. El primero es el canónico (10 el
    // apertura, 2 el hooker, 15 el fullback) y es el que queda por defecto; los
    // puestos que comparten varios (pilar 1/3, tercera 6/7/8) dejan elegir.
    const numbers = position === null ? [] : getPosition(position).numbers;
    const chosenNumber = position === null ? null : (number !== null && numbers.includes(number) ? number : numbers[0]);

    // El botón deshabilitado siempre dice qué falta, no solo que falta algo.
    const faltan = [
        countryCode === null ? 'una nacionalidad' : null,
        position === null ? 'una posición' : null,
        startRoute === null ? 'cómo empezás' : null,
    ].filter((x): x is string => x !== null);

    return (
        <>
            <div>
                <span className={styles.eyebrow}>Crear jugador</span>
                {/* h2, no h1: el único h1 de la página es el título del juego,
                    que CareerFlow mantiene presente en todos los pasos. */}
                <h2 className={styles.title}>Elegí y arrancá</h2>
                <p className={styles.lead}>Tu nombre, tu bandera, tu puesto y desde dónde arrancás.</p>
            </div>

            <section className={styles.field}>
                <label className={styles.label} htmlFor="crear-apellido">Apellido</label>
                <input
                    id="crear-apellido"
                    type="text"
                    className={styles.textInput}
                    value={surname}
                    onChange={(e) => onSurname(e.target.value.slice(0, SURNAME_MAX))}
                    maxLength={SURNAME_MAX}
                    placeholder="El de la camiseta"
                    autoComplete="off"
                    spellCheck={false}
                />
                <p className={styles.fieldHint}>
                    Opcional, hasta {SURNAME_MAX} caracteres. Si lo dejás vacío, te ponemos uno.
                </p>
            </section>

            <section className={styles.field} aria-labelledby="crear-nacionalidad">
                <h3 className={styles.label} id="crear-nacionalidad">Nacionalidad</h3>
                <CountryPicker value={countryCode} onChange={onCountry} />
            </section>

            <section className={styles.field} aria-labelledby="crear-posicion">
                <h3 className={styles.label} id="crear-posicion">Posición</h3>
                <div className={styles.posGrid} role="radiogroup" aria-labelledby="crear-posicion">
                    {ALL_POSITIONS.map((pos) => {
                        const def = getPosition(pos);
                        const selected = position === pos;
                        return (
                            <button
                                key={pos}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                className={`${styles.posChip} ${selected ? styles.posChipOn : ''}`}
                                onClick={() => onPosition(pos)}
                            >
                                <span className={styles.posChipNum}>{def.numbers.join('·')}</span>
                                <span className={styles.posChipName}>{def.labelEs}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* El número solo se pregunta cuando hay algo que elegir: el apertura
                es 10 y el hooker 2, no hay decisión ahí. Aparece recién con la
                posición elegida, así no reserva espacio vacío. */}
            {numbers.length > 1 && (
                <section className={styles.field} aria-labelledby="crear-numero">
                    <h3 className={styles.label} id="crear-numero">Número</h3>
                    <div className={styles.numRow} role="radiogroup" aria-labelledby="crear-numero">
                        {numbers.map((n) => (
                            <button
                                key={n}
                                type="button"
                                role="radio"
                                aria-checked={chosenNumber === n}
                                className={`${styles.numChip} ${chosenNumber === n ? styles.numChipOn : ''}`}
                                onClick={() => onNumber(n)}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </section>
            )}

            <section className={styles.field} aria-labelledby="crear-ruta">
                <h3 className={styles.label} id="crear-ruta">Cómo empezás</h3>
                <div className={styles.routeGrid} role="radiogroup" aria-labelledby="crear-ruta">
                    {ROUTES.map((route) => {
                        const selected = startRoute === route.id;
                        return (
                            <button
                                key={route.id}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                className={`${styles.routeCard} ${selected ? styles.routeCardOn : ''}`}
                                onClick={() => onStartRoute(route.id)}
                            >
                                <span className={styles.routeName}>{route.label}</span>
                                <span className={styles.routeText}>{route.text}</span>
                                <span className={styles.routeLevel}>
                                    <span className={styles.routeDiamonds} aria-hidden="true">
                                        {'◆'.repeat(route.level)}{'◇'.repeat(3 - route.level)}
                                    </span>
                                    <span className={styles.routeTag}>{route.tag}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <div className={styles.btnRow}>
                <button type="button" className={styles.primaryBtn} onClick={onStart} disabled={!ready}>
                    Comenzar carrera
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </button>
            </div>
            {!ready && (
                <p className={styles.hintText} aria-live="polite">
                    Elegí {faltan.slice(0, -1).join(', ')}{faltan.length > 1 ? ' y ' : ''}{faltan[faltan.length - 1]}.
                </p>
            )}
        </>
    );
}
