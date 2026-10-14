'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { seedWorld } from '../../../../features/coach/engine/world.ts';
import {
    DECISIONS_PER_SEASON,
    INITIAL_PRESSURE,
    acceptOffer,
    acknowledgeReveal,
    advanceDues,
    beginDecisions,
    benefitEvent,
    buyUpgrade,
    cutCosts,
    takeUnionLoan,
    chooseOption,
    nextTramo,
    closeMarketWindow,
    playKeyFirstHalf,
    playKeySecondHalf,
    playPlayoffMatch,
    simulateTramo,
    submitTraining,
    closeSeason,
    createCareer,
    declineOffer,
    jobOffers,
    retire,
    startingOffers,
    takeNewClub,
    type CoachAttributes,
    type CoachState,
    type FinanceAction,
    type HalfAdjustId,
    type KeyPlanId,
    type PlayoffApproachId,
    type SquadPlayer,
    type TrainingPlan,
} from '../../../../features/coach/index.ts';
import CareerSummary from './CareerSummary.tsx';
import CoachHeader from './CoachHeader.tsx';
import CreateCoach from './CreateCoach.tsx';
import EventCard from './EventCard.tsx';
import JobOffersBoard from './JobOffersBoard.tsx';
import KeyMatchBoard from './KeyMatchBoard.tsx';
import MarketBoard from './MarketBoard.tsx';
import OutcomeReveal from './OutcomeReveal.tsx';
import PreseasonBoard, { type SquadChanges } from './PreseasonBoard.tsx';
import SeasonPlayback from './SeasonPlayback.tsx';
import PlayoffBoard from './PlayoffBoard.tsx';
import SeasonResult from './SeasonResult.tsx';
import TrainingWeek from './TrainingWeek.tsx';
import TramoSummary from './TramoSummary.tsx';
import { clearCareer, loadCareer, saveCareer } from './coachStorage.ts';
import styles from './entrenador.module.css';

function BackArrow() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M15 6l-6 6 6 6" />
        </svg>
    );
}

/**
 * El ÚNICO Math.random del juego, y es para la semilla inicial. De ahí en más
 * todo el azar sale del PRNG seedeado. Se sortea ANTES de crear la carrera
 * porque de ella salen las tres ofertas del primer trabajo.
 */
function newSeed(): number {
    return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** Una herramienta de la caja, aplicada por el motor. Devuelve el MISMO estado si no se pudo. */
function applyFinanceAction(state: CoachState, action: FinanceAction): CoachState {
    if (action === 'prestamo') return takeUnionLoan(state);
    if (action === 'adelanto') return advanceDues(state);
    if (action === 'beneficio') return benefitEvent(state);
    return cutCosts(state, action);
}

/**
 * Qué le pasó al plantel al cerrar el año, medido restando el plantel viejo del
 * nuevo. Es de PANTALLA: no se guarda, porque es una lectura del cambio y no un
 * hecho nuevo (los dos planteles ya están en el estado, antes y después).
 */
function diffSquads(before: readonly SquadPlayer[], after: readonly SquadPlayer[]): SquadChanges {
    const byId = new Map(before.map((p) => [p.id, p]));
    const afterIds = new Set(after.map((p) => p.id));
    const retired = before.filter((p) => !afterIds.has(p.id));
    const promoted = after.filter((p) => !byId.has(p.id));
    const grown: { player: SquadPlayer; delta: number }[] = [];
    const declined: { player: SquadPlayer; delta: number }[] = [];
    for (const p of after) {
        const old = byId.get(p.id);
        if (!old) continue;
        const delta = Math.round((p.level - old.level) * 10) / 10;
        if (delta >= 1.5) grown.push({ player: p, delta });
        else if (delta <= -1.5) declined.push({ player: p, delta });
    }
    grown.sort((a, b) => b.delta - a.delta);
    declined.sort((a, b) => a.delta - b.delta);
    return { retired, promoted, grown, declined };
}

export default function CoachFlow() {
    const [state, setState] = useState<CoachState | null>(null);
    const [outdated, setOutdated] = useState(false);
    const [ready, setReady] = useState(false);
    const [pickingClub, setPickingClub] = useState(false);
    /**
     * En qué fase se avisó que la partida se reparó al cargarla. El aviso vive
     * hasta que el jugador avanza de fase: después ya lo leyó.
     */
    const [repairedInPhase, setRepairedInPhase] = useState<string | null>(null);
    /**
     * Las fechas de un tramo se muestran una por una SOLO cuando se acaban de
     * jugar en esta sesión. Al recargar a mitad de la lectura se va directo a lo
     * que sigue: lo que pasó ya pasó y el guardado no distingue "leído" de "por
     * leer". `null`: no hay nada que reproducir.
     */
    const [playback, setPlayback] = useState<{ from: number; to: number; label: string } | null>(null);
    /** Lo que le pasó al plantel en el último cierre de año. Solo pantalla. */
    const [squadChanges, setSquadChanges] = useState<SquadChanges | null>(null);

    // El reparto inicial de la pirámide para la pantalla de creación. Es
    // determinista, así que da lo mismo calcularlo acá que en el motor.
    const freshWorld = useMemo(() => seedWorld(), []);

    /** La semilla de la carrera que se va a crear. `null` mientras hay una partida. */
    const [seed, setSeed] = useState<number | null>(null);
    const firstOffers = useMemo(() => (seed === null ? [] : startingOffers(seed, freshWorld)), [seed, freshWorld]);
    // Después de un despido, las propuestas salen del mercado (`state.market`).
    // Un despido guardado antes del mercado no tiene propuestas: para esos queda
    // la lista vieja, derivada de la reputación.
    const legacyRehire = !!state && state.phase === 'fired' && state.market.offers.length === 0;
    const rehireOffers = useMemo(
        () => (state && pickingClub && legacyRehire ? jobOffers(state) : []),
        [state, pickingClub, legacyRehire],
    );

    useEffect(() => {
        const loaded = loadCareer();
        if (loaded.kind === 'ok') {
            setState(loaded.state);
            if (loaded.repaired) setRepairedInPhase(loaded.state.phase);
        }
        if (loaded.kind === 'outdated') setOutdated(true);
        if (loaded.kind !== 'ok') setSeed(newSeed());
        setReady(true);
    }, []);

    // Se guarda en cada cambio de estado. Si localStorage no está disponible, la
    // partida sigue en memoria: `saveCareer` no tira.
    useEffect(() => {
        if (state) saveCareer(state);
    }, [state]);

    // El aviso de partida reparada se apaga en cuanto el jugador avanza de fase.
    // Sin esto volvía a aparecer en la pretemporada siguiente, una temporada
    // después de que el juego se actualizara.
    useEffect(() => {
        if (state && repairedInPhase !== null && state.phase !== repairedInPhase) setRepairedInPhase(null);
    }, [state, repairedInPhase]);

    const start = useCallback(
        (clubId: string, profileId: string, attrs?: CoachAttributes) => {
            if (seed === null) return;
            setOutdated(false);
            const fresh = createCareer(seed, clubId, profileId, attrs);
            setState(fresh);
            setSeed(null);
            trackEvent('coach_career_start', {
                club: clubId,
                competition: fresh.competitionId,
                profile: profileId,
                fromOffer: firstOffers.some((o) => o.clubId === clubId),
            });
        },
        [seed, firstOffers],
    );

    const restart = useCallback(() => {
        clearCareer();
        setSeed(newSeed());
        setState(null);
        setPickingClub(false);
        setSquadChanges(null);
    }, []);

    /** Leído el desenlace: la tarjeta siguiente, o la semana de entrenamiento si era la última del tramo. */
    const continueAfterReveal = useCallback((current: CoachState) => {
        setState(acknowledgeReveal(current));
        window.scrollTo({ top: 0 });
    }, []);

    /**
     * Juega un paso del tramo y, si se jugaron fechas, las muestra una por una
     * antes de lo que sigue (el partido clave o el resumen del tramo).
     */
    const playStep = useCallback((current: CoachState, next: CoachState) => {
        if (next === current) return;
        const from = (current.inSeason?.round ?? 0) + 1;
        const to = next.inSeason?.round ?? 0;
        if (to >= from) {
            setPlayback({
                from,
                to,
                label: next.phase === 'keymatch' ? 'Al partido clave' : 'Ver el resumen del tramo',
            });
        }
        setState(next);
        window.scrollTo({ top: 0 });
    }, []);

    /** Cierra el año. Si la subcomisión te echó, la carrera terminó y se mide. */
    const endSeason = useCallback((current: CoachState) => {
        const last = current.seasons[current.seasons.length - 1];
        if (last) {
            trackEvent('coach_season_end', {
                season: last.season,
                club: last.clubId,
                competition: last.competitionId,
                position: last.position,
                teams: last.teams,
                objectiveMet: last.objectiveMet,
                champion: last.champion,
                tdi: last.tdi,
            });
        }
        const next = closeSeason(current);
        if (next.phase === 'fired') {
            trackEvent('coach_career_end', { reason: 'fired', seasons: next.seasons.length, clubs: next.history.length });
            setSquadChanges(null);
        } else {
            setSquadChanges(diffSquads(current.squad, next.squad));
        }
        setState(next);
        window.scrollTo({ top: 0 });
    }, []);

    /** Después de un despido: firmar con un club nuevo. */
    const takeClubAfterFiring = useCallback((current: CoachState, clubId: string) => {
        const next = takeNewClub(current, clubId);
        trackEvent('coach_new_club', { club: clubId, competition: next.competitionId, season: next.season, via: 'despido' });
        setState(next);
        setSquadChanges(null);
        setPickingClub(false);
        window.scrollTo({ top: 0 });
    }, []);

    /** Aceptar una propuesta en la pretemporada: la carrera sigue en otro club. */
    const signOffer = useCallback((current: CoachState, clubId: string) => {
        const next = acceptOffer(current, clubId);
        if (next === current) return;
        trackEvent('coach_new_club', { club: clubId, competition: next.competitionId, season: next.season, via: 'oferta' });
        setState(next);
        setSquadChanges(null);
        window.scrollTo({ top: 0 });
    }, []);

    const leave = useCallback((current: CoachState) => {
        trackEvent('coach_career_end', { reason: 'retired', seasons: current.seasons.length, clubs: current.history.length });
        setState(retire(current));
    }, []);

    if (!ready) return null;

    // Las tarjetas se cuentan por tramo. Una partida del esquema 6 a mitad de las
    // cinco de la pretemporada no tiene tramo todavía: se cuentan sobre las cinco.
    const cardsTotal = state?.inSeason ? (state.inSeason.cards[state.inSeason.tramo] ?? 1) : DECISIONS_PER_SEASON;
    const decisionStep = state ? Math.max(1, Math.min(cardsTotal, cardsTotal - state.decisionsLeft + 1)) : 1;

    return (
        <div className={styles.page}>
            <div className={styles.topBar}>
                <Link href="/juegos/minijuegos" className={styles.topBack} aria-label="Volver a Minijuegos">
                    <BackArrow />
                </Link>
                <h1 className={styles.title}>El Entrenador</h1>
                <span className={styles.topTag}>Rugby de clubes argentino</span>
            </div>

            {!state && (
                <>
                    {outdated && (
                        <section className={styles.panel}>
                            <p className={styles.objectiveNote}>
                                Había una carrera guardada, pero es de una versión anterior del juego y
                                no se puede retomar sin inventarle cosas que no pasaron. Se empieza de
                                nuevo.
                            </p>
                        </section>
                    )}
                    {seed !== null && <CreateCoach key={seed} world={freshWorld} offers={firstOffers} onStart={start} />}
                </>
            )}

            {state && pickingClub && (
                <>
                    <section className={styles.panel}>
                        <h2 className={styles.panelTitle}>Un club nuevo</h2>
                        <p className={styles.objectiveNote}>
                            Llegás con la mochila de lo anterior: la presión no vuelve a cero, y
                            las mejoras se quedaron en el club que dejaste.
                        </p>
                    </section>
                    {legacyRehire ? (
                        <CreateCoach
                            world={state.world}
                            clubOnly
                            offers={rehireOffers}
                            allowFreeChoice={rehireOffers.length === 0}
                            onStart={(clubId) => takeClubAfterFiring(state, clubId)}
                        />
                    ) : (
                        <section className={styles.panel}>
                            <h2 className={styles.panelTitle}>Propuestas para volver a dirigir</h2>
                            <JobOffersBoard
                                offers={state.market.offers}
                                news={state.market.news}
                                world={state.world}
                                year={state.year}
                                myCompetitionId={state.competitionId}
                                leaving={null}
                                arrivalPressure={Math.round(INITIAL_PRESSURE + (state.pressure - INITIAL_PRESSURE) * 0.35)}
                                onAccept={(clubId) => takeClubAfterFiring(state, clubId)}
                            />
                        </section>
                    )}
                </>
            )}

            {state && !pickingClub && (
                <>
                    {state.phase !== 'fired' && state.phase !== 'retired' && <CoachHeader state={state} />}

                    {repairedInPhase === state.phase && (
                        <p className={styles.objectiveNote} role="status">
                            El juego se actualizó desde la última vez. La carrera sigue donde estaba, con
                            lo que cambió del catálogo ya acomodado.
                        </p>
                    )}

                    {state.phase === 'preseason' && (
                        <PreseasonBoard
                            // Un club nuevo arranca en el Resumen, no en la pestaña donde se firmó.
                            key={state.clubId}
                            state={state}
                            squadChanges={squadChanges}
                            onStart={() => {
                                setSquadChanges(null);
                                setState(beginDecisions(state));
                            }}
                            onAcceptOffer={(clubId) => signOffer(state, clubId)}
                            onDeclineOffer={(clubId) => {
                                trackEvent('coach_offer_declined', { club: clubId, season: state.season });
                                setState(declineOffer(state, clubId));
                            }}
                            onBuy={(id) => {
                                const next = buyUpgrade(state, id);
                                if (next === state) return;
                                trackEvent('coach_upgrade', { upgrade: id, season: state.season, club: state.clubId });
                                setState(next);
                            }}
                            onMarket={(next) => {
                                if (next === state) return;
                                trackEvent('coach_market', { season: state.season, window: 'pretemporada' });
                                setState(next);
                            }}
                            onAcademy={(next) => {
                                if (next === state) return;
                                trackEvent('coach_academy', { season: state.season, club: state.clubId });
                                setState(next);
                            }}
                            onFinance={(action) => {
                                const next = applyFinanceAction(state, action);
                                if (next === state) return;
                                trackEvent('coach_finance', { action, season: state.season, club: state.clubId });
                                setState(next);
                            }}
                        />
                    )}

                    {state.phase === 'decision' && state.pendingEventId && (
                        <EventCard
                            eventId={state.pendingEventId}
                            step={decisionStep}
                            total={cardsTotal}
                            onChoose={(optionId) => {
                                trackEvent('coach_decision', {
                                    event: state.pendingEventId,
                                    option: optionId,
                                    season: state.season,
                                });
                                setState(chooseOption(state, optionId));
                            }}
                        />
                    )}

                    {state.phase === 'reveal' && state.pendingReveal && (
                        <OutcomeReveal
                            reveal={state.pendingReveal}
                            decisionsLeft={state.decisionsLeft}
                            onContinue={() => continueAfterReveal(state)}
                        />
                    )}

                    {playback && (state.phase === 'keymatch' || state.phase === 'tramo') && (
                        <SeasonPlayback
                            key={playback.from * 1000 + playback.to}
                            state={state}
                            from={playback.from}
                            to={playback.to}
                            doneLabel={playback.label}
                            onDone={() => {
                                setPlayback(null);
                                window.scrollTo({ top: 0 });
                            }}
                        />
                    )}

                    {state.phase === 'training' && state.inSeason && (
                        <TrainingWeek
                            key={state.season * 10 + state.inSeason.tramo}
                            state={state}
                            onSubmit={(plan: TrainingPlan, fix: boolean) => {
                                trackEvent('coach_training', {
                                    season: state.season,
                                    tramo: state.inSeason?.tramo,
                                    lineup: plan.lineup,
                                    fix,
                                });
                                playStep(state, submitTraining(state, plan, fix));
                            }}
                            onSimulate={() => {
                                trackEvent('coach_tramo_simulated', { season: state.season, tramo: state.inSeason?.tramo });
                                playStep(state, simulateTramo(state));
                            }}
                        />
                    )}

                    {state.phase === 'keymatch' && !playback && (
                        <KeyMatchBoard
                            state={state}
                            onFirstHalf={(plan: KeyPlanId) => {
                                trackEvent('coach_key_plan', { season: state.season, tramo: state.inSeason?.tramo, plan });
                                setState(playKeyFirstHalf(state, plan));
                                window.scrollTo({ top: 0 });
                            }}
                            onSecondHalf={(adjust: HalfAdjustId) => {
                                trackEvent('coach_key_adjust', { season: state.season, tramo: state.inSeason?.tramo, adjust });
                                playStep(state, playKeySecondHalf(state, adjust));
                            }}
                        />
                    )}

                    {state.phase === 'market' && (
                        <>
                            <section className={styles.panel}>
                                <h2 className={styles.panelTitle}>La ventana corta de pases · entre el tramo 1 y el 2</h2>
                                <p className={styles.objectiveNote}>
                                    Una semana para mover el plantel con lo que mostró el tramo 1. Lo que no contestes se
                                    resuelve solo al seguir.
                                </p>
                                <MarketBoard
                                    state={state}
                                    onChange={(next) => {
                                        if (next === state) return;
                                        trackEvent('coach_market', { season: state.season, window: 'corta' });
                                        setState(next);
                                    }}
                                />
                            </section>
                            <div className={styles.actionBar}>
                                <button
                                    type="button"
                                    className={styles.primary}
                                    disabled={state.transfers.negotiation !== null}
                                    onClick={() => {
                                        setState(closeMarketWindow(state));
                                        window.scrollTo({ top: 0 });
                                    }}
                                >
                                    Cerrar la ventana y seguir al tramo 2
                                    <span className={styles.primaryHint}>
                                        {state.transfers.negotiation
                                            ? 'Primero cerrá o abandoná la negociación abierta'
                                            : 'Las decisiones y la semana que vienen'}
                                    </span>
                                </button>
                            </div>
                        </>
                    )}

                    {state.phase === 'tramo' && !playback && (
                        <TramoSummary
                            state={state}
                            onContinue={() => {
                                setState(nextTramo(state));
                                window.scrollTo({ top: 0 });
                            }}
                        />
                    )}

                    {state.phase === 'playoff' && (
                        <PlayoffBoard
                            state={state}
                            onPlay={(approach: PlayoffApproachId) => {
                                trackEvent('coach_playoff', {
                                    stage: state.playoff?.stage,
                                    approach,
                                    season: state.season,
                                });
                                setState(playPlayoffMatch(state, approach));
                                window.scrollTo({ top: 0 });
                            }}
                        />
                    )}

                    {state.phase === 'season' && (
                        <SeasonResult state={state} onContinue={() => endSeason(state)} />
                    )}

                    {(state.phase === 'fired' || state.phase === 'retired') && (
                        <CareerSummary
                            state={state}
                            fired={state.phase === 'fired'}
                            onTakeNewClub={() => setPickingClub(true)}
                            onRestart={restart}
                        />
                    )}

                    {state.phase === 'preseason' && state.seasons.length > 0 && (
                        <div className={styles.actions}>
                            <button
                                type="button"
                                className={styles.ghost}
                                onClick={() => leave(state)}
                            >
                                Dejar la carrera acá
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
