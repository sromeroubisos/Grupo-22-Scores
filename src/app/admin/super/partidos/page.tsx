'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { RefreshCw, Plus, Radio, CheckCircle, Clock, AlertTriangle, CalendarDays, Trash2 } from 'lucide-react';
import type { MatchRow } from '@/lib/cache/superAdminCache';
import { createClient } from '@/lib/supabase/client';
import { invalidateCache } from '@/lib/cache/superAdminCache';

type MatchStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'suspended';

const STATUS_CONFIG: Record<MatchStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    scheduled: { label: 'Programado', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', icon: <Clock size={10} /> },
    live: { label: 'En Vivo', color: '#f97316', bg: 'rgba(249,115,22,0.15)', icon: <Radio size={10} /> },
    final: { label: 'Finalizado', color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: <CheckCircle size={10} /> },
    postponed: { label: 'Postergado', color: '#eab308', bg: 'rgba(234,179,8,0.1)', icon: <AlertTriangle size={10} /> },
    suspended: { label: 'Suspendido', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: <AlertTriangle size={10} /> },
};

function formatDateTime(iso: string) {
    try { return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return iso; }
}

function TeamAvatar({ logo, name, color }: { logo?: string | null; name: string; color?: string | null }) {
    if (logo && (logo.startsWith('http') || logo.startsWith('/'))) {
        return <img src={logo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />;
    }
    return (
        <div style={{ width: '100%', height: '100%', background: color || '#3f3f46', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>
            {name.substring(0, 2).toUpperCase()}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status as MatchStatus] ?? STATUS_CONFIG.scheduled;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, fontSize: 11, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`, fontFamily: 'var(--font-mono)' }}>
            {cfg.icon} {cfg.label}
        </span>
    );
}

export default function SuperadminPartidosPage() {
    // ─── Read from shared context (already prefetched by layout) ─────────────────
    const { filters, matches, loading, errors, refresh } = useSuperConsole();
    const isLoading = loading.matches;
    const errorMsg = errors.matches;
    const supabase = createClient();

    const [statusFilter, setStatusFilter] = useState<MatchStatus | 'all'>('all');
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

    // Optimistic local state
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
    const [statusOverrides, setStatusOverrides] = useState<Map<string, string>>(new Map());

    const handleDelete = async (id: string) => {
        if (!confirm('¿Seguro que deseas eliminar este partido?')) return;
        setDeletedIds(prev => new Set([...prev, id]));
        const { error } = await supabase.from('matches').delete().eq('id', id);
        if (error) {
            setDeletedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
            alert('Error al eliminar: ' + error.message);
            return;
        }
        invalidateCache('matches_list');
        refresh('matches');
    };

    const handleStatusChange = async (id: string, newStatus: string) => {
        setStatusOverrides(prev => new Map([...prev, [id, newStatus]]));
        const { error } = await supabase.from('matches').update({ status: newStatus }).eq('id', id);
        if (error) {
            setStatusOverrides(prev => { const m = new Map(prev); m.delete(id); return m; });
            alert('Error al actualizar estado: ' + error.message);
            return;
        }
        invalidateCache('matches_list');
        refresh('matches');
    };

    const enrichedMatches = useMemo(() =>
        matches
            .filter(m => !deletedIds.has(m.id))
            .map(m => ({
                ...m,
                status: statusOverrides.has(m.id) ? statusOverrides.get(m.id)! : (m.status ?? 'scheduled'),
            })),
        [matches, deletedIds, statusOverrides]);

    const filtered = useMemo(() => enrichedMatches.filter(m => {
        if (statusFilter !== 'all' && m.status !== statusFilter) return false;
        if (filters.search) {
            const term = filters.search.toLowerCase();
            const text = [m.home_team?.name, m.away_team?.name, m.tournament?.name, m.venue].join(' ').toLowerCase();
            if (!text.includes(term)) return false;
        }
        return true;
    }), [enrichedMatches, statusFilter, filters.search]);

    const grouped = useMemo(() => filtered.reduce<Record<string, Record<string, MatchRow[]>>>((acc, m) => {
        const tournament = m.tournament?.name || 'Sin torneo';
        const round = m.round_id || 'Sin fecha';
        if (!acc[tournament]) acc[tournament] = {};
        if (!acc[tournament][round]) acc[tournament][round] = [];
        acc[tournament][round].push(m);
        return acc;
    }, {}), [filtered]);

    const liveCount = enrichedMatches.filter(m => m.status === 'live').length;

    return (
        <div style={{ paddingBottom: 40 }}>
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Partidos</div>
                    <div className={styles.consoleSubtitle}>
                        {isLoading ? 'Cargando…' : (
                            <span>
                                {filtered.length} de {enrichedMatches.length} partidos
                                {liveCount > 0 && <span style={{ color: '#f97316', marginLeft: 8 }}>● {liveCount} en vivo</span>}
                            </span>
                        )}
                    </div>
                </div>
                <div className={styles.consoleActions}>
                    <div style={{ display: 'flex', gap: 4, background: 'var(--basalt-800)', padding: 3, borderRadius: 6, border: '1px solid var(--surface-edge)' }}>
                        {(['table', 'cards'] as const).map(v => (
                            <button key={v} onClick={() => setViewMode(v)} style={{
                                padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11,
                                background: viewMode === v ? 'var(--basalt-600)' : 'transparent',
                                color: viewMode === v ? '#fff' : 'var(--basalt-400)', fontFamily: 'var(--font-mono)',
                            }}>
                                {v === 'table' ? 'Tabla' : 'Cards'}
                            </button>
                        ))}
                    </div>

                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as MatchStatus | 'all')} className={styles.filterControl} style={{ fontSize: 12, padding: '6px 10px' }}>
                        <option value="all">Todos los estados</option>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>

                    <button className={styles.cardAction} onClick={() => refresh('matches')} disabled={isLoading}>
                        <RefreshCw size={13} style={{ marginRight: 4, animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
                        Refrescar
                    </button>
                    <Link href="/admin/super/partidos/crear" className={`${styles.cardAction} ${styles.cardActionPrimary}`}>
                        <Plus size={13} style={{ marginRight: 6 }} /> Nuevo Partido
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
                    <div>Cargando partidos…</div>
                    <pre style={{ textAlign: 'left', background: '#111', padding: 10, marginTop: 20, fontSize: 10 }}>{JSON.stringify({ loading, errors }, null, 2)}</pre>
                </div>
            )}

            {!isLoading && filtered.length === 0 && (
                <div className={styles.slab} style={{ padding: 48, textAlign: 'center' }}>
                    <CalendarDays size={36} style={{ marginBottom: 16, opacity: 0.3 }} />
                    <div style={{ color: 'var(--basalt-400)' }}>
                        {enrichedMatches.length === 0 ? 'No hay partidos en la base de datos.' : 'Ningún partido coincide con los filtros.'}
                    </div>
                </div>
            )}

            {/* TABLE VIEW */}
            {!isLoading && filtered.length > 0 && viewMode === 'table' && (
                <div className={styles.slab} style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--surface-edge)' }}>
                                {['Partido', 'Torneo / Fecha', 'Horario', 'Sede', 'Estado', 'Acciones'].map(h => (
                                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--basalt-400)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(match => {
                                const score = match.score as { home: number; away: number } | null;
                                const isFinalOrLive = match.status === 'final' || match.status === 'live';
                                return (
                                    <tr key={match.id} style={{ borderBottom: '1px solid var(--surface-edge)' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                                    <div style={{ width: 26, height: 26, borderRadius: 4, overflow: 'hidden', background: 'var(--basalt-800)', border: '1px solid var(--surface-edge)', flexShrink: 0 }}>
                                                        <TeamAvatar logo={match.home_team?.logo_url} name={match.home_team?.name || 'L'} color={match.home_team?.primary_color} />
                                                    </div>
                                                    <span style={{ fontWeight: 600, color: '#ececec', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{match.home_team?.name || 'Local'}</span>
                                                </div>
                                                <div style={{ padding: '3px 10px', borderRadius: 4, minWidth: 52, textAlign: 'center', background: isFinalOrLive ? 'var(--basalt-700)' : 'var(--basalt-800)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: isFinalOrLive ? '#fff' : 'var(--basalt-500)', border: '1px solid var(--surface-edge)' }}>
                                                    {isFinalOrLive && score ? `${score.home}-${score.away}` : 'VS'}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, flexDirection: 'row-reverse' }}>
                                                    <div style={{ width: 26, height: 26, borderRadius: 4, overflow: 'hidden', background: 'var(--basalt-800)', border: '1px solid var(--surface-edge)', flexShrink: 0 }}>
                                                        <TeamAvatar logo={match.away_team?.logo_url} name={match.away_team?.name || 'V'} color={match.away_team?.primary_color} />
                                                    </div>
                                                    <span style={{ fontWeight: 600, color: '#ececec', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110, textAlign: 'right' }}>{match.away_team?.name || 'Visitante'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ color: '#ececec', fontSize: 12, fontWeight: 500 }}>{match.tournament?.name || '—'}</div>
                                            {match.round_id && <div style={{ color: 'var(--basalt-400)', fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{match.round_id}</div>}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--basalt-400)', fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{formatDateTime(match.date_time)}</td>
                                        <td style={{ padding: '12px 16px', color: 'var(--basalt-400)', fontSize: 12, maxWidth: 130 }}>{match.venue || '—'}</td>
                                        <td style={{ padding: '12px 16px' }}><StatusBadge status={match.status || 'scheduled'} /></td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                                <select
                                                    value={match.status || 'scheduled'}
                                                    onChange={e => handleStatusChange(match.id, e.target.value)}
                                                    style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, background: 'var(--basalt-800)', border: '1px solid var(--surface-edge)', color: '#ececec', cursor: 'pointer' }}
                                                >
                                                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                                </select>
                                                <Link href={`/admin/super/partidos/${match.id}`} className={styles.actionBtn} style={{ fontSize: 11, padding: '4px 10px' }}>Gestionar</Link>
                                                {match.status !== 'final' && (
                                                    <Link href={`/admin/super/partidos/${match.id}`} className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} style={{ fontSize: 11, padding: '4px 10px' }}>Consola</Link>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(match.id)}
                                                    title="Eliminar partido"
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 7px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer' }}
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* CARDS VIEW */}
            {!isLoading && filtered.length > 0 && viewMode === 'cards' && (
                Object.entries(grouped).map(([tournamentName, rounds]) => (
                    <div key={tournamentName} className={styles.slab} style={{ marginBottom: 24 }}>
                        <div className={styles.slabHeader}>
                            <div>
                                <span className={styles.slabLabel}>Torneo</span>
                                <h2 className={styles.slabTitle}>{tournamentName}</h2>
                            </div>
                        </div>
                        {Object.entries(rounds).map(([round, matchList]) => (
                            <div key={round} style={{ marginBottom: 24 }}>
                                <h4 style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--basalt-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--surface-edge)' }}>
                                    {round}
                                </h4>
                                <div className={styles.cardGrid}>
                                    {matchList.map(match => {
                                        const score = match.score as { home: number; away: number } | null;
                                        const isFinalOrLive = match.status === 'final' || match.status === 'live';
                                        return (
                                            <div key={match.id} className={styles.cardItem} style={{ paddingTop: 36, position: 'relative' }}>
                                                <div style={{ position: 'absolute', top: 10, right: 10 }}>
                                                    <StatusBadge status={match.status || 'scheduled'} />
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '0 4px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
                                                        <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', background: 'var(--basalt-800)', border: '1px solid var(--surface-edge)' }}>
                                                            <TeamAvatar logo={match.home_team?.logo_url} name={match.home_team?.name || 'L'} color={match.home_team?.primary_color} />
                                                        </div>
                                                        <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', color: '#ececec', lineHeight: 1.3 }}>{match.home_team?.name || 'Local'}</span>
                                                    </div>
                                                    <div style={{ padding: '6px 14px', borderRadius: 6, background: isFinalOrLive ? 'var(--basalt-700)' : 'var(--basalt-800)', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 16, color: isFinalOrLive ? '#fff' : 'var(--basalt-500)', border: '1px solid var(--surface-edge)', minWidth: 60, textAlign: 'center' }}>
                                                        {isFinalOrLive && score ? `${score.home} - ${score.away}` : 'VS'}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
                                                        <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', background: 'var(--basalt-800)', border: '1px solid var(--surface-edge)' }}>
                                                            <TeamAvatar logo={match.away_team?.logo_url} name={match.away_team?.name || 'V'} color={match.away_team?.primary_color} />
                                                        </div>
                                                        <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', color: '#ececec', lineHeight: 1.3 }}>{match.away_team?.name || 'Visitante'}</span>
                                                    </div>
                                                </div>
                                                <div className={styles.metricsGrid} style={{ marginBottom: 14 }}>
                                                    <div className={styles.metricItem}>
                                                        <span className={styles.metricLabel}>Horario</span>
                                                        <span className={styles.metricValue} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{formatDateTime(match.date_time)}</span>
                                                    </div>
                                                    {match.venue && <div className={styles.metricItem}><span className={styles.metricLabel}>Sede</span><span className={styles.metricValue} style={{ fontSize: 11 }}>{match.venue}</span></div>}
                                                </div>
                                                <div className={styles.cardActions}>
                                                    <select
                                                        value={match.status || 'scheduled'}
                                                        onChange={e => handleStatusChange(match.id, e.target.value)}
                                                        style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, background: 'var(--basalt-800)', border: '1px solid var(--surface-edge)', color: '#ececec', cursor: 'pointer' }}
                                                    >
                                                        {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                                    </select>
                                                    <Link href={`/admin/super/partidos/${match.id}`} className={styles.actionBtn}>Gestionar</Link>
                                                    {match.status !== 'final' && <Link href={`/admin/super/partidos/${match.id}`} className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}>Consola</Link>}
                                                    <button
                                                        onClick={() => handleDelete(match.id)}
                                                        title="Eliminar"
                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 7px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer' }}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                ))
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
