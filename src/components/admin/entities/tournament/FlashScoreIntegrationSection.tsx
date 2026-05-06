'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { AlertCircle, CheckCircle2, Link2, Loader2, RefreshCw } from 'lucide-react';
import type {
    EspnAmericanFootballConfig,
    EspnMotorsportConfig,
    FlashScoreConfig,
    FlashScoreLinkStatus,
} from '@/lib/types/flashscore-integration';
import {
    getEspnAmericanFootballLinkStatus,
    getEspnMotorsportLinkStatus,
    getLinkStatus,
} from '@/lib/types/flashscore-integration';
import {
    getRulesetEspnAmericanFootballConfig,
    getRulesetEspnMotorsportConfig,
    getRulesetFlashScoreConfig,
    isAmericanFootballSport,
    isMotorsportSport,
    withEspnAmericanFootballRuleset,
    withEspnMotorsportRuleset,
    withFlashScoreRuleset,
} from '@/lib/externalProviderPolicy';

interface FlashScoreIntegrationSectionProps {
    tournamentId: string;
    sportId?: string | null;
    ruleset: any;
    onRulesetChange: (newRuleset: any) => void;
}

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
    const isAmericanFootball = isAmericanFootballSport(sportId ?? null);
    const isMotorsport = isMotorsportSport(sportId ?? null);

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
        <div className="manager-card details-integration-card mt-10">
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

            <div className="manager-main-layout details-integration-layout">
                <aside className="manager-preview-zone details-integration-preview">
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

                <main className="manager-controls-zone details-integration-controls">
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
        <div className="manager-card details-integration-card mt-10">
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

            <div className="manager-main-layout details-integration-layout">
                <aside className="manager-preview-zone details-integration-preview">
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

                <main className="manager-controls-zone details-integration-controls">
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
        <div className="manager-card details-integration-card mt-10">
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

            <div className="manager-main-layout details-integration-layout">
                <aside className="manager-preview-zone details-integration-preview">
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

                <main className="manager-controls-zone details-integration-controls">
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
