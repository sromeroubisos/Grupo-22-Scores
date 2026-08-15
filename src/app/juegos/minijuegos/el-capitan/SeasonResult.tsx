'use client';

import { useEffect, useRef, useState } from 'react';
import type { CaptainSeasonEntry } from '@/features/captain';
import { AWARD_LABELS, clubLabel, getFamily, money } from '@/features/captain';
import type { PositionFamilyId } from '@/features/captain';
import type { DecisionImpact } from './decisionImpact';
import ClubBadge from './ClubBadge';
import styles from './capitan.module.css';

/**
 * El resultado de la temporada.
 *
 * Es una TARJETA DE RESULTADO y no una decisión: el jugador no elige nada, así
 * que el botón dice "Continuar" (CLAUDE.md §3).
 *
 * ── Por qué manda un titular y no la grilla ──
 * Acá se forma el recuerdo del año, y hasta acá lo que había eran cuatro celdas
 * grises del mismo tamaño: ni una decía si el año había sido bueno. El juego
 * SABE la respuesta —tiene los títulos, los caps, el salto de media y cuánto
 * jugaste— y no la estaba usando. Ahora el titular la dice y los números pasan a
 * ser lo que siempre fueron: el respaldo.
 *
 * El titular es DERIVADO: sale de la fila ya cerrada y no se persiste, así que no
 * mueve el `stateHash` ni obliga a subir ninguna versión. Vive acá y no en el
 * motor por lo mismo que `costLabel` vive en `TrainingCard`: es la voz de la
 * pantalla, no una regla de la simulación.
 *
 * ── Las dos pasadas ──
 * El flujo muestra esta tarjeta DOS veces por temporada: al cerrar el año, y otra
 * vez después de la decisión, porque el desenlace se escribe sobre la misma fila.
 * Antes las dos eran idénticas —mismo rótulo, mismo título, misma grilla— y la
 * segunda se leía como si el juego se hubiera colgado. `kind` las separa: la
 * segunda no repite números que no cambiaron (el reducer sólo le agrega
 * `decisionText` a la fila), cuenta lo que dejó la decisión.
 *
 * ── El desenlace pesa lo que pesa la decisión ──
 * Y esa segunda pasada era, hasta acá, la tarjeta más chica del juego: un rótulo
 * fijo —«Lo que dejó la decisión»— y una línea de crónica en gris secundario. El
 * jugador leía «el referee levantó el brazo para tu lado y se acabó» y no se
 * enteraba nunca de que eso habían sido tres fechas de suspensión. Una decisión
 * que el §3.1 obliga a tomar viendo las probabilidades terminaba rindiendo
 * cuentas en letra chica.
 *
 * Ahora la pantalla contesta las tres preguntas del momento: QUÉ ELEGISTE (la
 * opción que apretaste, que entre la tarjeta y esta pantalla se perdía), QUÉ
 * PASÓ (el titular y la crónica, con la tinta primaria) y QUÉ TE DEJÓ (las
 * fichas de lo que se movió). Las tres salen de `decisionImpact.ts`, que
 * DIFERENCIA el estado de antes y el de después en vez de leer el efecto: así la
 * tarjeta no puede prometer un +3 de media que el techo del potencial recortó.
 *
 * ── El cierre del año se REVELA ──
 * El año entero aparecía de golpe: once datos servidos en un frame, que es la
 * forma más rápida de que ninguno se lea. Ahora el cierre dura poco más de cinco
 * segundos y las cosas caen de a una —el club, los números, lo que ganaron, la
 * nota— y recién al final el titular, que es el veredicto.
 *
 * El titular va ÚLTIMO aunque esté arriba de todo, y es a propósito: si "Salieron
 * campeones" entra primero, los números que vienen después ya no cuentan nada
 * que no se sepa. La tarjeta ocupa su alto final desde que se monta —todo está
 * en el DOM y lo único que se anima es la opacidad—, así que el titular puede
 * llegar al final sin mover una línea de lugar.
 *
 * Con `prefers-reduced-motion` el revelado no existe: se ve todo al instante y el
 * botón está vivo desde el primer frame. Y para el que ya vio catorce cierres
 * está "Mostrar todo", que corta el escalonado en seco. Ese botón NO lleva
 * `data-continue` a propósito: si lo llevara, el Enter de `CaptainFlow` saltearía
 * el cierre sin que el jugador supiera que había algo para ver.
 */
export type SeasonResultKind = 'year' | 'aftermath';

/** Lo que dura el cierre del año, de punta a punta, hasta que aparece Continuar. */
const REVEAL_MS = 5400;

/** El aire entre el último dato y el botón: el titular necesita respirar solo. */
const REVEAL_TAIL_MS = 700;

/** El desenlace de la decisión es corto y ya se esperó el cierre: escalón mínimo. */
const AFTERMATH_STEP_MS = 190;

/** La tarjeta que el jugador tenía delante y la opción que apretó. */
export interface ChosenOption {
    eventTitle: string;
    optionLabel: string;
}

export default function SeasonResult({
    entry,
    family,
    ovrDelta,
    kind,
    impact = null,
    chosen = null,
    onContinue,
    onRevealed,
}: {
    entry: CaptainSeasonEntry;
    family: PositionFamilyId;
    ovrDelta: number;
    kind: SeasonResultKind;
    /** Lo que la decisión movió de verdad. Sólo en `'aftermath'`. */
    impact?: DecisionImpact | null;
    chosen?: ChosenOption | null;
    onContinue: () => void;
    /**
     * EL AÑO TERMINÓ DE CONTARSE. Se avisa una sola vez, y da igual si el
     * revelado se cumplió solo o si el jugador apretó «Mostrar todo».
     *
     * Existe porque los avisos de lo que ganaste no pueden adelantar el titular:
     * el veredicto entra ÚLTIMO a propósito, y una copa anunciada en el segundo
     * uno deja sin sentido a los cinco que vienen después. Quién los muestra es
     * `CaptainFlow`; lo único que sabe esta pantalla es cuándo terminó de hablar.
     */
    onRevealed?: () => void;
}) {
    const glory = getFamily(family).glory;
    const unidad = glory.primary.unit === 'percent' ? '%' : '';

    /**
     * `timeUp` es el reloj del cierre; `skipped`, el jugador que no quiso
     * esperarlo. Son dos cosas distintas y por eso son dos estados: el reloj sólo
     * habilita el botón (las animaciones ya terminaron solas), mientras que
     * saltear tiene además que cortar en seco lo que todavía está entrando.
     *
     * El desenlace de la decisión arranca con el reloj cumplido: se escalona igual
     * —son tres líneas, no once— pero sin hacer esperar a nadie.
     */
    const [timeUp, setTimeUp] = useState(kind !== 'year');
    const [skipped, setSkipped] = useState(false);
    const open = timeUp || skipped;

    useEffect(() => {
        if (kind !== 'year') return;
        // El que pidió menos movimiento no pidió esperar más: con `reduce` el CSS
        // ya muestra todo de una, así que el botón tiene que estar vivo también.
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setTimeUp(true);
            return;
        }
        const id = setTimeout(() => setTimeUp(true), REVEAL_MS);
        return () => clearTimeout(id);
    }, [kind]);

    /* Se avisa UNA vez por tarjeta. La guarda es un `ref` y no una dependencia
       porque `open` puede volver a evaluarse en cualquier render y el aviso no es
       un estado: es un borde. La tarjeta se remonta por temporada (`key` en
       `CaptainFlow`), así que el `ref` arranca limpio en cada cierre. */
    const avisado = useRef(false);
    useEffect(() => {
        if (!open || avisado.current) return;
        avisado.current = true;
        onRevealed?.();
    }, [open, onRevealed]);

    if (kind === 'aftermath') {
        const chips = impact?.chips ?? [];
        // El titular sale del cambio REAL de estado (`decisionImpact`). Sin
        // impacto —una partida vieja, un desenlace sin nada que restar— vuelve
        // el rótulo de siempre, que no afirma nada que no pueda probar.
        const titular = impact?.headline ?? 'Lo que dejó la decisión';

        /* El reparto del escalonado, contado como en el cierre del año: cada
           cosa que puede o no estar suma un golpe, así que la cuenta no depende
           de qué trajo esta decisión. */
        let golpe = 0;
        const siguiente = () => paso(golpe++, AFTERMATH_STEP_MS);

        const pasoEyebrow = siguiente();
        const pasoTexto = entry.decisionText ? siguiente() : null;
        const pasoTitular = siguiente();
        const pasoRecap = chosen ? siguiente() : null;
        const pasoChips = chips.length > 0 ? siguiente() : null;

        return (
            <div className={`${styles.card} ${styles.aftermathCard}`}>
                <span className={`${styles.eyebrow} ${styles.reveal}`} style={pasoEyebrow}>
                    Temporada {entry.season} · {clubLabel(entry.clubId)}
                </span>

                {/* El titular entra DESPUÉS del relato aunque esté arriba, por lo
                    mismo que en el cierre del año: es el veredicto de lo que
                    acabás de leer. Cuando la decisión te movió de club va con el
                    escudo del club nuevo — un pase es la decisión más grande del
                    juego y se estaba anunciando con una línea de texto. */}
                <div className={`${styles.aftermathTop} ${styles.revealStamp}`} style={pasoTitular}>
                    <h2 className={`${styles.resultHeadline} ${styles.aftermathHeadline}`}>{titular}</h2>
                    {impact?.movedToClubId && (
                        <ClubBadge
                            clubId={impact.movedToClubId}
                            clubName={clubLabel(impact.movedToClubId)}
                            size={46}
                        />
                    )}
                </div>

                {/* La crónica del desenlace, con la tinta primaria y no la
                    secundaria: es el contenido de esta pantalla, no una nota al
                    pie. Era lo único que había y se leía como letra chica. */}
                {entry.decisionText && pasoTexto && (
                    <p className={`${styles.aftermathText} ${styles.reveal}`} style={pasoTexto}>
                        {entry.decisionText}
                    </p>
                )}

                {/* QUÉ ELEGISTE. Entre la tarjeta de decisión y esta pantalla no
                    quedaba rastro de la opción apretada: el desenlace llegaba sin
                    su causa, y con cuatro opciones parecidas el jugador no podía
                    atar una cosa con la otra. */}
                {chosen && pasoRecap && (
                    <p className={`${styles.decisionRecap} ${styles.reveal}`} style={pasoRecap}>
                        <span className={styles.decisionRecapKey}>Elegiste</span>
                        <span className={styles.decisionRecapOption}>{chosen.optionLabel}</span>
                        <span className={styles.decisionRecapEvent}>{chosen.eventTitle}</span>
                    </p>
                )}

                {/* LO QUE SE MOVIÓ. No es el efecto que la decisión pidió sino la
                    resta del estado: el techo del potencial, la puerta de la
                    plata y los topes ya se aplicaron, así que la ficha no puede
                    prometer algo que no pasó (el porqué, en `decisionImpact.ts`). */}
                {chips.length > 0 && pasoChips && (
                    <div className={`${styles.impact} ${styles.reveal}`} style={pasoChips}>
                        {chips.map((chip) => (
                            <div
                                key={chip.key}
                                className={`${styles.impactChip} ${chip.tone === 'up' ? styles.impactUp : styles.impactDown}`}
                            >
                                <span className={styles.impactIcon} aria-hidden="true">{chip.icon}</span>
                                <span className={styles.impactBody}>
                                    <span className={styles.impactLabel}>{chip.label}</span>
                                    <span className={styles.impactValue}>{chip.value}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {entry.titles.length > 0 && (
                    <p className={`${styles.note} ${styles.reveal}`} style={siguiente()}>
                        Ganaron {entry.titles.join(' y ')}.
                    </p>
                )}

                <div className={styles.cardCta}>
                    <button type="button" className={styles.primary} data-continue onClick={onContinue}>
                        Continuar
                    </button>
                </div>
            </div>
        );
    }

    /* Las celdas y las notas se arman como DATOS y no como JSX suelto colgado de
       un `&&`: el revelado necesita saber cuántas cosas hay para repartir los
       tiempos, y las ramas de un condicional en el árbol no se pueden contar. */
    const celdas: { label: string; value: string; tone?: 'up' | 'down' }[] = [
        { label: 'Partidos', value: String(entry.matchesPlayed) },
        { label: glory.primary.labelEs, value: `${entry.glory}${unidad}` },
    ];

    if (glory.secondary) {
        celdas.push({
            label: glory.secondary.labelEs,
            value: `${entry.glorySecondary}${glory.secondary.unit === 'percent' ? '%' : ''}`,
        });
    }

    celdas.push({
        label: 'Media',
        value: `${entry.ovr}${ovrDelta !== 0 ? ` (${ovrDelta > 0 ? '+' : ''}${ovrDelta})` : ''}`,
        tone: ovrDelta > 0 ? 'up' : ovrDelta < 0 ? 'down' : undefined,
    });

    /* El puntaje del año, que es la única celda RELATIVA de la grilla: no dice
       cuánto produjiste sino cuánto produjiste contra lo que se esperaba de vos.
       Por eso un 8,2 en la Tercera vale lo mismo que un 8,2 en el Top 14, y por
       eso se muestra con una sola decimal y no con dos — es una nota, no una
       medición. */
    celdas.push({
        label: 'Puntaje',
        value: entry.rating.toFixed(1),
        tone: entry.rating >= 7.3 ? 'up' : entry.rating <= 5.8 ? 'down' : undefined,
    });

    if (entry.caps > 0) celdas.push({ label: 'Caps', value: `+${entry.caps}`, tone: 'up' });

    // EL SUELDO DEL AÑO. Va acá y no solo en la billetera porque es donde la
    // plata SE ACUMULA: la billetera dice cuánto tenés, esto dice qué entró este
    // año, y sin la segunda el saldo crece sin que nada lo cuente. Solo aparece
    // si entró algo — en amateur no entra nada y un «US$ 0» todas las temporadas
    // sería ruido que además no es cierto: no es que ganaste cero, es que en el
    // rugby de club no se cobra.
    if (entry.income > 0) celdas.push({ label: 'Sueldo', value: money(entry.income), tone: 'up' });

    // Dónde terminó el club. Sólo cuando la tabla se pudo resolver: un "0º de 0"
    // no informa, confunde.
    if (entry.leaguePosition > 0) {
        celdas.push({ label: 'El club', value: `${entry.leaguePosition}º de ${entry.leagueTeams}` });
    }

    const notas: string[] = [];
    // El título ya está contado por el titular cuando fue LA noticia del año; acá
    // queda por si el titular lo pisó algo más grande.
    if (entry.titles.length > 0) notas.push(`Ganaron ${entry.titles.join(' y ')}.`);
    // Los premios individuales van en su propia línea y no adentro de la grilla:
    // no son un número del año, son un renglón de la vitrina.
    if (entry.awards.length > 0) notas.push(`${entry.awards.map((id) => AWARD_LABELS[id]).join(' · ')}.`);
    if (entry.note) notas.push(entry.note);

    /* El reparto de los tiempos es elástico y no un escalón fijo: un año con once
       datos y uno con seis tienen que durar lo mismo, o el año flojo se cierra en
       dos segundos y el bueno se hace eterno. Se fija el final —el último dato cae
       siempre a la misma altura— y el escalón sale de cuántas cosas hay. */
    const golpes = 2 + celdas.length + notas.length;
    const escalon = (REVEAL_MS - REVEAL_TAIL_MS) / (golpes - 1);
    const titularEn = golpes - 1;

    return (
        <div className={`${styles.card} ${styles.resultCard} ${skipped ? styles.revealDone : ''}`}>
            {/* La barra dice que la espera es finita. Sin ella, cinco segundos de
                cosas apareciendo se leen igual que una pantalla trabada. */}
            {!open && (
                <span className={styles.revealTrack} aria-hidden="true">
                    <span
                        className={styles.revealTrackFill}
                        style={{ animationDuration: `${REVEAL_MS}ms` }}
                    />
                </span>
            )}

            <span className={`${styles.eyebrow} ${styles.reveal}`} style={paso(0, escalon)}>
                Temporada {entry.season} · {clubLabel(entry.clubId)}
            </span>

            {/* Último en entrar aunque sea lo primero que se lee: es el veredicto,
                y un veredicto adelantado deja sin sentido a los números que lo
                justifican. Entra con su propia animación —un sello, no un
                desvanecido— para que se note que llegó. */}
            <h2
                className={`${styles.resultHeadline} ${styles.revealStamp}`}
                style={paso(titularEn, escalon)}
            >
                {headline(entry, ovrDelta)}
            </h2>

            {/* Los números, ahora como respaldo del titular y no como la noticia.
                La grilla se mantiene —y no una línea de texto corrida— porque la
                métrica-gloria cambia con el puesto y su rótulo tiene que viajar
                con ella: "79%" sin "porcentaje al palo" no dice nada. */}
            <div className={styles.grid}>
                {celdas.map((celda, i) => (
                    <div
                        key={celda.label}
                        className={`${styles.cell} ${styles.reveal}`}
                        style={paso(1 + i, escalon)}
                    >
                        <span className={styles.cellLabel}>{celda.label}</span>
                        <span
                            className={`${styles.cellValue} ${celda.tone === 'up' ? styles.cellUp : celda.tone === 'down' ? styles.cellDown : ''}`}
                        >
                            {celda.value}
                        </span>
                    </div>
                ))}
            </div>

            {notas.map((texto, i) => (
                <p
                    key={i}
                    className={`${styles.note} ${styles.reveal}`}
                    style={paso(1 + celdas.length + i, escalon)}
                >
                    {texto}
                </p>
            ))}

            <div className={styles.cardCta}>
                {open ? (
                    <button type="button" className={styles.primary} data-continue onClick={onContinue}>
                        Continuar
                    </button>
                ) : (
                    /* Lleva `primary` ADEMÁS de `revealSkip`: la caja es la misma
                       —si no, el pie de la tarjeta cambia de alto justo cuando el
                       jugador está mirando— y lo único que cambia es el peso. El
                       porqué de las dos clases juntas, en el CSS. */
                    <button
                        type="button"
                        className={`${styles.primary} ${styles.revealSkip}`}
                        onClick={() => setSkipped(true)}
                    >
                        Mostrar todo
                    </button>
                )}
            </div>
        </div>
    );
}

/** El retraso de un golpe del revelado, listo para el `style` del elemento. */
function paso(indice: number, escalon: number) {
    return { animationDelay: `${Math.round(indice * escalon)}ms` };
}

/**
 * El titular del año, en una línea.
 *
 * El orden es de jerarquía deportiva y sigue al §5 del CLAUDE.md raíz —los caps
 * valen más que los títulos— con la media y los minutos abajo, que son la
 * historia del que todavía no llegó.
 *
 * Es una cadena de `if` deliberadamente aburrida y sin azar: la misma fila tiene
 * que dar el mismo titular siempre, o el resultado cambiaría al recargar la
 * pantalla sin que la carrera se haya movido.
 *
 * No dice nada que no pueda probar. Cómo le fue al club en cada competición y
 * cómo salió el clásico no están acá porque el motor todavía no los tiene: un
 * club de El Capitán juega UNA competición y de ella sólo se sabe quién salió
 * campeón. Inventarlo sería exactamente lo que el PRODUCT.md prohíbe.
 */
function headline(entry: CaptainSeasonEntry, ovrDelta: number): string {
    // Arriba de todo, los premios individuales: es lo más raro que le puede
    // pasar a una temporada. Se nombran por jerarquía y no por orden de la
    // lista, porque ser el mejor del mundo y entrar al XV ideal no son lo mismo
    // aunque caigan el mismo año.
    if (entry.awards.includes('mejor-del-mundo')) return 'El mejor jugador del mundo';
    if (entry.awards.includes('xv-ideal')) return 'Entraste en el XV ideal del año';

    // Los caps antes que la vitrina, y el titular NO repite la nota: el motor ya
    // escribe "Debutaste con la mayor." abajo. Acá se nombra el año; ahí se
    // cuenta el hecho.
    if (entry.caps > 0) return 'El año de la camiseta';

    // El ascenso antes que el título de liga: cuando pasan juntos, la noticia es
    // la división nueva. El descenso va más abajo — si además fuiste campeón de
    // otra cosa, esa es la noticia.
    if (entry.divisionMove === 'promotion') return 'El año del ascenso';

    // Sin el nombre del torneo adentro de la frase: los títulos son etiquetas de
    // liga —"Primera A de la URBA", "Top 14 de la URBA"— y "Campeones del
    // Primera A" no concuerda. El torneo lo nombra la línea de abajo.
    if (entry.titles.length > 0) return 'Salieron campeones';

    if (entry.awards.includes('mejor-local')) return 'El mejor de la temporada';
    if (entry.divisionMove === 'relegation') return 'El año que el club se fue abajo';

    if (ovrDelta >= 3) return 'El año que pegaste el salto';
    if (ovrDelta <= -2) return 'El año que el cuerpo pasó factura';

    // `share` es cuánto de la temporada del club jugaste, de 0 a 1.
    if (entry.share <= 0.35) return 'Un año mirando desde afuera';
    if (entry.share >= 0.8) return 'Jugaste todos los partidos';

    return `Un año más en ${clubLabel(entry.clubId)}`;
}
