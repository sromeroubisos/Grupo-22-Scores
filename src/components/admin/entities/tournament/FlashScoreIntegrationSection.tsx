'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AlertCircle, CheckCircle2, Link2, Loader2, RefreshCw, Search } from 'lucide-react';
import type {
    EspnAmericanFootballConfig,
    EspnMotorsportConfig,
    FlashScoreConfig,
    FlashScoreLinkStatus,
    RugbyApiSportsConfig,
} from '@/lib/types/flashscore-integration';
import {
    getEspnAmericanFootballLinkStatus,
    getEspnMotorsportLinkStatus,
    getLinkStatus,
    getRugbyApiSportsLinkStatus,
} from '@/lib/types/flashscore-integration';
import {
    getRulesetEspnAmericanFootballConfig,
    getRulesetEspnMotorsportConfig,
    getRulesetFlashScoreConfig,
    getRulesetRugbyApiSportsConfig,
    isAmericanFootballSport,
    isMotorsportSport,
    isRugbySport,
    withEspnAmericanFootballRuleset,
    withEspnMotorsportRuleset,
    withFlashScoreRuleset,
    withRugbyApiSportsRuleset,
} from '@/lib/externalProviderPolicy';

interface FlashScoreIntegrationSectionProps {
    tournamentId: string;
    sportId?: string | null;
    ruleset: any;
    onRulesetChange: (newRuleset: any) => void;
}

type RugbyCandidate = {
    id: number;
    name: string;
    type: string;
    logo: string;
    country_id: number | null;
    country: string;
    seasons: Array<{
        season: number;
        current: boolean;
        start: string | null;
        end: string | null;
    }>;
};

const ESPN_LEAGUE_OPTIONS = [
    { slug: 'nfl', label: 'NFL', country: 'USA' },
    { slug: 'college-football', label: 'NCAA', country: 'USA' },
    { slug: 'cfl', label: 'CFL', country: 'Canada' },
    { slug: 'ufl', label: 'UFL', country: 'USA' },
    { slug: 'xfl', label: 'XFL', country: 'USA' },
] as const;

const ESPN_MOTORSPORT_LEAGUE_OPTIONS = [
    { slug: 'f1', label: 'Formula 1', country: 'International' },
    { slug: 'irl', label: 'IndyCar', country: 'USA' },
    { slug: 'nascar-premier', label: 'NASCAR Cup', country: 'USA' },
    { slug: 'nascar-secondary', label: 'NASCAR Xfinity', country: 'USA' },
    { slug: 'nascar-truck', label: 'NASCAR Truck', country: 'USA' },
] as const;

const STATUS_LABELS: Record<FlashScoreLinkStatus, string> = {
    unlinked: 'NO VINCULADO',
    url_only: 'CONFIGURACION PARCIAL',
    ids_resolved: 'CONFIGURADO',
    synced: 'SINCRONIZADO',
};

const STATUS_COLORS: Record<FlashScoreLinkStatus, CSSProperties> = {
    unlinked: {
        color: 'var(--text-secondary, #666)',
        borderColor: 'var(--border-industrial, #333)',
        background: 'rgba(255,255,255,0.03)',
    },
    url_only: {
        color: 'var(--accent-warning, #f59e0b)',
        borderColor: 'var(--accent-warning, #f59e0b)',
        background: 'rgba(245,158,11,0.08)',
    },
    ids_resolved: {
        color: '#3b82f6',
        borderColor: '#3b82f6',
        background: 'rgba(59,130,246,0.08)',
    },
    synced: {
        color: 'var(--accent-primary, #10b981)',
        borderColor: 'var(--accent-primary, #10b981)',
        background: 'rgba(16,185,129,0.08)',
    },
};

export function FlashScoreIntegrationSection({
    tournamentId,
    sportId,
    ruleset,
    onRulesetChange,
}: FlashScoreIntegrationSectionProps) {
    const isRugby = isRugbySport(sportId ?? null);
    const isAmericanFootball = isAmericanFootballSport(sportId ?? null);
    const isMotorsport = isMotorsportSport(sportId ?? null);

    if (isRugby) {
        return (
            <RugbyApiSportsIntegrationSection
                tournamentId={tournamentId}
                ruleset={ruleset}
                onRulesetChange={onRulesetChange}
            />
        );
    }

    if (isAmericanFootball) {
        return (
            <EspnAmericanFootballIntegrationSection
                tournamentId={tournamentId}
                ruleset={ruleset}
                onRulesetChange={onRulesetChange}
            />
        );
    }

    if (isMotorsport) {
        return (
            <EspnMotorsportIntegrationSection
                tournamentId={tournamentId}
                ruleset={ruleset}
                onRulesetChange={onRulesetChange}
            />
        );
    }

    return (
        <FlashScoreOnlyIntegrationSection
            tournamentId={tournamentId}
            ruleset={ruleset}
            onRulesetChange={onRulesetChange}
        />
    );
}

function EspnAmericanFootballIntegrationSection({
    tournamentId,
    ruleset,
    onRulesetChange,
}: {
    tournamentId: string;
    ruleset: any;
    onRulesetChange: (newRuleset: any) => void;
}) {
    const config: EspnAmericanFootballConfig | null = getRulesetEspnAmericanFootballConfig(ruleset);
    const status = getEspnAmericanFootballLinkStatus(config);
    const [selectedLeague, setSelectedLeague] = useState(config?.league_slug ?? '');
    const [resolving, setResolving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setSelectedLeague(config?.league_slug ?? '');
    }, [config?.league_slug]);

    async function handleResolve() {
        if (!selectedLeague) return;

        setResolving(true);
        setError(null);

        try {
            const res = await fetch(`/api/tournaments/${tournamentId}/external/espn/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ league_slug: selectedLeague }),
            });

            const json = await res.json();
            if (!res.ok) {
                setError(json.error || 'Error saving provider config');
                return;
            }

            onRulesetChange(withEspnAmericanFootballRuleset(ruleset, json.config));
        } catch (resolveError: any) {
            setError(resolveError.message || 'Network error');
        } finally {
            setResolving(false);
        }
    }

    return (
        <div className="manager-card mt-10">
            <header className="manager-header">
                <div className="manager-header-titles">
                    <h1 className="flex items-center gap-3">
                        <Link2 className="w-6 h-6" style={{ color: '#3b82f6' }} />
                        Integracion ESPN
                    </h1>
                    <p>Usa la API publica de ESPN solo para futbol americano.</p>
                </div>
                <div className="manager-metadata-box" style={STATUS_COLORS[status] || STATUS_COLORS.unlinked}>
                    STATUS: {STATUS_LABELS[status] || 'SIN ESTADO'}
                </div>
            </header>

            <div className="manager-main-layout">
                <aside className="manager-preview-zone">
                    <div className="manager-metadata-box flex flex-col gap-2 text-[11px]" style={{ minHeight: '140px' }}>
                        {config?.league_slug ? (
                            <>
                                <div><span className="text-[#888]">LEAGUE:</span><br /><span className="text-white">{config.league_name || config.league_slug}</span></div>
                                <div><span className="text-[#888]">COUNTRY:</span><br /><span className="text-white">{config.country_name || '-'}</span></div>
                                <div><span className="text-[#888]">URL:</span><br /><span className="text-[#3b82f6] font-mono">{config.tournament_url || '-'}</span></div>
                                {config.last_sync_at && (
                                    <div><span className="text-[#888]">LAST_SYNC:</span><br /><span className="text-[#10b981] font-mono">{new Date(config.last_sync_at).toLocaleString()}</span></div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full opacity-40 gap-2 pt-4">
                                <AlertCircle size={24} />
                                <span className="text-center uppercase tracking-widest">Sin liga seleccionada</span>
                            </div>
                        )}
                    </div>
                </aside>

                <main className="manager-controls-zone">
                    <div className="manager-input-group mb-4">
                        <label className="manager-field-label">Liga de futbol americano</label>
                        <select
                            className="manager-url-input"
                            value={selectedLeague}
                            onChange={(event) => setSelectedLeague(event.target.value)}
                        >
                            <option value="">Seleccionar liga</option>
                            {ESPN_LEAGUE_OPTIONS.map((league) => (
                                <option key={league.slug} value={league.slug}>
                                    {league.label} · {league.country}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-[#888] mt-2 leading-relaxed">
                            Esta configuracion reemplaza FlashScore solo para futbol americano.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="manager-btn-inline"
                            style={{ padding: '10px 20px', fontSize: '13px', opacity: (!selectedLeague || resolving) ? 0.5 : 1 }}
                            onClick={handleResolve}
                            disabled={!selectedLeague || resolving}
                        >
                            {resolving ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin" />
                                    Guardando...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <RefreshCw size={14} />
                                    Guardar liga
                                </span>
                            )}
                        </button>

                        {config?.league_slug && (
                            <div className="flex items-center gap-1 text-[#10b981] text-xs font-semibold">
                                <CheckCircle2 size={14} />
                                Liga configurada
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="mt-3 p-3 border border-red-500/30 bg-red-500/10 text-red-400 text-xs rounded flex items-start gap-2">
                            <AlertCircle size={14} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

function EspnMotorsportIntegrationSection({
    tournamentId,
    ruleset,
    onRulesetChange,
}: {
    tournamentId: string;
    ruleset: any;
    onRulesetChange: (newRuleset: any) => void;
}) {
    const config: EspnMotorsportConfig | null = getRulesetEspnMotorsportConfig(ruleset);
    const status = getEspnMotorsportLinkStatus(config);
    const [selectedLeague, setSelectedLeague] = useState(config?.league_slug ?? '');
    const [resolving, setResolving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setSelectedLeague(config?.league_slug ?? '');
    }, [config?.league_slug]);

    async function handleResolve() {
        if (!selectedLeague) return;

        setResolving(true);
        setError(null);

        try {
            const res = await fetch(`/api/tournaments/${tournamentId}/external/espn/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ league_slug: selectedLeague }),
            });

            const json = await res.json();
            if (!res.ok) {
                setError(json.error || 'Error saving provider config');
                return;
            }

            onRulesetChange(withEspnMotorsportRuleset(ruleset, json.config));
        } catch (resolveError: any) {
            setError(resolveError.message || 'Network error');
        } finally {
            setResolving(false);
        }
    }

    return (
        <div className="manager-card mt-10">
            <header className="manager-header">
                <div className="manager-header-titles">
                    <h1 className="flex items-center gap-3">
                        <Link2 className="w-6 h-6" style={{ color: '#3b82f6' }} />
                        Integracion ESPN Racing
                    </h1>
                    <p>Usa la API publica de ESPN Racing para Formula 1, IndyCar y NASCAR.</p>
                </div>
                <div className="manager-metadata-box" style={STATUS_COLORS[status] || STATUS_COLORS.unlinked}>
                    STATUS: {STATUS_LABELS[status] || 'SIN ESTADO'}
                </div>
            </header>

            <div className="manager-main-layout">
                <aside className="manager-preview-zone">
                    <div className="manager-metadata-box flex flex-col gap-2 text-[11px]" style={{ minHeight: '140px' }}>
                        {config?.league_slug ? (
                            <>
                                <div><span className="text-[#888]">LEAGUE:</span><br /><span className="text-white">{config.league_name || config.league_slug}</span></div>
                                <div><span className="text-[#888]">COUNTRY:</span><br /><span className="text-white">{config.country_name || '-'}</span></div>
                                <div><span className="text-[#888]">URL:</span><br /><span className="text-[#3b82f6] font-mono">{config.tournament_url || '-'}</span></div>
                                {config.last_sync_at && (
                                    <div><span className="text-[#888]">LAST_SYNC:</span><br /><span className="text-[#10b981] font-mono">{new Date(config.last_sync_at).toLocaleString()}</span></div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full opacity-40 gap-2 pt-4">
                                <AlertCircle size={24} />
                                <span className="text-center uppercase tracking-widest">Sin liga seleccionada</span>
                            </div>
                        )}
                    </div>
                </aside>

                <main className="manager-controls-zone">
                    <div className="manager-input-group mb-4">
                        <label className="manager-field-label">Categoria de motorsport</label>
                        <select
                            className="manager-url-input"
                            value={selectedLeague}
                            onChange={(event) => setSelectedLeague(event.target.value)}
                        >
                            <option value="">Seleccionar categoria</option>
                            {ESPN_MOTORSPORT_LEAGUE_OPTIONS.map((league) => (
                                <option key={league.slug} value={league.slug}>
                                    {league.label} · {league.country}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-[#888] mt-2 leading-relaxed">
                            Esta configuracion usa ESPN para automovilismo en lugar de FlashScore.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="manager-btn-inline"
                            style={{ padding: '10px 20px', fontSize: '13px', opacity: (!selectedLeague || resolving) ? 0.5 : 1 }}
                            onClick={handleResolve}
                            disabled={!selectedLeague || resolving}
                        >
                            {resolving ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin" />
                                    Guardando...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <RefreshCw size={14} />
                                    Guardar categoria
                                </span>
                            )}
                        </button>

                        {config?.league_slug && (
                            <div className="flex items-center gap-1 text-[#10b981] text-xs font-semibold">
                                <CheckCircle2 size={14} />
                                Categoria configurada
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="mt-3 p-3 border border-red-500/30 bg-red-500/10 text-red-400 text-xs rounded flex items-start gap-2">
                            <AlertCircle size={14} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

function FlashScoreOnlyIntegrationSection({
    tournamentId,
    ruleset,
    onRulesetChange,
}: {
    tournamentId: string;
    ruleset: any;
    onRulesetChange: (newRuleset: any) => void;
}) {
    const [resolving, setResolving] = useState(false);
    const [resolveError, setResolveError] = useState<string | null>(null);

    const config: FlashScoreConfig | null = getRulesetFlashScoreConfig(ruleset);
    const status = getLinkStatus(config);
    const localUrl = config?.tournament_url ?? '';
    const hasIds = config?.tournament_id && config?.tournament_template_id;

    function updateUrl(url: string) {
        const updated = withFlashScoreRuleset(ruleset, {
            tournament_url: url,
            tournament_id: undefined,
            tournament_stage_id: undefined,
            tournament_template_id: undefined,
            season_id: undefined,
            linked_at: undefined,
            last_sync: undefined,
        });
        onRulesetChange(updated);
        setResolveError(null);
    }

    async function handleResolve() {
        if (!localUrl.trim()) return;

        setResolving(true);
        setResolveError(null);

        try {
            const res = await fetch(`/api/tournaments/${tournamentId}/external/flashscore/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tournament_url: localUrl.trim() }),
            });
            const json = await res.json();

            if (!res.ok) {
                setResolveError(json.error || 'Error resolving IDs');
                return;
            }

            onRulesetChange(withFlashScoreRuleset(ruleset, json.config));
        } catch (error: any) {
            setResolveError(error.message || 'Network error');
        } finally {
            setResolving(false);
        }
    }

    return (
        <div className="manager-card mt-10">
            <header className="manager-header">
                <div className="manager-header-titles">
                    <h1 className="flex items-center gap-3">
                        <Link2 className="w-6 h-6" style={{ color: '#3b82f6' }} />
                        Integracion FlashScore
                    </h1>
                    <p>Vincula este torneo con FlashScore para sincronizar fixture y resultados.</p>
                </div>
                <div className="manager-metadata-box" style={STATUS_COLORS[status] || STATUS_COLORS.unlinked}>
                    STATUS: {STATUS_LABELS[status] || 'SIN ESTADO'}
                </div>
            </header>

            <div className="manager-main-layout">
                <aside className="manager-preview-zone">
                    <div className="manager-metadata-box flex flex-col gap-2 text-[11px]" style={{ minHeight: '120px' }}>
                        {hasIds ? (
                            <>
                                <div><span className="text-[#888]">TOURNAMENT_ID:</span><br /><span className="text-[#3b82f6] font-mono">{config?.tournament_id}</span></div>
                                <div><span className="text-[#888]">TEMPLATE_ID:</span><br /><span className="text-[#3b82f6] font-mono">{config?.tournament_template_id}</span></div>
                                <div><span className="text-[#888]">STAGE_ID:</span><br /><span className="text-[#3b82f6] font-mono">{config?.tournament_stage_id ?? '-'}</span></div>
                                <div><span className="text-[#888]">SEASON_ID:</span><br /><span className="text-[#3b82f6] font-mono">{config?.season_id ?? '-'}</span></div>
                                {config?.last_sync && (
                                    <div><span className="text-[#888]">LAST_SYNC:</span><br /><span className="text-[#10b981] font-mono">{new Date(config.last_sync).toLocaleString()}</span></div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full opacity-40 gap-2 pt-4">
                                <AlertCircle size={24} />
                                <span className="text-center uppercase tracking-widest">Sin IDs resueltos</span>
                            </div>
                        )}
                    </div>
                </aside>

                <main className="manager-controls-zone">
                    <div className="manager-input-group mb-4">
                        <label className="manager-field-label">URL de FlashScore (ruta relativa)</label>
                        <input
                            type="text"
                            className="manager-url-input flex-1"
                            placeholder="/rugby-union/argentina/top-12/"
                            value={localUrl}
                            onChange={(event) => updateUrl(event.target.value)}
                        />
                        <p className="text-xs text-[#888] mt-2 leading-relaxed">
                            Formato: <strong>/sport/country/tournament-name/</strong> · Sin dominio.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="manager-btn-inline"
                            style={{ padding: '10px 20px', fontSize: '13px', opacity: (!localUrl.trim() || resolving) ? 0.5 : 1 }}
                            onClick={handleResolve}
                            disabled={!localUrl.trim() || resolving}
                        >
                            {resolving ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin" />
                                    Resolviendo...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <RefreshCw size={14} />
                                    Resolver IDs
                                </span>
                            )}
                        </button>

                        {hasIds && (
                            <div className="flex items-center gap-1 text-[#10b981] text-xs font-semibold">
                                <CheckCircle2 size={14} />
                                IDs resueltos
                            </div>
                        )}
                    </div>

                    {resolveError && (
                        <div className="mt-3 p-3 border border-red-500/30 bg-red-500/10 text-red-400 text-xs rounded flex items-start gap-2">
                            <AlertCircle size={14} className="mt-0.5 shrink-0" />
                            <span>{resolveError}</span>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

function RugbyApiSportsIntegrationSection({
    tournamentId,
    ruleset,
    onRulesetChange,
}: {
    tournamentId: string;
    ruleset: any;
    onRulesetChange: (newRuleset: any) => void;
}) {
    const config: RugbyApiSportsConfig | null = getRulesetRugbyApiSportsConfig(ruleset);
    const status = getRugbyApiSportsLinkStatus(config);

    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [resolving, setResolving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<RugbyCandidate[]>([]);
    const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(config?.league_id ?? null);
    const [selectedSeason, setSelectedSeason] = useState<number | ''>(config?.season ?? '');
    const [selectedStage, setSelectedStage] = useState(config?.stage ?? '');
    const [selectedGroup, setSelectedGroup] = useState(config?.group ?? '');
    const [availableStages, setAvailableStages] = useState<string[]>([]);
    const [availableGroups, setAvailableGroups] = useState<string[]>([]);

    useEffect(() => {
        setSelectedLeagueId(config?.league_id ?? null);
        setSelectedSeason(config?.season ?? '');
        setSelectedStage(config?.stage ?? '');
        setSelectedGroup(config?.group ?? '');
    }, [config?.group, config?.league_id, config?.season, config?.stage]);

    useEffect(() => {
        if (status !== 'unlinked') return;
        void handleSearch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectedCandidate = useMemo(() => {
        return candidates.find((candidate) => candidate.id === selectedLeagueId) || null;
    }, [candidates, selectedLeagueId]);

    const availableSeasons = useMemo(() => {
        return (selectedCandidate?.seasons || []).slice().sort((left, right) => right.season - left.season);
    }, [selectedCandidate]);

    async function handleSearch(customQuery?: string) {
        setSearching(true);
        setError(null);

        try {
            const effectiveQuery = (customQuery ?? query).trim();
            const url = new URL(`/api/tournaments/${tournamentId}/external/rugby-api-sports/search`, window.location.origin);
            if (effectiveQuery) {
                url.searchParams.set('q', effectiveQuery);
            }

            const res = await fetch(url.pathname + url.search);
            const json = await res.json();
            if (!res.ok) {
                setError(json.error || 'Error searching leagues');
                return;
            }

            setCandidates(json.candidates || []);

            if (!effectiveQuery && !query && json.search) {
                setQuery(json.search);
            }
        } catch (error: any) {
            setError(error.message || 'Network error');
        } finally {
            setSearching(false);
        }
    }

    async function handleResolve() {
        if (!selectedLeagueId || !selectedSeason) return;

        setResolving(true);
        setError(null);

        try {
            const res = await fetch(`/api/tournaments/${tournamentId}/external/rugby-api-sports/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    league_id: selectedLeagueId,
                    season: selectedSeason,
                    stage: selectedStage || undefined,
                    group: selectedGroup || undefined,
                }),
            });

            const json = await res.json();
            if (!res.ok) {
                setError(json.error || 'Error saving provider config');
                return;
            }

            setAvailableStages(json.stages || []);
            setAvailableGroups(json.groups || []);
            onRulesetChange(withRugbyApiSportsRuleset(ruleset, json.config));
        } catch (error: any) {
            setError(error.message || 'Network error');
        } finally {
            setResolving(false);
        }
    }

    return (
        <div className="manager-card mt-10">
            <header className="manager-header">
                <div className="manager-header-titles">
                    <h1 className="flex items-center gap-3">
                        <Link2 className="w-6 h-6" style={{ color: '#3b82f6' }} />
                        Integracion Rugby API-Sports
                    </h1>
                    <p>Busca la liga externa, elige la temporada y guarda la vinculacion para sincronizar rugby.</p>
                </div>
                <div className="manager-metadata-box" style={STATUS_COLORS[status] || STATUS_COLORS.unlinked}>
                    STATUS: {STATUS_LABELS[status] || 'SIN ESTADO'}
                </div>
            </header>

            <div className="manager-main-layout">
                <aside className="manager-preview-zone">
                    <div className="manager-metadata-box flex flex-col gap-2 text-[11px]" style={{ minHeight: '160px' }}>
                        {config?.league_id ? (
                            <>
                                <div><span className="text-[#888]">LEAGUE_ID:</span><br /><span className="text-[#3b82f6] font-mono">{config.league_id}</span></div>
                                <div><span className="text-[#888]">LEAGUE:</span><br /><span className="text-white">{config.league_name || '-'}</span></div>
                                <div><span className="text-[#888]">SEASON:</span><br /><span className="text-[#3b82f6] font-mono">{config.season ?? '-'}</span></div>
                                <div><span className="text-[#888]">STAGE / GROUP:</span><br /><span className="text-white">{config.stage || '-'} / {config.group || '-'}</span></div>
                                {config.last_sync_at && (
                                    <div><span className="text-[#888]">LAST_SYNC:</span><br /><span className="text-[#10b981] font-mono">{new Date(config.last_sync_at).toLocaleString()}</span></div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full opacity-40 gap-2 pt-4">
                                <AlertCircle size={24} />
                                <span className="text-center uppercase tracking-widest">Sin liga seleccionada</span>
                            </div>
                        )}
                    </div>
                </aside>

                <main className="manager-controls-zone">
                    <div className="manager-input-group mb-4">
                        <label className="manager-field-label">Buscar liga de rugby</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                className="manager-url-input flex-1"
                                placeholder="Top 12, URBA, Top 14..."
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                            <button
                                type="button"
                                className="manager-btn-inline"
                                onClick={() => handleSearch()}
                                disabled={searching}
                            >
                                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                            </button>
                        </div>
                        <p className="text-xs text-[#888] mt-2 leading-relaxed">
                            Si dejas el campo vacio, se intenta una busqueda automatica con el nombre del torneo.
                        </p>
                    </div>

                    {candidates.length > 0 && (
                        <div className="manager-input-group mb-4">
                            <label className="manager-field-label">Liga encontrada</label>
                            <div className="flex flex-col gap-2">
                                {candidates.map((candidate) => {
                                    const isSelected = candidate.id === selectedLeagueId;
                                    return (
                                        <button
                                            key={candidate.id}
                                            type="button"
                                            className="text-left border rounded px-3 py-3 transition-all"
                                            style={{
                                                borderColor: isSelected ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                                                background: isSelected ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)',
                                            }}
                                            onClick={() => {
                                                setSelectedLeagueId(candidate.id);
                                                setSelectedSeason(candidate.seasons.find((season) => season.current)?.season ?? candidate.seasons[0]?.season ?? '');
                                                setSelectedStage('');
                                                setSelectedGroup('');
                                                setAvailableStages([]);
                                                setAvailableGroups([]);
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                {candidate.logo ? (
                                                    <img src={candidate.logo} alt="" className="w-8 h-8 object-contain shrink-0" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded bg-white/5 shrink-0" />
                                                )}
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-white truncate">{candidate.name}</div>
                                                    <div className="text-xs text-[#888]">{candidate.country || 'Internacional'} · {candidate.type}</div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="manager-input-group">
                            <label className="manager-field-label">Temporada</label>
                            <select
                                className="manager-url-input"
                                value={selectedSeason}
                                onChange={(event) => setSelectedSeason(event.target.value ? Number(event.target.value) : '')}
                                disabled={!selectedLeagueId}
                            >
                                <option value="">Seleccionar</option>
                                {availableSeasons.map((season) => (
                                    <option key={season.season} value={season.season}>
                                        {season.season}{season.current ? ' · actual' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="manager-input-group">
                            <label className="manager-field-label">Stage</label>
                            <select
                                className="manager-url-input"
                                value={selectedStage}
                                onChange={(event) => setSelectedStage(event.target.value)}
                                disabled={availableStages.length === 0}
                            >
                                <option value="">Sin stage fijo</option>
                                {availableStages.map((stage) => (
                                    <option key={stage} value={stage}>{stage}</option>
                                ))}
                            </select>
                        </div>

                        <div className="manager-input-group">
                            <label className="manager-field-label">Group</label>
                            <select
                                className="manager-url-input"
                                value={selectedGroup}
                                onChange={(event) => setSelectedGroup(event.target.value)}
                                disabled={availableGroups.length === 0}
                            >
                                <option value="">Sin group fijo</option>
                                {availableGroups.map((group) => (
                                    <option key={group} value={group}>{group}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 mt-4">
                        <button
                            type="button"
                            className="manager-btn-inline"
                            style={{ padding: '10px 20px', fontSize: '13px', opacity: (!selectedLeagueId || !selectedSeason || resolving) ? 0.5 : 1 }}
                            onClick={handleResolve}
                            disabled={!selectedLeagueId || !selectedSeason || resolving}
                        >
                            {resolving ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin" />
                                    Guardando...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <RefreshCw size={14} />
                                    Guardar liga
                                </span>
                            )}
                        </button>

                        {config?.league_id && (
                            <div className="flex items-center gap-1 text-[#10b981] text-xs font-semibold">
                                <CheckCircle2 size={14} />
                                Liga configurada
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="mt-3 p-3 border border-red-500/30 bg-red-500/10 text-red-400 text-xs rounded flex items-start gap-2">
                            <AlertCircle size={14} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
