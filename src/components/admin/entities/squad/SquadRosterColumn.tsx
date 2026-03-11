'use client';

import { PlayerWithDetails, RUGBY_POSITIONS } from '@/lib/types/squad';
import { Edit, X, Users } from 'lucide-react';

interface SquadRosterColumnProps {
    players: PlayerWithDetails[];
    onSelectPlayer: (player: PlayerWithDetails) => void;
    onRemovePlayer: (player: PlayerWithDetails) => void;
    selectedPlayerId: string | null;
}

export function SquadRosterColumn({ players, onSelectPlayer, onRemovePlayer, selectedPlayerId }: SquadRosterColumnProps) {
    // Agrupar jugadores por posición
    const forwards = players.filter(p => {
        const pos = RUGBY_POSITIONS.find(rp => rp.name === p.position);
        return pos?.category === 'forwards';
    });

    const backs = players.filter(p => {
        const pos = RUGBY_POSITIONS.find(rp => rp.name === p.position);
        return pos?.category === 'backs';
    });

    // Agrupar por grupos específicos
    function groupByPosition(playerList: PlayerWithDetails[], category: 'forwards' | 'backs') {
        const groups: { [key: string]: { players: PlayerWithDetails[], config: any } } = {};

        playerList.forEach(player => {
            const posConfig = RUGBY_POSITIONS.find(rp => rp.name === player.position);
            const groupName = posConfig?.group || 'Sin grupo';

            if (!groups[groupName]) {
                groups[groupName] = {
                    players: [],
                    config: posConfig || null,
                };
            }
            groups[groupName].players.push(player);
        });

        return groups;
    }

    const forwardGroups = groupByPosition(forwards, 'forwards');
    const backGroups = groupByPosition(backs, 'backs');

    function getAge(birthDate: string | null): number | null {
        if (!birthDate) return null;
        return new Date().getFullYear() - new Date(birthDate).getFullYear();
    }

    function renderPlayerCard(player: PlayerWithDetails, isSelected: boolean) {
        const age = getAge(player.birth_date);
        const borderColor = player.role === 'titular' ? 'var(--accent-pulse)' : 'transparent';

        return (
            <div
                key={player.id}
                className={`squad-card ${isSelected ? 'selected' : ''}`}
                style={{ borderLeftColor: borderColor, borderLeftWidth: player.role === 'titular' ? '3px' : '0' }}
                onClick={() => onSelectPlayer(player)}
            >
                <div className="dorsal-chip">
                    {player.jersey_number || '—'}
                </div>
                <div className="avatar">
                    {player.photo_url ? (
                        <img src={player.photo_url} alt={player.name} />
                    ) : (
                        <div className="avatar-placeholder">
                            {player.name.charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>
                <div className="player-info">
                    <h4>{player.name}</h4>
                    <p>{player.position} · {age ? `${age} años` : 'S/E'}</p>
                </div>
                <div className="squad-card-actions">
                    <span className="action-icon" onClick={(e) => { e.stopPropagation(); onSelectPlayer(player); }}>
                        <Edit className="w-4 h-4" />
                    </span>
                    <span className="action-icon" onClick={(e) => { e.stopPropagation(); onRemovePlayer(player); }}>
                        <X className="w-4 h-4" />
                    </span>
                </div>
            </div>
        );
    }

    function renderSection(title: string, groups: any, color: string) {
        const groupEntries = Object.entries(groups);
        if (groupEntries.length === 0) return null;

        return (
            <div className="rugby-section">
                <div className="section-divider" style={{ color }}>
                    {title}
                </div>

                {groupEntries.map(([groupName, data]: [string, any]) => {
                    const { players: groupPlayers, config } = data;
                    const count = groupPlayers.length;
                    const max = config?.max_recommended || '?';

                    return (
                        <div key={groupName}>
                            <div className="pos-group-label">
                                {groupName}
                                <span>Cupo: {count}/{max}</span>
                            </div>
                            {groupPlayers.map((player: PlayerWithDetails) =>
                                renderPlayerCard(player, player.id === selectedPlayerId)
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <section className="col">
            <div className="col-header">
                <div className="col-title">
                    Composición de Plantel
                    <span style={{ fontFamily: 'JetBrains Mono' }}>
                        {players.length} JUGADORES
                    </span>
                </div>
            </div>
            <div className="scroll-area">
                {players.length === 0 ? (
                    <div className="empty-state">
                        <Users className="w-16 h-16 opacity-20" />
                        <p>No hay jugadores en el plantel</p>
                        <small>Agrega jugadores desde la columna izquierda</small>
                    </div>
                ) : (
                    <>
                        {renderSection('FORWARDS', forwardGroups, 'var(--forward-color)')}
                        {renderSection('BACKS', backGroups, 'var(--back-color)')}
                    </>
                )}
            </div>
        </section>
    );
}
