'use client';

import type { CaptainEvent, EventRarity, SquadRole } from '@/features/captain';
import { clubLabel, flagPathOf, money, rarityOf, unionName } from '@/features/captain';
import ClubBadge from './ClubBadge';
import styles from './capitan.module.css';

/**
 * CÓMO SE NOMBRA TU LUGAR EN EL PLANTEL.
 *
 * Vocabulario de rugby y no de tabla: `reserva` es Intermedia —el segundo equipo
 * del club, que en Argentina tiene su propio torneo— y no «cuarto suplente». El
 * jugador que lee «Intermedia» sabe exactamente qué año le espera.
 *
 * El rótulo NO dice la cuenta que hay detrás (el share de `playingTimeOf`): dice
 * el lugar. Poner el porcentaje al lado invitaría a compararlo con el de la
 * temporada jugada, que se mide con las ausencias adentro y siempre va a dar
 * más bajo.
 */
const ROLE_LABEL: Record<SquadRole, string> = {
    titular: 'Titular',
    rotacion: 'Rotación',
    banco: 'Suplente',
    reserva: 'Intermedia',
};

/**
 * CÓMO SE ANUNCIA CADA BANDA.
 *
 * `normal` conserva el «Pasan cosas» de siempre y por eso no está acá: es la
 * ausencia de sello, no un sello más. Las otras tres dicen CADA CUÁNTO pasa una
 * cosa así, que es lo único que el jugador necesita saber antes de elegir — el
 * qué ya lo dice la tarjeta.
 *
 * Las frases hacen el trabajo; el color refuerza. Un sello que solo se
 * distinguiera por el tono sería invisible para quien no separa el violeta del
 * dorado, y encima es la tarjeta donde más caro sale no entender.
 */
const SEAL_LABEL: Record<Exclude<EventRarity, 'normal'>, string> = {
    especial: 'No pasa seguido',
    raro: 'Una vez en la carrera',
    oro: 'Es ahora',
};

/**
 * La tarjeta de decisión.
 *
 * Cada opción lista sus desenlaces con su porcentaje. Elegir a ciegas entre dos
 * frases no es decidir (CLAUDE.md §3.1), y el `hint` dice el costo y no solo el
 * beneficio.
 *
 * Cuando la opción habla de un club —mercado, volver a casa— va con su ESCUDO.
 * Un pase es la decisión más grande del juego y se estaba tomando contra un
 * código de tres letras: el escudo es lo que hace que el jugador sepa adónde se
 * va antes de apretar.
 *
 * Y cuando la tarjeta es de una banda alta lleva su SELLO, por el mismo motivo
 * que el escudo: una oportunidad que se ve una vez cada cuatro carreras tiene
 * que anunciarse antes de la decisión y no después, o el jugador se entera de
 * que era la grande cuando ya eligió.
 *
 * ── LA PLATA SE DIBUJA, NO SE CUENTA ────────────────────────────────────────
 * El sueldo iba adentro del `hint`, en gris y a 0,83 rem, entre dos frases: o
 * sea que la magnitud que separa un contrato de Super Rugby Américas de uno del
 * Top 14 —dieciséis mil dólares contra ochocientos mil— tenía exactamente el
 * mismo peso visual que «el pase es un trámite».
 *
 * Ahora es una FILA PROPIA con la cifra grande y tabular, y de ahí sale la
 * comparación: cuatro ofertas apiladas se leen en la columna de los números
 * antes que en la de los nombres, que es como se lee un mercado de verdad.
 */
export default function EventCard({
    event,
    onChoose,
}: {
    event: CaptainEvent;
    onChoose: (optionId: string) => void;
}) {
    const rarity = rarityOf(event);

    return (
        <div className={styles.card}>
            {rarity === 'normal' ? (
                <span className={styles.eyebrow}>Pasan cosas</span>
            ) : (
                <span className={styles.seal} data-rarity={rarity}>{SEAL_LABEL[rarity]}</span>
            )}
            <h2 className={styles.cardTitle}>{event.title}</h2>

            {/* ── LA BANDERA DE QUIEN TE LLAMA ────────────────────────────────
                Cambiar de camiseta es la única decisión que el juego declara
                irreversible, y hasta ahora se tomaba contra «una unión europea»:
                el jugador no sabía a qué himno se pasaba. La bandera va ARRIBA
                del texto y con el nombre al lado, que es como se anuncia una
                convocatoria — primero de quién, después qué te ofrecen.

                `alt` vacío: la unión ya está nombrada en el texto de al lado, así
                que repetirla sería leerla dos veces (CLAUDE.md §6). */}
            {event.unionCode && (
                <p className={styles.cardUnion}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- SVG local estático; next/image no aporta acá */}
                    <img
                        src={flagPathOf(event.unionCode)}
                        alt=""
                        width={22}
                        height={16}
                        className={styles.flag}
                    />
                    {unionName(event.unionCode)}
                </p>
            )}

            <p className={styles.cardText}>{event.text}</p>

            <div className={styles.options}>
                {event.options.map((option, i) => (
                    <button
                        key={option.id}
                        type="button"
                        className={styles.option}
                        data-choice={i + 1}
                        onClick={() => onChoose(option.id)}
                    >
                        <span className={styles.optionKey} aria-hidden="true">{i + 1}</span>
                        <span className={styles.optionLabel}>
                            {option.clubId && (
                                <ClubBadge clubId={option.clubId} clubName={clubLabel(option.clubId)} size={22} />
                            )}
                            {option.label}
                        </span>
                        {/* La cifra manda sobre el hint y por eso va antes: el
                            jugador compara sueldos y después lee la letra chica.
                            `US$` va aparte y chico para que el número quede
                            entero a la vista. */}
                        {option.salary !== undefined && option.salary > 0 && (
                            <span className={styles.optionMoney}>
                                <span className={styles.optionMoneyValue}>{money(option.salary)}</span>
                                {/* EL PLAZO VA PEGADO AL SUELDO Y NO EN OTRA FICHA:
                                    un sueldo anual sin plazo es medio número —
                                    380.000 por un año y 380.000 por tres son dos
                                    ofertas distintas— así que se leen juntos o no
                                    se leen. Sin plazo (mercado amateur) el
                                    renglón queda como estaba. */}
                                <span className={styles.optionMoneyUnit}>
                                    {option.contractYears && option.contractYears > 0
                                        ? `por año · ${option.contractYears} ${option.contractYears === 1 ? 'año' : 'años'}`
                                        : 'por año'}
                                </span>
                            </span>
                        )}
                        {/* LA SEGUNDA COLUMNA DE LA DECISIÓN.
                            Con cinco ofertas apiladas, el sueldo solo empuja
                            siempre al club más grande — que es justo donde no vas
                            a jugar. La ficha del lugar es lo que convierte la
                            mesa en una elección: se lee a la misma altura que la
                            cifra y con el mismo golpe de vista.

                            `data-role` y no un color por clase: el rojo del
                            banco y el verde del titular refuerzan, pero el que no
                            los separa lee la palabra, que dice lo mismo entera. */}
                        {option.squadRole && (
                            <span className={styles.optionRole} data-role={option.squadRole}>
                                <span className={styles.optionRoleKey}>Tu lugar ahí</span>
                                <span className={styles.optionRoleValue}>{ROLE_LABEL[option.squadRole]}</span>
                            </span>
                        )}
                        {/* LA TERCERA COLUMNA DE LA MESA: quién te mira.

                            Va pegada al lugar en el plantel porque son la misma
                            pregunta partida en dos —dónde jugás y quién te ve
                            jugar— y porque la respuesta a las dos suele ir en
                            direcciones opuestas: el club que te sienta es el que
                            te muestra, y el que te da la camiseta es el que te
                            esconde. Con las tres a la vista —cuánto, dónde,
                            quién te ve— la decisión deja de tener una respuesta
                            obvia, que es todo lo que le pedimos a una decisión.

                            El texto sale de `selectionVisibility`, la misma
                            función que la convocatoria va a correr el año que
                            viene, así que no puede prometer una cosa y hacer
                            otra. */}
                        {option.scouting && (
                            <span className={styles.optionScouting} data-tone={option.scouting.tone}>
                                <span className={styles.optionRoleKey}>Los seleccionadores</span>
                                <span className={styles.optionScoutingValue}>{option.scouting.label}</span>
                            </span>
                        )}
                        <span className={styles.optionHint}>{option.hint}</span>
                        {/* Con un solo desenlace no hay nada que mostrar: pasa
                            lo que dice y punto. */}
                        {option.outcomes.length > 1 && (
                            <span className={styles.odds}>
                                {option.outcomes.map((outcome, i) => (
                                    <span key={i} className={styles.odd}>{outcome.weight}%</span>
                                ))}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
