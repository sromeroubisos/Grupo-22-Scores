'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { MoreVertical, Pencil, Trash2, Plus, RefreshCw, Shield, MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { invalidateCache, type UnionRow } from '@/lib/cache/superAdminCache';

export default function UnionesPage() {
    const { filters, unions, loading, errors, refresh } = useSuperConsole();
    const isLoading = loading.unions;
    const errorMsg = errors.unions;

    const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

    const supabase = createClient();

    const handleDelete = async (unionId: string, unionName: string) => {
        setActionMenuOpenId(null);
        if (!confirm(`¿Eliminar la unión "${unionName}"? Esta acción no se puede deshacer.`)) return;
        setDeletingId(unionId);
        try {
            const { error } = await supabase.from('unions').delete().eq('id', unionId);
            if (error) throw error;
            setDeletedIds(prev => new Set([...prev, unionId]));
            invalidateCache('unions_list');
        } catch (err: any) {
            alert(`Error al eliminar: ${err.message}`);
        } finally {
            setDeletingId(null);
        }
    };

    const displayUnions = useMemo(
        () => unions.filter((union) => !deletedIds.has(union.id)),
        [unions, deletedIds],
    );

    const filtered = useMemo(() => displayUnions.filter((union: UnionRow) => {
        if (filters.search && !union.name.toLowerCase().includes(filters.search.toLowerCase()) && !(union.id && union.id.toLowerCase().includes(filters.search.toLowerCase()))) return false;
        if (filters.country && filters.country !== 'all' && union.country !== filters.country) return false;
        return true;
    }), [displayUnions, filters.search, filters.country]);

    return (
        <div style={{ paddingBottom: 40 }} onClick={() => setActionMenuOpenId(null)}>

            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Uniones / Ligas</div>
                    <div className={styles.consoleSubtitle}>
                        {isLoading
                            ? 'Cargando…'
                            : `${filtered.length} uniones`}
                    </div>
                </div>
                <div className={styles.consoleActions}>
                    <button
                        className={styles.cardAction}
                        onClick={() => refresh('unions')}
                        disabled={isLoading}
                        title="Forzar recarga"
                    >
                        <RefreshCw size={13} style={{ marginRight: 4, animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
                        Refrescar
                    </button>
                    <Link href="/admin/super/uniones/crear" prefetch={false} className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}>
                        <Plus size={13} style={{ marginRight: 4 }} /> Crear Unión
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
                    <div>Cargando uniones…</div>
                </div>
            )}

            {!isLoading && filtered.length === 0 && (
                <div className={styles.slab} style={{ padding: 48, textAlign: 'center' }}>
                    <Shield size={36} style={{ marginBottom: 16, opacity: 0.3 }} />
                    <div style={{ color: 'var(--basalt-400)' }}>
                        {unions.length === 0
                            ? 'No hay uniones en la base de datos.'
                            : 'Ninguna unión coincide con los filtros actuales.'}
                    </div>
                </div>
            )}

            {!isLoading && filtered.length > 0 && (
                <div className={styles.slab} style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--surface-edge)' }}>
                                {['Nombre / ID', 'País / Región', 'Deporte', 'Nivel', 'Unión Padre', 'Acciones'].map(h => (
                                    <th key={h} style={{
                                        padding: '12px 16px', textAlign: 'left',
                                        fontFamily: 'var(--font-mono)', fontSize: 10,
                                        color: 'var(--basalt-400)', textTransform: 'uppercase', letterSpacing: '0.07em',
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((union: UnionRow) => {
                                const parentUnion = unions.find((u: UnionRow) => u.id === union.parent_union_id);
                                return (
                                    <tr
                                        key={union.id}
                                        style={{ borderBottom: '1px solid var(--surface-edge)', opacity: deletingId === union.id ? 0.4 : 1, transition: 'opacity 0.2s' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ fontWeight: 600, color: '#ececec' }}>{union.name}</div>
                                            <div style={{ fontSize: 11, color: 'var(--basalt-400)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{union.id.substring(0, 13)}...</div>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--basalt-400)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                                <MapPin size={11} />
                                                {union.country || '—'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                                            <span style={{ color: 'var(--basalt-300)' }}>{union.sport || '—'}</span>
                                        </td>
                                        <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                                            <span style={{ color: 'var(--basalt-300)' }}>{union.union_level || '—'}</span>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            {parentUnion ? (
                                                <span style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--basalt-800)', border: '1px solid var(--surface-edge)', fontSize: 11, fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}>
                                                    {parentUnion.name}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--basalt-600)', fontSize: 12 }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', position: 'relative' }} onClick={e => e.stopPropagation()}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Link href={`/admin/super/uniones/${union.id}`} prefetch={false} className={styles.actionBtn} style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                    <Pencil size={11} /> Gestionar
                                                </Link>
                                                <div style={{ position: 'relative' }}>
                                                    <button className={styles.moreMenuBtn} onClick={() => setActionMenuOpenId(prev => prev === union.id ? null : union.id)}>
                                                        <MoreVertical size={14} />
                                                    </button>
                                                    {actionMenuOpenId === union.id && (
                                                        <div className={styles.menuDropdown} style={{ right: 0, top: '100%', minWidth: 160 }}>
                                                            <button className={`${styles.menuItem} ${styles.danger}`} onClick={() => handleDelete(union.id, union.name)}>
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
