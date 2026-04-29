'use client';

import {
    ComparisonBarChart,
    MiniBarChart,
    RadarChart,
    type RadarAxis,
} from '@/app/club-admin/matches/[id]/ClubMatchWorkspace.charts';
import { DonutChart } from './DonutChart';
import type { ChartConfig } from '@/lib/club-admin/chartConfigs';
import type { StatCatalogEntry } from './statCatalogs';

interface CustomChartRendererProps<TData> {
    config: ChartConfig;
    catalog: StatCatalogEntry<TData>[];
    data: TData;
    homeLabel?: string;
    awayLabel?: string;
}

export function CustomChartRenderer<TData>({
    config,
    catalog,
    data,
    homeLabel,
    awayLabel,
}: CustomChartRendererProps<TData>) {
    const entries = config.statKeys
        .map((key) => catalog.find((entry) => entry.key === key))
        .filter((entry): entry is StatCatalogEntry<TData> => Boolean(entry));

    if (entries.length === 0) {
        return (
            <div style={{ padding: 16, fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
                Las estadísticas elegidas ya no están disponibles. Editá el gráfico para actualizarlas.
            </div>
        );
    }

    switch (config.chartType) {
        case 'comparison': {
            const entry = entries[0];
            const value = entry.getValue(data);
            return (
                <div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>{entry.label}</div>
                    <ComparisonBarChart
                        home={value.home}
                        away={value.away}
                        max={entry.suggestedMax}
                        homeLabel={homeLabel}
                        awayLabel={awayLabel}
                    />
                </div>
            );
        }
        case 'grouped-bars': {
            const dataset = entries.map((entry) => {
                const v = entry.getValue(data);
                return { label: entry.label, home: v.home, away: v.away };
            });
            return (
                <div>
                    <MiniBarChart data={dataset} />
                    <ChartLegend homeLabel={homeLabel} awayLabel={awayLabel} />
                </div>
            );
        }
        case 'radar': {
            const axes: RadarAxis[] = entries.map((entry) => {
                const v = entry.getValue(data);
                const max = Math.max(entry.suggestedMax ?? 0, v.home, v.away, 1);
                return { label: entry.label, home: v.home, away: v.away, max };
            });
            return (
                <div>
                    <RadarChart axes={axes} />
                    <ChartLegend homeLabel={homeLabel} awayLabel={awayLabel} />
                </div>
            );
        }
        case 'donut': {
            const entry = entries[0];
            const value = entry.getValue(data);
            return (
                <div style={{ paddingBottom: 24 }}>
                    <DonutChart
                        home={value.home}
                        away={value.away}
                        label={entry.label}
                        homeLabel={homeLabel}
                        awayLabel={awayLabel}
                    />
                </div>
            );
        }
        default:
            return null;
    }
}

function ChartLegend({ homeLabel = 'Local', awayLabel = 'Visitante' }: { homeLabel?: string; awayLabel?: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 12, fontSize: '0.75rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a7f3d0' }}>
                <span style={{ width: 10, height: 10, background: '#10b981', borderRadius: 2 }} /> {homeLabel}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#bfdbfe' }}>
                <span style={{ width: 10, height: 10, background: '#3b82f6', borderRadius: 2 }} /> {awayLabel}
            </span>
        </div>
    );
}
