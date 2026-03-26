'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { Eye, EyeOff, MoreVertical, Pencil, Trash2, Plus, RefreshCw, MapPin, Shield, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { invalidateCache, type ClubWithUnion } from '@/lib/cache/superAdminCache';
import { getActiveSports } from '@/lib/data/sports';
import {
    CLUB_DERIVATIVE_DESCRIPTIONS,
    CLUB_DERIVATIVE_LABELS,
    type ClubDerivativeType,
    canonicalizeSportId,
    getSportDisplayName,
} from '@/lib/clubDerivatives';

function ClubLogo({ logo, name, color }: { logo?: string | null; name: string; color?: string | null }) {
    if (logo) {
        const src = logo.trimStart().startsWith('<svg')
            ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(logo)))}`
            : logo;
        return (
            <img
                src={src} alt={name}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
        );
    }
    const initials = name.substring(0, 2).toUpperCase();
    return (
        <div style={{
            width: '100%', height: '100%', background: color || '#3f3f46',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#fff', borderRadius: 4,
        }}>
            {initials}
        </div>
    );
}

const CLUBS_PER_PAGE = 20;
const ACTIVE_SPORTS = getActiveSports();

type SortKey = 'name' | 'location' | 'followers_count' | 'union' | 'color' | 'visibility';
type ActionMenuPosition = { top: number; left: number; transformOrigin: string };

export default function SuperadminClubesPage() {
    const router = useRouter();
    // ─── Read from shared context (already prefetched by layout) ─────────────────
    const { filters, clubs, loading, errors, refresh, setFilters } = useSuperConsole();
    const isLoading = loading.clubs;
    const errorMsg = errors.clubs;

    const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [derivedBaseClub, setDerivedBaseClub] = useState<ClubWithUnion | null>(null);
    const [derivedType, setDerivedType] = useState<ClubDerivativeType>('youth');
    const [derivedSport, setDerivedSport] = useState<string>(ACTIVE_SPORTS.find((sport) => sport.id !== 'rugby')?.id || ACTIVE_SPORTS[0]?.id || 'rugby');
    const [actionMenuPosition, setActionMenuPosition] = useState<ActionMenuPosition | null>(null);
    const actionMenuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    // Local filter state (club-specific dimensions)
    const [unionFilter, setUnionFilter] = useState('all');
    const [visibilityFilter, setVisibilityFilter] = useState('all');
    const [logoFilter, setLogoFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);

    // Sort state
    const [sortBy, setSortBy] = useState<SortKey>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const handleSort = (key: SortKey) => {
        if (sortBy === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            setSortDir(key === 'followers_count' ? 'desc' : 'asc');
        }
        setCurrentPage(1);
    };

    // Local state for optimistic mutations (avoid full context refresh unless needed)
    const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<ClubWithUnion>>>({});
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

    const supabase = createClient();

    const getSuggestedOtherSport = (clubSport?: string | null) => {
        const baseSport = canonicalizeSportId(clubSport);
        return ACTIVE_SPORTS.find((sport) => canonicalizeSportId(sport.id) !== baseSport)?.id
            || ACTIVE_SPORTS[0]?.id
            || 'rugby';
    };

    const updateActionMenuPosition = useCallback((clubId: string) => {
        if (typeof window === 'undefined') return;

        const button = actionMenuButtonRefs.current[clubId];
        if (!button) {
            setActionMenuOpenId(null);
            setActionMenuPosition(null);
            return;
        }

        const rect = button.getBoundingClientRect();
        const menuWidth = 200;
        const estimatedMenuHeight = 176;
        const offset = 8;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const openUpwards = spaceBelow < estimatedMenuHeight && rect.top > estimatedMenuHeight;
        const unclampedLeft = rect.right - menuWidth;
        const left = Math.max(12, Math.min(unclampedLeft, viewportWidth - menuWidth - 12));
        const top = openUpwards
            ? Math.max(12, rect.top - estimatedMenuHeight - offset)
            : Math.min(rect.bottom + offset, viewportHeight - estimatedMenuHeight - 12);

        setActionMenuPosition({
            top,
            left,
            transformOrigin: `${rect.right - left}px ${openUpwards ? estimatedMenuHeight : 0}px`,
        });
    }, []);

    const openCreateDerivedModal = (club: ClubWithUnion) => {
        setActionMenuOpenId(null);
        setDerivedBaseClub(club);
        setDerivedType('youth');
        setDerivedSport(getSuggestedOtherSport(club.sport));
    };

    const closeCreateDerivedModal = () => {
        setDerivedBaseClub(null);
    };

    const handleCreateDerivedClub = () => {
        if (!derivedBaseClub) return;

        const search = new URLSearchParams({
            type: 'club',
            derivedFrom: derivedBaseClub.id,
            derivativeType: derivedType,
        });

        if (derivedType === 'other_sport' && derivedSport) {
            search.set('derivedSport', derivedSport);
        }

        router.push(`/admin/entities/new?${search.toString()}`);
    };

    const handleToggleVisibility = async (club: ClubWithUnion) => {
        setTogglingId(club.id);
        setActionMenuOpenId(null);
        const currentVal = localOverrides[club.id]?.is_visible ?? club.is_visible;
        const newVal = currentVal === false ? true : false;
        // Optimistic update
        setLocalOverrides(prev => ({ ...prev, [club.id]: { ...prev[club.id], is_visible: newVal } }));
        try {
            const { error } = await supabase.from('clubs').update({ is_visible: newVal }).eq('id', club.id);
            if (error) throw error;
            invalidateCache('clubs_list');
        } catch (err: unknown) {
            // Revert
            setLocalOverrides(prev => ({ ...prev, [club.id]: { ...prev[club.id], is_visible: currentVal } }));
            alert(`Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
        } finally {
            setTogglingId(null);
        }
    };

    const handleDelete = async (clubId: string, clubName: string) => {
        setActionMenuOpenId(null);
        if (!confirm(`¿Eliminar el club "${clubName}"? Esta acción no se puede deshacer.`)) return;
        setDeletingId(clubId);
        try {
            const { error } = await supabase.from('clubs').delete().eq('id', clubId);
            if (error) throw error;
            // Optimistic remove
            setDeletedIds(prev => new Set([...prev, clubId]));
            invalidateCache('clubs_list');
        } catch (err: unknown) {
            alert(`Error al eliminar: ${err instanceof Error ? err.message : 'Error desconocido'}`);
        } finally {
            setDeletingId(null);
        }
    };

    // Apply optimistic overrides + deleted filter
    const displayClubs = useMemo(() => clubs
        .filter(c => !deletedIds.has(c.id))
        .map(c => ({ ...c, ...(localOverrides[c.id] ?? {}) }))
        , [clubs, deletedIds, localOverrides]);

    const availableCountries = useMemo(() =>
        [...new Set(displayClubs.map(c => c.country).filter(Boolean) as string[])].sort()
    , [displayClubs]);

    const availableUnions = useMemo(() =>
        [...new Set(displayClubs.map(c => c.union?.name).filter(Boolean) as string[])].sort()
    , [displayClubs]);

    useEffect(() => {
        if (filters.country === 'all') return;

        const normalizedSelected = filters.country.trim().toLowerCase();
        const hasMatchingCountry = availableCountries.some((country) => country.trim().toLowerCase() === normalizedSelected);

        if (!hasMatchingCountry) {
            setFilters((prev) => ({ ...prev, country: 'all' }));
        }
    }, [availableCountries, filters.country, setFilters]);

    const filtered = useMemo(() => displayClubs.filter(club => {
        if (filters.search && !club.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (
            filters.country !== 'all' &&
            (club.country || '').trim().toLowerCase() !== filters.country.trim().toLowerCase()
        ) return false;
        if (unionFilter !== 'all' && (!club.union || club.union.name !== unionFilter)) return false;
        if (visibilityFilter === 'visible' && club.is_visible === false) return false;
        if (visibilityFilter === 'oculto' && club.is_visible !== false) return false;
        if (logoFilter === 'con' && !club.logo_url) return false;
        if (logoFilter === 'sin' && club.logo_url) return false;
        return true;
    }), [displayClubs, filters.search, filters.country, unionFilter, visibilityFilter, logoFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filters.search, filters.country, unionFilter, visibilityFilter, logoFilter]);

    const sortedFiltered = useMemo(() => {
        const mult = sortDir === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return mult * a.name.localeCompare(b.name);
                case 'location': {
                    const la = [a.country, a.city].filter(Boolean).join('') || '';
                    const lb = [b.country, b.city].filter(Boolean).join('') || '';
                    return mult * la.localeCompare(lb);
                }
                case 'followers_count':
                    return mult * ((a.followers_count ?? 0) - (b.followers_count ?? 0));
                case 'union': {
                    const ua = a.union?.name || '';
                    const ub = b.union?.name || '';
                    return mult * ua.localeCompare(ub);
                }
                case 'color': {
                    const ca = a.primary_color ? 1 : 0;
                    const cb = b.primary_color ? 1 : 0;
                    return mult * (ca - cb);
                }
                case 'visibility': {
                    const va = a.is_visible === false ? 0 : 1;
                    const vb = b.is_visible === false ? 0 : 1;
                    return mult * (va - vb);
                }
                default:
                    return 0;
            }
        });
    }, [filtered, sortBy, sortDir]);

    const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / CLUBS_PER_PAGE));

    useEffect(() => {
        setCurrentPage(prev => Math.min(prev, totalPages));
    }, [totalPages]);

    const paginatedClubs = useMemo(() => {
        const startIndex = (currentPage - 1) * CLUBS_PER_PAGE;
        return sortedFiltered.slice(startIndex, startIndex + CLUBS_PER_PAGE);
    }, [sortedFiltered, currentPage]);

    const paginationPages = useMemo(
        () => Array.from({ length: totalPages }, (_, index) => index + 1),
        [totalPages],
    );

    const hasActiveFilters = filters.search || filters.country !== 'all' || unionFilter !== 'all' || visibilityFilter !== 'all' || logoFilter !== 'all';

    const clearFilters = () => {
        setFilters(prev => ({ ...prev, search: '', country: 'all' }));
        setUnionFilter('all');
        setVisibilityFilter('all');
        setLogoFilter('all');
        setCurrentPage(1);
    };

    const visibleCount = filtered.filter(c => c.is_visible !== false).length;
    const hiddenCount = filtered.filter(c => c.is_visible === false).length;
    const pageStart = sortedFiltered.length === 0 ? 0 : (currentPage - 1) * CLUBS_PER_PAGE + 1;
    const pageEnd = Math.min(currentPage * CLUBS_PER_PAGE, sortedFiltered.length);
    const derivedSportMatchesBase = derivedBaseClub
        ? canonicalizeSportId(derivedBaseClub.sport) === canonicalizeSportId(derivedSport)
        : false;
    const actionMenuClub = useMemo(
        () => displayClubs.find((club) => club.id === actionMenuOpenId) ?? null,
        [actionMenuOpenId, displayClubs],
    );

    useEffect(() => {
        if (!actionMenuOpenId) {
            setActionMenuPosition(null);
            return;
        }

        updateActionMenuPosition(actionMenuOpenId);

        const handleViewportChange = () => updateActionMenuPosition(actionMenuOpenId);
        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);

        return () => {
            window.removeEventListener('resize', handleViewportChange);
            window.removeEventListener('scroll', handleViewportChange, true);
        };
    }, [actionMenuOpenId, updateActionMenuPosition]);

    useEffect(() => {
        if (!actionMenuOpenId || actionMenuClub) return;
        setActionMenuOpenId(null);
        setActionMenuPosition(null);
    }, [actionMenuClub, actionMenuOpenId]);

    return (
        <div style={{ paddingBottom: 40 }} onClick={() => setActionMenuOpenId(null)}>

            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Clubes</div>
                    <div className={styles.consoleSubtitle}>
                        {isLoading
                            ? 'Cargando…'
                            : `${filtered.length} clubes — ${visibleCount} visibles, ${hiddenCount} ocultos`}
                    </div>
                </div>
                <div className={styles.consoleActions}>
                    <button
                        className={styles.cardAction}
                        onClick={() => refresh('clubs')}
                        disabled={isLoading}
                        title="Forzar recarga"
                    >
                        <RefreshCw size={13} style={{ marginRight: 4, animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
                        Refrescar
                    </button>
                    <Link href="/admin/entities/new?type=club" className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}>
                        <Plus size={13} style={{ marginRight: 4 }} /> Crear Club
                    </Link>
                </div>
            </div>

            {/* Filter bar */}
            <div className={styles.filterBar} style={{ gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                    <input
                        type="text"
                        className={styles.filterControl}
                        placeholder="Buscar por nombre..."
                        value={filters.search}
                        onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        style={{ width: '100%' }}
                    />
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={styles.filterLabel}>País</span>
                    <select
                        className={styles.filterControl}
                        value={filters.country}
                        onChange={e => setFilters(prev => ({ ...prev, country: e.target.value }))}
                    >
                        <option value="all">Todos</option>
                        {availableCountries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <span className={styles.filterLabel}>Unión</span>
                    <select
                        className={styles.filterControl}
                        value={unionFilter}
                        onChange={e => setUnionFilter(e.target.value)}
                    >
                        <option value="all">Todas</option>
                        {availableUnions.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>

                    <span className={styles.filterLabel}>Visibilidad</span>
                    <select
                        className={styles.filterControl}
                        value={visibilityFilter}
                        onChange={e => setVisibilityFilter(e.target.value)}
                    >
                        <option value="all">Todos</option>
                        <option value="visible">Visible</option>
                        <option value="oculto">Oculto</option>
                    </select>

                    <span className={styles.filterLabel}>Logo</span>
                    <select
                        className={styles.filterControl}
                        value={logoFilter}
                        onChange={e => setLogoFilter(e.target.value)}
                    >
                        <option value="all">Todos</option>
                        <option value="con">Con logo</option>
                        <option value="sin">Sin logo</option>
                    </select>

                    {hasActiveFilters && (
                        <button className={styles.cardAction} onClick={clearFilters} style={{ whiteSpace: 'nowrap' }}>
                            Limpiar
                        </button>
                    )}
                </div>
            </div>

            {errorMsg && (
                <div style={{ padding: '12px 16px', marginBottom: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#ef4444', fontSize: 13 }}>
                    ⚠️ {errorMsg}
                </div>
            )}

            {isLoading && (
                <div className={styles.slab} style={{ padding: 48, textAlign: 'center', color: 'var(--basalt-400)' }}>
                    <RefreshCw size={20} style={{ marginBottom: 12, animation: 'spin 1s linear infinite' }} />
                    <div>Cargando clubes…</div>
                </div>
            )}

            {!isLoading && filtered.length === 0 && (
                <div className={styles.slab} style={{ padding: 48, textAlign: 'center' }}>
                    <Shield size={36} style={{ marginBottom: 16, opacity: 0.3 }} />
                    <div style={{ color: 'var(--basalt-400)' }}>
                        {clubs.length === 0
                            ? 'No hay clubes en la base de datos.'
                            : 'Ningún club coincide con los filtros actuales.'}
                    </div>
                </div>
            )}

            {!isLoading && filtered.length > 0 && (
                <>
                <div className={styles.slab} style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--surface-edge)' }}>
                                {([
                                    ['Club', 'name'],
                                    ['Ciudad / País', 'location'],
                                    ['Seguidores', 'followers_count'],
                                    ['Unión', 'union'],
                                    ['Color', 'color'],
                                    ['Visibilidad', 'visibility'],
                                    ['Acciones', null],
                                ] as [string, SortKey | null][]).map(([h, key]) => (
                                    <th
                                        key={h}
                                        onClick={key ? () => handleSort(key) : undefined}
                                        style={{
                                            padding: '12px 16px', textAlign: 'left',
                                            fontFamily: 'var(--font-mono)', fontSize: 10,
                                            color: key && sortBy === key ? '#e4e4e7' : 'var(--basalt-400)',
                                            textTransform: 'uppercase', letterSpacing: '0.07em',
                                            cursor: key ? 'pointer' : 'default',
                                            userSelect: 'none',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {h}
                                        {key && sortBy === key && (
                                            <span style={{ marginLeft: 4, opacity: 0.8 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedClubs.map(club => {
                                const isVisible = club.is_visible !== false;
                                return (
                                    <tr
                                        key={club.id}
                                        style={{ borderBottom: '1px solid var(--surface-edge)', opacity: deletingId === club.id ? 0.4 : 1, transition: 'opacity 0.2s' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ width: 44, height: 44, borderRadius: 6, border: '1px solid var(--surface-edge)', background: 'var(--basalt-800)', overflow: 'hidden', flexShrink: 0 }}>
                                                    <ClubLogo logo={club.logo_url} name={club.name} color={club.primary_color} />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: '#ececec' }}>{club.name}</div>
                                                    {club.short_name && <div style={{ fontSize: 11, color: 'var(--basalt-400)', fontFamily: 'var(--font-mono)' }}>{club.short_name}</div>}
                                                    {!club.logo_url && (
                                                        <div style={{ fontSize: 10, color: '#f59e0b', fontFamily: 'var(--font-mono)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                            ⚠ sin logo
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--basalt-400)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                                <MapPin size={11} />
                                                {[club.city, club.region, club.country].filter(Boolean).join(', ') || '—'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--basalt-400)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                                <Users size={13} />
                                                <span>{club.followers_count ?? 0}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            {club.union
                                                ? <span style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--basalt-800)', border: '1px solid var(--surface-edge)', fontSize: 11, fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}>{club.union.name}</span>
                                                : <span style={{ color: 'var(--basalt-600)', fontSize: 12 }}>Sin unión</span>}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            {club.primary_color ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <div style={{ width: 16, height: 16, borderRadius: 3, background: club.primary_color, border: '1px solid rgba(255,255,255,0.1)' }} />
                                                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--basalt-400)' }}>{club.primary_color}</span>
                                                </div>
                                            ) : <span style={{ color: 'var(--basalt-600)', fontSize: 12 }}>—</span>}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4,
                                                background: isVisible ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
                                                border: `1px solid ${isVisible ? 'rgba(16,185,129,0.3)' : 'rgba(107,114,128,0.3)'}`,
                                                color: isVisible ? '#10b981' : '#9ca3af', fontSize: 11,
                                            }}>
                                                {isVisible ? <Eye size={10} /> : <EyeOff size={10} />}
                                                {isVisible ? 'Visible' : 'Oculto'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', position: 'relative' }} onClick={e => e.stopPropagation()}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Link href={`/admin/entities/${club.id}/manage?type=club`} className={styles.actionBtn} style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                    <Pencil size={11} /> Gestionar
                                                </Link>
                                                <div style={{ position: 'relative' }}>
                                                    <button
                                                        ref={(node) => {
                                                            actionMenuButtonRefs.current[club.id] = node;
                                                        }}
                                                        className={styles.moreMenuBtn}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setActionMenuOpenId((prev) => prev === club.id ? null : club.id);
                                                        }}
                                                    >
                                                        <MoreVertical size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div
                    className={styles.filterBar}
                    style={{ marginTop: 16, marginBottom: 0, justifyContent: 'space-between', alignItems: 'center' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className={styles.filterLabel} style={{ fontSize: 11 }}>
                        Mostrando {pageStart}-{pageEnd} de {filtered.length} clubes
                    </div>

                    {totalPages > 1 && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                className={styles.cardAction}
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                style={{ padding: '8px 14px' }}
                            >
                                Anterior
                            </button>

                            {paginationPages.map(page => {
                                const isActive = page === currentPage;
                                return (
                                    <button
                                        key={page}
                                        type="button"
                                        className={styles.cardAction}
                                        onClick={() => setCurrentPage(page)}
                                        aria-current={isActive ? 'page' : undefined}
                                        style={{
                                            minWidth: 40,
                                            padding: '8px 12px',
                                            background: isActive ? 'var(--color-accent)' : undefined,
                                            borderColor: isActive ? 'var(--color-accent)' : undefined,
                                            color: isActive ? '#012e1d' : undefined,
                                            fontWeight: isActive ? 700 : undefined,
                                        }}
                                    >
                                        {page}
                                    </button>
                                );
                            })}

                            <button
                                type="button"
                                className={styles.cardAction}
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                style={{ padding: '8px 14px' }}
                            >
                                Siguiente
                            </button>
                        </div>
                    )}
                </div>
                </>
            )}

            {actionMenuOpenId && actionMenuClub && actionMenuPosition && typeof document !== 'undefined' && createPortal(
                <div
                    onClick={(event) => event.stopPropagation()}
                    style={{ position: 'fixed', inset: 0, zIndex: 140, pointerEvents: 'none' }}
                >
                    <div
                        className={styles.menuDropdown}
                        data-club-action-menu="true"
                        style={{
                            position: 'fixed',
                            top: actionMenuPosition.top,
                            left: actionMenuPosition.left,
                            right: 'auto',
                            width: 200,
                            minWidth: 160,
                            transform: 'none',
                            transformOrigin: actionMenuPosition.transformOrigin,
                            zIndex: 141,
                            pointerEvents: 'auto',
                        }}
                    >
                        <button className={styles.menuItem} onClick={() => openCreateDerivedModal(actionMenuClub)}>
                            <Plus size={13} style={{ marginRight: 8 }} /> Crear derivado
                        </button>
                        <div className={styles.menuDivider} />
                        <button
                            className={styles.menuItem}
                            onClick={() => handleToggleVisibility(actionMenuClub)}
                            disabled={togglingId === actionMenuClub.id}
                        >
                            {actionMenuClub.is_visible !== false
                                ? <><EyeOff size={13} style={{ marginRight: 8 }} />Ocultar</>
                                : <><Eye size={13} style={{ marginRight: 8 }} />Mostrar</>}
                        </button>
                        <div className={styles.menuDivider} />
                        <button className={`${styles.menuItem} ${styles.danger}`} onClick={() => handleDelete(actionMenuClub.id, actionMenuClub.name)}>
                            <Trash2 size={13} style={{ marginRight: 8 }} /> Eliminar
                        </button>
                    </div>
                </div>,
                document.body,
            )}

            {derivedBaseClub && (
                <div
                    onClick={closeCreateDerivedModal}
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
                            width: 'min(640px, 100%)',
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
                                Club derivado
                            </span>
                            <h3 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#fff' }}>
                                {derivedBaseClub.name}
                            </h3>
                            <p style={{ margin: 0, color: 'var(--basalt-400)', lineHeight: 1.55 }}>
                                Abrimos el formulario con la identidad del club base para que solo completes el diferencial de la nueva rama.
                            </p>
                        </div>

                        <div style={{ display: 'grid', gap: 12 }}>
                            {(Object.keys(CLUB_DERIVATIVE_LABELS) as ClubDerivativeType[]).map((option) => {
                                const isActive = derivedType === option;
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => setDerivedType(option)}
                                        style={{
                                            textAlign: 'left',
                                            background: isActive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.55)' : 'rgba(255,255,255,0.08)'}`,
                                            borderRadius: 14,
                                            padding: '14px 16px',
                                            color: '#fff',
                                            cursor: 'pointer',
                                            display: 'grid',
                                            gap: 4,
                                        }}
                                    >
                                        <strong style={{ fontSize: 15 }}>{CLUB_DERIVATIVE_LABELS[option]}</strong>
                                        <span style={{ fontSize: 13, color: 'var(--basalt-400)', lineHeight: 1.45 }}>
                                            {CLUB_DERIVATIVE_DESCRIPTIONS[option]}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {derivedType === 'other_sport' && (
                            <div style={{ display: 'grid', gap: 8 }}>
                                <label style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--basalt-400)' }}>
                                    Deporte del derivado
                                </label>
                                <select
                                    value={derivedSport}
                                    onChange={(event) => setDerivedSport(event.target.value)}
                                    style={{
                                        width: '100%',
                                        background: '#0f1217',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 12,
                                        color: '#fff',
                                        padding: '12px 14px',
                                        fontSize: 14,
                                    }}
                                >
                                    {ACTIVE_SPORTS.map((sport) => (
                                        <option key={sport.id} value={sport.id}>
                                            {sport.nameEs}
                                        </option>
                                    ))}
                                </select>
                                <span style={{ fontSize: 12, color: derivedSportMatchesBase ? '#f59e0b' : 'var(--basalt-400)' }}>
                                    {derivedSportMatchesBase
                                        ? 'Elegí un deporte distinto al del club base para que la vista publica pueda diferenciarlo.'
                                        : `La vista publica priorizara esta rama cuando el usuario llegue desde ${getSportDisplayName(derivedSport) || 'ese deporte'}.`}
                                </span>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 12, color: 'var(--basalt-400)', lineHeight: 1.5 }}>
                                Se precargan nombre, union, ubicacion y branding.
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <button type="button" className={styles.cardAction} onClick={closeCreateDerivedModal}>
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                                    onClick={handleCreateDerivedClub}
                                    disabled={derivedType === 'other_sport' && derivedSportMatchesBase}
                                >
                                    <Plus size={13} style={{ marginRight: 6 }} /> Abrir formulario
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
