'use client';

import { useEffect, useMemo, useState } from 'react';
import { Database } from '@/lib/database.types';
import { LayoutGrid, List, Plus, Search, Shield, Upload } from 'lucide-react';
import { Division, fetchDivisions } from '@/lib/services/divisionService';
import { fetchPeopleByClub, PersonWithRole } from '@/lib/services/personService';
import { PersonManagementModal } from './PersonManagementModal';
import { CSVImportModal } from './CSVImportModal';
import type { ClubConsoleMode } from '@/lib/clubAdminRoutes';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubSquadsTabProps {
    id: string;
    data?: ClubRow;
    navigationMode?: ClubConsoleMode;
    initialPlayers?: PersonWithRole[];
    initialPlayersLoaded?: boolean;
    initialDivisions?: Division[];
    initialDivisionsLoaded?: boolean;
}

function getInitials(firstName?: string | null, lastName?: string | null): string {
    const first = firstName?.trim().charAt(0).toUpperCase() ?? '';
    const last = lastName?.trim().charAt(0).toUpperCase() ?? '';
    return `${first}${last}` || '??';
}

async function loadClubPlayers(clubId: string): Promise<PersonWithRole[]> {
    const people = await fetchPeopleByClub(clubId);

    return people
        .filter((person) => person.role === 'player')
        .sort((left, right) => {
            const leftName = `${left.first_name} ${left.last_name}`.trim().toLowerCase();
            const rightName = `${right.first_name} ${right.last_name}`.trim().toLowerCase();
            return leftName.localeCompare(rightName);
        });
}

export function ClubSquadsTab(props: ClubSquadsTabProps) {
    const {
        id,
        data,
        initialPlayers,
        initialPlayersLoaded = false,
        initialDivisions,
        initialDivisionsLoaded = false,
    } = props;
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [searchQuery, setSearchQuery] = useState('');
    const [players, setPlayers] = useState<PersonWithRole[]>(initialPlayers ?? []);
    const [divisions, setDivisions] = useState<Division[]>(initialDivisions ?? []);
    const [loading, setLoading] = useState(!(initialPlayersLoaded && initialDivisionsLoaded));
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState<PersonWithRole | null>(null);

    async function refreshPlayersData() {
        const [nextPlayers, nextDivisions] = await Promise.all([
            loadClubPlayers(id),
            fetchDivisions(id),
        ]);
        setPlayers(nextPlayers);
        setDivisions(nextDivisions);
    }

    useEffect(() => {
        setPlayers(initialPlayersLoaded ? (initialPlayers ?? []) : []);
        setDivisions(initialDivisionsLoaded ? (initialDivisions ?? []) : []);
        setLoading(!(initialPlayersLoaded && initialDivisionsLoaded));
    }, [id, initialDivisions, initialDivisionsLoaded, initialPlayers, initialPlayersLoaded]);

    useEffect(() => {
        if (initialPlayersLoaded && initialDivisionsLoaded) {
            return;
        }

        let isMounted = true;

        const loadInitialData = async () => {
            setLoading(true);
            try {
                const [nextPlayers, nextDivisions] = await Promise.all([
                    loadClubPlayers(id),
                    fetchDivisions(id),
                ]);

                if (isMounted) {
                    setPlayers(nextPlayers);
                    setDivisions(nextDivisions);
                }
            } catch (error) {
                console.error('Error loading club players:', error);
                if (isMounted) {
                    setPlayers([]);
                    setDivisions([]);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void loadInitialData();

        return () => {
            isMounted = false;
        };
    }, [id, initialDivisionsLoaded, initialPlayersLoaded]);

    function handleRegisterPlayer() {
        setActionMessage(null);
        setEditingPlayer(null);
        setIsAddPlayerOpen(true);
    }

    const filteredPlayers = useMemo(() => players.filter((person) => {
        const search = searchQuery.trim().toLowerCase();
        if (!search) return true;

        const candidate = [
            person.first_name,
            person.last_name,
            person.full_name,
            person.position,
            person.division_name,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        return candidate.includes(search);
    }), [players, searchQuery]);

    const playersAssignedToDivision = players.filter((person) => Boolean(person.division_id)).length;

    return (
        <div className="players-module-shell animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
            {/* MODULE INFO */}
            <section className="players-module-info">
                <div className="players-module-title-wrap">
                    <h2>Jugadores</h2>
                    <p>
                        Sistema centralizado de gestión de altas, edición de perfiles,
                        asignación deportiva e importación masiva de activos.
                    </p>
                </div>
                <div className="players-metrics">
                    <div className="players-metric-item">
                        <span className="players-metric-label">Total</span>
                        <span className="players-metric-value">{players.length}</span>
                    </div>
                    <div className="players-metric-item">
                        <span className="players-metric-label">Asignados</span>
                        <span
                            className="players-metric-value"
                            style={{ color: 'var(--text-muted)', opacity: 0.5 }}
                        >
                            {String(playersAssignedToDivision).padStart(2, '0')}
                        </span>
                    </div>
                </div>
            </section>

            {/* CONTROL BAR */}
            <div className="players-control-bar">
                <div className="players-search-zone">
                    <Search className="players-search-zone-icon" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, posición o división..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="players-view-mode">
                    <button
                        className={`players-view-btn ${viewMode === 'cards' ? 'active' : ''}`}
                        onClick={() => setViewMode('cards')}
                    >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        Tarjetas
                    </button>
                    <button
                        className={`players-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                        onClick={() => setViewMode('table')}
                    >
                        <List className="w-3.5 h-3.5" />
                        Tabla
                    </button>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRegisterPlayer}
                        className="btn btn-primary"
                    >
                        <Plus className="w-4 h-4" />
                        Registrar Jugador
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsImportOpen(true)}
                        className="btn"
                        title="Importación masiva"
                    >
                        <Upload className="w-4 h-4" />
                        Importación Masiva
                    </button>
                </div>
            </div>

            {/* ACTION MESSAGE */}
            {actionMessage && (
                <div className="card border-[var(--accent)]/25">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <p className="text-sm" style={{ color: 'var(--text)' }}>{actionMessage}</p>
                        <button
                            type="button"
                            className="px-4 py-2 border border-[var(--border)] font-bold uppercase text-xs transition-all"
                            style={{ background: 'var(--surface-soft-strong)', color: 'var(--text)' }}
                            onClick={() => setActionMessage(null)}
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}

            {/* CONTENT */}
            {loading ? (
                <div className="card">
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-12 h-12 border-2 border-[var(--accent)]/20 border-t-[var(--accent)] rounded-full animate-spin"></div>
                        <p className="uppercase text-xs tracking-widest" style={{ color: 'var(--text-muted)' }}>
                            Cargando jugadores...
                        </p>
                    </div>
                </div>
            ) : viewMode === 'cards' ? (
                <>
                    <div className="players-grid-header">
                        <h3>
                            Vista del Club
                            <span className="players-grid-header-count">
                                • {filteredPlayers.length} PERSONAS
                            </span>
                        </h3>
                        <span className="player-tag-v2">
                            Filtro: {searchQuery.trim() ? 'Búsqueda' : 'Todos'}
                        </span>
                    </div>

                    {filteredPlayers.length > 0 ? (
                        <div className="players-grid">
                            {filteredPlayers.map((person) => (
                                <div
                                    key={person.id}
                                    className="player-card-v2"
                                    onClick={() => {
                                        setEditingPlayer(person);
                                        setIsAddPlayerOpen(true);
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            setEditingPlayer(person);
                                            setIsAddPlayerOpen(true);
                                        }
                                    }}
                                >
                                    <div className="player-avatar-v2">
                                        {person.photo_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={person.photo_url}
                                                alt={person.first_name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            getInitials(person.first_name, person.last_name)
                                        )}
                                    </div>
                                    <div className="player-info-v2">
                                        <div className="player-name-v2">
                                            {person.first_name} {person.last_name}
                                        </div>
                                        <div className="player-meta-v2">
                                            <span className="player-status-v2">
                                                {person.position || 'SIN POSICIÓN'}
                                            </span>
                                            <span className="player-tag-v2">
                                                {person.division_name || 'CLUB'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="players-empty-state">
                            <Shield className="w-12 h-12 mx-auto opacity-50" style={{ color: 'var(--text-dim)' }} />
                            <p className="mt-4 uppercase text-sm tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                {players.length === 0 ? 'Aún no hay jugadores cargados' : 'No hay coincidencias para esta búsqueda'}
                            </p>
                            <p className="mt-2 text-xs uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
                                {players.length === 0
                                    ? 'El primer alta que registres quedará asociada a este club.'
                                    : 'Prueba con otro nombre, posición o división.'}
                            </p>
                        </div>
                    )}
                </>
            ) : (
                <>
                    <div className="players-grid-header">
                        <h3>
                            Vista del Club
                            <span className="players-grid-header-count">
                                • {filteredPlayers.length} PERSONAS
                            </span>
                        </h3>
                        <span className="player-tag-v2">
                            Filtro: {searchQuery.trim() ? 'Búsqueda' : 'Todos'}
                        </span>
                    </div>

                    {filteredPlayers.length > 0 ? (
                        <div className="players-table-wrap">
                            <table className="players-table">
                                <thead>
                                    <tr>
                                        <th>Jugador</th>
                                        <th>Posición</th>
                                        <th>División</th>
                                        <th>Nacimiento</th>
                                        <th>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredPlayers.map((person) => (
                                        <tr
                                            key={person.id}
                                            onClick={() => {
                                                setEditingPlayer(person);
                                                setIsAddPlayerOpen(true);
                                            }}
                                        >
                                            <td>
                                                <div className="players-table-name">
                                                    {person.first_name} {person.last_name}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="player-status-v2">
                                                    {person.position || 'SIN POSICIÓN'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="player-tag-v2">
                                                    {person.division_name || 'CLUB'}
                                                </span>
                                            </td>
                                            <td>
                                                {person.birth_date ? new Date(person.birth_date).toLocaleDateString('es-AR') : 'Sin fecha'}
                                            </td>
                                            <td>
                                                <span className="player-tag-v2" style={{ color: 'var(--success)', borderColor: 'rgba(34,197,94,0.3)' }}>
                                                    {person.status || 'ACTIVE'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="players-empty-state">
                            <Shield className="w-12 h-12 mx-auto opacity-50" style={{ color: 'var(--text-dim)' }} />
                            <p className="mt-4 uppercase text-sm tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                {players.length === 0 ? 'Aún no hay jugadores cargados' : 'No hay coincidencias para esta búsqueda'}
                            </p>
                            <p className="mt-2 text-xs uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
                                {players.length === 0
                                    ? 'El primer alta que registres quedará asociada a este club.'
                                    : 'Prueba con otro nombre, posición o división.'}
                            </p>
                        </div>
                    )}
                </>
            )}

            <PersonManagementModal
                clubId={id}
                divisions={divisions}
                isOpen={isAddPlayerOpen}
                onClose={() => {
                    setIsAddPlayerOpen(false);
                    setEditingPlayer(null);
                }}
                onSuccess={async () => {
                    await refreshPlayersData();
                    setActionMessage(editingPlayer ? 'Jugador actualizado.' : 'Jugador registrado.');
                }}
                initialMode="player"
                person={editingPlayer}
            />

            <CSVImportModal
                clubId={id}
                divisions={divisions}
                isOpen={isImportOpen}
                onClose={() => setIsImportOpen(false)}
                onSuccess={async () => {
                    await refreshPlayersData();
                    setActionMessage('Importación completada.');
                }}
            />
        </div>
    );
}
