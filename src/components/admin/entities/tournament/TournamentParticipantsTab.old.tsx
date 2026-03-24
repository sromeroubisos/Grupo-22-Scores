'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ChevronDown,
    Download,
    FileUp,
    Hash,
    IdCard,
    Pencil,
    Plus,
    Search,
    SlidersHorizontal,
    Trash2,
    Users,
} from 'lucide-react';
import './participants-premium.css';
import { AddParticipantDrawer } from './AddParticipantDrawer';
import { ImportParticipantsDrawer } from './ImportParticipantsDrawer';
import { useAdminConsole } from '../../../../app/admin/AdminContext';

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
    notes?: string | null;
    created_at?: string;
    updated_at?: string;
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
}

interface ParticipantStats {
    total: number;
    active: number;
    inactive: number;
    pending: number;
}

interface Props {
    data?: unknown;
    id?: string;
}

function getTypeLabel(type: ParticipantType) {
    switch (type) {
        case 'club':
            return 'Club';
        case 'national_team':
            return 'Selección';
        case 'franchise':
            return 'Franquicia';
        case 'invited':
            return 'Invitado';
        default:
            return 'Individual';
    }
}

function EmptyState({ hasFilters, onClearFilters }: { hasFilters: boolean; onClearFilters: () => void }) {
    return (
        <div className="pp-empty-state">
            <Users />
            <div className="pp-empty-state-title">No se encontraron participantes</div>
            <div className="pp-empty-state-description">
                {hasFilters
                    ? 'Prueba ajustando los filtros para ver más resultados.'
                    : 'Todavía no hay participantes. Agrega el primer participante para comenzar.'}
            </div>
            {hasFilters && (
                <button className="pp-empty-state-cta" onClick={onClearFilters}>
                    Limpiar filtros
                </button>
            )}
        </div>
    );
}

function StatusPill({ status }: { status: ParticipantStatus }) {
    const statusMap = {
        active: { label: 'Activo', class: 'active' },
        inactive: { label: 'Inactivo', class: 'inactive' },
        pending: { label: 'Pendiente', class: 'pending' },
        disqualified: { label: 'Descalificado', class: 'disqualified' },
    };

    const config = statusMap[status];

    return (
        <span className={`pp-status-pill ${config.class}`}>
            <span className="pp-status-dot" />
            {config.label}
        </span>
    );
}

export function TournamentParticipantsTab({ id: tournamentId }: Props) {
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [groups, setGroups] = useState<TournamentGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { clubs } = useAdminConsole();

    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [groupFilter, setGroupFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<string>('recent');
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [expandedMobileCards, setExpandedMobileCards] = useState<Set<string>>(new Set());

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
    const [isImportDrawerOpen, setIsImportDrawerOpen] = useState(false);
    const [, setEditingParticipant] = useState<Participant | null>(null);

    const loadParticipants = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/tournaments/${tournamentId}/participants?full=true`);
            if (!response.ok) throw new Error('Error al cargar participantes');
            const data = await response.json();
            setParticipants(data);
            setError(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al cargar participantes');
        } finally {
            setLoading(false);
        }
    }, [tournamentId]);

    const loadGroups = useCallback(async () => {
        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/groups`);
            if (response.ok) {
                const data = await response.json();
                setGroups(data || []);
            }
        } catch (err) {
            console.error('Error loading groups:', err);
        }
    }, [tournamentId]);

    useEffect(() => {
        if (tournamentId) {
            void loadParticipants();
            void loadGroups();
        }
    }, [loadGroups, loadParticipants, tournamentId]);

    const stats: ParticipantStats = useMemo(() => ({
        total: participants.length,
        active: participants.filter((participant) => participant.status === 'active').length,
        inactive: participants.filter((participant) => participant.status === 'inactive').length,
        pending: participants.filter((participant) => participant.status === 'pending').length,
    }), [participants]);

    const filteredParticipants = useMemo(() => {
        let result = [...participants];

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter((participant) =>
                participant.name?.toLowerCase().includes(query) ||
                participant.short_code?.toLowerCase().includes(query)
            );
        }

        if (typeFilter !== 'all') result = result.filter((participant) => participant.type === typeFilter);
        if (statusFilter !== 'all') result = result.filter((participant) => participant.status === statusFilter);
        if (groupFilter !== 'all') result = result.filter((participant) => participant.group_id === groupFilter);

        if (sortBy === 'name-asc') result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        else if (sortBy === 'name-desc') result.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        else if (sortBy === 'seed') result.sort((a, b) => (a.seed || 999) - (b.seed || 999));
        else {
            result.sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
            });
        }

        return result;
    }, [groupFilter, participants, searchQuery, sortBy, statusFilter, typeFilter]);

    const groupNameById = useMemo(() => new Map(groups.map((group) => [group.id, group.name])), [groups]);

    const hasAdvancedFilters =
        typeFilter !== 'all' ||
        statusFilter !== 'all' ||
        groupFilter !== 'all' ||
        sortBy !== 'recent';

    const handleCreate = async (newData: Partial<Participant> | Partial<Participant>[]) => {
        try {
            const participantsToAdd = Array.isArray(newData) ? newData : [newData];
            const promises = participantsToAdd.map((participant) =>
                fetch(`/api/tournaments/${tournamentId}/participants`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(participant),
                }).then(async (res) => {
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Error al crear participante');
                    return data;
                })
            );

            const results = await Promise.all(promises);
            setParticipants((prev) => [...results, ...prev]);
            setIsAddDrawerOpen(false);
        } catch (err: unknown) {
            throw err instanceof Error ? err : new Error(String(err));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Seguro que quieres eliminar este participante?')) return;

        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/participants?id=${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Error al eliminar participante');
            setParticipants((prev) => prev.filter((participant) => participant.id !== id));
            setSelectedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : String(err));
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`¿Seguro que quieres eliminar ${selectedIds.size} participantes?`)) return;

        try {
            await Promise.all(
                Array.from(selectedIds).map((id) =>
                    fetch(`/api/tournaments/${tournamentId}/participants?id=${id}`, { method: 'DELETE' })
                )
            );
            setParticipants((prev) => prev.filter((participant) => !selectedIds.has(participant.id)));
            setSelectedIds(new Set());
        } catch {
            alert('Error al eliminar participantes');
        }
    };

    const handleImport = async (newList: Partial<Participant>[]) => {
        try {
            const promises = newList.map((participant) =>
                fetch(`/api/tournaments/${tournamentId}/participants`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(participant),
                }).then((res) => res.json())
            );
            const results = await Promise.all(promises);
            setParticipants((prev) => [...results, ...prev]);
            setIsImportDrawerOpen(false);
        } catch {
            alert('Error en la importación');
        }
    };

    const handleExport = () => {
        const csv = [
            ['Nombre', 'Tipo', 'Código', 'Seed', 'Estado'].join(','),
            ...participants.map((participant) => [
                participant.name,
                participant.type,
                participant.short_code || '',
                participant.seed || '',
                participant.status,
            ].join(',')),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `participantes-torneo-${tournamentId}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const clearFilters = () => {
        setSearchQuery('');
        setTypeFilter('all');
        setStatusFilter('all');
        setGroupFilter('all');
        setSortBy('recent');
    };

    const toggleAll = () => {
        if (selectedIds.size === filteredParticipants.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(filteredParticipants.map((participant) => participant.id)));
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleMobileCard = (id: string) => {
        setExpandedMobileCards((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="participants-premium-container">
                <div className="pp-loading-container">
                    <div className="pp-spinner" />
                    <div className="pp-loading-text">Cargando participantes...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="participants-premium-container">
                <div className="pp-error-message">
                    <Trash2 />
                    {error}
                </div>
            </div>
        );
    }

    return (
        <div className="participants-premium-container">
            <header className="pp-header">
                <div className="pp-header-left">
                    <div className="pp-kicker">GESTIÓN DE PARTICIPANTES</div>
                    <h1 className="pp-title">Participantes</h1>
                    <div className="pp-counters">
                        <div className="pp-counter">
                            <span className="pp-counter-label">Total</span>
                            <span className="pp-counter-value">{stats.total}</span>
                        </div>
                        <div className="pp-counter active">
                            <span className="pp-counter-label">Activos</span>
                            <span className="pp-counter-value">{stats.active}</span>
                        </div>
                        <div className="pp-counter inactive">
                            <span className="pp-counter-label">Inactivos</span>
                            <span className="pp-counter-value">{stats.inactive}</span>
                        </div>
                        {stats.pending > 0 && (
                            <div className="pp-counter pending">
                                <span className="pp-counter-label">Pendientes</span>
                                <span className="pp-counter-value">{stats.pending}</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="pp-header-actions">
                    <button onClick={handleExport} className="pp-btn">
                        <Download />
                        <span>Exportar</span>
                    </button>
                    <button onClick={() => setIsImportDrawerOpen(true)} className="pp-btn">
                        <FileUp />
                        <span>Importar</span>
                    </button>
                    <button onClick={() => setIsAddDrawerOpen(true)} className="pp-btn primary">
                        <Plus />
                        <span>Nuevo Participante</span>
                    </button>
                </div>
            </header>

            <div className="pp-filter-bar">
                <div className="pp-filter-item">
                    <label className="pp-filter-label">Búsqueda</label>
                    <div className="pp-filter-input-wrapper">
                        <Search />
                        <input
                            type="text"
                            className="pp-filter-input"
                            placeholder="Buscar por nombre o código..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </div>
                </div>

                <div className="pp-filter-item pp-filter-mobile-toggle">
                    <label className="pp-filter-label">Filtros</label>
                    <button
                        type="button"
                        className={`pp-btn ${showMobileFilters || hasAdvancedFilters ? 'primary' : ''}`}
                        onClick={() => setShowMobileFilters((current) => !current)}
                    >
                        <SlidersHorizontal />
                        <span>{showMobileFilters ? 'Ocultar' : 'Mostrar'}</span>
                    </button>
                </div>

                <div className={`pp-filter-item pp-filter-advanced ${showMobileFilters ? 'is-open' : ''}`}>
                    <label className="pp-filter-label">Tipo</label>
                    <select className="pp-filter-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                        <option value="all">Todos</option>
                        <option value="club">Club</option>
                        <option value="national_team">Selección</option>
                        <option value="individual">Individual</option>
                    </select>
                </div>

                <div className={`pp-filter-item pp-filter-advanced ${showMobileFilters ? 'is-open' : ''}`}>
                    <label className="pp-filter-label">Estado</label>
                    <select className="pp-filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                        <option value="all">Todos</option>
                        <option value="active">Activos</option>
                        <option value="inactive">Inactivos</option>
                        <option value="pending">Pendientes</option>
                        <option value="disqualified">Descalificados</option>
                    </select>
                </div>

                {groups.length > 0 && (
                    <div className={`pp-filter-item pp-filter-advanced ${showMobileFilters ? 'is-open' : ''}`}>
                        <label className="pp-filter-label">Grupo</label>
                        <select className="pp-filter-select" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                            <option value="all">Todos</option>
                            {groups.map((group) => (
                                <option key={group.id} value={group.id}>{group.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className={`pp-filter-item pp-filter-advanced ${showMobileFilters ? 'is-open' : ''}`}>
                    <label className="pp-filter-label">Ordenar</label>
                    <select className="pp-filter-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                        <option value="recent">Más recientes</option>
                        <option value="name-asc">Nombre (A-Z)</option>
                        <option value="name-desc">Nombre (Z-A)</option>
                        <option value="seed">Seed / Ranking</option>
                    </select>
                </div>
            </div>

            {(hasAdvancedFilters || searchQuery) && (
                <div className="pp-active-filters">
                    <span className="pp-active-filters-label">Filtros activos</span>
                    <button type="button" className="pp-btn" onClick={clearFilters}>
                        Limpiar filtros
                    </button>
                </div>
            )}

            <div className="pp-table-container">
                <div className="pp-table-scroll pp-table-desktop">
                    <table className="pp-table">
                        <thead>
                            <tr>
                                <th>
                                    <input
                                        type="checkbox"
                                        className="pp-checkbox"
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
                                        <EmptyState hasFilters={!!searchQuery || hasAdvancedFilters} onClearFilters={clearFilters} />
                                    </td>
                                </tr>
                            ) : (
                                filteredParticipants.map((participant) => (
                                    <tr
                                        key={participant.id}
                                        className={selectedIds.has(participant.id) ? 'selected' : ''}
                                        onClick={() => toggleSelect(participant.id)}
                                    >
                                        <td onClick={(event) => event.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="pp-checkbox"
                                                checked={selectedIds.has(participant.id)}
                                                onChange={() => toggleSelect(participant.id)}
                                            />
                                        </td>
                                        <td>
                                            <div className="pp-participant-cell">
                                                <div className="pp-participant-logo">
                                                    {participant.clubs?.logo_url ? (
                                                        <img src={participant.clubs.logo_url} alt={participant.name} />
                                                    ) : (
                                                        <IdCard />
                                                    )}
                                                </div>
                                                <div className="pp-participant-info">
                                                    <div className="pp-participant-name">{participant.name}</div>
                                                    <div className="pp-participant-code">{participant.short_code || '---'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="pp-type-badge">
                                                <Users />
                                                {getTypeLabel(participant.type)}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="pp-seed-cell">
                                                <Hash />
                                                {participant.seed || '-'}
                                            </div>
                                        </td>
                                        {groups.length > 0 && (
                                            <td>
                                                <span style={{ fontSize: '12px', color: 'var(--pp-text-muted)' }}>
                                                    {participant.group_id ? groupNameById.get(participant.group_id) || '-' : '-'}
                                                </span>
                                            </td>
                                        )}
                                        <td>
                                            <StatusPill status={participant.status} />
                                        </td>
                                        <td onClick={(event) => event.stopPropagation()}>
                                            <div className="pp-action-buttons">
                                                <button
                                                    className="pp-action-btn"
                                                    onClick={() => setEditingParticipant(participant)}
                                                    title="Editar"
                                                >
                                                    <Pencil />
                                                </button>
                                                <button
                                                    className="pp-action-btn danger"
                                                    onClick={() => handleDelete(participant.id)}
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

                <div className="pp-mobile-list">
                    {filteredParticipants.length === 0 ? (
                        <EmptyState hasFilters={!!searchQuery || hasAdvancedFilters} onClearFilters={clearFilters} />
                    ) : (
                        filteredParticipants.map((participant) => {
                            const isSelected = selectedIds.has(participant.id);
                            const isExpanded = expandedMobileCards.has(participant.id);
                            const groupName = participant.group_id ? groupNameById.get(participant.group_id) || '-' : '-';

                            return (
                                <article
                                    key={participant.id}
                                    className={`pp-mobile-card ${isSelected ? 'selected' : ''}`}
                                >
                                    <button
                                        type="button"
                                        className={`pp-mobile-card-summary ${isExpanded ? 'is-expanded' : ''}`}
                                        onClick={() => toggleMobileCard(participant.id)}
                                        aria-expanded={isExpanded}
                                    >
                                        <div className="pp-mobile-card-main">
                                            <div className="pp-participant-logo">
                                                {participant.clubs?.logo_url ? (
                                                    <img src={participant.clubs.logo_url} alt={participant.name} />
                                                ) : (
                                                    <IdCard />
                                                )}
                                            </div>

                                            <div className="pp-mobile-card-copy">
                                                <div className="pp-participant-name">{participant.name}</div>
                                                <div className="pp-mobile-card-subline">
                                                    <span className="pp-participant-code">{participant.short_code || '---'}</span>
                                                    <span className="pp-mobile-type-chip">{getTypeLabel(participant.type)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pp-mobile-card-side">
                                            <StatusPill status={participant.status} />
                                            <span className={`pp-mobile-chevron ${isExpanded ? 'is-expanded' : ''}`}>
                                                <ChevronDown size={16} />
                                            </span>
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="pp-mobile-card-details">
                                            <div className="pp-mobile-card-grid">
                                                <div className="pp-mobile-stat">
                                                    <span>Seed</span>
                                                    <strong>{participant.seed || '-'}</strong>
                                                </div>
                                                <div className="pp-mobile-stat">
                                                    <span>Grupo</span>
                                                    <strong>{groupName}</strong>
                                                </div>
                                                <div className="pp-mobile-stat">
                                                    <span>SelecciÃ³n</span>
                                                    <strong>{isSelected ? 'Incluido' : 'Libre'}</strong>
                                                </div>
                                            </div>

                                            {participant.notes ? (
                                                <div className="pp-mobile-notes">
                                                    <span>Notas</span>
                                                    <p>{participant.notes}</p>
                                                </div>
                                            ) : null}

                                            <div className="pp-mobile-card-actions">
                                                <label className="pp-mobile-select-pill" onClick={(event) => event.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        className="pp-checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleSelect(participant.id)}
                                                    />
                                                    <span>{isSelected ? 'Seleccionado' : 'Seleccionar'}</span>
                                                </label>

                                                <div className="pp-mobile-card-actions-group">
                                                    <button
                                                        className="pp-action-btn"
                                                        onClick={() => setEditingParticipant(participant)}
                                                        title="Editar"
                                                    >
                                                        <Pencil />
                                                    </button>
                                                    <button
                                                        className="pp-action-btn danger"
                                                        onClick={() => handleDelete(participant.id)}
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </article>
                            );
                        })
                    )}
                </div>

                <div className="pp-table-footer">
                    <div className="pp-footer-info">
                        Mostrando <span>{filteredParticipants.length}</span> de <span>{participants.length}</span> participantes
                    </div>
                    {selectedIds.size > 0 && (
                        <div className="pp-footer-actions">
                            <div className="pp-bulk-badge">{selectedIds.size} seleccionados</div>
                            <div className="pp-separator" />
                            <button className="pp-btn danger" onClick={handleBulkDelete}>
                                <Trash2 />
                                Eliminar seleccionados
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <AddParticipantDrawer
                isOpen={isAddDrawerOpen}
                onClose={() => setIsAddDrawerOpen(false)}
                onAdd={handleCreate}
                clubs={clubs}
                phases={[]}
                groups={[]}
                existingParticipants={participants}
            />

            <ImportParticipantsDrawer
                isOpen={isImportDrawerOpen}
                onClose={() => setIsImportDrawerOpen(false)}
                onImport={handleImport}
            />
        </div>
    );
}
