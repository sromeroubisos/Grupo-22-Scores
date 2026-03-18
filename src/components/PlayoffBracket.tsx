import React from 'react';
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

export default function PlayoffBracket({ data, title = 'Cuadro Final' }: PlayoffBracketProps) {
    if (!data || data.length === 0) {
        return (
            <div className={styles.emptyState}>
                <p>No hay información del cuadro disponible.</p>
            </div>
        );
    }

    // Reverse rounds to show Final last (right side usually) or handle layout
    // Assuming API gives rounds in order (e.g. Quarter-finals -> Semi-finals -> Final)
    // Reverse rounds to show Final last (right side usually) or handle layout
    // Assuming API gives rounds in order (e.g. Quarter-finals -> Semi-finals -> Final)
    const rounds = data;

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>{title}</h2>
            <div className={styles.bracketScroll}>
                <div className={styles.bracketGrid}>
                    {rounds.map((round, roundIdx) => {
                        const roundName = round.name || (round as any).round_name || (round as any).ROUND_NAME || `Ronda ${roundIdx + 1}`;
                        const matches = round.matches || (round as any).MATCHES || (round as any).events || [];

                        return (
                            <div key={round.round_id || roundIdx} className={styles.roundColumn}>
                                <h3 className={styles.roundTitle}>{roundName}</h3>
                                <div className={styles.matchesList}>
                                    {matches.map((match, matchIdx) => {
                                        // Robust data extraction
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

                                        const homeLogo = m.home_participant?.image_path || m.home_team?.image_path || m.home_team?.small_image_path || m.home_team?.logo || '';
                                        const awayLogo = m.away_participant?.image_path || m.away_team?.image_path || m.away_team?.small_image_path || m.away_team?.logo || '';

                                        // Winner logic
                                        const isFinished = status === 'finished' || status === 'Final' || !!m.winner_id;
                                        const homeWon = m.winner_id
                                            ? (m.home_participant && m.winner_id == m.home_participant.participant_id) || (m.home_team && m.winner_id == m.home_team.id)
                                            : isFinished && homeScore !== '-' && awayScore !== '-' && Number(homeScore) > Number(awayScore);

                                        const awayWon = m.winner_id
                                            ? (m.away_participant && m.winner_id == m.away_participant.participant_id) || (m.away_team && m.winner_id == m.away_team.id)
                                            : isFinished && homeScore !== '-' && awayScore !== '-' && Number(awayScore) > Number(homeScore);

                                        return (
                                            <div key={m.match_id || matchIdx} className={styles.matchCard}>
                                                <div className={styles.matchDate}>
                                                    {matchDate
                                                        ? new Date(matchDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                                                        : 'TBD'}
                                                    {status && (
                                                        <span className={styles.matchStatus}>
                                                            {status === 'finished' ? 'Final' : status}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className={`${styles.participant} ${homeWon ? styles.winner : ''}`}>
                                                    <div className={styles.participantInfo}>
                                                        {homeLogo ? (
                                                            <img src={homeLogo} alt="" className={styles.logo} />
                                                        ) : (
                                                            <div className={styles.logo} style={{ background: 'rgba(255,255,255,0.1)' }} />
                                                        )}
                                                        <span className={styles.name}>{homeName}</span>
                                                    </div>
                                                    <span className={styles.score}>{homeScore}</span>
                                                </div>

                                                <div className={`${styles.participant} ${awayWon ? styles.winner : ''}`}>
                                                    <div className={styles.participantInfo}>
                                                        {awayLogo ? (
                                                            <img src={awayLogo} alt="" className={styles.logo} />
                                                        ) : (
                                                            <div className={styles.logo} style={{ background: 'rgba(255,255,255,0.1)' }} />
                                                        )}
                                                        <span className={styles.name}>{awayName}</span>
                                                    </div>
                                                    <span className={styles.score}>{awayScore}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
