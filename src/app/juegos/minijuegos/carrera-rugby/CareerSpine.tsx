'use client';

import { useEffect, useRef, useState } from 'react';
import type { CareerSeasonEntry, CareerState, UiStrings } from '@/features/career';
import {
    competitionLabelOf, computeOvr, countryNameIn, debutLevel, divisionMoveFor, emptyStats,
    employmentRank, getClub, hasUnion, secondaryStatLabelIn, secondaryStatOf, selectionValue,
    unionAbsenceReason, unionName, worldRankingAt, worldRankingDelta, RANKED_UNION_COUNT,
    SEASONS_PER_DECISION,
} from '@/features/career';
import { useLocale } from './LocaleContext';
import ClubBadge from './ClubBadge';
import Flag from './Flag';
import { ovrBand } from './ovrBand';
import styles from './carrera.module.css';

interface Props {
    career: CareerState;
}

/** Hasta qué edad se dibuja el futuro. Nadie juega más allá en este motor. */
const LAST_AGE = 39;

/** Las temporadas de un tramo, ya resumidas en una fila. */
interface Block {
    ageFrom: number;
    ageTo: number;
    entries: CareerSeasonEntry[];
    /** Planillas crudas de esas mismas temporadas, alineadas 1:1 con `entries`. */
    stats: CareerState['seasons'];
}

/**
 * LA ESPINA DORSAL DE LA CARRERA.
 *
 * Una fila por TRAMO, del debut a los 39, con LA PLANILLA DE CADA TRAMO. Las
 * jugadas van en claro con su club, su OVR y sus números; las que faltan, en
 * gris. De un vistazo se ve dónde estás, qué hiciste y cuánto te queda — y eso
 * es lo que convierte una sucesión de pantallas en UNA CARRERA.
 *
 * El tramo es el del MODO DE RITMO, no la temporada: en Normal una fila son dos
 * temporadas y en Exprés son tres. La tabla mide lo que dura un tramo de
 * decisión, que es la unidad en la que el jugador vive la carrera. Listando año
 * por año medía el doble y, como esta columna no scrollea, esas filas de más
 * salían del alto de las que sí importan.
 *
 * Agrupar NO esconde nada: los partidos, los puntos y los tries se suman, la
 * columna del puesto se recalcula desde las planillas crudas de `seasons[]`
 * —por eso el porcentaje al palo del apertura sigue siendo el del tramo y no el
 * de su última temporada— y los títulos, las lesiones y los pases del tramo
 * quedan como íconos en la fila. El OVR es el del cierre del tramo.
 *
 * Acá viven los totales que antes estaban en la cabecera. No es una mudanza
 * decorativa: repartidos por tramo dicen CUÁNDO pasó cada cosa, que es
 * justamente lo que un acumulado no puede decir, y de paso liberan el banner.
 *
 * Al pie, separada y fija, la SELECCIÓN. Es el único total que se destaca,
 * porque en rugby los caps pesan más que los títulos.
 *
 * No scrollea y tampoco se recorta: si esta columna scrollea deja de ser una
 * espina dorsal y vuelve a ser una lista. Lo que se ajusta es el reparto — las
 * filas comparten el alto disponible y la futura pide la mitad que la jugada,
 * porque es una línea fina.
 */
export default function CareerSpine({ career }: Props) {
    const { locale, t } = useLocale();
    const jugadas = career.history;
    const p = career.player;
    const debut = jugadas[0]?.age ?? p.age;

    // El tramo del modo de ritmo. En Intensa vale 1 y la tabla queda idéntica a
    // la de siempre: una fila por temporada.
    const span = SEASONS_PER_DECISION[career.paceMode];

    // SIEMPRE del debut a los 39. No se recorta ni se scrollea: la carrera
    // entera tiene que estar a la vista, porque su función es mostrar cuánto
    // queda por delante. Las filas se reparten el alto disponible — las
    // jugadas piden más que las futuras, que son una línea fina.
    //
    // `history` y `seasons` se llenan en el mismo push del motor, así que el
    // índice de una es el de la otra: cortarlas con el mismo rango es seguro.
    const bloques: Block[] = [];
    for (let start = debut; start <= LAST_AGE; start += span) {
        const ageTo = Math.min(start + span - 1, LAST_AGE);
        const from = start - debut;
        const to = from + (ageTo - start + 1);
        bloques.push({
            ageFrom: start,
            ageTo,
            entries: jugadas.slice(from, to),
            stats: career.seasons.slice(from, to),
        });
    }

    const edadActual = p.age;

    // Rótulo de la cuarta columna. Sale del PUESTO, que no cambia en toda la
    // carrera, así que coincide con el `secondaryStatLabel` congelado de cada
    // temporada. Se pide con la planilla en cero porque acá interesa el nombre
    // de la ranura, no su valor.
    const secundaria = secondaryStatOf(p.position, emptyStats());
    const secondaryLabel = secondaryStatLabelIn(secundaria.label, locale);
    /**
     * LA COLUMNA DEL PUESTO, SÓLO SI CUENTA ALGO PROPIO.
     *
     * En los pateadores esa ranura es el % al palo, y su encabezado —los palos,
     * que se leen como una "H"— encabezaba un porcentaje al lado de tres
     * contadores: una columna que no se suma con las otras y que encima se comía
     * el lugar de los TRIES, que es lo que se mira en una trayectoria. Para el
     * resto (tackles, metros) la ranura sí aporta y se queda.
     */
    const conSecundaria = secundaria.kind !== 'kick-accuracy';

    // La unión que representa, o la de su nacionalidad mientras no lo convoquen.
    // La fila existe desde el minuto cero: en gris, es una promesa pendiente.
    const union = p.nationalTeam ?? p.eligibility.nationalityCountryCode;
    const debutado = p.nationalTeam !== null;
    /**
     * ¿ESE PAÍS TIENE SELECCIÓN? Es la pregunta que la fila nunca hacía.
     *
     * El bug: se elegía Egipto, se jugaban diecinueve temporadas, y se llegaba al
     * retiro con cero caps sin que nada dijera por qué — mientras la fila decía
     * "Egipto SELECCIONADO", que no sólo no aclara: da a entender que la
     * selección existe y que la convocatoria puede llegar.
     *
     * Que no hubiera una promesa explícita no salvaba nada. El silencio en un
     * lugar donde el jugador espera información ES una promesa, y en rugby, donde
     * los caps pesan más que los títulos, es la más grande del juego.
     */
    const conSeleccion = hasUnion(union);
    // EL RANKING ES DE ESTA TEMPORADA, no del catálogo. Se mueve de a uno o dos
    // puestos por año según lo duro que haya sido el calendario de la unión, y el
    // delta se muestra al lado: un número que cambia sin decir cuánto cambió
    // obliga a acordarse del año pasado.
    const ranking = worldRankingAt(union, p.seasonsPlayed, career.seed);
    const rankingDelta = worldRankingDelta(union, p.seasonsPlayed, career.seed);
    // El rótulo dice EN QUÉ situación está, no sólo si debutó. `dropped` no es
    // lo mismo que no haber jugado nunca: los caps siguen ahí y la fila los
    // sigue mostrando, pero la camiseta hoy la tiene otro.
    //
    // Y el que nunca fue convocado ya NO dice "seleccionado", que era la mitad
    // visible del bug de arriba.
    const rotuloEstado = p.nationalStatus === 'starter' ? t.nationalStatus.starter
        : p.nationalStatus === 'squad' ? t.nationalStatus.squad
        : p.nationalStatus === 'trial' ? t.nationalStatus.trial
        : p.nationalStatus === 'dropped' ? t.nationalStatus.dropped
        : conSeleccion ? t.nationalStatus.none
        : t.nationalStatus['no-union'];

    /**
     * LA SEGUNDA LÍNEA: dónde estás parado, dicho en la primera temporada.
     *
     * Para el que todavía no debutó, la distancia al umbral de debut. No es un
     * número escondido del motor: `selectionValue` y `debutLevel` son los mismos
     * que decide la convocatoria, así que lo que dice acá es exactamente lo que
     * se va a evaluar al cerrar la temporada.
     */
    const puntosQueFaltan = conSeleccion && union !== null
        ? Math.ceil(debutLevel(union, p.employment) - selectionValue(p).total)
        : 0;
    // La nacionalidad viaja en el estado como NOMBRE en español; el código es el
    // que permite traducirla sin tocar el guardado.
    const nacionalidad = countryNameIn(p.eligibility.nationalityCountryCode, p.nationality, locale);
    const notaSeleccion = !conSeleccion
        ? t.noUnionNote(nacionalidad)
        : p.nationalStatus === 'starter' ? t.nationalNote.starter
        : p.nationalStatus === 'squad' ? t.nationalNote.squad
        : p.nationalStatus === 'trial' ? t.nationalNote.trial
        : p.nationalStatus === 'dropped' ? t.nationalNote.dropped
        : puntosQueFaltan > 0
            ? t.callUpGap(puntosQueFaltan)
            : t.nationalNote['in-contention'];

    // Acumulado con ESA camiseta. Es un diccionario por unión y no un total
    // plano a propósito: si cambió de elegibilidad, los caps de una no se suman
    // con los de la otra.
    const nat = (union && p.nationalStats[union]) || {
        caps: 0, points: 0, tries: 0, tackles: 0, metres: 0, kicksAtGoal: 0, kicksMade: 0, wins: 0,
    };
    /**
     * Las copas ganadas CON EL PAÍS, que es donde tienen que figurar.
     *
     * Se DERIVA de `history[]` en vez de guardarse: la regla del proyecto es que
     * lo que ya está en el estado no se duplica. Y se filtra por unión, no solo
     * por "es de selección": si el jugador cambió de elegibilidad, la copa que
     * ganó con la camiseta anterior no la ganó con esta.
     */
    const titulosSeleccion = union === null
        ? 0
        : jugadas.reduce((n, s) => n + s.titlesWon.filter((t) => t.union === union).length, 0);
    // La misma columna del puesto que las filas de club, calculada con los
    // ingredientes crudos que guarda la planilla de selección.
    const secundariaSeleccion = secondaryStatOf(p.position, {
        ...emptyStats(),
        tackles: nat.tackles,
        metres: nat.metres,
        kicksAtGoal: nat.kicksAtGoal,
        kicksMade: nat.kicksMade,
    }).display;
    // "subió 2" y no "+2": el signo solo se lee mal cuando el número que acompaña
    // es un puesto, donde menos es mejor.
    const movimientoRanking = rankingDelta === null || rankingDelta === 0 ? '' : t.rankMovement(rankingDelta);
    const encabezadoSeleccion = conSeleccion && ranking !== null
        ? t.nationalHeading(
            union !== null ? countryNameIn(union, unionName(union), locale) : nacionalidad,
            ranking,
            RANKED_UNION_COUNT,
            movimientoRanking,
        )
        : t.unionAbsence(nacionalidad, unionAbsenceReason(union) === 'suspendida' ? 'suspendida' : 'sin-federacion');
    // La ficha del trofeo es `aria-hidden` (vive dentro del bloque decorativo),
    // así que el título tiene que estar en este texto o no existe para un lector.
    const trofeosSeleccion = titulosSeleccion === 0 ? '' : ` · ${t.nationalTitles(titulosSeleccion)}`;
    const detalleSeleccion = debutado
        ? `${encabezadoSeleccion} · ${rotuloEstado} · ${t.careerTotals} · ${nat.caps} ${t.caps} · ${nat.wins} ${t.won} · ${nat.points} ${t.points.toLowerCase()} · ${nat.tries} ${t.tries.toLowerCase()} · ${secondaryLabel} ${secundariaSeleccion}${trofeosSeleccion} · ${notaSeleccion}`
        : `${encabezadoSeleccion} · ${notaSeleccion}`;

    // El OVR de hoy, para la fila en curso: el tramo que se está jugando
    // todavía no tiene planilla, pero el jugador sí tiene un número.
    const ovrHoy = computeOvr(p.attributes, p.position);

    /**
     * EL ANCHO QUE SE COME LA BARRA DE SCROLL.
     *
     * Las filas viven DENTRO de la lista que scrollea y el encabezado y la fila
     * de la selección, afuera. Donde el sistema dibuja una barra con ancho
     * propio (Windows, escritorio), esos 7-17 px se los descuenta sólo a las
     * filas: los números quedaban corridos respecto de su ícono y la planilla
     * dejaba de leerse como una planilla.
     *
     * Se mide en vez de suponerse: el ancho cambia por sistema, por navegador y
     * por si el usuario tiene barras superpuestas (celular) o clásicas.
     */
    const listaRef = useRef<HTMLOListElement>(null);
    const [barra, setBarra] = useState(0);
    useEffect(() => {
        const el = listaRef.current;
        if (el === null) return;
        const medir = () => setBarra(el.offsetWidth - el.clientWidth);
        medir();
        const observador = new ResizeObserver(medir);
        observador.observe(el);
        return () => observador.disconnect();
    }, []);

    return (
        <div
            className={`${styles.spine} ${conSecundaria ? '' : styles.spineSinPuesto}`}
            style={{ ['--spine-barra' as string]: `${barra}px` }}
        >
            <h2 className={styles.asideTitle} id="espina-titulo">{t.careerColumn}</h2>

            {/* Encabezado de columnas. `aria-hidden` porque cada fila lleva su
                propia descripción completa para el lector de pantalla: leer
                siete rótulos y después siete números sueltos es peor que leer
                la frase entera. Por eso los íconos van con `title` y no con
                `aria-label`, que acá nadie leería.

                Las tres últimas son íconos porque su rótulo es más largo que su
                número —"Tries" y "Al palo" reservaban ancho que el dato no
                usa—, y ese ancho es justo el que hacía falta para que en el
                teléfono entre una columna más. "Edad", "Club" y "OVR" siguen en
                palabras: son cortas y no tienen ícono que se entienda solo. */}
            <div className={styles.spineHead} aria-hidden="true">
                <span>{t.age}</span>
                <span>{t.club}</span>
                <span className={styles.spineNum}>{t.ovr}</span>
                <span className={styles.spineNum} title={t.matchesPlayed}><JerseyIcon /></span>
                <span className={styles.spineNum} title={t.points}><ScoreIcon /></span>
                <span className={styles.spineNum} title={t.tries}><BallIcon /></span>
                {/* TACKLES, columna fija y también en el teléfono. Es la mitad de
                    la planilla que no depende del puesto: sin ella la trayectoria
                    de un forward no cuenta nada de lo que ese forward hace. */}
                <span className={styles.spineNum} title={t.tackles}><TackleIcon /></span>
                {conSecundaria && (
                    <span className={`${styles.spineNum} ${styles.spinePuesto}`} title={secondaryLabel}>
                        <SecondaryIcon kind={secundaria.kind} statKey={secundaria.statKey} />
                    </span>
                )}
            </div>

            <ol className={styles.spineList} ref={listaRef} aria-labelledby="espina-titulo">
                {bloques.map((block, i) => {
                    const anterior = bloques[i - 1] ?? null;
                    const resumen = resumir(block, anterior, p.position);
                    // El tramo en curso es el que contiene la edad de hoy.
                    const esActual = !p.retired && edadActual >= block.ageFrom && edadActual <= block.ageTo;
                    const rotulo = block.ageFrom === block.ageTo ? `${block.ageFrom}` : `${block.ageFrom}-${block.ageTo}`;
                    const detalle = resumen === null
                        ? t.notPlayedYet(rotulo)
                        : describir(rotulo, resumen, secondaryLabel, t);
                    return (
                        <li
                            key={block.ageFrom}
                            className={[
                                styles.spineRow,
                                // La del tramo EN JUEGO no es una futura aunque
                                // todavía no tenga planilla: tiene club y OVR, y
                                // como "futura" heredaba el alto de una línea de
                                // 11 px, así que su contenido salía aplastado
                                // contra el renglón de abajo.
                                resumen === null && !esActual ? styles.spineRowFuture : '',
                                esActual ? styles.spineRowNow : '',
                            ].filter(Boolean).join(' ')}
                            aria-current={esActual ? 'step' : undefined}
                            title={detalle}
                        >
                            {/* La frase completa para el lector de pantalla. Las
                                celdas de abajo son la misma información en
                                columnas, que sin encabezados no se entiende. */}
                            <span className={styles.srOnly}>{detalle}</span>

                            <span className={`${styles.spineAge} ${styles.num}`} aria-hidden="true">{block.ageFrom}</span>

                            {resumen === null ? (
                                esActual ? (
                                    // El tramo que se está jugando ya tiene club
                                    // y OVR aunque no tenga planilla. Sin esta
                                    // fila, el "estás acá" era una línea vacía
                                    // justo en el renglón que más se mira.
                                    <>
                                        <span className={`${styles.spineClub} ${styles.spineClubPending}`} aria-hidden="true">
                                            <ClubBadge clubId={p.club} clubName={p.club} size={16} />
                                            {/* Con ofertas sobre la mesa el club está en duda y eso
                                                es lo que hay que decir. Sin ofertas NO: ahí el club
                                                se sabe, y poner "En juego" en su lugar borraba el
                                                único dato que la fila tenía para dar. */}
                                            <span className={styles.spineClubName}>
                                                {career.offers.length > 0 ? t.pickingClub : getClub(p.club).labelEs}
                                            </span>
                                            <span className={styles.spineNowTag}>{t.inPlay}</span>
                                        </span>
                                        <OvrPill ovr={ovrHoy} />
                                    </>
                                ) : (
                                    // El futuro se dibuja como una línea, no como
                                    // un hueco: es lo que da la sensación de
                                    // cuánta carrera queda por delante.
                                    <span className={styles.spineEmpty} aria-hidden="true" />
                                )
                            ) : (
                                <>
                                    <span className={styles.spineClub} aria-hidden="true">
                                        <ClubBadge clubId={resumen.clubId} clubName={resumen.clubName} size={16} />
                                        <span className={styles.spineClubName}>{resumen.clubName}</span>
                                        {/* DÓNDE SALIÓ EL CLUB. Va pegada al nombre y no en
                                            una columna propia: es un dato del club, no del
                                            jugador, y una columna más le sacaría ancho a las
                                            de la planilla. El campeón se pinta distinto —el
                                            1° es la única posición que se lee de un vistazo. */}
                                        {resumen.position > 0 && resumen.teams > 0 && (
                                            <span
                                                className={[
                                                    styles.spinePos,
                                                    resumen.divisionMove?.direction === 'promotion' ? styles.spinePosUp : '',
                                                    resumen.divisionMove?.direction === 'relegation' ? styles.spinePosDown : '',
                                                    // El 1° se pinta de acento SÓLO si no movió de
                                                    // división: si ascendió, el color que manda es
                                                    // el del ascenso.
                                                    resumen.position === 1 && !resumen.divisionMove ? styles.spinePosTop : '',
                                                ].filter(Boolean).join(' ')}
                                                title={
                                                    resumen.divisionMove
                                                        ? `${t.leaguePlace(resumen.position, resumen.teams)} · ${resumen.divisionMove.direction === 'promotion' ? t.promotedTo(competitionLabelOf(resumen.divisionMove.to)) : t.relegatedTo(competitionLabelOf(resumen.divisionMove.to))}`
                                                        : t.leaguePlace(resumen.position, resumen.teams)
                                                }
                                            >
                                                {/* CUANDO EL CLUB SE MUEVE DE DIVISIÓN, LA FLECHA
                                                    REEMPLAZA AL PUESTO. Salir primero en segunda no
                                                    es un dato de la tabla: es que el año que viene
                                                    jugás en otra categoría, y eso se lee de un
                                                    vistazo en una columna de veinte temporadas
                                                    mientras "1°" hay que interpretarlo sabiendo en
                                                    qué división estaba. El número sigue en el
                                                    `title`, que es donde vive el contexto.

                                                    SÓLO EL PUESTO cuando no hubo movimiento. El
                                                    "/14" se fue de la vista por lo mismo: en un
                                                    teléfono esa barra le comía cuatro caracteres al
                                                    nombre del club. */}
                                                {resumen.divisionMove?.direction === 'promotion'
                                                    ? '▲'
                                                    : resumen.divisionMove?.direction === 'relegation'
                                                        ? '▼'
                                                        : `${resumen.position}°`}
                                            </span>
                                        )}
                                        {/* Los íconos cuentan el tramo sin texto:
                                            el pase, el título y la lesión pasan
                                            EN una temporada concreta, y ese es
                                            justamente el dato que un acumulado
                                            en la cabecera no puede dar. */}
                                        {resumen.moved && <span className={styles.spineMark} title={t.clubChange}><MoveIcon /></span>}
                                        {resumen.promoted && <span className={styles.spineMark} title={t.stepUp}><StepIcon /></span>}
                                        {resumen.titles > 0 && (
                                            <span className={`${styles.spineMark} ${styles.spineTitle}`} title={resumen.titles > 1 ? t.titlesCount(resumen.titles) : t.champion}>
                                                <TrophyIcon />
                                                {resumen.titles > 1 && <span className={styles.spineMarkCount}>{resumen.titles}</span>}
                                            </span>
                                        )}
                                        {resumen.injury && <span className={`${styles.spineMark} ${styles.spineInjury}`} title={t.seriousInjury}><InjuryIcon /></span>}
                                    </span>
                                    <OvrPill ovr={resumen.ovr} />
                                    <Cell value={resumen.appearances} />
                                    <Cell value={resumen.points} />
                                    <Cell value={resumen.tries} />
                                    <Cell value={resumen.tackles} />
                                    {conSecundaria && <Cell value={resumen.secondary} puesto />}
                                </>
                            )}
                        </li>
                    );
                })}
            </ol>

            {/* LA SELECCIÓN, fija al pie y con LAS MISMAS COLUMNAS que las de
                club. Los caps caen bajo PJ porque eso son: partidos. Antes el
                número flotaba en la columna de PTS y el que lo leía de reojo
                entendía otra cosa — peor que no mostrarlo. */}
            <div className={`${styles.spineNationBlock} ${debutado ? '' : styles.spineNationPending}`}>
                <div className={styles.spineNation} title={detalleSeleccion}>
                    <span className={styles.srOnly}>{detalleSeleccion}</span>
                    <span aria-hidden="true" />
                    <span className={styles.spineClub} aria-hidden="true">
                        {union && <Flag code={union} size={18} decorative />}
                        <span className={styles.spineClubName}>{nacionalidad}</span>
                        {/* La copa internacional va ACÁ y no en el bloque del club:
                            la ganaste con esta camiseta. */}
                        {titulosSeleccion > 0 && (
                            <span className={`${styles.spineMark} ${styles.spineTitle}`} title={titulosSeleccion > 1 ? t.nationalTitles(titulosSeleccion) : t.championWithCountry}>
                                <TrophyIcon />
                                {titulosSeleccion > 1 && <span className={styles.spineMarkCount}>{titulosSeleccion}</span>}
                            </span>
                        )}
                        {ranking !== null && <span className={styles.spineNationRank}>{ranking}ª</span>}
                        <span className={styles.spineNationTag}>{rotuloEstado}</span>
                    </span>
                    {/* El OVR no se repite: es del jugador, no de la camiseta. */}
                    <span className={styles.spineOvr} aria-hidden="true">—</span>
                    <Cell value={nat.caps} />
                    <Cell value={nat.points} />
                    <Cell value={nat.tries} />
                    <Cell value={nat.tackles} />
                    {conSecundaria && <Cell value={secundariaSeleccion} puesto />}
                </div>
                {/* La segunda línea: dónde estás parado. Va SIEMPRE, incluso —y
                    sobre todo— cuando el país no tiene selección: descubrirlo en
                    el retiro después de diecinueve temporadas era el bug. */}
                <p
                    className={`${styles.spineNationNote} ${conSeleccion ? '' : styles.spineNationNoteOff}`}
                    aria-hidden="true"
                >
                    {notaSeleccion}
                </p>
            </div>
        </div>
    );
}

/** Lo que una fila muestra de su tramo. */
interface Resumen {
    clubId: string;
    clubName: string;
    ovr: number;
    appearances: number;
    points: number;
    tries: number;
    tackles: number;
    secondary: string;
    /** Títulos ganados CON ESTE CLUB. Los de selección no cuentan acá (van al pie). */
    titles: number;
    injury: boolean;
    moved: boolean;
    promoted: boolean;
    /**
     * POSICIÓN FINAL DEL CLUB en su liga, y cuántos equipos la jugaban.
     *
     * Sale de `SeasonResult`, que ya la guardaba desde 1.5.0 y que nadie mostraba:
     * el motor calculaba en qué puesto salió el club todas las temporadas y el dato
     * moría ahí. No hace falta congelarla en `CareerSeasonEntry` — `seasons[]` es
     * inmutable, así que derivarla de ahí no puede desincronizarse (la regla del
     * proyecto: derivar cuando las entradas son estables).
     *
     * Del TRAMO se toma la ÚLTIMA temporada, no un promedio: promediar un 2° y un
     * 9° da un 5° que no pasó nunca.
     */
    position: number;
    teams: number;
    /**
     * Si esa posición movió al club de división. Cuando lo hizo, la FLECHA
     * reemplaza al puesto en la fila: "1°" hay que interpretarlo sabiendo en qué
     * división estaba, y "▲" se lee solo.
     *
     * Derivado con la misma función del motor (`divisionMoveFor`) sobre la
     * competición congelada de la temporada, así que la espina no puede decir que
     * ascendió cuando el motor decidió que no.
     */
    divisionMove: ReturnType<typeof divisionMoveFor>;
}

/**
 * El tramo, resumido en una fila. Los contadores se SUMAN y la columna del
 * puesto se recalcula desde las planillas crudas: el apertura tiene ahí un
 * porcentaje, y promediar dos porcentajes de dos temporadas con distinta
 * cantidad de patadas da un número que no existió nunca.
 */
function resumir(block: Block, previo: Block | null, position: CareerState['player']['position']): Resumen | null {
    const entries = block.entries;
    if (entries.length === 0) return null;

    const last = entries[entries.length - 1];
    const first = entries[0];

    // Planilla cruda del tramo, sumada campo por campo. `points` se suma como
    // los demás: viene calculado y congelado por temporada, así que sumarlo
    // respeta lo que cada una mostró aunque mañana cambie la fórmula.
    const total = block.stats.reduce((acc, s) => {
        for (const key of Object.keys(acc) as (keyof typeof acc)[]) acc[key] += s.stats[key];
        return acc;
    }, emptyStats());

    const anterior = previo && previo.entries.length > 0 ? previo.entries[previo.entries.length - 1] : null;

    // Hubo pase si cambió de club DENTRO del tramo o al entrar en él.
    const moved = entries.some((e, i) => (i === 0 ? anterior !== null && e.clubId !== anterior.clubId : e.clubId !== entries[i - 1].clubId));

    // Y subió de escalón si el vínculo con el que cierra el tramo pesa más que
    // el de la última temporada de la que venía.
    const desde = anterior ?? first;
    const promoted = employmentRank(last.employment) > employmentRank(desde.employment);

    return {
        clubId: last.clubId,
        clubName: last.clubName,
        ovr: last.ovr,
        appearances: entries.reduce((n, e) => n + e.appearances, 0),
        points: entries.reduce((n, e) => n + e.points, 0),
        tries: entries.reduce((n, e) => n + e.tries, 0),
        tackles: entries.reduce((n, e) => n + e.tackles, 0),
        secondary: secondaryStatOf(position, total).display,
        // SOLO LOS DE CLUB. `titlesWon` mezcla las dos clases de honor, así que
        // sin el filtro una copa ganada con la selección le sumaba un trofeo al
        // club en el que el jugador estaba ese año — que no la jugó. El de
        // selección se cuenta al pie, al lado del país.
        titles: entries.reduce((n, e) => n + e.titlesWon.filter((t) => t.union === null).length, 0),
        injury: entries.some((e) => e.severeInjury),
        moved,
        promoted,
        position: block.stats[block.stats.length - 1]?.leaguePosition ?? 0,
        teams: block.stats[block.stats.length - 1]?.leagueTeams ?? 0,
        // ¿Esa posición movió al club de división? Se DERIVA con la misma función
        // que usa el motor para decidirlo (`divisionMoveFor`), sobre la
        // competición congelada de la temporada: no hay un segundo criterio que
        // pueda decir que ascendió cuando el motor dice que no.
        divisionMove: divisionMoveFor(
            last.competitionId,
            block.stats[block.stats.length - 1]?.leaguePosition ?? 0,
            block.stats[block.stats.length - 1]?.leagueTeams ?? 0,
        ),
    };
}

/**
 * El OVR, píldora pintada por rango. El mismo bloque de color que la cabecera:
 * leyendo sólo la columna se ve la carrera entera —dónde despegó, dónde tocó
 * techo y dónde empezó a caer— sin leer un número. En verde plano, veintipico
 * de temporadas se veían todas iguales.
 */
function OvrPill({ ovr }: { ovr: number }) {
    return (
        <span
            className={`${styles.spineOvr} ${styles.spineOvrPill} ${styles[`ovr_${ovrBand(ovr)}`]} ${styles.num}`}
            aria-hidden="true"
        >
            {ovr}
        </span>
    );
}

/** Una celda numérica. El cero (o el guion del que no patea) va tenue. */
function Cell({ value, puesto = false }: { value: number | string; puesto?: boolean }) {
    const zero = value === 0 || value === '0' || value === '—';
    return (
        <span
            className={[styles.spineCell, styles.num, zero ? styles.spineCellZero : '', puesto ? styles.spinePuesto : ''].filter(Boolean).join(' ')}
            aria-hidden="true"
        >
            {value}
        </span>
    );
}

/** El tramo en una frase. Es lo que se lee al pasar el mouse y en lector. */
function describir(rotulo: string, r: Resumen, secondaryLabel: string, t: UiStrings): string {
    const partes = [
        `${rotulo} ${t.yearsLabel}`,
        r.clubName,
        `${t.ovr} ${r.ovr}`,
        `${r.appearances} ${t.matches.toLowerCase()}`,
        `${r.points} ${t.points.toLowerCase()}`,
        `${r.tries} ${t.tries.toLowerCase()}`,
        `${r.tackles} ${t.tackles.toLowerCase()}`,
        `${secondaryLabel} ${r.secondary}`,
    ];
    if (r.position > 0 && r.teams > 0) partes.push(t.leaguePlace(r.position, r.teams));
    // El ascenso va JUNTO al puesto, porque es lo que ese puesto significó. En la
    // vista la flecha reemplaza al número; acá se dicen los dos, que es lo que un
    // lector de pantalla necesita para entender por qué la fila está pintada.
    if (r.divisionMove) {
        partes.push(
            r.divisionMove.direction === 'promotion'
                ? t.promotedTo(competitionLabelOf(r.divisionMove.to))
                : t.relegatedTo(competitionLabelOf(r.divisionMove.to)),
        );
    }
    if (r.moved) partes.push(t.clubChange.toLowerCase());
    if (r.promoted) partes.push(t.stepUp.toLowerCase());
    if (r.titles > 0) partes.push(r.titles > 1 ? t.titlesCount(r.titles) : t.champion.toLowerCase());
    if (r.injury) partes.push(t.seriousInjury.toLowerCase());
    return partes.join(' · ');
}

/**
 * El ícono de la columna del puesto: los palos, los metros o el tackle.
 *
 * Sale de `statKey` y no de `kind`: los únicos `kind` son 'stat' y
 * 'kick-accuracy', así que preguntar por 'metres' —como estaba— no daba nunca y
 * el wing y el centro terminaban con el escudo de los tackles encabezando una
 * columna de metros.
 */
function SecondaryIcon({ kind, statKey }: { kind: string; statKey: string | null }) {
    if (kind === 'kick-accuracy') return <PostsIcon />;
    if (statKey === 'metres') return <MetresIcon />;
    return <TackleIcon />;
}

const svg = {
    viewBox: '0 0 24 24',
    width: 12,
    height: 12,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
} as const;

function TrophyIcon() {
    return (
        <svg {...svg} width={11} height={11}>
            <path d="M8 4h8v3a4 4 0 0 1-8 0V4z" /><path d="M6 4H4v1a4 4 0 0 0 4 4" /><path d="M18 4h2v1a4 4 0 0 1-4 4" /><path d="M12 11v4" /><path d="M9 19h6" />
        </svg>
    );
}

/** Camiseta: partidos jugados. */
function JerseyIcon() {
    return (
        <svg {...svg}>
            <path d="M8 3 4 5.5 6 10l2-1v12h8V9l2 1 2-4.5L16 3" /><path d="M9 3a3 3 0 0 0 6 0" />
        </svg>
    );
}

/** Marcador: los puntos de la temporada. */
function ScoreIcon() {
    return (
        <svg {...svg}>
            <rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 17v3M16 17v3M8 9v4M12 9v4M16 9v4" />
        </svg>
    );
}

/** Pelota ovalada: los tries. */
function BallIcon() {
    return (
        <svg {...svg}>
            <ellipse cx="12" cy="12" rx="9" ry="6" transform="rotate(-35 12 12)" /><path d="M9.5 14.5 14.5 9.5M10.5 11l1.5 1.5M12 9.5l1.5 1.5" />
        </svg>
    );
}

/** Los palos en H: el porcentaje al palo del pateador. */
function PostsIcon() {
    return (
        <svg {...svg}>
            <path d="M7 3v18M17 3v18M7 9h10" />
        </svg>
    );
}

/** Escudo: los tackles. */
function TackleIcon() {
    return (
        <svg {...svg}>
            <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3z" />
        </svg>
    );
}

/** Flecha con avance: los metros ganados. */
function MetresIcon() {
    return (
        <svg {...svg}>
            <path d="M4 12h15" /><path d="M14 7l5 5-5 5" />
        </svg>
    );
}

/** Flecha que baja y dobla: el pase a otro club. */
function MoveIcon() {
    return (
        <svg {...svg} width={11} height={11}>
            <path d="M6 4v9a3 3 0 0 0 3 3h9" /><path d="M14 12l4 4-4 4" />
        </svg>
    );
}

/** Escalón: subiste de vínculo. */
function StepIcon() {
    return (
        <svg {...svg} width={11} height={11}>
            <path d="M4 19h5v-5h5V9h6" />
        </svg>
    );
}

/** Cruz médica: la lesión grave del tramo. */
function InjuryIcon() {
    return (
        <svg {...svg} width={11} height={11}>
            <circle cx="12" cy="12" r="8" /><path d="M12 8v8M8 12h8" />
        </svg>
    );
}
