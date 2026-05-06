'use client';

import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertCircle,
    Calendar,
    CheckCircle2,
    CheckSquare,
    ChevronLeft,
    ChevronRight,
    Download,
    Link2,
    Loader2,
    RefreshCw,
    Settings2,
    Square,
    Trophy,
} from 'lucide-react';
import { Database } from '@/lib/database.types';
import {
    getEspnAmericanFootballLinkStatus,
    getEspnMotorsportLinkStatus,
    getLinkStatus,
    type ExternalMatchWithMapping,
    type EspnAmericanFootballConfig,
    type EspnMotorsportConfig,
    type ExternalStandingsRow,
    type FlashScoreConfig,
    type MatchConfidence,
    type SyncResponse,
} from '@/lib/types/flashscore-integration';
import {
    getRulesetEspnAmericanFootballConfig,
    getRulesetEspnMotorsportConfig,
    getRulesetFlashScoreConfig,
    isAmericanFootballSport,
    isMotorsportSport,
} from '@/lib/externalProviderPolicy';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type SyncView = 'idle' | 'loading' | 'preview' | 'syncing' | 'done' | 'error' | 'standings';

interface Props {
    tournamentId: string;
    data: TournamentRow;
    phaseId: string | null;
    phases: Array<{ id: string; name: string }>;
}

const CONFIDENCE_BADGE: Record<MatchConfidence, { label: string; style: CSSProperties }> = {
    exact: {
        label: 'EXACTO',
        style: { color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' },
    },
    partial: {
        label: 'PARCIAL',
        style: { color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' },
    },
    none: {
        label: 'SIN MATCH',
        style: { color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' },
    },
};

function getExternalMatchId(match: ExternalMatchWithMapping) {
    return match.external_match_id || match.flashscore_match_id || '';
}

export function FlashScoreSyncPanel({ tournamentId, data, phaseId, phases }: Props) {
    const router = useRouter();
    const isAmericanFootball = isAmericanFootballSport((data as any).sport_id ?? (data as any).sport ?? null);
    const isMotorsport = isMotorsportSport((data as any).sport_id ?? (data as any).sport ?? null);
    const flashScoreConfig: FlashScoreConfig | null = getRulesetFlashScoreConfig((data as any).ruleset);
    const espnConfig: EspnAmericanFootballConfig | null = getRulesetEspnAmericanFootballConfig((data as any).ruleset);
    const espnMotorsportConfig: EspnMotorsportConfig | null = getRulesetEspnMotorsportConfig((data as any).ruleset);

    const provider = (isAmericanFootball || isMotorsport) ? 'espn' : 'flashscore';
    const providerLabel = isMotorsport ? 'ESPN Racing' : isAmericanFootball ? 'ESPN' : 'FlashScore';
    const linkStatus = isMotorsport
        ? getEspnMotorsportLinkStatus(espnMotorsportConfig)
        : isAmericanFootball
            ? getEspnAmericanFootballLinkStatus(espnConfig)
            : getLinkStatus(flashScoreConfig);
    const isLinked = linkStatus === 'ids_resolved' || linkStatus === 'synced';
    const syncSupported = !isMotorsport;

    const [view, setView] = useState<SyncView>('idle');
    const [sourceType, setSourceType] = useState<'fixtures' | 'results'>('fixtures');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [externalMatches, setExternalMatches] = useState<ExternalMatchWithMapping[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [clubOverrides, setClubOverrides] = useState<Map<string, string>>(new Map());
    const [targetPhaseId, setTargetPhaseId] = useState<string>(phaseId || phases[0]?.id || '');
    const [syncResult, setSyncResult] = useState<SyncResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [standings, setStandings] = useState<ExternalStandingsRow[] | null>(null);
    const [standingsError, setStandingsError] = useState<string | null>(null);
    const [loadingStandings, setLoadingStandings] = useState(false);
    const [participants, setParticipants] = useState<Array<{ id: string; name: string }>>([]);

    async function loadParticipants() {
        const res = await fetch(`/api/tournaments/${tournamentId}/participants`);
        if (!res.ok) return;
        const json = await res.json();
        const items = json.data ?? json ?? [];
        setParticipants(items.map((participant: any) => ({
            id: participant.club_id ?? participant.id,
            name: participant.clubs?.name ?? participant.name ?? 'Club desconocido',
        })));
    }

    const loadExternalMatches = useCallback(async (src: 'fixtures' | 'results', pg: number) => {
        setView('loading');
        setError(null);

        try {
            if (participants.length === 0) await loadParticipants();

            const endpoint = src === 'fixtures' ? 'fixtures' : 'results';
            const res = await fetch(`/api/tournaments/${tournamentId}/external/${provider}/${endpoint}?page=${pg}`);
            const json = await res.json();

            if (!res.ok) {
                setError(json.error || 'Error loading external data');
                setView('error');
                return;
            }

            const matches: ExternalMatchWithMapping[] = json.matches ?? [];
            setExternalMatches(matches);
            setHasMore(json.has_more ?? false);

            const autoSelected = new Set(
                matches
                    .filter((match) => match.home_match_confidence !== 'none' && match.away_match_confidence !== 'none')
                    .map((match) => getExternalMatchId(match))
                    .filter(Boolean)
            );

            setSelectedIds(autoSelected);
            setClubOverrides(new Map());
            setView('preview');
        } catch (error: any) {
            setError(error.message || 'Network error');
            setView('error');
        }
    }, [participants.length, provider, tournamentId]);

    async function handleLoad() {
        setPage(1);
        await loadExternalMatches(sourceType, 1);
    }

    async function handlePageChange(newPage: number) {
        setPage(newPage);
        await loadExternalMatches(sourceType, newPage);
    }

    async function handleImport() {
        setView('syncing');
        setSyncResult(null);

        const toImport = externalMatches
            .filter((match) => selectedIds.has(getExternalMatchId(match)))
            .map((match) => {
                const externalId = getExternalMatchId(match);
                return {
                    external_match_id: match.external_match_id ?? (provider !== 'flashscore' ? externalId : undefined),
                    flashscore_match_id: match.flashscore_match_id ?? (provider === 'flashscore' ? externalId : undefined),
                    home_club_id: clubOverrides.get(`${externalId}-home`) ?? match.home_club_id ?? '',
                    away_club_id: clubOverrides.get(`${externalId}-away`) ?? match.away_club_id ?? '',
                    date_time: match.date_time,
                    venue: match.venue ?? null,
                    status: match.status,
                };
            });

        try {
            const res = await fetch(`/api/tournaments/${tournamentId}/external/${provider}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phase_id: targetPhaseId, matches: toImport }),
            });
            const json: SyncResponse = await res.json();
            setSyncResult(json);
            setView(json.success ? 'done' : 'error');
            if (json.success) {
                router.refresh();
            }
        } catch (error: any) {
            setError(error.message || 'Network error');
            setView('error');
        }
    }

    async function handleLoadStandings() {
        setLoadingStandings(true);
        setStandingsError(null);

        try {
            const res = await fetch(`/api/tournaments/${tournamentId}/external/${provider}/standings`);
            const json = await res.json();
            if (!res.ok) {
                setStandingsError(json.error || 'Error loading standings');
            } else {
                setStandings(json.standings ?? []);
                setView('standings');
            }
        } catch (error: any) {
            setStandingsError(error.message || 'Network error');
        } finally {
            setLoadingStandings(false);
        }
    }

    function toggleSelect(matchId: string) {
        const next = new Set(selectedIds);
        if (next.has(matchId)) next.delete(matchId);
        else next.add(matchId);
        setSelectedIds(next);
    }

    function selectAll() {
        setSelectedIds(new Set(externalMatches.map((match) => getExternalMatchId(match)).filter(Boolean)));
    }

    function deselectAll() {
        setSelectedIds(new Set());
    }

    function setOverride(matchId: string, side: 'home' | 'away', clubId: string) {
        const next = new Map(clubOverrides);
        if (clubId) next.set(`${matchId}-${side}`, clubId);
        else next.delete(`${matchId}-${side}`);
        setClubOverrides(next);
    }

    const unresolvedCount = useMemo(() => {
        return externalMatches
            .filter((match) => selectedIds.has(getExternalMatchId(match)))
            .filter((match) => {
                const externalId = getExternalMatchId(match);
                const homeId = clubOverrides.get(`${externalId}-home`) ?? match.home_club_id;
                const awayId = clubOverrides.get(`${externalId}-away`) ?? match.away_club_id;
                return !homeId || !awayId;
            }).length;
    }, [clubOverrides, externalMatches, selectedIds]);

    const syncProviderSummary = isMotorsport
        ? `${espnMotorsportConfig?.league_name || 'Categoria'} - ${espnMotorsportConfig?.country_name || '-'}`
        : isAmericanFootball
            ? `${espnConfig?.league_name || 'Liga'} - ${espnConfig?.country_name || '-'}`
            : flashScoreConfig?.tournament_url || 'Sin URL';

    const syncLastSync = isMotorsport
        ? espnMotorsportConfig?.last_sync_at
        : isAmericanFootball
            ? espnConfig?.last_sync_at
            : flashScoreConfig?.last_sync;

    if (!isLinked) {
        return (
            <div className="basalt-card flex flex-col items-center text-center p-12 gap-6">
                <div className="w-16 h-16 bg-surface-elevated border border-border-basalt flex items-center justify-center rounded-xl">
                    <Link2 className="text-status-warning" size={32} />
                </div>
                <div>
                    <h2 className="basalt-h1 mb-2">Proveedor externo sin configurar</h2>
                    <p className="text-dim max-w-md mx-auto text-sm">
                        Configura <strong>{providerLabel}</strong> en la pestaña <strong>Detalles</strong> para poder sincronizar este torneo.
                    </p>
                </div>
                <button
                    className="basalt-btn basalt-btn-primary"
                    onClick={() => router.push(`/admin/entities/${tournamentId}/manage?type=tournament&tab=detalles`)}
                >
                    <Settings2 size={16} />
                    Ir a Detalles
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="basalt-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-accent-primary">{providerLabel}</span>
                    <h3 className="text-lg font-extrabold tracking-tight mt-0.5">Sincronizacion Externa</h3>
                    <p className="text-dim text-xs mt-1">{syncProviderSummary}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    {syncLastSync ? (
                        <span className="text-[10px] text-dim font-mono">
                            Ultima sync: {new Date(syncLastSync).toLocaleString()}
                        </span>
                    ) : (
                        <span className="text-[10px] text-dim font-mono">Sin sincronizaciones previas</span>
                    )}
                    <span className={`basalt-badge ${linkStatus === 'synced' ? 'badge-ok' : 'badge-info'}`}>
                        {linkStatus === 'synced' ? 'SINCRONIZADO' : 'CONFIGURADO'}
                    </span>
                </div>
            </div>

            <div className="basalt-card p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
                <div className="flex gap-2">
                    <button
                        className={`basalt-btn ${sourceType === 'fixtures' ? 'basalt-btn-primary' : ''}`}
                        style={sourceType !== 'fixtures' ? { opacity: 0.5 } : {}}
                        onClick={() => setSourceType('fixtures')}
                    >
                        <Calendar size={14} />
                        Fixtures
                    </button>
                    <button
                        className={`basalt-btn ${sourceType === 'results' ? 'basalt-btn-primary' : ''}`}
                        style={sourceType !== 'results' ? { opacity: 0.5 } : {}}
                        onClick={() => setSourceType('results')}
                    >
                        <CheckCircle2 size={14} />
                        Resultados
                    </button>
                </div>

                <button
                    className="basalt-btn basalt-btn-primary"
                    onClick={handleLoad}
                    disabled={view === 'loading'}
                >
                    {view === 'loading' ? (
                        <><Loader2 size={14} className="animate-spin" /> Cargando...</>
                    ) : (
                        <><Download size={14} /> Cargar datos externos</>
                    )}
                </button>

                <button
                    className="basalt-btn"
                    onClick={handleLoadStandings}
                    disabled={loadingStandings}
                    style={{ marginLeft: 'auto' }}
                >
                    {loadingStandings ? (
                        <><Loader2 size={14} className="animate-spin" /> Cargando...</>
                    ) : (
                        <><Trophy size={14} /> Ver standings externos</>
                    )}
                </button>
            </div>

            {standingsError && (
                <div className="basalt-card p-4 border-l-4 border-l-red-500 flex items-start gap-3">
                    <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={16} />
                    <span className="text-red-400 text-sm">{standingsError}</span>
                </div>
            )}

            {view === 'error' && error && (
                <div className="basalt-card p-6 flex flex-col items-center text-center gap-4">
                    <AlertCircle className="text-red-400" size={32} />
                    <p className="text-red-400 text-sm">{error}</p>
                    <button className="basalt-btn basalt-btn-primary" onClick={handleLoad}>
                        <RefreshCw size={14} />
                        Reintentar
                    </button>
                </div>
            )}

            {view === 'done' && syncResult && (
                <div className="basalt-card p-6 flex flex-col items-center text-center gap-3">
                    <CheckCircle2 className="text-emerald-400" size={40} />
                    <h3 className="basalt-h1">
                        {syncResult.imported} partido{syncResult.imported !== 1 ? 's' : ''} importado{syncResult.imported !== 1 ? 's' : ''}
                    </h3>
                    {syncResult.errors.length > 0 && (
                        <p className="text-red-400 text-xs">{syncResult.errors.join(' · ')}</p>
                    )}
                    <p className="text-dim text-sm">Los partidos se agregaron al fixture del torneo.</p>
                    <button className="basalt-btn basalt-btn-primary" onClick={() => { setView('idle'); setExternalMatches([]); }}>
                        Nueva sincronizacion
                    </button>
                </div>
            )}

            {view === 'standings' && standings && (
                <div className="basalt-card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="basalt-h2 flex items-center gap-2"><Trophy size={16} /> Tabla de posiciones ({providerLabel})</h3>
                        <button className="basalt-btn text-xs" onClick={() => setView('preview')}>
                            Volver al fixture
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                            <thead>
                                <tr className="border-b border-border-basalt text-dim text-[10px] uppercase tracking-wider">
                                    <th className="py-2 px-3 text-left">#</th>
                                    <th className="py-2 px-3 text-left">Equipo</th>
                                    <th className="py-2 px-2 text-center">PJ</th>
                                    <th className="py-2 px-2 text-center">G</th>
                                    <th className="py-2 px-2 text-center">E</th>
                                    <th className="py-2 px-2 text-center">P</th>
                                    <th className="py-2 px-2 text-center">Pts</th>
                                </tr>
                            </thead>
                            <tbody>
                                {standings.map((row) => (
                                    <tr key={`${row.position}-${row.team_name}`} className="border-b border-border-basalt/30 hover:bg-surface-elevated transition-colors">
                                        <td className="py-2 px-3 text-dim">{row.position}</td>
                                        <td className="py-2 px-3 font-semibold text-white">
                                            <div className="flex items-center gap-3 min-w-0">
                                                {row.team_logo ? (
                                                    <img src={row.team_logo} alt="" className="w-5 h-5 object-contain shrink-0" />
                                                ) : (
                                                    <div className="w-5 h-5 rounded bg-white/5 shrink-0" />
                                                )}
                                                <span className="truncate">{row.team_name}</span>
                                            </div>
                                        </td>
                                        <td className="py-2 px-2 text-center text-dim">{row.played}</td>
                                        <td className="py-2 px-2 text-center">{row.won}</td>
                                        <td className="py-2 px-2 text-center">{row.drawn}</td>
                                        <td className="py-2 px-2 text-center">{row.lost}</td>
                                        <td className="py-2 px-2 text-center font-bold text-accent-primary">{row.points}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {standings.length === 0 && (
                            <p className="text-dim text-center py-6 text-sm">Sin datos de standings disponibles.</p>
                        )}
                    </div>
                </div>
            )}

            {(view === 'preview' || view === 'syncing') && externalMatches.length > 0 && (
                <>
                    <div className="basalt-card p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
                        <div className="flex gap-2">
                            <button className="basalt-btn text-xs" onClick={selectAll}>
                                <CheckSquare size={13} /> Seleccionar todo
                            </button>
                            <button className="basalt-btn text-xs" onClick={deselectAll}>
                                <Square size={13} /> Deseleccionar
                            </button>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-dim">
                            <span>{selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}</span>
                            {unresolvedCount > 0 && (
                                <span className="text-red-400">· {unresolvedCount} sin resolver</span>
                            )}
                        </div>

                        <div className="flex items-center gap-2 ml-auto flex-wrap">
                            {syncSupported ? (
                                <>
                                    <select
                                        className="basalt-input text-xs"
                                        style={{ minWidth: '200px' }}
                                        value={targetPhaseId}
                                        onChange={(event) => setTargetPhaseId(event.target.value)}
                                    >
                                        {phases.map((phase) => (
                                            <option key={phase.id} value={phase.id}>{phase.name}</option>
                                        ))}
                                    </select>

                                    <button
                                        className="basalt-btn basalt-btn-primary"
                                        onClick={handleImport}
                                        disabled={selectedIds.size === 0 || unresolvedCount > 0 || view === 'syncing' || !targetPhaseId}
                                    >
                                        {view === 'syncing' ? (
                                            <><Loader2 size={14} className="animate-spin" /> Importando...</>
                                        ) : (
                                            <><Download size={14} /> Importar seleccionados ({selectedIds.size})</>
                                        )}
                                    </button>
                                </>
                            ) : (
                                <span className="text-xs text-dim">
                                    ESPN Racing se usa en modo lectura para automovilismo. La importacion al fixture interno no esta habilitada.
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between px-1">
                        <button
                            className="basalt-btn text-xs"
                            disabled={page <= 1}
                            onClick={() => handlePageChange(page - 1)}
                        >
                            <ChevronLeft size={13} /> Anterior
                        </button>
                        <span className="text-dim text-xs font-mono">Pagina {page}</span>
                        <button
                            className="basalt-btn text-xs"
                            disabled={!hasMore}
                            onClick={() => handlePageChange(page + 1)}
                        >
                            Siguiente <ChevronRight size={13} />
                        </button>
                    </div>

                    <div className="flex flex-col gap-2">
                        {externalMatches.map((match) => {
                            const externalId = getExternalMatchId(match);
                            const isSelected = selectedIds.has(externalId);
                            const homeOverride = clubOverrides.get(`${externalId}-home`);
                            const awayOverride = clubOverrides.get(`${externalId}-away`);
                            const homeId = homeOverride ?? match.home_club_id;
                            const awayId = awayOverride ?? match.away_club_id;
                            const homeBadge = CONFIDENCE_BADGE[homeOverride ? 'exact' : match.home_match_confidence];
                            const awayBadge = CONFIDENCE_BADGE[awayOverride ? 'exact' : match.away_match_confidence];
                            const dateStr = new Date(match.date_time).toLocaleString(undefined, {
                                day: '2-digit',
                                month: '2-digit',
                                year: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                            });

                            return (
                                <div
                                    key={externalId}
                                    className={`basalt-card p-4 flex flex-col gap-3 cursor-pointer transition-all ${isSelected ? 'border border-accent-primary/50' : 'opacity-60'}`}
                                    onClick={() => toggleSelect(externalId)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {isSelected ? (
                                                <CheckSquare size={16} className="text-accent-primary shrink-0" />
                                            ) : (
                                                <Square size={16} className="text-dim shrink-0" />
                                            )}
                                            <span className="text-[10px] text-dim font-mono">{dateStr}</span>
                                            {match.venue && (
                                                <span className="text-[10px] text-dim">· {match.venue}</span>
                                            )}
                                        </div>
                                        {match.score && (
                                            <span className="text-sm font-bold font-mono text-accent-primary">
                                                {match.score.home ?? '?'} - {match.score.away ?? '?'}
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1" onClick={(event) => event.stopPropagation()}>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold truncate">{match.home_team_name}</span>
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono shrink-0" style={homeBadge.style}>
                                                    {homeBadge.label}
                                                </span>
                                            </div>
                                            {(!homeId || match.home_match_confidence === 'partial') && (
                                                <select
                                                    className="basalt-input text-xs"
                                                    value={homeOverride ?? ''}
                                                    onChange={(event) => setOverride(externalId, 'home', event.target.value)}
                                                >
                                                    <option value="">— Asignar club —</option>
                                                    {participants.map((participant) => (
                                                        <option key={participant.id} value={participant.id}>{participant.name}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-1" onClick={(event) => event.stopPropagation()}>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold truncate">{match.away_team_name}</span>
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono shrink-0" style={awayBadge.style}>
                                                    {awayBadge.label}
                                                </span>
                                            </div>
                                            {(!awayId || match.away_match_confidence === 'partial') && (
                                                <select
                                                    className="basalt-input text-xs"
                                                    value={awayOverride ?? ''}
                                                    onChange={(event) => setOverride(externalId, 'away', event.target.value)}
                                                >
                                                    <option value="">— Asignar club —</option>
                                                    {participants.map((participant) => (
                                                        <option key={participant.id} value={participant.id}>{participant.name}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {view === 'idle' && (
                <div className="basalt-card p-10 flex flex-col items-center text-center gap-4 opacity-60">
                    <RefreshCw size={32} className="text-dim" />
                    <p className="text-dim text-sm">
                        Selecciona una fuente y haz clic en <strong>Cargar datos externos</strong> para obtener partidos desde {providerLabel}.
                    </p>
                </div>
            )}
        </div>
    );
}
