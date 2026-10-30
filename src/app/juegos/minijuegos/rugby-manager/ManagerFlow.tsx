'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import type { Club, ID, TacticsPhilosophy } from '../../../../features/manager/types/index.ts';
import type { LiveMatchSetup } from '../../../../features/manager/game/game.ts';
import type { GameSummary } from '../../../../features/manager/game/save.ts';
import { clubOf } from '../../../../features/manager/game/queries.ts';
import type { ChooseView, PlayView } from '../../../../features/manager/worker/protocol.ts';
import type { MatchResult } from '../../../../features/manager/engine/types.ts';
import type { EventActors, SubLog } from '../../../../features/manager/engine/playerMatchStats.ts';
import LiveMatch from './LiveMatch.tsx';
import { formatDateES } from '../../../../features/manager/utils/date.ts';
import { createEngineClient, type EngineClient } from './engineClient.ts';
import ChooseClub from './ChooseClub.tsx';
import {
    Dashboard, FixturesBoard, SeasonClosedCard, SquadBoard, TableBoard, TacticsBoard, type ClosedSeason,
} from './Boards.tsx';
import { ClubShield, seasonLabel } from './Shared.tsx';
import styles from './manager.module.css';

type Tab = 'inicio' | 'plantel' | 'tactica' | 'calendario' | 'tabla';

const TABS: { id: Tab; label: string }[] = [
    { id: 'inicio', label: 'Inicio' },
    { id: 'plantel', label: 'Plantel' },
    { id: 'tactica', label: 'Táctica' },
    { id: 'calendario', label: 'Calendario' },
    { id: 'tabla', label: 'Tabla' },
];

const TIP_KEY = 'g22-rugby-manager-tip';

/** Íconos de la navegación: trazo simple, heredan el color del texto. */
function TabIcon({ id }: { id: Tab }) {
    const paths: Record<Tab, string> = {
        inicio: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
        plantel: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21c0-4 3.6-6 8-6s8 2 8 6',
        tactica: 'M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M8 16v4',
        calendario: 'M4 7h16v13H4zM4 11h16M8 3v4M16 3v4',
        tabla: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    };
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={paths[id]} />
        </svg>
    );
}

/**
 * La semilla del mundo se sortea ACÁ, antes de crear la partida, y desde ese
 * momento todo el azar sale del flujo sembrado del motor. Es el único lugar de
 * este juego que toca el azar del entorno.
 */
function newSeed(): number {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0];
}

/**
 * El aviso de espera, con su barra. El progreso vive ACÁ y no en `ManagerFlow`: el motor avisa
 * decenas de veces por operación y, si el estado estuviera arriba, cada aviso redibujaría la
 * pantalla entera (la lista de clubes incluida) y trabaría el hilo de la pantalla justo mientras
 * el motor, en su worker, hace el trabajo pesado.
 */
function BusyOverlay({ label, register }: { label: string; register: (set: (p: number | null) => void) => void }) {
    const [progress, setProgress] = useState<number | null>(null);
    useEffect(() => {
        register((p) => setProgress((old) => (p === null ? null : Math.max(old ?? 0, p))));
        return () => register(() => {});
    }, [register]);
    return (
        <div className={styles.busy} role="status" aria-live="polite">
            <div className={styles.busyBox}>
                {label}
                {progress !== null && (
                    <div
                        className={styles.progress}
                        role="progressbar"
                        aria-label={label}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(progress * 100)}
                    >
                        <span className={styles.progressFill} style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                )}
            </div>
        </div>
    );
}

/** Lo que necesita la pantalla del partido en vivo (viene del motor ya armado). */
interface LiveState {
    setup: LiveMatchSetup;
    homeClub?: Club;
    awayClub?: Club;
}

export default function ManagerFlow() {
    const [boot, setBoot] = useState<'loading' | 'ready'>('loading');
    const [saved, setSaved] = useState<GameSummary | null>(null);
    const [outdated, setOutdated] = useState<string | null>(null);
    // La pantalla nunca tiene el mundo: el motor vive en un Web Worker y manda VISTAS.
    const [choose, setChoose] = useState<ChooseView | null>(null);
    const [play, setPlay] = useState<PlayView | null>(null);
    const [tab, setTab] = useState<Tab>('inicio');
    const [busy, setBusy] = useState<string | null>(null);
    const [closed, setClosed] = useState<ClosedSeason | null>(null);
    const [saveFailed, setSaveFailed] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmReset, setConfirmReset] = useState(false);
    const [live, setLive] = useState<LiveState | null>(null);
    // El aviso de "mejor en computadora" se cierra y no vuelve (solo se ve en pantallas chicas).
    const [tipDismissed, setTipDismissed] = useState(true);
    useEffect(() => {
        try {
            setTipDismissed(window.localStorage.getItem(TIP_KEY) === '1');
        } catch {
            setTipDismissed(false);
        }
    }, []);
    const dismissTip = () => {
        setTipDismissed(true);
        try {
            window.localStorage.setItem(TIP_KEY, '1');
        } catch {
            // Sin localStorage: el aviso vuelve la próxima vez, no pasa nada.
        }
    };

    const engineRef = useRef<EngineClient | null>(null);
    const busyRef = useRef(false);
    // Cómo le avisamos el progreso al aviso de espera (sin pasar por el estado de esta pantalla).
    const overlayProgress = useRef<(p: number | null) => void>(() => {});
    const registerOverlay = useCallback((set: (p: number | null) => void) => {
        overlayProgress.current = set;
    }, []);

    // ── El motor y el menú ──
    // Se crea el motor (el worker) y se le pide el resumen del guardado: el menú sale de ahí, sin
    // esperar los 25 MB. Mientras se mira el menú, el motor va trayendo la partida completa.
    useEffect(() => {
        const engine = createEngineClient();
        engineRef.current = engine;
        engine.onSaved((ok) => setSaveFailed(!ok));
        let cancelled = false;
        engine.call('summary').then((result) => {
            if (cancelled) return;
            if (result.kind === 'ok') setSaved(result.summary);
            if (result.kind === 'outdated') setOutdated(result.reason);
            setBoot('ready');
        });
        // Al irse de la página, el motor guarda lo último sin esperar su respiro.
        const flush = () => void engine.call('flush').catch(() => {});
        window.addEventListener('pagehide', flush);
        return () => {
            cancelled = true;
            window.removeEventListener('pagehide', flush);
            engine.dispose();
            engineRef.current = null;
        };
    }, []);

    /** Un comando al motor. */
    const call: EngineClient['call'] = useCallback((type, input, onProgress) => {
        const engine = engineRef.current;
        if (!engine) return Promise.reject(new Error('El motor todavía no arrancó.'));
        return engine.call(type, input, onProgress);
    }, []);

    /**
     * Trabajo largo del motor con barra de progreso: la pantalla sigue viva (el motor está en otro
     * hilo) y muestra cuánto falta. `work` recibe `report(0..1)`; el avance nunca retrocede.
     */
    const runAsync = useCallback((label: string, work: (report: (p: number) => void) => Promise<void>) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(label);
        overlayProgress.current(null);
        setError(null);
        window.setTimeout(async () => {
            try {
                await work((p) => overlayProgress.current(p));
            } catch (e) {
                console.error(e);
                setError('Algo falló al simular. Probá de nuevo; si sigue, empezá una partida nueva.');
            } finally {
                busyRef.current = false;
                setBusy(null);
                overlayProgress.current(null);
            }
        }, 40);
    }, []);

    // ── Acciones ──
    const startNewWorld = () =>
        runAsync('Armando el mundo…', async () => {
            const view = await call('newWorld', { seed: newSeed() });
            setChoose(view);
            setPlay(null);
            setClosed(null);
            setConfirmReset(false);
            trackEvent('manager_new_world');
        });

    const start = (clubId: ID, name: string) =>
        runAsync('Armando tu plantel…', async (report) => {
            const next = await call('start', { clubId, name }, report);
            setPlay(next);
            setChoose(null);
            setTab('inicio');
            trackEvent('manager_start', { club: clubOf(next.game.world, clubId)?.name ?? clubId });
        });

    const playMatch = () =>
        runAsync('Jugando el partido…', async (report) => {
            setPlay(await call('play', {}, report));
        });

    const playLive = () =>
        runAsync('Preparando el partido…', async (report) => {
            const prepared = await call('prepareLive', {}, report);
            if (!prepared) {
                setError('No se pudo armar el partido. Probá simularlo.');
                return;
            }
            setPlay(prepared.play);
            setLive({ setup: prepared.setup, homeClub: prepared.homeClub, awayClub: prepared.awayClub });
            trackEvent('manager_match_live');
        });

    const confirmLive = (result: MatchResult, mySubs: SubLog, eventActors: Array<EventActors | undefined>) =>
        runAsync('Guardando el resultado…', async () => {
            setPlay(await call('finishLive', { result, mySubs, eventActors }));
            setLive(null);
            setTab('inicio');
        });

    const closeTheSeason = () =>
        runAsync('Cerrando la temporada…', async (report) => {
            const result = await call('closeSeason', {}, report);
            setPlay(result.play);
            setClosed(result.closed);
            trackEvent('manager_season_end', { position: result.closed.position, season: result.closed.previousYear });
        });

    /** La táctica se ve cambiar al instante; el motor se entera en paralelo. */
    const changePhilosophy = (axis: keyof TacticsPhilosophy, value: number) => {
        const clamped = Math.max(-3, Math.min(3, Math.round(value)));
        setPlay((current) => {
            const clubId = current?.game.managerClubId;
            const tactics = clubId ? current!.game.world.tactics[clubId] : undefined;
            if (!current || !clubId || !tactics) return current;
            const world = {
                ...current.game.world,
                tactics: { ...current.game.world.tactics, [clubId]: { ...tactics, philosophy: { ...tactics.philosophy, [axis]: clamped } } },
            };
            return { ...current, game: { ...current.game, world } };
        });
        void call('philosophy', { axis, value: clamped }).catch((e) => console.error(e));
    };

    const continueSaved = () =>
        runAsync('Cargando tu partida…', async () => {
            const result = await call('continue');
            if (result.kind === 'ok') {
                setPlay(result.play);
                trackEvent('manager_continue');
            } else {
                setSaved(null);
                setOutdated(result.reason);
            }
        });

    const resetAll = async () => {
        await call('reset').catch(() => {});
        setPlay(null);
        setChoose(null);
        setSaved(null);
        setOutdated(null);
        setClosed(null);
        setConfirmReset(false);
        setTab('inicio');
    };

    // ── Pantallas ──
    const game = play?.game ?? null;
    const view = play?.view ?? null;
    const clubId = game?.managerClubId ?? null;
    const club = game && clubId ? clubOf(game.world, clubId) : undefined;

    let body: React.ReactNode;
    if (boot === 'loading') {
        body = <p className={styles.muted} role="status">Buscando tu partida…</p>;
    } else if (!play && !choose) {
        body = (
            <section aria-labelledby="menu-title">
                <h2 id="menu-title" className={styles.srOnly}>Menú</h2>
                {outdated && (
                    <div className={styles.notice} role="alert">
                        {outdated} No se puede retomar: empezá una partida nueva.
                    </div>
                )}
                {saved && (
                    <div className={styles.card}>
                        <h3 className={styles.sectionTitle}>Tu partida guardada</h3>
                        <p className={styles.muted}>
                            {saved.clubName} · temporada {seasonLabel(saved.seasonYear)} · {formatDateES(saved.currentDate)}
                        </p>
                        <div className={styles.actions}>
                            <button
                                type="button"
                                className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLarge}`}
                                onClick={continueSaved}
                            >
                                Continuar la partida
                            </button>
                        </div>
                    </div>
                )}
                <div className={styles.actions}>
                    <button
                        type="button"
                        className={`${styles.btn} ${styles.btnLarge} ${saved ? '' : styles.btnPrimary}`}
                        onClick={startNewWorld}
                    >
                        Nueva partida
                    </button>
                </div>
                {saved && <p className={styles.hint}>Al elegir un club en una partida nueva se reemplaza la guardada.</p>}
            </section>
        );
    } else if (!play && choose) {
        body = <ChooseClub choose={choose} onStart={start} onBack={() => setChoose(null)} />;
    } else if (!game || !clubId || !club || !view || !play) {
        body = <p className={styles.muted} role="status">Armando la pantalla…</p>;
    } else if (live) {
        body = (
            <LiveMatch
                setup={live.setup}
                homeClub={live.homeClub}
                awayClub={live.awayClub}
                disabled={busy !== null}
                onConfirm={confirmLive}
                onLeave={() => setLive(null)}
            />
        );
    } else if (closed) {
        body = (
            <SeasonClosedCard
                closed={closed}
                newLabel={seasonLabel(game.world.seasonYear)}
                onContinue={() => {
                    setClosed(null);
                    setTab('inicio');
                }}
            />
        );
    } else {
        body = (
            <>
                <div className={styles.seasonBar}>
                    <ClubShield club={club} />
                    <div className={styles.headerMain}>
                        <div className={styles.headerClub}>{club.name}</div>
                        <div className={styles.headerMeta}>
                            {view.league?.name} · {seasonLabel(game.world.seasonYear)} · {formatDateES(game.world.currentDate)}
                        </div>
                    </div>
                    <div className={styles.stats}>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>{view.position > 0 ? `${view.position}°` : '–'}</span>
                            <span className={styles.statLabel}>Posición</span>
                        </div>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>{play.strength}</span>
                            <span className={styles.statLabel}>XV</span>
                        </div>
                    </div>
                </div>

                <div className={styles.layout}>
                <div className={styles.tabs} role="tablist" aria-label="Secciones del juego">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            id={`tab-${t.id}`}
                            aria-selected={tab === t.id}
                            aria-controls={`panel-${t.id}`}
                            className={styles.tab}
                            onClick={() => setTab(t.id)}
                        >
                            <TabIcon id={t.id} />
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className={styles.panel} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                    {tab === 'inicio' && (
                        <Dashboard
                            game={game}
                            view={view}
                            disabled={busy !== null}
                            onPlay={playMatch}
                            onPlayLive={playLive}
                            onCloseSeason={closeTheSeason}
                        />
                    )}
                    {tab === 'plantel' && <SquadBoard world={game.world} clubId={clubId} />}
                    {tab === 'tactica' && <TacticsBoard game={game} onChange={changePhilosophy} />}
                    {tab === 'calendario' && <FixturesBoard world={game.world} clubId={clubId} />}
                    {tab === 'tabla' && <TableBoard world={game.world} view={view} clubId={clubId} />}
                <div className={styles.actions}>
                    {confirmReset ? (
                        <>
                            <span className={styles.muted}>Se pierde esta partida. ¿Seguro?</span>
                            <button type="button" className={styles.btn} onClick={resetAll}>Sí, empezar de nuevo</button>
                            <button type="button" className={styles.btn} onClick={() => setConfirmReset(false)}>No</button>
                        </>
                    ) : (
                        <button type="button" className={styles.btn} onClick={() => setConfirmReset(true)}>
                            Empezar de nuevo
                        </button>
                    )}
                </div>
                </div>
                </div>
            </>
        );
    }

    const playing = !!play;

    return (
        <div className={styles.page}>
            <Link href="/juegos/minijuegos" className={styles.backLink}>← Minijuegos</Link>
            <div className={styles.stage}>
            <div>
                {!playing && <span className={styles.eyebrow}>Gestión de club</span>}
                <h1 className={playing ? styles.titleCompact : styles.title}>Rugby Manager</h1>
                {!play && !choose && boot === 'ready' && (
                    <p className={styles.lead}>
                        Dirigí un club en un mundo con más de 130 clubes y 8.000 jugadores. Armá el plantel, elegí cómo
                        juega tu equipo y llevalo temporada a temporada.
                    </p>
                )}
            </div>

            {!tipDismissed && (
                <div className={`${styles.notice} ${styles.desktopTip}`} role="note">
                    <span className={styles.noticeText}>
                        Rugby Manager rinde mejor en computadora: la cancha y las tablas se ven más grandes. En el celular
                        también se juega.
                    </span>
                    <button type="button" className={styles.noticeClose} aria-label="Cerrar el aviso" onClick={dismissTip}>
                        ×
                    </button>
                </div>
            )}
            {saveFailed && (
                <div className={styles.notice} role="status">
                    No pudimos guardar en este navegador (¿modo privado?). La partida sigue, pero se pierde al cerrar la pestaña.
                </div>
            )}
            {error && <div className={styles.notice} role="alert">{error}</div>}

            {body}

            {busy && <BusyOverlay label={busy} register={registerOverlay} />}
            </div>
        </div>
    );
}
