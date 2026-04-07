'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { ChevronLeft, ChevronRight, GitBranch, Link2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { type ClubWithUnion } from '@/lib/cache/superAdminCache';
import {
    type ClubDerivativeType,
    getSportDisplayName,
} from '@/lib/clubDerivatives';

const MAX_FAMILY_SELECTION_CARDS = 24;

type ClubDerivativeRelationRow = {
    base_club_id: string;
    derived_club_id: string;
    derivative_type: ClubDerivativeType;
};

type ClubFamilyDivisionLinkRow = {
    family_base_club_id: string;
    roster_owner_club_id: string;
    division_club_id: string;
    group_name: string | null;
};

type DivisionGroupDraft = {
    id: string;
    name: string;
    rosterOwnerClubId: string;
    divisionClubIds: string[];
};

function ClubLogo({ logo, name, color }: { logo?: string | null; name: string; color?: string | null }) {
    if (logo) {
        const src = logo.trimStart().startsWith('<svg')
            ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(logo)))}`
            : logo;
        return (
            <img
                src={src}
                alt={name}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={(event) => {
                    (event.target as HTMLImageElement).style.display = 'none';
                }}
            />
        );
    }

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                background: color || '#3f3f46',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 700,
                color: '#fff',
                borderRadius: 4,
            }}
        >
            {name.substring(0, 2).toUpperCase()}
        </div>
    );
}

export default function SuperadminClubFamiliesPage() {
    const { clubs, loading, errors, refresh } = useSuperConsole();
    const isLoadingClubs = loading.clubs;
    const errorMsg = errors.clubs;

    const [clubDerivativeRelations, setClubDerivativeRelations] = useState<ClubDerivativeRelationRow[]>([]);
    const [clubFamilyDivisionLinks, setClubFamilyDivisionLinks] = useState<ClubFamilyDivisionLinkRow[]>([]);
    const [isLoadingFamilies, setIsLoadingFamilies] = useState(false);
    const [familyLoadError, setFamilyLoadError] = useState<string | null>(null);
    const [familySearch, setFamilySearch] = useState('');
    const [isCreateFamilyOpen, setIsCreateFamilyOpen] = useState(false);
    const [editingBaseClubId, setEditingBaseClubId] = useState<string | null>(null);
    const [selectedClubIds, setSelectedClubIds] = useState<string[]>([]);
    const [divisionGroups, setDivisionGroups] = useState<DivisionGroupDraft[]>([]);
    const [clubSearch, setClubSearch] = useState('');
    const [clubPage, setClubPage] = useState(0);
    const [isCreatingFamily, setIsCreatingFamily] = useState(false);
    const [createFamilyError, setCreateFamilyError] = useState<string | null>(null);

    const loadClubFamilies = useCallback(async () => {
        setIsLoadingFamilies(true);
        setFamilyLoadError(null);

        try {
            const response = await fetch('/api/admin/super/club-families', {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
            });
            const payload = await response.json().catch(() => ({})) as {
                data?: ClubDerivativeRelationRow[];
                divisionLinks?: ClubFamilyDivisionLinkRow[];
                error?: string;
                details?: string | null;
            };

            if (!response.ok) {
                throw new Error(payload.error || payload.details || 'No se pudieron cargar las familias.');
            }

            setClubDerivativeRelations(Array.isArray(payload.data) ? payload.data : []);
            setClubFamilyDivisionLinks(Array.isArray(payload.divisionLinks) ? payload.divisionLinks : []);
        } catch (error) {
            setFamilyLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las familias.');
            setClubDerivativeRelations([]);
            setClubFamilyDivisionLinks([]);
        } finally {
            setIsLoadingFamilies(false);
        }
    }, []);

    useEffect(() => {
        void loadClubFamilies();
    }, [loadClubFamilies]);

    const clubById = useMemo(
        () => new Map(clubs.map((club) => [club.id, club])),
        [clubs],
    );

    const familySummaries = useMemo(() => {
        const familyMap = new Map<string, {
            root: ClubWithUnion;
            relations: ClubDerivativeRelationRow[];
            divisionLinks: ClubFamilyDivisionLinkRow[];
            members: ClubWithUnion[];
        }>();

        for (const relation of clubDerivativeRelations) {
            const rootClub = clubById.get(relation.base_club_id);
            const derivedClub = clubById.get(relation.derived_club_id);
            if (!rootClub || !derivedClub) continue;

            const currentFamily = familyMap.get(rootClub.id) ?? {
                root: rootClub,
                relations: [],
                divisionLinks: [],
                members: [rootClub],
            };

            currentFamily.relations.push(relation);
            if (!currentFamily.members.some((member) => member.id === derivedClub.id)) {
                currentFamily.members.push(derivedClub);
            }

            familyMap.set(rootClub.id, currentFamily);
        }

        return Array.from(familyMap.values())
            .map((family) => ({
                ...family,
                divisionLinks: clubFamilyDivisionLinks.filter((link) => link.family_base_club_id === family.root.id),
                members: family.members.sort((left, right) => {
                    if (left.id === family.root.id) return -1;
                    if (right.id === family.root.id) return 1;
                    return left.name.localeCompare(right.name);
                }),
            }))
            .sort((left, right) => left.root.name.localeCompare(right.root.name));
    }, [clubById, clubDerivativeRelations, clubFamilyDivisionLinks]);

    const clubsInFamilies = useMemo(
        () => new Set(familySummaries.flatMap((family) => family.members.map((club) => club.id))),
        [familySummaries],
    );

    const normalizedFamilySearch = familySearch.trim().toLowerCase();
    const filteredFamilySummaries = useMemo(() => {
        if (!normalizedFamilySearch) return familySummaries;

        return familySummaries.filter((family) => {
            const familyFields = family.members.flatMap((member) => [
                member.name,
                member.short_name,
                member.city,
                member.region,
                member.country,
                member.sport,
                member.union?.name,
            ]);

            const haystack = [
                family.root.name,
                family.root.short_name,
                family.root.city,
                family.root.region,
                family.root.country,
                family.root.sport,
                family.root.union?.name,
                ...familyFields,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(normalizedFamilySearch);
        });
    }, [familySummaries, normalizedFamilySearch]);

    const standaloneClubs = useMemo(
        () => clubs
            .filter((club) => !clubsInFamilies.has(club.id))
            .sort((left, right) => left.name.localeCompare(right.name)),
        [clubs, clubsInFamilies],
    );

    const standaloneClubsCount = standaloneClubs.length;
    const editingFamily = useMemo(
        () => editingBaseClubId ? familySummaries.find((family) => family.root.id === editingBaseClubId) || null : null,
        [editingBaseClubId, familySummaries],
    );

    const availableFamilyBaseClubs = useMemo(
        () => {
            if (!editingFamily) return standaloneClubs;

            const allowedClubIds = new Set([
                ...standaloneClubs.map((club) => club.id),
                ...editingFamily.members.map((club) => club.id),
            ]);

            return clubs
                .filter((club) => allowedClubIds.has(club.id))
                .sort((left, right) => left.name.localeCompare(right.name));
        },
        [clubs, editingFamily, standaloneClubs],
    );

    const openCreateFamilyModal = () => {
        setEditingBaseClubId(null);
        setSelectedClubIds([]);
        setDivisionGroups([]);
        setClubSearch('');
        setClubPage(0);
        setCreateFamilyError(null);
        setIsCreateFamilyOpen(true);
    };

    const openAddToFamilyModal = (club: ClubWithUnion) => {
        const family = familySummaries.find((item) => item.root.id === club.id);
        const divisionLinksByGroup = new Map<string, {
            name: string;
            rosterOwnerClubId: string;
            divisionClubIds: string[];
        }>();

        for (const link of family?.divisionLinks || []) {
            const groupKey = `${link.roster_owner_club_id}::${link.group_name || ''}`;
            const current = divisionLinksByGroup.get(groupKey) || {
                name: link.group_name || '',
                rosterOwnerClubId: link.roster_owner_club_id,
                divisionClubIds: [],
            };

            divisionLinksByGroup.set(groupKey, {
                ...current,
                divisionClubIds: [...current.divisionClubIds, link.division_club_id],
            });
        }

        setEditingBaseClubId(club.id);
        setSelectedClubIds(family?.members.map((member) => member.id) || [club.id]);
        setDivisionGroups(
            Array.from(divisionLinksByGroup.values()).map((group, index) => ({
                id: `${group.rosterOwnerClubId}-${index}`,
                name: group.name,
                rosterOwnerClubId: group.rosterOwnerClubId,
                divisionClubIds: group.divisionClubIds,
            }))
        );
        setClubSearch('');
        setClubPage(0);
        setCreateFamilyError(null);
        setIsCreateFamilyOpen(true);
    };

    const closeCreateFamilyModal = () => {
        if (isCreatingFamily) return;
        setIsCreateFamilyOpen(false);
        setEditingBaseClubId(null);
        setSelectedClubIds([]);
        setDivisionGroups([]);
        setClubSearch('');
        setClubPage(0);
        setCreateFamilyError(null);
    };

    const toggleSelectedClub = (clubId: string) => {
        setCreateFamilyError(null);
        setSelectedClubIds((current) => {
            if (current.includes(clubId)) {
                setDivisionGroups((groups) =>
                    groups
                        .filter((group) => group.rosterOwnerClubId !== clubId)
                        .map((group) => ({
                            ...group,
                            divisionClubIds: group.divisionClubIds.filter((id) => id !== clubId),
                        }))
                        .filter((group) => group.divisionClubIds.length > 0)
                );
                return current.filter((id) => id !== clubId);
            }

            return [...current, clubId];
        });
    };

    const selectBaseClub = (clubId: string) => {
        setCreateFamilyError(null);
        setSelectedClubIds((current) => {
            if (!current.includes(clubId)) return current;
            return [clubId, ...current.filter((id) => id !== clubId)];
        });
    };

    const addDivisionGroup = () => {
        if (!baseClubId) return;

        setCreateFamilyError(null);
        setDivisionGroups((current) => [
            ...current,
            {
                id: `division-group-${Date.now()}-${current.length}`,
                name: '',
                rosterOwnerClubId: baseClubId,
                divisionClubIds: [],
            },
        ]);
    };

    const removeDivisionGroup = (groupId: string) => {
        setCreateFamilyError(null);
        setDivisionGroups((current) => current.filter((group) => group.id !== groupId));
    };

    const updateDivisionGroupName = (groupId: string, name: string) => {
        setCreateFamilyError(null);
        setDivisionGroups((current) => current.map((group) =>
            group.id === groupId
                ? { ...group, name }
                : group
        ));
    };

    const updateDivisionGroupOwner = (groupId: string, rosterOwnerClubId: string) => {
        setCreateFamilyError(null);
        setDivisionGroups((current) => current.map((group) =>
            group.id === groupId
                ? {
                    ...group,
                    rosterOwnerClubId,
                    divisionClubIds: group.divisionClubIds.filter((clubId) => clubId !== rosterOwnerClubId),
                }
                : group
        ));
    };

    const toggleDivisionGroupMember = (groupId: string, clubId: string) => {
        if (!selectedClubIds.includes(clubId)) return;

        setCreateFamilyError(null);
        setDivisionGroups((current) => current.map((group) => {
            if (group.id !== groupId || group.rosterOwnerClubId === clubId) return group;

            return {
                ...group,
                divisionClubIds: group.divisionClubIds.includes(clubId)
                    ? group.divisionClubIds.filter((id) => id !== clubId)
                    : [...group.divisionClubIds, clubId],
            };
        }));
    };

    const toggleDivisionClub = (clubId: string) => {
        if (!baseClubId) return;

        const firstGroup = divisionGroups[0];
        if (firstGroup) {
            toggleDivisionGroupMember(firstGroup.id, clubId);
            return;
        }

        setDivisionGroups([{
            id: `division-group-${Date.now()}-0`,
            name: '',
            rosterOwnerClubId: baseClubId,
            divisionClubIds: [clubId],
        }]);
    };

    const baseClubId = selectedClubIds[0] ?? null;
    const baseClub = baseClubId ? clubById.get(baseClubId) ?? null : null;
    const selectedDerivedClubIds = baseClubId ? selectedClubIds.filter((id) => id !== baseClubId) : [];
    const divisionClubIds = divisionGroups.flatMap((group) => group.divisionClubIds);
    const normalizedClubSearch = clubSearch.trim().toLowerCase();
    const filteredSelectionClubs = useMemo(() => {
        if (!normalizedClubSearch) return availableFamilyBaseClubs;

        return availableFamilyBaseClubs.filter((club) => {
            const haystack = [
                club.name,
                club.short_name,
                club.city,
                club.region,
                club.country,
                club.sport,
                club.union?.name,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(normalizedClubSearch);
        });
    }, [availableFamilyBaseClubs, normalizedClubSearch]);
    const totalClubPages = Math.max(1, Math.ceil(filteredSelectionClubs.length / MAX_FAMILY_SELECTION_CARDS));
    const currentClubPage = Math.min(clubPage, totalClubPages - 1);
    const visibleSelectionClubs = filteredSelectionClubs.slice(
        currentClubPage * MAX_FAMILY_SELECTION_CARDS,
        currentClubPage * MAX_FAMILY_SELECTION_CARDS + MAX_FAMILY_SELECTION_CARDS,
    );

    useEffect(() => {
        setClubPage(0);
    }, [normalizedClubSearch]);

    const handleCreateFamily = async () => {
        if (!baseClubId || selectedDerivedClubIds.length === 0) {
            setCreateFamilyError('Selecciona un club base y al menos un club relacionado.');
            return;
        }

        setIsCreatingFamily(true);
        setCreateFamilyError(null);

        try {
            const response = await fetch('/api/admin/super/club-families', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    baseClubId,
                    derivedClubIds: selectedDerivedClubIds,
                    divisionGroups: divisionGroups
                        .map((group) => ({
                            name: group.name.trim(),
                            rosterOwnerClubId: group.rosterOwnerClubId,
                            divisionClubIds: group.divisionClubIds.filter((clubId) =>
                                selectedClubIds.includes(clubId) && clubId !== group.rosterOwnerClubId
                            ),
                        }))
                        .filter((group) => selectedClubIds.includes(group.rosterOwnerClubId) && group.divisionClubIds.length > 0),
                    previousBaseClubId: editingBaseClubId || undefined,
                }),
            });
            const payload = await response.json().catch(() => ({})) as {
                error?: string;
                details?: string | null;
            };

            if (!response.ok) {
                throw new Error(payload.error || payload.details || 'No se pudo crear la familia.');
            }

            setIsCreateFamilyOpen(false);
            setEditingBaseClubId(null);
            setSelectedClubIds([]);
            setDivisionGroups([]);
            setClubSearch('');
            setClubPage(0);
            await loadClubFamilies();
        } catch (error) {
            setCreateFamilyError(error instanceof Error ? error.message : 'No se pudo crear la familia.');
        } finally {
            setIsCreatingFamily(false);
        }
    };

    const handleDeleteFamily = async (family: { root: ClubWithUnion }) => {
        if (!window.confirm(`Eliminar la familia de ${family.root.name}? Los clubes no se eliminan, solo se desvinculan.`)) return;

        setIsLoadingFamilies(true);
        setFamilyLoadError(null);

        try {
            const response = await fetch('/api/admin/super/club-families', {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ baseClubId: family.root.id }),
            });
            const payload = await response.json().catch(() => ({})) as {
                error?: string;
                details?: string | null;
            };

            if (!response.ok) {
                throw new Error(payload.error || payload.details || 'No se pudo eliminar la familia.');
            }

            await loadClubFamilies();
        } catch (error) {
            setFamilyLoadError(error instanceof Error ? error.message : 'No se pudo eliminar la familia.');
        } finally {
            setIsLoadingFamilies(false);
        }
    };

    const handleRemoveFamilyMember = async (baseClubIdToUpdate: string, member: ClubWithUnion) => {
        if (!window.confirm(`Quitar ${member.name} de esta familia?`)) return;

        setFamilyLoadError(null);

        try {
            const response = await fetch('/api/admin/super/club-families', {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    baseClubId: baseClubIdToUpdate,
                    derivedClubId: member.id,
                }),
            });
            const payload = await response.json().catch(() => ({})) as {
                error?: string;
                details?: string | null;
            };

            if (!response.ok) {
                throw new Error(payload.error || payload.details || 'No se pudo quitar el club de la familia.');
            }

            await loadClubFamilies();
        } catch (error) {
            setFamilyLoadError(error instanceof Error ? error.message : 'No se pudo quitar el club de la familia.');
        }
    };

    return (
        <div style={{ paddingBottom: 40 }}>
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Familias de clubes</div>
                    <div className={styles.consoleSubtitle}>
                        {isLoadingClubs
                            ? 'Cargando clubes y estructura...'
                            : `${familySummaries.length} familias activas y ${standaloneClubsCount} clubes sin vinculo familiar`}
                    </div>
                </div>
                <div className={styles.consoleActions}>
                    <button
                        className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                        onClick={openCreateFamilyModal}
                        disabled={isLoadingClubs || availableFamilyBaseClubs.length === 0}
                    >
                        <Plus size={13} style={{ marginRight: 6 }} />
                        Crear familia
                    </button>
                    <button
                        className={styles.cardAction}
                        onClick={() => {
                            refresh('clubs');
                            void loadClubFamilies();
                        }}
                        disabled={isLoadingClubs || isLoadingFamilies}
                        title="Refrescar catalogo y relaciones"
                    >
                        <RefreshCw size={13} style={{ marginRight: 4, animation: isLoadingClubs || isLoadingFamilies ? 'spin 1s linear infinite' : 'none' }} />
                        Refrescar
                    </button>
                    <Link href="/admin/super/clubes" className={styles.cardAction}>
                        Ver catalogo de clubes
                    </Link>
                </div>
            </div>

            {errorMsg && (
                <div style={{ padding: '12px 16px', marginBottom: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#ef4444', fontSize: 13 }}>
                    {errorMsg}
                </div>
            )}

            <div className={styles.slab}>
                <div className={styles.slabHeader}>
                    <div>
                        <span className={styles.slabLabel}>Estructura</span>
                        <div className={styles.slabTitle}>Mapa de familias</div>
                    </div>
                    <div className={styles.slabActions}>
                        <button
                            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                            onClick={openCreateFamilyModal}
                            disabled={isLoadingClubs || availableFamilyBaseClubs.length === 0}
                        >
                            <Plus size={13} style={{ marginRight: 6 }} />
                            Crear familia
                        </button>
                        <button
                            className={styles.cardAction}
                            onClick={() => void loadClubFamilies()}
                            disabled={isLoadingFamilies}
                        >
                            <RefreshCw size={13} style={{ marginRight: 6, animation: isLoadingFamilies ? 'spin 1s linear infinite' : 'none' }} />
                            Refrescar familias
                        </button>
                    </div>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: 16,
                        marginBottom: 20,
                    }}
                >
                    <div style={{ padding: 16, border: '1px solid var(--surface-edge)', background: 'var(--basalt-800)', borderRadius: 12 }}>
                        <div className={styles.slabLabel} style={{ marginBottom: 10 }}>Familias</div>
                        <div className={styles.statValue} style={{ fontSize: 28 }}>{familySummaries.length}</div>
                        <div className={styles.statSub}>Grupos con base y derivados</div>
                    </div>
                    <div style={{ padding: 16, border: '1px solid var(--surface-edge)', background: 'var(--basalt-800)', borderRadius: 12 }}>
                        <div className={styles.slabLabel} style={{ marginBottom: 10 }}>Vinculos</div>
                        <div className={styles.statValue} style={{ fontSize: 28 }}>{clubDerivativeRelations.length}</div>
                        <div className={styles.statSub}>Relaciones en club_derivatives</div>
                    </div>
                    <div style={{ padding: 16, border: '1px solid var(--surface-edge)', background: 'var(--basalt-800)', borderRadius: 12 }}>
                        <div className={styles.slabLabel} style={{ marginBottom: 10 }}>Clubes sueltos</div>
                        <div className={styles.statValue} style={{ fontSize: 28 }}>{standaloneClubsCount}</div>
                        <div className={styles.statSub}>Sin familia declarada</div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
                    <input
                        type="search"
                        value={familySearch}
                        onChange={(event) => setFamilySearch(event.target.value)}
                        placeholder="Buscar familia por club, deporte, ciudad o union..."
                        style={{
                            minWidth: 280,
                            flex: '1 1 420px',
                            background: '#0f1217',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 12,
                            color: '#fff',
                            padding: '12px 14px',
                            fontSize: 13,
                            outline: 'none',
                        }}
                    />
                    {familySearch.trim() && (
                        <div style={{ fontSize: 12, color: 'var(--basalt-400)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            {filteredFamilySummaries.length} de {familySummaries.length} familias
                        </div>
                    )}
                </div>

                {familyLoadError && (
                    <div style={{ padding: '12px 14px', marginBottom: 16, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 10, color: '#fca5a5', fontSize: 13 }}>
                        No pudimos cargar las familias de clubes. {familyLoadError}
                    </div>
                )}

                {isLoadingFamilies ? (
                    <div style={{ color: 'var(--basalt-400)', textAlign: 'center', padding: '24px 0' }}>
                        Cargando familias...
                    </div>
                ) : familySummaries.length === 0 ? (
                    <div style={{ display: 'grid', gap: 14, color: 'var(--basalt-400)', textAlign: 'center', padding: '28px 0' }}>
                        <div>No hay familias configuradas todavia.</div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                                onClick={openCreateFamilyModal}
                                disabled={isLoadingClubs || availableFamilyBaseClubs.length === 0}
                            >
                                <Plus size={13} style={{ marginRight: 6 }} />
                                Crear primera familia
                            </button>
                            <Link href="/admin/super/clubes" className={styles.cardAction}>
                                Ir al panel de clubes
                            </Link>
                        </div>
                    </div>
                ) : filteredFamilySummaries.length === 0 ? (
                    <div style={{ display: 'grid', gap: 12, color: 'var(--basalt-400)', textAlign: 'center', padding: '28px 0' }}>
                        <div>No encontramos familias con esa busqueda.</div>
                        <button
                            type="button"
                            className={styles.cardAction}
                            onClick={() => setFamilySearch('')}
                            style={{ justifySelf: 'center' }}
                        >
                            Limpiar busqueda
                        </button>
                    </div>
                ) : (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                            gap: 16,
                        }}
                    >
                        {filteredFamilySummaries.map((family) => (
                            <div
                                key={family.root.id}
                                style={{
                                    border: '1px solid var(--surface-edge)',
                                    background: 'var(--basalt-800)',
                                    borderRadius: 14,
                                    padding: 18,
                                    display: 'grid',
                                    gap: 14,
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            <GitBranch size={15} style={{ color: 'var(--color-accent)' }} />
                                            <span className={styles.slabLabel} style={{ marginBottom: 0 }}>Familia base</span>
                                        </div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{family.root.name}</div>
                                        <div style={{ fontSize: 12, color: 'var(--basalt-400)', marginTop: 4 }}>
                                            {family.members.length} clubes · {family.relations.length} vinculos
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                        <button
                                            type="button"
                                            className={styles.cardAction}
                                            onClick={() => openAddToFamilyModal(family.root)}
                                        >
                                            <Plus size={13} style={{ marginRight: 6 }} />
                                            Editar familia
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.cardAction}
                                            onClick={() => void handleDeleteFamily(family)}
                                            disabled={isLoadingFamilies}
                                            style={{ color: '#fca5a5' }}
                                        >
                                            <Trash2 size={13} style={{ marginRight: 6 }} />
                                            Eliminar
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gap: 10 }}>
                                    {family.members.map((member) => {
                                        const isRoot = member.id === family.root.id;
                                        const divisionLink = family.divisionLinks.find((item) => item.division_club_id === member.id);
                                        const rosterOwner = divisionLink ? clubById.get(divisionLink.roster_owner_club_id) : null;
                                        const divisionGroupLabel = divisionLink?.group_name?.trim();
                                        return (
                                            <div
                                                key={member.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: 12,
                                                    padding: '10px 12px',
                                                    borderRadius: 10,
                                                    border: '1px solid var(--surface-edge)',
                                                    background: isRoot ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                                    <div style={{ width: 34, height: 34, borderRadius: 6, border: '1px solid var(--surface-edge)', background: 'var(--basalt-900)', overflow: 'hidden', flexShrink: 0 }}>
                                                        <ClubLogo logo={member.logo_url} name={member.name} color={member.primary_color} />
                                                    </div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, color: '#ececec' }}>{member.name}</div>
                                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                                                            <span style={{ fontSize: 10, color: 'var(--basalt-400)', fontFamily: 'var(--font-mono)' }}>
                                                                {isRoot ? 'BASE' : 'FAMILIA'}
                                                            </span>
                                                            {rosterOwner && (
                                                                <span style={{ fontSize: 10, color: '#86efac', fontFamily: 'var(--font-mono)' }}>
                                                                    {divisionGroupLabel ? `${divisionGroupLabel}: ` : 'PLANTEL: '}
                                                                    {rosterOwner.name}
                                                                </span>
                                                            )}
                                                            {member.sport && (
                                                                <span style={{ fontSize: 10, color: 'var(--basalt-400)', fontFamily: 'var(--font-mono)' }}>
                                                                    {getSportDisplayName(member.sport) || member.sport}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                    {!isRoot && (
                                                        <button
                                                            type="button"
                                                            className={styles.cardAction}
                                                            style={{ padding: '6px 10px', fontSize: 11, color: '#fca5a5' }}
                                                            onClick={() => void handleRemoveFamilyMember(family.root.id, member)}
                                                        >
                                                            <Trash2 size={11} style={{ marginRight: 4 }} />
                                                            Quitar
                                                        </button>
                                                    )}
                                                    <Link
                                                        href={`/admin/entities/${member.id}/manage?type=club&tab=relacionados`}
                                                        className={styles.cardAction}
                                                        style={{ padding: '6px 10px', fontSize: 11 }}
                                                    >
                                                        <Link2 size={11} style={{ marginRight: 4 }} />
                                                        Gestionar
                                                    </Link>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isCreateFamilyOpen && (
                <div
                    onClick={closeCreateFamilyModal}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(4, 6, 10, 0.72)',
                        backdropFilter: 'blur(10px)',
                        zIndex: 120,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '24px',
                    }}
                >
                    <div
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: 'min(1040px, 100%)',
                            maxHeight: 'min(90vh, 860px)',
                            overflow: 'auto',
                            background: 'linear-gradient(180deg, #181c23 0%, #101318 100%)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 20,
                            boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
                            padding: 24,
                            display: 'grid',
                            gap: 18,
                        }}
                    >
                        <div style={{ display: 'grid', gap: 6 }}>
                            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--basalt-400)' }}>
                                {editingBaseClubId ? 'Editar familia' : 'Crear familia'}
                            </span>
                            <h3 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#fff' }}>
                                {editingBaseClubId ? 'Ajusta los clubes de la familia' : 'Selecciona los clubes de la familia'}
                            </h3>
                            <p style={{ margin: 0, color: 'var(--basalt-400)', lineHeight: 1.55 }}>
                                El primer club seleccionado queda como base. Tambien podes cambiar la base desde el selector. Los clubes nuevos se crean desde el panel de clubes.
                            </p>
                            <p style={{ margin: 0, color: '#86efac', lineHeight: 1.55, fontSize: 13 }}>
                                Para casos como M16 A/B o Primera/Reserva, marca &quot;comparte plantel&quot; en los clubes que deben usar el roster del club base.
                            </p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'grid', gap: 4 }}>
                                <div style={{ fontSize: 12, color: 'var(--basalt-400)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    {selectedClubIds.length} seleccionados
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--basalt-400)' }}>
                                    Base: {baseClub?.name || 'marca primero el club base'}
                                </div>
                                {selectedClubIds.length > 0 && (
                                    <label style={{ display: 'grid', gap: 6, marginTop: 8, color: 'var(--basalt-300)', fontSize: 12 }}>
                                        Cambiar club base
                                        <select
                                            value={baseClubId || ''}
                                            onChange={(event) => selectBaseClub(event.target.value)}
                                            style={{
                                                background: '#0f1217',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: 10,
                                                color: '#fff',
                                                padding: '9px 12px',
                                                fontSize: 13,
                                            }}
                                        >
                                            {selectedClubIds.map((clubId) => {
                                                const club = clubById.get(clubId);
                                                return club ? (
                                                    <option key={club.id} value={club.id}>
                                                        {club.name}
                                                    </option>
                                                ) : null;
                                            })}
                                        </select>
                                    </label>
                                )}
                            </div>
                            <input
                                type="search"
                                value={clubSearch}
                                onChange={(event) => setClubSearch(event.target.value)}
                                placeholder="Buscar club por nombre, deporte, ciudad o union..."
                                style={{
                                    minWidth: 320,
                                    flex: '1 1 360px',
                                    background: '#0f1217',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 12,
                                    color: '#fff',
                                    padding: '11px 14px',
                                    fontSize: 13,
                                    outline: 'none',
                                }}
                            />
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                                gap: 12,
                                maxHeight: 456,
                                overflowY: 'auto',
                                paddingRight: 4,
                            }}
                        >
                            {visibleSelectionClubs.length === 0 ? (
                                <div style={{ gridColumn: '1 / -1', padding: '28px 12px', textAlign: 'center', color: 'var(--basalt-400)', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 14 }}>
                                    No encontramos clubes con esa busqueda.
                                </div>
                            ) : visibleSelectionClubs.map((club) => {
                                const isSelected = selectedClubIds.includes(club.id);
                                const isBase = baseClubId === club.id;

                                return (
                                    <button
                                        key={club.id}
                                        type="button"
                                        onClick={() => toggleSelectedClub(club.id)}
                                        style={{
                                            minHeight: 64,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            textAlign: 'left',
                                            borderRadius: 14,
                                            border: `1px solid ${isSelected ? 'rgba(16,185,129,0.65)' : 'rgba(255,255,255,0.08)'}`,
                                            background: isSelected ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.025)',
                                            color: '#fff',
                                            padding: 12,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <span style={{ width: 38, height: 38, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
                                            <ClubLogo logo={club.logo_url} name={club.name} color={club.primary_color} />
                                        </span>
                                        <span style={{ minWidth: 0, flex: 1 }}>
                                            <span style={{ display: 'block', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {club.name}
                                            </span>
                                            <span style={{ display: 'block', fontSize: 10, color: isSelected ? '#86efac' : 'var(--basalt-500)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                                                {isBase ? 'BASE' : isSelected ? 'INCLUIDO' : 'CLIC PARA MARCAR'}
                                            </span>
                                        </span>
                                        <span
                                            aria-hidden="true"
                                            style={{
                                                width: 18,
                                                height: 18,
                                                borderRadius: 999,
                                                border: `1px solid ${isSelected ? '#22c55e' : 'rgba(255,255,255,0.2)'}`,
                                                background: isSelected ? '#22c55e' : 'transparent',
                                                display: 'grid',
                                                placeItems: 'center',
                                                color: '#04130b',
                                                fontSize: 12,
                                                fontWeight: 900,
                                                flexShrink: 0,
                                            }}
                                        >
                                            {isSelected ? '✓' : ''}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {selectedClubIds.length > 1 && (
                            <div style={{ display: 'grid', gap: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)', borderRadius: 14, padding: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                                    <div style={{ display: 'grid', gap: 4 }}>
                                        <div style={{ fontSize: 11, color: '#86efac', fontFamily: 'var(--font-mono)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                                            Configurar divisiones independientes
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--basalt-400)' }}>
                                            Crea varios grupos con nombre propio. Cada grupo tiene su propio club dueño del plantel y sus clubes que comparten ese roster.
                                        </div>
                                    </div>
                                    <button type="button" className={styles.cardAction} onClick={addDivisionGroup}>
                                        <Plus size={13} style={{ marginRight: 6 }} />
                                        Agregar grupo
                                    </button>
                                </div>

                                {divisionGroups.length === 0 ? (
                                    <div style={{ padding: 12, borderRadius: 10, border: '1px dashed rgba(255,255,255,0.12)', color: 'var(--basalt-400)', fontSize: 13 }}>
                                        No hay grupos configurados. Si M16 A/B o Primera/Reserva comparten jugadores, agrega un grupo.
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gap: 10 }}>
                                        {divisionGroups.map((group, groupIndex) => {
                                            const ownerClub = clubById.get(group.rosterOwnerClubId);

                                            return (
                                                <div key={group.id} style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.16)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <label style={{ display: 'grid', gap: 6, color: 'var(--basalt-300)', fontSize: 12, minWidth: 220, flex: '1 1 240px' }}>
                                                            Nombre del grupo #{groupIndex + 1}
                                                            <input
                                                                value={group.name}
                                                                onChange={(event) => updateDivisionGroupName(group.id, event.target.value)}
                                                                placeholder="Ej: M16, Plantel Superior"
                                                                style={{ background: '#0f1217', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', padding: '9px 12px', fontSize: 13 }}
                                                            />
                                                        </label>
                                                        <label style={{ display: 'grid', gap: 6, color: 'var(--basalt-300)', fontSize: 12, minWidth: 260, flex: '1 1 300px' }}>
                                                            Plantel dueño #{groupIndex + 1}
                                                            <select
                                                                value={group.rosterOwnerClubId}
                                                                onChange={(event) => updateDivisionGroupOwner(group.id, event.target.value)}
                                                                style={{ background: '#0f1217', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', padding: '9px 12px', fontSize: 13 }}
                                                            >
                                                                {selectedClubIds.map((clubId) => {
                                                                    const club = clubById.get(clubId);
                                                                    return club ? <option key={club.id} value={club.id}>{club.name}</option> : null;
                                                                })}
                                                            </select>
                                                        </label>
                                                        <button type="button" className={styles.cardAction} onClick={() => removeDivisionGroup(group.id)} style={{ color: '#fca5a5' }}>
                                                            <Trash2 size={13} style={{ marginRight: 6 }} />
                                                            Quitar grupo
                                                        </button>
                                                    </div>

                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                        {selectedClubIds.filter((clubId) => clubId !== group.rosterOwnerClubId).map((clubId) => {
                                                            const club = clubById.get(clubId);
                                                            if (!club) return null;

                                                            const isLinked = group.divisionClubIds.includes(clubId);

                                                            return (
                                                                <button
                                                                    key={clubId}
                                                                    type="button"
                                                                    onClick={() => toggleDivisionGroupMember(group.id, clubId)}
                                                                    style={{
                                                                        border: `1px solid ${isLinked ? 'rgba(34,197,94,0.8)' : 'rgba(255,255,255,0.12)'}`,
                                                                        background: isLinked ? 'rgba(34,197,94,0.16)' : 'rgba(255,255,255,0.04)',
                                                                        color: isLinked ? '#bbf7d0' : 'var(--basalt-300)',
                                                                        borderRadius: 999,
                                                                        padding: '8px 12px',
                                                                        cursor: 'pointer',
                                                                        fontSize: 11,
                                                                        fontWeight: 800,
                                                                        letterSpacing: '0.06em',
                                                                        textTransform: 'uppercase',
                                                                    }}
                                                                >
                                                                    {isLinked ? 'Comparte - ' : ''}
                                                                    {club.name}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>

                                                    <div style={{ fontSize: 12, color: 'var(--basalt-500)' }}>
                                                        {ownerClub?.name || 'El club seleccionado'} sera la fuente del plantel para los clubes marcados.
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {false && selectedDerivedClubIds.length > 0 && (
                            <div style={{ display: 'grid', gap: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)', borderRadius: 14, padding: 14 }}>
                                <div style={{ display: 'grid', gap: 4 }}>
                                    <div style={{ fontSize: 11, color: '#86efac', fontFamily: 'var(--font-mono)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                                        Configurar divisiones
                                    </div>
                                    <div style={{ fontSize: 13, color: 'var(--basalt-400)' }}>
                                        Marca los clubes que comparten el plantel del club base. La familia sigue siendo una familia; esto solo configura el roster compartido.
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {selectedDerivedClubIds.map((clubId) => {
                                        const club = clubById.get(clubId);
                                        if (!club) return null;

                                        const sharesRoster = divisionClubIds.includes(clubId);

                                        return (
                                            <button
                                                key={clubId}
                                                type="button"
                                                onClick={() => toggleDivisionClub(clubId)}
                                                style={{
                                                    border: `1px solid ${sharesRoster ? 'rgba(34,197,94,0.8)' : 'rgba(255,255,255,0.12)'}`,
                                                    background: sharesRoster ? 'rgba(34,197,94,0.16)' : 'rgba(255,255,255,0.04)',
                                                    color: sharesRoster ? '#bbf7d0' : 'var(--basalt-300)',
                                                    borderRadius: 999,
                                                    padding: '8px 12px',
                                                    cursor: 'pointer',
                                                    fontSize: 11,
                                                    fontWeight: 800,
                                                    letterSpacing: '0.06em',
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                {sharesRoster ? '✓ ' : ''}
                                                {club.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {filteredSelectionClubs.length > MAX_FAMILY_SELECTION_CARDS && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--basalt-400)' }}>
                                <span>
                                    Pagina {currentClubPage + 1} de {totalClubPages}. Mostrando {visibleSelectionClubs.length} de {filteredSelectionClubs.length} clubes encontrados.
                                </span>
                                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        className={styles.cardAction}
                                        onClick={() => setClubPage((page) => Math.max(0, page - 1))}
                                        disabled={currentClubPage === 0}
                                    >
                                        <ChevronLeft size={13} style={{ marginRight: 4 }} />
                                        Anterior
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.cardAction}
                                        onClick={() => setClubPage((page) => Math.min(totalClubPages - 1, page + 1))}
                                        disabled={currentClubPage >= totalClubPages - 1}
                                    >
                                        Siguiente
                                        <ChevronRight size={13} style={{ marginLeft: 4 }} />
                                    </button>
                                </span>
                            </div>
                        )}

                        {createFamilyError && (
                            <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 10, color: '#fca5a5', fontSize: 13 }}>
                                {createFamilyError}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 12, color: 'var(--basalt-400)', lineHeight: 1.5 }}>
                                Para crear clubes nuevos, usa el panel de clubes. Aca solo agrupamos clubes existentes.
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <button type="button" className={styles.cardAction} onClick={closeCreateFamilyModal} disabled={isCreatingFamily}>
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                                    onClick={handleCreateFamily}
                                    disabled={isCreatingFamily || !baseClubId || selectedDerivedClubIds.length === 0}
                                >
                                    <Plus size={13} style={{ marginRight: 6 }} />
                                    {isCreatingFamily ? 'Guardando...' : editingBaseClubId ? 'Guardar familia' : 'Crear familia'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
