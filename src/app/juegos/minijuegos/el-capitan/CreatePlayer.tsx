'use client';

import { useId, useMemo, useState } from 'react';
import type { CreateCaptainInput, PositionFamilyId } from '@/features/captain';
import {
    ALL_FAMILIES,
    ATTRIBUTE_LABEL,
    archetypeDelta,
    archetypesFor,
    baseAttributes,
    clubLabel,
    getFamily,
    startingClubPool,
} from '@/features/captain';
import { FREQUENT_COUNTRY_CODES, SELECTABLE_NATIONALITIES, findCountry, flagPathOf } from '@/features/captain/data/catalogs';
import { FIRST_NAMES, SURNAMES } from '@/features/captain/data/names';
import Jersey from './Jersey';
import ClubBadge from './ClubBadge';
import PickerSelect, { type PickerOption } from './PickerSelect';
import { careerGoals, type CareerGoalId } from './legacy';
import styles from './capitan.module.css';

/**
 * EL ARRANQUE, EN UN SOLO PANEL.
 *
 * Antes eran seis pantallas con un riel de pasos: nombre, país, puesto, perfil,
 * meta y club, una por vez. Seis «Siguiente» para empezar a jugar es un trámite,
 * y el jugador no veía nunca el conjunto de lo que estaba armando.
 *
 * Ahora es la ficha de inscripción de un juego de deportes: todo a la vista y
 * en el orden en que se lee una ficha —de dónde sos y dónde arrancás, cómo te
 * llamás, qué puesto, qué clase de jugador, qué querés que quede— con un botón
 * «Al azar» arriba que la llena entera para el que quiere jugar ya, y un botón
 * grande abajo que dice qué falta mientras falte algo (CLAUDE.md §6).
 *
 * El país y el club van en desplegables nativos: en el teléfono abren la rueda
 * del sistema, que es el control más cómodo que existe para elegir uno entre
 * doscientos, y no le roban media pantalla a la ficha.
 *
 * El nombre es OPCIONAL: vacío, sale uno de la lista de nombres del juego al
 * empezar. Nadie tiene que inventar un apellido para probar.
 */

const DESTACADOS = SELECTABLE_NATIONALITIES.filter((c) => FREQUENT_COUNTRY_CODES.includes(c.code));
const RESTO = SELECTABLE_NATIONALITIES.filter((c) => !FREQUENT_COUNTRY_CODES.includes(c.code));

/** La bandera chica de una opción. Decorativa: el nombre va al lado. */
function Bandera({ code }: { code: string }) {
    // eslint-disable-next-line @next/next/no-img-element -- SVG local estático
    return <img src={flagPathOf(code)} alt="" width={26} height={18} className={styles.pickerFlag} loading="lazy" />;
}

/** Los países, con los de siempre primero. Se arma una vez: el catálogo no cambia. */
const PAISES: readonly PickerOption[] = [
    ...DESTACADOS.map((c) => ({ value: c.code, label: c.nameEs, icon: <Bandera code={c.code} />, group: 'Los de siempre' })),
    ...RESTO.map((c) => ({ value: c.code, label: c.nameEs, icon: <Bandera code={c.code} />, group: 'Todos' })),
];

/** El valor del sorteo en el desplegable de club. */
const AL_AZAR = '__al-azar__';

export default function CreatePlayer({
    onStart,
    sortear,
}: {
    onStart: (input: CreateCaptainInput) => void;
    /**
     * Los dados de la PANTALLA, para «Al azar» y el nombre vacío: un número en
     * [0, 1). Llegan del orquestador porque es el único archivo del juego con
     * permiso de usar `Math.random` (CLAUDE.md de captain §1). No tocan la
     * carrera: lo que sortean son elecciones del formulario, y la carrera sale
     * igual de la semilla más esas elecciones.
     */
    sortear: () => number;
}) {
    const ids = useId();
    const [name, setName] = useState('');
    const [surname, setSurname] = useState('');
    const [countryCode, setCountryCode] = useState('ar');
    const [family, setFamily] = useState<PositionFamilyId | null>(null);
    const [number, setNumber] = useState<number | null>(null);
    const [archetype, setArchetype] = useState<string | null>(null);
    const [goal, setGoal] = useState<CareerGoalId | null>(null);
    /** El club de arranque: `null` es el sorteo del motor, que es el default. */
    const [clubId, setClubId] = useState<string | null>(null);

    const pais = findCountry(countryCode);
    const pool = useMemo(
        () => [...startingClubPool(countryCode)].sort((a, b) => clubLabel(a.id).localeCompare(clubLabel(b.id), 'es')),
        [countryCode],
    );
    const goals = useMemo(() => careerGoals(countryCode), [countryCode]);
    const perfiles = useMemo(() => (family ? archetypesFor(family) : []), [family]);
    const metaElegida = goals.find((g) => g.id === goal) ?? null;

    /** Los clubes, con su escudo, y el sorteo arriba de todo. */
    const clubes = useMemo<PickerOption[]>(() => [
        {
            value: AL_AZAR,
            label: pool.length === 0 ? 'Sin clubes de tu país' : 'Al azar',
            hint: pool.length === 0 ? undefined : 'Casi siempre uno chico',
            icon: <span className={styles.pickerEmoji}>🎲</span>,
        },
        ...pool.map((c) => ({
            value: c.id,
            label: clubLabel(c.id),
            icon: <ClubBadge clubId={c.id} clubName={clubLabel(c.id)} size={26} />,
        })),
    ], [pool]);

    /** Las metas, con su ícono y lo que cuestan. */
    const metas = useMemo<PickerOption[]>(
        () => goals.map((g) => ({ value: g.id, label: g.label, hint: g.hint, icon: <span className={styles.pickerEmoji}>{g.icon}</span> })),
        [goals],
    );

    const elegir = <T,>(xs: readonly T[]): T => xs[Math.floor(sortear() * xs.length) % xs.length];

    function pickCountry(code: string) {
        setCountryCode(code);
        // El club era de otro sistema: se vuelve al sorteo.
        setClubId(null);
    }

    function pickFamily(id: PositionFamilyId) {
        setFamily(id);
        setNumber(getFamily(id).numbers[0]);
        // El arquetipo es de un puesto: cambiar de puesto lo deja sin sentido.
        setArchetype(null);
    }

    /** «Al azar»: llena la ficha entera. El nombre queda como está si ya hay uno. */
    function alAzar() {
        const code = elegir(DESTACADOS).code;
        const fam = elegir(ALL_FAMILIES);
        setCountryCode(code);
        setClubId(null);
        setFamily(fam);
        setNumber(elegir(getFamily(fam).numbers));
        setArchetype(elegir(archetypesFor(fam)).id);
        setGoal(elegir(careerGoals(code)).id);
    }

    const faltan: string[] = [];
    if (!family) faltan.push('un puesto');
    if (family && !archetype) faltan.push('qué clase de jugador sos');
    if (!goal) faltan.push('tu objetivo');
    const listo = faltan.length === 0;
    /** «un puesto y tu objetivo»: la lista en castellano, con «y» antes del último. */
    const queFalta = faltan.length > 1 ? `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}` : faltan[0];

    function jugar() {
        if (!listo || !family) return;
        onStart({
            name: name.trim() || elegir(FIRST_NAMES),
            surname: surname.trim() || elegir(SURNAMES),
            family,
            countryCode,
            ...(number !== null ? { number } : {}),
            ...(clubId !== null ? { clubId } : {}),
            ...(goal !== null ? { goal } : {}),
            ...(archetype !== null ? { archetype } : {}),
        });
    }

    return (
        <div className={`${styles.card} ${styles.signup}`}>
            <div className={styles.signupHead}>
                <span className={styles.signupTitle}>Tu arranque</span>
                <button type="button" className={styles.signupDice} onClick={alAzar}>
                    <span aria-hidden="true">🎲</span> Al azar
                </button>
            </div>

            <div className={styles.signupGrid}>
                <div className={styles.signupMain}>
                    {/* ── De dónde sos y dónde arrancás ────────────────────── */}
                    <div className={`${styles.signupPair} ${styles.signupPairWide}`}>
                        <PickerSelect
                            label="Nacionalidad"
                            value={countryCode}
                            options={PAISES}
                            onChange={pickCountry}
                        />
                        <PickerSelect
                            label="Club"
                            value={clubId ?? AL_AZAR}
                            options={clubes}
                            onChange={(v) => setClubId(v === AL_AZAR ? null : v)}
                            disabled={pool.length === 0}
                        />
                    </div>

                    {/* ── Cómo te llamás ───────────────────────────────────── */}
                    <div className={styles.signupPair}>
                        <label className={styles.signupField}>
                            <span className={styles.signupLabel}>Nombre</span>
                            <input
                                className={styles.signupInput}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Opcional"
                                maxLength={20}
                                autoComplete="off"
                            />
                        </label>
                        <label className={styles.signupField}>
                            <span className={styles.signupLabel}>Apellido</span>
                            <input
                                className={styles.signupInput}
                                value={surname}
                                onChange={(e) => setSurname(e.target.value)}
                                placeholder="Opcional"
                                maxLength={20}
                                autoComplete="off"
                            />
                        </label>
                    </div>

                    {/* ── El puesto: la decisión más determinante del juego ── */}
                    <span className={styles.signupLabel} id={`${ids}-puesto`}>Puesto</span>
                    <div className={styles.signupPositions} role="radiogroup" aria-labelledby={`${ids}-puesto`}>
                        {ALL_FAMILIES.map((id) => {
                            const def = getFamily(id);
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    role="radio"
                                    aria-checked={family === id}
                                    className={`${styles.signupPos} ${family === id ? styles.signupPosOn : ''}`}
                                    onClick={() => pickFamily(id)}
                                >
                                    <span className={styles.signupPosNum}>{def.numbers.join('·')}</span>
                                    <span className={styles.signupPosName}>{def.labelEs}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Un solo dorsal no es una elección: la fila aparece sólo
                        cuando el puesto tiene más de uno. */}
                    {family && getFamily(family).numbers.length > 1 && (
                        <div className={styles.signupNumbers} role="radiogroup" aria-label="Tu dorsal">
                            <span className={styles.signupLabel}>Dorsal</span>
                            {getFamily(family).numbers.map((n) => (
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
                    )}

                    {/* ── Qué clase de jugador sos ─────────────────────────────
                        Aparece cuando hay puesto: es una pregunta SOBRE el
                        puesto. Mueve puntos entre dos atributos de la media sin
                        subirla (`data/archetypes.ts`). */}
                    {family && (
                        <>
                            <span className={styles.signupLabel} id={`${ids}-perfil`}>
                                ¿Qué clase de {getFamily(family).labelEs.toLowerCase()} sos?
                            </span>
                            <div className={styles.signupArchetypes} role="radiogroup" aria-labelledby={`${ids}-perfil`}>
                                {perfiles.map((a, i) => (
                                    <button
                                        key={a.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={archetype === a.id}
                                        className={`${styles.signupArch} ${archetype === a.id ? styles.signupArchOn : ''}`}
                                        onClick={() => setArchetype(a.id)}
                                    >
                                        <span className={styles.signupArchNum} aria-hidden="true">{['I', 'II', 'III'][i]}</span>
                                        <span className={styles.signupArchName}>{a.label}</span>
                                        <span className={styles.signupArchChips}>
                                            {Object.entries(archetypeDelta(a)).map(([k, d]) => (
                                                <span key={k} className={d! < 0 ? styles.signupChipMinus : styles.signupChip}>
                                                    {d! > 0 ? `+${d}` : d} {ATTRIBUTE_LABEL[k as keyof typeof ATTRIBUTE_LABEL]}
                                                </span>
                                            ))}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            {archetype && (
                                <p className={styles.signupNote}>
                                    {perfiles.find((a) => a.id === archetype)?.text}
                                </p>
                            )}
                        </>
                    )}

                    {/* ── Qué querés que quede ─────────────────────────────── */}
                    <PickerSelect
                        label="Tu objetivo"
                        value={goal}
                        options={metas}
                        onChange={(v) => setGoal(v as CareerGoalId)}
                        placeholder="Elegí qué querés que quede"
                    />
                    {metaElegida && <p className={styles.signupNote}>{metaElegida.hint}</p>}
                </div>

                {/* La camiseta y los cuatro atributos que hacen tu media: lo que
                    estás armando, a la vista mientras lo armás. En el teléfono
                    va abajo; en escritorio, a la derecha. */}
                <div className={styles.signupSide}>
                    <Jersey
                        surname={surname || 'Apellido'}
                        number={number}
                        countryCode={countryCode}
                        countryName={pais?.nameEs}
                    />
                    {family && <Arranque family={family} archetypeId={archetype} />}
                </div>
            </div>

            <button type="button" className={styles.signupPlay} disabled={!listo} onClick={jugar}>
                <span aria-hidden="true">▶</span> Empezar la carrera
            </button>
            {/* El botón deshabilitado siempre dice qué falta (CLAUDE.md §6). */}
            {!listo && <span className={styles.primaryHint}>Elegí {queFalta} para empezar.</span>}
        </div>
    );
}

/**
 * Los cuatro atributos de la media del puesto, con su peso, como arrancan con
 * el perfil elegido. Misma plantilla y mismo traspaso que el motor
 * (`baseAttributes`, `archetypeDelta`): lo que se ve es lo que se juega, menos
 * el ±3 del sorteo.
 */
function Arranque({ family, archetypeId }: { family: PositionFamilyId; archetypeId: string | null }) {
    const def = getFamily(family);
    const base = baseAttributes(family);
    const elegido = archetypesFor(family).find((a) => a.id === archetypeId) ?? null;
    const delta: Partial<Record<string, number>> = elegido ? archetypeDelta(elegido) : {};

    return (
        <div className={styles.attrPreview} aria-label="Tus atributos de arranque, aproximados">
            <span className={styles.attrPreviewHead}>
                <span>Tus atributos</span>
                <span className={styles.attrPreviewNote}>aprox.</span>
            </span>
            {def.attributes.map((k, i) => {
                const d = delta[k] ?? 0;
                const valor = Math.max(20, Math.min(99, base[k] + d));
                return (
                    <div key={k} className={styles.attrPreviewRow}>
                        <span className={styles.attrPreviewLabel}>
                            {ATTRIBUTE_LABEL[k]}
                            <span className={styles.attrPreviewWeight}>{def.weights[i]}%</span>
                        </span>
                        <span className={styles.attrPreviewTrack} aria-hidden="true">
                            <span className={styles.attrPreviewFill} style={{ transform: `scaleX(${valor / 99})` }} />
                        </span>
                        <span className={styles.attrPreviewValue}>
                            {valor}
                            {d !== 0 && (
                                <span className={d > 0 ? styles.attrPreviewUp : styles.attrPreviewDown}>
                                    {d > 0 ? ` +${d}` : ` ${d}`}
                                </span>
                            )}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
