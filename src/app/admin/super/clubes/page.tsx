'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { Eye, EyeOff, MoreVertical, Pencil, Trash2, Plus, RefreshCw, MapPin, Shield } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { invalidateCache, type ClubWithUnion } from '@/lib/cache/superAdminCache';
import { useState } from 'react';

function ClubLogo({ logo, name, color }: { logo?: string | null; name: string; color?: string | null }) {
    if (logo && (logo.startsWith('http') || logo.startsWith('/'))) {
        return (
            <img
                src={logo} alt={name}
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

export default function SuperadminClubesPage() {
    // ─── Read from shared context (already prefetched by layout) ─────────────────
    const { filters, clubs, loading, errors, refresh, setFilters: _setFilters } = useSuperConsole();
    const isLoading = loading.clubs;
    const errorMsg = errors.clubs;

    const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Local state for optimistic mutations (avoid full context refresh unless needed)
    const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<ClubWithUnion>>>({});
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

    const supabase = createClient();

    const handleToggleVisibility = async (club: ClubWithUnion) => {
        setTogglingId(club.id);
        setActionMenuOpenId(null);
        const currentVal = localOverrides[club.id]?.visibility ?? club.visibility;
        const newVal = currentVal === 'hidden' ? 'visible' : 'hidden';
        // Optimistic update
        setLocalOverrides(prev => ({ ...prev, [club.id]: { ...prev[club.id], visibility: newVal } }));
        try {
            const { error } = await supabase.from('clubs').update({ visibility: newVal } as any).eq('id', club.id);
            if (error) throw error;
            invalidateCache('clubs_list');
        } catch (err: any) {
            // Revert
            setLocalOverrides(prev => ({ ...prev, [club.id]: { ...prev[club.id], visibility: currentVal } }));
            alert(`Error: ${err.message}`);
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
        } catch (err: any) {
            alert(`Error al eliminar: ${err.message}`);
        } finally {
            setDeletingId(null);
        }
    };

    // Apply optimistic overrides + deleted filter
    const displayClubs = useMemo(() => clubs
        .filter(c => !deletedIds.has(c.id))
        .map(c => ({ ...c, ...(localOverrides[c.id] ?? {}) }))
        , [clubs, deletedIds, localOverrides]);

    const filtered = useMemo(() => displayClubs.filter(club => {
        if (filters.search && !club.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (filters.country !== 'all' && club.country !== filters.country) return false;
        return true;
    }), [displayClubs, filters.search, filters.country]);

    const visibleCount = filtered.filter(c => c.visibility !== 'hidden').length;
    const hiddenCount = filtered.filter(c => c.visibility === 'hidden').length;

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
                <div className={styles.slab} style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--surface-edge)' }}>
                                {['Club', 'Ciudad / País', 'Unión', 'Color', 'Visibilidad', 'Acciones'].map(h => (
                                    <th key={h} style={{
                                        padding: '12px 16px', textAlign: 'left',
                                        fontFamily: 'var(--font-mono)', fontSize: 10,
                                        color: 'var(--basalt-400)', textTransform: 'uppercase', letterSpacing: '0.07em',
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(club => {
                                const isVisible = club.visibility !== 'hidden';
                                return (
                                    <tr
                                        key={club.id}
                                        style={{ borderBottom: '1px solid var(--surface-edge)', opacity: deletingId === club.id ? 0.4 : 1, transition: 'opacity 0.2s' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ width: 36, height: 36, borderRadius: 6, border: '1px solid var(--surface-edge)', background: 'var(--basalt-800)', overflow: 'hidden', flexShrink: 0 }}>
                                                    <ClubLogo logo={club.logo_url} name={club.name} color={club.primary_color} />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: '#ececec' }}>{club.name}</div>
                                                    {club.short_name && <div style={{ fontSize: 11, color: 'var(--basalt-400)', fontFamily: 'var(--font-mono)' }}>{club.short_name}</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--basalt-400)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                                <MapPin size={11} />
                                                {[club.city, club.region, club.country].filter(Boolean).join(', ') || '—'}
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
                                                    <button className={styles.moreMenuBtn} onClick={() => setActionMenuOpenId(prev => prev === club.id ? null : club.id)}>
                                                        <MoreVertical size={14} />
                                                    </button>
                                                    {actionMenuOpenId === club.id && (
                                                        <div className={styles.menuDropdown} style={{ right: 0, top: '100%', minWidth: 160 }}>
                                                            <button className={styles.menuItem} onClick={() => handleToggleVisibility(club)} disabled={togglingId === club.id}>
                                                                {isVisible
                                                                    ? <><EyeOff size={13} style={{ marginRight: 8 }} />Ocultar</>
                                                                    : <><Eye size={13} style={{ marginRight: 8 }} />Mostrar</>}
                                                            </button>
                                                            <div className={styles.menuDivider} />
                                                            <button className={`${styles.menuItem} ${styles.danger}`} onClick={() => handleDelete(club.id, club.name)}>
                                                                <Trash2 size={13} style={{ marginRight: 8 }} /> Eliminar
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
