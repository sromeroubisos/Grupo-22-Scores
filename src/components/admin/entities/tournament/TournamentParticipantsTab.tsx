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

import React, { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Users, Search, Plus, Download, FileUp, History,
    Pencil, Trash2, IdCard, ChevronDown,
    AlertCircle, CheckCircle2, X, MoreHorizontal, MoreVertical, SlidersHorizontal,
    CheckSquare, ArrowUpDown, Layers
} from 'lucide-react';
import './tournament-participants-flash.css';
import './participants-console.css';
import { Database } from '@/lib/database.types';

// Context & Drawers
import { AddParticipantDrawer } from './AddParticipantDrawer';
import { UpsertParticipantDrawer } from './UpsertParticipantDrawer';
import { ImportParticipantsDrawerV2 } from './ImportParticipantsDrawerV2';
import { ParticipantsHistoryDrawer } from './ParticipantsHistoryDrawer';
import { beginClientRequest, usePerfComponentLifecycle } from '@/lib/perf/react';

// PostgREST corta cada respuesta en 1000 filas (db-max-rows): una sola llamada
// con `limit=2000` devuelve 1000 y nadie avisa. Con el catálogo arriba de 1000
// clubes eso dejaba fuera todo lo que ordena después del corte —el cajón de
// participantes no encontraba "Uruguay" ni ningún club de la segunda mitad del
// abecedario— porque el buscador filtra en memoria sobre lo que llegó.
const CLUB_CATALOG_PAGE_SIZE = 1000;

type ClubCatalogPage = { status: number; ok: boolean; rows: ClubCatalogItem[] };

async function fetchClubCatalogPage(url: string): Promise<ClubCatalogPage> {
    const response = await fetch(url, { cache: 'no-store', credentials: 'include' });
    if (!response.ok) return { status: response.status, ok: false, rows: [] };
    const payload = await response.json().catch(() => null);
    const rows = Array.isArray(payload?.data) ? payload.data as ClubCatalogItem[] : [];
    return { status: response.status, ok: true, rows };
}

/** Pide página por página hasta que una venga corta: ahí se terminó el catálogo. */
async function fetchWholeClubCatalog(buildUrl: (offset: number) => string): Promise<ClubCatalogPage> {
    const rows: ClubCatalogItem[] = [];
    for (let offset = 0; ; offset += CLUB_CATALOG_PAGE_SIZE) {
        const page = await fetchClubCatalogPage(buildUrl(offset));
        if (!page.ok) return { status: page.status, ok: false, rows };
        rows.push(...page.rows);
        if (page.rows.length < CLUB_CATALOG_PAGE_SIZE) {
            return { status: page.status, ok: true, rows };
        }
    }
}

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

const STATUS_LABEL_PLURAL: Record<ParticipantStatus, string> = {
    active: 'Activos',
    pending: 'Pendientes',
    inactive: 'Inactivos',
    disqualified: 'Descalificados',
};

const STATUS_LABEL: Record<ParticipantStatus, string> = {
    active: 'Activo',
    pending: 'Pendiente',
    inactive: 'Inactivo',
    disqualified: 'Descalificado',
};

const TYPE_LABEL: Record<ParticipantType, string> = {
    club: 'Club',
    national_team: 'Selección',
    franchise: 'Franquicia',
    invited: 'Invitado',
    individual: 'Individual',
};

// ============================================
// VIEWPORT (SSR-safe, ÚNICA fuente del breakpoint mobile)
// ============================================
// 767 DEBE coincidir con el @media (max-width: 767px) de las cards en CSS.
// En 1c-ii se borra el toggle CSS y este número queda como única autoridad.
const PARTICIPANTS_MOBILE_MAX_WIDTH_PX = 767;
const PARTICIPANTS_MOBILE_MEDIA_QUERY = `(max-width: ${PARTICIPANTS_MOBILE_MAX_WIDTH_PX}px)`;

function subscribeParticipantsViewport(onChange: () => void) {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mql = window.matchMedia(PARTICIPANTS_MOBILE_MEDIA_QUERY);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
}
function getParticipantsViewportSnapshot() {
    return window.matchMedia(PARTICIPANTS_MOBILE_MEDIA_QUERY).matches;
}
function getParticipantsViewportServerSnapshot() {
    // SSR/primer paint: desktop. En teléfono, tras hidratar, useSyncExternalStore
    // re-renderiza a cards una sola vez, sin hydration mismatch.
    return false;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function TournamentParticipantsTab({ id: tournamentId, data }: Props) {
    const searchParams = useSearchParams();
    const currentSeasonId =
        searchParams.get('seasonId') ||
        searchParams.get('season_id') ||
        searchParams.get('season');
    // Fallback al current_season_id que el server ya resolvió (row del torneo, prop `data`),
    // SOLO para los 3 fetches cuyo route resuelve season (participants/phases/phase-participants):
    // así saltean su lookup de current_season_id. NO se usa en loadGroups para no cambiar su
    // filtrado (grupos con season_id NULL/de temporadas previas se esconderían → pantalla vacía;
    // ver GESTOR_TORNEOS_HALLAZGOS.md H6). El seasonId de la URL (season switcher) tiene prioridad.
    // NOTE: current_season_id no está en database.types (H5) → cast puntual.
    const resolvedSeasonId =
        currentSeasonId ||
        (data as { current_season_id?: string | null } | null | undefined)?.current_season_id ||
        null;
    usePerfComponentLifecycle('TournamentParticipantsTab', {
        tournamentId: tournamentId || 'unknown',
    });
    // Render condicional por breakpoint (Fase 1c). SSR-safe vía useSyncExternalStore.
    const isMobile = useSyncExternalStore(
        subscribeParticipantsViewport,
        getParticipantsViewportSnapshot,
        getParticipantsViewportServerSnapshot,
    );
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
    // Destino del bulk: la fase, y opcionalmente un grupo DENTRO de esa fase.
    // Antes el grupo no era estado: cada grupo era un botón propio en el panel,
    // así que la operación se elegía y se disparaba en el mismo gesto y no había
    // forma de ver a dónde iba a ir la selección antes de confirmarla.
    const [assignmentGroupId, setAssignmentGroupId] = useState<string | null>(null);
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
    // Per-card action sheet: stores the id of the participant whose ⋯ was tapped.
    // Renders a bottom sheet with Editar / Cambiar estado / Asignar a fase / Eliminar.
    const [cardActionParticipantId, setCardActionParticipantId] = useState<string | null>(null);
    // True once the user scrolls past the hero. Used to fade a compact count
    // chip into the sticky toolbar so the user keeps context when the hero
    // is offscreen. Driven by IntersectionObserver on a 1px sentinel after
    // the hero.
    const [isHeroOffscreen, setIsHeroOffscreen] = useState(false);
    const heroSentinelRef = useRef<HTMLDivElement | null>(null);

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

    // Observe a sentinel placed after the hero; flag offscreen when it leaves
    // viewport. Used to reveal the compact count chip in the sticky toolbar.
    useEffect(() => {
        const node = heroSentinelRef.current;
        if (!node || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(
            ([entry]) => setIsHeroOffscreen(!entry.isIntersecting),
            { threshold: 0 },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [isMobile]);

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
            if (resolvedSeasonId) query.set('seasonId', resolvedSeasonId);
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
            if (resolvedSeasonId) query.set('seasonId', resolvedSeasonId);
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
            if (resolvedSeasonId) query.set('seasonId', resolvedSeasonId);
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
            let result = await fetchWholeClubCatalog((offset) => (
                `/api/admin/torneo/clubs?limit=${CLUB_CATALOG_PAGE_SIZE}&offset=${offset}&divisions=0`
            ));
            if (result.status === 401 || result.status === 403) {
                result = await fetchWholeClubCatalog((offset) => (
                    `/api/clubs?include_hidden=true&limit=${CLUB_CATALOG_PAGE_SIZE}&offset=${offset}`
                ));
            }
            request.end({
                status: result.status,
                error: !result.ok,
            });
            if (!result.ok) throw new Error('Error al cargar clubes');
            const data = result.rows;
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

    // El seed es opcional y la mayoría de los torneos no lo usa: la columna
    // quedaba con un guion en TODAS las filas, ocupando ancho para no decir
    // nada. Aparece cuando alguien lo tiene. No se toca ni la edición del seed
    // ni el orden por seed: el dato sigue estando, lo que se va es la columna
    // vacía.
    const hasAnySeed = useMemo(
        () => participants.some((p) => typeof p.seed === 'number' && p.seed > 0),
        [participants]
    );

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

    // Un grupo pertenece a una fase: si la fase destino cambia, el grupo elegido
    // deja de existir en ese destino y el selector quedaría mostrando un grupo de
    // otra fase.
    useEffect(() => {
        setAssignmentGroupId((current) => {
            if (!current) return current;
            const group = groups.find((item) => item.id === current);
            return group && group.phase_id === assignmentPhaseId ? current : null;
        });
    }, [assignmentPhaseId, groups]);

    const formatGroupLabel = (group: TournamentGroup) => {
        const phaseName = group.phase_id ? phaseNameById.get(group.phase_id) : '';
        return phaseName ? `${phaseName} - ${group.name}` : group.name;
    };

    // ============================================
    // DERIVADOS DE LA VISTA DE ESCRITORIO
    // ============================================

    // Un estado entra a la barra cuando tiene algo que contar. "Activos" se
    // guarda cuando son todos: repetiría el total que ya está a su izquierda en
    // tinta plena. El estado filtrado entra siempre, aunque su cuenta caiga a
    // cero, porque si no el usuario se queda sin el botón para desfiltrar.
    const statusFlags = useMemo(() => {
        const counts: Record<ParticipantStatus, number> = {
            active: stats.active,
            pending: stats.pending,
            inactive: stats.inactive,
            disqualified: stats.disqualified,
        };

        return (Object.keys(STATUS_LABEL_PLURAL) as ParticipantStatus[])
            .filter((status) => {
                if (statusFilter === status) return true;
                if (counts[status] === 0) return false;
                return !(status === 'active' && counts.active === stats.total);
            })
            .map((status) => ({ status, label: STATUS_LABEL_PLURAL[status], count: counts[status] }));
    }, [stats, statusFilter]);

    const hasActiveFilters =
        Boolean(searchQuery) || typeFilter !== 'all' || statusFilter !== 'all' || groupFilter !== 'all' || sortBy !== 'recent';

    const clearFilters = () => {
        setSearchQuery('');
        setTypeFilter('all');
        setStatusFilter('all');
        setGroupFilter('all');
        setSortBy('recent');
    };

    const groupsByPhase = useMemo(() => {
        const map = new Map<string, TournamentGroup[]>();
        groups.forEach((group) => {
            if (!group.phase_id) return;
            map.set(group.phase_id, [...(map.get(group.phase_id) ?? []), group]);
        });
        map.forEach((list) => list.sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)));
        return map;
    }, [groups]);

    // Fase y grupo viajan en un solo valor para que el <select> pueda ofrecer
    // "toda la fase" y sus grupos en la misma lista.
    const assignmentTargetValue = assignmentGroupId
        ? `group:${assignmentGroupId}`
        : assignmentPhaseId ? `phase:${assignmentPhaseId}` : '';

    const handleAssignmentTargetChange = (value: string) => {
        const [kind, id] = value.split(':');
        if (kind === 'group') {
            const group = groupById.get(id);
            if (!group) return;
            if (group.phase_id) setAssignmentPhaseId(group.phase_id);
            setAssignmentGroupId(group.id);
            return;
        }
        setAssignmentPhaseId(id);
        setAssignmentGroupId(null);
    };

    const assignmentTargetLabel = assignmentGroupId
        ? groupById.get(assignmentGroupId)?.name || 'el grupo'
        : phaseNameById.get(assignmentPhaseId) || 'la fase';

    const allVisibleSelected = filteredParticipants.length > 0
        && filteredParticipants.every((participant) => selectedIds.has(participant.id));

    const selectAllRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!selectAllRef.current) return;
        const selectedVisible = filteredParticipants.filter((p) => selectedIds.has(p.id)).length;
        selectAllRef.current.indeterminate = selectedVisible > 0 && selectedVisible < filteredParticipants.length;
    }, [filteredParticipants, selectedIds]);

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
            const responses = await Promise.all(
                Array.from(selectedIds).map(id =>
                    fetch(`/api/tournaments/${tournamentId}/participants?id=${id}`, {
                        method: 'DELETE',
                    })
                )
            );
            const failed = responses.filter(response => !response.ok).length;
            if (failed > 0) {
                throw new Error(`No se pudieron eliminar ${failed} de ${responses.length} participantes`);
            }
            setParticipants(prev => prev.filter(p => !selectedIds.has(p.id)));
            setPhaseAssignments((prev) => prev.filter((assignment) => !selectedIds.has(assignment.participant_id)));
            setSelectedIds(new Set());
            showToast('success', `${selectedIds.size} participantes eliminados correctamente`);
        } catch (err) {
            showToast('error', getErrorMessage(err, 'Error al eliminar participantes'));
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
                }).then(async res => {
                    if (!res.ok) {
                        const payload = await res.json().catch(() => null);
                        throw new Error(payload?.error || 'Error al importar participante');
                    }
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
            setIsImportDrawerOpen(false);
            showToast('success', `${newList.length} participantes importados correctamente`);
        } catch (err) {
            showToast('error', getErrorMessage(err, 'Error en la importación'));
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

    // Actualización funcional: leía `selectedIds` del cierre, así que dos clics
    // en el mismo tick —dos filas seguidas, que es como se arma una selección—
    // partían los dos del mismo conjunto y el segundo pisaba al primero.
    const toggleSelect = (id: string) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // ============================================
    // TOAST
    // ============================================

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    };

    const renderRoster = (items: PhaseRosterItem[], phase: TournamentPhase) => {
        if (items.length === 0) {
            return <p className="pc-roster-empty">Sin equipos asignados.</p>;
        }

        return (
            <ul className="pc-roster" role="list">
                {items.map((item) => (
                    <li key={`${item.assignment.id}-${item.participant.id}`} className="pc-roster-item">
                        <span className="pc-crest">
                            {item.participant.clubs?.logo_url ? (
                                <img src={item.participant.clubs.logo_url} alt="" loading="lazy" />
                            ) : (
                                <IdCard size={13} aria-hidden="true" />
                            )}
                        </span>
                        {/* Sólo el nombre: el subtítulo de antes repetía el
                            nombre del equipo debajo del nombre del equipo, y el
                            código ya tiene su lugar en la tabla. */}
                        <span className="pc-roster-name" title={item.participant.name}>{item.participant.name}</span>
                        <button
                            type="button"
                            className="pc-roster-remove"
                            onClick={() => handleRemoveOneFromPhase(phase.id, item.participant.id)}
                            aria-label={`Quitar a ${item.participant.name} de ${phase.name}`}
                            title={`Quitar de ${phase.name}`}
                        >
                            <X size={14} aria-hidden="true" />
                        </button>
                    </li>
                ))}
            </ul>
        );
    };

    // ============================================
    // RENDER: LOADING
    // ============================================

    if (loading) {
        // Era un spinner centrado en una pantalla vacía de alto completo: durante
        // la espera no se sabe si lo que viene es una tabla, una grilla o un
        // aviso, y al llegar los datos la página salta entera. El esqueleto tiene
        // la forma de lo que va a aparecer —cabecera, barra de filtros, filas— así
        // que reserva el espacio y la llegada no mueve nada.
        return (
            <div className="participants-flash-container" aria-busy="true" aria-live="polite">
                <span className="sr-only">Cargando participantes</span>
                <div className="participants-skeleton" aria-hidden="true">
                    <div className="participants-skeleton-header">
                        <span className="skeleton-block skeleton-title" />
                        <span className="skeleton-block skeleton-pill" />
                    </div>
                    <div className="participants-skeleton-toolbar">
                        <span className="skeleton-block skeleton-search" />
                        <span className="skeleton-block skeleton-filter" />
                        <span className="skeleton-block skeleton-filter" />
                    </div>
                    <div className="participants-skeleton-rows">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <span key={i} className="skeleton-block skeleton-row" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ============================================
    // RENDER: MAIN UI
    // ============================================

    return (
        <div className="participants-flash-container">
            {/* Render condicional por breakpoint (Fase 1c): cards en <=767, tabla
                en >=768. Solo un árbol en el DOM a la vez; estado compartido arriba
                del condicional (rotar el teléfono preserva selección/filtros). */}
            {isMobile ? (
            <section className="tournament-participants-mobile" aria-label="Participantes del torneo">
                {/* La tira traía cinco cajas fijas —Total, Activos, Inact., Pend.,
                    Desc.— y en un torneo sano tres marcan cero. Cinco columnas en
                    390px obligan además a abreviar las etiquetas ("Inact.",
                    "Desc."), así que se paga ancho, se recorta el idioma y tres de
                    las cinco no dicen nada. Ahora entra la que siempre importa y
                    las de estado sólo cuando hay algo de ese estado; con menos
                    cajas las etiquetas entran enteras. */}
                {/* Y si no hay ningún estado que reportar, la tira entera sobra: el
                    chip "Todos" de los filtros, doce píxeles más abajo, ya trae el
                    total. Una caja a todo el ancho para repetir ese número es la
                    parte más cara de la pantalla más chica. */}
                {(stats.inactive > 0 || stats.pending > 0 || stats.disqualified > 0) && (
                <header className="tsm-hero">
                    <div className="tsm-counter-strip">
                        <div className="tsm-counter-box">
                            <span className="tsm-counter-label">Total</span>
                            <span className="tsm-counter-value">{stats.total}</span>
                        </div>
                        {stats.active > 0 && stats.active !== stats.total && (
                            <div className="tsm-counter-box is-active">
                                <span className="tsm-counter-label">Activos</span>
                                <span className="tsm-counter-value">{stats.active}</span>
                            </div>
                        )}
                        {stats.inactive > 0 && (
                            <div className="tsm-counter-box">
                                <span className="tsm-counter-label">Inactivos</span>
                                <span className="tsm-counter-value">{stats.inactive}</span>
                            </div>
                        )}
                        {stats.pending > 0 && (
                            <div className="tsm-counter-box is-pending">
                                <span className="tsm-counter-label">Pendientes</span>
                                <span className="tsm-counter-value">{stats.pending}</span>
                            </div>
                        )}
                        {stats.disqualified > 0 && (
                            <div className="tsm-counter-box is-error">
                                <span className="tsm-counter-label">Descalif.</span>
                                <span className="tsm-counter-value">{stats.disqualified}</span>
                            </div>
                        )}
                    </div>
                </header>
                )}

                {/* Sentinel for IntersectionObserver — when this 1px element
                     leaves the viewport, the toolbar reveals a compact count
                     chip so users keep context after the hero scrolls away. */}
                <div ref={heroSentinelRef} className="tsm-hero-sentinel" aria-hidden="true" />

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
                    <span
                        className={`tsm-toolbar-count ${isHeroOffscreen ? 'is-visible' : ''}`}
                        aria-hidden={!isHeroOffscreen}
                    >
                        {visibleMobileParticipants.length}
                    </span>
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

                {/* ===== Quick filter chips (horizontal scroll). Mockup spec:
                     Todos / Activos / Clubs / Pendientes — mezcla estados y
                     tipo en la misma fila. El resto de los filtros (Inactivos,
                     Descalif., Selecciones, etc.) están en el sheet de filtros. */}
                <div className="tsm-status-chips" role="group" aria-label="Filtros rápidos">
                    {([
                        { v: 'all', l: 'Todos', kind: 'reset' as const, count: stats.total, showCount: true },
                        { v: 'active', l: 'Activos', kind: 'status' as const, count: stats.active, showCount: true },
                        { v: 'club', l: 'Clubs', kind: 'type' as const, count: participants.filter((p) => p.type === 'club').length, showCount: false },
                        { v: 'pending', l: 'Pendientes', kind: 'status' as const, count: stats.pending, showCount: false },
                    ]).map((opt) => {
                        const isActive = opt.kind === 'reset'
                            ? (statusFilter === 'all' && typeFilter === 'all' && groupFilter === 'all' && mobilePhaseFilter === 'all' && sortBy === 'recent')
                            : opt.kind === 'status'
                                ? statusFilter === opt.v
                                : typeFilter === opt.v;
                        const isEmpty = opt.count === 0 && opt.kind !== 'reset';
                        return (
                            <button
                                key={`${opt.kind}-${opt.v}`}
                                type="button"
                                className={`tsm-status-chip ${isActive ? 'is-on' : ''} ${isEmpty ? 'is-empty' : ''}`}
                                onClick={() => {
                                    if (opt.kind === 'reset') {
                                        setStatusFilter('all');
                                        setTypeFilter('all');
                                        setGroupFilter('all');
                                        setMobilePhaseFilter('all');
                                        setSortBy('recent');
                                    } else if (opt.kind === 'status') {
                                        setStatusFilter(opt.v);
                                    } else {
                                        setTypeFilter(typeFilter === opt.v ? 'all' : opt.v);
                                    }
                                }}
                            >
                                <span className="tsm-status-chip-label">{opt.l}</span>
                                {opt.showCount && (
                                    <span className="tsm-status-chip-count">{opt.count}</span>
                                )}
                            </button>
                        );
                    })}
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

                {/* ===== Meta linea — solo cuando hay filtros aplicados.
                     El total sin filtros ya aparece en el hero; mostrar
                     "X equipos" repetido era ruido. El hint "tap logo = seleccionar"
                     se retira: la affordance se descubre al usar la app. ===== */}
                {visibleMobileParticipants.length !== participants.length && (
                    <div className="tsm-list-meta">
                        <span>
                            <strong>{visibleMobileParticipants.length}</strong>
                            {` de ${participants.length} equipos`}
                        </span>
                    </div>
                )}

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
                                            className="tsm-participant-menu-btn"
                                            onClick={(e) => { e.stopPropagation(); setCardActionParticipantId(p.id); }}
                                            aria-label={`Acciones para ${p.name}`}
                                        >
                                            <MoreVertical size={16} />
                                        </button>

                                        <button
                                            type="button"
                                            className="tsm-participant-logo-btn"
                                            onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }}
                                            aria-label={isChecked ? 'Quitar seleccion' : 'Seleccionar'}
                                            aria-pressed={isChecked}
                                        >
                                            <span className="tsm-participant-logo">
                                                {isChecked ? (
                                                    <CheckSquare size={16} />
                                                ) : p.clubs?.logo_url ? (
                                                    <img src={p.clubs.logo_url} alt="" />
                                                ) : (
                                                    <IdCard size={16} aria-hidden="true" />
                                                )}
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            className="tsm-participant-main"
                                            onClick={() => setEditingParticipant(p)}
                                        >
                                            <strong className="tsm-participant-name">{p.name}</strong>
                                            <span className={`tsm-participant-status is-${p.status}`}>
                                                <span className="tsm-participant-status-dot" aria-hidden="true" />
                                                {p.status === 'active' ? 'Activo'
                                                    : p.status === 'inactive' ? 'Inact.'
                                                    : p.status === 'pending' ? 'Pend.'
                                                    : p.status === 'disqualified' ? 'Desc.'
                                                    : p.status}
                                            </span>
                                        </button>
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

                {/* ===== Sheet: acciones por participante (⋯ per-card) ===== */}
                {cardActionParticipantId && (() => {
                    const p = participants.find((it) => it.id === cardActionParticipantId);
                    if (!p) return null;
                    return (
                        <div className="tsm-sheet-backdrop" onClick={() => setCardActionParticipantId(null)}>
                            <div className="tsm-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Acciones para ${p.name}`}>
                                <div className="tsm-sheet-handle" aria-hidden="true" />
                                <div className="tsm-sheet-head">
                                    <h3 style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</h3>
                                    <button type="button" className="tsm-sheet-close" onClick={() => setCardActionParticipantId(null)} aria-label="Cerrar"><X size={16} /></button>
                                </div>
                                <div className="tsm-sheet-body">
                                    <div className="tsm-sheet-actions">
                                        <button
                                            type="button"
                                            className="tsm-sheet-action"
                                            onClick={() => { setCardActionParticipantId(null); setEditingParticipant(p); }}
                                        >
                                            <Pencil size={18} />
                                            <span><strong>Editar participante</strong><small>Nombre, tipo, código, seed</small></span>
                                        </button>
                                        {assignmentPhases.length > 0 && (
                                            <button
                                                type="button"
                                                className="tsm-sheet-action"
                                                onClick={() => {
                                                    setSelectedIds(new Set([p.id]));
                                                    setCardActionParticipantId(null);
                                                    setIsMobilePhaseSheetOpen(true);
                                                }}
                                            >
                                                <Layers size={18} />
                                                <span><strong>Asignar a fase</strong><small>Elegir fase y grupo destino</small></span>
                                            </button>
                                        )}
                                    </div>

                                    <div className="tsm-sheet-section">
                                        <label>Cambiar estado</label>
                                        <div className="tsm-chip-row">
                                            {([
                                                { v: 'active' as const, l: 'Activo' },
                                                { v: 'pending' as const, l: 'Pendiente' },
                                                { v: 'inactive' as const, l: 'Inactivo' },
                                                { v: 'disqualified' as const, l: 'Descalificado' },
                                            ]).map((opt) => (
                                                <button
                                                    key={opt.v}
                                                    type="button"
                                                    className={`tsm-chip ${p.status === opt.v ? 'is-on' : ''}`}
                                                    onClick={async () => {
                                                        if (p.status === opt.v) {
                                                            setCardActionParticipantId(null);
                                                            return;
                                                        }
                                                        await handleUpdate(p.id, { status: opt.v });
                                                        setCardActionParticipantId(null);
                                                    }}
                                                >
                                                    {opt.l}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="tsm-sheet-actions">
                                        <button
                                            type="button"
                                            className="tsm-sheet-action is-danger"
                                            onClick={() => { setCardActionParticipantId(null); handleDelete(p.id); }}
                                        >
                                            <Trash2 size={18} />
                                            <span><strong>Eliminar participante</strong><small>Saca al equipo del torneo</small></span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

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
            ) : (
            <div className="pc-shell">

            {/* Barra de comando: el recuento, los estados —que ahora filtran— y
                las acciones. El título propio se retira: la pestaña ya se llama
                Participantes y el torneo ya tiene su nombre en la barra de
                arriba, así que era el tercer rótulo para la misma cosa. */}
            <section className="pc-bar" aria-label="Resumen y acciones de participantes">
                <div className="pc-bar-top">
                    <div className="pc-count">
                        <span className="pc-count-value">{stats.total}</span>
                        <span className="pc-count-label">
                            {stats.total === 1 ? 'Participante' : 'Participantes'}
                        </span>
                    </div>

                    {statusFlags.length > 0 && (
                        <div className="pc-flags" role="group" aria-label="Filtrar por estado">
                            {statusFlags.map((flag) => {
                                const isOn = statusFilter === flag.status;
                                return (
                                    <button
                                        key={flag.status}
                                        type="button"
                                        className={`pc-flag is-${flag.status}`}
                                        aria-pressed={isOn}
                                        onClick={() => setStatusFilter(isOn ? 'all' : flag.status)}
                                    >
                                        <span className="pc-flag-dot" aria-hidden="true" />
                                        <span>{flag.label}</span>
                                        <span className="pc-flag-count">{flag.count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="pc-bar-actions">
                        <button type="button" onClick={() => setIsHistoryDrawerOpen(true)} className="basalt-btn">
                            <History size={15} aria-hidden="true" />
                            <span>Historial</span>
                        </button>
                        <button type="button" onClick={handleExport} className="basalt-btn">
                            <Download size={15} aria-hidden="true" />
                            <span>Exportar</span>
                        </button>
                        <button type="button" onClick={() => setIsImportDrawerOpen(true)} className="basalt-btn">
                            <FileUp size={15} aria-hidden="true" />
                            <span>Importar</span>
                        </button>
                        <button type="button" onClick={() => setIsAddDrawerOpen(true)} className="basalt-btn basalt-btn-primary">
                            <Plus size={15} aria-hidden="true" />
                            <span>Nuevo participante</span>
                        </button>
                    </div>
                </div>

                <div className="pc-bar-filters">
                    <div className="pc-search">
                        <Search size={15} aria-hidden="true" />
                        <input
                            type="search"
                            placeholder="Buscar por nombre o código"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            aria-label="Buscar participante"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                className="pc-search-clear"
                                onClick={() => setSearchQuery('')}
                                aria-label="Limpiar búsqueda"
                            >
                                <X size={14} aria-hidden="true" />
                            </button>
                        )}
                    </div>
                    <select
                        className="pc-select"
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        aria-label="Filtrar por tipo"
                    >
                        <option value="all">Todos los tipos</option>
                        <option value="club">Club</option>
                        <option value="national_team">Selección</option>
                        <option value="individual">Individual</option>
                    </select>
                    {groups.length > 0 && (
                        <select
                            className="pc-select"
                            value={groupFilter}
                            onChange={(e) => setGroupFilter(e.target.value)}
                            aria-label="Filtrar por grupo"
                        >
                            <option value="all">Todos los grupos</option>
                            {groups.map(g => (
                                <option key={g.id} value={g.id}>{formatGroupLabel(g)}</option>
                            ))}
                        </select>
                    )}
                    <select
                        className="pc-select"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        aria-label="Ordenar participantes"
                    >
                        <option value="recent">Más recientes</option>
                        <option value="name-asc">Nombre (A-Z)</option>
                        <option value="name-desc">Nombre (Z-A)</option>
                        <option value="seed">Seed / Ranking</option>
                    </select>
                    {hasActiveFilters && (
                        <button type="button" className="pc-clear" onClick={clearFilters}>
                            Limpiar filtros
                        </button>
                    )}
                </div>
            </section>

            {/* Tablero de fases: cada fase es una columna con su plantel. Los
                botones de asignación se fueron a la barra de selección, abajo,
                que es donde está el dato que operan: acá quedaban desactivados
                pidiendo "Selecciona equipos en la tabla" a media pantalla de
                distancia de la tabla. */}
            {assignmentPhases.length > 0 && (
                <section className="pc-panel" aria-label="Participantes por fase">
                    <div className="pc-panel-head">
                        <div className="pc-panel-copy">
                            <span className="pc-panel-title">Participantes por fase</span>
                            <p className="pc-panel-hint">
                                Cada fase tiene su propio plantel. Quitar a un equipo de una fase no lo borra del torneo.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="pc-panel-toggle"
                            onClick={() => setIsPhaseAssignmentOpen((current) => !current)}
                            aria-expanded={isPhaseAssignmentOpen}
                        >
                            <span>{isPhaseAssignmentOpen ? 'Ocultar' : 'Ver planteles'}</span>
                            <ChevronDown size={14} aria-hidden="true" />
                        </button>
                    </div>

                    {isPhaseAssignmentOpen && (
                        <div className="pc-board">
                            {assignmentPhases.map((phase, phaseIndex) => {
                                const roster = phaseRosterByPhase.get(phase.id) ?? [];
                                const groupsForPhase = groupsByPhase.get(phase.id) ?? [];
                                const ungroupedRoster = roster.filter((item) => !item.group);
                                const phaseTotal = participantCountByPhase.get(phase.id) ?? 0;

                                return (
                                    <article key={phase.id} className="pc-phase">
                                        <header className="pc-phase-head">
                                            {/* Decía `order_index + 1`, dando por sentado que el
                                                índice arranca en 0. En este torneo arranca en 1,
                                                así que la Fase Regular —"Fase 1" en Estructura—
                                                se anunciaba acá como "Fase #2". Se numera por
                                                posición en la lista ordenada, que es lo que hace
                                                Estructura. */}
                                            <span className="pc-phase-index">Fase {phaseIndex + 1}</span>
                                            <h3 className="pc-phase-name" title={phase.name}>{phase.name}</h3>
                                            <span className="pc-phase-count">
                                                {phaseTotal} equipo{phaseTotal === 1 ? '' : 's'}
                                            </span>
                                        </header>

                                        {groupsForPhase.length > 0 ? (
                                            <>
                                                {groupsForPhase.map((group) => {
                                                    const groupRoster = roster.filter((item) => item.group?.id === group.id);
                                                    return (
                                                        <div key={group.id} className="pc-phase-group">
                                                            <div className="pc-phase-group-label">
                                                                <strong>{group.name}</strong>
                                                                <span>{groupRoster.length}</span>
                                                            </div>
                                                            {renderRoster(groupRoster, phase)}
                                                        </div>
                                                    );
                                                })}

                                                {ungroupedRoster.length > 0 && (
                                                    <div className="pc-phase-group">
                                                        <div className="pc-phase-group-label">
                                                            <strong>Sin grupo</strong>
                                                            <span>{ungroupedRoster.length}</span>
                                                        </div>
                                                        {renderRoster(ungroupedRoster, phase)}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            renderRoster(roster, phase)
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {/* Tabla */}
            <div className="pc-table-wrap">
                <div className="pc-table-scroll">
                    <table className="pc-table">
                        <thead>
                            <tr>
                                <th scope="col">
                                    <input
                                        ref={selectAllRef}
                                        type="checkbox"
                                        className="pc-check"
                                        checked={allVisibleSelected}
                                        onChange={toggleAll}
                                        aria-label="Seleccionar todos los participantes visibles"
                                    />
                                </th>
                                {/* Estado pegado al nombre: es lo que más se
                                    barre de una fila, y al final de la tira
                                    quedaba a 400px del equipo que califica. */}
                                <th scope="col" className="pc-col-name">Participante</th>
                                <th scope="col">Estado</th>
                                <th scope="col">Tipo</th>
                                {hasAnySeed && <th scope="col">Seed</th>}
                                {assignmentPhases.length > 0
                                    ? <th scope="col" className="pc-col-phases">Fases</th>
                                    : null}
                                <th scope="col" className={assignmentPhases.length > 0 ? undefined : 'pc-col-grow'}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredParticipants.length === 0 ? (
                                <tr>
                                    {/* 5 fijas (casilla, participante, tipo, estado, acciones)
                                        más las dos que aparecen según el torneo. */}
                                    <td className="pc-cell-empty" colSpan={5 + (hasAnySeed ? 1 : 0) + (assignmentPhases.length > 0 ? 1 : 0)}>
                                        <div className="pc-empty">
                                            <span className="pc-empty-glyph"><Users size={20} aria-hidden="true" /></span>
                                            <span className="pc-empty-title">
                                                {hasActiveFilters ? 'Ningún participante coincide' : 'Todavía no hay participantes'}
                                            </span>
                                            <p className="pc-empty-text">
                                                {hasActiveFilters
                                                    ? 'Ajustá los filtros o limpialos para volver a ver el plantel completo.'
                                                    : 'Agregá clubes desde el catálogo o importá una lista para armar el plantel del torneo.'}
                                            </p>
                                            {hasActiveFilters ? (
                                                <button type="button" className="basalt-btn" onClick={clearFilters}>
                                                    Limpiar filtros
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="basalt-btn basalt-btn-primary"
                                                    onClick={() => setIsAddDrawerOpen(true)}
                                                >
                                                    <Plus size={15} aria-hidden="true" />
                                                    <span>Nuevo participante</span>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredParticipants.map(p => {
                                    const phaseItems = phaseAssignmentsByParticipant.get(p.id) ?? [];
                                    return (
                                        <tr
                                            key={p.id}
                                            className={selectedIds.has(p.id) ? 'is-selected' : ''}
                                            onClick={() => toggleSelect(p.id)}
                                        >
                                            <td onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    className="pc-check"
                                                    checked={selectedIds.has(p.id)}
                                                    onChange={() => toggleSelect(p.id)}
                                                    aria-label={`Seleccionar ${p.name}`}
                                                />
                                            </td>
                                            <td className="pc-col-name">
                                                <div className="pc-team">
                                                    <span className="pc-crest">
                                                        {p.clubs?.logo_url ? (
                                                            <img src={p.clubs.logo_url} alt="" loading="lazy" />
                                                        ) : (
                                                            <IdCard size={15} aria-hidden="true" />
                                                        )}
                                                    </span>
                                                    <span className="pc-team-copy">
                                                        <span className="pc-team-name" title={p.name}>{p.name}</span>
                                                        {p.short_code && <span className="pc-team-code">{p.short_code}</span>}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`pc-state is-${p.status}`}>
                                                    {STATUS_LABEL[p.status] ?? p.status}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="pc-cell-mono">{TYPE_LABEL[p.type] ?? p.type}</span>
                                            </td>
                                            {hasAnySeed && (
                                                <td>
                                                    <span className="pc-cell-num">{p.seed || <span className="pc-dash">—</span>}</span>
                                                </td>
                                            )}
                                            {assignmentPhases.length > 0 && (
                                                <td className="pc-col-phases">
                                                    {phaseItems.length > 0 ? (
                                                        <div className="pc-chips">
                                                            {phaseItems.map((item) => (
                                                                <span
                                                                    key={`${item.assignment.phase_id}-${item.assignment.group_id || 'phase'}`}
                                                                    className="pc-chip"
                                                                >
                                                                    {phaseNameById.get(item.assignment.phase_id) || 'Fase'}
                                                                    {item.group ? ` · ${item.group.name}` : ''}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="pc-dash">—</span>
                                                    )}
                                                </td>
                                            )}
                                            <td
                                                className={assignmentPhases.length > 0 ? undefined : 'pc-col-grow'}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="pc-row-actions">
                                                    <button
                                                        type="button"
                                                        className="pc-icon-btn"
                                                        onClick={() => setEditingParticipant(p)}
                                                        aria-label={`Editar ${p.name}`}
                                                        title="Editar"
                                                    >
                                                        <Pencil size={15} aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="pc-icon-btn is-danger"
                                                        onClick={() => handleDelete(p.id)}
                                                        aria-label={`Eliminar ${p.name}`}
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={15} aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="pc-foot">
                    <span>
                        {filteredParticipants.length === participants.length
                            ? <><strong>{participants.length}</strong> participante{participants.length === 1 ? '' : 's'} en el torneo</>
                            : <><strong>{filteredParticipants.length}</strong> de {participants.length} participantes</>}
                    </span>
                    {selectedIds.size > 0 && <span>{selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}</span>}
                </div>
            </div>

            {/* Barra de selección: aparece con la selección y trae lo que se
                puede hacer con ella. */}
            {selectedIds.size > 0 && (
                <div className="pc-selection" role="region" aria-label="Acciones sobre la selección">
                    <span className="pc-selection-count">
                        <strong>{selectedIds.size}</strong> seleccionado{selectedIds.size === 1 ? '' : 's'}
                    </span>
                    <button type="button" className="pc-clear" onClick={() => setSelectedIds(new Set())}>
                        Limpiar
                    </button>

                    {assignmentPhases.length > 0 && (
                        <>
                            <span className="pc-selection-sep" aria-hidden="true" />
                            <select
                                className="pc-select"
                                value={assignmentTargetValue}
                                onChange={(event) => handleAssignmentTargetChange(event.target.value)}
                                disabled={groupAssignmentLoading}
                                aria-label="Fase o grupo de destino"
                            >
                                {assignmentPhases.map((phase) => {
                                    const phaseGroups = groupsByPhase.get(phase.id) ?? [];
                                    return (
                                        <optgroup key={phase.id} label={phase.name}>
                                            <option value={`phase:${phase.id}`}>{phase.name} — sin grupo</option>
                                            {phaseGroups.map((group) => (
                                                <option key={group.id} value={`group:${group.id}`}>
                                                    {group.name} ({participantCountByGroup.get(group.id) ?? 0})
                                                </option>
                                            ))}
                                        </optgroup>
                                    );
                                })}
                            </select>
                            <button
                                type="button"
                                className="basalt-btn"
                                onClick={() => handleBulkAssignPhase(assignmentPhaseId, assignmentGroupId)}
                                disabled={groupAssignmentLoading || !assignmentPhaseId}
                            >
                                <Layers size={15} aria-hidden="true" />
                                <span>Asignar a {assignmentTargetLabel}</span>
                            </button>
                            <button
                                type="button"
                                className="basalt-btn"
                                onClick={() => handleBulkRemoveFromPhase(assignmentPhaseId)}
                                disabled={groupAssignmentLoading || !assignmentPhaseId}
                            >
                                Quitar de la fase
                            </button>
                        </>
                    )}

                    <span className="pc-selection-spacer" />
                    <button type="button" className="basalt-btn basalt-btn-danger" onClick={handleBulkDelete}>
                        <Trash2 size={15} aria-hidden="true" />
                        <span>Eliminar</span>
                    </button>
                </div>
            )}
            </div>
            )}

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

/**
 * El aviso vivía en un objeto de estilos en línea —placa verde traslúcida,
 * esquina de 10px, `z-index: 9999`— que no se parecía a nada más de la consola
 * y se metía arriba a la derecha, justo debajo del menú del header. Ahora es la
 * misma placa que el resto, en la esquina de abajo, con su capa nombrada.
 */
function Toast({ type, message, onClose }: { type: 'success' | 'error'; message: string; onClose: () => void }) {
    return (
        <div className={`pc-toast is-${type}`} role="status" aria-live="polite">
            {type === 'success'
                ? <CheckCircle2 size={17} aria-hidden="true" />
                : <AlertCircle size={17} aria-hidden="true" />}
            <span>{message}</span>
            <button type="button" className="pc-toast-close" onClick={onClose} aria-label="Cerrar aviso">
                <X size={14} aria-hidden="true" />
            </button>
        </div>
    );
}
