'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CaptainState, GloryUnit, PositionFamily } from '@/features/captain';
import {
    AWARD_LABELS,
    BELONGING_MAX,
    BELONGING_TIERS,
    belongingTier,
    careerTally,
    clubLabel,
    findCountry,
    getFamily,
    longevityRevealText,
    profileRevealText,
    trackLabelOf,
    unionName,
} from '@/features/captain';
import { careerTitleOf } from './careerTitle';
import { flagPathOf } from '@/features/captain/data/catalogs';
import ClubBadge from './ClubBadge';
import { awardArtOf } from './awardArt';
import { crestSourceOf, initialsOf, monogramColor } from './clubCrest';
import {
    buildCareerPoster,
    POSTER_FORMATS,
    type PosterFormat,
    type PosterModel,
    type PosterStint,
} from './careerPoster';
import { groupAwards, groupTitles, trailOf, type TrailStint } from './careerTrail';
import { statTierClass } from './statTier';
import styles from './capitan.module.css';

/**
 * El retiro.
 *
 * ── LA PANTALLA ES LA TRAYECTORIA, Y NADA MÁS ───────────────────────────────
 * Antes era una pila de listas —la vitrina, los premios, los hitos— y cada copa
 * era una línea suelta con el club escrito al lado. Un jugador no recuerda su
 * carrera así: la recuerda por camisetas, y todo lo que pasó vive adentro de la
 * camiseta con la que pasó. Eso es lo que arma `careerTrail.ts`, y de ahí sale
 * lo único que se ve acá: los clubes por los que pasaste y, en cada uno, la
 * Pertenencia que construiste, lo que levantaste, los premios que ganaste y lo
 * que produjiste en cancha. La selección va aparte porque no es un club — es la
 * otra escalera, con sus caps y sus copas.
 *
 * La columna lateral que llevaba los premios, los hitos y las notas se fue
 * entera: obligaba a ir y volver entre «Mejor jugador del mundo T13» y la
 * camiseta que estabas usando en T13, que es exactamente el trabajo que esta
 * pantalla tiene que hacer por el jugador.
 *
 * ── Y ENTRA EN UNA PANTALLA ─────────────────────────────────────────────────
 * El alto es fijo (`.final`) y lo que scrollea es el cuerpo, no la página. Lo
 * que NUNCA se va de la vista es lo que cierra la carrera: el veredicto, los
 * números y las dos acciones. Una carrera de quince temporadas y nueve clubes
 * hace scroll adentro de la caja; una de cinco entra entera.
 */

/** Los escalones que se dibujan en la barra: todos menos el piso. */
const CORTES = BELONGING_TIERS.filter((t) => t.min > 0);

/**
 * El renglón de abajo del club: cuándo y cuánto.
 *
 * El paso de `seasons: 0` es el que existe SÓLO por una copa (ver
 * `careerTrail.ts`): ahí no se afirma ninguna temporada jugada, porque no la
 * hubo.
 */
function rangoDe(stint: TrailStint): string {
    const rango = stint.from === stint.to ? `T${stint.from}` : `T${stint.from}–T${stint.to}`;
    if (stint.seasons === 0) return rango;

    return `${rango} · ${stint.seasons} ${stint.seasons === 1 ? 'temporada' : 'temporadas'}`;
}

/**
 * Lo mismo, con los PJ pegados.
 *
 * Es lo que lee la IMAGEN y no la pantalla: el póster no tiene el renglón de
 * estadísticas, así que ahí los partidos tienen que viajar con el rango o se
 * pierden.
 */
function metaDe(stint: TrailStint): string {
    if (stint.seasons === 0) return rangoDe(stint);
    return `${rangoDe(stint)} · ${stint.matches} PJ`;
}

/**
 * Lo mismo, sin las temporadas.
 *
 * Lo lee la fila de UNA LÍNEA del póster, donde el renglón entero comparte
 * ancho con el nombre del club. «7 temporadas» es lo primero que se resigna
 * porque el rango ya lo dice: T3–T9 son siete, y contarlas es trabajo de nadie.
 */
function metaCortaDe(stint: TrailStint): string {
    const rango = stint.from === stint.to ? `T${stint.from}` : `T${stint.from}–T${stint.to}`;
    if (stint.seasons === 0) return rango;
    return `${rango} · ${stint.matches} PJ`;
}

/**
 * EL RENGLÓN DE NÚMEROS DE LA CAMISETA.
 *
 * Los PJ primero —es la unidad de todo lo demás—, después lo del PUESTO, que es
 * la única estadística que en rugby significa algo distinto para cada uno
 * (CLAUDE.md §5: el apertura suma palos y la segunda línea, line-outs), y al
 * final las dos que miden cómo jugaste: la media más alta que alcanzaste ahí y
 * el puntaje medio de esas temporadas.
 *
 * El cero no se escribe. Un `0 tries` en el paso del pilar no informa nada —esa
 * no es su métrica— y una temporada sin jugar por lesión ya se cuenta en los PJ.
 */
function statsDe(stint: TrailStint, glory: PositionFamily['glory']): string {
    const { stats } = stint;

    // El porcentaje lleva su signo y un decimal; lo que se cuenta va entero, que
    // es como lo muestra la fila de números de arriba. El decimal va con COMA:
    // el renglón mezcla los dos —«81,9% al palo · puntaje 6,2»— y un punto en
    // uno de los dos se lee como otra cosa.
    const numero = (valor: number, unit: GloryUnit): string => (unit === 'percent'
        ? `${(Math.round(valor * 10) / 10).toFixed(1).replace('.', ',')}%`
        : String(Math.round(valor)));

    const partes = [`${stats.matches} PJ`];

    if (stats.glory > 0) {
        partes.push(`${numero(stats.glory, glory.primary.unit)} ${glory.primary.labelEs.toLowerCase()}`);
    }
    if (glory.secondary && stats.glorySecondary > 0) {
        partes.push(`${numero(stats.glorySecondary, glory.secondary.unit)} ${glory.secondary.labelEs.toLowerCase()}`);
    }
    if (stats.bestOvr > 0) partes.push(`media ${stats.bestOvr}`);

    // ── EL PUNTAJE MEDIO NO VA ──────────────────────────────────────────────
    // Estaba al final de cada camiseta —«puntaje 6,5»— y es el único número de
    // la fila que no se puede contar: los PJ, los puntos y la media son cosas
    // que pasaron, y el puntaje es una nota que el juego se pone a sí mismo.
    // Al lado de una media y unos partidos se leía como una calificación de la
    // etapa, que es más de lo que el número sabe decir.

    return partes.join(' · ');
}

/** «T7 T9», que es como se leen dos títulos de la misma copa. */
function años(seasons: readonly number[]): string {
    return seasons.map((s) => `T${s}`).join(' ');
}

/**
 * CUÁNTAS VECES, para los premios individuales. La misma regla que el póster
 * (`careerPoster.ts`), y por el mismo motivo: una copa se gana en un año que se
 * relee, un premio repetido es una cantidad. Nueve temporadas listadas al lado
 * de «Mejor jugador del mundo» esconden el logro en vez de mostrarlo.
 */
function veces(seasons: readonly number[]): string {
    return seasons.length > 1 ? `×${seasons.length}` : '';
}

/**
 * La vitrina de una camiseta: las copas y los premios que ganaste con ella.
 *
 * Van en la MISMA lista y en ese orden —primero lo que ganó el club, después lo
 * que ganaste vos— porque las dos cosas contestan la misma pregunta: qué pasó
 * mientras usabas esa camiseta. Se distinguen por el ícono, no por dos bloques
 * con títulos, que es lo que hacía la columna de al lado.
 */
function Vitrina({
    titles,
    awards = [],
}: {
    titles: TrailStint['titles'];
    awards?: TrailStint['awards'];
}) {
    if (titles.length === 0 && awards.length === 0) return null;

    return (
        <ul className={styles.trophies}>
            {groupTitles(titles).map((t) => (
                <li key={t.competitionId} className={styles.trophy}>
                    <span className={styles.trophyIcon} aria-hidden="true">🏆</span>
                    <span className={styles.trophyLabel}>{t.label}</span>
                    <span className={styles.trophyYears}>{años(t.seasons)}</span>
                </li>
            ))}
            {groupAwards(awards).map((a) => (
                <li key={a.id} className={`${styles.trophy} ${styles.award}`}>
                    <span className={styles.trophyIcon} aria-hidden="true">🏅</span>
                    <span className={styles.trophyLabel}>{AWARD_LABELS[a.id]}</span>
                    <span className={styles.trophyYears}>{veces(a.seasons)}</span>
                </li>
            ))}
        </ul>
    );
}

/**
 * Un paso por un club: la Pertenencia que construiste, lo que ganaste y lo que
 * produjiste ahí.
 *
 * ── LA BARRA, Y NO UNA ETIQUETA ─────────────────────────────────────────────
 * Acá había un chip con el nombre del escalón, y el escalón de abajo se
 * escondía: repetido en las seis camisetas, «Uno del plantel» no distinguía
 * nada. Con la barra el problema se da vuelta —cada club dibuja un largo
 * distinto, así que ya no hay dos filas iguales— y el nombre pasa a ser la
 * leyenda de la barra: se muestra siempre, apagado en el piso para que el club
 * donde llegaste a Capitán siga siendo el que salta a la vista.
 *
 * Va a nivel de módulo y no adentro del render: un componente declarado adentro
 * es un tipo nuevo en cada pasada, así que React desmonta y vuelve a montar todo
 * el subárbol —los escudos incluidos— cada vez que la pantalla se dibuja.
 */
function Paso({ stint, glory }: { stint: TrailStint; glory: PositionFamily['glory'] }) {
    const nombre = clubLabel(stint.clubId);
    const pertenencia = Math.round(stint.belonging);
    const escalon = BELONGING_TIERS.find((t) => t.id === belongingTier(stint.belonging));

    // El paso que existe SÓLO por una copa no tiene ni barra ni números: no se
    // jugó una temporada ahí, así que no hay nada que medir.
    const jugado = stint.seasons > 0;

    return (
        <article className={styles.trailStint}>
            <div className={styles.trailTop}>
                {stint.clubId
                    ? <ClubBadge clubId={stint.clubId} clubName={nombre} size={34} />
                    : <span className={styles.trailNoCrest} aria-hidden="true" />}
                <div className={styles.trailWho}>
                    <span className={styles.trailClub}>{nombre}</span>
                    <span className={styles.trailMeta}>{rangoDe(stint)}</span>
                </div>
            </div>

            {jugado && escalon && (
                <div className={styles.trailBelonging}>
                    <div
                        className={styles.track}
                        role="progressbar"
                        aria-valuenow={pertenencia}
                        aria-valuemin={0}
                        aria-valuemax={BELONGING_MAX}
                        aria-label={`Pertenencia con ${nombre}`}
                    >
                        <span
                            className={styles.fill}
                            style={{ transform: `scaleX(${Math.min(1, Math.max(0, stint.belonging / BELONGING_MAX))})` }}
                        />
                        {/* Los mismos cortes que la barra de la partida, del mismo
                            dato: mover un umbral mueve las dos. */}
                        {CORTES.map((t) => (
                            <span
                                key={t.id}
                                className={`${styles.tick} ${stint.belonging >= t.min ? styles.tickOn : ''}`}
                                style={{ left: `${(t.min / BELONGING_MAX) * 100}%` }}
                                aria-hidden="true"
                            />
                        ))}
                    </div>
                    <span className={`${styles.trailTier} ${escalon.min === 0 ? styles.trailTierBase : ''}`}>
                        {escalon.icon} {escalon.labelEs}
                        <b className={styles.trailTierValue}>{pertenencia}</b>
                    </span>
                </div>
            )}

            <Vitrina titles={stint.titles} awards={stint.awards} />

            {jugado && <p className={styles.trailStats}>{statsDe(stint, glory)}</p>}
        </article>
    );
}

export default function Retirement({
    state,
    onRestart,
}: {
    state: CaptainState;
    onRestart: () => void;
}) {
    const { player } = state;
    const family = getFamily(player.family);
    const trail = useMemo(() => trailOf(state), [state]);

    // La Pertenencia que cuenta es la más alta que alcanzaste en cualquier
    // club: es lo que el rugby recuerda. De acá sale el veredicto, y la de cada
    // camiseta la trae su propio paso.
    const clubes = Object.values(state.belonging.byClub).sort((a, b) => b - a);
    const mejorPertenencia = clubes[0] ?? 0;

    const partidos = state.history.reduce((acc, h) => acc + h.matchesPlayed, 0);

    /** De dónde sos: la bandera de la cabecera va sola, así que su `alt` lo nombra. */
    const pais = findCountry(player.countryCode);

    /**
     * LA PLANILLA COMPLETA, y no sólo la métrica del puesto.
     *
     * Acá se mostraba `family.glory.primary` —«Puntos» para el apertura, «Tries»
     * para el wing—, así que la carrera de un pilar terminaba sin decir cuántos
     * tries hizo y la de un wing sin decir cuántos puntos. `careerTally` sabe
     * traducir la métrica de cualquier puesto a las cuatro que se cuentan en
     * todas las canchas, y ésta es la pantalla donde se cierra la cuenta.
     */
    const planilla = careerTally(state);

    /**
     * EL TÍTULO DE LA CARRERA: qué fue LO TUYO, de todo lo que hiciste.
     *
     * Sale de treinta candidatos ordenados de raro a común y gana el primero que
     * cumple, así que el que fue varias cosas se lleva la menos frecuente. No
     * tiene azar: la misma carrera termina siempre con el mismo título.
     */
    const titulo = useMemo(() => careerTitleOf(state), [state]);

    /* La media más alta que tuviste, que es la única celda de la grilla que es
       una ESTADÍSTICA y no un contador: por eso es la única que se pinta con el
       escalafón (`statTier.ts`). Un 91 de partidos no es élite de nada.
       Es la de TODA la carrera; la de cada club la trae su paso. */
    const mejorMedia = Math.max(player.ovr, ...state.history.map((h) => h.ovr));

    const motivo = player.retirementReason === 'tope-del-puesto'
        ? 'El puesto no da para más años.'
        : player.retirementReason === 'cuerpo'
            ? 'El cuerpo dijo basta antes que la cabeza.'
            : player.retirementReason === 'decision'
                ? 'Te fuiste cuando quisiste vos.'
                : 'Llegó la edad y se notó.';

    const vitalicio = mejorPertenencia >= 95;
    const veredicto = vitalicio ? 'La cancha 1 lleva tu nombre' : 'Se terminó';

    // La selección sólo ocupa lugar si existió. Un jugador que nunca fue
    // convocado no necesita una fila que le diga que no lo llamaron: el cero ya
    // está en la grilla de arriba (CLAUDE.md §6, nada de paneles vacíos).
    const huboSeleccion = trail.national.caps > 0 || trail.national.titles.length > 0;
    const seleccion = unionName(player.countryCode);

    /**
     * El renglón de la selección.
     *
     * «0 caps» no se escribe: se llega a esta fila también por una copa juvenil,
     * y arrancar la línea con un cero convierte el logro en una carencia. Sin
     * caps se nombra el escalón que sí pisaste, y si tampoco hay escalón, la
     * copa habla sola.
     */
    const metaNacional = trail.national.caps > 0
        ? `${trail.national.caps} caps · ${trackLabelOf(state.national.bestTrack, state.player.countryCode)}`
        : state.national.bestTrack !== 'club'
            ? trackLabelOf(state.national.bestTrack, state.player.countryCode)
            : 'Con tu selección';

    /**
     * EL RENGLÓN DEL SELECCIONADO A, y la palabra que NO aparece.
     *
     * No dice «caps», y es lo único que hay que cuidar acá: un partido con
     * Argentina XV no es un cap, y ésta es justamente la pantalla donde
     * confundirlos saldría más caro — es la que el jugador relee y la que
     * comparte. Dice partidos y temporadas, que es lo que fueron.
     *
     * `null` cuando el bloque llegó sólo por una copa vieja sin historial: ahí la
     * copa habla sola, igual que en el renglón de arriba, y «0 temporadas» sería
     * convertir un logro en una carencia.
     */
    const xv = trail.xv;
    const metaXv = xv === null || xv.seasons === 0
        ? null
        : `${xv.matches} ${xv.matches === 1 ? 'partido' : 'partidos'}`
            + ` · ${xv.seasons} ${xv.seasons === 1 ? 'temporada' : 'temporadas'}`;

    // ── La imagen ───────────────────────────────────────────────────────────
    // Se arma AL ENTRAR y no al tocar el botón: en el celular la hoja para
    // compartir sólo se abre si la llama el gesto del dedo, y armar el PNG en el
    // medio rompe esa cadena. Es la misma lección que la tarjeta de Carrera de
    // Rugby, donde el archivo se pide apenas se elige el formato.
    //
    // El formato arranca en 9:16 porque es el que entra entero: la historia
    // tiene 570 px más y ahí la trayectoria casi nunca se resume. El que quiera
    // publicarla en el feed cambia a 4:5 y el PNG se rehace solo.
    const [formato, setFormato] = useState<PosterFormat>('9:16');

    // El blob viaja CON su formato. Sin eso, entre que se toca 4:5 y que el PNG
    // nuevo termina de armarse, el botón comparte el de 9:16 —el jugador pidió
    // una cosa y se lleva otra, y encima no hay forma de que se entere.
    const poster = useRef<{ formato: PosterFormat; blob: Blob } | null>(null);
    const [imagen, setImagen] = useState<'armando' | 'lista' | 'sin'>('armando');
    const [aviso, setAviso] = useState('');

    const modelo = useMemo<PosterModel>(() => {
        const paso = (stint: TrailStint): PosterStint => {
            const nombre = clubLabel(stint.clubId);
            const fuente = stint.clubId ? crestSourceOf(stint.clubId, nombre) : null;
            return {
                clubName: nombre,
                crestSrc: fuente?.src ?? null,
                initials: initialsOf(nombre),
                color: stint.clubId ? monogramColor(stint.clubId) : 'rgba(255,255,255,0.14)',
                meta: metaDe(stint),
                metaShort: metaCortaDe(stint),
                trophies: groupTitles(stint.titles).map((t) => ({ label: t.label, seasons: t.seasons })),
            };
        };

        return {
            name: player.name,
            surname: player.surname,
            role: `${family.labelEs} · ${player.number} · retirado a los ${player.age}`,
            flagSrc: flagPathOf(player.countryCode),
            verdict: veredicto,
            verdictTone: vitalicio ? 'gold' : 'plain',
            stats: [
                { label: 'Temporadas', value: String(state.history.length) },
                { label: 'Partidos', value: String(partidos) },
                { label: 'Caps', value: String(state.national.caps) },
                { label: 'Títulos', value: String(state.titles.length) },
                { label: 'Mejor media', value: String(mejorMedia) },
            ],
            // LO QUE GANASTE VOS. Sale de `state.awards`, que es la lista
            // canónica —la misma que lee `careerTrail`— y no del `awards[]` de
            // la fila del año: son la misma cosa hoy, pero si dejaran de serlo
            // manda el estado y no su copia.
            awards: groupAwards(state.awards).map((a) => ({
                label: AWARD_LABELS[a.id],
                artSrc: awardArtOf(a.id),
                seasons: a.seasons,
            })),
            stints: trail.stints.map(paso),
            national: huboSeleccion
                ? {
                    label: seleccion,
                    flagSrc: flagPathOf(player.countryCode),
                    meta: metaNacional,
                    trophies: groupTitles(trail.national.titles).map((t) => ({
                        label: t.label,
                        seasons: t.seasons,
                    })),
                }
                : null,
        };
    }, [
        family.labelEs, huboSeleccion, mejorMedia, metaNacional, partidos, player.age,
        player.countryCode, player.name, player.number, player.surname, seleccion,
        state.awards, state.history.length, state.national.caps, state.titles.length,
        trail, veredicto, vitalicio,
    ]);

    useEffect(() => {
        let vivo = true;
        setImagen('armando');

        buildCareerPoster(modelo, formato)
            .then((blob) => {
                if (!vivo) return;
                poster.current = blob ? { formato, blob } : null;
                setImagen(blob ? 'lista' : 'sin');
            })
            .catch(() => {
                if (vivo) setImagen('sin');
            });

        return () => {
            vivo = false;
        };
    }, [modelo, formato]);

    const exportar = useCallback(async () => {
        const guardado = poster.current;
        let blob = guardado && guardado.formato === formato ? guardado.blob : null;

        // Si todavía no estaba —o es el de la otra hoja—, se arma ahora: perder
        // la hoja de compartir es mejor que llevarse el formato equivocado.
        if (!blob) {
            try {
                blob = await buildCareerPoster(modelo, formato);
            } catch {
                blob = null;
            }
            poster.current = blob ? { formato, blob } : null;
        }

        if (!blob) {
            setImagen('sin');
            setAviso('No se pudo armar la imagen.');
            return;
        }

        const archivo = `el-capitan-${player.surname.toLowerCase()}-${formato.replace(':', 'x')}.png`;
        const file = new File([blob], archivo, { type: 'image/png' });
        const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };

        if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
            try {
                await nav.share({ files: [file], title: `${player.name} ${player.surname} · El Capitán` });
                setAviso('');
            } catch {
                // Cancelar la hoja de compartir no es un error: no se avisa nada.
                setAviso('');
            }
            return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = archivo;
        a.click();
        URL.revokeObjectURL(url);
        setAviso('Imagen descargada.');
    }, [formato, modelo, player.name, player.surname]);

    return (
        <div className={`${styles.card} ${styles.final}`}>
            <div className={styles.finalHead}>
                <span className={styles.eyebrow}>
                    {state.history.length} temporadas · {family.labelEs}
                </span>
                <h2 className={styles.finalTitle}>{veredicto}</h2>

                {/* ── CÓMO TE VAN A NOMBRAR ───────────────────────────────────
                    Va debajo del veredicto y antes que los números porque es lo
                    que se lee primero y lo único que se recuerda: el veredicto
                    dice que la carrera terminó, los números dicen cuánto, y esto
                    dice QUÉ FUISTE. El «por qué» al lado, en chico, para que el
                    título no quede como una etiqueta que el juego reparte al
                    azar — que es justo lo que no es. */}
                <p className={styles.careerTitle}>
                    <span className={styles.careerTitleLabel}>{titulo.label}</span>
                    <span className={styles.careerTitleHint}>{titulo.hint}</span>
                </p>

                <p className={styles.finalLead}>
                    {/* ── LA BANDERA, CON EL NOMBRE ───────────────────────────
                        De dónde sos es identidad, y en la pantalla que cierra la
                        carrera no estaba en ningún lado: la única bandera era la
                        del renglón de la selección, que sólo aparece si te
                        convocaron. Va con `alt` y no vacío porque acá está SOLA
                        —ningún texto de la cabecera nombra el país
                        (CLAUDE.md §6)—. */}
                    {/* eslint-disable-next-line @next/next/no-img-element -- SVG local estático; next/image no aporta acá */}
                    <img
                        src={flagPathOf(player.countryCode)}
                        alt={pais?.nameEs ?? player.countryCode}
                        width={22}
                        height={16}
                        className={styles.finalFlag}
                    />
                    {player.name} {player.surname} se retiró a los {player.age} en{' '}
                    {clubLabel(player.clubId)}. {motivo}
                </p>

                {/* EL MATERIAL, RECIÉN ACÁ. El perfil y la longevidad se sortean
                    al nacer y viajan escondidos toda la partida. Sin este
                    renglón la tirada existe y el jugador no se entera: dos
                    carreras del mismo puesto terminan a edades distintas y
                    parece ruido en vez de la carta que le tocó. */}
                <p className={styles.finalMaterial}>
                    {profileRevealText(player.developmentProfile)}{' '}
                    {longevityRevealText(player.longevity)}
                </p>

                <div className={styles.statsRow}>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>{partidos}</span>
                        <span className={styles.statLabel}>Partidos</span>
                    </div>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>{planilla.tries}</span>
                        <span className={styles.statLabel}>Tries</span>
                    </div>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>{planilla.points}</span>
                        <span className={styles.statLabel}>Puntos</span>
                    </div>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>{planilla.tackles}</span>
                        <span className={styles.statLabel}>Tackles</span>
                    </div>
                    {/* El rótulo dice «Caps» porque es como se llama en rugby, y
                        el `title` dice qué son para el que recién llega: los
                        caps valen más que los títulos (CLAUDE.md §5) y no se
                        pueden explicar con una palabra más corta. */}
                    <div className={styles.stat} title="Partidos con la selección mayor">
                        <span className={styles.statValue}>{state.national.caps}</span>
                        <span className={styles.statLabel}>Caps</span>
                    </div>
                    <div className={styles.stat}>
                        <span
                            className={`${styles.statValue} ${styles.statInk} ${styles[statTierClass(mejorMedia)]}`}
                        >
                            {mejorMedia}
                        </span>
                        <span className={styles.statLabel}>Mejor media</span>
                    </div>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>{state.damage.hia}</span>
                        <span className={styles.statLabel}>Conmociones</span>
                    </div>
                </div>
            </div>

            <div className={styles.finalBody}>
                <section className={styles.trail}>
                    <span className={styles.eyebrow}>La trayectoria</span>

                    {trail.stints.map((stint) => (
                        <Paso key={stint.key} stint={stint} glory={family.glory} />
                    ))}

                    {/* EL SELECCIONADO A VA ANTES QUE LA MAYOR, porque está un
                        escalón abajo y la escalera se lee subiendo. Es su propia
                        camiseta y no una nota al pie de la otra: se pasan
                        temporadas ahí, se juegan partidos y se levanta una copa,
                        y hasta hoy nada de eso quedaba escrito en ningún lado.

                        Lo que este bloque NO hace es sumar sus partidos a los
                        caps. Ver `metaXv`. */}
                    {xv && (
                        <article className={`${styles.trailStint} ${styles.trailNational}`}>
                            <div className={styles.trailTop}>
                                {/* eslint-disable-next-line @next/next/no-img-element -- SVG local estático */}
                                <img
                                    src={flagPathOf(player.countryCode)}
                                    alt=""
                                    width={34}
                                    height={24}
                                    className={styles.trailFlag}
                                    loading="lazy"
                                />
                                <div className={styles.trailWho}>
                                    <span className={styles.trailClub}>{xv.label}</span>
                                    {metaXv && <span className={styles.trailMeta}>{metaXv}</span>}
                                </div>
                            </div>

                            <Vitrina titles={xv.titles} />
                        </article>
                    )}

                    {/* LA SELECCIÓN VA ÚLTIMA Y SEPARADA. No es un club más: los
                        caps valen más que los títulos (CLAUDE.md §5) y por eso
                        cierra la lista en vez de perderse entre las camisetas.
                        Acá también entran las copas internacionales, que no
                        tienen club con el que colgarse. */}
                    {huboSeleccion && (
                        <article className={`${styles.trailStint} ${styles.trailNational}`}>
                            <div className={styles.trailTop}>
                                {/* eslint-disable-next-line @next/next/no-img-element -- SVG local estático */}
                                <img
                                    src={flagPathOf(player.countryCode)}
                                    alt=""
                                    width={34}
                                    height={24}
                                    className={styles.trailFlag}
                                    loading="lazy"
                                />
                                <div className={styles.trailWho}>
                                    <span className={styles.trailClub}>{seleccion}</span>
                                    <span className={styles.trailMeta}>{metaNacional}</span>
                                </div>
                            </div>

                            <Vitrina titles={trail.national.titles} />
                        </article>
                    )}
                </section>
            </div>

            <div className={styles.finalActions}>
                {/* EL FORMATO SE ELIGE ANTES DE EXPORTAR, y se ve lo que se
                    elige: el rectángulo al lado del número es la proporción
                    dibujada, que dice más rápido que «9:16» dónde va a entrar
                    esa imagen. La palabra de abajo termina de decirlo. */}
                <div
                    className={styles.formats}
                    role="radiogroup"
                    aria-label="Formato de la imagen"
                >
                    {POSTER_FORMATS.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            role="radio"
                            aria-checked={formato === f.id}
                            className={`${styles.format} ${formato === f.id ? styles.formatOn : ''}`}
                            onClick={() => setFormato(f.id)}
                        >
                            <span
                                className={`${styles.formatShape} ${f.id === '9:16' ? styles.formatTall : styles.formatWide}`}
                                aria-hidden="true"
                            />
                            <span className={styles.formatRatio}>{f.label}</span>
                            <span className={styles.formatHint}>{f.hint}</span>
                        </button>
                    ))}
                </div>

                <button type="button" className={styles.primary} onClick={onRestart}>
                    Empezar otra carrera
                </button>
                <button
                    type="button"
                    className={styles.ghost}
                    onClick={exportar}
                    disabled={imagen === 'sin'}
                >
                    {imagen === 'sin' ? 'La imagen no se pudo armar' : 'Exportar la imagen'}
                </button>
                <p className={styles.finalAviso} aria-live="polite">{aviso}</p>
            </div>
        </div>
    );
}
