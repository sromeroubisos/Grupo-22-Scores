'use client';

import { useState } from 'react';
import type { PaceModeId, Position } from '@/features/career';
import { getPosition, startClubChoices, SURNAME_MAX } from '@/features/career';
import { useLocale } from './LocaleContext';
import ClubBadge from './ClubBadge';
import CountryPicker from './CountryPicker';
import JerseyPreview from './JerseyPreview';
import PitchPositions from './PitchPositions';
import styles from './carrera.module.css';

interface Props {
    countryCode: string | null;
    position: Position | null;
    paceMode: PaceModeId;
    surname: string;
    number: number | null;
    /** Club elegido, o null si arranca al azar (que es el default). */
    startClubId: string | null;
    onSurname: (value: string) => void;
    onNumber: (value: number) => void;
    onCountry: (code: string) => void;
    onPosition: (value: Position) => void;
    onPaceMode: (value: PaceModeId) => void;
    /** Vuelve al azar: el motor elige. */
    onRandomClub: () => void;
    /** Abre la pantalla de elección de club. */
    onPickClub: () => void;
    onStart: () => void;
    /** Vuelve a la portada. El pie de la tarjeta necesita una salida. */
    onBack: () => void;
}

// Acá había una grilla de tres rutas para elegir —amateur, desarrollo,
// profesional—. Se fue porque era una elección que el jugador no podía entender:
// antes de jugar una carrera nadie sabe qué significa "desarrollo", y era la
// primera pregunta del juego. Ahora la rama la sortea el motor y se descubre
// jugando; la primera decisión de verdad pasa a ser qué club te lleva.

// Los tres modos de duración viven en `i18n/ui.ts` (`t.paces`): NO cambian la
// carrera, cambian cuántas veces se te pregunta algo mientras pasa, así que son
// texto de pantalla y no dato del motor.

/**
 * UNA TARJETA, no una pila de secciones.
 *
 * La versión anterior apilaba APELLIDO, NACIONALIDAD, POSICIÓN, RUTA y RITMO en
 * una columna angosta y centrada. El resultado medido: se acababa el alto —la
 * grilla de países scrolleaba— mientras sobraban ~300 px abajo y media pantalla
 * a los costados. No faltaba espacio; estaba mal usado el que había.
 *
 * Ahora la tarjeta es dueña del alto y reparte en horizontal: cabecera de una
 * línea, tres columnas de igual alto, la banda de ruta a lo ancho y un pie fijo.
 * Nada scrollea. Si la grilla de países no entra, muestra menos filas y el
 * buscador es el camino al resto.
 *
 * EN MOBILE NO: ahí es UN PASO POR DECISIÓN.
 *
 * Apilar las cinco decisiones en una columna de teléfono no se arregla con CSS
 * porque el problema es de estructura: el jugador ve el arranque de cinco cosas
 * y no termina ninguna. De a un paso, cada pantalla tiene una sola pregunta,
 * entra entera y el pulgar siempre encuentra "Continuar" en el mismo lugar.
 *
 * El orden lo manda el rugby y no la costumbre: la POSICIÓN va antes que la
 * identidad porque el dorsal sale del puesto —el apertura es 10 y el hooker 2—,
 * así que preguntar el número antes sería preguntar por algo que todavía no
 * existe.
 *
 * Es el mismo JSX para las dos: en escritorio se muestran las cinco secciones a
 * la vez (`display: contents` deja de agrupar y el CSS no oculta ninguna) y en
 * el teléfono se muestra sólo la del paso activo. Nada de dos árboles paralelos
 * que después se desincronizan.
 */
export default function CreatePlayer({ countryCode, position, paceMode, surname, number, startClubId, onSurname, onNumber, onCountry, onPosition, onPaceMode, onRandomClub, onPickClub, onStart, onBack }: Props) {
    const { t } = useLocale();
    const ready = countryCode !== null && position !== null;

    const STEPS = t.steps;
    const [step, setStep] = useState(0);
    const last = STEPS.length - 1;

    // Clubes elegibles del país. Vacío = ese país no tiene escalera propia
    // modelada, y entonces "Elegir club" no se puede ofrecer: hay que decir por
    // qué en vez de mostrar una lista vacía.
    const clubesDelPais = countryCode === null ? [] : startClubChoices(countryCode);
    const puedeElegirClub = clubesDelPais.length > 0;
    const clubElegido = startClubId === null ? null : clubesDelPais.find((c) => c.id === startClubId) ?? null;

    // Números de camiseta del puesto elegido. El primero es el canónico (10 el
    // apertura, 2 el hooker, 15 el fullback) y es el que queda por defecto; los
    // puestos que comparten varios (pilar 1/3, tercera 6/7/8) dejan elegir.
    const numbers = position === null ? [] : getPosition(position).numbers;
    const chosenNumber = position === null ? null : (number !== null && numbers.includes(number) ? number : numbers[0]);

    // El botón deshabilitado siempre dice qué falta, no solo que falta algo.
    const faltan = [
        countryCode === null ? t.missingNationality : null,
        position === null ? t.missingPosition : null,
    ].filter((x): x is string => x !== null);

    // Qué le falta a ESTE paso para poder seguir. La identidad no pide nada (el
    // apellido es opcional y el número viene con el del puesto puesto) y el último
    // paso tampoco: el ritmo viene elegido de fábrica y el arranque ya no se elige.
    const faltaDelPaso = step === 0 && countryCode === null ? t.stepMissingNationality
        : step === 2 && position === null ? t.stepMissingPosition
            : null;

    const stepClass = (index: number) => `${styles.creatorStep} ${index === step ? styles.creatorStepOn : ''}`;

    return (
        <div className={styles.creator}>
            {/* CABECERA: una línea. Lo que ocupa alto acá se lo saca a la grilla
                de países, que es lo único que de verdad lo necesita. */}
            <header className={styles.creatorHead}>
                <span className={styles.eyebrow}>{t.createEyebrow}</span>
                {/* h2, no h1: el único h1 de la página es el título del juego,
                    que CareerFlow mantiene presente en todos los pasos. */}
                <h2 className={styles.creatorTitle}>{t.createTitle}</h2>
                <p className={styles.creatorLead}>{t.createLead}</p>
            </header>

            {/* LA BARRA DE PASOS, sólo en el teléfono. Arriba y con el nombre
                del paso: sin saber cuántos faltan, cuatro pantallas seguidas se
                sienten un formulario sin fondo. */}
            <div className={styles.stepBar}>
                <p className={styles.stepName}>
                    {STEPS[step]}
                    <span className={styles.stepCount}>{t.stepCount(step + 1, STEPS.length)}</span>
                </p>
                <div className={styles.stepTrack} role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={t.stepAria(step + 1, STEPS.length, STEPS[step])}>
                    {STEPS.map((name, i) => (
                        <span key={name} className={`${styles.stepSeg} ${i <= step ? styles.stepSegOn : ''}`} />
                    ))}
                </div>
            </div>

            <div className={styles.creatorBody}>
                <section className={`${styles.creatorCol} ${stepClass(3)}`} aria-labelledby="crear-identidad">
                    <h3 className={styles.colTitle} id="crear-identidad">{t.identity}</h3>

                    <JerseyPreview surname={surname} number={chosenNumber} countryCode={countryCode} />

                    <label className={styles.label} htmlFor="crear-apellido">{t.surname}</label>
                    <input
                        id="crear-apellido"
                        type="text"
                        className={styles.textInput}
                        value={surname}
                        onChange={(e) => onSurname(e.target.value.slice(0, SURNAME_MAX))}
                        maxLength={SURNAME_MAX}
                        placeholder={t.surnamePlaceholder}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <p className={styles.fieldHint}>{t.surnameHint}</p>

                    {/* El número solo se pregunta cuando hay algo que elegir: el
                        apertura es 10 y el hooker 2, no hay decisión ahí. */}
                    {numbers.length > 1 && (
                        <>
                            {/* "Número" a secas no explicaba por qué aparecen
                                dos botones sueltos: hay que saber que la
                                segunda línea son los dorsales 4 y 5. La
                                etiqueta lo dice. */}
                            <h4 className={styles.label} id="crear-numero">{t.pickYourNumber}</h4>
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
                        </>
                    )}
                </section>

                <section className={`${styles.creatorCol} ${stepClass(0)}`} aria-labelledby="crear-nacionalidad">
                    <h3 className={styles.colTitle} id="crear-nacionalidad">{t.nationality}</h3>
                    <CountryPicker value={countryCode} onChange={onCountry} fitToBox />
                </section>

                <section className={`${styles.creatorCol} ${styles.creatorColWide} ${stepClass(2)}`} aria-labelledby="crear-posicion">
                    <h3 className={styles.colTitle} id="crear-posicion">{t.position}</h3>
                    {/* Sin etiqueta debajo repitiendo el puesto elegido: el
                        chip de la cancha ya lo dice, y en verde. Decirlo dos
                        veces es ruido, no confirmación. */}
                    <PitchPositions value={position} onChange={onPosition} />
                    {position === null && (
                        <p className={styles.fieldHint}>{t.tapPositionHint}</p>
                    )}
                </section>
            </div>

            {/* BANDA: la ruta a lo ancho. Es la cuarta decisión y no entra como
                columna — como banda usa el ancho, que es lo que sobra.
                El ritmo la acompaña acá y no en una banda propia: es la decisión
                más liviana de las cinco (viene elegida de fábrica) y una segunda
                fila entera para ella le sacaría alto a la cancha. */}
            {/* BANDA: el ritmo a lo ancho, un tercio del contenedor por modo.
                Acá había además una banda de "Cómo empezás" con las tres rutas, y
                cuando la elección se fue quedó como un párrafo explicando que no
                se elige nada. Un bloque que no se toca no se gana tres cuartos del
                ancho: se saca. El ritmo pasa a ser la única banda y usa el
                contenedor entero, que es lo que hace que las tres opciones entren
                con su explicación al lado del nombre en vez de apretadas. */}
            <div className={styles.creatorBands}>
                {/* CLUB DE INICIO. Va como banda y no como columna porque es una
                    decisión de dos botones: la lista de clubes vive en su propia
                    pantalla, que es la única forma de mostrar doscientos escudos
                    sin comerse la creación entera. */}
                <section className={`${styles.bandPace} ${stepClass(1)}`} aria-labelledby="crear-club">
                    <h3 className={styles.colTitle} id="crear-club">{t.startClub}</h3>
                    <div className={styles.paceRow} role="radiogroup" aria-labelledby="crear-club">
                        <button
                            type="button"
                            role="radio"
                            aria-checked={startClubId === null}
                            className={`${styles.paceChip} ${startClubId === null ? styles.paceChipOn : ''}`}
                            onClick={onRandomClub}
                        >
                            <span className={styles.paceHead}>
                                <span className={styles.paceName}>{t.startClubRandom}</span>
                            </span>
                            <span className={styles.paceText}>{t.startClubRandomText}</span>
                        </button>
                        <button
                            type="button"
                            role="radio"
                            aria-checked={startClubId !== null}
                            className={`${styles.paceChip} ${startClubId !== null ? styles.paceChipOn : ''}`}
                            onClick={onPickClub}
                            disabled={!puedeElegirClub}
                        >
                            <span className={styles.paceHead}>
                                <span className={styles.paceName}>{t.startClubChoose}</span>
                            </span>
                            <span className={styles.paceText}>
                                {/* El deshabilitado dice qué falta: primero la
                                    nacionalidad, y si el país no tiene liga propia,
                                    por qué no se puede elegir. */}
                                {countryCode === null ? t.startClubPickFirst
                                    : !puedeElegirClub ? t.startClubNoLadder
                                        : t.startClubChooseText}
                            </span>
                        </button>
                    </div>

                    {/* El club elegido, con escudo: sin verlo, "Elegir club" es una
                        promesa que el jugador no puede comprobar hasta empezar. */}
                    {clubElegido && (
                        <div className={styles.startClubRow}>
                            <ClubBadge clubId={clubElegido.id} clubName={clubElegido.labelEs} size={26} />
                            <span className={styles.startClubName}>{clubElegido.labelEs}</span>
                            <button type="button" className={styles.linkBtn} onClick={onPickClub}>
                                {t.startClubChange}
                            </button>
                        </div>
                    )}
                </section>

                <section className={`${styles.bandPace} ${stepClass(4)}`} aria-labelledby="crear-ritmo">
                    <h3 className={styles.colTitle} id="crear-ritmo">{t.pace}</h3>
                    <div className={styles.paceRow} role="radiogroup" aria-labelledby="crear-ritmo">
                        {t.paces.map((pace) => {
                            const selected = paceMode === pace.id;
                            return (
                                <button
                                    key={pace.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    className={`${styles.paceChip} ${selected ? styles.paceChipOn : ''}`}
                                    onClick={() => onPaceMode(pace.id)}
                                >
                                    <span className={styles.paceHead}>
                                        <span className={styles.paceName}>{pace.label}</span>
                                        <span className={styles.paceTag}>{pace.tag}</span>
                                    </span>
                                    {/* La explicación estaba SOLO en el `title`, o sea
                                        invisible en teléfono y para quien no pasa el
                                        mouse. Ahora se lee: es la diferencia entre
                                        elegir y adivinar. */}
                                    <span className={styles.paceText}>{pace.text}</span>
                                </button>
                            );
                        })}
                    </div>
                </section>
            </div>

            {/* PIE: barra fija dentro de la tarjeta. El mensaje de qué falta va
                AL LADO del botón y no debajo, para que no empuje el layout cada
                vez que aparece y desaparece. */}
            <footer className={styles.creatorFoot}>
                <button type="button" className={styles.ghostBtn} onClick={onBack}>{t.back}</button>
                <div className={styles.creatorFootRight}>
                    {!ready && (
                        <p className={styles.hintText} aria-live="polite">
                            {t.missingList(faltan)}
                        </p>
                    )}
                    <button type="button" className={styles.primaryBtn} onClick={onStart} disabled={!ready}>
                        {t.startCareer}
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                    </button>
                </div>
            </footer>

            {/* PIE DE PASOS, sólo en el teléfono. Volver y Continuar SIEMPRE en
                el mismo lugar: si el botón se moviera de pantalla en pantalla,
                cada paso obligaría a buscarlo de nuevo. Lo que falta se dice
                arriba del botón y con `aria-live`, no dentro del botón: un
                botón que cambia de texto según lo que falta deja de ser el
                mismo botón. */}
            <footer className={styles.stepFoot}>
                {faltaDelPaso && <p className={styles.stepHint} aria-live="polite">{faltaDelPaso}</p>}
                <div className={styles.stepFootRow}>
                    <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={() => (step === 0 ? onBack() : setStep(step - 1))}
                    >
                        {t.back}
                    </button>
                    {step === last ? (
                        <button type="button" className={styles.primaryBtn} onClick={onStart} disabled={!ready}>
                            {t.startCareer}
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                        </button>
                    ) : (
                        <button
                            type="button"
                            className={styles.primaryBtn}
                            onClick={() => setStep(step + 1)}
                            disabled={faltaDelPaso !== null}
                        >
                            {t.next}
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                        </button>
                    )}
                </div>
            </footer>
        </div>
    );
}
