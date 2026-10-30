'use client';

import type { ID, Match, Player, World } from '../../../../features/manager/types/index.ts';
import { PHILOSOPHY_LABELS, POSITION_SHORT, type TacticsPhilosophy } from '../../../../features/manager/types/index.ts';
import { pickStartingXV } from '../../../../features/manager/engine/teamRating.ts';
import type { RolloverReport } from '../../../../features/manager/engine/seasonRollover.ts';
import type { ManagerGame, SeasonView } from '../../../../features/manager/game/game.ts';
import { clubOf, fixturesOf, overallOf, squadOf, tacticsOf } from '../../../../features/manager/game/queries.ts';
import { ageFromDOB, formatDateES } from '../../../../features/manager/utils/date.ts';
import { ClubShield, clubName, shortPlayerName } from './Shared.tsx';
import styles from './manager.module.css';

// ─── Partido ────────────────────────────────────────────────────────────────

type Verdict = 'Victoria' | 'Empate' | 'Derrota';

/** El resultado visto desde el club del entrenador. */
function outcomeFor(match: Match, clubId: ID): { mine: number; theirs: number; verdict: Verdict } | null {
    const r = match.result;
    if (!match.played || !r) return null;
    const home = match.homeClubId === clubId;
    const mine = home ? r.homeScore : r.awayScore;
    const theirs = home ? r.awayScore : r.homeScore;
    return { mine, theirs, verdict: mine > theirs ? 'Victoria' : mine < theirs ? 'Derrota' : 'Empate' };
}

function tally(ids: ID[] | undefined, players: Map<ID, Player>): string[] {
    const counts = new Map<ID, number>();
    for (const id of ids ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts.entries()].map(([id, n]) => {
        const p = players.get(id);
        return `${p ? shortPlayerName(p) : 'Jugador retirado'}${n > 1 ? ` (${n})` : ''}`;
    });
}

function MatchReport({ world, match }: { world: World; match: Match }) {
    const r = match.result;
    if (!r) return null;
    const players = new Map(world.players.map((p) => [p.id, p]));
    const homeScorers = tally(r.homeTryScorers, players);
    const awayScorers = tally(r.awayTryScorers, players);
    const best = [...(r.playerStats ?? [])].sort((a, b) => b.rating - a.rating).slice(0, 3);

    return (
        <details className={styles.details}>
            <summary>Ver el detalle del partido</summary>
            <div className={styles.kv} aria-label="Resumen del partido">
                <span>{r.homeTries}</span><span>Tries</span><span>{r.awayTries}</span>
                <span>{r.homeConversions}</span><span>Conversiones</span><span>{r.awayConversions}</span>
                <span>{r.homePenalties}</span><span>Penales</span><span>{r.awayPenalties}</span>
                <span>{r.homeDrops}</span><span>Drops</span><span>{r.awayDrops}</span>
            </div>
            {(homeScorers.length > 0 || awayScorers.length > 0) && (
                <p className={styles.muted}>
                    Tries: {[...homeScorers, ...awayScorers].join(', ')}
                </p>
            )}
            {best.length > 0 && (
                <>
                    <p className={styles.fieldLabel}>Los mejores del partido</p>
                    <ul className={styles.list}>
                        {best.map((s) => {
                            const p = players.get(s.playerId);
                            return (
                                <li key={s.playerId}>
                                    {p ? shortPlayerName(p) : 'Jugador retirado'} · {s.rating.toFixed(1)}
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </details>
    );
}

function FixtureLine({ world, match }: { world: World; match: Match }) {
    const home = clubOf(world, match.homeClubId);
    const away = clubOf(world, match.awayClubId);
    return (
        <div className={styles.fixture}>
            <span className={styles.side}>
                {home && <ClubShield club={home} />}
                {home?.name}
            </span>
            {match.result ? (
                <span className={styles.score}>{match.result.homeScore} – {match.result.awayScore}</span>
            ) : (
                <span className={styles.vs}>vs</span>
            )}
            <span className={`${styles.side} ${styles.sideAway}`}>
                {away && <ClubShield club={away} />}
                {away?.name}
            </span>
        </div>
    );
}

// ─── Inicio ─────────────────────────────────────────────────────────────────

interface DashboardProps {
    game: ManagerGame;
    view: SeasonView;
    disabled: boolean;
    onPlay: () => void;
    onPlayLive: () => void;
    onCloseSeason: () => void;
}

export function Dashboard({ game, view, disabled, onPlay, onPlayLive, onCloseSeason }: DashboardProps) {
    const { world, managerClubId } = game;
    if (!managerClubId) return null;
    const { nextMatch, lastMatch } = view;
    const competition = nextMatch ? world.competitions.find((c) => c.id === nextMatch.competitionId) : undefined;
    const last = lastMatch ? outcomeFor(lastMatch, managerClubId) : null;
    const home = nextMatch ? clubOf(world, nextMatch.homeClubId) : undefined;
    const away = nextMatch ? clubOf(world, nextMatch.awayClubId) : undefined;

    return (
        <>
            {nextMatch && home && away ? (
                <section
                    className={styles.hero}
                    style={{ '--home': home.primaryColor, '--away': away.primaryColor } as React.CSSProperties}
                    aria-labelledby="next-title"
                >
                    <div className={styles.heroInner}>
                        <span className={styles.heroChip} id="next-title">
                            Día de partido · {competition?.shortName ?? 'Partido'} · fecha {nextMatch.round}
                        </span>
                        <div className={styles.heroTeams}>
                            <div className={styles.heroTeam}>
                                <ClubShield club={home} large />
                                <span className={styles.heroTeamName}>{home.name}</span>
                            </div>
                            <span className={styles.heroVs}>VS</span>
                            <div className={styles.heroTeam}>
                                <ClubShield club={away} large />
                                <span className={styles.heroTeamName}>{away.name}</span>
                            </div>
                        </div>
                        <p className={styles.heroMeta}>
                            {formatDateES(nextMatch.date)} · {nextMatch.homeClubId === managerClubId ? 'de local' : 'de visitante'}
                        </p>
                        <div className={styles.heroActions}>
                            <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLarge}`} disabled={disabled} onClick={onPlayLive}>
                                Jugar en vivo
                            </button>
                            <button type="button" className={`${styles.btn} ${styles.btnLarge}`} disabled={disabled} onClick={onPlay}>
                                Simular
                            </button>
                        </div>
                        <p className={styles.heroHint}>
                            En vivo ves la cancha, decidís los penales y hacés los cambios. Si no decidís nada, da el mismo resultado que simular.
                        </p>
                    </div>
                </section>
            ) : (
                <section className={styles.card} aria-labelledby="next-title">
                    <h2 id="next-title" className={styles.sectionTitle}>Temporada terminada</h2>
                    <p className={styles.lead}>
                        Cerraste {view.position}° en {view.league?.name ?? 'la liga'}. Cuando cierres la temporada se
                        retiran los veteranos, entran los juveniles y se renuevan los contratos.
                    </p>
                    <div className={styles.actions}>
                        <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLarge}`} disabled={disabled} onClick={onCloseSeason}>
                            Cerrar la temporada
                        </button>
                    </div>
                </section>
            )}

            <section className={styles.card} aria-labelledby="last-title">
                <h2 id="last-title" className={styles.sectionTitle}>Último partido</h2>
                {lastMatch && last ? (
                    <>
                        <FixtureLine world={world} match={lastMatch} />
                        <span
                            className={`${styles.verdict} ${last.verdict === 'Victoria' ? styles.verdictWin : last.verdict === 'Derrota' ? styles.verdictLoss : ''}`}
                        >
                            {last.verdict}
                        </span>
                        <MatchReport world={world} match={lastMatch} />
                    </>
                ) : (
                    <p className={styles.muted}>Todavía no jugaste. El primer partido define el clima de la temporada.</p>
                )}
            </section>
        </>
    );
}

// ─── Plantel ────────────────────────────────────────────────────────────────

function SquadTable({ world, rows, caption }: { world: World; rows: Player[]; caption: string }) {
    return (
        <div className={styles.tableWrap}>
            <table className={styles.table}>
                <caption className={styles.srOnly}>{caption}</caption>
                <thead>
                    <tr>
                        <th scope="col">Pos</th>
                        <th scope="col">Jugador</th>
                        <th scope="col">Edad</th>
                        <th scope="col">Valoración</th>
                        <th scope="col">Estado</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((p) => (
                        <tr key={p.id}>
                            <td>{POSITION_SHORT[p.primaryPosition]}</td>
                            <td>{p.firstName} {p.lastName}</td>
                            <td>{ageFromDOB(p.dateOfBirth, world.currentDate)}</td>
                            <td><span className={`${styles.ovr} ${overallOf(p) >= 80 ? styles.ovrHigh : overallOf(p) >= 70 ? styles.ovrMid : ''}`}>{overallOf(p)}</span></td>
                            <td>{p.injury ? `Lesionado · ${p.injury.weeksOut} sem` : 'Disponible'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function SquadBoard({ world, clubId }: { world: World; clubId: ID }) {
    const squad = squadOf(world, clubId);
    const xv = pickStartingXV(squad);
    const xvIds = new Set(xv.map((p) => p.id));
    const rest = squad.filter((p) => !xvIds.has(p.id)).sort((a, b) => overallOf(b) - overallOf(a));

    return (
        <section aria-labelledby="squad-title">
            <h2 id="squad-title" className={styles.sectionTitle}>XV titular</h2>
            <SquadTable world={world} rows={xv} caption="XV titular, por puesto" />
            <h2 className={styles.sectionTitle}>Resto del plantel ({rest.length})</h2>
            <SquadTable world={world} rows={rest} caption="Resto del plantel, de mayor a menor valoración" />
        </section>
    );
}

// ─── Táctica ────────────────────────────────────────────────────────────────

const AXES = Object.keys(PHILOSOPHY_LABELS) as (keyof TacticsPhilosophy)[];

export function TacticsBoard({
    game, onChange,
}: { game: ManagerGame; onChange: (axis: keyof TacticsPhilosophy, value: number) => void }) {
    const clubId = game.managerClubId;
    const tactics = clubId ? tacticsOf(game.world, clubId) : undefined;
    if (!tactics) return <p className={styles.muted}>Tu club todavía no tiene una táctica definida.</p>;

    return (
        <section className={styles.card} aria-labelledby="tactics-title">
            <h2 id="tactics-title" className={styles.sectionTitle}>Cómo juega tu equipo</h2>
            <p className={styles.muted}>
                Cada eje va de −3 a +3. Los cambios se aplican desde el próximo partido. El equilibrio en 0 no tiene
                costo; correrse a un extremo tiene.
            </p>
            {AXES.map((axis) => {
                const label = PHILOSOPHY_LABELS[axis];
                const value = tactics.philosophy[axis];
                return (
                    <div key={axis} className={styles.axis}>
                        <div className={styles.axisHead}>
                            <label htmlFor={`axis-${axis}`}>{label.title}</label>
                            <span className={styles.axisValue}>{value > 0 ? `+${value}` : value}</span>
                        </div>
                        <input
                            id={`axis-${axis}`}
                            className={styles.range}
                            type="range"
                            min={-3}
                            max={3}
                            step={1}
                            value={value}
                            aria-valuetext={`${label.title}: ${value}, entre ${label.left} y ${label.right}`}
                            onChange={(e) => onChange(axis, Number(e.target.value))}
                        />
                        <div className={styles.axisEnds}>
                            <span>{label.left}</span>
                            <span>{label.right}</span>
                        </div>
                    </div>
                );
            })}
        </section>
    );
}

// ─── Calendario ─────────────────────────────────────────────────────────────

export function FixturesBoard({ world, clubId }: { world: World; clubId: ID }) {
    const fixtures = fixturesOf(world, clubId);
    if (fixtures.length === 0) return <p className={styles.muted}>No hay partidos agendados.</p>;
    return (
        <section className={styles.tableWrap} aria-label="Calendario de la temporada">
            {fixtures.map((m) => {
                const home = m.homeClubId === clubId;
                const rival = clubName(world, home ? m.awayClubId : m.homeClubId);
                const out = outcomeFor(m, clubId);
                return (
                    <div key={m.id} className={styles.fixtureRow}>
                        <span className={styles.fixtureDate}>{formatDateES(m.date)}</span>
                        <span>{home ? 'vs' : 'en'} {rival}</span>
                        <span className={styles.fixtureResult}>
                            {out ? `${out.verdict[0]} ${out.mine}–${out.theirs}` : 'Por jugar'}
                        </span>
                    </div>
                );
            })}
        </section>
    );
}

// ─── Tabla ──────────────────────────────────────────────────────────────────

export function TableBoard({ world, view, clubId }: { world: World; view: SeasonView; clubId: ID }) {
    if (view.standings.length === 0) return <p className={styles.muted}>La liga todavía no tiene tabla.</p>;
    return (
        <section aria-labelledby="table-title">
            <h2 id="table-title" className={styles.sectionTitle}>{view.league?.name}</h2>
            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <caption className={styles.srOnly}>Tabla de posiciones de {view.league?.name}</caption>
                    <thead>
                        <tr>
                            <th scope="col">#</th>
                            <th scope="col">Club</th>
                            <th scope="col">PJ</th>
                            <th scope="col">G</th>
                            <th scope="col">E</th>
                            <th scope="col">P</th>
                            <th scope="col">PF</th>
                            <th scope="col">PC</th>
                            <th scope="col">Dif</th>
                            <th scope="col">BO</th>
                            <th scope="col">BD</th>
                            <th scope="col">Pts</th>
                        </tr>
                    </thead>
                    <tbody>
                        {view.standings.map((row, i) => {
                            const club = clubOf(world, row.clubId);
                            return (
                                <tr key={row.clubId} className={row.clubId === clubId ? styles.mine : undefined}>
                                    <td>{i + 1}</td>
                                    <td>
                                        <span className={styles.nameCell}>
                                            {club && <ClubShield club={club} />}
                                            {club?.name ?? 'Club'}
                                        </span>
                                    </td>
                                    <td>{row.played}</td>
                                    <td>{row.wins}</td>
                                    <td>{row.draws}</td>
                                    <td>{row.losses}</td>
                                    <td>{row.pointsFor}</td>
                                    <td>{row.pointsAgainst}</td>
                                    <td>{row.pointsDiff > 0 ? `+${row.pointsDiff}` : row.pointsDiff}</td>
                                    <td>{row.bonusTry}</td>
                                    <td>{row.bonusLosing}</td>
                                    <td className={styles.ptsCell}>{row.totalPoints}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className={styles.muted}>BO: bonus ofensivo (4 tries). BD: bonus defensivo (perder por 7 o menos).</p>
        </section>
    );
}

// ─── Cierre de temporada ────────────────────────────────────────────────────

export interface ClosedSeason {
    report: RolloverReport;
    leagueName: string;
    position: number;
    previousYear: number;
}

export function SeasonClosedCard({ closed, newLabel, onContinue }: {
    closed: ClosedSeason; newLabel: string; onContinue: () => void;
}) {
    const { report } = closed;
    const own = report.champions.find((c) => c.competitionName === closed.leagueName);
    const others = report.champions.filter((c) => c !== own);

    return (
        <section className={styles.card} aria-labelledby="closed-title">
            <h2 id="closed-title" className={styles.sectionTitle}>Terminó la temporada</h2>
            <p className={styles.lead}>
                Cerraste {closed.position}° en {closed.leagueName}.
                {own && ` El campeón fue ${own.championClubName}.`}
            </p>
            <ul className={styles.list}>
                <li>{report.retiredCount} jugadores se retiraron en todo el mundo.</li>
                <li>{report.youthIntakeCount} juveniles entraron a los planteles.</li>
                <li>{report.contractsExpiredCount} contratos vencieron.</li>
            </ul>
            {others.length > 0 && (
                <details className={styles.details}>
                    <summary>Campeones de las demás competiciones ({others.length})</summary>
                    <ul className={styles.list}>
                        {others.map((c) => (
                            <li key={c.competitionId}>{c.competitionName}: {c.championClubName}</li>
                        ))}
                    </ul>
                </details>
            )}
            <div className={styles.actions}>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onContinue}>
                    Empezar la temporada {newLabel}
                </button>
            </div>
        </section>
    );
}
