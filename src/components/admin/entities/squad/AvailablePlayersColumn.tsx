'use client';

import { useState } from 'react';
import { PlayerWithDetails } from '@/lib/types/squad';
import { Search, Plus, User } from 'lucide-react';

interface AvailablePlayersColumnProps {
    players: PlayerWithDetails[];
    onAddPlayer: (player: PlayerWithDetails) => void;
    squadPlayerIds: Set<string>;
}

export function AvailablePlayersColumn({ players, onAddPlayer, squadPlayerIds }: AvailablePlayersColumnProps) {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredPlayers = players.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.position.toLowerCase().includes(searchQuery.toLowerCase())
    );

    function getStatusBadge(player: PlayerWithDetails) {
        if (squadPlayerIds.has(player.id)) {
            return <span className="badge badge-squad">En Plantel</span>;
        }
        if (player.status === 'injured') {
            return <span className="badge badge-injured">Lesionado</span>;
        }
        if (player.status === 'suspended') {
            return <span className="badge badge-suspended">Suspendido</span>;
        }
        return null;
    }

    function getAge(birthDate: string | null): number | null {
        if (!birthDate) return null;
        return new Date().getFullYear() - new Date(birthDate).getFullYear();
    }

    return (
        <aside className="col">
            <div className="col-header">
                <div className="col-title">
                    Jugadores del Club
                    <Search className="w-4 h-4" />
                </div>
            </div>
            <div className="scroll-area">
                <div className="search-container">
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Buscar jugador o posición..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {filteredPlayers.length === 0 ? (
                    <div className="empty-state">
                        <User className="w-12 h-12 opacity-20" />
                        <p>No se encontraron jugadores</p>
                    </div>
                ) : (
                    filteredPlayers.map((player) => {
                        const age = getAge(player.birth_date);
                        const isInSquad = squadPlayerIds.has(player.id);
                        const isDisabled = player.status === 'injured' || player.status === 'suspended';

                        return (
                            <div key={player.id} className="player-card-mini">
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
                                    <p>{player.position} · {age ? `${age} años` : 'Edad desconocida'}</p>
                                </div>
                                {getStatusBadge(player) || (
                                    !isInSquad && !isDisabled && (
                                        <button
                                            className="btn-add-player"
                                            onClick={() => onAddPlayer(player)}
                                            title="Agregar al plantel"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    )
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </aside>
    );
}
