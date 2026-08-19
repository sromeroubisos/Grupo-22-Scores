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
// puesto 1 sí es la final por el título ("Final por el 1.er puesto").
function isPlacementRoundName(name: string): boolean {
    const n = name.toLowerCase();
    const m = n.match(/(\d+)\s*(?:\.|º|°|o)?\s*(?:er|do|to|mo|vo|no)?\s*puesto|(\d+)(?:st|nd|rd|th)[-\s]*place/);
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
};

type MatchView = {
    key: string | number;
    dateLabel: string;
    statusLabel: string;
    hasPenalties: boolean;
    finished: boolean;
    home: ParticipantView;
    away: ParticipantView;
};

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

    return {
        key: m.match_id || matchIdx,
        dateLabel: matchDate
            ? new Date(matchDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
            : 'TBD',
        statusLabel: status ? (status === 'finished' ? 'Final' : String(status)) : '',
        hasPenalties,
        finished: Boolean(isFinished),
        home: { name: homeName, logo: homeLogo, score: homeScore, pens: hasPenalties ? Number(penHome) : null, won: Boolean(homeWon) },
        away: { name: awayName, logo: awayLogo, score: awayScore, pens: hasPenalties ? Number(penAway) : null, won: Boolean(awayWon) },
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
                <span className={styles.name}>{side.name}</span>
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
