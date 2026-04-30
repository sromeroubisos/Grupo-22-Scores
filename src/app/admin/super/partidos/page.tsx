'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { RefreshCw, Plus, Radio, CheckCircle, Clock, AlertTriangle, CalendarDays, Trash2, XCircle } from 'lucide-react';
import type { MatchRow } from '@/lib/cache/superAdminCache';
import { invalidateCache } from '@/lib/cache/superAdminCache';
import { MATCH_REVIEW_STATUS } from '@/lib/matchReview';
import { APP_TIMEZONE, formatDateInTimeZone } from '@/lib/timezone';

type MatchStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'suspended';
type ReviewFilter = 'all' | 'pending' | 'approved' | 'rejected';
const PAGE_SIZE = 20;

type PaginatedMatchesResponse = {
    data: MatchRow[];
    pagination?: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
    error?: string;
    details?: unknown;
};

const STATUS_CONFIG: Record<MatchStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    scheduled: { label: 'Programado', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', icon: <Clock size={10} /> },
    live: { label: 'En Vivo', color: '#f97316', bg: 'rgba(249,115,22,0.15)', icon: <Radio size={10} /> },
    final: { label: 'Finalizado', color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: <CheckCircle size={10} /> },
    postponed: { label: 'Postergado', color: '#eab308', bg: 'rgba(234,179,8,0.1)', icon: <AlertTriangle size={10} /> },
    suspended: { label: 'Suspendido', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: <AlertTriangle size={10} /> },
};

function getSportVariants(sport: string): string[] {
    const lower = sport.toLowerCase();
    switch (lower) {
        case 'rugby': return ['rugby', 'rugby-union', 'rugby-league'];
        case 'rugby-union': return ['rugby', 'rugby-union'];
        case 'rugby-league': return ['rugby', 'rugby-league'];
        case 'football': return ['football', 'soccer'];
        case 'hockey': return ['hockey', 'field-hockey'];
        default: return [lower];
    }
}

function resolveMatchSportId(match: MatchRow) {
    return (match.sport_id || match.tournament?.sport_id || '').toLowerCase() || null;
}

function formatDateTime(iso: string) {
    try { return formatDateInTimeZone(iso, 'es-AR', { dateStyle: 'short', timeStyle: 'short' }, APP_TIMEZONE) || iso; }
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

function ReviewBadge({ match }: { match: MatchRow }) {
    const reviewStatus = match.review_status || MATCH_REVIEW_STATUS.approved;

    if (reviewStatus === MATCH_REVIEW_STATUS.pending) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, fontSize: 11, background: 'rgba(234,179,8,0.1)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)', fontFamily: 'var(--font-mono)' }}>
                <AlertTriangle size={10} /> Pendiente SA
            </span>
        );
    }

    if (reviewStatus === MATCH_REVIEW_STATUS.rejected) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, fontSize: 11, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', fontFamily: 'var(--font-mono)' }}>
                <XCircle size={10} /> Rechazado
            </span>
        );
    }

    if (match.is_visible === false) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, fontSize: 11, background: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)', fontFamily: 'var(--font-mono)' }}>
                Oculto
            </span>
        );
    }

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, fontSize: 11, background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', fontFamily: 'var(--font-mono)' }}>
            <CheckCircle size={10} /> Publico
        </span>
    );
}

export default function SuperadminPartidosPage() {
    // ─── Read from shared context (already prefetched by layout) ─────────────────
    const { filters } = useSuperConsole();

    const [statusFilter, setStatusFilter] = useState<MatchStatus | 'all'>('all');
    const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageMatches, setPageMatches] = useState<MatchRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [totalMatches, setTotalMatches] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    // Optimistic local state
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
    const [statusOverrides, setStatusOverrides] = useState<Map<string, string>>(new Map());
    const [reviewOverrides, setReviewOverrides] = useState<Map<string, { review_status: string | null; is_visible: boolean | null }>>(new Map());

    const loadMatchesPage = useCallback(async (page = currentPage) => {
        setIsLoading(true);
        setErrorMsg(null);

        try {
            const params = new URLSearchParams({
                page: String(page),
                pageSize: String(PAGE_SIZE),
            });

            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (reviewFilter !== 'all') params.set('review', reviewFilter);
            if (filters.sport !== 'all') params.set('sport', filters.sport);

            const response = await fetch(`/api/admin/super/matches?${params.toString()}`, {
                cache: 'no-store',
                credentials: 'include',
            });
            const payload = await response.json() as PaginatedMatchesResponse;

            if (!response.ok) {
                const detail = typeof payload?.details === 'string' ? payload.details : null;
                throw new Error(detail ? `${payload?.error || 'Failed to load matches'}: ${detail}` : (payload?.error || 'Failed to load matches'));
            }

            const nextMatches = Array.isArray(payload.data) ? payload.data : [];
            const nextTotal = payload.pagination?.total ?? nextMatches.length;
            const nextTotalPages = payload.pagination?.totalPages ?? (nextTotal > 0 ? Math.ceil(nextTotal / PAGE_SIZE) : 0);

            if (page > 1 && nextMatches.length === 0 && nextTotalPages > 0) {
                setCurrentPage(nextTotalPages);
                return;
            }

            setPageMatches(nextMatches);
            setTotalMatches(nextTotal);
            setTotalPages(nextTotalPages);
        } catch (error) {
            console.error('Failed to load paginated matches, falling back to legacy source:', error);

            try {
                const fallbackResponse = await fetch('/api/admin/super/console-data?resource=matches', {
                    cache: 'no-store',
                    credentials: 'include',
                });
                const fallbackPayload = await fallbackResponse.json() as { data?: MatchRow[]; error?: string; details?: unknown };

                if (!fallbackResponse.ok) {
                    const detail = typeof fallbackPayload?.details === 'string' ? fallbackPayload.details : null;
                    throw new Error(detail ? `${fallbackPayload?.error || 'Failed to load matches'}: ${detail}` : (fallbackPayload?.error || 'Failed to load matches'));
                }

                const baseMatches = Array.isArray(fallbackPayload.data) ? fallbackPayload.data : [];
                const serverEquivalentMatches = baseMatches.filter(match => {
                    if (statusFilter !== 'all' && match.status !== statusFilter) return false;
                    if (reviewFilter !== 'all' && (match.review_status || MATCH_REVIEW_STATUS.approved) !== reviewFilter) return false;
                    if (filters.sport !== 'all') {
                        const sportId = resolveMatchSportId(match);
                        if (!sportId || !getSportVariants(filters.sport).includes(sportId)) return false;
                    }
                    return true;
                });

                const fallbackTotal = serverEquivalentMatches.length;
                const fallbackTotalPages = fallbackTotal > 0 ? Math.ceil(fallbackTotal / PAGE_SIZE) : 0;

                if (page > 1 && fallbackTotalPages > 0 && page > fallbackTotalPages) {
                    setCurrentPage(fallbackTotalPages);
                    return;
                }

                const start = (page - 1) * PAGE_SIZE;
                const nextMatches = serverEquivalentMatches.slice(start, start + PAGE_SIZE);

                setPageMatches(nextMatches);
                setTotalMatches(fallbackTotal);
                setTotalPages(fallbackTotalPages);
                setErrorMsg(null);
            } catch (fallbackError) {
                console.error('Failed to load matches from legacy source:', fallbackError);
                setPageMatches([]);
                setTotalMatches(0);
                setTotalPages(0);
                setErrorMsg(fallbackError instanceof Error ? fallbackError.message : 'Failed to load matches');
            }
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, filters.sport, reviewFilter, statusFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filters.search, filters.sport, reviewFilter, statusFilter]);

    useEffect(() => {
        void loadMatchesPage(currentPage);
    }, [currentPage, loadMatchesPage]);

    const refreshPage = useCallback(() => {
        void loadMatchesPage(currentPage);
    }, [currentPage, loadMatchesPage]);

    const handleDelete = async (id: string) => {
        if (!confirm('¿Seguro que deseas eliminar este partido?')) return;
        setDeletedIds(prev => new Set([...prev, id]));
        const response = await fetch(`/api/admin/matches/${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            setDeletedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
            alert('Error al eliminar: ' + (payload?.error || 'No se pudo eliminar el partido.'));
            return;
        }
        invalidateCache('matches_list');
        refreshPage();
    };

    const handleStatusChange = async (id: string, newStatus: string) => {
        setStatusOverrides(prev => new Map([...prev, [id, newStatus]]));
        const response = await fetch(`/api/admin/matches/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: newStatus }),
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            setStatusOverrides(prev => { const m = new Map(prev); m.delete(id); return m; });
            alert('Error al actualizar estado: ' + (payload?.error || 'No se pudo actualizar el partido.'));
            return;
        }
        invalidateCache('matches_list');
        refreshPage();
    };

    const handleReviewAction = async (id: string, action: 'approve' | 'reject') => {
        const optimistic = action === 'approve'
            ? { review_status: MATCH_REVIEW_STATUS.approved, is_visible: true }
            : { review_status: MATCH_REVIEW_STATUS.rejected, is_visible: false };

        setReviewOverrides(prev => new Map([...prev, [id, optimistic]]));
        const response = await fetch(`/api/admin/super/matches/${encodeURIComponent(id)}/approval`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action }),
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            setReviewOverrides(prev => { const m = new Map(prev); m.delete(id); return m; });
            alert('Error al revisar partido: ' + (payload?.error || 'No se pudo actualizar la revision.'));
            return;
        }

        invalidateCache('matches_list');
        refreshPage();
    };

    const enrichedMatches = useMemo(() =>
        pageMatches
            .filter(m => !deletedIds.has(m.id))
            .map(m => {
                const reviewOverride = reviewOverrides.get(m.id);
                return {
                    ...m,
                    status: statusOverrides.has(m.id) ? statusOverrides.get(m.id)! : (m.status ?? 'scheduled'),
                    review_status: reviewOverride?.review_status ?? m.review_status,
                    is_visible: reviewOverride?.is_visible ?? m.is_visible,
                };
            }),
        [pageMatches, deletedIds, statusOverrides, reviewOverrides]);

    const filtered = useMemo(() => enrichedMatches.filter(m => {
        if (statusFilter !== 'all' && m.status !== statusFilter) return false;
        if (reviewFilter !== 'all' && (m.review_status || MATCH_REVIEW_STATUS.approved) !== reviewFilter) return false;
        if (filters.sport !== 'all') {
            const sportId = resolveMatchSportId(m);
            if (!sportId || !getSportVariants(filters.sport).includes(sportId)) return false;
        }
        if (filters.search) {
            const term = filters.search.toLowerCase();
            const text = [m.home_team?.name, m.away_team?.name, m.tournament?.name, m.venue].join(' ').toLowerCase();
            if (!text.includes(term)) return false;
        }
        return true;
    }), [enrichedMatches, statusFilter, reviewFilter, filters.search, filters.sport]);

    const grouped = useMemo(() => filtered.reduce<Record<string, Record<string, MatchRow[]>>>((acc, m) => {
        const tournament = m.tournament?.name || 'Sin torneo';
        const round = m.round_id || 'Sin fecha';
        if (!acc[tournament]) acc[tournament] = {};
        if (!acc[tournament][round]) acc[tournament][round] = [];
        acc[tournament][round].push(m);
        return acc;
    }, {}), [filtered]);

    const liveCount = enrichedMatches.filter(m => m.status === 'live').length;
    const pendingReviewCount = enrichedMatches.filter(m => m.review_status === MATCH_REVIEW_STATUS.pending).length;
    const loadedFrom = totalMatches === 0 ? 0 : ((currentPage - 1) * PAGE_SIZE) + 1;
    const loadedTo = totalMatches === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, totalMatches);

    return (
        <div style={{ paddingBottom: 40 }}>
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Partidos</div>
                    <div className={styles.consoleSubtitle}>
                        {isLoading ? 'Cargando…' : (
                            <span>
                                {filtered.length} visibles en esta pagina
                                <span style={{ color: 'var(--basalt-400)', marginLeft: 8 }}>
                                    {loadedFrom}-{loadedTo} de {totalMatches}
                                </span>
                                {liveCount > 0 && <span style={{ color: '#f97316', marginLeft: 8 }}>● {liveCount} en vivo</span>}
                                {pendingReviewCount > 0 && <span style={{ color: '#eab308', marginLeft: 8 }}>{pendingReviewCount} pendientes SA</span>}
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

                    <select value={reviewFilter} onChange={e => setReviewFilter(e.target.value as ReviewFilter)} className={styles.filterControl} style={{ fontSize: 12, padding: '6px 10px' }}>
                        <option value="all">Todas las revisiones</option>
                        <option value="pending">Pendientes Super Admin</option>
                        <option value="approved">Aprobados</option>
                        <option value="rejected">Rechazados</option>
                    </select>

                    <button className={styles.cardAction} onClick={refreshPage} disabled={isLoading}>
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
                                {['Partido', 'Torneo / Fecha', 'Horario', 'Sede', 'Revision', 'Estado', 'Acciones'].map(h => (
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
                                        <td style={{ padding: '12px 16px' }}><ReviewBadge match={match} /></td>
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
                                                {match.review_status === MATCH_REVIEW_STATUS.pending && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleReviewAction(match.id, 'approve')}
                                                            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.1)', color: '#10b981', cursor: 'pointer' }}
                                                        >
                                                            Aprobar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleReviewAction(match.id, 'reject')}
                                                            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer' }}
                                                        >
                                                            Rechazar
                                                        </button>
                                                    </>
                                                )}
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
                                            <div key={match.id} className={styles.cardItem} style={{ paddingTop: 48, position: 'relative' }}>
                                                <div style={{ position: 'absolute', top: 10, left: 10 }}>
                                                    <ReviewBadge match={match} />
                                                </div>
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
                                                    {match.review_status === MATCH_REVIEW_STATUS.pending && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleReviewAction(match.id, 'approve')}
                                                                className={styles.actionBtn}
                                                            >
                                                                Aprobar
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleReviewAction(match.id, 'reject')}
                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 7px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: 11 }}
                                                            >
                                                                Rechazar
                                                            </button>
                                                        </>
                                                    )}
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

            {!isLoading && totalPages > 1 && (
                <div className={styles.slab} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 20 }}>
                    <div style={{ color: 'var(--basalt-400)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                        Pagina {currentPage} de {totalPages}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                            type="button"
                            className={styles.cardAction}
                            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                            disabled={currentPage === 1 || isLoading}
                        >
                            Anterior
                        </button>
                        <button
                            type="button"
                            className={styles.cardAction}
                            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                            disabled={currentPage >= totalPages || isLoading}
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
