'use client';

import { useEffect, useMemo, useState } from 'react';
import { Database } from '@/lib/database.types';
import { LayoutGrid, List, Plus, Search, Shield, Upload, Users } from 'lucide-react';
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
    const { id, data } = props;
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [searchQuery, setSearchQuery] = useState('');
    const [players, setPlayers] = useState<PersonWithRole[]>([]);
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [loading, setLoading] = useState(true);
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
    const playersAtClubLevel = players.length - playersAssignedToDivision;

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
            <div className="manager-card">
                <header className="manager-header">
                    <div className="manager-header-titles">
                        <h1 className="flex items-center gap-3"><Shield className="w-6 h-6 text-[var(--accent)]" /> Jugadores</h1>
                        <p>
                            Altas, edicion, asignacion deportiva e importacion rapida de {data?.name || 'este club'}.
                        </p>
                    </div>
                    <div className="manager-metadata-box" id="status-indicator">
                        TOTAL: {players.length} | ASIGNADOS: {playersAssignedToDivision}
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="manager-input-group">
                        <label className="manager-field-label">Busqueda Rapida</label>
                        <div className="relative flex items-center">
                            <Search className="absolute left-4 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                className="manager-url-input pl-12"
                                placeholder="Nombre, posicion o division..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="manager-input-group">
                        <label className="manager-field-label">Modo de Vista</label>
                        <div className="manager-tabs">
                            <div className="manager-tab-indicator" style={{ transform: `translateX(${viewMode === 'cards' ? '0%' : '100%'})` }}></div>
                            <button
                                className={`manager-tab-btn ${viewMode === 'cards' ? 'active text-[var(--bg)]' : ''}`}
                                onClick={(e) => { e.preventDefault(); setViewMode('cards'); }}
                            >
                                <LayoutGrid className="w-4 h-4 inline mr-1.5" /> Tarjetas
                            </button>
                            <button
                                className={`manager-tab-btn ${viewMode === 'table' ? 'active text-[var(--bg)]' : ''}`}
                                onClick={(e) => { e.preventDefault(); setViewMode('table'); }}
                            >
                                <List className="w-4 h-4 inline mr-1.5" /> Tabla
                            </button>
                        </div>
                    </div>

                    <div className="manager-input-group">
                        <label className="manager-field-label">Acciones Rapidas</label>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleRegisterPlayer}
                                className="bg-[var(--accent)] text-[var(--bg)] px-4 py-3 font-bold uppercase tracking-widest text-xs border border-[var(--accent)] hover:opacity-80 transition-opacity flex items-center justify-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Registrar jugador
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsImportOpen(true)}
                                className="px-4 py-3 border border-[var(--border)] font-bold uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2"
                                style={{ background: 'var(--surface-soft-strong)', color: 'var(--text)' }}
                                title="Importacion masiva"
                            >
                                <Upload className="w-4 h-4" />
                                Importacion masiva
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {actionMessage && (
                <div className="manager-card border-[var(--accent)]/25">
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

            {loading ? (
                <div className="manager-card">
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-12 h-12 border-2 border-[var(--accent)]/20 border-t-[var(--accent)] rounded-full animate-spin"></div>
                        <p className="uppercase text-xs tracking-widest" style={{ color: 'var(--text-muted)' }}>Cargando jugadores...</p>
                    </div>
                </div>
            ) : viewMode === 'cards' ? (
                <div className="manager-card">
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col gap-4 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6 md:flex-row md:items-center md:justify-between">
                            <div className="max-w-3xl">
                                <p className="uppercase text-[11px] font-black tracking-[0.24em]" style={{ color: 'var(--accent)' }}>
                                    Vista del club
                                </p>
                                <h2 className="mt-3 text-2xl font-black uppercase tracking-tight" style={{ color: 'var(--text)' }}>
                                    Jugadores
                                </h2>
                                <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-muted)' }}>
                                    Cada alta queda vinculada al club. Puedes asignarla a una division cuando haga falta, pero la vista principal muestra a las personas, no a los planteles.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 sm:min-w-[240px]">
                                <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                                    <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>Total</p>
                                    <p className="mt-1 text-xl font-black" style={{ color: 'var(--text)' }}>{players.length}</p>
                                </div>
                                <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                                    <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>Club</p>
                                    <p className="mt-1 text-xl font-black" style={{ color: 'var(--text)' }}>{playersAtClubLevel}</p>
                                </div>
                            </div>
                        </div>

                        {filteredPlayers.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {filteredPlayers.map((person) => (
                                    <div
                                        key={person.id}
                                        className="rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4 transition-colors hover:border-[var(--accent)]/40 hover:bg-[rgba(255,255,255,0.06)]"
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-start gap-4 text-left"
                                            onClick={() => {
                                                setEditingPlayer(person);
                                                setIsAddPlayerOpen(true);
                                            }}
                                        >
                                            <div className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: 'var(--surface-row)', border: '1px solid var(--border-standard)' }}>
                                                {person.photo_url ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={person.photo_url} alt={person.first_name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <Users className="w-5 h-5" style={{ color: 'var(--text-dim)' }} />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-black uppercase leading-tight" style={{ color: 'var(--text)' }}>
                                                    {person.first_name} {person.last_name}
                                                </p>
                                                <p className="mt-2 text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                                    {person.position || 'Sin posicion'}
                                                </p>
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <span className="anodized-tag" style={{ color: 'var(--text-muted)' }}>
                                                        {person.division_name || 'Club'}
                                                    </span>
                                                    {person.birth_date ? (
                                                        <span className="anodized-tag" style={{ color: 'var(--text-muted)' }}>
                                                            {new Date(person.birth_date).toLocaleDateString('es-AR')}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] px-4 py-10 text-center">
                                <Shield className="w-12 h-12 mx-auto opacity-50" style={{ color: 'var(--text-dim)' }} />
                                <p className="mt-4 uppercase text-sm tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                    {players.length === 0 ? 'Aun no hay jugadores cargados' : 'No hay coincidencias para esta busqueda'}
                                </p>
                                <p className="mt-2 text-xs uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
                                    {players.length === 0
                                        ? 'El primer alta que registres quedara asociada a este club.'
                                        : 'Prueba con otro nombre, posicion o division.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="manager-card">
                    <header className="manager-header">
                        <div className="manager-header-titles">
                            <h1>Vista Completa de Jugadores</h1>
                            <p>Listado detallado de las personas registradas en el club.</p>
                        </div>
                    </header>

                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--border)]">
                                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Jugador</th>
                                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Posicion</th>
                                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Division</th>
                                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Nacimiento</th>
                                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPlayers.map((person) => (
                                    <tr
                                        key={person.id}
                                        className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors cursor-pointer"
                                        onClick={() => {
                                            setEditingPlayer(person);
                                            setIsAddPlayerOpen(true);
                                        }}
                                    >
                                        <td className="px-6 py-5">
                                            <div className="font-bold text-sm uppercase tracking-tight" style={{ color: 'var(--text)' }}>
                                                {person.first_name} {person.last_name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-sm font-medium uppercase" style={{ color: 'var(--text)' }}>
                                            {person.position || 'Sin posicion'}
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="anodized-tag inline-block">{person.division_name || 'Club'}</div>
                                        </td>
                                        <td className="px-6 py-5 text-sm" style={{ color: 'var(--text)' }}>
                                            {person.birth_date ? new Date(person.birth_date).toLocaleDateString('es-AR') : 'Sin fecha'}
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="anodized-tag inline-flex items-center gap-2 text-[var(--success)] border-[var(--success)]/30">
                                                {person.status || 'active'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
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
                    setActionMessage('Importacion completada.');
                }}
            />
        </div>
    );
}
