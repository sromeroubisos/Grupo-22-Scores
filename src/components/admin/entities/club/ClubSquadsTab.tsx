'use client';

import { useEffect, useMemo, useState } from 'react';
import { Database } from '@/lib/database.types';
import { ArrowDownRight, ArrowUpRight, History, LayoutGrid, List, Plus, Repeat2, Search, Shield, Upload } from 'lucide-react';
import { Division, fetchDivisions } from '@/lib/services/divisionService';
import { fetchPeopleByClub, PersonWithRole } from '@/lib/services/personService';
import { PersonManagementModal } from './PersonManagementModal';
import { CSVImportModal } from './CSVImportModal';
import type { ClubConsoleMode } from '@/lib/clubAdminRoutes';

type ClubRow = Database['public']['Tables']['clubs']['Row'];
type ClubSeasonRosterMembership = {
    id: string;
    player_id: string;
    status: string;
    jersey_number?: number | null;
    player?: {
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
        name?: string | null;
    } | null;
};
type ClubSeasonRoster = {
    id: string;
    name: string;
    roster_type: string;
    status: string;
    created_at?: string | null;
    season?: {
        id: string;
        season_code?: string | null;
        name?: string | null;
        display_name?: string | null;
        status?: string | null;
        is_active?: boolean | null;
        start_date?: string | null;
    } | null;
    tournament?: {
        id: string;
        name?: string | null;
        display_name?: string | null;
    } | null;
    memberships?: ClubSeasonRosterMembership[];
};

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

async function loadClubSeasonRosters(clubId: string): Promise<ClubSeasonRoster[]> {
    const response = await fetch(`/api/clubs/${clubId}/season-rosters?includeMemberships=true`, { cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json?.ok) {
        throw new Error(json?.error || 'No se pudieron cargar los planteles por temporada.');
    }
    return Array.isArray(json.rosters) ? json.rosters : [];
}

function getSeasonRosterLabel(roster: ClubSeasonRoster) {
    return roster.season?.display_name || roster.season?.name || roster.season?.season_code || 'Temporada';
}

function getRosterPlayerName(membership: ClubSeasonRosterMembership) {
    const player = membership.player;
    if (!player) return 'Jugador';
    const byParts = `${player.first_name || ''} ${player.last_name || ''}`.trim();
    return player.full_name || player.name || byParts || 'Jugador';
}

export function ClubSquadsTab(props: ClubSquadsTabProps) {
    const {
        id,
        initialPlayers,
        initialPlayersLoaded = false,
        initialDivisions,
        initialDivisionsLoaded = false,
    } = props;
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [searchQuery, setSearchQuery] = useState('');
    const [players, setPlayers] = useState<PersonWithRole[]>(initialPlayers ?? []);
    const [divisions, setDivisions] = useState<Division[]>(initialDivisions ?? []);
    const [seasonRosters, setSeasonRosters] = useState<ClubSeasonRoster[]>([]);
    const [seasonRostersLoading, setSeasonRostersLoading] = useState(true);
    const [loading, setLoading] = useState(!(initialPlayersLoaded && initialDivisionsLoaded));
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState<PersonWithRole | null>(null);

    async function refreshPlayersData() {
        const [nextPlayers, nextDivisions, nextSeasonRosters] = await Promise.all([
            loadClubPlayers(id),
            fetchDivisions(id),
            loadClubSeasonRosters(id),
        ]);
        setPlayers(nextPlayers);
        setDivisions(nextDivisions);
        setSeasonRosters(nextSeasonRosters);
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

    useEffect(() => {
        let isMounted = true;
        setSeasonRostersLoading(true);
        loadClubSeasonRosters(id)
            .then((nextRosters) => {
                if (isMounted) setSeasonRosters(nextRosters);
            })
            .catch(() => {
                if (isMounted) setSeasonRosters([]);
            })
            .finally(() => {
                if (isMounted) setSeasonRostersLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [id]);

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
    const sortedSeasonRosters = useMemo(
        () => [...seasonRosters].sort((left, right) => {
            const leftDate = left.season?.start_date || left.created_at || '';
            const rightDate = right.season?.start_date || right.created_at || '';
            return rightDate.localeCompare(leftDate);
        }),
        [seasonRosters],
    );
    const currentSeasonRosters = useMemo(
        () => sortedSeasonRosters.filter((roster) => roster.season?.is_active || roster.season?.status === 'active'),
        [sortedSeasonRosters],
    );
    const latestRoster = currentSeasonRosters[0] || sortedSeasonRosters[0] || null;
    const previousRoster = sortedSeasonRosters.find((roster) => roster.id !== latestRoster?.id) || null;
    const latestPlayerIds = new Set((latestRoster?.memberships ?? [])
        .filter((membership) => membership.status !== 'released' && membership.status !== 'inactive')
        .map((membership) => membership.player_id)
        .filter(Boolean));
    const previousPlayerIds = new Set((previousRoster?.memberships ?? [])
        .filter((membership) => membership.status !== 'released' && membership.status !== 'inactive')
        .map((membership) => membership.player_id)
        .filter(Boolean));
    const repeatedPlayers = Array.from(latestPlayerIds).filter((playerId) => previousPlayerIds.has(playerId)).length;
    const newPlayers = Array.from(latestPlayerIds).filter((playerId) => !previousPlayerIds.has(playerId)).length;
    const departedPlayers = Array.from(previousPlayerIds).filter((playerId) => !latestPlayerIds.has(playerId)).length;

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

            <section className="card" style={{ display: 'grid', gap: 18 }}>
                <div className="card-header">
                    <div>
                        <div className="card-title">Planteles por temporada</div>
                        <div className="subinfo" style={{ marginTop: '0.25rem' }}>
                            Lectura directa de season_rosters y roster_memberships del club.
                        </div>
                    </div>
                    <History className="w-5 h-5 text-muted" />
                </div>

                {seasonRostersLoading ? (
                    <div className="py-10 flex items-center justify-center gap-3 opacity-60">
                        <div className="w-5 h-5 border-2 border-[var(--accent)]/20 border-t-[var(--accent)] rounded-full animate-spin" />
                        <span className="text-xs uppercase tracking-widest">Cargando planteles historicos...</span>
                    </div>
                ) : sortedSeasonRosters.length > 0 ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="players-metric-item">
                                <span className="players-metric-label">Actual</span>
                                <span className="players-metric-value">{latestRoster?.memberships?.length ?? 0}</span>
                            </div>
                            <div className="players-metric-item">
                                <span className="players-metric-label">Repiten</span>
                                <span className="players-metric-value">{repeatedPlayers}</span>
                            </div>
                            <div className="players-metric-item">
                                <span className="players-metric-label">Altas</span>
                                <span className="players-metric-value">{newPlayers}</span>
                            </div>
                            <div className="players-metric-item">
                                <span className="players-metric-label">Bajas</span>
                                <span className="players-metric-value">{departedPlayers}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            {sortedSeasonRosters.slice(0, 6).map((roster) => {
                                const activePlayers = (roster.memberships ?? []).filter((membership) => membership.status !== 'released' && membership.status !== 'inactive');
                                const isCurrent = roster.id === latestRoster?.id || roster.season?.is_active || roster.season?.status === 'active';
                                return (
                                    <article
                                        key={roster.id}
                                        className="border border-[var(--border)] bg-[var(--surface-soft)] p-4"
                                        style={{ borderRadius: 12 }}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-[11px] uppercase tracking-[0.16em] text-muted">
                                                    {roster.tournament?.display_name || roster.tournament?.name || 'Torneo'}
                                                </div>
                                                <h3 className="font-black text-base mt-1">{getSeasonRosterLabel(roster)}</h3>
                                                <p className="text-xs text-muted mt-1">{roster.name} - {roster.status}</p>
                                            </div>
                                            <span className="player-tag-v2">
                                                {isCurrent ? 'Actual' : 'Historico'}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3 mt-4 text-xs text-muted">
                                            <span className="inline-flex items-center gap-1"><Repeat2 className="w-3.5 h-3.5" /> {activePlayers.length} jugadores</span>
                                            {isCurrent && previousRoster ? (
                                                <>
                                                    <span className="inline-flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5" /> {newPlayers} altas</span>
                                                    <span className="inline-flex items-center gap-1"><ArrowDownRight className="w-3.5 h-3.5" /> {departedPlayers} bajas</span>
                                                </>
                                            ) : null}
                                        </div>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {activePlayers.slice(0, 8).map((membership) => (
                                                <span key={membership.id} className="player-tag-v2">
                                                    {membership.jersey_number ? `#${membership.jersey_number} ` : ''}{getRosterPlayerName(membership)}
                                                </span>
                                            ))}
                                            {activePlayers.length > 8 ? (
                                                <span className="player-tag-v2">+{activePlayers.length - 8}</span>
                                            ) : null}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <div className="py-10 text-center text-sm text-muted">
                        Todavia no hay planteles por temporada para este club.
                    </div>
                )}
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
                                                <span className="player-tag-v2" style={{ color: 'var(--ca-success)', borderColor: 'color-mix(in srgb, var(--ca-success) 30%, transparent)' }}>
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
