'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CareerState, Position, StartRouteId } from '@/features/career';
import { createInitialCareer, getPendingEvent } from '@/features/career';
import styles from './carrera.module.css';
import CreatePlayer from './CreatePlayer';
import PlayerHeader from './PlayerHeader';
import EventCard from './EventCard';
import SeasonResultInline from './SeasonResultInline';
import CareerTimeline from './CareerTimeline';
import RetirementSummary from './RetirementSummary';
import { advanceCareerToNextDecision } from './advanceCareer';
import { saveCareer, loadCareer, clearCareer } from './careerStorage';

type Step = 'intro' | 'create' | 'career';

export default function CareerFlow() {
    const [step, setStep] = useState<Step>('intro');
    const [countryCode, setCountryCode] = useState<string | null>(null);
    const [position, setPosition] = useState<Position | null>(null);
    const [startRoute, setStartRoute] = useState<StartRouteId | null>(null);
    const [career, setCareer] = useState<CareerState | null>(null);
    const [lastSeason, setLastSeason] = useState<number | null>(null);
    const [showTimeline, setShowTimeline] = useState(false);
    const [outdatedNotice, setOutdatedNotice] = useState(false);

    // Restaura una carrera en curso ante una recarga. Solo LEE el estado: no
    // avanza nada, así que no se consume RNG y la decisión pendiente vuelve tal cual.
    useEffect(() => {
        const result = loadCareer();
        if (result.kind === 'ok') {
            setCareer(result.state);
            setLastSeason(result.state.seasons.length > 0 ? result.state.seasons.length - 1 : null);
            setStep('career');
        } else if (result.kind === 'outdated') {
            setOutdatedNotice(true);
        }
    }, []);

    function startCareer() {
        if (countryCode === null || position === null || startRoute === null) return;
        const seed = Math.floor(Math.random() * 0x7fffffff);
        const state = createInitialCareer({ position, nationalityCountryCode: countryCode, startRoute }, seed);
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
                    Tu partida anterior era de una versión vieja del juego y no se pudo continuar. Podés empezar una nueva.
                </p>
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
                    <div className={styles.btnRow}>
                        <button type="button" className={styles.primaryBtn} onClick={() => setStep('create')}>
                            Comenzar carrera
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                        </button>
                    </div>
                </>
            )}

            {step === 'create' && (
                <CreatePlayer
                    countryCode={countryCode}
                    position={position}
                    startRoute={startRoute}
                    onCountry={setCountryCode}
                    onPosition={setPosition}
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
