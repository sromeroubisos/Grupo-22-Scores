'use client';

// EL CAPITÁN — LA PANTALLA DEL TORNEO.
//
// Una celda por partido. Se destapa y sale el marcador. No hay más verbo que
// ese, y es a propósito: el juego ya tiene sesenta y cuatro minijuegos para
// medirte las manos, y lo que no tenía era la tarde en la que no depende de vos.
//
// ── LO QUE ESTA PANTALLA NO HACE ───────────────────────────────────────────
// No decide NADA. Los marcadores ya están sorteados adentro del estado desde que
// el torneo se abrió; destapar solo pone `revealed`. La única acción que cambia
// un resultado es la arenga, y cambia el partido que VIENE — nunca el que ya
// salió.
//
// Por eso este archivo no tiene un solo `Math.random` ni una sola cuenta de
// rugby: pinta lo que el motor ya decidió. Si algún número de acá te parece mal,
// el archivo que hay que abrir es `engine/tournament.ts`.

import type {
    CaptainState,
    CasillasGrid,
    MatchGrid,
    PendingTournament,
    ComodinId,
    TournamentDef,
    TournamentMatch,
} from '@/features/captain';
import {
    CASILLAS_TRIES,
    ROUND_LABEL,
    bracketsOf,
    canUseComodin,
    comodinesFor,
    divisionOf,
    divisionTablesOf,
    getComodin,
    casillasEncontrados,
    getFamily,
    unionName,
    casillasRestantes,
    finalPlace,
    getTournament,
    groupPoints,
    groupWins,
    hasPlacement,
    matchResult,
    ordinal,
    roundTag,
    roundTitle,
    tablePoints,
    tierMoveOf,
} from '@/features/captain';
import styles from './capitan.module.css';

/** Cómo se lee una nota tuya en el partido. */
const GRADE_LABEL = {
    clavado: 'Partidazo',
    logrado: 'Buen partido',
    tibio: 'Partido correcto',
    errado: 'Tarde para el olvido',
} as const;

export default function TournamentScreen({
    state,
    onReveal,
    onChooseComodin,
    onUseComodin,
    onFinish,
    onPick,
    onPickGrid,
}: {
    state: CaptainState;
    onReveal: (index: number) => void;
    onChooseComodin: (comodin: ComodinId) => void;
    onUseComodin: () => void;
    onFinish: () => void;
    onPick: (index: number) => void;
    onPickGrid: (index: number) => void;
}) {
    const t = state.pendingTournament;
    // Sin torneo no hay pantalla. Es una guarda de tipo y no un caso real: el
    // orquestador solo monta esto en fase de torneo.
    if (!t) return null;

    const def = getTournament(t.id);
    const proximo = t.matches.find((m) => !m.revealed) ?? null;
    const enGrupos = t.round === 'grupos';
    const puntos = groupPoints(t);
    // EL PUESTO EXACTO, que en un torneo con cuadros es lo único que resume el
    // torneo entero. `null` en los que eliminan, donde lo que queda es la ronda.
    const puesto = finalPlace(t, def);
    // EL ASCENSO Y EL DESCENSO. `null` hasta que la última ronda esté jugada, así
    // que durante el torneo no adelanta nada.
    const movimiento = tierMoveOf(t, def);

    // EL TORNEO TERMINADO SE MIRA ANTES DE SEGUIR. `outcome` deja de ser `null`
    // en cuanto se destapa la celda que cierra la llave, y a partir de ahí esta
    // pantalla no ofrece destapar nada: ofrece leer cómo terminó. Es todo el
    // arreglo del bug de la derrota que no se veía.
    const cerrado = t.outcome !== null;

    // EL PARTIDO ABIERTO EN LA GRILLA. Sale del estado y no de un `useState`: si
    // viviera en la pantalla, un F5 en el medio de la grilla te devolvería al
    // cuadro con el partido todavía sin jugar, o sea con la chance de volver a
    // entrar. El estado es lo único que una recarga no puede deshacer.
    const abierto = t.playing !== null ? t.matches[t.playing] ?? null : null;

    const puedeQuemar = canUseComodin(t, state);
    // LOS QUE PODÉS TRAER. Sale del motor y no de una lista acá: los requisitos
    // se preguntan con la misma función que el reducer va a volver a preguntar
    // al elegir, así que la pantalla no puede ofrecer uno que después se
    // rechace.
    const disponibles = comodinesFor(state, def);
    const traido = t.comodin !== null ? getComodin(t.comodin) : null;

    // ── LA PREGUNTA DEL PRINCIPIO ───────────────────────────────────────────
    // Se hace UNA vez, con la llave ya sorteada y antes del primer partido: es
    // el único punto donde el jugador tiene exactamente la información que
    // tiene que tener —sabe contra quién le tocó y todavía no sabe cómo salió—.
    //
    // Con menos de dos disponibles no se pregunta nada. Un selector de una sola
    // opción no es una elección (§3 del CLAUDE raíz), así que ahí el comodín se
    // trae solo y la pantalla lo dice en el panel de abajo.
    const eligiendo = !cerrado && t.comodin === null && disponibles.length >= 2;

    // EL PANEL NO SE ESCONDE CUANDO NO SE PUEDE QUEMAR, y eso es deliberado: un
    // comodín invisible no es un comodín, es una sorpresa. Lo que cambia es el
    // renglón de abajo, que dice POR QUÉ no se puede todavía — es la misma regla
    // del botón deshabilitado que dice qué le falta (§6 del CLAUDE.md).
    const comodinVisible = def.arenga && !cerrado && !t.comodinUsed && traido !== null;

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>
                {def.labelEs} · Temporada {t.season}
            </span>
            <h2 className={styles.cardTitle}>
                {cerrado
                    ? cierreTitulo(t.outcome!, def.labelEs, puesto)
                    : roundTitle(t, def, t.round)}
            </h2>
            <p className={styles.cardText}>
                {cerrado ? cierreTexto(t, puesto) : def.briefEs}
            </p>

            {/* ── EL ASCENSO Y EL DESCENSO ────────────────────────────────────
                En su propio renglón y no metido en el texto de arriba: es la
                consecuencia que dura más que el torneo —el año que viene jugás
                otro— y perderla adentro de una frase de cierre sería enterrar lo
                único que le queda a la carrera de esta edición. */}
            {cerrado && movimiento && (
                <p className={styles.tourGroupLine}>
                    {movimiento.kind === 'up'
                        ? <><strong>Ascienden.</strong> El año que viene, {getTournament(movimiento.to).labelEs}.</>
                        : <><strong>Descienden.</strong> El año que viene, {getTournament(movimiento.to).labelEs}.</>}
                </p>
            )}

            {/* ── LO QUE EL GRUPO DECIDE ──────────────────────────────────────
                Solo en grupos, y con el corte a la vista: sin saber qué se juega
                con cada resultado, destapar la tercera celda no es tensión sino
                trámite.

                Son dos torneos distintos y por eso son dos líneas. Donde hay
                corte, lo que importa son los PUNTOS y cuántos faltan. Donde hay
                cuadros no hay corte: lo que importa son las VICTORIAS, porque
                cada una te sube un cuadro entero. */}
            {enGrupos && !cerrado && (
                hasPlacement(def)
                    ? <EscaleraDeCuadros t={t} def={def} />
                    : (
                        <p className={styles.tourGroupLine}>
                            <strong>{puntos}</strong> {puntos === 1 ? 'punto' : 'puntos'} · hacen falta{' '}
                            <strong>{def.qualifyPoints}</strong> para pasar
                        </p>
                    )
            )}

            {/* ── LA GRILLA QUE SE TOCA ───────────────────────────────────────
                Cada celda tapada de la ronda EN CURSO es un botón. Elegís cuál
                abrís y en qué orden, igual que en el juego de las casillas.

                Que el orden no cambie el resultado —los partidos de una ronda
                están sorteados por separado— no es motivo para sacarle la
                elección al jugador: es el mismo caso que las nueve casillas
                indistinguibles de la final. El gesto de destapar ES el juego, y
                un botón que dice «Jugar contra Rosario» se lo saca. */}
            <div className={styles.tourBracket}>
                {t.matches.map((m, i) => (
                    <Celda
                        key={`${m.round}-${i}`}
                        match={m}
                        // EL RÓTULO SALE DEL MOTOR, no de una tabla de rondas: en
                        // el M20 «Semi» a secas es la mitad del dato, y la mitad
                        // que falta —por qué puesto— es la que hace legible el
                        // torneo del que perdió los tres del grupo.
                        tag={roundTag(t, def, m.round)}
                        // Solo se puede tocar lo de la ronda en curso: las rondas
                        // que vienen todavía no existen y las pasadas ya están.
                        onReveal={
                            !cerrado && !abierto && !m.revealed && !m.casillas && m.round === t.round
                                ? () => onReveal(i)
                                : null
                        }
                    />
                ))}
            </div>

            {!cerrado && !abierto && proximo && !proximo.casillas && (
                <p className={styles.tourPick}>Tocá un partido para jugarlo.</p>
            )}

            {/* ── DÓNDE ESTÁ TU UNIÓN ─────────────────────────────────────────
                El ascenso y el descenso ya se recalculaban desde las ediciones
                jugadas —es el sistema más elegante del feature— y era
                COMPLETAMENTE invisible: terminabas 15.º a los 18 y al año
                siguiente jugabas otro torneo sin que nada te dijera que habías
                descendido.

                No agrega un dato al estado: las divisiones, el campo de cada una
                y los movimientos ya estaban todos declarados o derivados. Lo
                único que faltaba era preguntarlos juntos. */}
            {def.tier && <TablaDeDivisiones state={state} def={def} />}

            {/* ── LA ARENGA ───────────────────────────────────────────────────
                Se muestra apagada cuando no llega el Liderazgo, y no escondida:
                un comodín invisible no es un comodín, es una sorpresa. Que se vea
                lo que falta para tenerlo es la misma regla del botón deshabilitado
                que dice qué le falta (§6 del CLAUDE.md). */}
            {/* ── QUÉ TE TRAÉS ────────────────────────────────────────────────
                La primera mitad de la decisión doble. Se elige antes del primer
                partido y no se puede cambiar: reelegir con un resultado a la
                vista sería elegir sabiendo, y ahí se termina la decisión.

                Cada opción dice las tres cosas —qué hace, qué pide y qué
                resigna— porque sin la tercera no hay dilema: los tres suenan
                buenos hasta que se lee en qué ronda sirve cada uno. */}
            {eligiendo && (
                <div className={styles.tourComodines} role="radiogroup" aria-label="Qué comodín te traés">
                    <p className={styles.tourPick}>Elegí qué te traés. Uno solo, y para todo el torneo.</p>
                    {disponibles.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            role="radio"
                            aria-checked={false}
                            className={styles.tourComodin}
                            onClick={() => onChooseComodin(c.id)}
                        >
                            <span className={styles.tourComodinName}>{c.labelEs}</span>
                            <span className={styles.tourComodinBrief}>{c.briefEs}</span>
                            <span className={styles.tourComodinCost}>{c.costEs}</span>
                        </button>
                    ))}
                </div>
            )}

            {comodinVisible && traido && (
                <div className={styles.tourArenga}>
                    <button
                        type="button"
                        className={styles.ghost}
                        onClick={onUseComodin}
                        disabled={!puedeQuemar}
                    >
                        {traido.labelEs}
                    </button>
                    <span className={styles.tourArengaHint}>
                        {puedeQuemar
                            ? `${traido.briefEs} Una sola vez en el torneo.`
                            : traido.costEs}
                    </span>
                </div>
            )}

            {t.comodinUsed && traido && (
                <p className={styles.tourArengaHint}>
                    {traido.labelEs} ya está gastado. De acá en adelante es como salga.
                </p>
            )}

            {/* LA FINAL SE JUEGA, no se destapa. Cuando el partido que viene
                trae casillas, el botón desaparece y aparece el tablero. */}
            {/* ── LA GRILLA DE TREINTA ────────────────────────────────────────
                Se abre cuando el jugador toca un partido del cuadro. Reemplaza a
                la lista de celdas mientras está abierta: una cosa por vez. */}
            {abierto?.grid && (
                <MatchGridBoard grid={abierto.grid} rival={abierto.rivalName} onPick={onPickGrid} />
            )}

            {!cerrado && proximo?.casillas && (
                <Casillas
                    grid={proximo.casillas}
                    rival={proximo.rivalName}
                    torneo={def.labelEs}
                    ronda={roundTitle(t, def, proximo.round)}
                    puesto={getFamily(state.player.family).labelEs}
                    miUnion={unionName(state.player.countryCode)}
                    vision={state.player.attrs.vision}
                    onPick={onPick}
                />
            )}

            {/* El único botón que queda es el de seguir, y aparece cuando el
                torneo ya terminó. Mientras hay torneo, lo que se toca es la
                grilla. */}
            {cerrado && (
                <button type="button" className={styles.primary} onClick={onFinish}>
                    Continuar
                </button>
            )}
        </div>
    );
}

/**
 * LO QUE SE JUEGA EN EL GRUPO, cuando el grupo no elimina.
 *
 * Cuatro victorias posibles y cuatro cuadros. Que la escalera esté a la vista
 * ANTES de destapar la tercera celda es lo que convierte ese partido en algo:
 * sin ella, el jugador que va 1-1 no sabe que el próximo resultado le mueve
 * cuatro puestos.
 *
 * Se dibuja desde `bracketsOf` y no desde una lista escrita acá: el día que el
 * formato cambie —otro tamaño de cuadro, otra cantidad de grupos— esta línea
 * cambia sola. Escribirla a mano sería la derivada congelada del §1.9, con el
 * agravante de que una escalera que miente sobre el formato es peor que ninguna.
 */
function EscaleraDeCuadros({ t, def }: { t: PendingTournament; def: TournamentDef }) {
    const ganados = groupWins(t);
    const cuadros = bracketsOf(def);

    return (
        <>
            <p className={styles.tourGroupLine}>
                <strong>{ganados}</strong> de <strong>{def.groupMatches}</strong> ganados · acá no se
                corta, se reparte:{' '}
                {cuadros.map((b, i) => (
                    <span key={b.wins}>
                        {i > 0 && ' · '}
                        <strong>{b.wins}</strong> → {b.title ? 'el título' : `el ${ordinal(b.topPlace)}`}
                    </span>
                ))}
            </p>

            {/* LO QUE SE JUEGA MÁS ALLÁ DE ESTA EDICIÓN. El que está peleando por
                no salir decimosexto tiene que saber POR QUÉ importa, y el que
                juega la B tiene que saber que el título vale un ascenso. Sin esto,
                el último cuadro es el de jugar por nada. */}
            {def.tier?.down && (
                <p className={styles.tourArengaHint}>
                    Los {def.tier.down.places} últimos bajan al{' '}
                    {getTournament(def.tier.down.to).labelEs}.
                </p>
            )}
            {def.tier?.up && (
                <p className={styles.tourArengaHint}>
                    Los {def.tier.up.places} primeros suben al{' '}
                    {getTournament(def.tier.up.to).labelEs}.
                </p>
            )}
        </>
    );
}

/**
 * LA GRILLA DE TREINTA — el partido.
 *
 * Seis por cinco. Atrás de cada celda hay un resultado, y la proporción de
 * victorias entre las treinta ES la probabilidad de ese cruce: contra un rival
 * muy inferior casi todas esconden victoria, contra el número uno del mundo casi
 * ninguna.
 *
 * ── LO QUE LA PANTALLA NO DICE, Y ES A PROPÓSITO ───────────────────────────
 * No muestra cuántas son victoria. Saber "veintiséis de treinta" antes de tocar
 * convertiría el gesto en una cuenta, y la gracia es que la mano ya viene con el
 * peso puesto sin que lo veas. Lo que sí se dice es contra quién jugás, que es lo
 * que un jugador de rugby sabe de verdad al entrar a la cancha.
 */
/**
 * LAS DOS DIVISIONES DEL MUNDIAL JUVENIL, con vos adentro.
 *
 * Cerrada por defecto (`<details>`) y no desplegada: es contexto, no el partido
 * que estás jugando, y abierta de arranque empujaría el cuadro abajo del pliegue
 * justo en la pantalla donde el jugador vino a destapar una celda.
 *
 * La tuya se marca con `divisionOf` y NO con su ranking: si tu unión ascendió o
 * descendió está en la división que la carrera le dio, y ese desfasaje contra el
 * ranking ES lo que esto existe para mostrar.
 */
function TablaDeDivisiones({ state, def }: { state: CaptainState; def: TournamentDef }) {
    const tablas = divisionTablesOf(state, def);
    const mia = divisionOf(state, def);

    return (
        <details className={styles.tourDivisiones}>
            <summary className={styles.tourDivisionesSummary}>
                Las divisiones del Mundial juvenil
            </summary>
            {tablas.map((tabla) => (
                <div key={tabla.id} className={styles.tourDivision}>
                    <p className={styles.tourDivisionName}>
                        {tabla.name}
                        {tabla.id === mia && <span className={styles.tourDivisionMine}> · la tuya</span>}
                    </p>
                    <ol className={styles.tourDivisionList}>
                        {tabla.rows.map((row) => (
                            <li
                                key={row.unionCode}
                                className={styles.tourDivisionRow}
                                data-mine={row.mine ? 'si' : undefined}
                            >
                                <span className={styles.tourDivisionUnion}>{unionName(row.unionCode)}</span>
                                {/* El puesto del ranking al lado del nombre: es
                                    de donde salió el campo, y sin él la lista se
                                    lee como un orden arbitrario. `—` cuando la
                                    unión no figura en el ranking, que es la
                                    verdad y no un dato faltante. */}
                                <span className={styles.tourDivisionRank}>
                                    {row.rank === null ? '—' : `#${row.rank}`}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            ))}
        </details>
    );
}

function MatchGridBoard({
    grid,
    rival,
    onPick,
}: {
    grid: MatchGrid;
    rival: string;
    onPick: (index: number) => void;
}) {
    // LAS TACHADAS SE DIBUJAN Y NO SE SACAN. Un tablero que pasa de treinta
    // celdas a veinticuatro no le muestra al jugador lo que ganó: le cambia el
    // tablero. Tachadas y a la vista, la ayuda del comodín se LEE — que es la
    // misma decisión que ya tomó la casilla que tacha la Visión en la final.
    const tachadas = new Set(grid.tachadas);

    return (
        <div className={styles.matchGridWrap}>
            <p className={styles.casillasLead}>
                Contra <strong>{rival}</strong>. Elegí por dónde salió el partido.
            </p>

            {tachadas.size > 0 && (
                <p className={styles.tourArengaHint}>
                    Hablaste con el árbitro: {tachadas.size} canales cerrados salieron del tablero.
                </p>
            )}

            <div className={styles.matchGrid} role="group" aria-label={`El partido contra ${rival}`}>
                {grid.celdas.map((_, i) => {
                    const fuera = tachadas.has(i);
                    return (
                        <button
                            key={i}
                            type="button"
                            className={styles.matchCell}
                            data-tachada={fuera ? 'si' : undefined}
                            onClick={() => onPick(i)}
                            disabled={fuera}
                            aria-label={fuera
                                ? `Canal descartado (${i + 1} de ${grid.celdas.length})`
                                : `Jugarla por acá (${i + 1} de ${grid.celdas.length})`}
                        >
                            {fuera ? '·' : '?'}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ── POR QUÉ LAS CELDAS NO LLEVAN RÓTULO ────────────────────────────────────
//
// Hubo una versión con el canal escrito en cada casilla —«ala izq», «ruck»,
// «ciego»— y se sacó. El motivo es el mismo que hace bueno al juego: las nueve
// son INDISTINGUIBLES, y un rótulo las distingue aunque no cambie nada.
//
// Un jugador que ve nueve nombres empieza a buscarles sentido, y como el sentido
// no existe, lo que aprende es una superstición que a veces funciona. Peor: el
// día que alguien quisiera que «ala izq» pesara distinto, nada se lo impediría y
// el juego dejaría de ser honesto sin que se notara.
//
// Nueve recuadros iguales dicen la verdad sin decir nada. El único dato real del
// tablero es la casilla tachada por la Visión.

/** Cómo se cuenta un try encontrado. Decorado, indexado por celda. */
const TRY_TEXTO = [
    'por el hombro débil', 'entre los dos centros', 'por afuera',
    'contra el poste', 'en el pliegue', 'de pura potencia',
    'por el lado ciego', 'con el pase corto', 'en la última',
] as const;

/** Cómo se cuenta un canal cerrado. Decorado, indexado por celda. */
const TACKLE_TEXTO = [
    'te esperaban', 'quedaste corto', 'te leyeron',
    'llegaron dos', 'perdiste la pelota', 'te cerraron el canal',
    'salió el tackle', 'te agarró el 7', 'no había nada',
] as const;

/**
 * EL HUECO — el tablero de la final.
 *
 * Nueve canales, tres con hueco. La tachada por Visión se dibuja tachada DESDE
 * EL PRINCIPIO y no se puede tocar: es información, no un premio — el jugador
 * tiene que verla antes de elegir o no le sirvió de nada.
 */
function Casillas({
    grid,
    rival,
    torneo,
    ronda,
    puesto,
    miUnion,
    vision,
    onPick,
}: {
    grid: CasillasGrid;
    rival: string;
    torneo: string;
    ronda: string;
    puesto: string;
    miUnion: string;
    vision: number;
    onPick: (index: number) => void;
}) {
    const encontrados = casillasEncontrados(grid);
    const restantes = casillasRestantes(grid);

    return (
        <div className={styles.huecoWrap}>
            <span className={styles.huecoOcasion}>🏆 {torneo} · {ronda}</span>
            <h3 className={styles.huecoTitulo}>El Hueco</h3>

            {/* LA LÍNEA DE PARTIDO. El marcador que se muestra es el de PERDER,
                y no es una licencia: es el partido tal como va. Encontrar los
                tres huecos es lo que lo da vuelta — si no aparecen, ese marcador
                es el que queda. Mostrar cualquier otro número sería inventar un
                partido que el motor no simuló. */}
            <p className={styles.huecoPartido}>
                <strong>{miUnion}</strong> <span className={styles.huecoSep}>vs</span>{' '}
                <strong>{rival}</strong>
                <span className={styles.huecoSep}>·</span>
                {grid.siPierde.puntos} – {grid.siPierde.puntosRival}
                <span className={styles.huecoSep}>·</span> minuto {grid.minuto}
                <span className={styles.huecoSep}>·</span> {puesto}
            </p>

            <p className={styles.huecoProsa}>
                Tres veces tenés que cruzar esa línea. La defensa no se mueve toda junta:
                en algún lado hay un canal que no está.
            </p>

            <div className={styles.huecoCounters}>
                <div className={`${styles.huecoCtr} ${styles.huecoCtrHi}`}>
                    <span className={styles.huecoCtrLbl}>Huecos encontrados</span>
                    <span className={styles.huecoCtrVal}>
                        {encontrados} <small>/ {CASILLAS_TRIES}</small>
                    </span>
                </div>
                <div className={styles.huecoCtr}>
                    <span className={styles.huecoCtrLbl}>Ataques restantes</span>
                    <span className={styles.huecoCtrVal}>{restantes}</span>
                </div>
            </div>

            <div className={styles.huecoCampo}>
                <span className={styles.huecoTryline} aria-hidden="true" />
                <span className={styles.huecoTrylineLbl} aria-hidden="true">línea de try</span>

                <div className={styles.huecoGrid} role="group" aria-label="Los nueve canales de la defensa">
                    {grid.celdas.map((tieneTry, i) => {
                        const abierta = grid.abiertas.includes(i);
                        const tachada = grid.tachada === i;
                        const clase = tachada
                            ? styles.huecoCeldaCut
                            : abierta
                                ? tieneTry ? styles.huecoCeldaTry : styles.huecoCeldaStop
                                : styles.huecoCeldaOpen;

                        return (
                            <button
                                key={i}
                                type="button"
                                className={`${styles.huecoCelda} ${clase}`}
                                disabled={abierta || tachada}
                                onClick={() => onPick(i)}
                                aria-label={
                                    tachada ? 'Canal descartado por tu Visión'
                                        : abierta
                                            ? (tieneTry ? 'Try' : 'Tackle')
                                            : `Atacar por acá (${i + 1} de ${grid.celdas.length})`
                                }
                            >
                                {tachada ? (
                                    <>
                                        <span className={styles.huecoX}>✕</span>
                                        <span className={styles.huecoTag}>Visión {vision}</span>
                                    </>
                                ) : abierta ? (
                                    <>
                                        <span className={styles.huecoBig}>{tieneTry ? 'TRY' : 'TACKLE'}</span>
                                        <span className={styles.huecoSub}>
                                            {tieneTry ? TRY_TEXTO[i] : TACKLE_TEXTO[i]}
                                        </span>
                                    </>
                                ) : (
                                    <span className={styles.huecoQ}>?</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {grid.tachada !== null && (
                <p className={styles.huecoVision}>
                    <span className={styles.huecoChip}>✓ Visión {vision}</span>
                    Te descartaron un canal cerrado antes de empezar. No sabés dónde está el
                    hueco: sabés dónde <strong>no</strong> está.
                </p>
            )}
        </div>
    );
}

/**
 * EL TITULAR DEL CIERRE.
 *
 * Dice qué pasó y no cuánto se sacó: es lo primero que se lee después de
 * destapar la celda que cerró la llave, y en ese momento lo único que importa es
 * si seguís o te vas a casa.
 */
function cierreTitulo(
    outcome: NonNullable<PendingTournament['outcome']>,
    labelEs: string,
    puesto: number | null,
): string {
    if (outcome === 'campeon') return `Campeones del ${labelEs}`;
    if (outcome === 'finalista') return 'Perdieron la final';
    // EL PUESTO Y NO «se terminó el torneo». Es el arreglo del bug que se veía en
    // pantalla: el que perdió los tres del grupo ganaba su semifinal y su final,
    // y el juego le contestaba con una frase que no decía qué había ganado.
    if (puesto !== null) return `Terminaron ${ordinal(puesto)} del mundo`;
    return 'Quedaron afuera';
}

/** La línea de abajo: dónde terminó y qué se llevó. */
function cierreTexto(t: PendingTournament, puesto: number | null): string {
    const jugados = t.matches.filter((m) => m.revealed).length;
    const ganados = t.matches.filter((m) => m.revealed && matchResult(m) === 'ganado').length;
    const marcador = `${ganados} de ${jugados}`;

    // Sin repetir el nombre del torneo: ya está en el titular Y en el copete de
    // arriba. Tres veces la misma frase en cuatro renglones es lo que hace que un
    // texto se deje de leer.
    if (t.outcome === 'campeon') return `${marcador}. La copa se vuelve con ustedes.`;
    if (t.outcome === 'finalista') return `${marcador}. Llegaron hasta la última y se les escapó ahí.`;
    if (puesto === 3) return `${marcador}. El tercer puesto, que se pelea igual.`;
    if (puesto !== null) return `${marcador}. Terminaron en el ${ordinal(puesto)} puesto.`;

    const ronda = ROUND_LABEL[t.finalRound ?? t.round].toLowerCase();
    return t.finalRound === 'grupos'
        ? `${marcador}. No alcanzaron los puntos del grupo.`
        : `${marcador}. Se terminó en ${ronda}.`;
}

/**
 * UNA CELDA.
 *
 * Tapada muestra la ronda y EL RIVAL; lo único que esconde es el marcador. En un
 * torneo de verdad el fixture se sabe con días de anticipación y lo que no se
 * sabe es cómo sale — esconder también contra quién jugás no agregaba tensión,
 * agregaba desorientación, y encima se contradecía con el botón de abajo, que
 * siempre dijo el nombre.
 */
function Celda({
    match,
    tag,
    onReveal,
}: {
    match: TournamentMatch;
    /** Cómo se lee la ronda EN ESTE TORNEO. Lo resuelve `roundTag` en el motor. */
    tag: string;
    onReveal: (() => void) | null;
}) {
    if (!match.revealed) {
        // La final que se juega en casillas se dibuja tapada y NO se toca: su
        // tablero está abajo. Las demás son botones.
        const contenido = (
            <>
                <span className={styles.tourCellRound}>{tag}</span>
                {/* El mismo signo que el tablero de la final, y no un punto:
                    «?» dice QUE HAY ALGO QUE NO SABÉS, que es lo que invita a
                    tocarlo. El punto decía «acá no hay nada todavía». La estrella
                    marca la final que se juega en casillas: esa no se destapa. */}
                <span className={styles.tourCellHidden}>{match.casillas ? '★' : '?'}</span>
                <span className={styles.tourCellRival}>{match.rivalName}</span>
            </>
        );

        if (!onReveal) {
            return (
                <div
                    className={styles.tourCell}
                    aria-label={`${tag} contra ${match.rivalName}, sin jugar`}
                >
                    {contenido}
                </div>
            );
        }

        return (
            <button
                type="button"
                className={`${styles.tourCell} ${styles.tourCellPick}`}
                onClick={onReveal}
                aria-label={`Jugar contra ${match.rivalName}`}
            >
                {contenido}
            </button>
        );
    }

    const res = matchResult(match);
    const clase = res === 'ganado'
        ? styles.tourCellWon
        : res === 'perdido' ? styles.tourCellLost : styles.tourCellDraw;

    return (
        <div className={`${styles.tourCell} ${styles.tourCellOpen} ${clase}`}>
            <span className={styles.tourCellRound}>
                {tag}
                {match.arenga && <span className={styles.tourCellArenga} title="Arengaste">◆</span>}
            </span>
            <span className={styles.tourCellScore}>
                {match.puntos}<span className={styles.tourCellDash}>–</span>{match.puntosRival}
            </span>
            <span className={styles.tourCellRival}>{match.rivalName}</span>

            {/* La definición a los palos, si la hubo. En rugby un cruce empatado
                se define pateando, y decirlo con el marcador de las patadas al
                lado del de los ochenta minutos es lo que evita que el 22-22 se
                lea como un partido que no terminó. */}
            {match.palos && (
                <span className={styles.tourCellKicks}>
                    a los palos {match.palos.tuyas.filter(Boolean).length}
                    –{match.palos.rivales.filter(Boolean).length}
                </span>
            )}

            {match.round === 'grupos' && (
                <span className={styles.tourCellPoints}>
                    +{tablePoints(match)} {tablePoints(match) === 1 ? 'punto' : 'puntos'}
                </span>
            )}
            <span className={styles.tourCellGrade}>{GRADE_LABEL[match.tuya]}</span>
        </div>
    );
}
