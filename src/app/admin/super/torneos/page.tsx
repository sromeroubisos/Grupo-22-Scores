'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Trash2, Eye, EyeOff, Link2, MoreVertical, Plus, RefreshCw, Star, StarOff, Users, Hash, Upload } from 'lucide-react';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { createClient } from '@/lib/supabase/client';
import { invalidateCache } from '@/lib/cache/superAdminCache';
import type { TournamentUpdate } from '@/lib/services/tournamentService';
import { normalizeError } from '@/lib/utils/errorUtils';
import { compareTournamentsByPriority } from '@/lib/utils/tournamentOrdering';
import { deleteManySuperTournaments, deleteSuperTournament, updateManySuperTournamentsMeta, updateSuperTournamentMeta } from './actions';

// ─── Constants ────────────────────────────────────────────────────────────────

const SEASONS = ['2026', '2025', '2024'];

const STATUS_LABELS: Record<string, string> = {
    draft: 'Borrador', published: 'Publicado', archived: 'Archivado', active: 'Activo',
};

const STATUS_STYLES: Record<string, string> = {
    draft: styles.badgeArchived, published: styles.badgeActive,
    active: styles.badgeActive, archived: styles.badgeArchived,
};

const countryFlags: Record<string, string> = {
    Argentina: '🇦🇷', Uruguay: '🇺🇾', Chile: '🇨🇱', Paraguay: '🇵🇾', Brazil: '🇧🇷',
    'South Africa': '🇿🇦', England: '🏴󠁧󠁢󠁿', France: '🇫🇷', Italy: '🇮🇹', Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', Wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
    Ireland: '🇮🇪', Australia: '🇦🇺', 'New Zealand': '🇳🇿', USA: '🇺🇸', Canada: '🇨🇦',
    Spain: '🇪🇸', Portugal: '🇵🇹', Japan: '🇯🇵', Fiji: '🇫🇯', Samoa: '🇼🇸', Tonga: '🇹🇴',
    Georgia: '🇬🇪', Romania: '🇷🇴', Namibia: '🇳🇦',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

type TopClubRow = {
    id: string;
    name: string;
    logo_url: string | null;
    primary_color: string | null;
    followers_count: number;
};

export default function SuperadminTorneosPage() {
    const { filters, setFilters, tournaments: rawTournaments, unions, loading, errors, refresh } = useSuperConsole();
    const isLoading = loading.tournaments;
    const error = errors.tournaments;
    const supabase = createClient();

    const [seasonFilter, setSeasonFilter] = useState('all');
    const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);
    const [linkingTournamentIds, setLinkingTournamentIds] = useState<string[]>([]);
    const [selectedUnionId, setSelectedUnionId] = useState('');
    const [bulkActionLabel, setBulkActionLabel] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
    
    // Performance: local state for instant toggles
    const [localMetadata, setLocalMetadata] = useState<Record<string, { status?: string, is_visible?: boolean, is_popular?: boolean, priority?: number }>>({});
    const [priorityDrafts, setPriorityDrafts] = useState<Record<string, string>>({});
    const [topClubsByFollowers, setTopClubsByFollowers] = useState<TopClubRow[]>([]);

    const loadTopClubsByFollowers = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/super/top-clubs', {
                cache: 'no-store',
                credentials: 'include',
            });
            const payload = await response.json() as {
                data?: TopClubRow[];
                error?: string;
                details?: unknown;
            };

            if (!response.ok) {
                const detail = typeof payload?.details === 'string' ? payload.details : null;
                throw new Error(detail ? `${payload?.error || 'Failed to load top clubs'}: ${detail}` : (payload?.error || 'Failed to load top clubs'));
            }

            setTopClubsByFollowers(Array.isArray(payload.data) ? payload.data : []);
        } catch (loadError) {
            console.error('[SuperadminTorneosPage] Failed to load top clubs:', loadError);
            setTopClubsByFollowers([]);
        }
    }, []);

    useEffect(() => {
        void loadTopClubsByFollowers();
    }, [loadTopClubsByFollowers]);

    // ── Enriched Data ─────────────────────────────────────────────────────────

    const tournaments = useMemo(() => {
        return rawTournaments
            .filter(t => !deletedIds.has(t.id))
            .map(t => {
                const local = localMetadata[t.id] || {};
                
                // 1. Better source detection
                const source = t.is_api_managed ? 'API' : 'Manual';
                
                // 2. Clear country normalization for consistent grouping
                const rawCountry = t.country_name?.trim() || 'Global';
                const countryName = rawCountry === 'Global' ? 'Global' : 
                    rawCountry.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
                
                return { 
                    ...t, 
                    status: local.status ?? t.status,
                    is_visible: local.is_visible ?? t.is_visible,
                    is_popular: local.is_popular ?? t.is_popular,
                    priority: local.priority ?? t.priority ?? 0,
                    source, 
                    groupKey: countryName 
                };
            });
    }, [rawTournaments, deletedIds, localMetadata]);

    // ── Filters ───────────────────────────────────────────────────────────────

    const filtered = useMemo(() => tournaments.filter(t => {
        if (filters.sport !== 'all' && t.sport_id !== filters.sport) return false;
        if (filters.status !== 'all' && t.status !== filters.status) return false;
        if (filters.country !== 'all' && t.groupKey !== filters.country) return false;
        
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            const matchesName = t.name.toLowerCase().includes(searchLower);
            const matchesDisplayName = t.display_name?.toLowerCase().includes(searchLower);
            const matchesOriginalName = t.original_name?.toLowerCase().includes(searchLower);
            const matchesCountry = t.groupKey.toLowerCase().includes(searchLower);
            if (!matchesName && !matchesDisplayName && !matchesOriginalName && !matchesCountry) return false;
        }
        
        if (filters.source !== 'all' && t.source !== filters.source) return false;
        if (seasonFilter !== 'all' && t.season_id !== seasonFilter) return false;
        return true;
    }), [tournaments, filters, seasonFilter]);

    const filteredIds = useMemo(() => filtered.map((t) => t.id), [filtered]);
    const selectedCount = selectedIds.size;
    const allVisibleSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
    const isBulkBusy = bulkActionLabel !== null;
    const linkingTournamentCount = linkingTournamentIds.length;

    const grouped = useMemo(() => {
        const groups = filtered.reduce<Record<string, typeof filtered>>((acc, t) => {
            const key = t.groupKey;
            if (!acc[key]) acc[key] = [];
            acc[key].push(t);
            return acc;
        }, {});

        return Object.keys(groups)
            .sort((a, b) => {
                if (a === 'Global') return 1;
                if (b === 'Global') return -1;
                return a.localeCompare(b);
            })
            .reduce<Record<string, typeof filtered>>((acc, key) => {
                acc[key] = [...groups[key]].sort(compareTournamentsByPriority);
                return acc;
            }, {});
    }, [filtered]);

    const availableCountries = useMemo(() => {
        const countries = new Set(tournaments.map(t => t.groupKey));
        return Array.from(countries).sort((a, b) => {
            if (a === 'Global') return 1;
            if (b === 'Global') return -1;
            return a.localeCompare(b);
        });
    }, [tournaments]);

    useEffect(() => {
        const filteredIdSet = new Set(filteredIds);

        setSelectedIds((prev) => {
            if (prev.size === 0) return prev;

            const next = new Set(Array.from(prev).filter((id) => filteredIdSet.has(id)));
            if (next.size === prev.size && Array.from(next).every((id) => prev.has(id))) {
                return prev;
            }

            return next;
        });
    }, [filteredIds]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const toggleTournamentSelection = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleSelectAllVisible = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                filteredIds.forEach((id) => next.delete(id));
            } else {
                filteredIds.forEach((id) => next.add(id));
            }
            return next;
        });
    };

    const clearSelection = () => setSelectedIds(new Set());

    const removeIdsFromSelection = (ids: string[]) => {
        setSelectedIds((prev) => {
            if (prev.size === 0) return prev;

            const next = new Set(prev);
            let changed = false;

            ids.forEach((id) => {
                if (next.delete(id)) changed = true;
            });

            return changed ? next : prev;
        });
    };

    const openLinkModalForIds = (ids: string[]) => {
        if (ids.length === 0) return;
        setLinkingTournamentIds(Array.from(new Set(ids)));
        setSelectedUnionId('');
    };

    const closeLinkModal = () => {
        setLinkingTournamentIds([]);
        setSelectedUnionId('');
    };

    const applyLocalBulkMetadata = (ids: string[], updates: Partial<TournamentUpdate>) => {
        const localOnlyUpdates = {
            status: updates.status,
            is_visible: updates.is_visible,
            is_popular: updates.is_popular,
            priority: typeof updates.priority === 'number' ? updates.priority : undefined,
        };

        if (Object.values(localOnlyUpdates).every((value) => value === undefined)) {
            return;
        }

        setLocalMetadata((prev) => {
            const next = { ...prev };
            ids.forEach((id) => {
                next[id] = { ...(next[id] || {}), ...localOnlyUpdates };
            });
            return next;
        });
    };

    const handleBulkUpdate = async (
        updates: Partial<TournamentUpdate>,
        actionLabel: string,
        successMessage: string
    ) => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;

        setBulkActionLabel(actionLabel);

        try {
            await updateManySuperTournamentsMeta(ids, updates);
            applyLocalBulkMetadata(ids, updates);
            invalidateCache('tournaments_list');
            removeIdsFromSelection(ids);
            refresh('tournaments');
            alert(successMessage);
        } catch (err: unknown) {
            const normalized = normalizeError(err);
            alert('Error en la accion masiva: ' + (normalized.message || 'Error inesperado'));
            refresh('tournaments');
        } finally {
            setBulkActionLabel(null);
        }
    };

    const handleUpdateMeta = async (id: string, updates: Partial<TournamentUpdate>) => {
        // Find the full tournament object for logging
        const tournament = tournaments.find(t => t.id === id);
        const previousLocalMetadata = localMetadata[id];
        console.log('[SuperadminTorneosPage] USER CLICK - Update triggered:', {
            id,
            request_keys: Object.keys(updates),
            full_tournament: tournament
        });
        
        setLocalMetadata(prev => ({
            ...prev,
            [id]: { ...(prev[id] || {}), ...updates }
        }));

        try {
            const result = await updateSuperTournamentMeta(id, updates);
            if (!result && Object.keys(updates).length > 0) {
                console.warn('[SuperadminTorneosPage] Update discarded (all fields were invalid/filtered)', Object.keys(updates));
            } else {
                invalidateCache('tournaments_list');
            }
        } catch (err: unknown) {
            setLocalMetadata(prev => {
                const next = { ...prev };
                if (previousLocalMetadata) {
                    next[id] = previousLocalMetadata;
                } else {
                    delete next[id];
                }
                return next;
            });
            console.error('[SuperadminTorneosPage] Update failed:', err);
            const normalized = normalizeError(err);
            const msg = normalized.message || 'Error inesperado';
            const code = normalized.code ? ` (Código: ${normalized.code})` : '';
            alert('Error al actualizar: ' + msg + code);
            refresh('tournaments');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Seguro que deseas eliminar este torneo?')) return;
        setDeletedIds(prev => new Set([...prev, id]));
        try {
            await deleteSuperTournament(id);
        } catch (err: unknown) {
            setDeletedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
            const normalized = normalizeError(err);
            alert('Error al eliminar: ' + (normalized.message || 'Error inesperado'));
            return;
        }
        removeIdsFromSelection([id]);
        invalidateCache('tournaments_list');
        refresh('tournaments');
    };

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        if (!confirm(`Â¿Seguro que deseas eliminar ${ids.length} torneo${ids.length !== 1 ? 's' : ''}?`)) return;

        setBulkActionLabel('Eliminando');
        setDeletedIds((prev) => new Set([...prev, ...ids]));

        try {
            await deleteManySuperTournaments(ids);
            invalidateCache('tournaments_list');
            removeIdsFromSelection(ids);
            refresh('tournaments');
            alert(`Se eliminaron ${ids.length} torneo${ids.length !== 1 ? 's' : ''}.`);
        } catch (err: unknown) {
            setDeletedIds((prev) => {
                const next = new Set(prev);
                ids.forEach((targetId) => next.delete(targetId));
                return next;
            });

            const normalized = normalizeError(err);
            alert('Error al eliminar en lote: ' + (normalized.message || 'Error inesperado'));
        } finally {
            setBulkActionLabel(null);
        }
    };

    const handleLogoUpload = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${id}-${Math.random()}.${fileExt}`;
            const filePath = `logos/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('tournaments')
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('tournaments')
                .getPublicUrl(filePath);

            await updateSuperTournamentMeta(id, { logo_url: publicUrl });
            invalidateCache('tournaments_list');
            alert('Logo actualizado con éxito');
            refresh('tournaments');
        } catch (err: unknown) {
            const normalized = normalizeError(err);
            alert('Error al subir logo: ' + (normalized.message || 'Error inesperado'));
        }
    };

    const confirmLink = async () => {
        if (linkingTournamentIds.length === 0 || !selectedUnionId) return;

        setBulkActionLabel(linkingTournamentIds.length > 1 ? 'Vinculando' : 'Vinculando torneo');

        try {
            await updateManySuperTournamentsMeta(linkingTournamentIds, { union_id: selectedUnionId });
            invalidateCache('tournaments_list');
            refresh('tournaments');
            removeIdsFromSelection(linkingTournamentIds);
            alert(linkingTournamentIds.length === 1
                ? 'Organizacion vinculada correctamente.'
                : `Se vincularon ${linkingTournamentIds.length} torneos correctamente.`);
            closeLinkModal();
        } catch (err: unknown) {
            const normalized = normalizeError(err);
            alert('Error: ' + (normalized.message || 'Error inesperado'));
        } finally {
            setBulkActionLabel(null);
        }
    };

    const toggleActionMenu = (id: string) =>
        setActionMenuOpenId(prev => prev === id ? null : id);

    const handlePriorityCommit = async (id: string) => {
        const draftValue = priorityDrafts[id];
        if (draftValue === undefined) return;

        const parsedValue = Number.parseInt(draftValue, 10);
        const nextPriority = Number.isFinite(parsedValue) ? Math.trunc(parsedValue) : 0;
        const currentPriority = tournaments.find((t) => t.id === id)?.priority ?? 0;

        if (nextPriority === currentPriority) {
            setPriorityDrafts(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
            return;
        }

        await handleUpdateMeta(id, { priority: nextPriority });
        setPriorityDrafts(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    // ── Top clubs by followers ────────────────────────────────────────────────

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div style={{ paddingBottom: 40, position: 'relative' }}>
            {/* Header */}
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Torneos</div>
                    <div className={styles.consoleSubtitle}>
                        Gestión global de competiciones · {rawTournaments.length} torneos registrados
                    </div>
                </div>
                <div className={styles.consoleActions}>
                    <button className={styles.cardAction} onClick={() => refresh('tournaments')} disabled={isLoading}>
                        <RefreshCw size={14} style={{ marginRight: 6, animation: isLoading ? 'spin 2s linear infinite' : 'none' }} />
                        Refrescar
                    </button>
                    <Link href="/admin/super/torneos/crear" className={`${styles.cardAction} ${styles.cardActionPrimary}`}>
                        <Plus size={14} style={{ marginRight: 6 }} /> Nuevo Torneo
                    </Link>
                </div>
            </div>

            {/* Filter bar */}
            <div className={styles.filterBar} style={{ gap: 16 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                    <input
                        type="text"
                        className={styles.filterControl}
                        placeholder="Buscar por nombre o país..."
                        value={filters.search}
                        onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span className={styles.filterLabel}>Deporte</span>
                    <select
                        className={styles.filterControl}
                        value={filters.sport}
                        onChange={e => setFilters(prev => ({ ...prev, sport: e.target.value }))}
                    >
                        <option value="all">Todos</option>
                        {/* We could fetch unique sports from tournament list or constant */}
                        <option value="rugby">Rugby</option>
                        <option value="football">Fútbol</option>
                        <option value="hockey">Hockey</option>
                    </select>

                    <span className={styles.filterLabel}>País</span>
                    <select
                        className={styles.filterControl}
                        value={filters.country}
                        onChange={e => setFilters(prev => ({ ...prev, country: e.target.value }))}
                    >
                        <option value="all">Ver todos</option>
                        {availableCountries.map(c => (
                            <option key={c} value={c}>
                                {countryFlags[c] || '🌐'} {c}
                            </option>
                        ))}
                    </select>

                    <span className={styles.filterLabel}>Temporada</span>
                    <select
                        className={styles.filterControl}
                        value={seasonFilter}
                        onChange={e => setSeasonFilter(e.target.value)}
                    >
                        <option value="all">Todas</option>
                        {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <span className={styles.filterLabel}>Origen</span>
                    <select
                        className={styles.filterControl}
                        value={filters.source}
                        onChange={e => setFilters(prev => ({ ...prev, source: e.target.value }))}
                    >
                        <option value="all">Todos</option>
                        <option value="API">API (Gestor Externo)</option>
                        <option value="Manual">Manual (Locales)</option>
                    </select>
                </div>
            </div>

            {!isLoading && !error && filtered.length > 0 && (
                <div className={styles.slab} style={{ marginBottom: 20, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Seleccion masiva</div>
                            <div style={{ fontSize: 12, color: '#a1a1aa' }}>
                                {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''} de {filtered.length} torneo{filtered.length !== 1 ? 's' : ''} filtrado{filtered.length !== 1 ? 's' : ''}
                                {bulkActionLabel ? ` · ${bulkActionLabel}...` : ''}
                            </div>
                        </div>

                        <div className={styles.consoleActions}>
                            <button className={styles.cardAction} onClick={toggleSelectAllVisible} disabled={isBulkBusy || filtered.length === 0}>
                                {allVisibleSelected ? 'Quitar visibles' : 'Seleccionar visibles'}
                            </button>
                            <button className={styles.cardAction} onClick={clearSelection} disabled={isBulkBusy || selectedCount === 0}>
                                Limpiar seleccion
                            </button>
                        </div>
                    </div>

                    <div className={styles.consoleActions}>
                        <button
                            className={styles.cardAction}
                            onClick={() => handleBulkUpdate({ status: 'published' }, 'Activando torneos', 'Torneos activados correctamente.')}
                            disabled={isBulkBusy || selectedCount === 0}
                        >
                            <Eye size={14} /> Activar
                        </button>
                        <button
                            className={styles.cardAction}
                            onClick={() => handleBulkUpdate({ status: 'draft' }, 'Desactivando torneos', 'Torneos desactivados correctamente.')}
                            disabled={isBulkBusy || selectedCount === 0}
                        >
                            <EyeOff size={14} /> Desactivar
                        </button>
                        <button
                            className={styles.cardAction}
                            onClick={() => handleBulkUpdate({ is_popular: true }, 'Marcando populares', 'Torneos marcados como populares.')}
                            disabled={isBulkBusy || selectedCount === 0}
                        >
                            <Star size={14} /> Popular
                        </button>
                        <button
                            className={styles.cardAction}
                            onClick={() => handleBulkUpdate({ is_popular: false }, 'Quitando populares', 'Se quitaron los torneos de populares.')}
                            disabled={isBulkBusy || selectedCount === 0}
                        >
                            <StarOff size={14} /> Quitar popular
                        </button>
                        <button
                            className={styles.cardAction}
                            onClick={() => openLinkModalForIds(Array.from(selectedIds))}
                            disabled={isBulkBusy || selectedCount === 0}
                        >
                            <Link2 size={14} /> Vincular org
                        </button>
                        <button
                            className={styles.cardAction}
                            onClick={handleBulkDelete}
                            disabled={isBulkBusy || selectedCount === 0}
                        >
                            <Trash2 size={14} /> Eliminar
                        </button>
                    </div>
                </div>
            )}

            {/* States */}
            {isLoading && <div style={{ padding: 20 }}>Cargando torneos...</div>}
            {!isLoading && error && (
                <div style={{ padding: '16px 20px', color: '#f87171', background: '#2a0a0a', borderRadius: 8, margin: '0 20px' }}>
                    ⚠ {error}
                </div>
            )}

            {!isLoading && !error && Object.keys(grouped).length === 0 && (
                <div className={styles.cardItem} style={{ margin: '20px', textAlign: 'center', color: '#888' }}>
                    No se encontraron torneos con los filtros actuales.
                </div>
            )}

            {/* Grouped list */}
            {!isLoading && !error && Object.entries(grouped).map(([country, items]) => (
                <section key={country} className={styles.groupSection}>
                    <div className={styles.groupHeader} style={{ justifyContent: 'flex-start', gap: 12 }}>
                        <span className={styles.groupFlag} style={{ fontSize: '1.4em' }}>{countryFlags[country] || '🌐'}</span>
                        <span className={styles.groupTitle} style={{ fontSize: '1.2em', fontWeight: 800 }}>{country}</span>
                        <span className={styles.groupMeta} style={{ opacity: 0.6 }}>({items.length} torneo{items.length !== 1 ? 's' : ''})</span>
                    </div>
                    <div className={styles.cardGrid}>
                        {items.map(t => (
                            <div key={t.id} className={styles.cardItem} style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                                <div className={styles.cardHeader}>
                                    <label
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 2, cursor: 'pointer' }}
                                        title="Seleccionar torneo"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(t.id)}
                                            onChange={() => toggleTournamentSelection(t.id)}
                                            disabled={isBulkBusy}
                                            aria-label={`Seleccionar ${(t.display_name || t.name).trim()}`}
                                            style={{ width: 16, height: 16, accentColor: 'var(--color-accent)', cursor: 'pointer' }}
                                        />
                                    </label>
                                    <div className={styles.cardLogo} style={{ position: 'relative' }}>
                                        {t.logo_url ? (
                                            <img src={t.logo_url} alt={t.name} style={{ width: 40, height: 40, objectFit: 'contain' }} />
                                        ) : '🏆'}
                                        <label className={styles.logoEditOverlay}>
                                            <input type="file" hidden accept="image/*" onChange={(e) => handleLogoUpload(t.id, e)} />
                                            <Upload size={12} />
                                        </label>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className={styles.cardTitle}>
                                            {t.display_name || t.name}
                                            {t.is_api_managed && (
                                                <span className={`${styles.badge} ${styles.badgeApi}`} style={{ marginLeft: 8, verticalAlign: 'middle' }}>
                                                    API
                                                </span>
                                            )}
                                        </div>
                                        <div className={styles.cardContext}>
                                            <span className={styles.contextLinePrimary}>
                                                {t.season_id} · {t.sport_name || t.sport_id || 'N/A'}
                                                {t.category ? ` · ${t.category}` : ''}
                                            </span>
                                            <span className={styles.contextLineSecondary}>
                                                Org: {t.organization_name || 'Sin vínculo'}
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>

                                        <div style={{ position: 'relative' }}>
                                            <button
                                                className={`${styles.moreMenuBtn} ${t.is_popular ? styles.starActive : ''}`}
                                                style={{ marginRight: 4, color: t.is_popular ? '#facc15' : 'rgba(255,255,255,0.2)' }}
                                                onClick={() => handleUpdateMeta(t.id, { is_popular: !t.is_popular })}
                                                title={t.is_popular ? "Quitar de populares" : "Marcar como popular"}
                                            >
                                                {t.is_popular ? <Star size={16} fill="currentColor" /> : <StarOff size={16} />}
                                            </button>

                                            <button
                                                className={styles.moreMenuBtn}
                                                onClick={e => { e.stopPropagation(); toggleActionMenu(t.id); }}
                                            >
                                                <MoreVertical size={16} />
                                            </button>

                                            {actionMenuOpenId === t.id && (
                                                <div className={styles.menuDropdown}>
                                                    <button
                                                        className={styles.menuItem}
                                                        onClick={() => { 
                                                            const newStatus = t.status === 'published' ? 'draft' : 'published';
                                                            handleUpdateMeta(t.id, { status: newStatus }); 
                                                            setActionMenuOpenId(null); 
                                                        }}
                                                    >
                                                        {t.status === 'published'
                                                            ? <><EyeOff size={14} style={{ marginRight: 8 }} /> Desactivar</>
                                                            : <><Eye size={14} style={{ marginRight: 8 }} /> Activar</>}
                                                    </button>

                                                    <button
                                                        className={styles.menuItem}
                                                        onClick={() => { openLinkModalForIds([t.id]); setActionMenuOpenId(null); }}
                                                    >
                                                        🔗 Vincular Org/Unión
                                                    </button>

                                                    <div className={styles.menuDivider} />

                                                    <button
                                                        className={`${styles.menuItem} ${styles.danger}`}
                                                        onClick={() => { handleDelete(t.id); setActionMenuOpenId(null); }}
                                                    >
                                                        <Trash2 size={14} style={{ marginRight: 8 }} />
                                                        Eliminar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Stats & Metadata Row */}
                                <div className={styles.statsRow} style={{ display: 'flex', gap: 12, marginTop: 12, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#aaa' }}>
                                        <Users size={14} />
                                        <span>{t.followers_count || 0} seguidores</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#aaa' }}>
                                        <Hash size={14} />
                                        <span>Prioridad: </span>
                                        <input 
                                            type="number" 
                                            value={priorityDrafts[t.id] ?? String(t.priority ?? 0)}
                                            title="Mayor número = más prioridad. Si empatan, se ordenan alfabéticamente."
                                            onChange={(e) => setPriorityDrafts(prev => ({ ...prev, [t.id]: e.target.value }))}
                                            onBlur={() => handlePriorityCommit(t.id)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.currentTarget.blur();
                                                }
                                            }}
                                            style={{ width: 56, background: 'transparent', border: '1px solid #333', color: '#fff', borderRadius: 4, padding: '0 4px', fontSize: 11 }}
                                        />
                                    </div>
                                </div>

                                {/* Badges */}
                                <div className={styles.badgeRow}>
                                    <span className={`${styles.badgePill} ${STATUS_STYLES[t.status || ''] || styles.badgeArchived}`}>
                                        {STATUS_LABELS[t.status || ''] || t.status || 'Borrador'}
                                    </span>
                                    <span className={`${styles.badgePill} ${t.source === 'API' ? styles.badgeApiAlt : styles.badgeManualAlt}`}>
                                        {t.source}
                                    </span>
                                    {t.is_popular && (
                                        <span className={`${styles.badgePill} ${styles.badgePopular}`}>
                                            Popular
                                        </span>
                                    )}
                                    {!t.is_active && (
                                        <span className={`${styles.badgePill} ${styles.badgeArchived}`}>Inactivo</span>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className={styles.cardActions}>
                                    <Link href={`/admin/entities/${t.id}/manage?type=tournament`} className={styles.actionBtn}>
                                        Configurar Detalles
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ))}

            {/* Link Union Modal */}
            {linkingTournamentCount > 0 && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
                }}>
                    <div style={{
                        background: '#0b1016', border: '1px solid rgba(255,255,255,0.1)',
                        padding: 24, borderRadius: 12, minWidth: 320, maxWidth: 400
                    }}>
                        <h3 style={{ margin: '0 0 8px', color: 'white' }}>Vincular Organización</h3>
                        <p style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
                            Selecciona una unión o entidad para vincular {linkingTournamentCount === 1 ? 'este torneo' : `estos ${linkingTournamentCount} torneos`}.
                        </p>
                        <select
                            value={selectedUnionId}
                            onChange={e => setSelectedUnionId(e.target.value)}
                            style={{ width: '100%', padding: 12, borderRadius: 6, background: '#1a1d24', border: '1px solid #333', color: 'white', marginBottom: 20 }}
                        >
                            <option value="">Seleccionar Organización...</option>
                            {unions.map(u => (
                                <option key={u.id} value={u.id}>{u.name}{u.country ? ` (${u.country})` : ''}</option>
                            ))}
                        </select>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button
                                onClick={closeLinkModal}
                                style={{ background: 'transparent', border: '1px solid #333', color: '#ccc', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmLink}
                                disabled={!selectedUnionId || isBulkBusy}
                                style={{
                                    background: selectedUnionId && !isBulkBusy ? '#22c55e' : '#333',
                                    border: 'none', color: selectedUnionId && !isBulkBusy ? 'black' : '#666',
                                    padding: '8px 16px', borderRadius: 6,
                                    cursor: selectedUnionId && !isBulkBusy ? 'pointer' : 'not-allowed',
                                    fontWeight: 600
                                }}
                            >
                                {isBulkBusy ? 'Vinculando...' : 'Vincular'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Top clubs by followers */}
            <div className={styles.slab} style={{ marginTop: 32, padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Users size={15} style={{ color: '#a1a1aa' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Clubes por seguidores
                    </span>
                </div>
                {topClubsByFollowers.length === 0 ? (
                    <div style={{ color: 'var(--basalt-400)', fontSize: 13 }}>Sin datos de seguidores aún.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {topClubsByFollowers.map((club, idx) => (
                            <div key={club.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--surface-edge)' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--basalt-500)', minWidth: 20, textAlign: 'right' }}>
                                    {idx + 1}
                                </span>
                                {club.logo_url ? (
                                    <img
                                        src={club.logo_url.trimStart().startsWith('<svg')
                                            ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(club.logo_url)))}`
                                            : club.logo_url}
                                        alt={club.name}
                                        style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                ) : (
                                    <div style={{ width: 24, height: 24, borderRadius: 4, background: club.primary_color || '#3f3f46', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>
                                        {club.name.substring(0, 2).toUpperCase()}
                                    </div>
                                )}
                                <span style={{ flex: 1, fontSize: 13, color: '#e4e4e7', fontWeight: 500 }}>{club.name}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#a1a1aa' }}>
                                    <Users size={12} />
                                    {club.followers_count}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
