'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { ChevronLeft, ChevronRight, GitBranch, Link2, Plus, RefreshCw } from 'lucide-react';
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
    const [isLoadingFamilies, setIsLoadingFamilies] = useState(false);
    const [familyLoadError, setFamilyLoadError] = useState<string | null>(null);
    const [isCreateFamilyOpen, setIsCreateFamilyOpen] = useState(false);
    const [selectedClubIds, setSelectedClubIds] = useState<string[]>([]);
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
                error?: string;
                details?: string | null;
            };

            if (!response.ok) {
                throw new Error(payload.error || payload.details || 'No se pudieron cargar las familias.');
            }

            setClubDerivativeRelations(Array.isArray(payload.data) ? payload.data : []);
        } catch (error) {
            setFamilyLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las familias.');
            setClubDerivativeRelations([]);
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
            members: ClubWithUnion[];
        }>();

        for (const relation of clubDerivativeRelations) {
            const rootClub = clubById.get(relation.base_club_id);
            const derivedClub = clubById.get(relation.derived_club_id);
            if (!rootClub || !derivedClub) continue;

            const currentFamily = familyMap.get(rootClub.id) ?? {
                root: rootClub,
                relations: [],
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
                members: family.members.sort((left, right) => {
                    if (left.id === family.root.id) return -1;
                    if (right.id === family.root.id) return 1;
                    return left.name.localeCompare(right.name);
                }),
            }))
            .sort((left, right) => left.root.name.localeCompare(right.root.name));
    }, [clubById, clubDerivativeRelations]);

    const clubsInFamilies = useMemo(
        () => new Set(familySummaries.flatMap((family) => family.members.map((club) => club.id))),
        [familySummaries],
    );

    const standaloneClubs = useMemo(
        () => clubs
            .filter((club) => !clubsInFamilies.has(club.id))
            .sort((left, right) => left.name.localeCompare(right.name)),
        [clubs, clubsInFamilies],
    );

    const standaloneClubsCount = standaloneClubs.length;

    const availableFamilyBaseClubs = useMemo(
        () => (standaloneClubs.length > 0 ? standaloneClubs : [...clubs].sort((left, right) => left.name.localeCompare(right.name))),
        [clubs, standaloneClubs],
    );

    const openCreateFamilyModal = () => {
        setSelectedClubIds([]);
        setClubSearch('');
        setClubPage(0);
        setCreateFamilyError(null);
        setIsCreateFamilyOpen(true);
    };

    const openAddToFamilyModal = (club: ClubWithUnion) => {
        setSelectedClubIds([club.id]);
        setClubSearch('');
        setClubPage(0);
        setCreateFamilyError(null);
        setIsCreateFamilyOpen(true);
    };

    const closeCreateFamilyModal = () => {
        if (isCreatingFamily) return;
        setIsCreateFamilyOpen(false);
        setSelectedClubIds([]);
        setClubSearch('');
        setClubPage(0);
        setCreateFamilyError(null);
    };

    const toggleSelectedClub = (clubId: string) => {
        setCreateFamilyError(null);
        setSelectedClubIds((current) =>
            current.includes(clubId)
                ? current.filter((id) => id !== clubId)
                : [...current, clubId]
        );
    };

    const baseClubId = selectedClubIds[0] ?? null;
    const baseClub = baseClubId ? clubById.get(baseClubId) ?? null : null;
    const selectedDerivedClubIds = baseClubId ? selectedClubIds.filter((id) => id !== baseClubId) : [];
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
            setSelectedClubIds([]);
            setClubSearch('');
            setClubPage(0);
            await loadClubFamilies();
        } catch (error) {
            setCreateFamilyError(error instanceof Error ? error.message : 'No se pudo crear la familia.');
        } finally {
            setIsCreatingFamily(false);
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
                ) : (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                            gap: 16,
                        }}
                    >
                        {familySummaries.map((family) => (
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
                                    <button
                                        type="button"
                                        className={styles.cardAction}
                                        onClick={() => openAddToFamilyModal(family.root)}
                                    >
                                        <Plus size={13} style={{ marginRight: 6 }} />
                                        Agregar clubes
                                    </button>
                                </div>

                                <div style={{ display: 'grid', gap: 10 }}>
                                    {family.members.map((member) => {
                                        const isRoot = member.id === family.root.id;
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
                                                            {member.sport && (
                                                                <span style={{ fontSize: 10, color: 'var(--basalt-400)', fontFamily: 'var(--font-mono)' }}>
                                                                    {getSportDisplayName(member.sport) || member.sport}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <Link
                                                    href={`/admin/entities/${member.id}/manage?type=club&tab=relacionados`}
                                                    className={styles.cardAction}
                                                    style={{ padding: '6px 10px', fontSize: 11 }}
                                                >
                                                    <Link2 size={11} style={{ marginRight: 4 }} />
                                                    Gestionar
                                                </Link>
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
                                Crear familia
                            </span>
                            <h3 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#fff' }}>
                                Selecciona los clubes de la familia
                            </h3>
                            <p style={{ margin: 0, color: 'var(--basalt-400)', lineHeight: 1.55 }}>
                                El primer club que marques queda como base. Los siguientes se guardan como relacionados. Los clubes nuevos se crean desde el panel de clubes.
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
                                    {isCreatingFamily ? 'Creando...' : 'Crear familia'}
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
