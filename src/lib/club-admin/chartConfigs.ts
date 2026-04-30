export type ChartType = 'comparison' | 'grouped-bars' | 'radar' | 'donut';
export type PanelKey = 'postmatch' | 'season-stats';

export interface ChartConfig {
    id: string;
    clubId: string;
    panelKey: PanelKey;
    position: number;
    chartType: ChartType;
    title: string | null;
    statKeys: string[];
    createdByUserId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ChartConfigDraft {
    chartType: ChartType;
    title?: string | null;
    statKeys: string[];
}

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
    comparison: 'Barras comparativas',
    'grouped-bars': 'Barras agrupadas',
    radar: 'Radar',
    donut: 'Donut',
};

export const CHART_TYPE_HINTS: Record<ChartType, string> = {
    comparison: 'Una sola estadística, local vs visitante',
    'grouped-bars': 'Varias estadísticas en barras dobles',
    radar: 'Perfil multi-dimensional (3 a 8 stats)',
    donut: 'Distribución porcentual de una stat',
};

export function validateChartDraft(draft: ChartConfigDraft): string | null {
    if (!draft.statKeys || draft.statKeys.length === 0) {
        return 'Elegí al menos una estadística';
    }
    const unique = new Set(draft.statKeys);
    if (unique.size !== draft.statKeys.length) {
        return 'Hay estadísticas repetidas';
    }
    switch (draft.chartType) {
        case 'comparison':
        case 'donut':
            if (draft.statKeys.length !== 1) {
                return 'Este tipo de gráfico requiere exactamente 1 estadística';
            }
            return null;
        case 'grouped-bars':
            if (draft.statKeys.length < 2) {
                return 'Las barras agrupadas requieren al menos 2 estadísticas';
            }
            if (draft.statKeys.length > 12) {
                return 'Máximo 12 estadísticas por gráfico';
            }
            return null;
        case 'radar':
            if (draft.statKeys.length < 3) {
                return 'El radar requiere al menos 3 estadísticas';
            }
            if (draft.statKeys.length > 8) {
                return 'Máximo 8 estadísticas en el radar';
            }
            return null;
        default:
            return 'Tipo de gráfico no soportado';
    }
}

interface ApiOk<T> { ok: true; data: T }
interface ApiErr { ok: false; error: string }
type ApiRes<T> = ApiOk<T> | ApiErr;

async function parse<T>(res: Response): Promise<T> {
    const json = (await res.json()) as ApiRes<T>;
    if (!json.ok) {
        throw new Error('error' in json ? json.error : 'Request failed');
    }
    return json.data;
}

export async function fetchChartConfigs(clubId: string, panelKey: PanelKey): Promise<ChartConfig[]> {
    const res = await fetch(`/api/club-admin/chart-configs?club=${encodeURIComponent(clubId)}&panel=${encodeURIComponent(panelKey)}`, {
        cache: 'no-store',
        credentials: 'include',
    });
    const data = await parse<{ configs: ChartConfig[] }>(res);
    return data.configs;
}

export async function createChartConfig(clubId: string, panelKey: PanelKey, draft: ChartConfigDraft): Promise<ChartConfig> {
    const res = await fetch('/api/club-admin/chart-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clubId, panelKey, ...draft }),
    });
    const data = await parse<{ config: ChartConfig }>(res);
    return data.config;
}

export async function updateChartConfig(id: string, clubId: string, draft: ChartConfigDraft): Promise<ChartConfig> {
    const res = await fetch(`/api/club-admin/chart-configs/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clubId, ...draft }),
    });
    const data = await parse<{ config: ChartConfig }>(res);
    return data.config;
}

export async function deleteChartConfig(id: string, clubId: string): Promise<void> {
    const res = await fetch(`/api/club-admin/chart-configs/${encodeURIComponent(id)}?club=${encodeURIComponent(clubId)}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    await parse<{ deleted: true }>(res);
}

export async function reorderChartConfigs(clubId: string, panelKey: PanelKey, orderedIds: string[]): Promise<void> {
    const res = await fetch('/api/club-admin/chart-configs/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clubId, panelKey, orderedIds }),
    });
    await parse<{ updated: number }>(res);
}
