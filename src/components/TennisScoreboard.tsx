import React from 'react';
import styles from './TennisScoreboard.module.css';

interface TennisScoreboardProps {
    homeTeamName: string;
    awayTeamName: string;
    homeTeamLogo: string;
    awayTeamLogo: string;
    sets: Array<{
        home: number | string;
        away: number | string;
    }>;
    currentSet?: {
        home: number | string;
        away: number | string;
    };
    currentGame?: {
        home: string; // Can be "0", "15", "30", "40", "A"
        away: string;
    };
    status: string;
    isLive: boolean;
}

const TennisScoreboard: React.FC<TennisScoreboardProps> = ({
    homeTeamName,
    awayTeamName,
    homeTeamLogo,
    awayTeamLogo,
    sets,
    currentSet,
    currentGame,
    status,
    isLive
}) => {
    // Calculate total sets won
    const homeSetsWon = sets.filter((set, idx) => {
        const h = typeof set.home === 'number' ? set.home : parseInt(String(set.home)) || 0;
        const a = typeof set.away === 'number' ? set.away : parseInt(String(set.away)) || 0;
        return h > a;
    }).length;

    const awaySetsWon = sets.filter((set, idx) => {
        const h = typeof set.home === 'number' ? set.home : parseInt(String(set.home)) || 0;
        const a = typeof set.away === 'number' ? set.away : parseInt(String(set.away)) || 0;
        return a > h;
    }).length;

    return (
        <div className={styles.tennisScoreboard}>
            {/* Main Score Display */}
            <div className={styles.mainScore}>
                <div className={styles.teamSection}>
                    {homeTeamLogo && (
                        <img src={homeTeamLogo} alt={homeTeamName} className={styles.teamLogo} />
                    )}
                    <span className={styles.teamName}>{homeTeamName}</span>
                </div>

                <div className={styles.scoreDisplay}>
                    <span className={`${styles.teamSets} ${homeSetsWon > awaySetsWon ? styles.leading : ''}`}>
                        {homeSetsWon}
                    </span>
                    <span className={styles.scoreSep}>-</span>
                    <span className={`${styles.teamSets} ${awaySetsWon > homeSetsWon ? styles.leading : ''}`}>
                        {awaySetsWon}
                    </span>
                </div>

                <div className={styles.teamSection}>
                    {awayTeamLogo && (
                        <img src={awayTeamLogo} alt={awayTeamName} className={styles.teamLogo} />
                    )}
                    <span className={styles.teamName}>{awayTeamName}</span>
                </div>
            </div>

            {/* Sets Table */}
            {sets.length > 0 && (
                <div className={styles.setsTable}>
                    <table>
                        <thead>
                            <tr>
                                <th></th>
                                {sets.map((_, idx) => (
                                    <th key={idx}>{idx + 1}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className={styles.playerName}>{homeTeamName.split(' ')[0]}</td>
                                {sets.map((set, idx) => (
                                    <td key={idx} className={styles.setScore}>
                                        {set.home}
                                    </td>
                                ))}
                            </tr>
                            <tr>
                                <td className={styles.playerName}>{awayTeamName.split(' ')[0]}</td>
                                {sets.map((set, idx) => (
                                    <td key={idx} className={styles.setScore}>
                                        {set.away}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {/* Current Game Score (for live matches) */}
            {isLive && currentGame && (
                <div className={styles.currentGame}>
                    <div className={styles.gameLabel}>JUEGO ACTUAL</div>
                    <div className={styles.gameScore}>
                        <div className={styles.gameScoreItem}>
                            <span className={styles.gamePts}>{currentGame.home}</span>
                        </div>
                        <div className={styles.gameScoreSep}>:</div>
                        <div className={styles.gameScoreItem}>
                            <span className={styles.gamePts}>{currentGame.away}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TennisScoreboard;
