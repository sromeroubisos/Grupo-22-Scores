'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Match } from '@/types/match';

/**
 * RESULTADOS - Vista derivada de matches
 * 
 * Esta página NO almacena datos separados.
 * Es una vista que filtra matches donde:
 *   - status === 'final' OR result.isComplete === true
 * 
 * Los partidos siguen siendo editables desde aquí
 * porque se edita el mismo documento.
 */

// Same mock data as Fixture - In production, both pages query the same Firestore collection
const MOCK_MATCHES: Match[] = [
    {
        id: 'm4',
        tournamentId: 't1',
        phaseId: 'phase1',
        groupId: 'groupA',
        round: 1,
        orderInRound: 1,
        homeTeamId: 'casi',
        homeTeamName: 'CASI',
        awayTeamId: 'hindu',
        awayTeamName: 'Hindú Club',
        scheduledAt: new Date('2026-05-05T16:00:00'),
        venueName: 'San Isidro',
        status: 'final',
        score: { home: 24, away: 10, homeTries: 3, awayTries: 1, homeBonus: 1, awayBonus: 1 },
        result: { isComplete: true, updatedAt: new Date(), updatedBy: 'admin', version: 1 },
        createdFrom: 'generator',
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        id: 'm5',
        tournamentId: 't1',
        phaseId: 'phase1',
        groupId: 'groupA',
        round: 1,
        orderInRound: 2,
        homeTeamId: 'sic',
        homeTeamName: 'SIC',
        awayTeamId: 'alumni',
        awayTeamName: 'Alumni',
        scheduledAt: new Date('2026-05-05T16:00:00'),
        venueName: 'Boulogne',
        status: 'final',
        score: { home: 18, away: 21, homeTries: 2, awayTries: 3, homeBonus: 0, awayBonus: 1 },
        result: { isComplete: true, updatedAt: new Date(), updatedBy: 'admin', version: 1 },
        createdFrom: 'generator',
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        id: 'm6',
        tournamentId: 't1',
        phaseId: 'phase1',
        groupId: 'groupB',
        round: 2,
        orderInRound: 1,
        homeTeamId: 'newman',
        homeTeamName: 'Newman',
        awayTeamId: 'belgrano',
        awayTeamName: 'Belgrano Athletic',
        scheduledAt: new Date('2026-05-12T16:00:00'),
        venueName: 'Benavídez',
        status: 'final',
        score: { home: 33, away: 28, homeTries: 5, awayTries: 4, homeBonus: 1, awayBonus: 1 },
        result: { isComplete: true, updatedAt: new Date(), updatedBy: 'admin', version: 2 },
        createdFrom: 'generator',
        createdAt: new Date(),
        updatedAt: new Date()
    }
];

export default function TournamentResults() {
    const params = useParams();
    const router = useRouter();
    const [matches, setMatches] = useState<Match[]>(MOCK_MATCHES);
    const [selectedRound, setSelectedRound] = useState<number | 'all'>('all');

    // Navigate to match admin page
    const goToMatch = (matchId: string) => {
        router.push(`/admin/matches/${matchId}`);
    };

    // Filter only completed matches (status=final OR result.isComplete=true)
    const completedMatches = useMemo(() => {
        return matches.filter(m => m.status === 'final' || m.result.isComplete);
    }, [matches]);

    // Get unique rounds from completed matches
    const rounds = useMemo(() => {
        const roundSet = new Set(completedMatches.map(m => m.round));
        return Array.from(roundSet).sort((a, b) => a - b);
    }, [completedMatches]);

    // Filter by selected round
    const filteredMatches = useMemo(() => {
        if (selectedRound === 'all') return completedMatches;
        return completedMatches.filter(m => m.round === selectedRound);
    }, [completedMatches, selectedRound]);

    // Group matches by round
    const matchesByRound = useMemo(() => {
        const grouped: Record<number, Match[]> = {};
        filteredMatches.forEach(m => {
            if (!grouped[m.round]) grouped[m.round] = [];
            grouped[m.round].push(m);
        });
        return grouped;
    }, [filteredMatches]);

    const formatDate = (date: Date | null) => {
        if (!date) return '';
        return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    };

    // Calculate winner
    const getWinner = (match: Match): 'home' | 'away' | 'draw' | null => {
        if (match.score.home === null || match.score.away === null) return null;
        if (match.score.home > match.score.away) return 'home';
        if (match.score.away > match.score.home) return 'away';
        return 'draw';
    };

    return (
        <div className="resultsPage">
            {/* Header */}
            <div className="resultsHeader">
                <div>
                    <h1 className="resultsTitle">Resultados</h1>
                    <p className="resultsSubtitle">
                        Vista de partidos finalizados. Haz clic en un partido para editar el resultado.
                    </p>
                </div>
                <div className="resultsStats">
                    <div className="statBox">
                        <span className="statNumber">{completedMatches.length}</span>
                        <span className="statLabel">Finalizados</span>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="resultsFilters">
                <div className="filterGroup">
                    <label className="filterLabel">Jornada</label>
                    <select
                        className="filterSelect"
                        value={selectedRound === 'all' ? 'all' : selectedRound}
                        onChange={(e) => setSelectedRound(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    >
                        <option value="all">Todas las fechas</option>
                        {rounds.map(r => (
                            <option key={r} value={r}>Fecha {r}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Results List */}
            <div className="resultsList">
                {Object.entries(matchesByRound).map(([round, roundMatches]) => (
                    <div key={round} className="roundSection">
                        <div className="roundHeader">
                            <span className="roundLabel">Fecha {round}</span>
                            <span className="roundDate">{formatDate(roundMatches[0]?.scheduledAt)}</span>
                        </div>

                        <div className="roundMatches">
                            {roundMatches.map(match => {
                                const winner = getWinner(match);
                                return (
                                    <div
                                        key={match.id}
                                        className="resultCard"
                                        onClick={() => goToMatch(match.id)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div className="resultTeams">
                                            <div className={`resultTeam resultTeamHome ${winner === 'home' ? 'winner' : ''}`}>
                                                <span className="teamName">{match.homeTeamName}</span>
                                                {match.score.homeTries !== undefined && (
                                                    <span className="teamTries">{match.score.homeTries}T</span>
                                                )}
                                            </div>

                                            <div className="resultScore">
                                                <span className={`scoreNum ${winner === 'home' ? 'winner' : ''}`}>
                                                    {match.score.home}
                                                </span>
                                                <span className="scoreSep">-</span>
                                                <span className={`scoreNum ${winner === 'away' ? 'winner' : ''}`}>
                                                    {match.score.away}
                                                </span>
                                            </div>

                                            <div className={`resultTeam resultTeamAway ${winner === 'away' ? 'winner' : ''}`}>
                                                <span className="teamName">{match.awayTeamName}</span>
                                                {match.score.awayTries !== undefined && (
                                                    <span className="teamTries">{match.score.awayTries}T</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="resultMeta">
                                            <span className="resultVenue">📍 {match.venueName}</span>
                                            <span className="resultEdit">
                                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                </svg>
                                                Editar resultado
                                            </span>
                                        </div>

                                        {/* Bonus indicators */}
                                        {(match.score.homeBonus || match.score.awayBonus) && (
                                            <div className="bonusRow">
                                                {match.score.homeBonus ? (
                                                    <span className="bonusBadge">+{match.score.homeBonus} bonus</span>
                                                ) : <span></span>}
                                                {match.score.awayBonus ? (
                                                    <span className="bonusBadge">+{match.score.awayBonus} bonus</span>
                                                ) : <span></span>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {filteredMatches.length === 0 && (
                    <div className="noResults">
                        <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 6v6l4 2" />
                        </svg>
                        <h3>Sin resultados aún</h3>
                        <p>Los partidos aparecerán aquí una vez que se marquen como finalizados en la sección Fixture.</p>
                    </div>
                )}
            </div>

            <style jsx>{`
                .resultsPage {
                    padding: 0;
                }

                .resultsHeader {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 24px;
                }

                .resultsTitle {
                    font-size: 24px;
                    font-weight: 700;
                    color: white;
                    margin: 0 0 6px;
                }

                .resultsSubtitle {
                    font-size: 14px;
                    color: rgba(255,255,255,.55);
                    margin: 0;
                }

                .resultsStats {
                    display: flex;
                    gap: 16px;
                }

                .statBox {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 12px 20px;
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.2);
                    border-radius: 12px;
                }

                .statNumber {
                    font-size: 24px;
                    font-weight: 800;
                    color: #22c55e;
                    font-family: ui-monospace, monospace;
                }

                .statLabel {
                    font-size: 11px;
                    color: rgba(255,255,255,.5);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .resultsFilters {
                    display: flex;
                    gap: 16px;
                    margin-bottom: 24px;
                }

                .filterGroup {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .filterLabel {
                    font-size: 11px;
                    font-weight: 700;
                    color: rgba(255,255,255,.5);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .filterSelect {
                    padding: 8px 12px;
                    background: rgba(0,0,0,.3);
                    border: 1px solid rgba(255,255,255,.1);
                    border-radius: 8px;
                    color: white;
                    font-size: 13px;
                    min-width: 180px;
                }

                .resultsList {
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                }

                .roundSection {
                    background: rgba(255,255,255,.02);
                    border: 1px solid rgba(255,255,255,.06);
                    border-radius: 16px;
                    overflow: hidden;
                }

                .roundHeader {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 14px 20px;
                    background: rgba(255,255,255,.03);
                    border-bottom: 1px solid rgba(255,255,255,.06);
                }

                .roundLabel {
                    font-weight: 700;
                    font-size: 14px;
                    color: white;
                }

                .roundDate {
                    font-size: 13px;
                    color: rgba(255,255,255,.5);
                    text-transform: capitalize;
                }

                .roundMatches {
                    display: flex;
                    flex-direction: column;
                }

                .resultCard {
                    padding: 20px 24px;
                    border-bottom: 1px solid rgba(255,255,255,.04);
                    cursor: pointer;
                    transition: background 0.15s;
                }

                .resultCard:hover {
                    background: rgba(255,255,255,.03);
                }

                .resultCard:last-child {
                    border-bottom: none;
                }

                .resultTeams {
                    display: grid;
                    grid-template-columns: 1fr auto 1fr;
                    align-items: center;
                    gap: 24px;
                    margin-bottom: 12px;
                }

                .resultTeam {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .resultTeamHome {
                    justify-content: flex-end;
                }

                .resultTeamAway {
                    justify-content: flex-start;
                }

                .teamName {
                    font-weight: 600;
                    font-size: 15px;
                    color: rgba(255,255,255,.8);
                    transition: color 0.15s;
                }

                .resultTeam.winner .teamName {
                    color: white;
                    font-weight: 700;
                }

                .teamTries {
                    font-size: 11px;
                    color: rgba(255,255,255,.4);
                    font-family: ui-monospace, monospace;
                    padding: 2px 6px;
                    background: rgba(255,255,255,.05);
                    border-radius: 4px;
                }

                .resultScore {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    min-width: 100px;
                    justify-content: center;
                }

                .scoreNum {
                    font-size: 24px;
                    font-weight: 700;
                    color: rgba(255,255,255,.6);
                    font-family: ui-monospace, monospace;
                    min-width: 36px;
                    text-align: center;
                }

                .scoreNum.winner {
                    color: #22c55e;
                    font-weight: 800;
                }

                .scoreSep {
                    color: rgba(255,255,255,.2);
                    font-size: 20px;
                }

                .resultMeta {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .resultVenue {
                    font-size: 12px;
                    color: rgba(255,255,255,.4);
                }

                .resultEdit {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    color: rgba(255,255,255,.4);
                    opacity: 0;
                    transition: opacity 0.15s;
                }

                .resultCard:hover .resultEdit {
                    opacity: 1;
                    color: #22c55e;
                }

                .bonusRow {
                    display: grid;
                    grid-template-columns: 1fr 100px 1fr;
                    gap: 24px;
                    margin-top: 8px;
                    justify-items: center;
                }

                .bonusRow > span:first-child {
                    justify-self: end;
                }

                .bonusRow > span:last-child {
                    justify-self: start;
                }

                .bonusBadge {
                    font-size: 10px;
                    padding: 2px 6px;
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                    border-radius: 4px;
                    font-weight: 600;
                }

                .noResults {
                    text-align: center;
                    padding: 60px 20px;
                    color: rgba(255,255,255,.5);
                }

                .noResults svg {
                    margin-bottom: 16px;
                    opacity: 0.3;
                }

                .noResults h3 {
                    font-size: 18px;
                    font-weight: 600;
                    color: rgba(255,255,255,.7);
                    margin: 0 0 8px;
                }

                .noResults p {
                    font-size: 14px;
                    margin: 0;
                    max-width: 400px;
                    margin: 0 auto;
                }
            `}</style>
        </div>
    );
}
