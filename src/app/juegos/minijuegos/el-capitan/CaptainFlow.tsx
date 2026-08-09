'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { CaptainState, CreateCaptainInput, MomentOutcome } from '@/features/captain';
import { captainReducer, createInitialCaptain, getPendingEvent } from '@/features/captain';
import { clearCaptain, loadCaptain, saveCaptain } from './captainStorage';
import CreatePlayer from './CreatePlayer';
import PlayerHeader from './PlayerHeader';
import TrainingCard from './TrainingCard';
import { MOMENT_SCREENS } from './MomentScreens';
import EventCard from './EventCard';
import SeasonResult from './SeasonResult';
import Retirement from './Retirement';
import styles from './capitan.module.css';

/**
 * El orquestador.
 *
 * Es el ÚNICO lugar del juego con `Math.random`, y solo para sortear la semilla
 * inicial (CLAUDE.md §1). De ahí en adelante todo sale del PRNG sembrado, así
 * que la misma semilla y las mismas decisiones dan la misma carrera.
 *
 * ── Por qué hay un paso de "resultado" ──
 * El reducer resuelve la temporada y abre la decisión en una sola acción. Si la
 * pantalla siguiera al estado sin más, el jugador vería la tarjeta de decisión
 * sin haberse enterado nunca de cómo le fue el año. Por eso el flujo guarda la
 * última temporada jugada y la muestra antes de dejar pasar.
 */
type Step = 'loading' | 'intro' | 'create' | 'career';

/**
 * El título del juego, para las pantallas donde no se ve.
 *
 * Cada página lleva UN solo `<h1>` y es el título del juego (CLAUDE.md §6). En
 * la portada se ve; a partir de ahí la pantalla la manda la cabecera del
 * jugador, así que el `<h1>` queda solo para el lector de pantalla y el
 * buscador. Sin esto, todas las pantallas de juego se quedaban sin ninguno.
 */
function GameTitle() {
    return <h1 className={styles.srOnly}>El Capitán</h1>;
}

/**
 * El envoltorio de todas las pantallas, con la salida adentro.
 *
 * Existe porque el juego va camino a ser una pantalla de alto completo —sin
 * footer y sin barra inferior, que hoy son las dos únicas formas de irse de
 * acá— y cuando eso pase esta flecha queda como la única puerta. Un `div`
 * suelto por pantalla garantiza que la próxima se olvide de ponerla.
 *
 * ── Por qué `salida` puede ser `false` ──
 * La barra cuesta 58 px de alto, y en la pantalla de decisión el alto es
 * exactamente lo que falta: medido, la agrega y la primera opción clickeable se
 * corre de 412 px a 460 en una ventana de 900. Pagar eso HOY no compra nada,
 * porque mientras el footer y la barra inferior sigan renderizándose la salida
 * ya existe por otro lado.
 *
 * Así que la flecha va donde el espacio sobra —portada, creación, retiro— y en
 * la pantalla de decisión entra junto con el alto completo, integrada en la
 * cabecera del jugador y sin fila propia. Las dos cosas son el mismo commit y
 * no se pueden separar: el día que se saque el footer, esta pantalla se queda
 * sin puerta.
 */
function Shell({ children, salida = true }: { children?: React.ReactNode; salida?: boolean }) {
    return (
        <div className={styles.shell}>
            {salida && (
                <div className={styles.topbar}>
                    <Link href="/juegos/minijuegos" className={styles.back}>
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
                        Juegos
                    </Link>
                </div>
            )}
            {/* El cuerpo va envuelto para poder repartir el alto sin arrastrar
                la barra de salida: en las pantallas de antesala se centra, y es
                donde va a colgarse el scroll interno cuando el shell pase a
                alto fijo. */}
            <div className={styles.shellBody}>{children}</div>
        </div>
    );
}

export default function CaptainFlow() {
    const [step, setStep] = useState<Step>('loading');
    const [career, setCareer] = useState<CaptainState | null>(null);
    const [saved, setSaved] = useState<CaptainState | null>(null);
    const [outdated, setOutdated] = useState(false);

    /** La temporada que se acaba de jugar y que todavía no se mostró. */
    const [pendingResult, setPendingResult] = useState<{ index: number; ovrDelta: number } | null>(null);

    // Carga al montar. Nunca avanza el estado: solo mira si hay partida.
    useEffect(() => {
        const result = loadCaptain();
        if (result.kind === 'ok') setSaved(result.state);
        if (result.kind === 'outdated') setOutdated(true);
        setStep('intro');
    }, []);

    const commit = useCallback((next: CaptainState) => {
        setCareer(next);
        saveCaptain(next);
    }, []);

    const start = useCallback((input: CreateCaptainInput) => {
        // El único Math.random del juego.
        const seed = Math.floor(Math.random() * 0x7fffffff);
        const fresh = createInitialCaptain(input, seed);
        setSaved(null);
        setPendingResult(null);
        commit(fresh);
        setStep('career');
    }, [commit]);

    /**
     * Resuelve la temporada. Se llama al elegir el entrenamiento y otra vez al
     * salir de un Momento, porque las dos cosas dejan el estado en `season`.
     */
    const resolveSeason = useCallback((listo: CaptainState) => {
        const antes = listo.player.ovr;
        const jugado = captainReducer(listo, { type: 'ADVANCE' });
        const index = jugado.history.length - 1;
        setPendingResult({ index, ovrDelta: jugado.history[index].ovr - antes });
        commit(jugado);
    }, [commit]);

    /**
     * Elegir el entrenamiento arranca la temporada: no hay paso de confirmar.
     * Si el año trae una jugada decisiva, el motor frena en `moment` y la
     * pantalla la ofrece antes de simular — el Momento pasa DENTRO del año, así
     * que su suspensión se cobra en este.
     */
    const train = useCallback((trainingId: string) => {
        if (!career) return;
        const elegido = captainReducer(career, { type: 'CHOOSE_TRAINING', trainingId });
        if (elegido.phase === 'moment') { commit(elegido); return; }
        if (elegido.phase !== 'season') return;
        resolveSeason(elegido);
    }, [career, commit, resolveSeason]);

    /** Lo que hiciste en la jugada. Es tu mano, y el motor la trata como tal. */
    const resolveMomentInput = useCallback((outcome: MomentOutcome) => {
        if (!career) return;
        const next = captainReducer(career, { type: 'RESOLVE_MOMENT', outcome });
        if (next.phase === 'moment') { commit(next); return; } // se fue al bunker
        resolveSeason(next);
    }, [career, commit, resolveSeason]);

    const choose = useCallback((optionId: string) => {
        if (!career) return;
        const next = captainReducer(career, { type: 'CHOOSE', optionId });
        // El desenlace se escribe sobre la temporada recién jugada, así que se
        // vuelve a mostrar el resultado ya con la línea de la decisión.
        setPendingResult({ index: next.history.length - 1, ovrDelta: 0 });
        commit(next);
    }, [career, commit]);

    const restart = useCallback(() => {
        clearCaptain();
        setCareer(null);
        setSaved(null);
        setPendingResult(null);
        setStep('create');
    }, []);

    // ── Pantallas ───────────────────────────────────────────────────────────

    if (step === 'loading') {
        // Nunca ofrecer "Continuar" antes de saber si hay partida guardada.
        return <Shell />;
    }

    if (step === 'intro') {
        return (
            <Shell>
                <div className={styles.card}>
                    <span className={styles.eyebrow}>Minijuegos</span>
                    <h1 className={styles.finalTitle}>El Capitán</h1>
                    <p className={styles.finalLead}>
                        De la M14 a la 1 del club. Y si el cuerpo aguanta, a Los Pumas.
                    </p>
                    <p className={styles.cardText}>
                        Empezás con dieciocho en un club de tu país. Cada temporada repartís seis fichas
                        de tiempo entre entrenar, laburar, el club, la familia y el gimnasio, y después
                        se juega el año. No hay plata hasta que firmes profesional, y firmar te saca del
                        plantel de tu club.
                    </p>

                    {outdated && (
                        <p className={styles.note}>
                            Había una partida guardada de una versión anterior del juego y no se puede
                            retomar. Se empieza de nuevo.
                        </p>
                    )}

                    <div style={{ marginTop: 20 }}>
                        {saved ? (
                            <>
                                <button
                                    type="button"
                                    className={styles.primary}
                                    onClick={() => { setCareer(saved); setStep('career'); }}
                                >
                                    Continuar la carrera
                                </button>
                                <span className={styles.primaryHint}>
                                    {saved.player.name} {saved.player.surname} · temporada {saved.season} · {saved.player.age} años
                                </span>
                                <button type="button" className={styles.ghost} onClick={restart}>
                                    Empezar una nueva
                                </button>
                            </>
                        ) : (
                            <button type="button" className={styles.primary} onClick={() => setStep('create')}>
                                Empezar una carrera
                            </button>
                        )}
                    </div>
                </div>
            </Shell>
        );
    }

    if (step === 'create' || !career) {
        return (
            <Shell>
                <GameTitle />
                <CreatePlayer onStart={start} />
            </Shell>
        );
    }

    if (career.player.retired && !pendingResult) {
        return (
            <Shell>
                <GameTitle />
                <PlayerHeader state={career} />
                <Retirement state={career} onRestart={restart} />
            </Shell>
        );
    }

    const evento = getPendingEvent(career);

    // La pantalla de la jugada sale del registry: agregar un Momento no toca el
    // orquestador, que es lo mismo que pasa del lado del motor con `MomentDef`.
    const MomentScreen = career.phase === 'moment' && career.pendingMoment
        ? MOMENT_SCREENS[career.pendingMoment.kind]
        : null;

    return (
        // Sin barra de salida: es la pantalla donde el alto falta, y la puerta
        // sigue estando en el footer y en la barra inferior hasta que el juego
        // pase a alto completo. El porqué completo, en `Shell`.
        <Shell salida={false}>
            <GameTitle />
            <PlayerHeader state={career} />

            {/* La decisión y la trayectoria son hermanas y no una arriba de la
                otra: en escritorio se reparten en dos columnas y la trayectoria
                deja de empujar la decisión fuera de pantalla. En teléfono esto
                es un `div` y no hace nada. El reparto vive entero en el CSS. */}
            <div className={styles.console}>
                <div className={styles.consoleMain}>
                    {pendingResult ? (
                        <SeasonResult
                            entry={career.history[pendingResult.index]}
                            family={career.player.family}
                            ovrDelta={pendingResult.ovrDelta}
                            onContinue={() => setPendingResult(null)}
                        />
                    ) : MomentScreen ? (
                        <MomentScreen state={career} onResolve={resolveMomentInput} />
                    ) : evento ? (
                        <EventCard event={evento} onChoose={choose} />
                    ) : (
                        <TrainingCard state={career} onChoose={train} />
                    )}
                </div>

                {career.history.length > 0 && !pendingResult && (
                    <aside className={styles.consoleAside}>
                        <div className={styles.card}>
                            <span className={styles.eyebrow}>Trayectoria</span>
                            <div className={styles.timeline}>
                                {[...career.history].reverse().slice(0, 6).map((h) => (
                                    <div key={h.season} className={styles.season}>
                                        <span className={styles.seasonAge}>{h.age}</span>
                                        <span className={styles.seasonBody}>
                                            <span className={styles.seasonClub}>{h.ovr}</span> · {h.matchesPlayed} partidos
                                            {h.caps > 0 ? ` · ${h.caps} caps` : ''}
                                            {h.titles.length > 0 ? ` · ${h.titles.join(', ')}` : ''}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>
                )}
            </div>
        </Shell>
    );
}
