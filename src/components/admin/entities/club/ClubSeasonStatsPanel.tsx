'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Calendar, Shield, Swords, Target, Users } from 'lucide-react';
import type { CompleteMatchStats } from '@/lib/matchStatsFromEvents';

type SeasonStatsData = {
    matchesCount: number;
    season: string | null;
    clubStats: CompleteMatchStats;
    rivalStats: CompleteMatchStats;
};

type StatCategory = 'marcador' | 'formaciones' | 'disciplina' | 'juego' | 'plantel';

const CATEGORIES: Array<{ id: StatCategory; label: string; icon: React.ReactNode }> = [
    { id: 'marcador', label: 'Marcador', icon: <Target className="w-4 h-4" /> },
    { id: 'formaciones', label: 'Formaciones', icon: <Shield className="w-4 h-4" /> },
    { id: 'disciplina', label: 'Disciplina', icon: <Swords className="w-4 h-4" /> },
    { id: 'juego', label: 'Juego abierto', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'plantel', label: 'Plantel', icon: <Users className="w-4 h-4" /> },
];

function sumPair(pair: { home: number; away: number }) {
    return pair.home + pair.away;
}

function ComparisonBar({ label, club, rivals, unit = '' }: { label: string; club: number; rivals: number; unit?: string }) {
    const total = Math.max(club + rivals, 1);
    const clubPct = (club / total) * 100;
    const rivalsPct = (rivals / total) * 100;
    const hasData = club > 0 || rivals > 0;
    return (
        <div className="season-stat-row">
            <div className="season-stat-label">{label}</div>
            <div className="season-stat-bar-wrap">
                <div className="season-stat-track dual">
                    {hasData ? (
                        <>
                            <div
                                className="season-stat-fill club"
                                style={{ width: `${clubPct}%` }}
                                title={`${club}${unit}`}
                            />
                            <div
                                className="season-stat-fill rivals"
                                style={{ width: `${rivalsPct}%` }}
                                title={`${rivals}${unit}`}
                            />
                        </>
                    ) : (
                        <span className="season-stat-empty">Sin datos</span>
                    )}
                </div>
            </div>
            <div className="season-stat-values">
                <span className="club-value">{club}{unit}</span>
                <span className="rivals-value">{rivals}{unit}</span>
            </div>
        </div>
    );
}

function PercentBar({ label, club, rivals }: { label: string; club: number; rivals: number }) {
    const clubDisplay = club >= 0 ? `${club.toFixed(1)}%` : '—';
    const rivalsDisplay = rivals >= 0 ? `${rivals.toFixed(1)}%` : '—';
    const clubNum = club >= 0 ? club : 0;
    const rivalsNum = rivals >= 0 ? rivals : 0;
    const total = Math.max(clubNum + rivalsNum, 1);
    const clubPct = Math.min((clubNum / total) * 100, 100);
    return (
        <div className="season-stat-row">
            <div className="season-stat-label">{label}</div>
            <div className="season-stat-bar-wrap">
                <div className="season-stat-track">
                    <div
                        className="season-stat-fill club"
                        style={{ width: `${clubPct}%` }}
                    />
                </div>
            </div>
            <div className="season-stat-values">
                <span className="club-value">{clubDisplay}</span>
                <span className="rivals-value">{rivalsDisplay}</span>
            </div>
        </div>
    );
}

function contestPercent(won: number, lost: number): number {
    const n = won + lost;
    if (n <= 0) return -1;
    return (won / n) * 100;
}

function goalKickEffectivenessPercent(made: number, attempts: number): number {
    if (attempts <= 0) return -1;
    return (made / attempts) * 100;
}

function redZone22ConversionPercent(stats: CompleteMatchStats, team: 'home' | 'away'): number {
    const entries = stats.entradas22[team];
    if (entries === 0) return -1;
    const scored =
        (team === 'home' ? stats.tries.home : stats.tries.away)
        + (team === 'home' ? stats.penaltyTries.home : stats.penaltyTries.away)
        + (team === 'home' ? stats.penaltyGoalsMade.home : stats.penaltyGoalsMade.away)
        + (team === 'home' ? stats.dropGoalsMade.home : stats.dropGoalsMade.away);
    return (scored / entries) * 100;
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

    const kpis = useMemo(() => {
        if (!data) return [];
        const c = data.clubStats;
        const r = data.rivalStats;
        return [
            { label: 'Partidos', club: data.matchesCount, rivals: data.matchesCount },
            { label: 'Puntos', club: sumPair(c.points), rivals: sumPair(r.points) },
            { label: 'Tries', club: sumPair(c.tries), rivals: sumPair(r.tries) },
            { label: 'Conversiones', club: sumPair(c.conversionsMade), rivals: sumPair(r.conversionsMade) },
            { label: 'Penales a palos', club: sumPair(c.penaltyGoalsMade), rivals: sumPair(r.penaltyGoalsMade) },
            { label: 'Tackles', club: sumPair(c.tackles), rivals: sumPair(r.tackles) },
        ];
    }, [data]);

    const categorySections = useMemo(() => {
        if (!data) return [];
        const c = data.clubStats;
        const r = data.rivalStats;

        const make = (label: string, club: number, rivals: number, percent = false) =>
            percent
                ? { type: 'percent' as const, label, club, rivals }
                : { type: 'count' as const, label, club, rivals };

        const sections: Record<StatCategory, Array<{ type: 'count' | 'percent'; label: string; club: number; rivals: number }>> = {
            marcador: [
                make('Puntos', sumPair(c.points), sumPair(r.points)),
                make('Tries', sumPair(c.tries), sumPair(r.tries)),
                make('Try penal', sumPair(c.penaltyTries), sumPair(r.penaltyTries)),
                make('Conversiones OK', sumPair(c.conversionsMade), sumPair(r.conversionsMade)),
                make('Conversiones falladas', sumPair(c.conversionsMissed), sumPair(r.conversionsMissed)),
                make('Penales a palos OK', sumPair(c.penaltyGoalsMade), sumPair(r.penaltyGoalsMade)),
                make('Penales a palos fallados', sumPair(c.penaltyGoalsMissed), sumPair(r.penaltyGoalsMissed)),
                make('Drops OK', sumPair(c.dropGoalsMade), sumPair(r.dropGoalsMade)),
                make('Drops fallados', sumPair(c.dropGoalsMissed), sumPair(r.dropGoalsMissed)),
                make('Conversiones a palos (%)',
                    goalKickEffectivenessPercent(sumPair(c.conversionsMade), sumPair(c.conversionAttempts)),
                    goalKickEffectivenessPercent(sumPair(r.conversionsMade), sumPair(r.conversionAttempts)), true),
                make('Penales a palos (%)',
                    goalKickEffectivenessPercent(sumPair(c.penaltyGoalsMade), sumPair(c.penaltyGoalAttempts)),
                    goalKickEffectivenessPercent(sumPair(r.penaltyGoalsMade), sumPair(r.penaltyGoalAttempts)), true),
                make('Efectividad total al palo (%)',
                    goalKickEffectivenessPercent(sumPair(c.goalKicksMade), sumPair(c.goalKickAttempts)),
                    goalKickEffectivenessPercent(sumPair(r.goalKicksMade), sumPair(r.goalKickAttempts)), true),
                make('Tasa de conversión 22 (%)',
                    (() => {
                        const h = redZone22ConversionPercent(c, 'home');
                        const a = redZone22ConversionPercent(c, 'away');
                        if (h < 0 && a < 0) return -1;
                        if (h < 0) return a;
                        if (a < 0) return h;
                        return (h + a) / 2;
                    })(),
                    (() => {
                        const h = redZone22ConversionPercent(r, 'home');
                        const a = redZone22ConversionPercent(r, 'away');
                        if (h < 0 && a < 0) return -1;
                        if (h < 0) return a;
                        if (a < 0) return h;
                        return (h + a) / 2;
                    })(),
                    true),
            ],
            formaciones: [
                make('Scrums ganados', sumPair(c.scrumsWon), sumPair(r.scrumsWon)),
                make('Scrums perdidos', sumPair(c.scrumsLost), sumPair(r.scrumsLost)),
                make('Efectividad scrum (%)',
                    contestPercent(sumPair(c.scrumsWon), sumPair(c.scrumsLost)),
                    contestPercent(sumPair(r.scrumsWon), sumPair(r.scrumsLost)), true),
                make('Lineouts ganados', sumPair(c.linesWon), sumPair(r.linesWon)),
                make('Lineouts perdidos', sumPair(c.linesLost), sumPair(r.linesLost)),
                make('Efectividad line (%)',
                    contestPercent(sumPair(c.linesWon), sumPair(c.linesLost)),
                    contestPercent(sumPair(r.linesWon), sumPair(r.linesLost)), true),
                make('Rucks ganados', sumPair(c.rucksWon), sumPair(r.rucksWon)),
                make('Rucks perdidos', sumPair(c.rucksLost), sumPair(r.rucksLost)),
                make('Efectividad ruck (%)',
                    contestPercent(sumPair(c.rucksWon), sumPair(c.rucksLost)),
                    contestPercent(sumPair(r.rucksWon), sumPair(r.rucksLost)), true),
                make('Mauls ganados', sumPair(c.maulsWon), sumPair(r.maulsWon)),
                make('Mauls perdidos', sumPair(c.maulsLost), sumPair(r.maulsLost)),
                make('Efectividad maul (%)',
                    contestPercent(sumPair(c.maulsWon), sumPair(c.maulsLost)),
                    contestPercent(sumPair(r.maulsWon), sumPair(r.maulsLost)), true),
                make('Free kicks', sumPair(c.freeKicks), sumPair(r.freeKicks)),
            ],
            disciplina: [
                make('Amarillas', sumPair(c.yellowCards), sumPair(r.yellowCards)),
                make('Rojas', sumPair(c.redCards), sumPair(r.redCards)),
                make('Penales cometidos', sumPair(c.penaltiesCommitted), sumPair(r.penaltiesCommitted)),
                make('Knock-on', sumPair(c.knockOns), sumPair(r.knockOns)),
                make('Pase forward', sumPair(c.forwardPasses), sumPair(r.forwardPasses)),
                make('Error de manejo', sumPair(c.handlingErrors), sumPair(r.handlingErrors)),
            ],
            juego: [
                make('Entradas en 22', sumPair(c.entradas22), sumPair(r.entradas22)),
                make('Tackles', sumPair(c.tackles), sumPair(r.tackles)),
                make('Patadas (evento)', sumPair(c.kicks), sumPair(r.kicks)),
                make('Metros de patada (juego)', sumPair(c.kickMeters), sumPair(r.kickMeters)),
                make('Pases', sumPair(c.passes), sumPair(r.passes)),
                make('Recuperaciones', sumPair(c.recoveries), sumPair(r.recoveries)),
                make('Turnovers ganados', sumPair(c.turnoversWon), sumPair(r.turnoversWon)),
                make('Turnovers perdidos', sumPair(c.turnoversLost), sumPair(r.turnoversLost)),
            ],
            plantel: [
                make('Cambios', sumPair(c.substitutions), sumPair(r.substitutions)),
                make('Lesiones', sumPair(c.injuries), sumPair(r.injuries)),
            ],
        };

        return sections[activeCategory].filter((row) => {
            if (row.type === 'percent') return row.club >= 0 || row.rivals >= 0;
            return row.club > 0 || row.rivals > 0;
        });
    }, [data, activeCategory]);

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

    if (!data || data.matchesCount === 0) {
        return (
            <div className="club-matches-shell">
                <div className="club-matches-empty">
                    No hay partidos finalizados con estadísticas para mostrar.
                </div>
            </div>
        );
    }

    return (
        <div className="club-season-stats">
            <header className="club-season-stats-header">
                <div>
                    <h3>Estadísticas de temporada — {clubName}</h3>
                    <p className="club-season-stats-sub">
                        <Calendar className="w-3.5 h-3.5 inline mr-1" />
                        {data.matchesCount} partidos analizados
                        {data.season ? ` · Temporada ${data.season}` : ''}
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
                {CATEGORIES.map((cat) => (
                    <button
                        key={cat.id}
                        type="button"
                        className={`club-season-cat${activeCategory === cat.id ? ' active' : ''}`}
                        onClick={() => setActiveCategory(cat.id)}
                    >
                        {cat.icon}
                        {cat.label}
                    </button>
                ))}
            </nav>

            <section className="club-season-category-body">
                {categorySections.length === 0 ? (
                    <div className="club-matches-empty">No hay datos en esta categoría.</div>
                ) : (
                    <div className="season-stat-list">
                        {categorySections.map((row) =>
                            row.type === 'percent' ? (
                                <PercentBar
                                    key={row.label}
                                    label={row.label}
                                    club={row.club}
                                    rivals={row.rivals}
                                />
                            ) : (
                                <ComparisonBar
                                    key={row.label}
                                    label={row.label}
                                    club={row.club}
                                    rivals={row.rivals}
                                />
                            )
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}
