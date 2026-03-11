'use client';

import { useState } from 'react';
import { Link2, CheckCircle2, AlertCircle, Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import type { FlashScoreConfig, FlashScoreLinkStatus } from '@/lib/types/flashscore-integration';
import { getLinkStatus } from '@/lib/types/flashscore-integration';

interface FlashScoreIntegrationSectionProps {
    tournamentId: string;
    ruleset: any;
    onRulesetChange: (newRuleset: any) => void;
}

const STATUS_LABELS: Record<FlashScoreLinkStatus, string> = {
    unlinked: 'NO VINCULADO',
    url_only: 'URL CONFIGURADA',
    ids_resolved: 'IDs RESUELTOS',
    synced: 'SINCRONIZADO',
};

const STATUS_COLORS: Record<FlashScoreLinkStatus, React.CSSProperties> = {
    unlinked: { 
        color: 'var(--text-secondary, #666)', 
        borderColor: 'var(--border-industrial, #333)', 
        background: 'rgba(255,255,255,0.03)' 
    },
    url_only: { 
        color: 'var(--accent-warning, #f59e0b)', 
        borderColor: 'var(--accent-warning, #f59e0b)', 
        background: 'rgba(245,158,11,0.08)' 
    },
    ids_resolved: { 
        color: '#3b82f6', 
        borderColor: '#3b82f6', 
        background: 'rgba(59,130,246,0.08)' 
    },
    synced: { 
        color: 'var(--accent-primary, #10b981)', 
        borderColor: 'var(--accent-primary, #10b981)', 
        background: 'rgba(16,185,129,0.08)' 
    },
};

export function FlashScoreIntegrationSection({
    tournamentId,
    ruleset,
    onRulesetChange,
}: FlashScoreIntegrationSectionProps) {
    const [resolving, setResolving] = useState(false);
    const [resolveError, setResolveError] = useState<string | null>(null);

    const config: FlashScoreConfig | null = ruleset?.flashscore ?? null;
    const status = getLinkStatus(config);
    const localUrl = config?.tournament_url ?? '';

    function updateUrl(url: string) {
        const updated = {
            ...ruleset,
            flashscore: {
                ...(ruleset?.flashscore ?? {}),
                tournament_url: url,
                // Clear resolved IDs when URL changes
                tournament_id: undefined,
                tournament_stage_id: undefined,
                tournament_template_id: undefined,
                season_id: undefined,
                linked_at: undefined,
            },
        };
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
                setResolveError(json.error || 'Error al resolver IDs');
                return;
            }
            // Update ruleset with resolved config (backend already persisted it)
            onRulesetChange({
                ...ruleset,
                flashscore: json.config,
            });
        } catch (err: any) {
            setResolveError(err.message || 'Error de red');
        } finally {
            setResolving(false);
        }
    }

    const hasIds = config?.tournament_id && config?.tournament_template_id;

    return (
        <div className="manager-card mt-10">
            <header className="manager-header">
                <div className="manager-header-titles">
                    <h1 className="flex items-center gap-3">
                        <Link2 className="w-6 h-6" style={{ color: '#3b82f6' }} />
                        Integración FlashScore
                    </h1>
                    <p>Vinculá este torneo con datos externos de FlashScore para sincronizar fixture y resultados.</p>
                </div>
                <div className="manager-metadata-box" id="fs-status-indicator" style={STATUS_COLORS[status] || STATUS_COLORS.unlinked}>
                    STATUS: {STATUS_LABELS[status] || 'SIN ESTADO'}
                </div>
            </header>

            <div className="manager-main-layout">
                {/* Left: Connection Info */}
                <aside className="manager-preview-zone">
                    <div className="manager-metadata-box flex flex-col gap-2 text-[11px]" style={{ minHeight: '120px' }}>
                        {hasIds ? (
                            <>
                                <div><span className="text-[#888]">TOURNAMENT_ID:</span><br /><span className="text-[#3b82f6] font-mono">{config?.tournament_id}</span></div>
                                <div><span className="text-[#888]">TEMPLATE_ID:</span><br /><span className="text-[#3b82f6] font-mono">{config?.tournament_template_id}</span></div>
                                <div><span className="text-[#888]">STAGE_ID:</span><br /><span className="text-[#3b82f6] font-mono">{config?.tournament_stage_id ?? '—'}</span></div>
                                <div><span className="text-[#888]">SEASON_ID:</span><br /><span className="text-[#3b82f6] font-mono">{config?.season_id ?? '—'}</span></div>
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

                {/* Right: Controls */}
                <main className="manager-controls-zone">
                    <div className="manager-input-group mb-4">
                        <label className="manager-field-label">URL de FlashScore (ruta relativa)</label>
                        <div className="relative flex items-center gap-2">
                            <input
                                type="text"
                                className="manager-url-input flex-1"
                                placeholder="/rugby-union/argentina/torneo-name/"
                                value={localUrl}
                                onChange={e => updateUrl(e.target.value)}
                            />
                        </div>
                        <p className="text-xs text-[#888] mt-2 leading-relaxed">
                            Formato: <strong>/sport/country/tournament-name/</strong> · No incluyas el dominio flashscore.com
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

                    {hasIds && (
                        <div className="mt-4 p-3 border border-emerald-500/20 bg-emerald-500/5 text-[#10b981] text-xs rounded">
                            <p className="font-semibold mb-1">✓ Torneo vinculado exitosamente</p>
                            <p className="text-[#888]">
                                Guardá los cambios para persistir la vinculación.
                                Luego usá la pestaña <strong>Operación → Sincronización</strong> para importar fixture y resultados.
                            </p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
