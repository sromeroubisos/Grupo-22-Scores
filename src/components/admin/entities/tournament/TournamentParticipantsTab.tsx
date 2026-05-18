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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Users, Search, Plus, Download, FileUp, History,
    Pencil, Trash2, IdCard, Hash, ChevronDown, ChevronUp,
    AlertCircle, CheckCircle2, X, MoreHorizontal, SlidersHorizontal,
    CheckSquare, Square, ArrowUpDown, Layers
} from 'lucide-react';
import './tournament-participants-flash.css';
import { Database } from '@/lib/database.types';

// Context & Drawers
import { AddParticipantDrawer } from './AddParticipantDrawer';
import { UpsertParticipantDrawer } from './UpsertParticipantDrawer';
import { ImportParticipantsDrawerV2 } from './ImportParticipantsDrawerV2';
import { ParticipantsHistoryDrawer } from './ParticipantsHistoryDrawer';
import { beginClientRequest, usePerfComponentLifecycle } from '@/lib/perf/react';

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

interface ParticipantPhaseAssignment {
    id: string;
    tournament_id: string;
    season_id: string | null;
    phase_id: string;
    participant_id: string;
    group_id: string | null;
    status: ParticipantStatus | string;
    seed: number | null;
    notes: string | null;
    source?: 'phase' | 'legacy';
}

interface PhaseRosterItem {
    assignment: ParticipantPhaseAssignment;
    participant: Participant;
    group: TournamentGroup | null;
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

export function TournamentParticipantsTab({ id: tournamentId }: Props) {
    const searchParams = useSearchParams();
    const currentSeasonId =
        searchParams.get('seasonId') ||
        searchParams.get('season_id') ||
        searchParams.get('season');
    usePerfComponentLifecycle('TournamentParticipantsTab', {
        tournamentId: tournamentId || 'unknown',
    });
    // State
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [groups, setGroups] = useState<TournamentGroup[]>([]);
    const [phases, setPhases] = useState<TournamentPhase[]>([]);
    const [phaseAssignments, setPhaseAssignments] = useState<ParticipantPhaseAssignment[]>([]);
    const [phaseAssignmentsReady, setPhaseAssignmentsReady] = useState(true);
    const [clubCatalog, setClubCatalog] = useState<ClubCatalogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [clubsLoading, setClubsLoading] = useState(false);
    // Whether a catalog fetch was already attempted for the current drawer
    // session. Prevents the loader effect from re-firing forever when the
    // scoped endpoint legitimately returns an empty list (or errors): without
    // this, clubsLoading flips back to false + clubCatalog stays empty, so the
    // effect's guard re-opens and loadClubs() loops, flickering the spinner.
    const clubsAttemptedRef = useRef(false);
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

    // Mobile-only UI state
    const [mobileVisibleCount, setMobileVisibleCount] = useState(50);
    const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
    const [isMobileMoreMenuOpen, setIsMobileMoreMenuOpen] = useState(false);
    const [isMobilePhaseSheetOpen, setIsMobilePhaseSheetOpen] = useState(false);
    const [mobilePhaseFilter, setMobilePhaseFilter] = useState<string>('all');

    // Toast
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Reset visible cap when filters/search change
    useEffect(() => {
        setMobileVisibleCount(50);
    }, [searchQuery, typeFilter, statusFilter, groupFilter, sortBy, mobilePhaseFilter]);

    // Close phase-assign sheet automatically when selection becomes empty
    useEffect(() => {
        if (selectedIds.size === 0 && isMobilePhaseSheetOpen) {
            setIsMobilePhaseSheetOpen(false);
        }
    }, [selectedIds, isMobilePhaseSheetOpen]);

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
            loadPhaseAssignments();
        }
    }, [currentSeasonId, tournamentId]);

    const loadParticipants = async () => {
        try {
            setLoading(true);
            const request = beginClientRequest(`tournament:${tournamentId}:participants:full`, 'mount', {
                component: 'TournamentParticipantsTab',
            });
            const query = new URLSearchParams({ full: 'true' });
            if (currentSeasonId) query.set('seasonId', currentSeasonId);
            const response = await fetch(`/api/tournaments/${tournamentId}/participants?${query.toString()}`);
            request.end({
                status: response.status,
                error: !response.ok,
            });
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
            const request = beginClientRequest(`tournament:${tournamentId}:groups`, 'mount', {
                component: 'TournamentParticipantsTab',
            });
            const query = new URLSearchParams();
            if (currentSeasonId) query.set('seasonId', currentSeasonId);
            const response = await fetch(`/api/tournaments/${tournamentId}/groups${query.size ? `?${query.toString()}` : ''}`);
            request.end({
                status: response.status,
                error: !response.ok,
            });
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
            const request = beginClientRequest(`tournament:${tournamentId}:phases`, 'mount', {
                component: 'TournamentParticipantsTab',
            });
            const query = new URLSearchParams();
            if (currentSeasonId) query.set('seasonId', currentSeasonId);
            const response = await fetch(`/api/tournaments/${tournamentId}/phases${query.size ? `?${query.toString()}` : ''}`, { cache: 'no-store' });
            request.end({
                status: response.status,
                error: !response.ok,
            });
            if (!response.ok) throw new Error('Error al cargar fases');
            const payload = await response.json();
            setPhases(Array.isArray(payload?.data) ? payload.data : []);
        } catch (err) {
            console.error('Error loading phases:', err);
        }
    };

    const loadPhaseAssignments = async () => {
        try {
            const request = beginClientRequest(`tournament:${tournamentId}:phase-participants`, 'mount', {
                component: 'TournamentParticipantsTab',
            });
            const query = new URLSearchParams();
            if (currentSeasonId) query.set('seasonId', currentSeasonId);
            const response = await fetch(`/api/tournaments/${tournamentId}/phase-participants${query.size ? `?${query.toString()}` : ''}`, { cache: 'no-store' });
            request.end({
                status: response.status,
                error: !response.ok,
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                throw new Error(payload?.error || 'Error al cargar participantes por fase');
            }

            const payload = await response.json();
            setPhaseAssignmentsReady(payload?.tableReady !== false);
            setPhaseAssignments(Array.isArray(payload?.assignments) ? payload.assignments : []);
        } catch (err) {
            console.error('Error loading phase assignments:', err);
            setPhaseAssignmentsReady(false);
            setPhaseAssignments([]);
        }
    };

    const loadClubs = async () => {
        try {
            setClubsLoading(true);
            clubsAttemptedRef.current = true;
            const request = beginClientRequest('clubs:catalog', 'mount', {
                component: 'TournamentParticipantsTab',
            });
            // A tournament admin (gestor_torneos) must only be offered clubs
            // within their access scope. /api/admin/torneo/clubs returns that
            // scoped set for them and the full catalog for global admins
            // (unlimited scope). Other admin roles can't use that panel and get
            // 401/403 — fall back to the global catalog so nothing regresses.
            let response = await fetch('/api/admin/torneo/clubs?limit=2000', {
                cache: 'no-store',
                credentials: 'include',
            });
            if (response.status === 401 || response.status === 403) {
                response = await fetch('/api/clubs?include_hidden=true', { cache: 'no-store' });
            }
            request.end({
                status: response.status,
                error: !response.ok,
            });
            if (!response.ok) throw new Error('Error al cargar clubes');
            const payload = await response.json();
            const data = Array.isArray(payload?.data) ? payload.data : [];
            setClubCatalog(data.map((club: ClubCatalogItem & { slug?: string | null }) => ({
                id: club.id,
                name: club.name,
                short_name: club.short_name ?? club.slug ?? null,
                logo_url: club.logo_url ?? null,
                sport: club.sport ?? null,
                sport_id: club.sport_id ?? null,
            })));
        } catch (err) {
            console.error('Error loading clubs:', err);
            showToast('error', 'No se pudo cargar la base de clubes');
        } finally {
            setClubsLoading(false);
        }
    };

    useEffect(() => {
        if (!isAddDrawerOpen && !editingParticipant) {
            // Drawer fully closed: allow a fresh fetch (and error retry) the
            // next time it opens.
            clubsAttemptedRef.current = false;
            return;
        }
        if (clubCatalog.length > 0 || clubsLoading || clubsAttemptedRef.current) return;
        void loadClubs();
    }, [clubCatalog.length, clubsLoading, editingParticipant, isAddDrawerOpen]);

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

    const sortedPhases = useMemo(
        () => [...phases].sort((left, right) => (left.order_index ?? 0) - (right.order_index ?? 0)),
        [phases]
    );

    const phaseNameById = useMemo(
        () => new Map(phases.map((phase) => [phase.id, phase.name])),
        [phases]
    );

    const groupById = useMemo(
        () => new Map(groups.map((group) => [group.id, group])),
        [groups]
    );

    const participantById = useMemo(
        () => new Map(participants.map((participant) => [participant.id, participant])),
        [participants]
    );

    const legacyPhaseAssignments = useMemo<ParticipantPhaseAssignment[]>(() => {
        return participants.flatMap((participant) => {
            if (!participant.group_id) return [];
            const group = groupById.get(participant.group_id);
            if (!group?.phase_id) return [];

            return [{
                id: `legacy-${group.phase_id}-${participant.id}`,
                tournament_id: participant.tournament_id,
                season_id: null,
                phase_id: group.phase_id,
                participant_id: participant.id,
                group_id: participant.group_id,
                status: participant.status,
                seed: participant.seed,
                notes: null,
                source: 'legacy' as const,
            }];
        });
    }, [groupById, participants]);

    const effectivePhaseAssignments = useMemo(() => {
        return phaseAssignmentsReady ? phaseAssignments : legacyPhaseAssignments;
    }, [legacyPhaseAssignments, phaseAssignments, phaseAssignmentsReady]);

    const phaseAssignmentsByParticipant = useMemo(() => {
        const map = new Map<string, PhaseRosterItem[]>();

        effectivePhaseAssignments.forEach((assignment) => {
            const participant = participantById.get(assignment.participant_id);
            if (!participant) return;

            const item: PhaseRosterItem = {
                assignment,
                participant,
                group: assignment.group_id ? groupById.get(assignment.group_id) ?? null : null,
            };
            const current = map.get(assignment.participant_id) ?? [];
            current.push(item);
            map.set(assignment.participant_id, current);
        });

        map.forEach((items) => {
            items.sort((left, right) => {
                const phaseOrderLeft = phases.find((phase) => phase.id === left.assignment.phase_id)?.order_index ?? 999;
                const phaseOrderRight = phases.find((phase) => phase.id === right.assignment.phase_id)?.order_index ?? 999;
                if (phaseOrderLeft !== phaseOrderRight) return phaseOrderLeft - phaseOrderRight;
                return (left.group?.order_index ?? 999) - (right.group?.order_index ?? 999);
            });
        });

        return map;
    }, [effectivePhaseAssignments, groupById, participantById, phases]);

    const phaseRosterByPhase = useMemo(() => {
        const map = new Map<string, PhaseRosterItem[]>();

        effectivePhaseAssignments.forEach((assignment) => {
            const participant = participantById.get(assignment.participant_id);
            if (!participant) return;

            const current = map.get(assignment.phase_id) ?? [];
            current.push({
                assignment,
                participant,
                group: assignment.group_id ? groupById.get(assignment.group_id) ?? null : null,
            });
            map.set(assignment.phase_id, current);
        });

        map.forEach((items) => {
            items.sort((left, right) => {
                const groupOrderLeft = left.group?.order_index ?? 999;
                const groupOrderRight = right.group?.order_index ?? 999;
                if (groupOrderLeft !== groupOrderRight) return groupOrderLeft - groupOrderRight;
                return (left.participant.name || '').localeCompare(right.participant.name || '');
            });
        });

        return map;
    }, [effectivePhaseAssignments, groupById, participantById]);

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
            result = result.filter((participant) =>
                (phaseAssignmentsByParticipant.get(participant.id) ?? []).some((item) => item.assignment.group_id === groupFilter)
            );
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
    }, [participants, searchQuery, typeFilter, statusFilter, groupFilter, sortBy, phaseAssignmentsByParticipant]);

    const visibleMobileParticipants = useMemo(() => {
        if (mobilePhaseFilter === 'all') return filteredParticipants;
        return filteredParticipants.filter((p) =>
            (phaseAssignmentsByParticipant.get(p.id) ?? []).some((item) =>
                item.assignment.phase_id === mobilePhaseFilter
            )
        );
    }, [filteredParticipants, mobilePhaseFilter, phaseAssignmentsByParticipant]);

    const phasesWithGroups = useMemo(
        () => phases.filter((phase) => groups.some((group) => group.phase_id === phase.id)),
        [phases, groups]
    );

    const assignmentPhases = sortedPhases;

    const assignableGroups = useMemo(() => {
        if (!assignmentPhaseId) return [];
        return groups.filter((group) => group.phase_id === assignmentPhaseId);
    }, [assignmentPhaseId, groups]);

    const participantCountByGroup = useMemo(() => {
        const counts = new Map<string, number>();
        effectivePhaseAssignments.forEach((assignment) => {
            if (!assignment.group_id) return;
            counts.set(assignment.group_id, (counts.get(assignment.group_id) ?? 0) + 1);
        });
        return counts;
    }, [effectivePhaseAssignments]);

    const participantCountByPhase = useMemo(() => {
        const counts = new Map<string, number>();
        effectivePhaseAssignments.forEach((assignment) => {
            counts.set(assignment.phase_id, (counts.get(assignment.phase_id) ?? 0) + 1);
        });
        return counts;
    }, [effectivePhaseAssignments]);

    useEffect(() => {
        if (assignmentPhases.length === 0) {
            setAssignmentPhaseId('');
            return;
        }

        setAssignmentPhaseId((current) =>
            assignmentPhases.some((phase) => phase.id === current) ? current : assignmentPhases[0].id
        );
    }, [assignmentPhases]);

    const formatGroupLabel = (group: TournamentGroup) => {
        const phaseName = group.phase_id ? phaseNameById.get(group.phase_id) : '';
        return phaseName ? `${phaseName} - ${group.name}` : group.name;
    };

    // ============================================
    // CRUD OPERATIONS
    // ============================================

    const upsertPhaseAssignments = async (phaseId: string, participantIds: string[], groupId: string | null) => {
        if (!tournamentId) return [] as ParticipantPhaseAssignment[];

        const response = await fetch(`/api/tournaments/${tournamentId}/phase-participants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phaseId,
                participantIds,
                groupId,
                status: 'active',
            }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(payload?.error || 'Error al asignar participantes a la fase');
        }

        const assignments = Array.isArray(payload?.assignments)
            ? payload.assignments as ParticipantPhaseAssignment[]
            : [];
        const participantIdSet = new Set(participantIds);

        setPhaseAssignmentsReady(payload?.tableReady !== false);
        setPhaseAssignments((prev) => [
            ...prev.filter((assignment) =>
                !(assignment.phase_id === phaseId && participantIdSet.has(assignment.participant_id))
            ),
            ...assignments,
        ]);

        if (groupId) {
            setParticipants((prev) => prev.map((participant) =>
                participantIdSet.has(participant.id)
                    ? { ...participant, group_id: groupId }
                    : participant
            ));
        }

        return assignments;
    };

    const removePhaseAssignments = async (phaseId: string, participantIds: string[]) => {
        if (!tournamentId) return;

        const response = await fetch(`/api/tournaments/${tournamentId}/phase-participants`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phaseId, participantIds }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(payload?.error || 'Error al quitar participantes de la fase');
        }

        const participantIdSet = new Set(participantIds);
        const phaseGroupIds = new Set(groups.filter((group) => group.phase_id === phaseId).map((group) => group.id));

        setPhaseAssignments((prev) => prev.filter((assignment) =>
            !(assignment.phase_id === phaseId && participantIdSet.has(assignment.participant_id))
        ));
        setParticipants((prev) => prev.map((participant) =>
            participantIdSet.has(participant.id) && participant.group_id && phaseGroupIds.has(participant.group_id)
                ? { ...participant, group_id: null }
                : participant
        ));
    };

    const syncLegacyGroupToPhaseAssignment = async (participantIds: string[], groupId: string | null) => {
        if (!groupId) return;
        const group = groupById.get(groupId);
        if (!group?.phase_id) return;
        await upsertPhaseAssignments(group.phase_id, participantIds, groupId);
    };

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
            if (data.group_id !== undefined) {
                if (data.group_id) {
                    await syncLegacyGroupToPhaseAssignment([id], data.group_id);
                } else if (editingParticipant?.group_id) {
                    const previousGroup = groupById.get(editingParticipant.group_id);
                    if (previousGroup?.phase_id) {
                        await removePhaseAssignments(previousGroup.phase_id, [id]);
                    }
                }
            }
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
            setPhaseAssignments((prev) => prev.filter((assignment) => assignment.participant_id !== id));
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
            setPhaseAssignments((prev) => prev.filter((assignment) => !selectedIds.has(assignment.participant_id)));
            setSelectedIds(new Set());
            showToast('success', `${selectedIds.size} participantes eliminados correctamente`);
        } catch {
            showToast('error', 'Error al eliminar participantes');
        }
    };

    const handleBulkAssignPhase = async (phaseId: string, groupId: string | null) => {
        if (selectedIds.size === 0) {
            showToast('error', 'Selecciona al menos un participante para asignar fase');
            return;
        }

        if (!phaseId) {
            showToast('error', 'Selecciona una fase para asignar participantes');
            return;
        }

        try {
            setGroupAssignmentLoading(true);

            const participantIds = Array.from(selectedIds);
            const updates = await upsertPhaseAssignments(phaseId, participantIds, groupId);
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
                    `${updates.length} participante${updates.length !== 1 ? 's' : ''} agregado${updates.length !== 1 ? 's' : ''} a ${phaseNameById.get(phaseId) || 'la fase'}`
                );
            }
        } catch (err) {
            showToast('error', getErrorMessage(err, 'Error al actualizar participantes por fase'));
        } finally {
            setGroupAssignmentLoading(false);
        }
    };

    const handleBulkRemoveFromPhase = async (phaseId: string) => {
        if (selectedIds.size === 0) {
            showToast('error', 'Selecciona al menos un participante para quitar de la fase');
            return;
        }

        if (!phaseId) {
            showToast('error', 'Selecciona una fase');
            return;
        }

        try {
            setGroupAssignmentLoading(true);
            const participantIds = Array.from(selectedIds);
            await removePhaseAssignments(phaseId, participantIds);
            setSelectedIds(new Set());
            showToast(
                'success',
                `${participantIds.length} participante${participantIds.length !== 1 ? 's' : ''} quitado${participantIds.length !== 1 ? 's' : ''} solo de ${phaseNameById.get(phaseId) || 'la fase'}`
            );
        } catch (err) {
            showToast('error', getErrorMessage(err, 'Error al quitar participantes de la fase'));
        } finally {
            setGroupAssignmentLoading(false);
        }
    };

    const handleRemoveOneFromPhase = async (phaseId: string, participantId: string) => {
        try {
            await removePhaseAssignments(phaseId, [participantId]);
            showToast('success', 'Participante quitado solo de esta fase');
        } catch (err) {
            showToast('error', getErrorMessage(err, 'Error al quitar participante de la fase'));
        }
    };

    const handleImport = async (newList: Partial<Participant>[]) => {
        try {
            const promises = newList.map(p =>
                fetch(`/api/tournaments/${tournamentId}/participants`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...p, seasonId: currentSeasonId }),
                }).then(res => res.json())
            );
            const results = await Promise.all(promises);
            setParticipants(prev => [...results, ...prev]);
            const byGroup = new Map<string, string[]>();
            results.forEach((participant: Participant) => {
                if (!participant.group_id) return;
                byGroup.set(participant.group_id, [...(byGroup.get(participant.group_id) ?? []), participant.id]);
            });
            await Promise.all(Array.from(byGroup, ([groupId, participantIds]) =>
                syncLegacyGroupToPhaseAssignment(participantIds, groupId)
            ));
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
                    body: JSON.stringify({ ...p, seasonId: currentSeasonId }),
                }).then(async res => {
                    if (!res.ok) throw new Error('Error al crear participante');
                    return res.json();
                })
            );
            const results = await Promise.all(promises);
            setParticipants(prev => [...results, ...prev]);
            const byGroup = new Map<string, string[]>();
            results.forEach((participant: Participant) => {
                if (!participant.group_id) return;
                byGroup.set(participant.group_id, [...(byGroup.get(participant.group_id) ?? []), participant.id]);
            });
            await Promise.all(Array.from(byGroup, ([groupId, participantIds]) =>
                syncLegacyGroupToPhaseAssignment(participantIds, groupId)
            ));
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
            ['Nombre', 'Tipo', 'Codigo', 'Seed', 'Estado', 'Fases'].join(','),
            ...participants.map(p => {
                const phaseSummary = (phaseAssignmentsByParticipant.get(p.id) ?? [])
                    .map((item) => {
                        const phaseName = phaseNameById.get(item.assignment.phase_id) || 'Fase';
                        return item.group ? `${phaseName}: ${item.group.name}` : phaseName;
                    })
                    .join(' | ');

                return [
                    p.name,
                    p.type,
                    p.short_code || '',
                    p.seed || '',
                    p.status,
                    phaseSummary,
                ].join(',');
            })
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

    const renderPhaseRosterMembers = (items: PhaseRosterItem[], phaseId: string) => {
        if (items.length === 0) {
            return (
                <div className="phase-roster-empty">
                    Sin participantes asignados.
                </div>
            );
        }

        return (
            <div className="phase-roster-members">
                {items.map((item) => (
                    <div key={`${item.assignment.id}-${item.participant.id}`} className="phase-roster-member">
                        <div className="phase-roster-member-logo">
                            {item.participant.clubs?.logo_url ? (
                                <img src={item.participant.clubs.logo_url} alt={item.participant.name} />
                            ) : (
                                <IdCard />
                            )}
                        </div>
                        <div className="phase-roster-member-main">
                            <strong>{item.participant.name}</strong>
                            <span>{item.group?.name || item.participant.short_code || 'Sin grupo'}</span>
                        </div>
                        <button
                            type="button"
                            className="phase-roster-remove"
                            onClick={() => handleRemoveOneFromPhase(phaseId, item.participant.id)}
                            title="Quitar solo de esta fase"
                        >
                            <X />
                        </button>
                    </div>
                ))}
            </div>
        );
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
            {/* =====================================================
                Mobile (<= 767px) - completamente rediseñado.
                Oculto en desktop via CSS (.participants-flash-container).
                ===================================================== */}
            <section className="tournament-participants-mobile" aria-label="Participantes del torneo">
                {/* ===== HERO compacto: total + estado del torneo ===== */}
                <header className="tsm-hero">
                    <div className="tsm-hero-line">
                        <div className="tsm-hero-title">
                            <span className="tsm-hero-eyebrow">Participantes</span>
                            <strong className="tsm-hero-total-value">{stats.total}</strong>
                            <span className="tsm-hero-total-suffix">
                                equipo{stats.total === 1 ? '' : 's'}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="tsm-hero-history"
                            onClick={() => setIsHistoryDrawerOpen(true)}
                            aria-label="Ver historial"
                        >
                            <History size={14} />
                        </button>
                    </div>
                </header>

                {/* ===== Phase tabs (si hay fases configuradas) ===== */}
                {assignmentPhases.length > 0 && (
                    <div className="tsm-phase-tabs" role="tablist" aria-label="Filtrar por fase">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mobilePhaseFilter === 'all'}
                            className={`tsm-phase-tab ${mobilePhaseFilter === 'all' ? 'is-on' : ''}`}
                            onClick={() => setMobilePhaseFilter('all')}
                        >
                            <span className="tsm-phase-tab-name">Todas</span>
                            <span className="tsm-phase-tab-count">{participants.length}</span>
                        </button>
                        {assignmentPhases.map((phase) => {
                            const count = participantCountByPhase.get(phase.id) ?? 0;
                            const active = mobilePhaseFilter === phase.id;
                            return (
                                <button
                                    key={phase.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    className={`tsm-phase-tab ${active ? 'is-on' : ''}`}
                                    onClick={() => {
                                        setMobilePhaseFilter(active ? 'all' : phase.id);
                                        setAssignmentPhaseId(phase.id);
                                    }}
                                >
                                    <span className="tsm-phase-tab-name">{phase.name}</span>
                                    <span className="tsm-phase-tab-count">{count}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ===== Toolbar: search + filter trigger (sticky) ===== */}
                <div className="tsm-toolbar">
                    <div className="tsm-search">
                        <Search size={16} aria-hidden="true" />
                        <input
                            type="search"
                            className="tsm-search-input"
                            placeholder="Buscar nombre o codigo..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            aria-label="Buscar participante"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                className="tsm-search-clear"
                                onClick={() => setSearchQuery('')}
                                aria-label="Limpiar busqueda"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        className={`tsm-filter-trigger ${(typeFilter !== 'all' || groupFilter !== 'all' || sortBy !== 'recent' || statusFilter !== 'all') ? 'is-on' : ''}`}
                        onClick={() => setIsMobileFiltersOpen(true)}
                        aria-label="Mas filtros"
                    >
                        <SlidersHorizontal size={16} />
                        {(typeFilter !== 'all' || groupFilter !== 'all' || sortBy !== 'recent' || statusFilter !== 'all') && (
                            <span className="tsm-filter-trigger-dot" aria-hidden="true" />
                        )}
                    </button>
                </div>

                {/* ===== Status filter chips (horizontal scroll) ===== */}
                <div className="tsm-status-chips" role="group" aria-label="Filtrar por estado">
                    {[
                        { v: 'all', l: 'Todos', count: stats.total },
                        { v: 'active', l: 'Activos', count: stats.active },
                        { v: 'pending', l: 'Pendientes', count: stats.pending },
                        { v: 'inactive', l: 'Inactivos', count: stats.inactive },
                        { v: 'disqualified', l: 'Descalif.', count: stats.disqualified },
                    ].map((opt) => (
                        <button
                            key={opt.v}
                            type="button"
                            className={`tsm-status-chip is-${opt.v} ${statusFilter === opt.v ? 'is-on' : ''} ${opt.count === 0 && opt.v !== 'all' ? 'is-empty' : ''}`}
                            onClick={() => setStatusFilter(opt.v)}
                        >
                            <span className="tsm-status-chip-label">{opt.l}</span>
                            <span className="tsm-status-chip-count">{opt.count}</span>
                        </button>
                    ))}
                </div>

                {/* ===== Active filter chips (resumen + clear all) ===== */}
                {(typeFilter !== 'all' || groupFilter !== 'all' || sortBy !== 'recent' || mobilePhaseFilter !== 'all') && (
                    <div className="tsm-active-chips">
                        {typeFilter !== 'all' && (
                            <button type="button" className="tsm-active-chip" onClick={() => setTypeFilter('all')}>
                                {typeFilter === 'club' ? 'Club' : typeFilter === 'national_team' ? 'Seleccion' : 'Individual'}
                                <X size={12} />
                            </button>
                        )}
                        {groupFilter !== 'all' && (
                            <button type="button" className="tsm-active-chip" onClick={() => setGroupFilter('all')}>
                                {groupById.get(groupFilter)?.name || 'Grupo'}
                                <X size={12} />
                            </button>
                        )}
                        {mobilePhaseFilter !== 'all' && (
                            <button type="button" className="tsm-active-chip" onClick={() => setMobilePhaseFilter('all')}>
                                {phaseNameById.get(mobilePhaseFilter) || 'Fase'}
                                <X size={12} />
                            </button>
                        )}
                        {sortBy !== 'recent' && (
                            <button type="button" className="tsm-active-chip" onClick={() => setSortBy('recent')}>
                                <ArrowUpDown size={12} />
                                {sortBy === 'name-asc' ? 'A->Z' : sortBy === 'name-desc' ? 'Z->A' : 'Seed'}
                                <X size={12} />
                            </button>
                        )}
                        <button
                            type="button"
                            className="tsm-active-clear"
                            onClick={() => {
                                setTypeFilter('all');
                                setGroupFilter('all');
                                setSortBy('recent');
                                setMobilePhaseFilter('all');
                            }}
                        >
                            Limpiar
                        </button>
                    </div>
                )}

                {/* ===== Meta linea (resultados + hint de selección) ===== */}
                <div className="tsm-list-meta">
                    <span>
                        <strong>{visibleMobileParticipants.length}</strong>
                        {visibleMobileParticipants.length !== participants.length ? ` de ${participants.length}` : ''}
                        {' '}equipos
                    </span>
                    {selectedIds.size === 0 && visibleMobileParticipants.length > 0 && (
                        <span className="tsm-list-meta-hint" aria-hidden="true">
                            Tap logo = seleccionar
                        </span>
                    )}
                </div>

                {/* ===== Lista ===== */}
                {visibleMobileParticipants.length === 0 ? (
                    <div className="tsm-empty">
                        <Users size={28} aria-hidden="true" />
                        <strong>{participants.length === 0 ? 'Sin participantes' : 'Sin resultados'}</strong>
                        <small>
                            {participants.length === 0
                                ? 'Agrega tu primer equipo para empezar a configurar el torneo.'
                                : 'No hay equipos con los filtros actuales. Ajusta o limpia filtros.'}
                        </small>
                        {participants.length === 0 ? (
                            <button
                                type="button"
                                className="tsm-empty-cta primary"
                                onClick={() => setIsAddDrawerOpen(true)}
                            >
                                <Plus size={16} /> Agregar participante
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="tsm-empty-cta"
                                onClick={() => {
                                    setSearchQuery('');
                                    setTypeFilter('all');
                                    setStatusFilter('all');
                                    setGroupFilter('all');
                                    setMobilePhaseFilter('all');
                                }}
                            >
                                Limpiar filtros
                            </button>
                        )}
                    </div>
                ) : (
                    <ul className="tsm-participant-list" role="list">
                        {visibleMobileParticipants.slice(0, mobileVisibleCount).map((p, idx) => {
                            const isChecked = selectedIds.has(p.id);
                            const phaseChips = phaseAssignmentsByParticipant.get(p.id) ?? [];
                            // section letter (only when sorted alpha)
                            const sectionLetter = (sortBy === 'name-asc' || sortBy === 'name-desc')
                                ? (p.name?.charAt(0).toUpperCase() || '#')
                                : null;
                            const prevLetter = (sortBy === 'name-asc' || sortBy === 'name-desc') && idx > 0
                                ? (visibleMobileParticipants[idx - 1]?.name?.charAt(0).toUpperCase() || '#')
                                : null;
                            const showLetter = sectionLetter && sectionLetter !== prevLetter;
                            return (
                                <React.Fragment key={p.id}>
                                    {showLetter && (
                                        <li className="tsm-section-letter" aria-hidden="true">{sectionLetter}</li>
                                    )}
                                    <li className={`tsm-participant-item is-${p.status} ${isChecked ? 'is-selected' : ''}`}>
                                        <button
                                            type="button"
                                            className="tsm-participant-logo-btn"
                                            onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }}
                                            aria-label={isChecked ? 'Quitar seleccion' : 'Seleccionar'}
                                            aria-pressed={isChecked}
                                        >
                                            <span className="tsm-participant-logo">
                                                {isChecked ? (
                                                    <CheckSquare size={18} />
                                                ) : p.clubs?.logo_url ? (
                                                    <img src={p.clubs.logo_url} alt="" />
                                                ) : (
                                                    <IdCard size={18} aria-hidden="true" />
                                                )}
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            className="tsm-participant-main"
                                            onClick={() => setEditingParticipant(p)}
                                        >
                                            <span className="tsm-participant-text">
                                                <strong>{p.name}</strong>
                                                <small>
                                                    {p.short_code ? `${p.short_code}` : '---'}
                                                    {' . '}
                                                    {p.type === 'club' ? 'Club' : p.type === 'national_team' ? 'Seleccion' : 'Individual'}
                                                    {p.seed ? ` . seed ${p.seed}` : ''}
                                                </small>
                                                {phaseChips.length > 0 && (
                                                    <span className="tsm-participant-phases">
                                                        {phaseChips.slice(0, 2).map((item) => (
                                                            <span key={`${item.assignment.phase_id}-${item.assignment.group_id || 'p'}`} className="tsm-mini-chip">
                                                                {phaseNameById.get(item.assignment.phase_id) || 'Fase'}
                                                                {item.group ? ` . ${item.group.name}` : ''}
                                                            </span>
                                                        ))}
                                                        {phaseChips.length > 2 && (
                                                            <span className="tsm-mini-chip is-more">+{phaseChips.length - 2}</span>
                                                        )}
                                                    </span>
                                                )}
                                            </span>
                                        </button>

                                        <span className={`tsm-status-rail is-${p.status}`} aria-hidden="true" />
                                    </li>
                                </React.Fragment>
                            );
                        })}
                    </ul>
                )}

                {visibleMobileParticipants.length > mobileVisibleCount && (
                    <button
                        type="button"
                        className="tsm-load-more"
                        onClick={() => setMobileVisibleCount((c) => c + 50)}
                    >
                        Cargar 50 mas ({visibleMobileParticipants.length - mobileVisibleCount} restantes)
                    </button>
                )}

                {/* ===== Bottom action bar (sticky, contextual) ===== */}
                <div className="tsm-bottom-bar" role="toolbar" aria-label="Acciones">
                    {selectedIds.size > 0 ? (
                        <>
                            <button
                                type="button"
                                className="tsm-bottom-bar-icon"
                                onClick={() => setSelectedIds(new Set())}
                                aria-label="Limpiar seleccion"
                            >
                                <X size={18} />
                            </button>
                            <span className="tsm-bottom-bar-info">
                                {selectedIds.size} sel.
                            </span>
                            {assignmentPhases.length > 0 && (
                                <button
                                    type="button"
                                    className="tsm-bottom-bar-btn is-primary"
                                    onClick={() => setIsMobilePhaseSheetOpen(true)}
                                >
                                    <Layers size={16} /> Asignar
                                </button>
                            )}
                            <button
                                type="button"
                                className="tsm-bottom-bar-btn is-danger"
                                onClick={handleBulkDelete}
                                aria-label="Eliminar seleccionados"
                            >
                                <Trash2 size={16} />
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="tsm-bottom-bar-fab"
                                onClick={() => setIsAddDrawerOpen(true)}
                                aria-label="Nuevo participante"
                            >
                                <Plus size={18} />
                                <span>Nuevo participante</span>
                            </button>
                            <button
                                type="button"
                                className="tsm-bottom-bar-btn is-export"
                                onClick={handleExport}
                                aria-label="Exportar participantes"
                            >
                                <Download size={16} />
                                <span>Exportar</span>
                            </button>
                            <button
                                type="button"
                                className="tsm-bottom-bar-icon"
                                onClick={() => setIsMobileMoreMenuOpen(true)}
                                aria-label="Mas acciones"
                            >
                                <MoreHorizontal size={18} />
                            </button>
                        </>
                    )}
                </div>

                {/* ===== Sheet: filtros ===== */}
                {isMobileFiltersOpen && (
                    <div className="tsm-sheet-backdrop" onClick={() => setIsMobileFiltersOpen(false)}>
                        <div className="tsm-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Filtros">
                            <div className="tsm-sheet-handle" aria-hidden="true" />
                            <div className="tsm-sheet-head">
                                <h3>Filtros y orden</h3>
                                <button type="button" className="tsm-sheet-close" onClick={() => setIsMobileFiltersOpen(false)} aria-label="Cerrar"><X size={16} /></button>
                            </div>
                            <div className="tsm-sheet-body">
                                <div className="tsm-sheet-section">
                                    <label>Tipo de participante</label>
                                    <div className="tsm-chip-row">
                                        {[
                                            { v: 'all', l: 'Todos' },
                                            { v: 'club', l: 'Club' },
                                            { v: 'national_team', l: 'Seleccion' },
                                            { v: 'individual', l: 'Individual' },
                                        ].map((opt) => (
                                            <button
                                                key={opt.v}
                                                type="button"
                                                className={`tsm-chip ${typeFilter === opt.v ? 'is-on' : ''}`}
                                                onClick={() => setTypeFilter(opt.v)}
                                            >
                                                {opt.l}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {groups.length > 0 && (
                                    <div className="tsm-sheet-section">
                                        <label>Grupo</label>
                                        <div className="tsm-chip-row">
                                            <button
                                                type="button"
                                                className={`tsm-chip ${groupFilter === 'all' ? 'is-on' : ''}`}
                                                onClick={() => setGroupFilter('all')}
                                            >
                                                Todos
                                            </button>
                                            {groups.map((g) => (
                                                <button
                                                    key={g.id}
                                                    type="button"
                                                    className={`tsm-chip ${groupFilter === g.id ? 'is-on' : ''}`}
                                                    onClick={() => setGroupFilter(g.id)}
                                                >
                                                    {g.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="tsm-sheet-section">
                                    <label>Orden</label>
                                    <div className="tsm-chip-row">
                                        {[
                                            { v: 'recent', l: 'Mas recientes' },
                                            { v: 'name-asc', l: 'A -> Z' },
                                            { v: 'name-desc', l: 'Z -> A' },
                                            { v: 'seed', l: 'Seed' },
                                        ].map((opt) => (
                                            <button
                                                key={opt.v}
                                                type="button"
                                                className={`tsm-chip ${sortBy === opt.v ? 'is-on' : ''}`}
                                                onClick={() => setSortBy(opt.v)}
                                            >
                                                {opt.l}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="tsm-sheet-foot">
                                <button
                                    type="button"
                                    className="tsm-sheet-clear"
                                    onClick={() => {
                                        setTypeFilter('all');
                                        setStatusFilter('all');
                                        setGroupFilter('all');
                                        setSortBy('recent');
                                        setMobilePhaseFilter('all');
                                    }}
                                >
                                    Limpiar
                                </button>
                                <button
                                    type="button"
                                    className="tsm-sheet-apply"
                                    onClick={() => setIsMobileFiltersOpen(false)}
                                >
                                    Ver {visibleMobileParticipants.length} resultado{visibleMobileParticipants.length === 1 ? '' : 's'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== Sheet: mas acciones ===== */}
                {isMobileMoreMenuOpen && (
                    <div className="tsm-sheet-backdrop" onClick={() => setIsMobileMoreMenuOpen(false)}>
                        <div className="tsm-sheet is-compact" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Mas acciones">
                            <div className="tsm-sheet-handle" aria-hidden="true" />
                            <div className="tsm-sheet-actions">
                                <button
                                    type="button"
                                    className="tsm-sheet-action"
                                    onClick={() => { setIsMobileMoreMenuOpen(false); setIsImportDrawerOpen(true); }}
                                >
                                    <FileUp size={18} />
                                    <span><strong>Importar</strong><small>CSV o lista de clubes</small></span>
                                </button>
                                <button
                                    type="button"
                                    className="tsm-sheet-action"
                                    onClick={() => { setIsMobileMoreMenuOpen(false); handleExport(); }}
                                >
                                    <Download size={18} />
                                    <span><strong>Exportar CSV</strong><small>Descargar listado</small></span>
                                </button>
                                <button
                                    type="button"
                                    className="tsm-sheet-action"
                                    onClick={() => { setIsMobileMoreMenuOpen(false); setIsHistoryDrawerOpen(true); }}
                                >
                                    <History size={18} />
                                    <span><strong>Historial</strong><small>Auditoria de cambios</small></span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== Sheet: asignar a fase (solo cuando hay seleccion) ===== */}
                {isMobilePhaseSheetOpen && (
                    <div className="tsm-sheet-backdrop" onClick={() => setIsMobilePhaseSheetOpen(false)}>
                        <div className="tsm-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Asignar a fase">
                            <div className="tsm-sheet-handle" aria-hidden="true" />
                            <div className="tsm-sheet-head">
                                <h3>Asignar {selectedIds.size} a fase</h3>
                                <button type="button" className="tsm-sheet-close" onClick={() => setIsMobilePhaseSheetOpen(false)} aria-label="Cerrar"><X size={16} /></button>
                            </div>
                            <div className="tsm-sheet-body">
                                <div className="tsm-sheet-section">
                                    <label>Fase destino</label>
                                    <div className="tsm-chip-row">
                                        {assignmentPhases.map((phase) => (
                                            <button
                                                key={phase.id}
                                                type="button"
                                                className={`tsm-chip ${assignmentPhaseId === phase.id ? 'is-on' : ''}`}
                                                onClick={() => setAssignmentPhaseId(phase.id)}
                                            >
                                                {phase.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {assignableGroups.length > 0 && (
                                    <div className="tsm-sheet-section">
                                        <label>Grupo (opcional)</label>
                                        <div className="tsm-chip-row">
                                            {assignableGroups.map((group) => (
                                                <button
                                                    key={group.id}
                                                    type="button"
                                                    className="tsm-chip"
                                                    onClick={async () => {
                                                        await handleBulkAssignPhase(group.phase_id || assignmentPhaseId, group.id);
                                                        setIsMobilePhaseSheetOpen(false);
                                                    }}
                                                    disabled={groupAssignmentLoading || selectedIds.size === 0}
                                                >
                                                    {group.name}
                                                    <small style={{ marginLeft: 6, opacity: 0.7 }}>{participantCountByGroup.get(group.id) ?? 0}</small>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="tsm-sheet-foot tsm-sheet-foot-stack">
                                <button
                                    type="button"
                                    className="tsm-sheet-apply"
                                    onClick={async () => {
                                        await handleBulkAssignPhase(assignmentPhaseId, null);
                                        setIsMobilePhaseSheetOpen(false);
                                    }}
                                    disabled={groupAssignmentLoading || selectedIds.size === 0 || !assignmentPhaseId}
                                >
                                    Agregar a {phaseNameById.get(assignmentPhaseId) || 'fase'}
                                </button>
                                <button
                                    type="button"
                                    className="tsm-sheet-clear is-danger"
                                    onClick={async () => {
                                        await handleBulkRemoveFromPhase(assignmentPhaseId);
                                        setIsMobilePhaseSheetOpen(false);
                                    }}
                                    disabled={groupAssignmentLoading || selectedIds.size === 0 || !assignmentPhaseId}
                                >
                                    Quitar de la fase
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </section>

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
                    <button
                        onClick={() => setIsHistoryDrawerOpen(true)}
                        className="btn-flash"
                        aria-label="Historial de participantes"
                    >
                        <History />
                        <span>Historial</span>
                    </button>
                    <button
                        onClick={handleExport}
                        className="btn-flash"
                        aria-label="Exportar participantes"
                    >
                        <Download />
                        <span>Exportar</span>
                    </button>
                    <button
                        onClick={() => setIsImportDrawerOpen(true)}
                        className="btn-flash"
                        aria-label="Importar participantes"
                    >
                        <FileUp />
                        <span>Importar</span>
                    </button>
                    <button
                        onClick={() => setIsAddDrawerOpen(true)}
                        className="btn-flash primary"
                        aria-label="Nuevo participante"
                    >
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

            {assignmentPhases.length > 0 && (
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
                            {isPhaseAssignmentOpen && <div className="phase-assignment-kicker">Gestion por fase</div>}
                            <h2 className="phase-assignment-title">Participantes por fase</h2>
                            {isPhaseAssignmentOpen && (
                                <p className="phase-assignment-copy">
                                    Agrega o quita participantes de una fase sin borrarlos del torneo.
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
                                    {assignmentPhases.map((phase) => (
                                        <option key={phase.id} value={phase.id}>
                                            {phase.name}
                                        </option>
                                    ))}
                                </select>

                                <button
                                    type="button"
                                    className="btn-flash"
                                    onClick={() => handleBulkAssignPhase(assignmentPhaseId, null)}
                                    disabled={groupAssignmentLoading || selectedIds.size === 0}
                                >
                                    Agregar a fase
                                </button>

                                <button
                                    type="button"
                                    className="btn-flash danger"
                                    onClick={() => handleBulkRemoveFromPhase(assignmentPhaseId)}
                                    disabled={groupAssignmentLoading || selectedIds.size === 0}
                                >
                                    Quitar de fase
                                </button>
                            </div>

                            {assignableGroups.length > 0 && (
                                <div className="phase-assignment-groups">
                                    {assignableGroups.map((group) => {
                                        const participantCount = participantCountByGroup.get(group.id) ?? 0;

                                        return (
                                            <button
                                                key={group.id}
                                                type="button"
                                                className="phase-group-action"
                                                onClick={() => handleBulkAssignPhase(group.phase_id || assignmentPhaseId, group.id)}
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
                                                        ? `Asignar ${selectedIds.size} seleccionado${selectedIds.size === 1 ? '' : 's'}`
                                                        : 'Selecciona equipos en la tabla'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="phase-assignment-hint">
                                {selectedIds.size > 0
                                    ? `${selectedIds.size} participante${selectedIds.size === 1 ? '' : 's'} seleccionado${selectedIds.size === 1 ? '' : 's'} para ${phaseNameById.get(assignmentPhaseId) || 'la fase seleccionada'}.`
                                    : 'Marca uno o mas participantes en la tabla para operar sobre la fase elegida.'}
                            </div>

                            <div className="phase-roster-grid">
                                {assignmentPhases.map((phase) => {
                                    const roster = phaseRosterByPhase.get(phase.id) ?? [];
                                    const groupsForPhase = groups.filter((group) => group.phase_id === phase.id);
                                    const ungroupedRoster = roster.filter((item) => !item.group);

                                    return (
                                        <article key={phase.id} className="phase-roster-card">
                                            <div className="phase-roster-card-head">
                                                <div>
                                                    <span className="phase-roster-kicker">Fase #{phase.order_index + 1}</span>
                                                    <h3>{phase.name}</h3>
                                                    <p>{phase.phase_type} - {participantCountByPhase.get(phase.id) ?? 0} participante{(participantCountByPhase.get(phase.id) ?? 0) === 1 ? '' : 's'}</p>
                                                </div>
                                            </div>

                                            {groupsForPhase.length > 0 ? (
                                                <div className="phase-roster-group-list">
                                                    {groupsForPhase.map((group) => {
                                                        const groupRoster = roster.filter((item) => item.group?.id === group.id);

                                                        return (
                                                            <div key={group.id} className="phase-roster-group-row">
                                                                <div className="phase-roster-group-title">
                                                                    <strong>{group.name}</strong>
                                                                    <span>{groupRoster.length} equipo{groupRoster.length === 1 ? '' : 's'}</span>
                                                                </div>
                                                                {renderPhaseRosterMembers(groupRoster, phase.id)}
                                                            </div>
                                                        );
                                                    })}

                                                    {ungroupedRoster.length > 0 && (
                                                        <div className="phase-roster-group-row">
                                                            <div className="phase-roster-group-title">
                                                                <strong>Sin grupo</strong>
                                                                <span>{ungroupedRoster.length} equipo{ungroupedRoster.length === 1 ? '' : 's'}</span>
                                                            </div>
                                                            {renderPhaseRosterMembers(ungroupedRoster, phase.id)}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                renderPhaseRosterMembers(roster, phase.id)
                                            )}
                                        </article>
                                    );
                                })}
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
                                {assignmentPhases.length > 0 && <th>Fases</th>}
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredParticipants.length === 0 ? (
                                <tr>
                                    <td colSpan={assignmentPhases.length > 0 ? 7 : 6}>
                                        <div className="empty-state">
                                            <Users />
                                            <div className="empty-state-title">No se encontraron participantes</div>
                                            <div className="empty-state-description">
                                                {searchQuery || typeFilter !== 'all' || statusFilter !== 'all' || groupFilter !== 'all'
                                                    ? 'Prueba ajustando los filtros para ver más resultados.'
                                                    : 'Todavía no hay participantes. Agrega el primer participante para comenzar.'}
                                            </div>
                                            {(searchQuery || typeFilter !== 'all' || statusFilter !== 'all' || groupFilter !== 'all') && (
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
                                        {assignmentPhases.length > 0 && (
                                            <td>
                                                {(phaseAssignmentsByParticipant.get(p.id) ?? []).length > 0 ? (
                                                    <div className="participant-phase-cell">
                                                        {(phaseAssignmentsByParticipant.get(p.id) ?? []).map((item) => (
                                                            <span key={`${item.assignment.phase_id}-${item.assignment.group_id || 'phase'}`} className="participant-phase-chip">
                                                                {phaseNameById.get(item.assignment.phase_id) || 'Fase'}
                                                                {item.group ? ` - ${item.group.name}` : ''}
                                                            </span>
                                                        ))}
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
                clubs={clubCatalog}
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
                clubs={clubCatalog}
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
