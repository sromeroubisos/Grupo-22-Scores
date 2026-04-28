'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Calendar, Shield, Swords, Target, Users } from 'lucide-react';
import {
    buildCompleteStatTabs,
    type CompleteMatchStats,
    type CompleteStatRow,
} from '@/lib/matchStatsFromEvents';

type SeasonStatsData = {
    matchesCount: number;
    matchesWithStatsCount?: number;
    totalMatchesCount?: number;
    season: string | null;
    clubStats: CompleteMatchStats;
    rivalStats: CompleteMatchStats;
    comparisonStats?: CompleteMatchStats | null;
};

type StatCategory = 'marcador' | 'formaciones' | 'disciplina' | 'juego' | 'plantel';

const CATEGORY_ICONS: Record<StatCategory, React.ReactNode> = {
    marcador: <Target className="w-4 h-4" />,
    formaciones: <Shield className="w-4 h-4" />,
    disciplina: <Swords className="w-4 h-4" />,
    juego: <BarChart3 className="w-4 h-4" />,
    plantel: <Users className="w-4 h-4" />,
};

function formatStatValue(value: number, valueKind: CompleteStatRow['valueKind']) {
    if (valueKind === 'percent') {
        return value >= 0 ? `${value.toFixed(1)}%` : '-';
    }

    return Number.isFinite(value) ? String(value) : '0';
}

function StatComparisonBar({ row }: { row: CompleteStatRow }) {
    const club = row.home;
    const rivals = row.away;
    const clubValue = row.valueKind === 'percent' ? Math.max(club, 0) : club;
    const rivalsValue = row.valueKind === 'percent' ? Math.max(rivals, 0) : rivals;
    const total = Math.max(clubValue + rivalsValue, 1);
    const clubPct = (clubValue / total) * 100;
    const rivalsPct = (rivalsValue / total) * 100;
    const hasData = row.valueKind === 'percent'
        ? club >= 0 || rivals >= 0
        : club > 0 || rivals > 0 || row.accent;

    return (
        <div className={`season-stat-row${row.accent ? ' accent' : ''}`}>
            <div className="season-stat-label" title={row.tooltip || row.label}>{row.label}</div>
            <div className="season-stat-bar-wrap">
                <div className="season-stat-track dual">
                    {hasData ? (
                        <>
                            <div
                                className="season-stat-fill club"
                                style={{ width: `${clubPct}%` }}
                                title={formatStatValue(club, row.valueKind)}
                            />
                            <div
                                className="season-stat-fill rivals"
                                style={{ width: `${rivalsPct}%` }}
                                title={formatStatValue(rivals, row.valueKind)}
                            />
                        </>
                    ) : (
                        <span className="season-stat-empty">Sin datos</span>
                    )}
                </div>
            </div>
            <div className="season-stat-values">
                <span className="club-value">{formatStatValue(club, row.valueKind)}</span>
                <span className="rivals-value">{formatStatValue(rivals, row.valueKind)}</span>
            </div>
        </div>
    );
}

export function ClubSeasonStatsPanel({ clubId, clubName }: { clubId: string; clubName: string }) {
    const [data, setData] = useState<SeasonStatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeCategory, setActiveCategory] = useState<StatCategory>('marcador');

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/club-admin/club-stats?club=${encodeURIComponent(clubId)}`, {
                    credentials: 'same-origin',
                    cache: 'no-store',
                });
                const json = await res.json();
                if (!res.ok || !json.ok) {
                    throw new Error(json.error || 'Error al cargar estadísticas');
                }
                if (!cancelled) {
                    setData(json.data as SeasonStatsData);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : 'Error desconocido');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [clubId]);

    const comparisonStats = data?.comparisonStats ?? data?.clubStats ?? null;

    const kpis = useMemo(() => {
        if (!data || !comparisonStats) return [];
        return [
            { label: 'Partidos', club: data.matchesCount, rivals: data.matchesCount },
            { label: 'Puntos', club: comparisonStats.points.home, rivals: comparisonStats.points.away },
            { label: 'Tries', club: comparisonStats.tries.home, rivals: comparisonStats.tries.away },
            { label: 'Conversiones', club: comparisonStats.conversionsMade.home, rivals: comparisonStats.conversionsMade.away },
            { label: 'Penales a palos', club: comparisonStats.penaltyGoalsMade.home, rivals: comparisonStats.penaltyGoalsMade.away },
            { label: 'Tackles', club: comparisonStats.tackles.home, rivals: comparisonStats.tackles.away },
        ];
    }, [data, comparisonStats]);

    const statTabs = useMemo(() => {
        if (!comparisonStats) return [];
        return buildCompleteStatTabs(comparisonStats, clubName, 'Rivales', { includeEmptyRows: true });
    }, [comparisonStats, clubName]);

    const selectedStatTab = useMemo(() => {
        return statTabs.find((tab) => tab.id === activeCategory) ?? statTabs[0] ?? null;
    }, [statTabs, activeCategory]);

    useEffect(() => {
        if (statTabs.length === 0) return;
        if (statTabs.some((tab) => tab.id === activeCategory)) return;
        setActiveCategory(statTabs[0].id as StatCategory);
    }, [statTabs, activeCategory]);

    if (loading) {
        return (
            <div className="club-matches-shell">
                <div className="club-matches-empty">Cargando estadísticas de temporada...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="club-matches-shell">
                <div className="club-matches-empty" style={{ color: '#ef4444' }}>
                    {error}
                </div>
            </div>
        );
    }

    if (!data || data.matchesCount === 0 || !comparisonStats) {
        return (
            <div className="club-matches-shell">
                <div className="club-matches-empty">
                    No hay partidos finalizados para mostrar.
                </div>
            </div>
        );
    }

    return (
        <div className="club-season-stats">
            <header className="club-season-stats-header">
                <div>
                    <h3>Estadísticas de temporada - {clubName}</h3>
                    <p className="club-season-stats-sub">
                        <Calendar className="w-3.5 h-3.5 inline mr-1" />
                        {data.matchesCount} partidos finalizados analizados
                        {data.season ? ` - Temporada ${data.season}` : ''}
                    </p>
                </div>
                <div className="club-season-stats-legend">
                    <span className="legend-club">{clubName}</span>
                    <span className="legend-rivals">Rivales</span>
                </div>
            </header>

            <section className="club-season-kpi-grid">
                {kpis.map((kpi) => (
                    <div key={kpi.label} className="club-season-kpi-card">
                        <span className="club-season-kpi-label">{kpi.label}</span>
                        <div className="club-season-kpi-values">
                            <strong className="club">{kpi.club}</strong>
                            <span className="sep">vs</span>
                            <strong className="rivals">{kpi.rivals}</strong>
                        </div>
                    </div>
                ))}
            </section>

            <nav className="club-season-categories" aria-label="Categorías de estadísticas">
                {statTabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`club-season-cat${selectedStatTab?.id === tab.id ? ' active' : ''}`}
                        onClick={() => setActiveCategory(tab.id as StatCategory)}
                    >
                        {CATEGORY_ICONS[tab.id as StatCategory] ?? <BarChart3 className="w-4 h-4" />}
                        {tab.label}
                    </button>
                ))}
            </nav>

            <section className="club-season-category-body">
                {!selectedStatTab ? (
                    <div className="club-matches-empty">No hay datos en esta categoría.</div>
                ) : (
                    <div className="season-stat-section-list">
                        {selectedStatTab.sections.map((section) => (
                            <div key={section.title} className="season-stat-section">
                                <h4>{section.title}</h4>
                                <div className="season-stat-list">
                                    {section.rows.map((row) => (
                                        <StatComparisonBar key={row.key} row={row} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
