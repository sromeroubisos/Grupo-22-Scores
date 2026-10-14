import {
    BOARD_WEIGHTS,
    INITIAL_PRESSURE,
    boardWord,
    NACIONAL_ID,
    TDI_A_ID,
    competitionName,
    formatFor,
    formatMoney,
    getClub,
    getCompetition,
    tierAbove,
    tierBelow,
    type BoardReview,
    type CoachState,
    type KnockoutRun,
    type KnockoutStage,
    type KnockoutTie,
    type MatchResult,
    type SeasonStars,
} from '../../../../features/coach/index.ts';
import ClubCrest from './ClubCrest.tsx';
import PressureGauge from './PressureGauge.tsx';
import styles from './entrenador.module.css';

const TDI_LABEL: Record<Exclude<KnockoutRun, null>, string> = {
    octavos: 'Octavos del Interior',
    cuartos: 'Cuartos del Interior',
    semis: 'Semifinal del Interior',
    final: 'Final del Interior',
    campeon: 'Campeón del Interior',
};

const STAGE_LABEL: Record<KnockoutStage, string> = {
    octavos: 'Octavos',
    cuartos: 'Cuartos',
    semis: 'Semifinal',
    final: 'Final',
};

/** La tabla final del torneo, con la zona de playoff y la de descenso marcadas. */
function StandingsTable({ state }: { state: CoachState }) {
    const comp = getCompetition(state.competitionId);
    if (!comp) return null;

    // Las zonas salen del FORMATO del año que se jugó, no de una cuenta fija.
    const format = formatFor(comp.id, state.year);
    const titleRows = format.title.kind === 'playoff' ? format.title.size : 0;
    const promo = tierAbove(comp.id) ? format.promotion : null;
    const directRows = promo ? (promo.champion && format.title.kind === 'table' ? 1 : 0) + promo.direct : 0;
    const reducido = promo?.reducido ?? null;
    const relegation = tierBelow(comp.id) ? (format.relegation?.direct ?? 0) : 0;
    const relegationFrom = state.lastTable.length - relegation;
    const zoneOf = (pos: number): string => {
        if (relegation > 0 && pos > relegationFrom) return styles.zoneRelegation;
        if (directRows > 0 && pos <= directRows) return styles.zoneAscenso;
        if (titleRows > 0 && pos <= titleRows) return styles.zonePlayoff;
        if (reducido && pos >= reducido.from && pos <= reducido.to) return styles.zoneReducido;
        return '';
    };

    return (
        <>
            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <caption className={styles.srOnly}>
                        Tabla de posiciones de {competitionName(state.competitionId)}
                    </caption>
                    <thead>
                        <tr>
                            <th scope="col">#</th>
                            <th scope="col">Club</th>
                            <th scope="col">PJ</th>
                            <th scope="col">G</th>
                            <th scope="col">E</th>
                            <th scope="col">P</th>
                            <th scope="col">+/−</th>
                            <th scope="col">B</th>
                            <th scope="col">Pts</th>
                        </tr>
                    </thead>
                    <tbody>
                        {state.lastTable.map((row, i) => {
                            const club = getClub(row.clubId);
                            const pos = i + 1;
                            const zone = zoneOf(pos);
                            const diff = row.pf - row.pc;
                            return (
                                <tr
                                    key={row.clubId}
                                    className={row.clubId === state.clubId ? styles.myRow : ''}
                                >
                                    <td className={zone}>{pos}</td>
                                    <td>
                                        <span className={styles.teamCell}>
                                            {club && <ClubCrest club={club} small />}
                                            <span className={styles.teamName}>{club?.short ?? row.clubId}</span>
                                        </span>
                                    </td>
                                    <td>{row.played}</td>
                                    <td>{row.won}</td>
                                    <td>{row.drawn}</td>
                                    <td>{row.lost}</td>
                                    <td>{diff > 0 ? `+${diff}` : diff}</td>
                                    <td>{row.bonusOf + row.bonusDef}</td>
                                    <td className={styles.ptsCell}>{row.points}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className={styles.legend}>
                {directRows > 0 && (
                    <span>
                        <span className={styles.legendDot} style={{ background: '#2563eb' }} />
                        {format.title.kind === 'table' && promo?.champion ? 'Campeón: ascenso directo' : 'Ascenso directo'}
                    </span>
                )}
                {titleRows > 0 && (
                    <span>
                        <span className={styles.legendDot} style={{ background: '#16a34a' }} />
                        Playoff por el título
                    </span>
                )}
                {reducido && (
                    <span>
                        <span className={styles.legendDot} style={{ background: '#b45309' }} />
                        Reducido por el ascenso
                    </span>
                )}
                {relegation > 0 && (
                    <span>
                        <span className={styles.legendDot} style={{ background: '#dc2626' }} />
                        Descenso
                    </span>
                )}
                <span>B: puntos bonus (cuatro tries, o perder por siete o menos)</span>
            </p>
        </>
    );
}

interface MyMatch {
    match: MatchResult;
    home: boolean;
    pf: number;
    pc: number;
    result: 'G' | 'E' | 'P';
    rivalId: string;
}

function myMatches(state: CoachState): MyMatch[] {
    return state.lastMatches
        .filter((m) => m.homeId === state.clubId || m.awayId === state.clubId)
        .sort((a, b) => a.round - b.round)
        .map((m) => {
            const home = m.homeId === state.clubId;
            const pf = home ? m.homePf : m.awayPf;
            const pc = home ? m.awayPf : m.homePf;
            return {
                match: m,
                home,
                pf,
                pc,
                result: pf > pc ? 'G' : pf < pc ? 'P' : 'E',
                rivalId: home ? m.awayId : m.homeId,
            };
        });
}

const RESULT_CLASS = { G: styles.pillWin, E: styles.pillDraw, P: styles.pillLoss } as const;

/** La racha, fecha a fecha, como se lee en el pizarrón del club. */
function FormStrip({ matches }: { matches: MyMatch[] }) {
    return (
        <div className={styles.formStrip} aria-label="Resultados fecha a fecha">
            {matches.map((m) => {
                const rival = getClub(m.rivalId);
                return (
                    <span
                        key={`${m.match.round}-${m.rivalId}`}
                        className={`${styles.pill} ${RESULT_CLASS[m.result]}`}
                        title={`Fecha ${m.match.round}: ${m.pf}-${m.pc} vs ${rival?.short ?? m.rivalId}${m.home ? ' (local)' : ' (visita)'}`}
                    >
                        {m.result}
                    </span>
                );
            })}
        </div>
    );
}

function MatchList({ matches }: { matches: MyMatch[] }) {
    return (
        <ol className={styles.matchList}>
            {matches.map((m) => {
                const rival = getClub(m.rivalId);
                return (
                    <li key={`${m.match.round}-${m.rivalId}`} className={styles.matchRow}>
                        <span className={styles.matchRound}>F{m.match.round}</span>
                        <span className={`${styles.pill} ${RESULT_CLASS[m.result]}`}>{m.result}</span>
                        <span className={styles.matchScore}>
                            {m.pf}–{m.pc}
                        </span>
                        <span className={styles.matchRival}>
                            {rival && <ClubCrest club={rival} small />}
                            <span className={styles.teamName}>{rival?.short ?? m.rivalId}</span>
                            <span className={styles.matchVenue}>{m.home ? 'local' : 'visita'}</span>
                        </span>
                        {m.match.note && <span className={styles.matchNote}>{m.match.note}</span>}
                    </li>
                );
            })}
        </ol>
    );
}

/** Qué llaves jugó la división este año, según su formato. */
function bracketLabel(state: CoachState): string {
    const format = formatFor(state.competitionId, state.year);
    const title = format.title.kind === 'playoff';
    const reducido = !!format.promotion?.reducido && !!tierAbove(state.competitionId);
    if (title && reducido) return 'playoff y reducido';
    if (reducido) return 'reducido por el ascenso';
    return 'playoff por el título';
}

/** Las llaves: el playoff del torneo, el reducido, el Interior y el Nacional. */
function Knockouts({ state }: { state: CoachState }) {
    const groups = new Map<string, KnockoutTie[]>();
    for (const tie of state.lastKnockout) {
        groups.set(tie.competitionId, [...(groups.get(tie.competitionId) ?? []), tie]);
    }
    if (groups.size === 0) return null;

    const order = [state.competitionId, TDI_A_ID, NACIONAL_ID];
    const keys = [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));

    return (
        <div className={styles.ties}>
            {keys.map((compId) => {
                const ties = groups.get(compId) ?? [];
                const mine = ties.some((t) => t.homeId === state.clubId || t.awayId === state.clubId);
                return (
                    <details key={compId} className={styles.details} open={mine}>
                        <summary className={styles.summary}>
                            {competitionName(compId)}
                            {compId === state.competitionId ? ` · ${bracketLabel(state)}` : ''}
                            <span className={styles.summaryHint}>
                                {mine ? 'con tu club adentro' : `${ties.length} cruces`}
                            </span>
                        </summary>
                        <ol className={styles.tieList}>
                            {ties.map((t, i) => {
                                const home = getClub(t.homeId);
                                const away = getClub(t.awayId);
                                const involved = t.homeId === state.clubId || t.awayId === state.clubId;
                                const homeWon = t.homePf > t.awayPf;
                                return (
                                    <li key={i} className={`${styles.tie} ${involved ? styles.tieMine : ''}`}>
                                        <span className={styles.tieStage}>{STAGE_LABEL[t.stage]}</span>
                                        <span className={`${styles.tieSide} ${homeWon ? styles.tieWinner : ''}`}>
                                            {home && <ClubCrest club={home} small />}
                                            <span className={styles.teamName}>{home?.short ?? t.homeId}</span>
                                        </span>
                                        <span className={styles.tieScore}>
                                            {t.homePf}–{t.awayPf}
                                        </span>
                                        <span className={`${styles.tieSide} ${!homeWon ? styles.tieWinner : ''}`}>
                                            <span className={styles.teamName}>{away?.short ?? t.awayId}</span>
                                            {away && <ClubCrest club={away} small />}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </details>
                );
            })}
        </div>
    );
}

/** El cierre de la temporada: qué dijo la subcomisión y cómo quedó la tabla. */
/**
 * La evaluación de la subcomisión en tres ejes, con sus pesos a la vista. Sale
 * de la temporada CONGELADA: es lo que te dijeron ese año.
 */
const AXIS_LABEL = {
    deportivo: 'Deportivo',
    secundario: 'Secundario',
    formativo: 'Formativo',
    economico: 'Económico',
} as const;

const DEBT_WORD = {
    sana: 'sana',
    ajustada: 'ajustada',
    complicada: 'complicada',
    grave: 'grave',
    cronica: 'crónica',
} as const;

function BoardPanel({ board }: { board: BoardReview }) {
    const rows: { label: string; weight: number; value: number }[] = [
        { label: 'Deportivo', weight: BOARD_WEIGHTS.deportivo, value: board.deportivo },
        { label: 'Caja', weight: BOARD_WEIGHTS.caja, value: board.caja },
        { label: 'Cantera', weight: BOARD_WEIGHTS.cantera, value: board.cantera },
    ];
    return (
        <div className={styles.boardPanel}>
            <div className={styles.boardHead}>
                <span className={styles.boardTitle}>La subcomisión</span>
                <span className={styles.boardNota}>
                    {board.nota}
                    <span className={styles.boardNotaOf}>/100 · {boardWord(board.nota)}</span>
                </span>
            </div>
            <ul className={styles.boardBars}>
                {rows.map((r) => (
                    <li key={r.label} className={styles.boardBar}>
                        <span className={styles.boardBarLabel}>
                            {r.label} <span className={styles.boardBarWeight}>{r.weight}%</span>
                        </span>
                        <span className={styles.attrBarTrack} aria-hidden="true">
                            <span
                                className={`${styles.attrBarFill} ${r.value < 50 ? styles.boardFillLow : ''}`}
                                style={{ width: `${r.value}%` }}
                            />
                        </span>
                        <span className={styles.boardBarValue}>{r.value}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Las cuatro distinciones del año. Se leen del cierre congelado, no del plantel de hoy. */
const STAR_ROWS: { key: keyof SeasonStars; label: string; unit: (v: number) => string }[] = [
    { key: 'best', label: 'El mejor del año', unit: (v) => `nota ${v.toFixed(1).replace('.', ',')}` },
    { key: 'tries', label: 'Goleador de tries', unit: (v) => (v === 1 ? '1 try' : `${v} tries`) },
    { key: 'tackles', label: 'Más tackles', unit: (v) => `${v} tackles` },
    { key: 'apps', label: 'Más partidos', unit: (v) => (v === 1 ? '1 partido' : `${v} partidos`) },
];

/**
 * Los números de los jugadores en la fase regular: las cuatro distinciones del
 * año y la planilla de los que más jugaron. La planilla sale del plantel que
 * terminó la temporada; los que se fueron a mitad de año cuentan en las
 * distinciones (ya están congeladas en `entry.stars`).
 */
function PlayersPanel({ state, stars }: { state: CoachState; stars: SeasonStars }) {
    const rows = state.squad
        .filter((p) => p.stats.apps > 0)
        .sort((a, b) => b.stats.apps - a.stats.apps || b.stats.rating - a.stats.rating || a.id.localeCompare(b.id));
    const shown = STAR_ROWS.filter((r) => stars[r.key]);
    if (shown.length === 0 && rows.length === 0) return null;
    return (
        <section className={styles.panel}>
            <p className={styles.panelTitle}>Los nombres del año</p>
            {shown.length > 0 && (
                <ul className={styles.starList}>
                    {shown.map((r) => {
                        const star = stars[r.key];
                        if (!star) return null;
                        return (
                            <li key={r.key} className={`${styles.starItem} ${r.key === 'best' ? styles.starBest : ''}`}>
                                <span className={styles.ledgerLabel}>{r.label}</span>
                                <span className={styles.starName}>{star.name}</span>
                                <span className={styles.ledgerHint}>{r.unit(star.value)}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
            {rows.length > 0 && (
                <details className={styles.details}>
                    <summary className={styles.summary}>
                        La planilla del plantel
                        <span className={styles.summaryHint}>partidos, tries, puntos, tackles y nota</span>
                    </summary>
                    <div className={styles.statsTableWrap}>
                        <table className={styles.statsTable}>
                            <thead>
                                <tr>
                                    <th scope="col">Jugador</th>
                                    <th scope="col" title="Partidos (titular)">PJ</th>
                                    <th scope="col">Tries</th>
                                    <th scope="col">Pts</th>
                                    <th scope="col">Tackles</th>
                                    <th scope="col">Nota</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((p) => (
                                    <tr key={p.id}>
                                        <th scope="row">
                                            <span className={styles.statsNumber}>{p.number}</span> {p.name}
                                        </th>
                                        <td>
                                            {p.stats.apps}
                                            <span className={styles.ledgerSoft}> ({p.stats.starts})</span>
                                        </td>
                                        <td>{p.stats.tries}</td>
                                        <td>{p.stats.points}</td>
                                        <td>{p.stats.tackles}</td>
                                        <td>{p.stats.rating.toFixed(1).replace('.', ',')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </details>
            )}
        </section>
    );
}

export default function SeasonResult({
    state,
    onContinue,
}: {
    state: CoachState;
    onContinue: () => void;
}) {
    // El veredicto sale de la temporada congelada y no se recalcula: es lo que le
    // dijeron ese año, con la caja y la tabla de ese año.
    const entry = state.seasons[state.seasons.length - 1];
    if (!entry) return null;

    const previous = state.seasons[state.seasons.length - 2];
    const pressureBefore = previous && previous.clubId === entry.clubId ? previous.pressure : INITIAL_PRESSURE;
    const cajaBefore = previous && previous.clubId === entry.clubId ? previous.caja : null;
    const fired = state.pressure >= 100;
    const matches = myMatches(state);
    const good = entry.champion || entry.movement === 'ascenso' || entry.nacional || entry.tdi === 'campeon';
    const bad = fired || entry.movement === 'descenso' || (!entry.objectiveMet && !good);

    return (
        <>
            <section className={`${styles.panel} ${styles.hero} ${good ? styles.heroGood : bad ? styles.heroBad : ''}`}>
                <p className={styles.panelTitle}>
                    Temporada {entry.year} · {entry.competitionName}
                </p>
                <p className={styles.heroPosition}>
                    {entry.position}°<span className={styles.heroOf}> de {entry.teams}</span>
                </p>
                <p className={styles.verdict}>{entry.verdict}</p>

                <div className={styles.badges}>
                    <span
                        className={
                            entry.objectiveMet
                                ? `${styles.badge} ${styles.badgeGood}`
                                : `${styles.badge} ${styles.badgeBad}`
                        }
                    >
                        {entry.objectiveMet ? 'Objetivo cumplido' : 'Objetivo no cumplido'}: {entry.objectiveText}
                    </span>
                    {entry.champion && <span className={`${styles.badge} ${styles.badgeGood}`}>Campeón</span>}
                    {entry.movement === 'ascenso' && (
                        <span className={`${styles.badge} ${styles.badgeGood}`}>
                            {entry.promotedVia === 'campeon'
                                ? 'Ascenso directo como campeón'
                                : entry.promotedVia === 'reducido'
                                  ? 'Ascenso por el reducido'
                                  : entry.promotedVia === 'directo'
                                    ? 'Ascenso directo'
                                    : 'Ascenso'}
                        </span>
                    )}
                    {entry.movement === 'descenso' && (
                        <span className={`${styles.badge} ${styles.badgeBad}`}>Descenso</span>
                    )}
                    {entry.tdi && <span className={styles.badge}>{TDI_LABEL[entry.tdi]}</span>}
                    {entry.nacional && (
                        <span className={`${styles.badge} ${styles.badgeGood}`}>
                            Campeón del Nacional de Clubes
                        </span>
                    )}
                </div>

                <PressureGauge value={entry.pressure} previous={pressureBefore} />

                {entry.board && <BoardPanel board={entry.board} />}

                {entry.objectives && entry.objectives.length > 0 && (
                    <div className={styles.callout}>
                        <span className={styles.calloutTitle}>Objetivo por objetivo</span>
                        <ul className={styles.boardList} aria-label="Los objetivos de la temporada y cómo terminaron">
                            {entry.objectives.map((o) => (
                                <li
                                    key={o.id}
                                    className={`${styles.boardItem} ${o.axis === 'deportivo' ? styles.boardItemMain : ''}`}
                                >
                                    <span className={styles.boardItemHead}>
                                        <span className={styles.boardAxis}>{AXIS_LABEL[o.axis]}</span>
                                        <span className={o.met ? styles.objectiveMet : styles.objectiveMissed}>
                                            {o.met ? 'Cumplido' : 'No cumplido'} · {o.weight}%
                                        </span>
                                    </span>
                                    <span className={styles.boardText}>{o.text}</span>
                                    <span className={styles.objectiveDetail}>
                                        {o.detail} {o.consequence}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {entry.project && (
                            <span className={styles.calloutText}>
                                <strong>Proyecto:</strong> {entry.project.text}{' '}
                                {entry.project.status === 'activo'
                                    ? `Va ${Math.round(entry.project.progress * 100)} %.`
                                    : entry.project.consequence}
                            </span>
                        )}
                    </div>
                )}

                {entry.finance && entry.finance.measures.length > 0 && (
                    <div className={styles.callout} role="status">
                        <span className={styles.calloutTitle}>
                            La deuda: {DEBT_WORD[entry.finance.debt]} ({entry.finance.debtMonths} meses)
                        </span>
                        <span className={styles.calloutText}>{entry.finance.measures.join(' ')}</span>
                    </div>
                )}

                <div className={styles.ledger}>
                    <span className={styles.ledgerItem}>
                        <span className={styles.ledgerLabel}>Puntos</span>
                        <span className={styles.ledgerValue}>{entry.points}</span>
                        <span className={styles.ledgerHint}>
                            {entry.won}G · {entry.drawn}E · {entry.lost}P
                        </span>
                    </span>
                    <span className={styles.ledgerItem}>
                        <span className={styles.ledgerLabel}>Tantos</span>
                        <span className={styles.ledgerValue}>
                            {entry.pf}
                            <span className={styles.ledgerSoft}> / {entry.pc}</span>
                        </span>
                        <span className={styles.ledgerHint}>a favor / en contra</span>
                    </span>
                    <span className={styles.ledgerItem}>
                        <span className={styles.ledgerLabel}>Caja al cerrar</span>
                        <span className={`${styles.ledgerValue} ${entry.caja < 0 ? styles.negative : ''}`}>
                            {formatMoney(entry.caja)}
                        </span>
                        <span className={styles.ledgerHint}>
                            {cajaBefore === null
                                ? 'el primer balance'
                                : `${entry.caja - cajaBefore >= 0 ? '+' : ''}${formatMoney(entry.caja - cajaBefore)} en el año`}
                        </span>
                    </span>
                </div>
            </section>

            {entry.stars && <PlayersPanel state={state} stars={entry.stars} />}

            {matches.length > 0 && (
                <section className={styles.panel}>
                    <p className={styles.panelTitle}>Fecha a fecha</p>
                    <FormStrip matches={matches} />
                    <details className={styles.details}>
                        <summary className={styles.summary}>
                            Ver los {matches.length} partidos
                            <span className={styles.summaryHint}>con tarjetas, lesiones y scrums simulados</span>
                        </summary>
                        <MatchList matches={matches} />
                    </details>
                </section>
            )}

            {/* Lo secundario se pliega: en el celular el cierre del año entra en una
                pantalla, y la tabla y las llaves están a un toque. */}
            {/* Si el club jugó una definición, se ve abierta: es lo que pasó este año. */}
            {state.lastKnockout.length > 0 && (
                <details
                    className={`${styles.panel} ${styles.fold}`}
                    open={state.lastKnockout.some((t) => t.homeId === state.clubId || t.awayId === state.clubId)}
                >
                    <summary className={styles.foldSummary}>
                        <span className={styles.panelTitle}>Playoff y copas</span>
                        <span className={styles.summaryHint}>playoff, reducido, Interior y Nacional</span>
                    </summary>
                    <Knockouts state={state} />
                </details>
            )}

            <details className={`${styles.panel} ${styles.fold}`}>
                <summary className={styles.foldSummary}>
                    <span className={styles.panelTitle}>Tabla final</span>
                    <span className={styles.summaryHint}>
                        {entry.position}° de {entry.teams} · {entry.points} puntos
                    </span>
                </summary>
                <StandingsTable state={state} />
            </details>

            <div className={styles.actionBar}>
                <button type="button" className={styles.primary} onClick={onContinue}>
                    {fired ? 'Ver qué pasó' : `Seguir a ${entry.year + 1}`}
                </button>
            </div>
        </>
    );
}
