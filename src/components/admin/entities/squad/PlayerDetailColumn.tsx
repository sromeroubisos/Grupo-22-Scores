'use client';

import { useState, useEffect } from 'react';
import { PlayerWithDetails } from '@/lib/types/squad';
import { User, Save } from 'lucide-react';

interface PlayerDetailColumnProps {
    player: PlayerWithDetails | null;
    onUpdate: (playerId: string, updates: Partial<PlayerWithDetails>) => void;
}

export function PlayerDetailColumn({ player, onUpdate }: PlayerDetailColumnProps) {
    const [jerseyNumber, setJerseyNumber] = useState<number | null>(null);
    const [role, setRole] = useState<'titular' | 'suplente' | 'desarrollo'>('suplente');
    const [status, setStatus] = useState<'disponible' | 'lesionado' | 'suspendido' | 'convocado' | 'baja'>('disponible');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (player) {
            setJerseyNumber(player.jersey_number || null);
            setRole(player.role || 'suplente');
            setStatus(player.squad_status || 'disponible');
            setNotes(player.notes || '');
        }
    }, [player]);

    function getAge(birthDate: string | null): number | null {
        if (!birthDate) return null;
        return new Date().getFullYear() - new Date(birthDate).getFullYear();
    }

    function handleSave() {
        if (!player) return;
        onUpdate(player.id, {
            jersey_number: jerseyNumber,
            role,
            squad_status: status,
            notes,
        });
    }

    const hasChanges = player && (
        jerseyNumber !== player.jersey_number ||
        role !== player.role ||
        status !== player.squad_status ||
        notes !== (player.notes || '')
    );

    if (!player) {
        return (
            <aside className="col">
                <div className="col-header">
                    <div className="col-title">
                        Detalle del Jugador
                    </div>
                </div>
                <div className="scroll-area">
                    <div className="empty-state" style={{ padding: '60px 20px' }}>
                        <User className="w-16 h-16 opacity-20" />
                        <p style={{ marginTop: '20px' }}>Selecciona un jugador</p>
                        <small style={{ color: 'var(--text-secondary)' }}>
                            Haz clic en un jugador del plantel para ver sus detalles
                        </small>
                    </div>
                </div>
            </aside>
        );
    }

    const age = getAge(player.birth_date);

    return (
        <aside className="col">
            <div className="col-header">
                <div className="col-title">
                    Detalle del Jugador
                    {player.role === 'titular' && <span>⚡ Titular</span>}
                </div>
            </div>
            <div className="scroll-area">
                <div className="detail-profile">
                    {/* Avatar */}
                    <div className="big-avatar">
                        {player.photo_url ? (
                            <img src={player.photo_url} alt={player.name} />
                        ) : (
                            <div className="avatar-placeholder-large">
                                {player.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div
                            className="status-dot"
                            style={{
                                backgroundColor:
                                    status === 'disponible' ? '#10b981' :
                                    status === 'lesionado' ? '#ef4444' :
                                    status === 'suspendido' ? '#f97316' :
                                    status === 'convocado' ? '#3b82f6' : '#6b7280'
                            }}
                        ></div>
                    </div>

                    {/* Name & Position */}
                    <h2 className="detail-name">{player.name}</h2>
                    <p className="detail-pos">{player.position.toUpperCase()} · {role.toUpperCase()}</p>

                    {/* Status Selector */}
                    <div className="status-selector">
                        <div
                            className={`status-chip ${status === 'disponible' ? 'active' : ''}`}
                            onClick={() => setStatus('disponible')}
                        >
                            Disponible
                        </div>
                        <div
                            className={`status-chip ${status === 'lesionado' ? 'active' : ''}`}
                            onClick={() => setStatus('lesionado')}
                        >
                            Lesionado
                        </div>
                        <div
                            className={`status-chip ${status === 'suspendido' ? 'active' : ''}`}
                            onClick={() => setStatus('suspendido')}
                        >
                            Suspendido
                        </div>
                        <div
                            className={`status-chip ${status === 'convocado' ? 'active' : ''}`}
                            onClick={() => setStatus('convocado')}
                        >
                            Convocado
                        </div>
                    </div>

                    {/* Data Grid */}
                    <div className="data-grid">
                        <div className="data-box">
                            <label>Edad</label>
                            <span>{age ? `${age} años` : 'S/D'}</span>
                        </div>
                        <div className="data-box">
                            <label>Altura / Peso</label>
                            <span>
                                {player.height ? `${player.height}m` : 'S/D'} / {player.weight ? `${player.weight}kg` : 'S/D'}
                            </span>
                        </div>
                        <div className="data-box">
                            <label>Dorsal</label>
                            <input
                                type="number"
                                className="dorsal-input"
                                value={jerseyNumber || ''}
                                onChange={(e) => setJerseyNumber(e.target.value ? parseInt(e.target.value) : null)}
                                placeholder="—"
                                min="1"
                                max="99"
                            />
                        </div>
                        <div className="data-box">
                            <label>Rol en Plantel</label>
                            <select
                                className="role-select"
                                value={role}
                                onChange={(e) => setRole(e.target.value as any)}
                            >
                                <option value="titular">Titular</option>
                                <option value="suplente">Suplente</option>
                                <option value="desarrollo">Desarrollo</option>
                            </select>
                        </div>
                    </div>

                    {/* Secondary Positions */}
                    {player.position_secondary && player.position_secondary.length > 0 && (
                        <div className="data-box" style={{ marginBottom: '24px' }}>
                            <label>Posiciones Secundarias</label>
                            <span>{player.position_secondary.join(', ')}</span>
                        </div>
                    )}

                    {/* Technical Notes */}
                    <div className="technical-notes">
                        <label>Notas Técnicas</label>
                        <textarea
                            placeholder="Agregar observaciones del staff técnico..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        ></textarea>
                    </div>

                    {/* Save Button */}
                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--glass-border)' }}>
                        <button
                            className="btn btn-primary"
                            style={{ width: '100%', justifyContent: 'center' }}
                            onClick={handleSave}
                            disabled={!hasChanges}
                        >
                            <Save className="w-4 h-4" />
                            Guardar Cambios
                        </button>
                    </div>
                </div>
            </div>
        </aside>
    );
}
