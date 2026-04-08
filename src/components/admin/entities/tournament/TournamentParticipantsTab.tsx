'use client';

/**
 * TOURNAMENT PARTICIPANTS TAB - FLASH UI PREMIUM
 * Fully functional, database-connected, premium design
 *
 * Features:
 * - Real-time counters (Total, Active, Inactive, Pending)
 * - Premium Flash UI dark lattice design
 * - Horizontal filter bar (search, type, status, group, sort)
 * - Full CRUD operations (Create, Read, Update, Delete)
 * - Bulk actions support
 * - Import/Export functionality
 * - Edit mode drawer
 * - History drawer (with honest empty state if no audit)
 * - Responsive design (desktop-first, collapses gracefully)
 * - All buttons functional, no placebo elements
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
    Users, Search, Plus, Download, FileUp, History,
    Pencil, Trash2, IdCard, Hash, ChevronDown, ChevronUp,
    AlertCircle, CheckCircle2
} from 'lucide-react';
import './tournament-participants-flash.css';
import { canonicalizeSportId } from '@/lib/clubDerivatives';
import { Database } from '@/lib/database.types';

// Context & Drawers
import { AddParticipantDrawer } from './AddParticipantDrawer';
import { UpsertParticipantDrawer } from './UpsertParticipantDrawer';
import { ImportParticipantsDrawerV2 } from './ImportParticipantsDrawerV2';
import { ParticipantsHistoryDrawer } from './ParticipantsHistoryDrawer';

// ============================================
// TYPES
// ============================================

export type ParticipantStatus = 'active' | 'inactive' | 'pending' | 'disqualified';
export type ParticipantType = 'club' | 'national_team' | 'franchise' | 'invited' | 'individual';

interface Participant {
    id: string;
    tournament_id: string;
    club_id: string | null;
    name: string;
    type: ParticipantType;
    status: ParticipantStatus;
    seed: number | null;
    group_id: string | null;
    short_code: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    clubs?: {
        id: string;
        name: string;
        short_name: string | null;
        logo_url: string | null;
    };
}

interface TournamentGroup {
    id: string;
    name: string;
    phase_id: string | null;
    order_index?: number | null;
}

interface TournamentPhase {
    id: string;
    name: string;
    phase_type: string;
    order_index: number;
}

interface ClubCatalogItem {
    id: string;
    name: string;
    short_name?: string | null;
    logo_url?: string | null;
    sport?: string | null;
    sport_id?: string | null;
}

interface ParticipantStats {
    total: number;
    active: number;
    inactive: number;
    pending: number;
    disqualified: number;
}

type ParticipantUpdatePayload = Partial<Participant> & {
    replace_across_tournament?: boolean;
};

interface Props {
    data?: Database['public']['Tables']['tournaments']['Row'] | null;
    id?: string; // tournament ID
}

// ============================================
// MAIN COMPONENT
// ============================================

export function TournamentParticipantsTab({ id: tournamentId, data }: Props) {
    // State
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [groups, setGroups] = useState<TournamentGroup[]>([]);
    const [phases, setPhases] = useState<TournamentPhase[]>([]);
    const [clubCatalog, setClubCatalog] = useState<ClubCatalogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [clubsLoading, setClubsLoading] = useState(false);
    const [groupAssignmentLoading, setGroupAssignmentLoading] = useState(false);
    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [groupFilter, setGroupFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<string>('recent');
    const [assignmentPhaseId, setAssignmentPhaseId] = useState('');
    const [isPhaseAssignmentOpen, setIsPhaseAssignmentOpen] = useState(true);

    // Selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Drawers
    const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
    const [isImportDrawerOpen, setIsImportDrawerOpen] = useState(false);
    const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
    const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);

    // Toast
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const tournamentSportId = useMemo(
        () => canonicalizeSportId(data?.sport_id || null),
        [data?.sport_id]
    );

    const getErrorMessage = (err: unknown, fallback: string) =>
        err instanceof Error && err.message ? err.message : fallback;

    // ============================================
    // DATA FETCHING
    // ============================================

    useEffect(() => {
        if (tournamentId) {
            loadParticipants();
            loadGroups();
            loadPhases();
            loadClubs();
        }
    }, [tournamentId]);

    const loadParticipants = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/tournaments/${tournamentId}/participants?full=true`);
            if (!response.ok) throw new Error('Error al cargar participantes');
            const data = await response.json();
            setParticipants(data);
        } catch (err) {
            const message = getErrorMessage(err, 'Error al cargar participantes');
            showToast('error', message);
        } finally {
            setLoading(false);
        }
    };

    const loadGroups = async () => {
        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/groups`);
            if (response.ok) {
                const data = await response.json();
                setGroups(data || []);
            }
        } catch (err) {
            console.error('Error loading groups:', err);
        }
    };

    const loadPhases = async () => {
        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/phases`, { cache: 'no-store' });
            if (!response.ok) throw new Error('Error al cargar fases');
            const payload = await response.json();
            setPhases(Array.isArray(payload?.data) ? payload.data : []);
        } catch (err) {
            console.error('Error loading phases:', err);
        }
    };

    const loadClubs = async () => {
        try {
            setClubsLoading(true);
            const response = await fetch('/api/admin/clubs', { cache: 'no-store' });
            if (!response.ok) throw new Error('Error al cargar clubes');
            const data = await response.json();
            setClubCatalog(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error loading clubs:', err);
            showToast('error', 'No se pudo cargar la base de clubes');
        } finally {
            setClubsLoading(false);
        }
    };

    // ============================================
    // COMPUTED VALUES
    // ============================================

    const stats: ParticipantStats = useMemo(() => {
        return {
            total: participants.length,
            active: participants.filter(p => p.status === 'active').length,
            inactive: participants.filter(p => p.status === 'inactive').length,
            pending: participants.filter(p => p.status === 'pending').length,
            disqualified: participants.filter(p => p.status === 'disqualified').length,
        };
    }, [participants]);

    const filteredParticipants = useMemo(() => {
        let result = [...participants];

        // Search
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(p =>
                p.name?.toLowerCase().includes(query) ||
                p.short_code?.toLowerCase().includes(query)
            );
        }

        // Type filter
        if (typeFilter !== 'all') {
            result = result.filter(p => p.type === typeFilter);
        }

        // Status filter
        if (statusFilter !== 'all') {
            result = result.filter(p => p.status === statusFilter);
        }

        // Group filter
        if (groupFilter !== 'all') {
            result = result.filter(p => p.group_id === groupFilter);
        }

        // Sort
        if (sortBy === 'name-asc') {
            result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        } else if (sortBy === 'name-desc') {
            result.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        } else if (sortBy === 'seed') {
            result.sort((a, b) => (a.seed || 999) - (b.seed || 999));
        } else {
            // recent (default)
            result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }

        return result;
    }, [participants, searchQuery, typeFilter, statusFilter, groupFilter, sortBy]);

    const phaseNameById = useMemo(
        () => new Map(phases.map((phase) => [phase.id, phase.name])),
        [phases]
    );

    const groupById = useMemo(
        () => new Map(groups.map((group) => [group.id, group])),
        [groups]
    );

    const phasesWithGroups = useMemo(
        () => phases.filter((phase) => groups.some((group) => group.phase_id === phase.id)),
        [phases, groups]
    );

    const assignableGroups = useMemo(() => {
        if (!assignmentPhaseId) return [];
        return groups.filter((group) => group.phase_id === assignmentPhaseId);
    }, [assignmentPhaseId, groups]);

    const participantCountByGroup = useMemo(() => {
        const counts = new Map<string, number>();
        participants.forEach((participant) => {
            if (!participant.group_id) return;
            counts.set(participant.group_id, (counts.get(participant.group_id) ?? 0) + 1);
        });
        return counts;
    }, [participants]);

    const sportFilteredClubCatalog = useMemo(() => {
        if (!tournamentSportId) {
            return clubCatalog;
        }

        return clubCatalog.filter((club) => {
            const clubSport = canonicalizeSportId(club.sport_id || club.sport || null);
            return clubSport === tournamentSportId;
        });
    }, [clubCatalog, tournamentSportId]);

    useEffect(() => {
        if (phasesWithGroups.length === 0) {
            setAssignmentPhaseId('');
            return;
        }

        setAssignmentPhaseId((current) =>
            phasesWithGroups.some((phase) => phase.id === current) ? current : phasesWithGroups[0].id
        );
    }, [phasesWithGroups]);

    const formatGroupLabel = (group: TournamentGroup) => {
        const phaseName = group.phase_id ? phaseNameById.get(group.phase_id) : '';
        return phaseName ? `${phaseName} - ${group.name}` : group.name;
    };

    // ============================================
    // CRUD OPERATIONS
    // ============================================

    const handleUpdate = async (id: string, data: ParticipantUpdatePayload) => {
        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/participants?id=${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const updated = await response.json();
            if (!response.ok) throw new Error(updated?.error || 'Error al actualizar participante');
            setParticipants(prev => prev.map(p => p.id === id ? updated : p));
            setEditingParticipant(null);
            showToast('success', 'Participante actualizado correctamente');
        } catch (err) {
            showToast('error', getErrorMessage(err, 'Error al actualizar participante'));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Seguro que quieres eliminar este participante?')) return;
        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/participants?id=${id}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Error al eliminar participante');
            setParticipants(prev => prev.filter(p => p.id !== id));
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            showToast('success', 'Participante eliminado correctamente');
        } catch (err) {
            showToast('error', getErrorMessage(err, 'Error al eliminar participante'));
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`¿Seguro que quieres eliminar ${selectedIds.size} participantes?`)) return;
        try {
            await Promise.all(
                Array.from(selectedIds).map(id =>
                    fetch(`/api/tournaments/${tournamentId}/participants?id=${id}`, {
                        method: 'DELETE',
                    })
                )
            );
            setParticipants(prev => prev.filter(p => !selectedIds.has(p.id)));
            setSelectedIds(new Set());
            showToast('success', `${selectedIds.size} participantes eliminados correctamente`);
        } catch {
            showToast('error', 'Error al eliminar participantes');
        }
    };

    const handleBulkAssignGroup = async (groupId: string | null) => {
        if (selectedIds.size === 0) {
            showToast('error', 'Selecciona al menos un participante para asignar grupo');
            return;
        }

        try {
            setGroupAssignmentLoading(true);

            const updates = await Promise.all(
                Array.from(selectedIds).map(async (participantId) => {
                    const response = await fetch(`/api/tournaments/${tournamentId}/participants?id=${participantId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ group_id: groupId }),
                    });

                    const payload = await response.json().catch(() => null);
                    if (!response.ok) {
                        throw new Error(payload?.error || 'Error al actualizar el grupo del participante');
                    }

                    return payload as Participant;
                })
            );

            const updatedById = new Map(updates.map((participant) => [participant.id, participant]));
            setParticipants((prev) => prev.map((participant) => updatedById.get(participant.id) ?? participant));
            setSelectedIds(new Set());

            if (groupId) {
                const group = groupById.get(groupId);
                showToast(
                    'success',
                    `${updates.length} participante${updates.length !== 1 ? 's' : ''} asignado${updates.length !== 1 ? 's' : ''} a ${group?.name || 'su grupo'}`
                );
            } else {
                showToast(
                    'success',
                    `${updates.length} participante${updates.length !== 1 ? 's' : ''} actualizado${updates.length !== 1 ? 's' : ''} sin grupo asignado`
                );
            }
        } catch (err) {
            showToast('error', getErrorMessage(err, 'Error al actualizar grupos'));
        } finally {
            setGroupAssignmentLoading(false);
        }
    };

    const handleImport = async (newList: Partial<Participant>[]) => {
        try {
            const promises = newList.map(p =>
                fetch(`/api/tournaments/${tournamentId}/participants`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(p),
                }).then(res => res.json())
            );
            const results = await Promise.all(promises);
            setParticipants(prev => [...results, ...prev]);
            setIsImportDrawerOpen(false);
            showToast('success', `${newList.length} participantes importados correctamente`);
        } catch {
            showToast('error', 'Error en la importación');
        }
    };

    const handleCreateFromClubCatalog = async (newList: Partial<Participant>[]) => {
        try {
            const promises = newList.map(p =>
                fetch(`/api/tournaments/${tournamentId}/participants`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(p),
                }).then(async res => {
                    if (!res.ok) throw new Error('Error al crear participante');
                    return res.json();
                })
            );
            const results = await Promise.all(promises);
            setParticipants(prev => [...results, ...prev]);
            setIsAddDrawerOpen(false);
            showToast('success', `${newList.length} participante${newList.length !== 1 ? 's' : ''} agregado${newList.length !== 1 ? 's' : ''} correctamente`);
        } catch (err: unknown) {
            const message = getErrorMessage(err, 'Error al crear participantes');
            showToast('error', message);
            throw err instanceof Error ? err : new Error(message);
        }
    };

    const handleExport = () => {
        const csv = [
            ['Nombre', 'Tipo', 'Código', 'Seed', 'Estado'].join(','),
            ...participants.map(p => [
                p.name,
                p.type,
                p.short_code || '',
                p.seed || '',
                p.status
            ].join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `participantes-torneo-${tournamentId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ============================================
    // SELECTION
    // ============================================

    const toggleAll = () => {
        if (selectedIds.size === filteredParticipants.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredParticipants.map(p => p.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    // ============================================
    // TOAST
    // ============================================

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    };

    // ============================================
    // RENDER: LOADING
    // ============================================

    if (loading) {
        return (
            <div className="participants-flash-container">
                <div className="loading-container">
                    <div className="spinner" />
                    <div className="loading-text">Cargando participantes...</div>
                </div>
            </div>
        );
    }

    // ============================================
    // RENDER: MAIN UI
    // ============================================

    return (
        <div className="participants-flash-container">
            {/* Header */}
            <header className="participants-header">
                <div className="participants-header-left">
                    <div className="participants-section-label">Gestión de Participantes</div>
                    <h1 className="participants-title">Participantes del Torneo</h1>
                    <div className="participants-counters">
                        <div className="counter-pill">
                            <span className="counter-pill-label">Total</span>
                            <span className="counter-pill-value">{stats.total}</span>
                        </div>
                        <div className="counter-pill active">
                            <span className="counter-pill-label">Activos</span>
                            <span className="counter-pill-value">{stats.active}</span>
                        </div>
                        <div className="counter-pill inactive">
                            <span className="counter-pill-label">Inactivos</span>
                            <span className="counter-pill-value">{stats.inactive}</span>
                        </div>
                        {stats.pending > 0 && (
                            <div className="counter-pill pending">
                                <span className="counter-pill-label">Pendientes</span>
                                <span className="counter-pill-value">{stats.pending}</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="participants-header-actions">
                    <button onClick={() => setIsHistoryDrawerOpen(true)} className="btn-flash">
                        <History />
                        <span>Historial</span>
                    </button>
                    <button onClick={handleExport} className="btn-flash">
                        <Download />
                        <span>Exportar</span>
                    </button>
                    <button onClick={() => setIsImportDrawerOpen(true)} className="btn-flash">
                        <FileUp />
                        <span>Importar</span>
                    </button>
                    <button onClick={() => setIsAddDrawerOpen(true)} className="btn-flash primary">
                        <Plus />
                        <span>Nuevo Participante</span>
                    </button>
                </div>
            </header>

            {/* Filter Bar */}
            <div className="participants-filter-bar">
                <div className="filter-input-wrapper">
                    <Search />
                    <input
                        type="text"
                        className="filter-input"
                        placeholder="Buscar por nombre o código..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <select className="filter-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    <option value="all">Todos los Tipos</option>
                    <option value="club">Club</option>
                    <option value="national_team">Selección</option>
                    <option value="individual">Individual</option>
                </select>
                <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">Todos los Estados</option>
                    <option value="active">Activos</option>
                    <option value="inactive">Inactivos</option>
                    <option value="pending">Pendientes</option>
                    <option value="disqualified">Descalificados</option>
                </select>
                {groups.length > 0 && (
                    <select className="filter-select" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                        <option value="all">Todos los Grupos</option>
                        {groups.map(g => (
                            <option key={g.id} value={g.id}>{formatGroupLabel(g)}</option>
                        ))}
                    </select>
                )}
                <select className="filter-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="recent">Más recientes</option>
                    <option value="name-asc">Nombre (A-Z)</option>
                    <option value="name-desc">Nombre (Z-A)</option>
                    <option value="seed">Seed / Ranking</option>
                </select>
            </div>

            {phasesWithGroups.length > 0 && (
                <section className={`phase-assignment-panel ${isPhaseAssignmentOpen ? 'is-open' : 'is-collapsed'}`}>
                    <button
                        type="button"
                        className="phase-assignment-toggle"
                        onClick={() => setIsPhaseAssignmentOpen((current) => !current)}
                        aria-expanded={isPhaseAssignmentOpen}
                        aria-label={isPhaseAssignmentOpen ? 'Cerrar asignacion rapida' : 'Abrir asignacion rapida'}
                    >
                        {isPhaseAssignmentOpen ? <ChevronUp /> : <ChevronDown />}
                    </button>

                    <div className="phase-assignment-header">
                        <div className="phase-assignment-copy-block">
                            {isPhaseAssignmentOpen && <div className="phase-assignment-kicker">Asignacion rapida</div>}
                            <h2 className="phase-assignment-title">Agregar a grupo por fase</h2>
                            {isPhaseAssignmentOpen && (
                                <p className="phase-assignment-copy">
                                    Selecciona participantes en la tabla y envialos al grupo correcto sin entrar a editar cada club.
                                </p>
                            )}
                        </div>
                    </div>

                    {isPhaseAssignmentOpen && (
                        <div className="phase-assignment-body">
                            <div className="phase-assignment-controls">
                                <select
                                    className="filter-select"
                                    value={assignmentPhaseId}
                                    onChange={(event) => setAssignmentPhaseId(event.target.value)}
                                    disabled={groupAssignmentLoading}
                                >
                                    {phasesWithGroups.map((phase) => (
                                        <option key={phase.id} value={phase.id}>
                                            {phase.name}
                                        </option>
                                    ))}
                                </select>

                                <button
                                    type="button"
                                    className="btn-flash"
                                    onClick={() => handleBulkAssignGroup(null)}
                                    disabled={groupAssignmentLoading || selectedIds.size === 0}
                                >
                                    Quitar grupo
                                </button>
                            </div>

                            {assignableGroups.length > 0 ? (
                                <div className="phase-assignment-groups">
                                    {assignableGroups.map((group) => {
                                        const participantCount = participantCountByGroup.get(group.id) ?? 0;

                                        return (
                                            <button
                                                key={group.id}
                                                type="button"
                                                className="phase-group-action"
                                                onClick={() => handleBulkAssignGroup(group.id)}
                                                disabled={groupAssignmentLoading || selectedIds.size === 0}
                                            >
                                                <div className="phase-group-action-header">
                                                    <span className="phase-group-name">{group.name}</span>
                                                    <span className="phase-group-count">
                                                        {participantCount} equipo{participantCount === 1 ? '' : 's'}
                                                    </span>
                                                </div>
                                                <span className="phase-group-phase">
                                                    {group.phase_id ? phaseNameById.get(group.phase_id) || 'Fase actual' : 'Fase actual'}
                                                </span>
                                                <span className="phase-group-cta">
                                                    {selectedIds.size > 0
                                                        ? `Mover ${selectedIds.size} seleccionado${selectedIds.size === 1 ? '' : 's'}`
                                                        : 'Selecciona equipos en la tabla'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="phase-assignment-empty">
                                    Esta fase todavia no tiene grupos disponibles para asignacion.
                                </div>
                            )}

                            <div className="phase-assignment-hint">
                                {selectedIds.size > 0
                                    ? `${selectedIds.size} participante${selectedIds.size === 1 ? '' : 's'} listo${selectedIds.size === 1 ? '' : 's'} para asignar en ${phaseNameById.get(assignmentPhaseId) || 'la fase seleccionada'}.`
                                    : 'Marca uno o mas participantes en la tabla para usar esta asignacion masiva.'}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* Table */}
            <div className="participants-table-container">
                <div className="participants-table-scroll">
                    <table className="participants-table">
                        <thead>
                            <tr>
                                <th>
                                    <input
                                        type="checkbox"
                                        className="table-checkbox"
                                        checked={selectedIds.size === filteredParticipants.length && filteredParticipants.length > 0}
                                        onChange={toggleAll}
                                    />
                                </th>
                                <th>Participante</th>
                                <th>Tipo</th>
                                <th>Seed</th>
                                {groups.length > 0 && <th>Grupo</th>}
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredParticipants.length === 0 ? (
                                <tr>
                                    <td colSpan={groups.length > 0 ? 7 : 6}>
                                        <div className="empty-state">
                                            <Users />
                                            <div className="empty-state-title">No se encontraron participantes</div>
                                            <div className="empty-state-description">
                                                {searchQuery || typeFilter !== 'all' || statusFilter !== 'all'
                                                    ? 'Prueba ajustando los filtros para ver más resultados.'
                                                    : 'Todavía no hay participantes. Agrega el primer participante para comenzar.'}
                                            </div>
                                            {(searchQuery || typeFilter !== 'all' || statusFilter !== 'all') && (
                                                <button
                                                    className="empty-state-cta"
                                                    onClick={() => {
                                                        setSearchQuery('');
                                                        setTypeFilter('all');
                                                        setStatusFilter('all');
                                                        setGroupFilter('all');
                                                    }}
                                                >
                                                    Limpiar filtros
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredParticipants.map(p => (
                                    <tr
                                        key={p.id}
                                        className={selectedIds.has(p.id) ? 'selected' : ''}
                                        onClick={() => toggleSelect(p.id)}
                                    >
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="table-checkbox"
                                                checked={selectedIds.has(p.id)}
                                                onChange={() => toggleSelect(p.id)}
                                            />
                                        </td>
                                        <td>
                                            <div className="participant-cell">
                                                <div className="participant-logo">
                                                    {p.clubs?.logo_url ? (
                                                        <img src={p.clubs.logo_url} alt={p.name} />
                                                    ) : (
                                                        <IdCard />
                                                    )}
                                                </div>
                                                <div className="participant-info">
                                                    <div className="participant-name">{p.name}</div>
                                                    <div className="participant-code">{p.short_code || '---'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="type-badge">
                                                <Users />
                                                {p.type === 'club' ? 'Club' : p.type === 'national_team' ? 'Selección' : 'Individual'}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="seed-cell">
                                                <Hash />
                                                {p.seed || '-'}
                                            </div>
                                        </td>
                                        {groups.length > 0 && (
                                            <td>
                                                {p.group_id && groupById.get(p.group_id) ? (
                                                    <div className="participant-group-cell">
                                                        <span>{groupById.get(p.group_id)?.name}</span>
                                                        <small className="participant-group-phase-label">
                                                            {groupById.get(p.group_id)?.phase_id
                                                                ? phaseNameById.get(groupById.get(p.group_id)?.phase_id || '') || 'Fase'
                                                                : 'Sin fase'}
                                                        </small>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>-</span>
                                                )}
                                            </td>
                                        )}
                                        <td>
                                            <StatusBadge status={p.status} />
                                        </td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <div className="action-buttons">
                                                <button
                                                    className="action-btn"
                                                    onClick={() => setEditingParticipant(p)}
                                                    title="Editar"
                                                >
                                                    <Pencil />
                                                </button>
                                                <button
                                                    className="action-btn danger"
                                                    onClick={() => handleDelete(p.id)}
                                                    title="Eliminar"
                                                >
                                                    <Trash2 />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="participants-table-footer">
                    <div className="footer-info">
                        Mostrando <span>{filteredParticipants.length}</span> de <span>{participants.length}</span> participantes
                    </div>
                    {selectedIds.size > 0 && (
                        <div className="footer-actions">
                            <div className="bulk-action-badge">
                                {selectedIds.size} seleccionados
                            </div>
                            <div className="separator" />
                            <button className="btn-flash danger" onClick={handleBulkDelete}>
                                <Trash2 />
                                Eliminar seleccionados
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Toast */}
            {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

            {/* DRAWERS */}
            <AddParticipantDrawer
                isOpen={isAddDrawerOpen}
                onClose={() => setIsAddDrawerOpen(false)}
                onAdd={handleCreateFromClubCatalog}
                clubs={sportFilteredClubCatalog}
                phases={phasesWithGroups}
                groups={groups}
                existingParticipants={participants}
                loadingClubs={clubsLoading}
            />

            <UpsertParticipantDrawer
                isOpen={!!editingParticipant}
                onClose={() => {
                    setEditingParticipant(null);
                }}
                onSave={(data) => handleUpdate(editingParticipant!.id, data)}
                participant={editingParticipant}
                clubs={sportFilteredClubCatalog}
                phases={phasesWithGroups}
                groups={groups}
                existingParticipants={participants}
            />

            <ImportParticipantsDrawerV2
                isOpen={isImportDrawerOpen}
                onClose={() => setIsImportDrawerOpen(false)}
                onImport={handleImport}
                existingParticipants={participants}
            />

            <ParticipantsHistoryDrawer
                isOpen={isHistoryDrawerOpen}
                onClose={() => setIsHistoryDrawerOpen(false)}
                tournamentId={tournamentId || ''}
            />
        </div>
    );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function StatusBadge({ status }: { status: ParticipantStatus }) {
    const statusMap = {
        active: { label: 'Activo', class: 'active' },
        inactive: { label: 'Inactivo', class: 'inactive' },
        pending: { label: 'Pendiente', class: 'pending' },
        disqualified: { label: 'Descalificado', class: 'disqualified' },
    };

    const config = statusMap[status];

    return (
        <span className={`status-badge ${config.class}`}>
            <span className="status-dot" />
            {config.label}
        </span>
    );
}

function Toast({ type, message, onClose }: { type: 'success' | 'error'; message: string; onClose: () => void }) {
    return (
        <div
            style={{
                position: 'fixed',
                top: '24px',
                right: '24px',
                padding: '14px 20px',
                borderRadius: '10px',
                background: type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                color: type === 'success' ? '#10b981' : '#ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                zIndex: 9999,
                fontSize: '13px',
                fontWeight: 600,
                animation: 'slideInFromBottom 0.3s ease',
            }}
        >
            {type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {message}
            <button
                onClick={onClose}
                style={{
                    marginLeft: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    opacity: 0.6,
                    transition: 'opacity 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
            >
                ✕
            </button>
        </div>
    );
}
