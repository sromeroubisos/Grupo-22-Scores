'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CareerState, PaceModeId, Position } from '@/features/career';
import {
    computeOvr, createInitialCareer, decisionTextIn, effectChips, getClub, getPendingEvent,
    getPosition, localizeEvent, optionPreview, positionLabel, SEASONS_PER_DECISION, toneOf,
    visibleChips,
} from '@/features/career';
import { useLocale } from './LocaleContext';
import LanguageToggle from './LanguageToggle';
import ClubBadge from './ClubBadge';
import AwardIcon from './AwardIcon';
import styles from './carrera.module.css';
import CreatePlayer from './CreatePlayer';
import PlayerHeader from './PlayerHeader';
import EventCard from './EventCard';
import SeasonResultInline from './SeasonResultInline';
import CareerSpine from './CareerSpine';
import CelebrationLayer, { type Celebration } from './Celebration';
import SeasonPulse, { type SeasonPulseData } from './SeasonPulse';
import OutcomeRoll, { type OutcomeRollData } from './OutcomeRoll';
import { celebrationsFor, orderCelebrations, type CelebrationSpec } from './celebrations';
import Flag from './Flag';
import RetirementSummary from './RetirementSummary';
import { advanceCareerToNextDecision } from './advanceCareer';
import { saveCareer, loadCareer, clearCareer } from './careerStorage';

/**
 * `loading` existe para que la portada NUNCA muestre "Comenzar carrera" mientras
 * todavía no se sabe si hay una partida guardada. Es la peor versión posible del
 * bug: el juego hace lo correcto (la carrera está en disco y se retoma entera) y
 * mientras tanto el único botón visible propone tirarla.
 */
type Step = 'loading' | 'intro' | 'create' | 'career';

/**
 * La portada de Juegos entra con `?nuevo=1` para saltear la intro: sin partida
 * que retomar, esa pantalla es un paso de más con un único botón.
 *
 * Se lee de `window.location` y no con `useSearchParams` a propósito: el hook
 * saca la página del renderizado estático si no se la envuelve en un Suspense, y
 * acá el dato solo hace falta en el cliente, dentro del efecto que ya lee el
 * disco.
 */
function wantsFreshStart() {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('nuevo') === '1';
}

export default function CareerFlow() {
    const { locale, t } = useLocale();
    const [step, setStep] = useState<Step>('loading');
    /** Partida encontrada en disco, a la espera de que el jugador la retome. */
    const [saved, setSaved] = useState<CareerState | null>(null);
    const [confirmingReset, setConfirmingReset] = useState(false);
    const [countryCode, setCountryCode] = useState<string | null>(null);
    const [position, setPosition] = useState<Position | null>(null);

    // Viene elegido: 'intense' es la carrera completa, la de siempre.
    const [paceMode, setPaceMode] = useState<PaceModeId>('intense');
    const [surname, setSurname] = useState('');
    // null = todavía no eligió: el motor pone el canónico del puesto.
    const [number, setNumber] = useState<number | null>(null);
    const [career, setCareer] = useState<CareerState | null>(null);
    const [lastSeason, setLastSeason] = useState<number | null>(null);
    /**
     * Primera temporada del ÚLTIMO tramo jugado. Con ritmo Intensa es siempre la
     * última y el resultado se ve igual que siempre; con Normal o Exprés marca
     * dónde empieza el bloque de temporadas que pasaron de una sola vez, para
     * que ninguna quede sin contar.
     */
    const [blockFrom, setBlockFrom] = useState<number | null>(null);
    const [outdatedNotice, setOutdatedNotice] = useState(false);
    /** Cola de festejos a pantalla completa del último tramo jugado. */
    const [celebrations, setCelebrations] = useState<CelebrationSpec[]>([]);
    /**
     * Pulso de la temporada: el OVR que cambió y, si hubo pase, los dos escudos.
     * Va ANTES que los festejos y antes que el resultado — es el puente entre
     * "elegí" y "esto es lo que pasó".
     */
    const [pulse, setPulse] = useState<SeasonPulseData | null>(null);
    /**
     * Revelado de la decisión: qué salió del dado y qué movió. Va ANTES del
     * pulso —y por lo tanto antes de los festejos y del resultado— porque es la
     * consecuencia de lo que el jugador acaba de elegir, y el orden en que se
     * cuentan las cosas es el orden en que pasaron.
     */
    const [roll, setRoll] = useState<OutcomeRollData | null>(null);

    // Restaura una carrera en curso ante una recarga. Solo LEE el estado: no
    // avanza nada, así que no se consume RNG y la decisión pendiente vuelve tal cual.
    useEffect(() => {
        const result = loadCareer();
        if (result.kind === 'ok') {
            // NO se entra solo a la carrera: la portada ofrece retomarla. Así
            // "Empezar de nuevo" tiene dónde vivir sin esconderse detrás del
            // retiro, y el jugador ve qué partida está por continuar.
            setSaved(result.state);
            // Una partida guardada le gana al `?nuevo=1`: la intro es el único
            // lugar donde vive "Continuar carrera", y saltearla dejaría al
            // jugador con un formulario que está por pisarle la carrera.
            setStep('intro');
            return;
        }
        if (result.kind === 'outdated') {
            setOutdatedNotice(true);
        }
        setStep(wantsFreshStart() ? 'create' : 'intro');
    }, []);

    /** Retoma la partida guardada tal cual quedó: no avanza nada ni toca el RNG. */
    function continueCareer() {
        if (!saved) return;
        setCareer(saved);
        const last = saved.seasons.length > 0 ? saved.seasons.length - 1 : null;
        setLastSeason(last);
        // Al retomar se muestra la última temporada sola: el tramo con el que se
        // llegó hasta acá ya se leyó antes de cerrar, y reconstruirlo sería
        // adivinar (el estado guarda el ritmo, no dónde empezó el último bloque).
        setBlockFrom(last);
        setStep('career');
    }

    /** Destruye la partida guardada. Va detrás de una confirmación explícita. */
    function discardSaved() {
        clearCareer();
        setSaved(null);
        setConfirmingReset(false);
        setStep('create');
    }

    function startCareer() {
        if (countryCode === null || position === null) return;
        const seed = Math.floor(Math.random() * 0x7fffffff);
        // Sin `startRoute`: la rama la sortea el motor desde la semilla. Pasarla
        // desde acá sería volver a convertirla en una elección.
        const state = createInitialCareer(
            {
                position,
                nationalityCountryCode: countryCode,
                paceMode,
                surname,
                // `undefined` y no `null`: que el motor aplique su propio default
                // (el número canónico del puesto) en vez de recibir un no-valor.
                ...(number !== null ? { number } : {}),
            },
            seed,
        );
        setCareer(state);
        saveCareer(state);
        setLastSeason(null);
        setBlockFrom(null);
        setStep('career');
    }

    /** Guarda y deja marcado el tramo recién jugado (una temporada o varias). */
    function applyAdvance({ state, firstNewSeason }: ReturnType<typeof advanceCareerToNextDecision>) {
        setCareer(state);
        saveCareer(state);
        if (firstNewSeason !== null) {
            setLastSeason(state.seasons.length - 1);
            setBlockFrom(firstNewSeason);
        }
        // EL FESTEJO VA ANTES DEL RESULTADO. Si primero se ve la tabla con los
        // números y después el confeti, el jugador ya se enteró y la capa llega
        // a felicitarlo por algo que ya leyó. El orden es capa → resultado →
        // decisión, y por eso se arma acá, en el mismo momento en que la
        // temporada se cierra.
        // El PULSO sale del tramo entero: si pasaron tres temporadas de una,
        // el número viejo es el de antes del tramo y el nuevo el de después.
        // Mostrar sólo la última escondería dos temporadas de progreso.
        const nuevas = state.history.slice(career ? career.history.length : 0);
        const ultima = nuevas[nuevas.length - 1];
        const primera = nuevas[0];
        if (ultima && primera) {
            const previa = state.history[state.history.length - nuevas.length - 1] ?? null;
            const desdeClub = previa?.clubId ?? null;
            setPulse({
                key: `${state.history.length}`,
                // `ovrDelta` es el de la última temporada; para el tramo se
                // reconstruye el punto de partida desde la primera.
                ovrFrom: primera.ovr - primera.ovrDelta,
                ovrTo: ultima.ovr,
                fromClubId: desdeClub,
                fromClubName: previa?.clubName ?? '',
                toClubId: ultima.clubId,
                toClubName: ultima.clubName,
                moved: desdeClub !== null && desdeClub !== ultima.clubId,
            });
        }

        const cola = orderCelebrations(nuevas.flatMap((entry, i) => {
            const anterior = state.history[state.history.length - nuevas.length + i - 1] ?? null;
            return celebrationsFor(state, entry, anterior, locale);
        }));
        if (cola.length > 0) setCelebrations(cola);
    }

    function decide(optionId: string) {
        if (!career) return;

        // La opción se captura ANTES de avanzar, con el evento todavía en la
        // mano: después de resolver, el mercado ya limpió las ofertas y esa
        // tarjeta no se puede reconstruir. El motor deja dicho CUÁL de los
        // desenlaces salió (`decisionLog[].outcomeIndex`); lo que se muestra sale
        // de ahí y no de adivinarlo por el texto.
        // Se localiza para MOSTRAR. Lo que se resuelve y se guarda sigue siendo el
        // evento del motor: `optionId` es el mismo en los dos idiomas, y el texto
        // que entra en `decisionLog` lo escribe el motor en español.
        const pending = getPendingEvent(career);
        const event = pending === null ? null : localizeEvent(pending, career, locale);
        const option = event?.options.find((o) => o.id === optionId) ?? null;
        const player = career.player;
        // Lo que le falta para su techo: la ⭐ que se aplica está acotada por eso
        // (`appliedValoracion`), así que el revelado tiene que contar lo mismo.
        const headroom = player.potential - computeOvr(player.attributes, player.position);

        const result = advanceCareerToNextDecision(career, { type: 'CHOOSE', optionId });

        const log = result.state.decisionLog[result.state.decisionLog.length - 1];
        if (event && option && log && log.eventId === event.id && log.optionId === option.id) {
            const outcome = option.outcomes[log.outcomeIndex] ?? option.outcomes[0];
            const chance = optionPreview(option, player.position, headroom, computeOvr(player.attributes, player.position))[log.outcomeIndex]?.chance ?? 100;
            setRoll({
                key: `${result.state.decisionLog.length}:${log.eventId}:${log.optionId}`,
                title: event.title,
                option: option.label,
                chance,
                // El motor guardó la frase en español; acá se muestra en el idioma
                // del jugador sin tocar lo guardado.
                text: decisionTextIn(log, locale),
                // Se muestran los dos ejes; el color sale del desenlace completo,
                // así que una suspensión se ilumina en rojo aunque su ficha no esté.
                chips: visibleChips(outcome.effect, player.position, headroom),
                tone: toneOf(effectChips(outcome.effect, player.position, headroom)),
            });
        }

        applyAdvance(result);
    }

    function playSeason() {
        if (!career) return;
        applyAdvance(advanceCareerToNextDecision(career, { type: 'ADVANCE' }));
    }

    function replay() {
        clearCareer();
        setCareer(null);
        setSaved(null);
        setConfirmingReset(false);
        setCountryCode(null);
        setPosition(null);
        setLastSeason(null);
        setBlockFrom(null);
        setOutdatedNotice(false);
        setCelebrations([]);
        setPulse(null);
        setRoll(null);
        setStep('intro');
    }

    const rawEvent = career ? getPendingEvent(career) : null;
    const pendingEvent = rawEvent === null || career === null ? null : localizeEvent(rawEvent, career, locale);
    const retired = career?.phase === 'retired';

    return (
        <div className={`${styles.wrap} ${step === 'career' ? styles.wrapConsole : ''} ${step === 'create' ? styles.wrapCreate : ''}`}>
            <div className={styles.topbar}>
                <Link href="/juegos/minijuegos" className={styles.back}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                    {t.backToGames}
                </Link>
                <LanguageToggle />
            </div>

            {outdatedNotice && step !== 'career' && (
                <p className={styles.notice} role="status">
                    {t.outdatedNotice}
                </p>
            )}

            {/* Mientras se lee el disco no se propone nada: ni continuar (no se
                sabe si hay qué) ni empezar de cero (sería tirar una carrera). */}
            {step === 'loading' && (
                <div className={styles.hydrating} role="status" aria-live="polite">
                    <span className={styles.hydratingBar} aria-hidden="true" />
                    <p className={styles.hydratingText}>{t.resuming}</p>
                </div>
            )}

            {/* El h1 NO puede desaparecer al entrar a la carrera: la página sigue
                siendo la misma y sin él queda sin encabezado de nivel 1. En la
                intro es el título grande; después acompaña en silencio, para no
                empujar el layout de la consola. Siempre hay exactamente uno. */}
            {step !== 'intro' && <h1 className={styles.srOnly}>{t.gameTitle}</h1>}

            {step === 'intro' && (
                <>
                    <div>
                        <span className={styles.eyebrow}>{t.eyebrow}</span>
                        <h1 className={styles.title}>{t.gameTitle}</h1>
                        <p className={styles.lead}>{t.lead}</p>
                    </div>
                    {saved ? (
                        <>
                            {/* El resumen es lo que convierte "Continuar" en una
                                promesa concreta: se ve QUÉ carrera se retoma. */}
                            <SavedCareerCard state={saved} />
                            <div className={styles.btnRow}>
                                <button type="button" className={styles.primaryBtn} onClick={continueCareer}>
                                    {t.continueCareer}
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                                </button>
                            </div>
                            {confirmingReset ? (
                                <div className={styles.confirmBox} role="alertdialog" aria-label={t.confirmStartOverLabel}>
                                    <p className={styles.confirmText}>
                                        {t.confirmStartOverText}
                                    </p>
                                    <div className={styles.btnRow}>
                                        <button type="button" className={styles.dangerBtn} onClick={discardSaved}>
                                            {t.deleteAndStartOver}
                                        </button>
                                        <button type="button" className={styles.ghostBtn} onClick={() => setConfirmingReset(false)}>
                                            {t.cancel}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button type="button" className={styles.linkBtn} onClick={() => setConfirmingReset(true)}>
                                    {t.startOver}
                                </button>
                            )}
                        </>
                    ) : (
                        <div className={styles.btnRow}>
                            <button type="button" className={styles.primaryBtn} onClick={() => setStep('create')}>
                                {t.startCareer}
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                            </button>
                        </div>
                    )}
                </>
            )}

            {step === 'create' && (
                <CreatePlayer
                    countryCode={countryCode}
                    position={position}

                    // El ritmo NO se resetea al volver a jugar: es una
                    // preferencia de cómo se lee el juego, no una decisión de
                    // esta carrera.
                    paceMode={paceMode}
                    surname={surname}
                    number={number}
                    onSurname={setSurname}
                    onNumber={setNumber}
                    onCountry={setCountryCode}
                    // Cambiar de puesto invalida el número elegido: el 10 no
                    // existe para un pilar. Vuelve al canónico del puesto nuevo.
                    onPosition={(pos) => { setPosition(pos); setNumber(null); }}
                    onPaceMode={setPaceMode}
                    onStart={startCareer}
                    onBack={() => setStep('intro')}
                />
            )}

            {/* EL ORDEN ES EL ORDEN EN QUE PASARON LAS COSAS: primero qué salió
                de la decisión, después cómo cerró la temporada, después el
                festejo si hubo algo que festejar. */}
            {step === 'career' && career && roll && (
                <OutcomeRoll data={roll} onDone={() => setRoll(null)} />
            )}

            {step === 'career' && career && !roll && pulse && (
                <SeasonPulse data={pulse} onDone={() => setPulse(null)} />
            )}

            {step === 'career' && career && !roll && !pulse && celebrations.length > 0 && (
                <CelebrationLayer
                    queue={celebrations.map((c): Celebration => {
                        // En el resumen los íconos van chicos; solos, grandes.
                        const solo = celebrations.length === 1;
                        return {
                            kind: c.kind,
                            key: c.key,
                            eyebrow: c.eyebrow,
                            headline: c.headline,
                            sub: c.sub,
                            accent: c.accent,
                            icon: c.clubId
                                ? <ClubBadge clubId={c.clubId} clubName={c.headline} size={solo ? 96 : 40} />
                                : c.countryCode
                                    ? <Flag code={c.countryCode} size={solo ? 104 : 40} decorative />
                                    : c.awardId
                                        ? <AwardIcon id={c.awardId} size={solo ? 96 : 40} />
                                        : null,
                        };
                    })}
                    seed={career.seed}
                    // El resumen sólo tiene sentido con más de un motivo: la capa
                    // lo ignora si la cola trae uno solo.
                    recap={{
                        eyebrow: t.celebrationSeasonRecap,
                        sub: t.celebrationSeasonRecapSub(career.player.age, celebrations.length),
                    }}
                    onDone={() => setCelebrations([])}
                />
            )}

            {step === 'career' && career && (
                <>
                    {/* Barra de carrera full-width, sobre la grilla */}
                    <PlayerHeader career={career} />
                    <div className={styles.console}>
                    {/* Columna izquierda: situación actual */}
                    <div className={styles.consoleMain}>
                        {lastSeason !== null && !retired && career.history.length > 0 && (
                            <SeasonResultInline career={career} from={blockFrom} />
                        )}

                        {retired ? (
                            <RetirementSummary career={career} onReplay={replay} />
                        ) : (
                            <>
                                {career.phase === 'event' && pendingEvent && (
                                    // `key` POR DECISIÓN, no por evento: dos
                                    // mercados seguidos tienen el mismo id
                                    // (`club-transfer`) y sin esto la tarjeta no
                                    // se remonta, así que la opción elegida de
                                    // la decisión anterior sobrevivía marcada y
                                    // dejaba los botones deshabilitados para
                                    // siempre. Con el mercado en el 64% de las
                                    // decisiones, eso trababa la partida.
                                    <EventCard
                                        key={`${career.seasons.length}:${career.pendingEventId ?? ''}`}
                                        event={pendingEvent}
                                        position={career.player.position}
                                        ovr={computeOvr(career.player.attributes, career.player.position)}
                                        onChoose={decide}
                                    />
                                )}
                                {career.phase === 'season' && <QuietSeasons career={career} onPlay={playSeason} />}
                            </>
                        )}
                    </div>

                    {/* Columna derecha: LA ESPINA. Permanente y sin scroll.
                        Antes era un panel colapsable de trayectoria que en
                        mobile arrancaba cerrado y en desktop crecía sin techo;
                        el detalle completo sigue existiendo detrás del botón,
                        pero lo que está SIEMPRE es la espina, porque es lo que
                        deja ver la carrera entera de un vistazo. */}
                    <aside className={styles.consoleAside}>
                        <CareerSpine career={career} />
                    </aside>
                    </div>
                </>
            )}
        </div>
    );
}

/**
 * Temporadas sin decisión a la vista. Con ritmo Intensa es una sola y dice lo
 * mismo de siempre; con Normal o Exprés anuncia el tramo entero —y avisa que el
 * mercado lo puede cortar, porque prometer tres temporadas y frenar en la
 * primera se lee como un error del juego.
 */
function QuietSeasons({ career, onPlay }: { career: CareerState; onPlay: () => void }) {
    const { t } = useLocale();
    const first = career.player.seasonsPlayed + 1;
    const span = SEASONS_PER_DECISION[career.paceMode];

    return (
        <section className={styles.event}>
            <h2 className={styles.eventTitle}>
                {span === 1 ? t.seasonNumber(first) : t.seasonRange(first, first + span - 1)}
            </h2>
            <p className={styles.eventText}>
                {span === 1 ? t.quietSingle : t.quietSpan(span)}
            </p>
            <div className={styles.btnRow}>
                <button type="button" className={styles.primaryBtn} onClick={onPlay}>
                    {span === 1 ? t.playSeason : t.playSeasons(span)}
                </button>
            </div>
        </section>
    );
}

/**
 * Resumen de la partida guardada. Sin esto, "Continuar carrera" es un botón que
 * pide fe: el jugador no sabe a qué vuelve. Con esto es una promesa concreta.
 */
function SavedCareerCard({ state }: { state: CareerState }) {
    const { locale, t } = useLocale();
    const p = state.player;
    const club = getClub(p.club);
    const ovr = computeOvr(p.attributes, p.position);

    return (
        <div className={styles.savedCard}>
            <div className={styles.savedIdentity}>
                <span className={styles.savedNumber}>{p.number}</span>
                <div className={styles.savedWho}>
                    <p className={styles.savedName}>{p.surname}</p>
                    <p className={styles.savedMeta}>
                        {positionLabel(p.position, getPosition(p.position).labelEs, locale)} · <span className={styles.num}>{p.age}</span> {t.yearsOld}
                    </p>
                </div>
            </div>
            <div className={styles.savedClub}>
                <ClubBadge clubId={club.id} clubName={club.labelEs} size={32} />
                <div className={styles.savedWho}>
                    <p className={styles.savedName}>{club.labelEs}</p>
                    <p className={styles.savedMeta}>
                        {state.history.length === 0 ? t.noSeasonsPlayed : t.seasonsCount(state.history.length)}
                    </p>
                </div>
            </div>
            <div className={styles.savedOvr}>
                <span className={`${styles.savedOvrValue} ${styles.num}`}>{ovr}</span>
                <span className={styles.savedOvrLabel}>{t.ovr}</span>
            </div>
        </div>
    );
}
