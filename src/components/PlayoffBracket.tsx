import React from 'react';
import { Trophy, Medal } from 'lucide-react';
import styles from './PlayoffBracket.module.css';

interface PlayoffMatch {
    match_id: string | number;
    home_participant: {
        participant_id: string | number;
        participant_name: string;
        image_path?: string;
    } | null;
    home_team?: {
        id: string | number;
        name: string;
        logo?: string;
    };
    away_participant: {
        participant_id: string | number;
        participant_name: string;
        image_path?: string;
    } | null;
    away_team?: {
        id: string | number;
        name: string;
        logo?: string;
    };
    score_home?: string | number;
    score_away?: string | number;
    winner_id?: string | number;
    match_start_iso?: string;
    result?: string;
    status?: string;
    /**
     * De qué partido de la ronda anterior sale cada lado. Opcional: el cuadro
     * que lo trae en todas las rondas se dibuja como árbol con líneas; el que
     * no, en columnas sueltas como siempre.
     */
    home_source?: BracketSource | null;
    away_source?: BracketSource | null;
    /** Cruce del formato que todavía no se publicó ("Ganador ronda 1"). */
    placeholder?: boolean;
}

interface BracketSource {
    match_id: string | number | null;
    outcome: 'winner' | 'loser';
}

interface PlayoffRound {
    round_id: string | number;
    name: string;
    matches: PlayoffMatch[];
}

interface PlayoffBracketProps {
    data: PlayoffRound[];
    title?: string;
}

// La ronda por el tercer puesto llega con nombres distintos según la fuente:
// "3.º y 4.º puesto" (plantillas propias), "Tercer puesto", "3rd place" /
// "Third place" (FlashScore). El "3" se exige con borde no numérico para que
// "13.º puesto" no entre.
function isThirdPlaceRoundName(name: string): boolean {
    const n = name.toLowerCase();
    if (/third\s*place|3rd\s*place|bronze\s*final/.test(n)) return true;
    return /puesto/.test(n) && (/tercer/.test(n) || /(^|\D)3(\D|$)/.test(n));
}

// "Semifinal" y "Cuartos de final" también contienen "final": la columna héroe
// es solo la que EMPIEZA con Final (o Gran Final).
function looksLikeFinalRoundName(name: string): boolean {
    return /^\s*(gran\s+)?final\b/i.test(name);
}

// "Final por el 5.º puesto" es una final de ubicación, no LA final: define un
// puesto, no un campeón. Nada de dorado ni de tira de Campeón para esas. El
// puesto 1 sí es la final por el título ("Final por el 1.er puesto"). El punto
// y el ordinal van por separado: "5.º" son dos caracteres, y con uno solo
// "7.º puesto" se leía como final y se quedaba con la columna héroe.
function isPlacementRoundName(name: string): boolean {
    const n = name.toLowerCase();
    const m = n.match(/(\d+)\s*\.?\s*(?:º|°|o)?\s*(?:er|do|to|mo|vo|no)?\s*puesto|(\d+)(?:st|nd|rd|th)[-\s]*place/);
    if (!m) return false;
    const num = Number(m[1] ?? m[2]);
    return Number.isFinite(num) && num > 1;
}

type ParticipantView = {
    name: string;
    logo: string;
    score: string | number;
    pens: number | null;
    won: boolean;
    /** Cómo llegó al cruce cuando no fue ganando ("Mejor perdedor"). */
    note: string | null;
};

type MatchView = {
    key: string | number;
    dateLabel: string;
    statusLabel: string;
    hasPenalties: boolean;
    finished: boolean;
    placeholder: boolean;
    home: ParticipantView;
    away: ParticipantView;
};

// Un club que entró por la ventana del mejor perdedor lo dice en su fila: sin
// eso, el cuadro parece mostrar a un eliminado jugando la ronda siguiente.
function noteOf(source: BracketSource | null | undefined, placeholder: boolean): string | null {
    return !placeholder && source?.outcome === 'loser' ? 'Mejor perdedor' : null;
}

function toMatchView(match: PlayoffMatch, matchIdx: number): MatchView {
    // Robust data extraction: cada proveedor manda los mismos datos con otra forma.
    const m = match as any;
    const homeName = m.home_participant?.participant_name || m.home_team?.name || m.HOME_NAME || m.home_name || m.home?.name || 'TBD';
    const awayName = m.away_participant?.participant_name || m.away_team?.name || m.AWAY_NAME || m.away_name || m.away?.name || 'TBD';

    const matchDate = m.match_start_iso || m.start_time || m.date;
    const status = m.result || m.status || m.match_status?.status || (m.winner_id ? 'Final' : '');

    const isScheduled = status === 'scheduled' || status === 'NS' || status === 'Not Started';
    const rawHomeScore = m.score_home ?? m.scores?.home ?? m.HOME_SCORE ?? m.home_score ?? m.home_team?.score ?? null;
    const rawAwayScore = m.score_away ?? m.scores?.away ?? m.AWAY_SCORE ?? m.away_score ?? m.away_team?.score ?? null;
    const homeScore = isScheduled || rawHomeScore == null ? '-' : rawHomeScore;
    const awayScore = isScheduled || rawAwayScore == null ? '-' : rawAwayScore;

    // Penalty shootout (when the match was decided on penalties)
    const penaltiesRaw = m.scores?.penalties ?? m.score?.penalties ?? null;
    const penHome = penaltiesRaw?.home;
    const penAway = penaltiesRaw?.away;
    const hasPenalties = !isScheduled && typeof penHome === 'number' && typeof penAway === 'number';

    const homeLogo = m.home_participant?.image_path || m.home_team?.image_path || m.home_team?.small_image_path || m.home_team?.logo || '';
    const awayLogo = m.away_participant?.image_path || m.away_team?.image_path || m.away_team?.small_image_path || m.away_team?.logo || '';

    // Winner logic
    const isFinished = status === 'finished' || status === 'Final' || !!m.winner_id;
    // Penalty winner when regulation ended level
    const homePensWon = hasPenalties && Number(homeScore) === Number(awayScore) && Number(penHome) > Number(penAway);
    const awayPensWon = hasPenalties && Number(homeScore) === Number(awayScore) && Number(penAway) > Number(penHome);

    const homeWon = m.winner_id
        ? (m.home_participant && m.winner_id == m.home_participant.participant_id) || (m.home_team && m.winner_id == m.home_team.id)
        : m.winner === 'home' || homePensWon || (isFinished && homeScore !== '-' && awayScore !== '-' && Number(homeScore) > Number(awayScore));

    const awayWon = m.winner_id
        ? (m.away_participant && m.winner_id == m.away_participant.participant_id) || (m.away_team && m.winner_id == m.away_team.id)
        : m.winner === 'away' || awayPensWon || (isFinished && homeScore !== '-' && awayScore !== '-' && Number(awayScore) > Number(homeScore));

    // Un cruce sin publicar no tiene fecha ni marcador: se lee "Por definir" una
    // vez, arriba, y las filas quedan sin guiones.
    const placeholder = Boolean(m.placeholder);

    return {
        key: m.match_id || matchIdx,
        dateLabel: placeholder
            ? 'Por definir'
            : matchDate
                ? new Date(matchDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                : 'TBD',
        statusLabel: placeholder ? '' : status ? (status === 'finished' ? 'Final' : String(status)) : '',
        hasPenalties,
        finished: Boolean(isFinished),
        placeholder,
        home: {
            name: homeName,
            logo: homeLogo,
            score: placeholder ? '' : homeScore,
            pens: hasPenalties ? Number(penHome) : null,
            won: Boolean(homeWon),
            note: noteOf(m.home_source, placeholder),
        },
        away: {
            name: awayName,
            logo: awayLogo,
            score: placeholder ? '' : awayScore,
            pens: hasPenalties ? Number(penAway) : null,
            won: Boolean(awayWon),
            note: noteOf(m.away_source, placeholder),
        },
    };
}

function ParticipantRow({ side, hasPenalties }: { side: ParticipantView; hasPenalties: boolean }) {
    return (
        <div className={`${styles.participant} ${side.won ? styles.winner : ''}`}>
            <div className={styles.participantInfo}>
                {side.logo ? (
                    <img src={side.logo} alt="" className={styles.logo} />
                ) : (
                    <div className={`${styles.logo} ${styles.logoPlaceholder}`} />
                )}
                {side.note ? (
                    <span className={styles.nameStack}>
                        <span className={styles.name}>{side.name}</span>
                        <span className={styles.sourceNote}>{side.note}</span>
                    </span>
                ) : (
                    <span className={styles.name}>{side.name}</span>
                )}
            </div>
            <span className={styles.score}>
                {side.score}{hasPenalties ? <span className={styles.penaltyScore}> ({side.pens})</span> : null}
            </span>
        </div>
    );
}

function MatchCard({ view, variant, delayMs }: { view: MatchView; variant?: 'final' | 'third'; delayMs: number }) {
    const cardClass = [
        styles.matchCard,
        variant === 'final' ? styles.finalCard : '',
        variant === 'third' ? styles.thirdCard : '',
        view.placeholder ? styles.placeholderCard : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={cardClass} style={{ animationDelay: `${delayMs}ms` }}>
            <div className={styles.matchDate}>
                {view.dateLabel}
                {view.statusLabel && (
                    <span className={styles.matchStatus}>{view.statusLabel}</span>
                )}
            </div>
            <ParticipantRow side={view.home} hasPenalties={view.hasPenalties} />
            <ParticipantRow side={view.away} hasPenalties={view.hasPenalties} />
        </div>
    );
}

// ── Árbol ──────────────────────────────────────────────────────────────────
// Las filas de la grilla son los partidos de la primera ronda, todas de la
// misma altura (1fr). Cada cruce posterior ocupa las filas de los partidos que
// lo alimentan y se centra en ellas, así que su centro cae justo en el medio de
// sus orígenes: las líneas se dibujan en unidades de fila, sin medir el DOM.

type TreeSpan = { start: number; end: number };

type TreeNode = {
    view: MatchView;
    span: TreeSpan;
    /** Los partidos de la ronda anterior cuyo ganador llega acá. */
    feeders: { span: TreeSpan; decided: boolean }[];
};

type TreeRound = { key: string | number; name: string; nodes: TreeNode[] };

type ResolvedRound = { key: string | number; name: string; matches: PlayoffMatch[] };

const centerOf = (span: TreeSpan) => (span.start + span.end) / 2;

/**
 * El árbol, o `null` si el cuadro no trae con qué armarlo. Alcanza con que un
 * cruce no sepa de dónde viene, o que dos se pisen, para volver a columnas: un
 * árbol con una línea inventada miente más que uno sin líneas.
 */
function buildTreeLayout(rounds: ResolvedRound[]): { leaves: number; rounds: TreeRound[] } | null {
    if (rounds.length < 2 || rounds[0].matches.length === 0) return null;

    const tree: TreeRound[] = [];
    let previous = new Map<string, { span: TreeSpan; decided: boolean }>();

    for (let roundIdx = 0; roundIdx < rounds.length; roundIdx++) {
        const round = rounds[roundIdx];
        const nodes: TreeNode[] = [];

        for (let matchIdx = 0; matchIdx < round.matches.length; matchIdx++) {
            const match = round.matches[matchIdx];
            const view = toMatchView(match, matchIdx);
            if (roundIdx === 0) {
                nodes.push({ view, span: { start: matchIdx, end: matchIdx + 1 }, feeders: [] });
                continue;
            }

            const feeders = [match.home_source, match.away_source]
                .filter((source): source is BracketSource => source?.outcome === 'winner' && source.match_id != null)
                .map((source) => previous.get(String(source.match_id)))
                .filter((feeder): feeder is { span: TreeSpan; decided: boolean } => feeder !== undefined);
            if (feeders.length === 0) return null;

            nodes.push({
                view,
                span: {
                    start: Math.min(...feeders.map((feeder) => feeder.span.start)),
                    end: Math.max(...feeders.map((feeder) => feeder.span.end)),
                },
                feeders,
            });
        }

        nodes.sort((left, right) => left.span.start - right.span.start);
        for (let i = 1; i < nodes.length; i++) {
            if (nodes[i].span.start < nodes[i - 1].span.end) return null;
        }

        previous = new Map(
            nodes.map((node) => [
                String(node.view.key),
                { span: node.span, decided: node.view.finished && (node.view.home.won || node.view.away.won) },
            ]),
        );
        tree.push({ key: round.key, name: round.name, nodes });
    }

    return { leaves: rounds[0].matches.length, rounds: tree };
}

/** El codo que une un origen con su cruce, en unidades de fila (x va de 0 a 10). */
function linkPath(fromY: number, toY: number): string {
    return `M0 ${fromY} H5 V${toY} H10`;
}

function TreeLinks({ targets, leaves, column }: { targets: TreeNode[]; leaves: number; column: number }) {
    return (
        <svg
            className={styles.treeLinks}
            style={{ gridColumn: column, gridRow: `2 / ${leaves + 2}` }}
            viewBox={`0 0 10 ${leaves}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
        >
            {targets.flatMap((target) =>
                target.feeders.map((feeder, idx) => (
                    <path
                        key={`${target.view.key}-${idx}`}
                        d={linkPath(centerOf(feeder.span), centerOf(target.span))}
                        className={`${styles.treeLink} ${feeder.decided ? styles.treeLinkDecided : ''}`}
                    />
                )),
            )}
        </svg>
    );
}

function BracketTree({ layout, finalIdx }: { layout: { leaves: number; rounds: TreeRound[] }; finalIdx: number }) {
    const { leaves, rounds } = layout;
    const lastIdx = rounds.length - 1;

    // Una columna de Campeón al final del árbol, como el remate de un cuadro
    // impreso: con la final jugada muestra al ganador; antes, el lugar vacío.
    const finalNode = finalIdx === lastIdx && rounds[lastIdx].nodes.length === 1 ? rounds[lastIdx].nodes[0] : null;
    const champion = finalNode && finalNode.view.finished
        ? (finalNode.view.home.won ? finalNode.view.home : finalNode.view.away.won ? finalNode.view.away : null)
        : null;

    const roundColumn = (roundIdx: number) => roundIdx * 2 + 1;
    const columns = rounds
        .map((_, roundIdx) => (roundIdx === finalIdx ? 'var(--tree-final-col)' : 'var(--tree-col)'))
        .join(' var(--tree-gutter) ')
        + (finalNode ? ' var(--tree-gutter) var(--tree-champion-col)' : '');
    const championColumn = roundColumn(rounds.length);
    const allRows = `2 / ${leaves + 2}`;

    return (
        <div
            className={styles.tree}
            style={{ gridTemplateColumns: columns, gridTemplateRows: `auto repeat(${leaves}, 1fr)` }}
        >
            {rounds.map((round, roundIdx) => {
                const isFinalCol = roundIdx === finalIdx;
                return (
                    <React.Fragment key={round.key}>
                        <h3
                            className={`${styles.roundTitle} ${styles.treeTitle} ${isFinalCol ? styles.finalRoundTitle : ''}`}
                            style={{ gridColumn: roundColumn(roundIdx), gridRow: 1 }}
                        >
                            {isFinalCol ? <Trophy size={12} aria-hidden="true" /> : null}
                            {round.name}
                        </h3>
                        {round.nodes.map((node, matchIdx) => (
                            <div
                                key={node.view.key}
                                className={styles.treeCell}
                                style={{ gridColumn: roundColumn(roundIdx), gridRow: `${node.span.start + 2} / ${node.span.end + 2}` }}
                            >
                                <MatchCard
                                    view={node.view}
                                    variant={isFinalCol ? 'final' : undefined}
                                    delayMs={Math.min(roundIdx * 90 + matchIdx * 45, 600)}
                                />
                            </div>
                        ))}
                        {roundIdx > 0 ? (
                            <TreeLinks targets={round.nodes} leaves={leaves} column={roundColumn(roundIdx) - 1} />
                        ) : null}
                    </React.Fragment>
                );
            })}

            {finalNode ? (
                <>
                    <h3
                        className={`${styles.roundTitle} ${styles.treeTitle} ${styles.finalRoundTitle}`}
                        style={{ gridColumn: championColumn, gridRow: 1 }}
                    >
                        Campeón
                    </h3>
                    <svg
                        className={styles.treeLinks}
                        style={{ gridColumn: championColumn - 1, gridRow: allRows }}
                        viewBox={`0 0 10 ${leaves}`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path
                            d={linkPath(centerOf(finalNode.span), centerOf(finalNode.span))}
                            className={`${styles.treeLink} ${champion ? styles.treeLinkChampion : ''}`}
                        />
                    </svg>
                    <div
                        className={styles.treeCell}
                        style={{ gridColumn: championColumn, gridRow: `${finalNode.span.start + 2} / ${finalNode.span.end + 2}` }}
                    >
                        <div
                            className={`${styles.championBox} ${champion ? '' : styles.championBoxPending}`}
                            style={{ animationDelay: `${Math.min(rounds.length * 90, 600)}ms` }}
                        >
                            {champion ? (
                                <>
                                    {champion.logo ? (
                                        <img src={champion.logo} alt="" className={styles.championBoxLogo} />
                                    ) : (
                                        <Trophy size={22} aria-hidden="true" />
                                    )}
                                    <span className={styles.championBoxName}>{champion.name}</span>
                                    <span className={styles.championStripTag}>Campeón</span>
                                </>
                            ) : (
                                <>
                                    <Trophy size={20} aria-hidden="true" />
                                    <span className={styles.championBoxName}>Por definir</span>
                                </>
                            )}
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}

export default function PlayoffBracket({ data, title = 'Cuadro Final' }: PlayoffBracketProps) {
    if (!data || data.length === 0) {
        return (
            <div className={styles.emptyState}>
                <p>No hay información del cuadro disponible.</p>
            </div>
        );
    }

    // Rounds arrive in play order (e.g. Quarter-finals -> Semi-finals -> Final).
    const resolved = data.map((round, idx) => ({
        key: round.round_id ?? idx,
        name: String(round.name || (round as any).round_name || (round as any).ROUND_NAME || `Ronda ${idx + 1}`),
        matches: (round.matches || (round as any).MATCHES || (round as any).events || []) as PlayoffMatch[],
    }));

    // El 3.er puesto no compite visualmente con la Final: sale de la grilla de
    // columnas y se muestra compacto debajo de ella. Si por la forma de los
    // datos no hay una columna Final reconocible, vuelve como columna propia
    // pero achicada.
    let thirdPlaceRounds = resolved.filter((round) => isThirdPlaceRoundName(round.name));
    let mainRounds = resolved.filter((round) => !isThirdPlaceRoundName(round.name));
    if (mainRounds.length === 0) {
        mainRounds = resolved;
        thirdPlaceRounds = [];
    }

    // La columna héroe es la ÚLTIMA ronda que no sea de ubicación, y solo si
    // parece una final de verdad. Un cuadro que solo define puestos (Final por
    // el 5.º, por el 7.º) no tiene héroe: ahí nadie sale campeón de nada.
    let finalIdx = -1;
    for (let i = mainRounds.length - 1; i >= 0; i--) {
        const round = mainRounds[i];
        if (isPlacementRoundName(round.name)) continue;
        if (looksLikeFinalRoundName(round.name) || (i === mainRounds.length - 1 && round.matches.length === 1)) {
            finalIdx = i;
        }
        break;
    }
    const hasFinalColumn = finalIdx >= 0;

    const thirdPlaceViews = hasFinalColumn
        ? thirdPlaceRounds.flatMap((round) => round.matches.map((match, idx) => toMatchView(match, idx)))
        : [];
    const trailingThirdRounds = hasFinalColumn ? [] : thirdPlaceRounds;

    // Árbol con líneas solo si cada cruce sabe de dónde sale (hoy: Ultimate
    // Sevens). Con 3.er puesto no: esa ronda no cuelga de ningún cruce del árbol.
    const tree = thirdPlaceRounds.length === 0 ? buildTreeLayout(mainRounds) : null;
    if (tree) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>{title}</h2>
                <div className={styles.bracketScroll}>
                    <BracketTree layout={tree} finalIdx={finalIdx} />
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>{title}</h2>
            <div className={styles.bracketScroll}>
                <div className={styles.bracketGrid}>
                    {mainRounds.map((round, roundIdx) => {
                        const isFinalCol = roundIdx === finalIdx;
                        const views = round.matches.map((match, idx) => toMatchView(match, idx));
                        const delayOf = (matchIdx: number) => Math.min(roundIdx * 90 + matchIdx * 45, 600);

                        if (!isFinalCol) {
                            return (
                                <div key={round.key} className={styles.roundColumn}>
                                    <h3 className={styles.roundTitle}>{round.name}</h3>
                                    <div className={styles.matchesList}>
                                        {views.map((view, matchIdx) => (
                                            <MatchCard key={view.key} view={view} delayMs={delayOf(matchIdx)} />
                                        ))}
                                    </div>
                                </div>
                            );
                        }

                        // Campeón: solo cuando la final está terminada y con ganador.
                        const finalView = views.length === 1 ? views[0] : null;
                        const champion = finalView && finalView.finished
                            ? (finalView.home.won ? finalView.home : finalView.away.won ? finalView.away : null)
                            : null;

                        return (
                            <div key={round.key} className={`${styles.roundColumn} ${styles.finalColumn}`}>
                                <h3 className={`${styles.roundTitle} ${styles.finalRoundTitle}`}>
                                    <Trophy size={12} aria-hidden="true" />
                                    {round.name}
                                </h3>
                                <div className={styles.finalStack}>
                                    {views.map((view, matchIdx) => (
                                        <MatchCard key={view.key} view={view} variant="final" delayMs={delayOf(matchIdx)} />
                                    ))}
                                    {champion && (
                                        <div className={styles.championStrip} style={{ animationDelay: `${delayOf(views.length)}ms` }}>
                                            <Trophy size={14} aria-hidden="true" />
                                            {champion.logo ? (
                                                <img src={champion.logo} alt="" className={styles.championStripLogo} />
                                            ) : null}
                                            <span className={styles.championStripName}>{champion.name}</span>
                                            <span className={styles.championStripTag}>Campeón</span>
                                        </div>
                                    )}
                                    {thirdPlaceViews.length > 0 && (
                                        <div className={styles.thirdBlock}>
                                            <span className={styles.thirdLabel}>
                                                <Medal size={12} aria-hidden="true" />
                                                3.er puesto
                                            </span>
                                            {thirdPlaceViews.map((view, matchIdx) => (
                                                <MatchCard key={view.key} view={view} variant="third" delayMs={delayOf(views.length + 1 + matchIdx)} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {trailingThirdRounds.map((round, idx) => (
                        <div key={round.key} className={`${styles.roundColumn} ${styles.thirdColumn}`}>
                            <h3 className={`${styles.roundTitle} ${styles.thirdRoundTitle}`}>
                                <Medal size={11} aria-hidden="true" />
                                {round.name}
                            </h3>
                            <div className={styles.matchesList}>
                                {round.matches.map((match, matchIdx) => {
                                    const view = toMatchView(match, matchIdx);
                                    return (
                                        <MatchCard
                                            key={view.key}
                                            view={view}
                                            variant="third"
                                            delayMs={Math.min((mainRounds.length + idx) * 90 + matchIdx * 45, 600)}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
