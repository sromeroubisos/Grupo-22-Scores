'use client';

import { useEffect, useRef, useState } from 'react';
import type { EventOption, GameEvent, Position } from '@/features/career';
import {
    axisLabel, chipValueIn, countryNameIn, DIRECTION_LABELS, DIRECTION_LABELS_EN, eventCategoryIn,
    getClub, optionPreview, unionName,
} from '@/features/career';
import { useLocale } from './LocaleContext';
import ClubBadge from './ClubBadge';
import Flag from './Flag';
import { prefersReducedMotion } from './useCountUp';
import styles from './carrera.module.css';

interface Props {
    event: GameEvent;
    /** Puesto del jugador: la valoración de un efecto depende de él. */
    position: Position;
    /**
     * Media del jugador. Inclina los PORCENTAJES: mientras más alta, más chances de
     * que una apuesta salga bien (`outcomeWeights`). Sin esto la tarjeta mostraría
     * la probabilidad del jugador promedio y el sorteo usaría otra.
     */
    ovr: number;
    onChoose: (optionId: string) => void;
}

/**
 * EL LATIDO ENTRE ELEGIR Y QUE PASE.
 *
 * Antes el click resolvía la temporada en el mismo frame: la tarjeta que el
 * jugador estaba leyendo desaparecía y aparecía otra con números. Nunca llegaba
 * a ver QUÉ eligió, así que la decisión se sentía como un botón de "siguiente".
 *
 * Ahora la opción elegida se marca, las otras se apagan, y recién después corre
 * la temporada. No es una demora artificial para que parezca que el juego
 * piensa: es acuse de recibo, que es de las pocas cosas que una animación tiene
 * que hacer siempre — confirmar que la interfaz escuchó.
 *
 * 420 ms es el total: 160 de la marca y 260 de la tarjeta yéndose. Con
 * movimiento reducido baja a 120, lo justo para que la marca se vea; la
 * información llega igual sin movimiento, pero el acuse de recibo no se saltea.
 */
const CHOICE_BEAT_MS = 420;
const CHOICE_BEAT_REDUCED_MS = 120;

// Una sola situación por pantalla. Nunca se muestran números internos ni
// modificaciones de atributos: la consecuencia se descubre en el revelado.
// Las opciones son tarjetas: en desktop van en 2 columnas cuando hay 2.
export default function EventCard({ event, position, ovr, onChoose }: Props) {
    const { locale, t } = useLocale();
    /** Opción ya elegida, mientras corre el latido. `null` = todavía decide. */
    const [chosen, setChosen] = useState<string | null>(null);
    const timer = useRef<number>(0);

    // Red de seguridad. La limpieza REAL la hace la `key` por decisión que pone
    // `CareerFlow`: acá no alcanza con mirar `event.id` porque dos mercados
    // seguidos comparten id, y esta tarjeta no tiene forma de saber que la
    // temporada avanzó. Lo único que se garantiza acá es no dejar un timer vivo
    // si el componente se va antes de que corra.
    useEffect(() => () => window.clearTimeout(timer.current), []);

    function choose(optionId: string) {
        if (chosen !== null) return; // un segundo click no elige dos veces
        setChosen(optionId);
        const beat = prefersReducedMotion() ? CHOICE_BEAT_REDUCED_MS : CHOICE_BEAT_MS;
        timer.current = window.setTimeout(() => onChoose(optionId), beat);
    }

    // Si hay UNA sola opción el jugador no elige nada, así que no es una
    // decisión: es un homenaje, y va como tarjeta de resultado. Se resuelve en la
    // presentación y no tocando los eventos a propósito — el `resultText` de esos
    // cuatro entra en `decisionLog[].text` y por lo tanto en el `stateHash` del
    // digest congelado. Cambiar el dato para arreglar la UI habría movido la
    // línea de base del motor sin que cambiara ni una simulación.
    if (event.options.length === 1) {
        const only = event.options[0];
        return (
            <section className={`${styles.event} ${chosen ? styles.eventLeaving : ''}`}>
                <p className={styles.eventCategory}>{eventCategoryIn(event.category, locale)}</p>
                <h2 className={styles.eventTitle}>{event.title}</h2>
                <p className={styles.eventText}>{event.text}</p>
                <button type="button" className={styles.continueBtn} onClick={() => choose(only.id)} disabled={chosen !== null}>
                    {t.continueLabel}
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </button>
            </section>
        );
    }

    const two = event.options.length === 2;

    // EL MERCADO SE DIBUJA DISTINTO EN EL TELÉFONO. Cuando todas las opciones
    // son clubes, la elección se hace mirando escudo, nombre y división: son
    // tres fichas que se comparan de un vistazo y entran en fila, que es lo que
    // deja la decisión en el cuarto de abajo de la pantalla.
    //
    // Las demás decisiones NO: ahí la opción es una frase y su `hint` dice qué
    // resignás, que es la regla del juego. Esas se apilan aunque ocupen más.
    //
    // "La mayoría" y no "todas": al mercado se le cuelga la opción de retirarse
    // (`withRetirementOption`), que no tiene escudo. Pedir que TODAS fueran
    // clubes hacía que la fila no se activara nunca a partir de los 34 años,
    // que es justo cuando el mercado más importa. Esa opción va abajo, en su
    // propio renglón: no es un club más, es dejar de jugar.
    const conEscudo = (o: (typeof event.options)[number]) => Boolean(o.offer || o.crestClubId);
    const esMercado = event.options.filter(conEscudo).length >= 2;

    return (
        <section className={`${styles.event} ${chosen ? styles.eventLeaving : ''}`}>
            <p className={styles.eventCategory}>{eventCategoryIn(event.category, locale)}</p>
            <h2 className={styles.eventTitle}>{event.title}</h2>
            <p className={styles.eventText}>{event.text}</p>
            <div className={`${styles.options} ${two ? styles.optionsTwo : ''} ${esMercado ? styles.optionsMarket : ''}`}>
                {event.options.map((opt, i) => (
                    <button
                        key={opt.id}
                        type="button"
                        className={[
                            styles.optionBtn,
                            conEscudo(opt) ? styles.optionCrest : styles.optionPlain,
                            chosen === opt.id ? styles.optionChosen : '',
                            chosen !== null && chosen !== opt.id ? styles.optionDimmed : '',
                        ].filter(Boolean).join(' ')}
                        title={[opt.label, opt.hint, opt.offer?.reason].filter(Boolean).join(' — ')}
                        // Escalonadas de a 60 ms: las opciones entran una detrás
                        // de otra, que es como se leen.
                        style={{ animationDelay: `${i * 60}ms` }}
                        onClick={() => choose(opt.id)}
                        disabled={chosen !== null}
                        aria-pressed={chosen === opt.id}
                    >
                        {/* El rótulo de la ficha: dice qué HACÉS con ese club, y
                            deja el nombre libre para ser sólo el nombre. Va
                            antes del escudo en el DOM para que el orden de
                            lectura sea el mismo que el visual. */}
                        {conEscudo(opt) && (
                            <span className={styles.optionKicker} aria-hidden="true">
                                {opt.offer ? t.signFor : t.stayAt}
                            </span>
                        )}
                        {/* El nombre corto, para la ficha del teléfono: en
                            110 px de ancho "Acordar tu incorporación a Vienne"
                            no se lee, y el club es lo que se compara. El label
                            completo sigue en el DOM —oculto a la vista, no
                            borrado— así que el botón conserva su nombre
                            accesible y su `title`. */}
                        {conEscudo(opt) && (
                            <span className={styles.optionClubShort} aria-hidden="true">
                                {opt.offer ? opt.offer.clubName : getClub(opt.crestClubId!).labelEs}
                            </span>
                        )}
                        {/* Mismo tamaño que el de las ofertas: si el de quedarse
                            fuera más chico, la jerarquía volvería por la ventana. */}
                        {/* La bandera va con el NOMBRE de la unión al lado: una
                            bandera sola obliga a reconocerla, y la decisión es
                            entre dos países, no entre dos dibujos. Por eso la
                            bandera queda decorativa —el nombre ya la dice— y el
                            lector de pantalla no la repite. */}
                        {opt.flagCountryCode && (
                            <span className={styles.optionUnion}>
                                <Flag code={opt.flagCountryCode} size={40} decorative />
                                <span className={styles.optionUnionName}>
                                    {countryNameIn(opt.flagCountryCode, unionName(opt.flagCountryCode), locale)}
                                </span>
                            </span>
                        )}
                        {opt.offer
                            ? <ClubBadge clubId={opt.offer.clubId} clubName={opt.offer.clubName} size={40} />
                            : opt.crestClubId
                                ? <ClubBadge clubId={opt.crestClubId} clubName={getClub(opt.crestClubId).labelEs} size={40} />
                                : null}
                        <span className={styles.optionBody}>
                            <span className={styles.optionLabel}>{opt.label}</span>
                            {opt.hint && <span className={styles.optionHint}>{opt.hint}</span>}
                            {/* LAS POSIBILIDADES, menos en el mercado. Una ficha
                                de club ya se compara por escudo, división y
                                dirección del pase; agregarle "100% · cambio de
                                club" es repetir con símbolos lo que la tarjeta
                                dice con palabras. */}
                            {!esMercado && <Odds option={opt} position={position} ovr={ovr} />}
                            {opt.offer && (
                                <>
                                    <span className={styles.offerMeta}>
                                        <span className={styles.offerLeague}>{opt.offer.league}</span>
                                        <span className={`${styles.offerDir} ${styles[`dir_${opt.offer.direction}`]}`}>
                                            {(locale === 'en' ? DIRECTION_LABELS_EN : DIRECTION_LABELS)[opt.offer.direction]}
                                        </span>
                                    </span>
                                    {opt.offer.reason && (
                                        <span className={styles.offerReason}>{opt.offer.reason}</span>
                                    )}
                                </>
                            )}
                        </span>
                        <svg className={styles.optionChevron} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                    </button>
                ))}
            </div>
        </section>
    );
}

/**
 * LAS POSIBILIDADES DE UNA OPCIÓN.
 *
 * Acá regía la regla contraria —"nunca números ni probabilidades"— y se cambió a
 * propósito: elegir entre dos frases sin saber qué arriesgás no es decidir, es
 * apostar a ciegas. Mostrar 70/30 no le saca tensión, se la da, porque recién ahí
 * el jugador puede elegir cuánto riesgo quiere correr.
 *
 * Lo que se muestra son los CINCO EJES del deporte (valoración, minutos, lesión,
 * sanción, reputación), no atributos: nadie decide por dos puntos de resistencia.
 */
function Odds({ option, position, ovr }: { option: EventOption; position: Position; ovr: number }) {
    const { locale, t } = useLocale();
    const previews = optionPreview(option, position, Infinity, ovr);
    // Una sola posibilidad sin nada que mover no tiene nada que contar.
    if (previews.length === 1 && previews[0].chips.length === 0) return null;

    return (
        <span className={styles.odds}>
            {previews.map((preview, i) => (
                <span key={i} className={styles.odd}>
                    {/* Con un solo desenlace el porcentaje sería un 100% en cada
                        renglón: ruido con forma de dato. */}
                    {previews.length > 1 && <span className={styles.oddChance}>{preview.chance}%</span>}
                    {preview.chips.length === 0
                        ? <span className={styles.oddNothing}>{t.noChanges}</span>
                        : preview.chips.map((chip) => (
                            <span
                                key={`${chip.axis}-${chip.value}`}
                                className={`${styles.oddChip} ${styles[`chip_${chip.tone}`]}`}
                            >
                                <span aria-hidden="true">{chip.icon}</span>
                                {/* El ícono es decorativo: el lector de pantalla
                                    escucha el nombre del eje, no "estrella". */}
                                <span className={styles.srOnly}>{axisLabel(chip.axis, chip.label, locale)}: </span>
                                {chipValueIn(chip.detail, chip.value, locale)}
                            </span>
                        ))}
                </span>
            ))}
        </span>
    );
}
