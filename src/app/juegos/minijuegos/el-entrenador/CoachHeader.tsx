import type { CSSProperties } from 'react';
import {
    DECISIONS_PER_SEASON,
    TRAMOS,
    debtState,
    formatMoney,
    getClub,
    getCompetition,
    pressureBand,
    seasonFixture,
    teamRating,
    totalRounds,
    type CoachState,
} from '../../../../features/coach/index.ts';
import ClubCrest from './ClubCrest.tsx';
import styles from './entrenador.module.css';

const DEBT_SHORT = {
    sana: 'sana',
    ajustada: 'ajustada',
    complicada: 'complicada',
    grave: 'grave',
    cronica: 'intervenida',
} as const;

const DEBT_CLASS = {
    sana: styles.debtSana,
    ajustada: styles.debtAjustada,
    complicada: styles.debtComplicada,
    grave: styles.debtGrave,
    cronica: styles.debtGrave,
} as const;

const BAND_WORD = { tranquila: 'Tranquila', atenta: 'Atenta', caliente: 'Caliente', terminal: 'Terminal' } as const;

const BAND_CLASS = {
    tranquila: styles.pressureTranquila,
    atenta: styles.pressureAtenta,
    caliente: styles.pressureCaliente,
    terminal: styles.pressureTerminal,
} as const;

/**
 * La cabecera es un MARCADOR: una franja con el club y los tres números que un
 * entrenador mira todos los días —presión, caja, fuerza del XV— y el pedido de
 * la subcomisión en una línea. Mientras se decide, el avance de las tarjetas.
 *
 * Es compacta a propósito: en el celular lo que importa es la tarjeta de abajo,
 * y la cabecera tiene que entrar con ella en la misma pantalla.
 */
export default function CoachHeader({ state }: { state: CoachState }) {
    const club = getClub(state.clubId);
    if (!club) return null;

    const comp = getCompetition(state.competitionId);
    // El estado de la deuda sale del motor: meses y cierres seguidos en grave.
    const debt = debtState(state).status;
    const band = pressureBand(state.pressure);
    const rating = teamRating(state.squad);
    const mods = state.seasonMods.rating;

    const deciding = state.phase === 'decision' || state.phase === 'reveal';
    const ins = state.inSeason;
    const inTramo = !!ins && ins.tramo < TRAMOS && (deciding || state.phase === 'training' || state.phase === 'keymatch' || state.phase === 'tramo');
    // Las tarjetas se cuentan por tramo; una partida migrada a mitad de las cinco
    // de la pretemporada no tiene tramo y se cuentan sobre las cinco.
    const cards = ins ? (ins.cards[ins.tramo] ?? 1) : DECISIONS_PER_SEASON;
    const current = Math.max(1, Math.min(cards, cards - state.decisionsLeft + 1));
    const rounds = ins ? totalRounds(seasonFixture(state)) : 0;
    const STEP_TEXT: Record<string, string> = {
        decision: `Decisión ${current} de ${cards}`,
        reveal: `Decisión ${current} de ${cards}`,
        training: 'La semana de entrenamiento',
        keymatch: ins?.key?.firstHalf ? 'Partido clave: entretiempo' : 'Partido clave',
        tramo: 'Resumen del tramo',
    };

    return (
        <header className={styles.board} style={{ '--club': club.c1 } as CSSProperties}>
            <div className={styles.boardTop}>
                <ClubCrest club={club} eager small />
                <div className={styles.boardClub}>
                    <p className={styles.boardName}>{club.name}</p>
                    <p className={styles.boardMeta}>
                        {comp?.short ?? state.competitionId} · Temporada {state.season} · {state.year}
                    </p>
                </div>
            </div>

            <dl className={styles.boardStats}>
                <div className={styles.boardStat}>
                    <dt>Presión</dt>
                    <dd className={BAND_CLASS[band]}>
                        {Math.round(state.pressure)}
                        <span className={styles.boardSub}>{BAND_WORD[band]}</span>
                    </dd>
                    <span className={styles.boardMeter} aria-hidden="true">
                        <span className={`${styles.boardMeterFill} ${BAND_CLASS[band]}`} style={{ width: `${state.pressure}%` }} />
                    </span>
                </div>
                <div className={styles.boardStat}>
                    <dt>Caja</dt>
                    <dd className={state.club.finances.caja < 0 ? styles.negative : ''}>
                        {formatMoney(state.club.finances.caja)}
                        <span className={`${styles.boardSub} ${DEBT_CLASS[debt]}`}>{DEBT_SHORT[debt]}</span>
                    </dd>
                </div>
                <div className={styles.boardStat}>
                    <dt>Fuerza XV</dt>
                    <dd>
                        {rating.toFixed(1)}
                        <span className={styles.boardSub}>
                            {mods !== 0 ? `${mods > 0 ? '+' : ''}${mods.toFixed(1)} este año` : `grupo ${Math.round(state.club.cohesion)}`}
                        </span>
                    </dd>
                </div>
            </dl>

            {/* Al cierre del año el pedido ya está en el veredicto: no se repite. */}
            {state.phase !== 'season' && (
                <p className={styles.boardAsk}>
                    <span className={styles.boardAskLabel}>Te piden</span> {state.objective.text}
                </p>
            )}

            {inTramo && ins && (
                <div className={styles.boardProgress} aria-label={`Tramo ${ins.tramo + 1} de ${TRAMOS}: ${STEP_TEXT[state.phase]}`}>
                    <span className={styles.dots} aria-hidden="true">
                        {Array.from({ length: TRAMOS }, (_, i) => (
                            <span
                                key={i}
                                className={`${styles.dot} ${i < ins.tramo ? styles.dotDone : i === ins.tramo ? styles.dotNow : ''}`}
                            />
                        ))}
                    </span>
                    <span className={styles.progressText}>
                        Tramo {ins.tramo + 1} de {TRAMOS} · {STEP_TEXT[state.phase]}
                    </span>
                    <span className={styles.progressHint}>
                        {ins.round > 0 ? `fecha ${ins.round} de ${rounds}` : `${rounds} fechas en el año`}
                    </span>
                </div>
            )}
            {deciding && !ins && (
                <div className={styles.boardProgress} aria-label={`Decisión ${current} de ${DECISIONS_PER_SEASON}`}>
                    <span className={styles.progressText}>
                        Decisión {current} de {DECISIONS_PER_SEASON}
                    </span>
                    <span className={styles.progressHint}>después se juega en tramos</span>
                </div>
            )}
        </header>
    );
}
