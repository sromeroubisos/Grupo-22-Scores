'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CreateCaptainInput, PositionFamilyId } from '@/features/captain';
import { ALL_FAMILIES, getFamily, startingClubPool } from '@/features/captain';
import { findCountry } from '@/features/captain/data/catalogs';
import ClubPicker from './ClubPicker';
import CountryPicker from './CountryPicker';
import Jersey from './Jersey';
import styles from './capitan.module.css';

/**
 * Los pasos del registro, en orden. La etiqueta es la del riel de arriba y va
 * corta a propósito: en 360 px tienen que entrar todos en un renglón sin
 * cortarse.
 *
 * El club va ÚLTIMO y no pegado al país, aunque salga de él: es la única
 * pregunta que se puede no contestar —el sorteo la contesta por vos— y la
 * pantalla que la hace es también la que dice «Empezar la carrera», así que lo
 * último que ves antes de arrancar es dónde arrancás.
 */
const PASOS = [
    { id: 'nombre', crumb: 'Nombre' },
    { id: 'pais', crumb: 'País' },
    { id: 'puesto', crumb: 'Puesto' },
    { id: 'club', crumb: 'Club' },
] as const;

type PasoId = (typeof PASOS)[number]['id'];

/**
 * El alta del jugador, UNA PREGUNTA POR PANTALLA.
 *
 * Antes las tres entraban juntas en una tarjeta y el formulario medía 717 px de
 * alto: en un teléfono el puesto —«la decisión más determinante del juego»—
 * aparecía después de doscientos y pico de países, o sea que se elegía a las
 * apuradas y de scroll. Partido en pasos, cada pregunta tiene la pantalla para
 * ella sola y el botón de avanzar está siempre a la vista.
 *
 * La camiseta NO se parte: acompaña a los pasos y va sumando lo que el jugador
 * decide —el apellido, los colores de su unión, el dorsal—. Es lo único de esta
 * pantalla que no pide nada, devuelve, y es lo que hace que varias pantallas se
 * lean como una sola cosa que se está armando.
 */
export default function CreatePlayer({ onStart }: { onStart: (input: CreateCaptainInput) => void }) {
    const [paso, setPaso] = useState(0);
    const [name, setName] = useState('');
    const [surname, setSurname] = useState('');
    const [family, setFamily] = useState<PositionFamilyId | null>(null);
    const [countryCode, setCountryCode] = useState('ar');
    /**
     * El dorsal DENTRO de la familia: es lo que distingue al pilar izquierdo del
     * derecho sin partir la familia en dos, y el motor ya lo acepta por entrada
     * (`CreateCaptainInput.number`). Sin puesto elegido todavía no hay ninguno,
     * y la espalda va limpia.
     *
     * No es un cuarto paso: no se elige un dorsal suelto, se elige el puesto y
     * el dorsal es cuál de ese puesto. Vive adentro del paso tres.
     */
    const [number, setNumber] = useState<number | null>(null);
    /**
     * El club de origen. `sorteo` es el default y es el juego de siempre: el
     * motor te ubica, y pondera a los chicos porque hay muchos más clubes de
     * barrio que clubes grandes. `clubId` sólo viaja al motor con el sorteo
     * apagado — con él prendido, un id viejo que quedó de una vuelta atrás no
     * puede colarse.
     */
    const [sorteo, setSorteo] = useState(true);
    const [clubId, setClubId] = useState<string | null>(null);

    /**
     * DÓNDE PUEDE EMPEZAR ESTE JUGADOR. Sale del motor y no de un filtro de acá:
     * es el mismo conjunto del que sortea `startingClub` (§1.9 del CLAUDE.md de
     * captain). Vacío en las uniones que no tienen clubes en el catálogo —la
     * mayoría—, y ahí la carrera arranca sin club, que es lo que ya hacía.
     */
    const pool = useMemo(() => startingClubPool(countryCode), [countryCode]);

    /**
     * El paso del club NO EXISTE cuando no hay nada que elegir. Una pantalla con
     * una sola salida no es una pregunta, y el riel diría «4 de 4» para algo que
     * el jugador no decide.
     */
    const pasos = useMemo(() => PASOS.filter((p) => p.id !== 'club' || pool.length > 0), [pool]);
    /**
     * El índice se acota en la lectura y no con un efecto: cambiar de país achica
     * la lista de pasos, y un `paso` que quedó afuera tiene que resolverse en el
     * mismo render, sin una pasada intermedia leyendo `pasos[3]` inexistente.
     */
    const pasoIx = Math.min(paso, pasos.length - 1);
    const actual: PasoId = pasos[pasoIx].id;
    const ultimo = pasos.length - 1;

    /**
     * Cambiar de pantalla sin mover el foco deja al lector de pantalla parado en
     * un botón que ahora dice otra cosa, y al teclado en el pie de una tarjeta
     * que ya no existe. Se manda al título del paso nuevo, que además arrastra
     * el scroll hasta arriba de la tarjeta —justo lo que hace falta cuando venís
     * de tocar «Siguiente» al fondo de la lista de países—.
     *
     * En el primer render no: ahí el foco todavía es del navegador.
     */
    const tituloRef = useRef<HTMLHeadingElement>(null);
    const montado = useRef(false);
    useEffect(() => {
        if (!montado.current) {
            montado.current = true;
            return;
        }
        tituloRef.current?.focus();
    }, [pasoIx]);

    const numbers = family === null ? [] : getFamily(family).numbers;
    const pais = findCountry(countryCode);

    const nombreListo = name.trim().length > 0 && surname.trim().length > 0;
    /**
     * Qué paso está resuelto. El país no puede faltar —arranca en Argentina y el
     * selector no ofrece vaciarlo—, así que su casilla es siempre verdadera; la
     * del club lo es mientras el sorteo esté prendido, que es el default.
     */
    const resuelto: Record<PasoId, boolean> = {
        nombre: nombreListo,
        pais: true,
        puesto: family !== null,
        club: sorteo || clubId !== null,
    };
    const pasoListo = resuelto[actual];
    /** Al riel sólo se salta si todo lo de antes ya está resuelto. */
    const alcanzable = (i: number) => pasos.slice(0, i).every((p) => resuelto[p.id]);

    /** Al cambiar de puesto, el dorsal viejo no pertenece más: se cae al primero. */
    function pickFamily(id: PositionFamilyId) {
        setFamily(id);
        setNumber(getFamily(id).numbers[0]);
    }

    /**
     * Al cambiar de país, el club elegido deja de existir para este jugador: era
     * de otro sistema. Se vuelve al sorteo, que es el default.
     */
    function pickCountry(code: string) {
        setCountryCode(code);
        setSorteo(true);
        setClubId(null);
    }

    function avanzar() {
        if (!pasoListo) return;
        if (pasoIx < ultimo) {
            setPaso(pasoIx + 1);
            return;
        }
        if (!family) return;
        onStart({
            name: name.trim(),
            surname: surname.trim(),
            family,
            countryCode,
            ...(number !== null ? { number } : {}),
            ...(!sorteo && clubId !== null ? { clubId } : {}),
        });
    }

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>Paso {pasoIx + 1} de {pasos.length}</span>

            {/* El riel no es adorno: dice cuántas pantallas faltan —sin eso, un
                formulario partido se siente más largo que el entero— y deja
                volver a lo que ya contestaste sin perder el resto. */}
            <ol className={styles.stepRail} aria-label="Pasos de la creación">
                {pasos.map((p, i) => (
                    // Con cuatro casillas en 360 px el nombre del paso no entra en
                    // ninguna: la casilla da ~62 px y "Nombre" pide 45 más el
                    // número. El riel marca cuál es la actual y le da a ESA el
                    // ancho —el resto queda en el número, que es lo que cuenta las
                    // pantallas—. El reparto vive en la hoja; acá va la marca.
                    <li key={p.id} className={`${styles.stepSlot} ${i === pasoIx ? styles.stepSlotOn : ''}`}>
                        <button
                            type="button"
                            className={`${styles.crumb} ${i === pasoIx ? styles.crumbOn : ''} ${i < pasoIx ? styles.crumbDone : ''}`}
                            aria-current={i === pasoIx ? 'step' : undefined}
                            disabled={!alcanzable(i)}
                            onClick={() => setPaso(i)}
                        >
                            <span className={styles.crumbNum}>{i + 1}</span>
                            <span className={styles.crumbName}>{p.crumb}</span>
                        </button>
                    </li>
                ))}
            </ol>

            {/* Izquierda la pregunta del paso, derecha la camiseta. En teléfono
                esto es un `div` y la camiseta cae abajo del campo; el reparto lo
                enciende el escalón de 980 px, al final de la hoja. */}
            <div className={styles.createGrid}>
                <div className={styles.createStep}>
                    {actual === 'nombre' && (
                        <>
                            <h2 className={styles.cardTitle} ref={tituloRef} tabIndex={-1}>¿Quién sos?</h2>
                            {/* Los dieciséis siguen a `START_AGE`, no al revés. */}
                            <p className={styles.cardText}>
                                Tenés dieciséis y recién empezás a entrenar con los grandes. Lo que
                                venga después lo vas a escribir vos.
                            </p>

                            <div className={styles.field}>
                                <label className={styles.fieldLabel} htmlFor="cap-nombre">Nombre y apellido</label>
                                <div className={styles.nameRow}>
                                    <input
                                        id="cap-nombre"
                                        className={styles.input}
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') avanzar(); }}
                                        placeholder="Bautista"
                                        maxLength={20}
                                    />
                                    <input
                                        className={styles.input}
                                        value={surname}
                                        onChange={(e) => setSurname(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') avanzar(); }}
                                        placeholder="Uriarte"
                                        maxLength={20}
                                        aria-label="Apellido"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {actual === 'pais' && (
                        <>
                            <h2 className={styles.cardTitle} ref={tituloRef} tabIndex={-1}>¿De dónde sos?</h2>
                            <p className={styles.cardText}>
                                De acá salen el club donde empezás y la unión que te puede convocar.
                            </p>

                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Tu nacionalidad</span>
                                <CountryPicker value={countryCode} onChange={pickCountry} />
                            </div>
                        </>
                    )}

                    {actual === 'puesto' && (
                        <>
                            <h2 className={styles.cardTitle} ref={tituloRef} tabIndex={-1}>¿Qué puesto jugás?</h2>
                            {/* Corto a propósito: en 390 px cada renglón de más
                                empuja el botón otros 23 px de scroll. */}
                            <p className={styles.cardText}>
                                Es la decisión más determinante del juego.
                            </p>

                            <div className={styles.field}>
                                <span className={styles.fieldLabel} id="cap-puesto">Tu puesto</span>
                                <div className={styles.choices} role="radiogroup" aria-labelledby="cap-puesto">
                                    {ALL_FAMILIES.map((id) => {
                                        const def = getFamily(id);
                                        return (
                                            <button
                                                key={id}
                                                type="button"
                                                role="radio"
                                                aria-checked={family === id}
                                                className={`${styles.choice} ${family === id ? styles.choiceOn : ''}`}
                                                onClick={() => pickFamily(id)}
                                            >
                                                <span className={styles.choiceName}>{def.labelEs}</span>
                                                <span className={styles.choiceNumbers}>{def.numbers.join(' · ')}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Un solo dorsal no es una elección: el hooker es el 2 y no
                                hay nada que preguntarle. La fila aparece únicamente
                                cuando la familia tiene más de uno. */}
                            {numbers.length > 1 && (
                                <div className={styles.field}>
                                    <span className={styles.fieldLabel} id="cap-dorsal">Tu dorsal</span>
                                    <div className={styles.numbers} role="radiogroup" aria-labelledby="cap-dorsal">
                                        {numbers.map((n) => (
                                            <button
                                                key={n}
                                                type="button"
                                                role="radio"
                                                aria-checked={number === n}
                                                className={`${styles.numberChip} ${number === n ? styles.numberChipOn : ''}`}
                                                onClick={() => setNumber(n)}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {actual === 'club' && (
                        <>
                            <h2 className={styles.cardTitle} ref={tituloRef} tabIndex={-1}>¿Dónde te hacés?</h2>
                            {/* Las dos cosas que hay que saber para elegir: que la
                                lista es la de abajo —a primera se llega— y que el
                                club de origen es el único que después puede
                                ponerle tu nombre a la cancha. */}
                            <p className={styles.cardText}>
                                Un club de los de abajo. Es el que te espera si volvés.
                            </p>

                            <div className={styles.field}>
                                <span className={styles.fieldLabel} id="cap-club">Tu primer club</span>
                                <div className={styles.choices} role="radiogroup" aria-labelledby="cap-club">
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={sorteo}
                                        className={`${styles.choice} ${sorteo ? styles.choiceOn : ''}`}
                                        onClick={() => setSorteo(true)}
                                    >
                                        <span className={styles.choiceName}>Al azar</span>
                                        <span className={styles.choiceHint}>Casi siempre uno chico</span>
                                    </button>
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={!sorteo}
                                        className={`${styles.choice} ${!sorteo ? styles.choiceOn : ''}`}
                                        onClick={() => setSorteo(false)}
                                    >
                                        <span className={styles.choiceName}>Elegir el club</span>
                                        <span className={styles.choiceHint}>
                                            {pool.length} en {pais?.nameEs ?? 'tu país'}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {!sorteo && (
                                <div className={styles.field}>
                                    <ClubPicker clubs={pool} value={clubId} onChange={setClubId} />
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className={styles.createKit}>
                    <Jersey
                        surname={surname}
                        number={number}
                        countryCode={countryCode}
                        countryName={pais?.nameEs}
                    />
                </div>
            </div>

            <button
                type="button"
                className={styles.primary}
                disabled={!pasoListo}
                onClick={avanzar}
            >
                {pasoIx < ultimo ? 'Siguiente' : 'Empezar la carrera'}
            </button>
            {/* El botón deshabilitado siempre dice qué falta (CLAUDE.md §6). */}
            {!pasoListo && (
                <span className={styles.primaryHint}>
                    {actual === 'nombre' && 'Poné tu nombre y tu apellido para seguir.'}
                    {actual === 'puesto' && 'Elegí un puesto para empezar.'}
                    {actual === 'club' && 'Elegí un club de la lista, o volvé al azar.'}
                </span>
            )}
            {pasoIx > 0 && (
                <button type="button" className={styles.ghost} onClick={() => setPaso(pasoIx - 1)}>
                    Volver
                </button>
            )}
        </div>
    );
}
