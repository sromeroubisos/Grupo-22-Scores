import { NextRequest, NextResponse } from 'next/server';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_PANELS = new Set(['postmatch', 'season-stats']);
const ALLOWED_TYPES = new Set(['comparison', 'grouped-bars', 'radar', 'donut']);

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeText(value: unknown) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeStatKeys(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const out: string[] = [];
    for (const entry of value) {
        if (typeof entry !== 'string') return null;
        const trimmed = entry.trim();
        if (!trimmed) return null;
        if (out.includes(trimmed)) return null;
        out.push(trimmed);
    }
    if (out.length === 0) return null;
    return out;
}

interface ChartConfigRow {
    id: string;
    club_id: string;
    panel_key: string;
    position: number;
    chart_type: string;
    title: string | null;
    stat_keys: string[];
    created_by_user_id: string | null;
    created_at: string;
    updated_at: string;
}

function toPayload(row: ChartConfigRow) {
    return {
        id: row.id,
        clubId: row.club_id,
        panelKey: row.panel_key,
        position: row.position,
        chartType: row.chart_type,
        title: row.title,
        statKeys: Array.isArray(row.stat_keys) ? row.stat_keys : [],
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function GET(request: NextRequest) {
    try {
        const clubId = normalizeText(request.nextUrl.searchParams.get('club'));
        const panelKey = normalizeText(request.nextUrl.searchParams.get('panel'));

        if (!clubId) return err('club param required', 400);
        if (!ALLOWED_PANELS.has(panelKey)) return err('panel inválido', 400);

        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) return err('No autenticado', 401);

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target) return err('Club no encontrado', 404);

        if (!canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) {
            return err('Sin permisos para administrar este club', 403);
        }

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('club_chart_configs')
            .select('id, club_id, panel_key, position, chart_type, title, stat_keys, created_by_user_id, created_at, updated_at')
            .eq('club_id', target.clubId)
            .eq('panel_key', panelKey)
            .order('position', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) {
            return err(error.message || 'No se pudieron cargar los gráficos', 500);
        }

        const rows = (data || []) as ChartConfigRow[];
        return NextResponse.json({
            ok: true,
            data: { configs: rows.map(toPayload) },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar los gráficos';
        console.error('[api/club-admin/chart-configs GET]', error);
        return err(message, 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) return err('No autenticado', 401);

        const body = await request.json();
        const clubId = normalizeText(body?.clubId);
        const panelKey = normalizeText(body?.panelKey);
        const chartType = normalizeText(body?.chartType);
        const title = body?.title === null || body?.title === undefined ? null : normalizeText(body.title) || null;
        const statKeys = normalizeStatKeys(body?.statKeys);

        if (!clubId) return err('clubId requerido', 400);
        if (!ALLOWED_PANELS.has(panelKey)) return err('panelKey inválido', 400);
        if (!ALLOWED_TYPES.has(chartType)) return err('chartType inválido', 400);
        if (!statKeys) return err('statKeys inválido', 400);

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target || !canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) {
            return err('Sin permisos para administrar este club', 403);
        }

        const admin = createAdminClient();

        const { data: maxRow } = await admin
            .from('club_chart_configs')
            .select('position')
            .eq('club_id', target.clubId)
            .eq('panel_key', panelKey)
            .order('position', { ascending: false })
            .limit(1)
            .maybeSingle();
        const nextPosition = ((maxRow?.position as number | undefined) ?? -1) + 1;

        const { data, error } = await admin
            .from('club_chart_configs')
            .insert({
                club_id: target.clubId,
                panel_key: panelKey,
                position: nextPosition,
                chart_type: chartType,
                title,
                stat_keys: statKeys,
                created_by_user_id: context.userId,
            })
            .select('id, club_id, panel_key, position, chart_type, title, stat_keys, created_by_user_id, created_at, updated_at')
            .single();

        if (error) {
            return err(error.message || 'No se pudo crear el gráfico', 500);
        }

        return NextResponse.json({
            ok: true,
            data: { config: toPayload(data as ChartConfigRow) },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo crear el gráfico';
        console.error('[api/club-admin/chart-configs POST]', error);
        return err(message, 500);
    }
}
