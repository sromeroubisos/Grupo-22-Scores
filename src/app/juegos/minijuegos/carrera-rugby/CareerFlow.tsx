'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CareerState, Position, StartRouteId } from '@/features/career';
import { computeOvr, createInitialCareer, getClub, getPendingEvent, getPosition } from '@/features/career';
import ClubBadge from './ClubBadge';
import styles from './carrera.module.css';
import CreatePlayer from './CreatePlayer';
import PlayerHeader from './PlayerHeader';
import EventCard from './EventCard';
import SeasonResultInline from './SeasonResultInline';
import CareerTimeline from './CareerTimeline';
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

export default function CareerFlow() {
    const [step, setStep] = useState<Step>('loading');
    /** Partida encontrada en disco, a la espera de que el jugador la retome. */
    const [saved, setSaved] = useState<CareerState | null>(null);
    const [confirmingReset, setConfirmingReset] = useState(false);
    const [countryCode, setCountryCode] = useState<string | null>(null);
    const [position, setPosition] = useState<Position | null>(null);
    const [startRoute, setStartRoute] = useState<StartRouteId | null>(null);
    const [surname, setSurname] = useState('');
    // null = todavía no eligió: el motor pone el canónico del puesto.
    const [number, setNumber] = useState<number | null>(null);
    const [career, setCareer] = useState<CareerState | null>(null);
    const [lastSeason, setLastSeason] = useState<number | null>(null);
    const [showTimeline, setShowTimeline] = useState(false);
    const [outdatedNotice, setOutdatedNotice] = useState(false);

    // Restaura una carrera en curso ante una recarga. Solo LEE el estado: no
    // avanza nada, así que no se consume RNG y la decisión pendiente vuelve tal cual.
    useEffect(() => {
        const result = loadCareer();
        if (result.kind === 'ok') {
            // NO se entra solo a la carrera: la portada ofrece retomarla. Así
            // "Empezar de nuevo" tiene dónde vivir sin esconderse detrás del
            // retiro, y el jugador ve qué partida está por continuar.
            setSaved(result.state);
        } else if (result.kind === 'outdated') {
            setOutdatedNotice(true);
        }
        setStep('intro');
    }, []);

    /** Retoma la partida guardada tal cual quedó: no avanza nada ni toca el RNG. */
    function continueCareer() {
        if (!saved) return;
        setCareer(saved);
        setLastSeason(saved.seasons.length > 0 ? saved.seasons.length - 1 : null);
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
        if (countryCode === null || position === null || startRoute === null) return;
        const seed = Math.floor(Math.random() * 0x7fffffff);
        const state = createInitialCareer(
            {
                position,
                nationalityCountryCode: countryCode,
                startRoute,
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
        setShowTimeline(false);
        setStep('career');
    }

    function decide(optionId: string) {
        if (!career) return;
        const { state, firstNewSeason } = advanceCareerToNextDecision(career, { type: 'CHOOSE', optionId });
        setCareer(state);
        saveCareer(state);
        if (firstNewSeason !== null) setLastSeason(state.seasons.length - 1);
    }

    function playSeason() {
        if (!career) return;
        const { state, firstNewSeason } = advanceCareerToNextDecision(career, { type: 'ADVANCE' });
        setCareer(state);
        saveCareer(state);
        if (firstNewSeason !== null) setLastSeason(state.seasons.length - 1);
    }

    function replay() {
        clearCareer();
        setCareer(null);
        setSaved(null);
        setConfirmingReset(false);
        setCountryCode(null);
        setPosition(null);
        setStartRoute(null);
        setLastSeason(null);
        setShowTimeline(false);
        setOutdatedNotice(false);
        setStep('intro');
    }

    const pendingEvent = career ? getPendingEvent(career) : null;
    const retired = career?.phase === 'retired';

    return (
        <div className={`${styles.wrap} ${step === 'career' ? styles.wrapConsole : ''}`}>
            <div className={styles.topbar}>
                <Link href="/juegos/minijuegos" className={styles.back}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                    Volver a Juegos
                </Link>
            </div>

            {outdatedNotice && step !== 'career' && (
                <p className={styles.notice} role="status">
                    El juego se actualizó y tu partida anterior no se puede seguir. Podés empezar una nueva.
                </p>
            )}

            {/* Mientras se lee el disco no se propone nada: ni continuar (no se
                sabe si hay qué) ni empezar de cero (sería tirar una carrera). */}
            {step === 'loading' && (
                <div className={styles.hydrating} role="status" aria-live="polite">
                    <span className={styles.hydratingBar} aria-hidden="true" />
                    <p className={styles.hydratingText}>Retomando tu carrera…</p>
                </div>
            )}

            {/* El h1 NO puede desaparecer al entrar a la carrera: la página sigue
                siendo la misma y sin él queda sin encabezado de nivel 1. En la
                intro es el título grande; después acompaña en silencio, para no
                empujar el layout de la consola. Siempre hay exactamente uno. */}
            {step !== 'intro' && <h1 className={styles.srOnly}>Carrera de Rugby</h1>}

            {step === 'intro' && (
                <>
                    <div>
                        <span className={styles.eyebrow}>Minijuegos</span>
                        <h1 className={styles.title}>Carrera de Rugby</h1>
                        <p className={styles.lead}>Creá un jugador y llevá su carrera del debut al retiro.</p>
                    </div>
                    {saved ? (
                        <>
                            {/* El resumen es lo que convierte "Continuar" en una
                                promesa concreta: se ve QUÉ carrera se retoma. */}
                            <SavedCareerCard state={saved} />
                            <div className={styles.btnRow}>
                                <button type="button" className={styles.primaryBtn} onClick={continueCareer}>
                                    Continuar carrera
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                                </button>
                            </div>
                            {confirmingReset ? (
                                <div className={styles.confirmBox} role="alertdialog" aria-label="Confirmar empezar de nuevo">
                                    <p className={styles.confirmText}>
                                        Empezar de nuevo borra la carrera guardada. No se puede deshacer.
                                    </p>
                                    <div className={styles.btnRow}>
                                        <button type="button" className={styles.dangerBtn} onClick={discardSaved}>
                                            Borrar y empezar de nuevo
                                        </button>
                                        <button type="button" className={styles.ghostBtn} onClick={() => setConfirmingReset(false)}>
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button type="button" className={styles.linkBtn} onClick={() => setConfirmingReset(true)}>
                                    Empezar de nuevo
                                </button>
                            )}
                        </>
                    ) : (
                        <div className={styles.btnRow}>
                            <button type="button" className={styles.primaryBtn} onClick={() => setStep('create')}>
                                Comenzar carrera
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
                    startRoute={startRoute}
                    surname={surname}
                    number={number}
                    onSurname={setSurname}
                    onNumber={setNumber}
                    onCountry={setCountryCode}
                    // Cambiar de puesto invalida el número elegido: el 10 no
                    // existe para un pilar. Vuelve al canónico del puesto nuevo.
                    onPosition={(pos) => { setPosition(pos); setNumber(null); }}
                    onStartRoute={setStartRoute}
                    onStart={startCareer}
                />
            )}

            {step === 'career' && career && (
                <>
                    {/* Barra de carrera full-width, sobre la grilla */}
                    <PlayerHeader career={career} />
                    <div className={styles.console}>
                    {/* Columna izquierda: situación actual */}
                    <div className={styles.consoleMain}>
                        {lastSeason !== null && !retired && career.history.length > 0 && <SeasonResultInline career={career} />}

                        {retired ? (
                            <RetirementSummary career={career} onReplay={replay} />
                        ) : (
                            <>
                                {career.phase === 'event' && pendingEvent && (
                                    <EventCard event={pendingEvent} onChoose={decide} />
                                )}
                                {career.phase === 'season' && (
                                    <section className={styles.event}>
                                        <h2 className={styles.eventTitle}>Temporada {career.player.seasonsPlayed + 1}</h2>
                                        <p className={styles.eventText}>Una temporada más de trabajo, sin grandes novedades fuera de la cancha.</p>
                                        <div className={styles.btnRow}>
                                            <button type="button" className={styles.primaryBtn} onClick={playSeason}>Jugar temporada</button>
                                        </div>
                                    </section>
                                )}
                            </>
                        )}
                    </div>

                    {/* Columna derecha: trayectoria (colapsable en mobile) */}
                    <aside className={styles.consoleAside} aria-labelledby="trayectoria-titulo">
                        <h2 id="trayectoria-titulo" className={styles.asideTitle}>Trayectoria</h2>
                        <button
                            type="button"
                            className={styles.timelineToggle}
                            onClick={() => setShowTimeline((v) => !v)}
                            aria-expanded={showTimeline}
                            aria-controls="trayectoria-panel"
                        >
                            {showTimeline ? 'Ocultar trayectoria' : `Ver trayectoria (${career.history.length})`}
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={showTimeline ? styles.chevronOpen : undefined}><path d="M6 9l6 6 6-6" /></svg>
                        </button>
                        <div
                            id="trayectoria-panel"
                            className={`${styles.timelinePanel} ${showTimeline ? styles.timelinePanelOpen : ''}`}
                        >
                            <CareerTimeline history={career.history} highlight={retired ? null : lastSeason} />
                        </div>
                    </aside>
                    </div>
                </>
            )}
        </div>
    );
}

/**
 * Resumen de la partida guardada. Sin esto, "Continuar carrera" es un botón que
 * pide fe: el jugador no sabe a qué vuelve. Con esto es una promesa concreta.
 */
function SavedCareerCard({ state }: { state: CareerState }) {
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
                        {getPosition(p.position).labelEs} · <span className={styles.num}>{p.age}</span> años
                    </p>
                </div>
            </div>
            <div className={styles.savedClub}>
                <ClubBadge clubId={club.id} clubName={club.labelEs} size={32} />
                <div className={styles.savedWho}>
                    <p className={styles.savedName}>{club.labelEs}</p>
                    <p className={styles.savedMeta}>
                        {state.history.length === 0
                            ? 'Sin temporadas jugadas'
                            : `${state.history.length} ${state.history.length === 1 ? 'temporada' : 'temporadas'}`}
                    </p>
                </div>
            </div>
            <div className={styles.savedOvr}>
                <span className={`${styles.savedOvrValue} ${styles.num}`}>{ovr}</span>
                <span className={styles.savedOvrLabel}>OVR</span>
            </div>
        </div>
    );
}
