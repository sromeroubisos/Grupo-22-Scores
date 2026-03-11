'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Trash2, Eye, EyeOff, MoreVertical, Plus, RefreshCw } from 'lucide-react';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { createClient } from '@/lib/supabase/client';
import { invalidateCache } from '@/lib/cache/superAdminCache';

// ─── Constants ────────────────────────────────────────────────────────────────

const SEASONS = ['2026', '2025', '2024'];

const STATUS_LABELS: Record<string, string> = {
    draft: 'Borrador', published: 'Publicado', archived: 'Archivado', active: 'Activo',
};

const STATUS_STYLES: Record<string, string> = {
    draft: styles.badgeArchived, published: styles.badgeActive,
    active: styles.badgeActive, archived: styles.badgeArchived,
};

const SPORT_LABELS: Record<string, string> = {
    rugby: 'Rugby', football: 'Fútbol', hockey: 'Hockey',
    basketball: 'Básquet', volleyball: 'Vóley',
};

const countryFlags: Record<string, string> = {
    Argentina: '🇦🇷', Uruguay: '🇺🇾', Chile: '🇨🇱', Paraguay: '🇵🇾', Brazil: '🇧🇷',
    'South Africa': '🇿🇦', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', France: '🇫🇷', Italy: '🇮🇹', Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', Wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
    Ireland: '🇮🇪', Australia: '🇦🇺', 'New Zealand': '🇳🇿', USA: '🇺🇸', Canada: '🇨🇦',
    Spain: '🇪🇸', Portugal: '🇵🇹', Japan: '🇯🇵', Fiji: '🇫🇯', Samoa: '🇼🇸', Tonga: '🇹🇴',
    Georgia: '🇬🇪', Romania: '🇷🇴', Namibia: '🇳🇦',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperadminTorneosPage() {
    // ─── Read from shared context (already prefetched by layout) ─────────────────
    const { filters, setFilters, tournaments: rawTournaments, unions, loading, errors, refresh } = useSuperConsole();
    const isLoading = loading.tournaments;
    const error = errors.tournaments;
    const supabase = createClient(); // only for mutations

    const [seasonFilter, setSeasonFilter] = useState('all');
    const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);
    const [linkingTournamentId, setLinkingTournamentId] = useState<string | null>(null);
    const [selectedUnionId, setSelectedUnionId] = useState('');

    // Optimistic local state — immediate UI feedback before server confirms
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
    const [visibilityOverrides, setVisibilityOverrides] = useState<Map<string, boolean>>(new Map());

    // ── Enriched Data ─────────────────────────────────────────────────────────

    const tournaments = useMemo(() => {
        const unionMap = new Map(unions.map(u => [u.id, u]));
        return rawTournaments
            .filter(t => !deletedIds.has(t.id))
            .map(t => {
                const union = t.union_id ? unionMap.get(t.union_id) : null;
                const source = t.external_id ? 'API' : 'Manual';
                // Prioritize the country field from the tournament itself
                const countryName = t.country || union?.country || 'Global';
                const is_visible = visibilityOverrides.has(t.id) ? visibilityOverrides.get(t.id)! : t.is_visible;
                return { ...t, is_visible, union, source, groupKey: countryName };
            })
            .sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name));
    }, [rawTournaments, unions, deletedIds, visibilityOverrides]);

    // ── Filters ───────────────────────────────────────────────────────────────

    const filtered = useMemo(() => tournaments.filter(t => {
        if (filters.sport !== 'all' && t.sport !== filters.sport) return false;
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
        
        if (seasonFilter !== 'all' && t.season_id !== seasonFilter) return false;
        return true;
    }), [tournaments, filters, seasonFilter]);

    const grouped = useMemo(() => {
        const groups = filtered.reduce<Record<string, typeof filtered>>((acc, t) => {
            const key = t.groupKey;
            if (!acc[key]) acc[key] = [];
            acc[key].push(t);
            return acc;
        }, {});

        // Sort groups: Global last, others alphabetical
        return Object.keys(groups)
            .sort((a, b) => {
                if (a === 'Global') return 1;
                if (b === 'Global') return -1;
                return a.localeCompare(b);
            })
            .reduce<Record<string, typeof filtered>>((acc, key) => {
                acc[key] = groups[key];
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

    // ── Actions ───────────────────────────────────────────────────────────────

    const handleDelete = async (id: string) => {
        if (!confirm('¿Seguro que deseas eliminar este torneo?')) return;
        // Optimistic: hide immediately
        setDeletedIds(prev => new Set([...prev, id]));
        const { error } = await supabase.from('tournaments').delete().eq('id', id);
        if (error) {
            // Revert on failure
            setDeletedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
            alert('Error al eliminar: ' + error.message);
            return;
        }
        invalidateCache('tournaments_list');
        refresh('tournaments');
    };

    const handleToggleVisibility = async (id: string, current: boolean | null) => {
        const next = !current;
        // Optimistic: flip immediately
        setVisibilityOverrides(prev => new Map([...prev, [id, next]]));
        const { error } = await supabase
            .from('tournaments')
            .update({ is_visible: next } as any)
            .eq('id', id);
        if (error) {
            // Revert on failure
            setVisibilityOverrides(prev => { const m = new Map(prev); m.delete(id); return m; });
            alert('Error: ' + error.message);
            return;
        }
        invalidateCache('tournaments_list');
        refresh('tournaments');
    };

    const confirmLink = async () => {
        if (!linkingTournamentId || !selectedUnionId) return;
        const { error } = await supabase
            .from('tournaments')
            .update({ union_id: selectedUnionId })
            .eq('id', linkingTournamentId);
        if (error) { alert('Error: ' + error.message); return; }
        invalidateCache('tournaments_list');
        refresh('tournaments');
        setLinkingTournamentId(null);
    };

    const toggleActionMenu = (id: string) =>
        setActionMenuOpenId(prev => prev === id ? null : id);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div style={{ paddingBottom: 40, position: 'relative' }}>
            {/* Header */}
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Torneos</div>
                    <div className={styles.consoleSubtitle}>
                        Gestión global de competiciones · {rawTournaments.length} torneos
                    </div>
                </div>
                <div className={styles.consoleActions}>
                    <button className={styles.cardAction} onClick={() => refresh('tournaments')} disabled={isLoading}>
                        <RefreshCw size={14} style={{ marginRight: 6, animation: isLoading ? 'spin 2s linear infinite' : 'none' }} />
                        Refrescar
                    </button>
                    <Link href="/admin/entities/new?type=tournament" className={`${styles.cardAction} ${styles.cardActionPrimary}`}>
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
                        {Object.entries(SPORT_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                        ))}
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
                </div>
            </div>

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
                            <div key={t.id} className={styles.cardItem}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardLogo}>
                                        {t.logo_url ? (
                                            <img src={t.logo_url} alt={t.name} style={{ width: 32, height: 32, objectFit: 'contain' }} />
                                        ) : '🏆'}
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
                                                {t.season_id} · {SPORT_LABELS[t.sport || ''] || t.sport || 'N/A'}
                                                {t.category ? ` · ${t.category}` : ''}
                                                {t.age_grade ? ` · ${t.age_grade}` : ''}
                                            </span>
                                            <span className={styles.contextLineSecondary}>
                                                Unión: {t.union?.name || 'Sin vínculo'}
                                                {t.format ? ` · ${t.format}` : ''}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action menu */}
                                    <div style={{ position: 'relative' }}>
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
                                                    onClick={() => { handleToggleVisibility(t.id, t.is_visible); setActionMenuOpenId(null); }}
                                                >
                                                    {t.is_visible
                                                        ? <><EyeOff size={14} style={{ marginRight: 8 }} /> Ocultar</>
                                                        : <><Eye size={14} style={{ marginRight: 8 }} /> Mostrar</>}
                                                </button>

                                                {!t.union_id && (
                                                    <button
                                                        className={`${styles.menuItem} ${styles.warning}`}
                                                        onClick={() => { setLinkingTournamentId(t.id); setActionMenuOpenId(null); }}
                                                    >
                                                        🔗 Vincular Unión
                                                    </button>
                                                )}

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

                                {/* Badges */}
                                <div className={styles.badgeRow}>
                                    <span className={`${styles.badgePill} ${STATUS_STYLES[t.status || ''] || styles.badgeArchived}`}>
                                        {STATUS_LABELS[t.status || ''] || t.status || 'Borrador'}
                                    </span>
                                    <span className={`${styles.badgePill} ${t.source === 'API' ? styles.badgeApiAlt : styles.badgeManualAlt}`}>
                                        {t.source}
                                    </span>
                                    {t.is_visible === false && (
                                        <span className={`${styles.badgePill} ${styles.badgeArchived}`}>Oculto</span>
                                    )}
                                    {t.region && (
                                        <span className={styles.badgePill}>{t.region}</span>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className={styles.cardActions}>
                                    <Link href={`/admin/entities/${t.id}/manage?type=tournament`} className={styles.actionBtn}>
                                        Ver / Editar
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ))}

            {/* Link Union Modal */}
            {linkingTournamentId && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
                }}>
                    <div style={{
                        background: '#0b1016', border: '1px solid rgba(255,255,255,0.1)',
                        padding: 24, borderRadius: 12, minWidth: 320, maxWidth: 400
                    }}>
                        <h3 style={{ margin: '0 0 8px', color: 'white' }}>Vincular Unión</h3>
                        <p style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
                            Selecciona una unión existente para vincular este torneo.
                        </p>
                        <select
                            value={selectedUnionId}
                            onChange={e => setSelectedUnionId(e.target.value)}
                            style={{ width: '100%', padding: 12, borderRadius: 6, background: '#1a1d24', border: '1px solid #333', color: 'white', marginBottom: 20 }}
                        >
                            <option value="">Seleccionar Unión...</option>
                            {unions.map(u => (
                                <option key={u.id} value={u.id}>{u.name}{u.country ? ` (${u.country})` : ''}</option>
                            ))}
                        </select>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setLinkingTournamentId(null)}
                                style={{ background: 'transparent', border: '1px solid #333', color: '#ccc', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmLink}
                                disabled={!selectedUnionId}
                                style={{
                                    background: selectedUnionId ? '#22c55e' : '#333',
                                    border: 'none', color: selectedUnionId ? 'black' : '#666',
                                    padding: '8px 16px', borderRadius: 6,
                                    cursor: selectedUnionId ? 'pointer' : 'not-allowed',
                                    fontWeight: 600
                                }}
                            >
                                Vincular
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
