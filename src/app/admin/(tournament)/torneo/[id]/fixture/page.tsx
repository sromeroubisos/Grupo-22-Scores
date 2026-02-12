'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Match, MatchStatus } from '@/types/match';
import { db } from '@/lib/mock-db'; // Import shared DB

const STATUS_LABELS: Record<MatchStatus, { label: string; color: string; bg: string }> = {
    scheduled: { label: 'Programado', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' },
    live: { label: 'En Vivo', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
    final: { label: 'Finalizado', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)' },
    postponed: { label: 'Postergado', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
    cancelled: { label: 'Cancelado', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' }
};

export default function TournamentFixture() {
    const params = useParams();
    const router = useRouter();
    const tournamentId = params?.id as string;

    // Navigate to match admin page
    const goToMatch = (matchId: string) => {
        router.push(`/admin/matches/${matchId}`);
    };

    // Initialize matches from shared DB
    const [matches, setMatches] = useState<Match[]>(() => {
        // Filter matches for this tournament (or all if ID mismatch for demo)
        // For demo purposes, we might want to return all matches if tournamentId doesn't match specific ones
        const dbMatches = db.matches.filter(m => m.tournamentId === tournamentId || tournamentId === 'uar-top-12' /* fallback for demo */);

        return dbMatches.map(m => {
            const homeClub = db.clubs.find(c => c.id === m.homeClubId);
            const awayClub = db.clubs.find(c => c.id === m.awayClubId);

            return {
                id: m.id,
                tournamentId: m.tournamentId,
                phaseId: 'phase1', // Default
                round: parseInt(m.roundId.replace(/\D/g, '')) || 1, // Extract number from "F1"
                homeTeamId: m.homeClubId,
                homeTeamName: homeClub?.name || 'Local',
                awayTeamId: m.awayClubId,
                awayTeamName: awayClub?.name || 'Visita',
                scheduledAt: new Date(m.dateTime),
                venueName: m.venue,
                status: m.status as MatchStatus,
                score: {
                    home: m.score.home,
                    away: m.score.away,
                    homeTries: 0,
                    awayTries: 0
                },
                result: { isComplete: m.status === 'final', updatedAt: null, updatedBy: null, version: 0 },
                createdFrom: 'manual',
                createdAt: new Date(),
                updatedAt: new Date()
            };
        });
    });

    const [activeTab, setActiveTab] = useState<'list' | 'bulk'>('list');
    const [selectedRound, setSelectedRound] = useState<number | 'all'>('all');
    const [selectedStatus, setSelectedStatus] = useState<MatchStatus | 'all'>('all');

    // Get unique rounds
    const rounds = useMemo(() => {
        const roundSet = new Set(matches.map(m => m.round));
        return Array.from(roundSet).sort((a, b) => a - b);
    }, [matches]);

    // Filter matches
    const filteredMatches = useMemo(() => {
        return matches.filter(m => {
            if (selectedRound !== 'all' && m.round !== selectedRound) return false;
            if (selectedStatus !== 'all' && m.status !== selectedStatus) return false;
            return true;
        });
    }, [matches, selectedRound, selectedStatus]);

    // Group matches by round
    const matchesByRound = useMemo(() => {
        const grouped: Record<number, Match[]> = {};
        filteredMatches.forEach(m => {
            if (!grouped[m.round]) grouped[m.round] = [];
            grouped[m.round].push(m);
        });
        return grouped;
    }, [filteredMatches]);

    const handleStatusChange = (matchId: string, newStatus: MatchStatus) => {
        setMatches(prev => prev.map(m => {
            if (m.id !== matchId) return m;

            // Updated local state
            const updated = { ...m, status: newStatus, updatedAt: new Date() };

            // If marking as final, ensure result is complete
            if (newStatus === 'final' && m.score.home !== null && m.score.away !== null) {
                updated.result = {
                    ...m.result,
                    isComplete: true,
                    updatedAt: new Date(),
                    updatedBy: 'current_user',
                    version: m.result.version + 1
                };
            }

            // Sync with DB
            const dbMatchIndex = db.matches.findIndex(dbm => dbm.id === matchId);
            if (dbMatchIndex !== -1) {
                db.matches[dbMatchIndex].status = newStatus as 'scheduled' | 'live' | 'final';
                // Also update score if finalized? For now just status
            }

            return updated;
        }));
    };

    const formatDate = (date: Date | null) => {
        if (!date) return 'Sin programar';
        return date.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
    };

    const formatTime = (date: Date | null) => {
        if (!date) return '--:--';
        return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="fixturePage">
            {/* Header */}
            <div className="fixtureHeader">
                <div>
                    <h1 className="fixtureTitle">Gestión de Partidos</h1>
                    <p className="fixtureSubtitle">
                        Edita fechas, canchas, árbitros y carga resultados de los partidos generados.
                    </p>
                </div>
                <div className="fixtureActions">
                    <button className="adminBtn adminBtn--ghost">
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        Exportar CSV
                    </button>
                    <button className="adminBtn adminBtn--ghost">
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                        </svg>
                        Importar
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="fixtureTabs">
                <button
                    className={`fixtureTab ${activeTab === 'list' ? 'isActive' : ''}`}
                    onClick={() => setActiveTab('list')}
                >
                    Partidos
                </button>
                <button
                    className={`fixtureTab ${activeTab === 'bulk' ? 'isActive' : ''}`}
                    onClick={() => setActiveTab('bulk')}
                >
                    Edición Masiva
                </button>
            </div>

            {activeTab === 'list' && (
                <>
                    {/* Filters */}
                    <div className="fixtureFilters">
                        <div className="filterGroup">
                            <label className="filterLabel">Jornada</label>
                            <select
                                className="filterSelect"
                                value={selectedRound === 'all' ? 'all' : selectedRound}
                                onChange={(e) => setSelectedRound(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                            >
                                <option value="all">Todas las jornadas</option>
                                {rounds.map(r => (
                                    <option key={r} value={r}>Fecha {r}</option>
                                ))}
                            </select>
                        </div>
                        <div className="filterGroup">
                            <label className="filterLabel">Estado</label>
                            <select
                                className="filterSelect"
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value as MatchStatus | 'all')}
                            >
                                <option value="all">Todos los estados</option>
                                <option value="scheduled">Programado</option>
                                <option value="live">En Vivo</option>
                                <option value="final">Finalizado</option>
                                <option value="postponed">Postergado</option>
                            </select>
                        </div>
                        <div className="filterStats">
                            <span>{filteredMatches.length} partidos</span>
                            <span className="filterStatDivider">•</span>
                            <span>{filteredMatches.filter(m => m.status === 'final').length} finalizados</span>
                        </div>
                    </div>

                    {/* Matches List by Round */}
                    <div className="matchesList">
                        {Object.entries(matchesByRound).map(([round, roundMatches]) => (
                            <div key={round} className="roundSection">
                                <div className="roundHeader">
                                    <span className="roundLabel">Fecha {round}</span>
                                    <span className="roundDate">{formatDate(roundMatches[0]?.scheduledAt)}</span>
                                </div>

                                <div className="roundMatches">
                                    {roundMatches.map(match => (
                                        <div key={match.id} className="matchCard" onClick={() => goToMatch(match.id)} style={{ cursor: 'pointer' }}>
                                            <div className="matchTime">
                                                {match.status === 'live' ? (
                                                    <span className="matchLive">
                                                        <span className="liveDot"></span>
                                                        EN VIVO
                                                    </span>
                                                ) : (
                                                    <span>{formatTime(match.scheduledAt)}</span>
                                                )}
                                            </div>

                                            <div className="matchTeams">
                                                <div className="matchTeam matchTeamHome">
                                                    <span className="teamName">{match.homeTeamName}</span>
                                                </div>

                                                <div className="matchScore">
                                                    {match.score.home !== null ? (
                                                        <>
                                                            <span className="scoreNum">{match.score.home}</span>
                                                            <span className="scoreSep">-</span>
                                                            <span className="scoreNum">{match.score.away}</span>
                                                        </>
                                                    ) : (
                                                        <span className="scoreVs">vs</span>
                                                    )}
                                                </div>

                                                <div className="matchTeam matchTeamAway">
                                                    <span className="teamName">{match.awayTeamName}</span>
                                                </div>
                                            </div>

                                            <div className="matchVenue">
                                                📍 {match.venueName || 'Sin asignar'}
                                            </div>

                                            <div className="matchStatus">
                                                <span
                                                    className="statusBadge"
                                                    style={{
                                                        color: STATUS_LABELS[match.status].color,
                                                        background: STATUS_LABELS[match.status].bg
                                                    }}
                                                >
                                                    {STATUS_LABELS[match.status].label}
                                                </span>
                                            </div>

                                            <div className="matchActions">
                                                <Link
                                                    href={`/admin/matches/${match.id}`}
                                                    className="matchActionBtn"
                                                    title="Administrar partido"
                                                >
                                                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                    </svg>
                                                </Link>
                                                <select
                                                    className="statusSelect"
                                                    value={match.status}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        handleStatusChange(match.id, e.target.value as MatchStatus);
                                                    }}
                                                >
                                                    <option value="scheduled">Programado</option>
                                                    <option value="live">En Vivo</option>
                                                    <option value="final">Finalizado</option>
                                                    <option value="postponed">Postergado</option>
                                                    <option value="cancelled">Cancelado</option>
                                                </select>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {filteredMatches.length === 0 && (
                            <div className="noMatches">
                                <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <rect x="3" y="4" width="18" height="18" rx="2" />
                                    <path d="M16 2v4M8 2v4M3 10h18" />
                                </svg>
                                <h3>No hay partidos</h3>
                                <p>Los partidos se generan desde la configuración de Fases.</p>
                            </div>
                        )}
                    </div>
                </>
            )}

            {activeTab === 'bulk' && (
                <div className="bulkSection">
                    <div className="bulkCard">
                        <div className="bulkIcon">📋</div>
                        <h3>Edición Masiva</h3>
                        <p>Importa o exporta partidos en formato CSV para editar fechas, horarios y canchas de múltiples partidos a la vez.</p>
                        <div className="bulkActions">
                            <button className="adminBtn adminBtn--ghost">Descargar Plantilla CSV</button>
                            <button className="adminBtn adminBtn--primary">Subir CSV Actualizado</button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .fixturePage {
                    padding: 0;
                }
                
                .fixtureHeader {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 24px;
                }
                
                .fixtureTitle {
                    font-size: 24px;
                    font-weight: 700;
                    color: white;
                    margin: 0 0 6px;
                }
                
                .fixtureSubtitle {
                    font-size: 14px;
                    color: rgba(255,255,255,.55);
                    margin: 0;
                }
                
                .fixtureActions {
                    display: flex;
                    gap: 10px;
                }
                
                .fixtureTabs {
                    display: flex;
                    gap: 4px;
                    margin-bottom: 24px;
                    border-bottom: 1px solid rgba(255,255,255,.08);
                }
                
                .fixtureTab {
                    padding: 12px 20px;
                    border: none;
                    background: transparent;
                    color: rgba(255,255,255,.6);
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    transition: all 0.2s;
                }
                
                .fixtureTab:hover {
                    color: rgba(255,255,255,.9);
                }
                
                .fixtureTab.isActive {
                    color: white;
                    border-bottom-color: #22c55e;
                }
                
                .fixtureFilters {
                    display: flex;
                    gap: 16px;
                    align-items: center;
                    margin-bottom: 24px;
                    padding: 16px;
                    background: rgba(255,255,255,.03);
                    border-radius: 12px;
                    border: 1px solid rgba(255,255,255,.06);
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
                
                .filterStats {
                    margin-left: auto;
                    font-size: 13px;
                    color: rgba(255,255,255,.5);
                }
                
                .filterStatDivider {
                    margin: 0 8px;
                    opacity: 0.5;
                }
                
                .matchesList {
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
                }
                
                .roundMatches {
                    display: flex;
                    flex-direction: column;
                }
                
                .matchCard {
                    display: grid;
                    grid-template-columns: 80px 1fr 150px 100px 140px;
                    align-items: center;
                    gap: 16px;
                    padding: 16px 20px;
                    border-bottom: 1px solid rgba(255,255,255,.04);
                    transition: background 0.15s;
                }
                
                .matchCard:hover {
                    background: rgba(255,255,255,.02);
                }
                
                .matchCard:last-child {
                    border-bottom: none;
                }
                
                .matchTime {
                    font-size: 13px;
                    color: rgba(255,255,255,.6);
                    font-family: ui-monospace, monospace;
                }
                
                .matchLive {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: #ef4444;
                    font-weight: 700;
                    font-size: 11px;
                    letter-spacing: 0.05em;
                }
                
                .liveDot {
                    width: 8px;
                    height: 8px;
                    background: #ef4444;
                    border-radius: 50%;
                    animation: pulse 1.5s infinite;
                }
                
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                
                .matchTeams {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                
                .matchTeam {
                    flex: 1;
                }
                
                .matchTeamHome {
                    text-align: right;
                }
                
                .matchTeamAway {
                    text-align: left;
                }
                
                .teamName {
                    font-weight: 600;
                    font-size: 14px;
                    color: white;
                }
                
                .matchScore {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    min-width: 80px;
                }
                
                .scoreNum {
                    font-size: 18px;
                    font-weight: 800;
                    color: white;
                    font-family: ui-monospace, monospace;
                }
                
                .scoreSep {
                    color: rgba(255,255,255,.3);
                }
                
                .scoreVs {
                    font-size: 12px;
                    color: rgba(255,255,255,.4);
                    text-transform: uppercase;
                    font-weight: 700;
                }
                
                .matchVenue {
                    font-size: 12px;
                    color: rgba(255,255,255,.5);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .matchStatus {
                    display: flex;
                    justify-content: center;
                }
                
                .statusBadge {
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                }
                
                .matchActions {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    justify-content: flex-end;
                }
                
                .matchActionBtn {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255,255,255,.05);
                    border: 1px solid rgba(255,255,255,.1);
                    border-radius: 8px;
                    color: rgba(255,255,255,.7);
                    cursor: pointer;
                    transition: all 0.15s;
                }
                
                .matchActionBtn:hover {
                    background: rgba(255,255,255,.1);
                    color: white;
                }
                
                .statusSelect {
                    padding: 6px 8px;
                    background: rgba(0,0,0,.3);
                    border: 1px solid rgba(255,255,255,.1);
                    border-radius: 6px;
                    color: rgba(255,255,255,.8);
                    font-size: 11px;
                    cursor: pointer;
                }
                
                .noMatches {
                    text-align: center;
                    padding: 60px 20px;
                    color: rgba(255,255,255,.5);
                }
                
                .noMatches svg {
                    margin-bottom: 16px;
                    opacity: 0.3;
                }
                
                .noMatches h3 {
                    font-size: 18px;
                    font-weight: 600;
                    color: rgba(255,255,255,.7);
                    margin: 0 0 8px;
                }
                
                .noMatches p {
                    font-size: 14px;
                    margin: 0;
                }
                
                .bulkSection {
                    display: flex;
                    justify-content: center;
                    padding: 40px 0;
                }
                
                .bulkCard {
                    text-align: center;
                    padding: 40px;
                    background: rgba(255,255,255,.03);
                    border: 1px dashed rgba(255,255,255,.15);
                    border-radius: 16px;
                    max-width: 480px;
                }
                
                .bulkIcon {
                    font-size: 48px;
                    margin-bottom: 16px;
                }
                
                .bulkCard h3 {
                    font-size: 18px;
                    font-weight: 700;
                    color: white;
                    margin: 0 0 8px;
                }
                
                .bulkCard p {
                    font-size: 14px;
                    color: rgba(255,255,255,.55);
                    margin: 0 0 24px;
                    line-height: 1.5;
                }
                
                .bulkActions {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                }
            `}</style>
        </div>
    );
}
