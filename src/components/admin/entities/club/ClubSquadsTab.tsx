'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from '@/lib/database.types';
import { clsx } from 'clsx';
import { Division, fetchDivisions } from '@/lib/services/divisionService';
import { Users, Trophy, Calendar, Plus, LayoutGrid, List, Filter, Search, Shield } from 'lucide-react';
import { PersonManagementModal } from './PersonManagementModal';
import { fetchPeopleByClub, PersonWithRole } from '@/lib/services/personService';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

function getColorClass(id: string) {
    const num = id.charCodeAt(0) + id.charCodeAt(id.length - 1);
    const classes = [
        'from-blue-600 to-indigo-600',
        'from-emerald-500 to-teal-600',
        'from-orange-400 to-red-500',
        'from-purple-500 to-fuchsia-600',
        'from-cyan-500 to-blue-500',
    ];
    return classes[num % classes.length];
}

interface ClubSquadsTabProps {
    id: string;
    data?: ClubRow;
}

interface SquadSummary {
    id: string;
    name: string;
    shortName: string;
    category: string;
    season: string;
    tag: string;
    tagColor: string;
    sport: string;
    status: string;
    colorClass: string;
    players: number;
    staff: number;
    is_family_division?: boolean;
    roster_owner_club_id?: string | null;
    linked_clubs?: Array<{ id: string; name: string }>;
}

async function loadClubSquads(clubId: string): Promise<SquadSummary[]> {
    const divisions = await fetchDivisions(clubId);

    return divisions.map((division) => ({
        id: division.id,
        name: division.name || 'Sin nombre',
        shortName: (division.name || 'SQD').substring(0, 3).toUpperCase(),
        category: division.category || division.sport || 'Categoria',
        season: division.season || String(new Date().getFullYear()),
        tag: division.status === 'active' ? 'Competencia' : '',
        tagColor: division.status === 'active' ? 'green' : 'gray',
        sport: division.sport || 'Rugby',
        status: division.status || 'draft',
        colorClass: getColorClass(division.id),
        players: division.players_count || 0,
        staff: division.staff_count || 0,
        is_family_division: division.is_family_division,
        roster_owner_club_id: division.roster_owner_club_id,
        linked_clubs: division.linked_clubs,
    }));
}

async function loadClubLevelPlayers(clubId: string): Promise<PersonWithRole[]> {
    const people = await fetchPeopleByClub(clubId);
    return people.filter((person) => person.role === 'player' && !person.division_id);
}

export function ClubSquadsTab({ id }: ClubSquadsTabProps) {
    const router = useRouter();
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [searchQuery, setSearchQuery] = useState('');
    const [squads, setSquads] = useState<SquadSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState<PersonWithRole | null>(null);
    const [clubPlayers, setClubPlayers] = useState<PersonWithRole[]>([]);

    useEffect(() => {
        let isMounted = true;

        const loadInitialSquads = async () => {
            setLoading(true);
            try {
                const nextSquads = await loadClubSquads(id);
                const nextClubPlayers = await loadClubLevelPlayers(id);
                if (isMounted) {
                    setSquads(nextSquads);
                    setClubPlayers(nextClubPlayers);
                }
            } catch (error) {
                console.error('Error loading squads:', error);
                if (isMounted) {
                    setSquads([]);
                    setClubPlayers([]);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void loadInitialSquads();

        return () => {
            isMounted = false;
        };
    }, [id]);

    function openRoster(squadId: string) {
        router.push(`/admin/super/clubes/${id}/planteles/${squadId}`);
    }

    function handleRegisterPlayer() {
        setActionMessage(null);
        setEditingPlayer(null);
        setIsAddPlayerOpen(true);
    }

    async function refreshClubPlayers() {
        const nextClubPlayers = await loadClubLevelPlayers(id);
        setClubPlayers(nextClubPlayers);
    }

    const filteredSquads = squads.filter((squad) =>
        squad.name.toLowerCase().includes(searchQuery.toLowerCase())
        || squad.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const activeSquads = filteredSquads.filter((squad) => squad.status === 'active' || squad.status === 'paused');
    const draftSquads = filteredSquads.filter((squad) => squad.status === 'draft');
    const historicalSquads = filteredSquads.filter((squad) => squad.status === 'archived');
    const modalDivisions: Division[] = squads.map((squad) => ({
        id: squad.id,
        club_id: id,
        name: squad.name,
        category: squad.category,
        sport: squad.sport,
        gender: 'Masculino',
        season: squad.season,
        status: squad.status === 'archived' || squad.status === 'draft' ? squad.status : 'active',
        players_count: squad.players,
        staff_count: squad.staff,
        is_family_division: squad.is_family_division,
        roster_owner_club_id: squad.roster_owner_club_id,
        linked_clubs: squad.linked_clubs,
    }));

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
            <div className="manager-card">
                <header className="manager-header">
                    <div className="manager-header-titles">
                        <h1 className="flex items-center gap-3"><Shield className="w-6 h-6 text-[var(--accent)]" /> Gestion de Planteles</h1>
                        <p>Administracion de divisiones, planteles y categorias del club.</p>
                    </div>
                    <div className="manager-metadata-box" id="status-indicator">
                        TOTAL: {squads.length} | ACTIVOS: {activeSquads.length}
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
                                placeholder="Nombre o categoria..."
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
                        <div className="flex gap-3">
                            <button
                                onClick={handleRegisterPlayer}
                                className="flex-1 bg-[var(--accent)] text-[var(--bg)] px-4 py-3 font-bold uppercase tracking-widest text-xs border border-[var(--accent)] hover:opacity-80 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Plus className="w-4 h-4" />
                                Registrar Jugador
                            </button>
                            <button className="px-4 py-3 border border-[var(--border)] font-bold uppercase text-xs transition-all flex items-center justify-center" style={{ background: 'var(--surface-soft-strong)', color: 'var(--text)' }}>
                                <Filter className="w-4 h-4" />
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
                        <p className="uppercase text-xs tracking-widest" style={{ color: 'var(--text-muted)' }}>Cargando planteles...</p>
                    </div>
                </div>
            ) : viewMode === 'cards' ? (
                <>
                    {activeSquads.length > 0 && (
                        <div className="manager-card">
                            <header className="manager-header">
                                <div className="manager-header-titles">
                                    <h1 className="flex items-center gap-3"><Trophy className="w-6 h-6 text-[var(--success)]" /> Planteles Activos</h1>
                                    <p>Divisiones en competencia actual y operativas.</p>
                                </div>
                                <div className="manager-metadata-box">
                                    COUNT: {activeSquads.length}
                                </div>
                            </header>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {activeSquads.map((squad) => (
                                    <div
                                        key={squad.id}
                                        className="strata-card p-0 overflow-hidden cursor-pointer group"
                                        onClick={() => openRoster(squad.id)}
                                    >
                                        <div className={clsx('h-28 relative overflow-hidden bg-gradient-to-br', squad.colorClass)}>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-7xl font-black tracking-tighter" style={{ color: 'rgba(148, 163, 184, 0.18)' }}>{squad.shortName}</span>
                                            </div>
                                            <div className="absolute top-3 right-3 flex gap-2">
                                                {squad.status === 'active' && (
                                                    <div className="status-badge bg-[var(--success)]"></div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="p-5">
                                            <h3 className="font-bold text-lg mb-1 truncate uppercase tracking-tight" style={{ color: 'var(--text)' }}>
                                                {squad.name}
                                            </h3>
                                            <p className="text-xs uppercase tracking-widest mb-4 font-bold" style={{ color: 'var(--text-muted)' }}>
                                                {squad.sport} / {squad.category}
                                            </p>

                                            <div className="flex items-center justify-between pt-4 border-t border-[rgba(255,255,255,0.05)]">
                                                <div className="flex items-center gap-2" style={{ color: 'var(--text)' }}>
                                                    <Users className="w-4 h-4 text-[var(--accent)]" />
                                                    <span className="font-black text-sm">{squad.players}</span>
                                                    <span className="text-xs uppercase" style={{ color: 'var(--text-muted)' }}>jugadores</span>
                                                </div>
                                                <div className="anodized-tag" style={{ color: 'var(--text-muted)' }}>
                                                    {squad.season}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {draftSquads.length > 0 && (
                        <div className="manager-card">
                            <header className="manager-header">
                                <div className="manager-header-titles">
                                    <h1 className="flex items-center gap-3"><Calendar className="w-6 h-6 text-[var(--warning)]" /> Borradores</h1>
                                    <p>Planteles en preparacion o pendientes de activacion.</p>
                                </div>
                                <div className="manager-metadata-box">
                                    COUNT: {draftSquads.length}
                                </div>
                            </header>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {draftSquads.map((squad) => (
                                    <div
                                        key={squad.id}
                                        className="strata-card p-0 overflow-hidden cursor-pointer opacity-70 hover:opacity-100"
                                        onClick={() => openRoster(squad.id)}
                                    >
                                        <div className="h-28 relative overflow-hidden bg-gradient-to-br from-gray-700 to-gray-800">
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-7xl font-black tracking-tighter" style={{ color: 'rgba(148, 163, 184, 0.18)' }}>{squad.shortName}</span>
                                            </div>
                                        </div>

                                        <div className="p-5">
                                            <h3 className="font-bold text-lg mb-1 truncate uppercase tracking-tight" style={{ color: 'var(--text)' }}>
                                                {squad.name}
                                            </h3>
                                            <p className="text-xs uppercase tracking-widest mb-4 font-bold" style={{ color: 'var(--text-muted)' }}>
                                                {squad.sport} / {squad.category}
                                            </p>

                                            <div className="flex items-center justify-between pt-4 border-t border-[rgba(255,255,255,0.05)]">
                                                <div className="anodized-tag text-[var(--warning)] border-[var(--warning)]/30">
                                                    BORRADOR
                                                </div>
                                                <div className="anodized-tag" style={{ color: 'var(--text-muted)' }}>
                                                    {squad.season}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {historicalSquads.length > 0 && (
                        <div className="manager-card opacity-60 hover:opacity-100 transition-opacity">
                            <header className="manager-header">
                                <div className="manager-header-titles">
                                    <h1>Archivados</h1>
                                    <p>Planteles historicos y temporadas pasadas.</p>
                                </div>
                                <div className="manager-metadata-box">
                                    COUNT: {historicalSquads.length}
                                </div>
                            </header>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 grayscale">
                                {historicalSquads.map((squad) => (
                                    <div
                                        key={squad.id}
                                        className="strata-card p-0 overflow-hidden cursor-pointer"
                                        onClick={() => openRoster(squad.id)}
                                    >
                                        <div className="h-28 relative overflow-hidden bg-gradient-to-br from-gray-600 to-gray-700">
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-7xl font-black tracking-tighter" style={{ color: 'rgba(148, 163, 184, 0.18)' }}>{squad.shortName}</span>
                                            </div>
                                        </div>

                                        <div className="p-5">
                                            <h3 className="font-bold text-lg mb-1 truncate uppercase tracking-tight" style={{ color: 'var(--text)' }}>
                                                {squad.name}
                                            </h3>
                                            <p className="text-xs uppercase tracking-widest mb-4 font-bold" style={{ color: 'var(--text-muted)' }}>
                                                Temporada {squad.season}
                                            </p>

                                            <div className="flex items-center justify-between pt-4 border-t border-[rgba(255,255,255,0.05)]">
                                                <div className="anodized-tag" style={{ color: 'var(--text-dim)' }}>
                                                    ARCHIVADO
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {filteredSquads.length === 0 && (
                        <div className="manager-card">
                            <div className="flex flex-col gap-6">
                                <div className="flex flex-col items-center justify-center py-10 gap-4">
                                    <Shield className="w-16 h-16 opacity-50" style={{ color: 'var(--text-dim)' }} />
                                    <p className="uppercase text-sm tracking-widest" style={{ color: 'var(--text-muted)' }}>No se encontraron planteles</p>
                                    <p className="max-w-xl text-center text-xs uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
                                        Todavia no hay divisiones configuradas. Igual podes registrar jugadores a nivel club.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingPlayer(null);
                                            setIsAddPlayerOpen(true);
                                        }}
                                        className="bg-[var(--accent)] text-[var(--bg)] px-4 py-2 font-bold uppercase tracking-widest text-xs border border-[var(--accent)] hover:opacity-80 transition-opacity flex items-center justify-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Registrar jugador
                                    </button>
                                </div>

                                {clubPlayers.length > 0 && (
                                    <div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
                                        <div className="flex items-center justify-between gap-4 mb-4">
                                            <div>
                                                <p className="uppercase font-black tracking-tight" style={{ color: 'var(--text)' }}>Jugadores del club</p>
                                                <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
                                                    Registrados sin division especifica.
                                                </p>
                                            </div>
                                            <div className="manager-metadata-box">
                                                TOTAL: {clubPlayers.length}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                            {clubPlayers.map((person) => (
                                                <div
                                                    key={person.id}
                                                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-3 transition-colors hover:border-[var(--accent)]/40 hover:bg-[rgba(255,255,255,0.06)]"
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => {
                                                        setEditingPlayer(person);
                                                        setIsAddPlayerOpen(true);
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            setEditingPlayer(person);
                                                            setIsAddPlayerOpen(true);
                                                        }
                                                    }}
                                                >
                                                    <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: 'var(--surface-row)', border: '1px solid var(--border-standard)' }}>
                                                        {person.photo_url ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img src={person.photo_url} alt={person.first_name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Users className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-black truncate uppercase" style={{ color: 'var(--text)' }}>
                                                            {person.first_name} {person.last_name}
                                                        </p>
                                                        <p className="text-[10px] uppercase tracking-widest truncate" style={{ color: 'var(--text-muted)' }}>
                                                            {person.position || 'Sin posicion'}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="manager-card">
                    <header className="manager-header">
                        <div className="manager-header-titles">
                            <h1>Vista Completa de Planteles</h1>
                            <p>Listado detallado con informacion expandida.</p>
                        </div>
                    </header>

                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--border)]">
                                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Plantel</th>
                                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Deporte</th>
                                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Temporada</th>
                                    <th className="px-6 py-4 text-center text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Jugadores</th>
                                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSquads.map((squad) => (
                                    <tr
                                        key={squad.id}
                                        className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors cursor-pointer"
                                        onClick={() => openRoster(squad.id)}
                                    >
                                        <td className="px-6 py-5">
                                            <div className="font-bold text-sm uppercase tracking-tight" style={{ color: 'var(--text)' }}>{squad.name}</div>
                                            <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>{squad.category}</div>
                                        </td>
                                        <td className="px-6 py-5 text-sm font-medium uppercase" style={{ color: 'var(--text)' }}>{squad.sport}</td>
                                        <td className="px-6 py-5">
                                            <div className="anodized-tag inline-block">{squad.season}</div>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <span className="font-black text-base" style={{ color: 'var(--text)' }}>{squad.players}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className={clsx(
                                                'anodized-tag inline-flex items-center gap-2',
                                                squad.status === 'active' ? 'text-[var(--success)] border-[var(--success)]/30'
                                                    : squad.status === 'draft' ? 'text-[var(--warning)] border-[var(--warning)]/30'
                                                        : 'text-[#666] border-[#666]/30'
                                            )}>
                                                {squad.status === 'active' && <span className="status-badge bg-[var(--success)]"></span>}
                                                {squad.status === 'active' ? 'ACTIVO' : squad.status === 'draft' ? 'BORRADOR' : squad.status === 'paused' ? 'RECESO' : 'ARCHIVADO'}
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
                divisions={modalDivisions}
                isOpen={isAddPlayerOpen}
                onClose={() => {
                    setIsAddPlayerOpen(false);
                    setEditingPlayer(null);
                }}
                onSuccess={async () => {
                    await refreshClubPlayers();
                    setActionMessage(editingPlayer ? 'Jugador actualizado.' : 'Jugador registrado.');
                }}
                initialMode="player"
                person={editingPlayer}
            />
        </div>
    );
}
