'use client';

import { useState } from 'react';
import type { CaptainState } from '@/features/captain';
import {
    ATTRIBUTE_LABEL,
    BELONGING_MAX,
    BELONGING_TIERS,
    belongingOf,
    belongingTier,
    bodyAnticipation,
    careerTally,
    clubLabel,
    competitionLabelOf,
    competitionOf,
    FIRST_TEAM_AGE,
    findCountry,
    flagPathOf,
    getFamily,
} from '@/features/captain';
import ClubBadge from './ClubBadge';
import Wallet from './Wallet';
import { statTier, statTierClass } from './statTier';
import styles from './capitan.module.css';

/**
 * La cabecera del jugador.
 *
 * La jerarquía es la del rugby y no la del fútbol: los caps van antes que la
 * vitrina (CLAUDE.md §5). Y la Pertenencia tiene su propia barra debajo, porque
 * es la moneda que define el final del juego y no una ficha más.
 *
 * La BILLETERA va al final y solo desde el contrato: es la moneda que aparece
 * cuando cambiás de vida, así que su lugar es después de la Pertenencia y no
 * mezclada con los contadores de la ficha. `onOpenShop` llega desde el
 * orquestador y solo en la pretemporada, que es cuando se puede comprar.
 */
export default function PlayerHeader({
    state,
    pantalla,
    onOpenShop,
}: {
    state: CaptainState;
    /**
     * QUÉ SE ESTÁ MOSTRANDO ABAJO, que no siempre es la fase del motor.
     *
     * El cierre de temporada se dibuja con el estado ya movido a la fase
     * siguiente —el reducer resuelve el año y abre lo que viene en la misma
     * acción—, así que preguntarle la fase al estado haría que la cabecera se
     * plegara en la pantalla equivocada. Lo sabe el orquestador, que es el que
     * elige la tarjeta, y por eso viene de arriba.
     */
    pantalla?: string;
    onOpenShop?: () => void;
}) {
    const { player } = state;
    const family = getFamily(player.family);
    /** Cuántos años le está adelantando el cuerpo al final. Lo dice el motor. */
    const aniosQueCuesta = bodyAnticipation(state.damage.cuerpo);
    const pertenencia = belongingOf(state.belonging, player.clubId);
    const tier = belongingTier(pertenencia);
    const tierDef = BELONGING_TIERS.find((t) => t.id === tier)!;

    const club = clubLabel(player.clubId);

    /**
     * LA PLANILLA DE LA CARRERA. Los cuatro números que un jugador de rugby dice
     * cuando le preguntan qué hizo, y que hasta ahora no estaban juntos en
     * ninguna pantalla: los caps y los títulos contaban la escalera, no lo que
     * pasó en la cancha.
     *
     * Es DERIVADA del historial (`engine/career-tally.ts`): no hay contador
     * guardado que se pueda desincronizar de las temporadas que la trayectoria
     * muestra abajo.
     */
    const planilla = careerTally(state);

    /** De dónde sos. La bandera va sola, así que su `alt` nombra el país. */
    const pais = findCountry(player.countryCode);

    /**
     * LA SELECCIÓN, en dos datos: si estás adentro y cuántos partidos jugaste.
     *
     * Decía «Seleccionado A», que es el nombre interno del carril y no le dice
     * nada a nadie. Se probó también con el país —«Seleccionado en Argentina»—
     * y sale mal: la unión sale de `capturedBy` / `registeredUnion`, que son
     * códigos de UNIÓN y no de país, y hay clubes cuya unión es `multi`. La
     * ficha mostraba «Seleccionado en multi».
     *
     * Los caps son los de la mayor y son de toda la carrera, así que se muestran
     * estés convocado hoy o no: un tipo con doce caps que este año no entró
     * sigue teniendo doce.
     */
    const caps = state.national.caps;
    const seleccion = `${state.national.track === 'club' ? 'No seleccionado' : 'Seleccionado'}`
        + ` · ${caps} ${caps === 1 ? 'cap' : 'caps'}`;

    // LA COMPETICIÓN DE ESTA CARRERA, no la del catálogo. Si el club ascendió o
    // descendió, la cabecera tiene que decir en qué división juega HOY: seguir
    // diciendo "Primera B de la URBA" después de subir es mentir en el renglón
    // que el jugador mira todas las temporadas.
    // Y HASTA LOS 18 NO ES ESA COMPETICIÓN, SON LAS JUVENILES. El plantel
    // superior es de mayores: a los 16 y a los 17 se juega con los de tu edad
    // (`FIRST_TEAM_AGE`), y la cabecera tiene que decir eso y no la división del
    // club — que es donde juegan los grandes, no él.
    const competicionId = competitionOf(state.divisions, player.clubId);
    const competencia = player.age < FIRST_TEAM_AGE
        ? 'Juveniles'
        : competicionId ? competitionLabelOf(competicionId) : '';

    /**
     * LOS ATRIBUTOS QUE TE HACEN. Los cuatro que declara la familia, en su orden
     * de peso, más el aguante.
     *
     * El aguante va aparte y último a propósito: es el único que NO entra en la
     * media (`data/positions.ts` lo deja fuera por construcción) y mezclarlo con
     * los otros cuatro haría creer que sube el número grande de la izquierda.
     */
    const pesoTotal = family.weights.reduce((a, w) => a + w, 0);
    const atributos = family.attributes.map((key, i) => ({
        key,
        label: ATTRIBUTE_LABEL[key],
        valor: player.attrs[key],
        peso: Math.round((family.weights[i] / pesoTotal) * 100),
    }));

    /** Los cortes de la barra: donde empieza cada escalón, sin el cero. */
    const cortes = BELONGING_TIERS.filter((t) => t.min > 0);

    /**
     * EL ESCALÓN DE LA MEDIA. Pinta el chip entero —tinte, borde y número— para
     * que el color diga lo mismo acá que en los atributos de abajo. El `title`
     * lo nombra con todas las letras: el color es un refuerzo del número, nunca
     * el único que lo cuenta.
     *
     * El escalón de abajo NO se nombra: «Base» no es un premio ni una categoría
     * que el juego use en ningún lado, y un globito que diga eso al pasar por
     * arriba de la media suena a que te falta algo. El color blanco ya dice todo
     * lo que hay que decir —todavía no entraste en la escalera—.
     */
    const escalonMedia = statTier(player.ovr);
    const nombreEscalon = escalonMedia.id === 'base' ? undefined : escalonMedia.labelEs;

    /**
     * LA FICHA PLEGADA, cuando el jugador se metió a plegarla.
     *
     * El defecto es VERLA: los atributos, los caps, los títulos y la planilla
     * son lo que el jugador viene a mirar, y en el teléfono hay alto para
     * tenerlos. La llave está para el caso contrario —una tarjeta de mercado con
     * cinco ofertas, donde por un rato prefiere la carta entera— y por eso el
     * estado arranca en `false` y no al revés.
     *
     * Vale sólo en el teléfono: el reparto lo hace el CSS y en escritorio la
     * ficha está siempre, que es donde el alto sobra. Por eso tampoco se
     * persiste (CLAUDE.md §2): es estado de pantalla, no de la carrera.
     */
    const [plegada, setPlegada] = useState(false);
    const abierta = !plegada;

    return (
        <>
            {/* ── LA PANTALLA, EN UN ATRIBUTO ─────────────────────────────────
                No es dato de la cabecera: es lo que le permite al teléfono
                repartir el alto según lo que el jugador está haciendo. En un
                Momento —un minijuego cronometrado— la planilla y los contadores
                no deciden nada y la cancha necesita el alto, así que el CSS los
                pliega preguntando por esto (`.shellBody:has([data-pantalla=…])`).
                Va acá y no en un `useEffect` sobre el `<body>` porque es estado
                que ya está en el render, y una clase en el body sobreviviría a
                la pantalla que la puso. */}
            <div
                className={styles.header}
                data-pantalla={pantalla}
                data-ficha={plegada ? 'cerrada' : 'abierta'}
            >
                <div className={`${styles.ovr} ${styles[escalonMedia.className]}`}>
                    <span className={styles.ovrValue} title={nombreEscalon}>
                        {player.ovr}
                    </span>
                    <span className={styles.ovrLabel}>MEDIA</span>
                </div>

                <div className={styles.identity}>
                    {/* ── LA BANDERA VA CON EL NOMBRE ─────────────────────────
                        De dónde sos es identidad, así que su lugar es al lado de
                        quién sos y no en una ficha aparte. Va con `alt` y no
                        vacío porque acá la bandera está SOLA: ningún texto de la
                        cabecera nombra el país (CLAUDE.md §6). */}
                    <p className={styles.headerName}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- SVG local estático; next/image no aporta acá */}
                        <img
                            src={flagPathOf(player.countryCode)}
                            alt={pais?.nameEs ?? player.countryCode}
                            width={22}
                            height={16}
                            className={styles.flag}
                        />
                        <span className={styles.name}>{player.name} {player.surname}</span>
                    </p>
                    {/* ── NI EL TECHO NI LO CONSTRUIDO ────────────────────────
                        Acá iba «techo 82» y después «+5 construido». El techo se
                        fue porque el juego todavía no terminó de contestar esa
                        pregunta —el techo es el material que te tocó MÁS lo que
                        construyas— y como número al lado de la edad se leía como
                        una sentencia a los 16. Se revela en el retiro
                        (`Retirement.tsx`), que es cuando la brecha ya es una
                        historia.

                        Lo construido se fue detrás: es una cuenta interna del
                        motor —cuánto te movió la pretemporada— y estaba ocupando
                        el renglón de la identidad, que es donde el jugador busca
                        quién es y no cómo llegó. Lo que va en su lugar es la
                        planilla: partidos, tries, puntos y tackles. */}
                    <p className={styles.role}>
                        {family.labelEs} · {player.number} · {player.age} años
                    </p>
                </div>

                {/* ── LA PLANILLA, EN LA CABECERA ─────────────────────────────
                    Dos filas por dos columnas, y en el hueco que la cabecera
                    tenía vacío entre el nombre y el escudo. No repite nada de la
                    ficha de abajo: aquello es la ESCALERA —caps, títulos, HIA,
                    cartel, temporadas— y esto es LA CANCHA.

                    Los ceros se dibujan igual, por el mismo motivo que la fila de
                    la ficha: un cero dice «todavía no jugaste una temporada
                    entera», y sin la fila el jugador no sabe que estos cuatro
                    números existen. */}
                <div className={styles.tally}>
                    <div className={styles.tallyCell} title="Partidos jugados">
                        <span className={styles.tallyValue}>{planilla.matches}</span>
                        <span className={styles.tallyLabel}>PJ</span>
                    </div>
                    <div className={styles.tallyCell}>
                        <span className={styles.tallyValue}>{planilla.tries}</span>
                        <span className={styles.tallyLabel}>Tries</span>
                    </div>
                    <div className={styles.tallyCell} title="Puntos">
                        <span className={styles.tallyValue}>{planilla.points}</span>
                        <span className={styles.tallyLabel}>Pts</span>
                    </div>
                    <div className={styles.tallyCell}>
                        <span className={styles.tallyValue}>{planilla.tackles}</span>
                        <span className={styles.tallyLabel}>Tackles</span>
                    </div>
                </div>

                {/* ── EL ESCUDO, ARRIBA A LA DERECHA ─────────────────────────
                    Es la esquina de la identidad: a la izquierda quién sos
                    (la media y tu nombre) y a la derecha de quién sos. El
                    nombre del club sigue estando en la barra de abajo, así que
                    acá el escudo es decorativo y no repite nada al lector de
                    pantalla — pero lleva `title`, porque un escudo sin nombre a
                    22 px no siempre se reconoce. */}
                {player.clubId && (
                    <div className={styles.headerCrest}>
                        <ClubBadge clubId={player.clubId} clubName={club} size={44} />
                    </div>
                )}

                {/* ── LA LLAVE DE LA FICHA ────────────────────────────────────
                    Sólo se dibuja en el teléfono —el CSS la apaga de 768 para
                    arriba— porque es ahí donde el alto es el recurso escaso y
                    donde la ficha se pliega sola fuera de la pretemporada.
                    Ícono solo, así que lleva `aria-label` (CLAUDE.md §6), y el
                    rótulo dice lo que va a pasar, no dónde estás parado. */}
                <button
                    type="button"
                    className={styles.fichaKey}
                    onClick={() => setPlegada(abierta)}
                    aria-expanded={abierta}
                    aria-label={abierta ? 'Ocultar la ficha del jugador' : 'Ver la ficha del jugador'}
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <path d={abierta ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
                    </svg>
                </button>
            </div>

            {/* LA FICHA: los contadores y los atributos, en UNA tarjeta. La
                cabecera y la barra de Pertenencia ya son dos cajas; sumar dos
                más deja la pantalla en cuatro rectángulos apilados antes de que
                el juego empiece. */}
            <div className={styles.dossier}>
            {/* ── LA PLANILLA, SIEMPRE ────────────────────────────────────────
                Estos tres se mostraban SOLO cuando alguno dejaba de ser cero.
                La idea era no gastar el tercio derecho de la cabecera en decir
                que en la primera temporada todavía no pasó nada, y como fila
                propia esa razón ya no corre: no le saca lugar a la identidad.

                Y esconderlos tenía un costo que la idea no contemplaba: un cero
                TAMBIÉN es información —«no llegaste a la selección todavía»— y
                sin la fila el jugador no sabe que esos contadores existen ni qué
                está persiguiendo. */}
            <div className={styles.statsRow}>
                {/* Los caps primero: valen más que los títulos (CLAUDE.md §5). */}
                <div className={styles.stat}>
                    <span className={styles.statValue}>{state.national.caps}</span>
                    <span className={styles.statLabel}>Caps</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statValue}>{state.titles.length}</span>
                    <span className={styles.statLabel}>Títulos</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statValue}>{state.damage.hia}</span>
                    <span className={styles.statLabel}>HIA</span>
                </div>
                {/* EL DESGASTE, que es el reloj que de verdad termina la
                    carrera y hasta la 0.29.0 no se veía en ninguna pantalla. El
                    jugador tenía a la vista la cuenta de la cabeza —que le cuesta
                    Visión— y no la del cuerpo, que le cuesta AÑOS.

                    Se pone en rojo recién cuando empieza a cobrar años, y el
                    umbral lo pregunta el motor (`bodyAnticipation`) en vez de
                    escribirlo acá: una copia del piso se quedaría vieja el día
                    que el reloj se recalibre y el color pasaría a encenderse
                    donde ya no pasa nada. */}
                <div className={styles.stat}>
                    <span
                        className={`${styles.statValue} ${aniosQueCuesta > 0 ? styles.statWear : ''}`}
                        title={aniosQueCuesta > 0
                            ? `El cuerpo te está adelantando ${aniosQueCuesta} ${aniosQueCuesta === 1 ? 'año' : 'años'} el final de la carrera.`
                            : 'El cuerpo todavía no te cobra años.'}
                    >
                        {Math.round(state.damage.cuerpo)}
                    </span>
                    <span className={styles.statLabel}>Desgaste</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statValue}>{Math.round(state.fame)}</span>
                    <span className={styles.statLabel}>Cartel</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statValue}>{state.history.length}</span>
                    <span className={styles.statLabel}>Temporadas</span>
                </div>
            </div>

            {/* ── LOS ATRIBUTOS ──────────────────────────────────────────────
                El jugador elegía un puesto que el propio juego llama «la
                decisión más determinante», ese puesto se define por cuatro
                atributos, y esos cuatro no se veían en ninguna pantalla: la
                media los resumía en un número y la carta de pretemporada
                prometía moverlos a ciegas.

                Van con su PESO en la media, que es lo que convierte la lista en
                una decisión: saber que la pegada vale 45 y la visión 20 es lo
                que te dice qué carta conviene. */}
            {/* El escalón va en el CONTENEDOR de cada atributo y no en el número:
                ahí las variables del escalafón las alcanzan los dos que las
                usan, el número y la barra. En el teléfono la barra no se dibuja
                (`.attrTrack` se apaga a 767) y el número queda solo con el
                color, que es justo lo que hace falta cuando sobra ancho y falta
                alto. */}
            <div className={styles.attrs}>
                {atributos.map((a) => (
                    <div key={a.key} className={`${styles.attr} ${styles[statTierClass(a.valor)]}`}>
                        <span className={styles.attrTop}>
                            <span className={styles.attrLabel}>{a.label}</span>
                            <span className={styles.attrWeight}>{a.peso}%</span>
                        </span>
                        <span className={`${styles.attrValue} ${styles.statInk}`}>{a.valor}</span>
                        <span className={styles.attrTrack} aria-hidden="true">
                            <span className={styles.attrFill} style={{ transform: `scaleX(${a.valor / 99})` }} />
                        </span>
                    </div>
                ))}
                <div
                    className={`${styles.attr} ${styles.attrAside} ${styles[statTierClass(player.attrs.aguante)]}`}
                >
                    <span className={styles.attrTop}>
                        <span className={styles.attrLabel}>{ATTRIBUTE_LABEL.aguante}</span>
                        {/* "aparte" y no "fuera de la media": con la frase larga
                            la columna se quedaba sin ancho y la etiqueta salía
                            cortada como «AGUA…». El porqué completo va en el
                            `title`, que es donde no le roba lugar a nada. */}
                        <span className={styles.attrWeight} title="No entra en la media del puesto">aparte</span>
                    </span>
                    <span className={`${styles.attrValue} ${styles.statInk}`}>{player.attrs.aguante}</span>
                    <span className={styles.attrTrack} aria-hidden="true">
                        <span className={styles.attrFill} style={{ transform: `scaleX(${player.attrs.aguante / 99})` }} />
                    </span>
                </div>
            </div>
            </div>

            <div className={styles.belongingBar}>
                <div className={styles.belongingTop}>
                    <span className={styles.belongingTier}>
                        {tierDef.icon} {tierDef.labelEs}
                    </span>
                    <span className={`${styles.belongingClub} ${styles.belongingClubMain}`}>
                        {club}{competencia ? ` · ${competencia}` : ''}
                    </span>
                </div>
                <div
                    className={styles.track}
                    role="progressbar"
                    aria-valuenow={Math.round(pertenencia)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Pertenencia con ${club}`}
                >
                    {/* `scaleX` en vez de `width`: el ancho es una propiedad de
                        layout y esta barra se anima en cada temporada. */}
                    <span
                        className={styles.fill}
                        style={{ transform: `scaleX(${Math.min(100, Math.max(0, pertenencia)) / 100})` }}
                    />
                    {/* ── LOS ESCALONES, MARCADOS ────────────────────────────
                        La barra iba lisa, así que decía cuánto llevás pero no
                        cuánto falta para el escalón siguiente — y el escalón es
                        lo único que el jugador puede perseguir: «Titular» a los
                        25, «Referente» a los 50, «Capitán» a los 75, «Vitalicio»
                        a los 95.

                        Los cortes salen de `BELONGING_TIERS` y no de una lista
                        escrita acá: son el mismo dato que usa el motor para
                        resolver en qué escalón estás, así que no pueden
                        desincronizarse. Mover un umbral mueve la línea sola. */}
                    {cortes.map((t) => (
                        <span
                            key={t.id}
                            className={`${styles.tick} ${pertenencia >= t.min ? styles.tickOn : ''}`}
                            style={{ left: `${(t.min / BELONGING_MAX) * 100}%` }}
                            aria-hidden="true"
                            title={`${t.labelEs} · ${t.min}`}
                        />
                    ))}
                </div>
                {/* Las etiquetas van DEBAJO y no encima de la barra: adentro de
                    6 px de alto no entra un texto legible, y una barra con
                    letras adentro deja de leerse como barra. */}
                <div className={styles.tierScale} aria-hidden="true">
                    {BELONGING_TIERS.map((t) => (
                        <span
                            key={t.id}
                            className={`${styles.tierMark} ${tier === t.id ? styles.tierMarkOn : ''}`}
                            style={{ left: `${(t.min / BELONGING_MAX) * 100}%` }}
                        >
                            {t.labelEs}
                        </span>
                    ))}
                </div>
                {/* ── LA CONVOCATORIA, SIEMPRE ────────────────────────────────
                    Antes se dibujaba sólo cuando había carril de selección, así
                    que el jugador que no está convocado no leía nada: no podía
                    distinguir «no me llamaron» de «esto no lo muestra». Ahora la
                    línea está siempre y dice «Sin convocatoria» con todas las
                    letras. En escritorio se sigue viendo sólo cuando hay carril:
                    el CSS la apaga por `data-track`, y ahí el club y su
                    competición siguen a la vista dos renglones más arriba. */}
                <p
                    className={`${styles.belongingClub} ${styles.belongingTrack}`}
                    data-track={state.national.track}
                >
                    {seleccion}
                    {/* El rival va en su propio `span` para que el teléfono
                        pueda quedarse con la convocatoria sola: la pelea por el
                        puesto es una segunda historia y ahí no hay renglón. */}
                    {state.rival && (
                        <span className={styles.belongingRival}>
                            {' · te pelea el puesto '}{state.rival.name} {state.rival.surname}
                        </span>
                    )}
                </p>
            </div>

            <Wallet state={state} onOpenShop={onOpenShop} />
        </>
    );
}
