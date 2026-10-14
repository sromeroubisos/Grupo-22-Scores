'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { CaptainState, MomentOutcome } from '@/features/captain';
import type { MinigameGrade } from '@/features/captain/types/minigame';
import { MomentScreen } from './MomentScreens';
import { Shell } from './CaptainFlow';
import {
    GRADE_LABEL,
    GRADE_SCORE,
    TRAINING_GAMES,
    TRAINING_GROUPS,
    TRAINING_LEVELS,
    bookSummary,
    dailyGame,
    dailyStreak,
    dayKey,
    emptyBook,
    gradeAttempt,
    practiceResolve,
    practiceState,
    recordAttempt,
    type TrainingBook,
    type TrainingGame,
    type TrainingGroupId,
    type TrainingLevel,
} from './training';
import styles from './capitan.module.css';

/**
 * LA ZONA DE ENTRENAMIENTO.
 *
 * Tres pantallas en una ruta, como la sala de práctica de cualquier juego de
 * deportes: la LISTA (dificultad, desafío del día y los sesenta y cinco por
 * línea), el INTENTO (la misma pantalla de la carrera, con una barra arriba que
 * dice qué estás jugando) y el RESULTADO (la nota, el récord y «otra vez»).
 * Todo lo que importa entra en la pantalla del teléfono: la lista se parte por
 * pestañas de línea en vez de apilar sesenta y cinco filas.
 */

const BOOK_KEY = 'g22-el-capitan-entrenamiento';

function loadBook(): TrainingBook {
    try {
        const raw = window.localStorage.getItem(BOOK_KEY);
        if (!raw) return emptyBook();
        const parsed = JSON.parse(raw) as Partial<TrainingBook>;
        return { records: parsed.records ?? {}, daily: parsed.daily ?? {} };
    } catch {
        // Sin acceso a localStorage (modo privado, cuota): se entrena en memoria.
        return emptyBook();
    }
}

function saveBook(book: TrainingBook): void {
    try {
        window.localStorage.setItem(BOOK_KEY, JSON.stringify(book));
    } catch {
        // Sin acceso a localStorage: el récord vive mientras la pestaña esté abierta.
    }
}

/** Tres marcas: la mejor nota de ese minijuego. Vacías si nunca se jugó. */
function Pips({ best }: { best: number }) {
    return (
        <span className={styles.pips} role="img" aria-label={best < 0 ? 'Sin jugar' : `Mejor nota: ${best} de 3`}>
            {[1, 2, 3].map((n) => (
                <span key={n} className={`${styles.pip} ${best >= n ? styles.pipOn : ''}`} />
            ))}
        </span>
    );
}

type Attempt = {
    game: TrainingGame;
    level: TrainingLevel;
    daily: boolean;
    start: CaptainState;
    current: CaptainState;
};

type Outcome = { grade: MinigameGrade; text: string; newBest: boolean };

export default function TrainingZone() {
    const [book, setBook] = useState<TrainingBook>(emptyBook);
    const [hoy, setHoy] = useState<Date | null>(null);
    const [level, setLevel] = useState<TrainingLevel>('normal');
    const [group, setGroup] = useState<TrainingGroupId>('medios');
    const [intento, setIntento] = useState<Attempt | null>(null);
    const [resultado, setResultado] = useState<Outcome | null>(null);
    const intentos = useRef<Record<string, number>>({});

    // El libro y la fecha se leen en el cliente: en el servidor no hay
    // `localStorage` ni «hoy» del jugador, y pintarlos ahí desincroniza la
    // hidratación.
    useEffect(() => {
        setBook(loadBook());
        setHoy(new Date());
    }, []);

    const clave = hoy ? dayKey(hoy) : null;
    const delDia = useMemo(() => (clave ? dailyGame(clave) : null), [clave]);
    const resumen = bookSummary(book);
    const racha = hoy ? dailyStreak(book, hoy) : 0;
    const notaDelDia = clave ? book.daily[clave] ?? -1 : -1;

    const empezar = useCallback((game: TrainingGame, nivel: TrainingLevel, daily: boolean) => {
        const n = intentos.current[game.slot] ?? 0;
        intentos.current[game.slot] = n + 1;
        const start = practiceState(game, nivel, n);
        setResultado(null);
        setIntento({ game, level: nivel, daily, start, current: start });
        window.scrollTo({ top: 0 });
    }, []);

    const resolver = useCallback((outcome: MomentOutcome) => {
        if (!intento) return;
        const next = practiceResolve(intento.current, outcome);
        setIntento({ ...intento, current: next });
        if (next.phase === 'moment') return; // encadenó: el bunker se juega en la misma pantalla

        const grade = gradeAttempt(intento.game, intento.start, next);
        const texto = next.moments[next.moments.length - 1]?.text ?? '';
        const r = recordAttempt(book, intento.game.slot, grade, intento.daily && clave ? clave : null);
        saveBook(r.book);
        setBook(r.book);
        setResultado({ grade, text: texto, newBest: r.newBest });
    }, [book, clave, intento]);

    // ── EL INTENTO Y EL RESULTADO ───────────────────────────────────────────
    if (intento) {
        const nivel = TRAINING_LEVELS.find((l) => l.id === intento.level)!;
        const jugando = intento.current.phase === 'moment' && !resultado;
        return (
            <Shell>
                <h1 className={styles.srOnly}>El Capitán · Zona de entrenamiento</h1>
                <div className={styles.trainBar}>
                    <div className={styles.trainBarWho}>
                        <span className={styles.eyebrow}>
                            {intento.daily ? 'Desafío del día' : 'Entrenamiento'} · {nivel.label}
                        </span>
                        <h2 className={styles.trainBarTitle}>{intento.game.title}</h2>
                    </div>
                    <button type="button" className={styles.trainBarBack} onClick={() => setIntento(null)}>
                        Salir
                    </button>
                </div>

                {jugando ? (
                    <MomentScreen state={intento.current} onResolve={resolver} />
                ) : resultado ? (
                    <div className={styles.card}>
                        <div className={styles.trainVerdict} data-grade={resultado.grade}>
                            <Pips best={GRADE_SCORE[resultado.grade]} />
                            <h3 className={styles.trainVerdictTitle}>{GRADE_LABEL[resultado.grade].title}</h3>
                            <p className={styles.trainVerdictLine}>{GRADE_LABEL[resultado.grade].line}</p>
                            {resultado.newBest && <span className={styles.trainBest}>Nuevo récord</span>}
                        </div>
                        {resultado.text && <p className={styles.cardText}>{resultado.text}</p>}

                        <div className={styles.trainActions}>
                            <button
                                type="button"
                                className={styles.primary}
                                onClick={() => empezar(intento.game, intento.level, intento.daily)}
                            >
                                Otra vez
                            </button>
                            <button type="button" className={styles.ghost} onClick={() => setIntento(null)}>
                                Volver a la lista
                            </button>
                            <Link href="/juegos/minijuegos/el-capitan" className={styles.trainLink}>
                                A jugar en serio: tu carrera
                            </Link>
                        </div>
                    </div>
                ) : null}
            </Shell>
        );
    }

    // ── LA LISTA ────────────────────────────────────────────────────────────
    const juegos = TRAINING_GAMES.filter((g) => g.group === group);

    return (
        <Shell>
            <h1 className={styles.srOnly}>El Capitán · Zona de entrenamiento</h1>

            <div className={`${styles.card} ${styles.trainHero}`}>
                <span className={styles.eyebrow}>El Capitán</span>
                <h2 className={styles.cardTitle}>Zona de entrenamiento</h2>
                <p className={styles.cardText}>
                    Los {resumen.total} minijuegos de la carrera, para jugarlos cuando quieras. Son los mismos
                    que deciden una temporada: lo que aprendés acá lo usás allá.
                </p>
                <div className={styles.trainStats}>
                    <span><b>{resumen.clavados}</b> clavados</span>
                    <span><b>{resumen.jugados}</b> de {resumen.total} jugados</span>
                    <span><b>{racha}</b> {racha === 1 ? 'día' : 'días'} de racha</span>
                </div>
            </div>

            {/* LA DIFICULTAD ES EL JUGADOR: los atributos del puesto y la presión
                del minuto, que es lo mismo que usa la carrera. */}
            <div className={styles.trainLevels} role="radiogroup" aria-label="Dificultad">
                {TRAINING_LEVELS.map((l, i) => (
                    <button
                        key={l.id}
                        type="button"
                        role="radio"
                        aria-checked={level === l.id}
                        className={`${styles.trainLevel} ${level === l.id ? styles.trainLevelOn : ''}`}
                        onClick={() => setLevel(l.id)}
                    >
                        <span className={styles.trainLevelBars} aria-hidden="true">
                            {[0, 1, 2].map((b) => (
                                <span key={b} className={b <= i ? styles.trainLevelBarOn : ''} />
                            ))}
                        </span>
                        <span className={styles.trainLevelName}>{l.label}</span>
                        <span className={styles.trainLevelHint}>{l.hint}</span>
                    </button>
                ))}
            </div>

            {delDia && (
                <div className={`${styles.card} ${styles.trainDaily}`}>
                    <span className={styles.eyebrow}>Desafío del día · Difícil</span>
                    <div className={styles.trainDailyRow}>
                        <div>
                            <h2 className={styles.trainDailyTitle}>{delDia.title}</h2>
                            <p className={styles.trainDailyBrief}>{delDia.brief}</p>
                        </div>
                        <Pips best={notaDelDia} />
                    </div>
                    <button type="button" className={styles.primary} onClick={() => empezar(delDia, 'dificil', true)}>
                        {notaDelDia >= GRADE_SCORE.logrado ? 'Mejorar la nota' : 'Jugar el del día'}
                    </button>
                    <span className={styles.primaryHint}>
                        Bien jugado o mejor suma un día a la racha. Mañana hay otro.
                    </span>
                </div>
            )}

            <div className={styles.card}>
                <div className={styles.trainTabs} role="tablist" aria-label="Línea">
                    {TRAINING_GROUPS.map((g) => (
                        <button
                            key={g.id}
                            type="button"
                            role="tab"
                            aria-selected={group === g.id}
                            className={`${styles.trainTab} ${group === g.id ? styles.trainTabOn : ''}`}
                            onClick={() => setGroup(g.id)}
                        >
                            {g.label}
                        </button>
                    ))}
                </div>

                <ul className={styles.trainList} role="tabpanel">
                    {juegos.map((g) => (
                        <li key={g.slot}>
                            <button type="button" className={styles.trainItem} onClick={() => empezar(g, level, false)}>
                                <span className={styles.trainItemShirt} aria-label={g.shirt ? `Dorsal ${g.shirt}` : 'Para todos'}>
                                    {g.shirt ?? '★'}
                                </span>
                                <span className={styles.trainItemBody}>
                                    <span className={styles.trainItemTitle}>{g.title}</span>
                                    <span className={styles.trainItemBrief}>{g.brief}</span>
                                </span>
                                <Pips best={book.records[g.slot]?.best ?? -1} />
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            <Link href="/juegos/minijuegos/el-capitan" className={styles.trainLink}>
                Volver a El Capitán
            </Link>
        </Shell>
    );
}
