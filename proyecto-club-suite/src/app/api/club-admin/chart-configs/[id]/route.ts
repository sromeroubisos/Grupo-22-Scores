import { NextRequest, NextResponse } from 'next/server';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

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

async function loadConfig(id: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('club_chart_configs')
        .select('id, club_id, panel_key, position, chart_type, title, stat_keys, created_by_user_id, created_at, updated_at')
        .eq('id', id)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'No se pudo cargar el gráfico');
    }
    return data as ChartConfigRow | null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        if (!id) return err('id requerido', 400);

        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) return err('No autenticado', 401);

        const existing = await loadConfig(id);
        if (!existing) return err('Gráfico no encontrado', 404);

        const target = await getClubManagementTarget(supabase, existing.club_id);
        if (!target || !canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) {
            return err('Sin permisos para administrar este club', 403);
        }

        const body = await request.json();
        const update: Record<string, unknown> = {};

        if (body?.chartType !== undefined) {
            const chartType = normalizeText(body.chartType);
            if (!ALLOWED_TYPES.has(chartType)) return err('chartType inválido', 400);
            update.chart_type = chartType;
        }

        if (body?.statKeys !== undefined) {
            const statKeys = normalizeStatKeys(body.statKeys);
            if (!statKeys) return err('statKeys inválido', 400);
            update.stat_keys = statKeys;
        }

        if (body?.title !== undefined) {
            update.title = body.title === null ? null : normalizeText(body.title) || null;
        }

        if (Object.keys(update).length === 0) {
            return err('Nada para actualizar', 400);
        }

        update.updated_at = new Date().toISOString();

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('club_chart_configs')
            .update(update)
            .eq('id', id)
            .select('id, club_id, panel_key, position, chart_type, title, stat_keys, created_by_user_id, created_at, updated_at')
            .single();

        if (error) {
            return err(error.message || 'No se pudo actualizar el gráfico', 500);
        }

        return NextResponse.json({
            ok: true,
            data: { config: toPayload(data as ChartConfigRow) },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo actualizar el gráfico';
        console.error('[api/club-admin/chart-configs PATCH]', error);
        return err(message, 500);
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        if (!id) return err('id requerido', 400);

        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) return err('No autenticado', 401);

        const existing = await loadConfig(id);
        if (!existing) return err('Gráfico no encontrado', 404);

        const target = await getClubManagementTarget(supabase, existing.club_id);
        if (!target || !canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) {
            return err('Sin permisos para administrar este club', 403);
        }

        const admin = createAdminClient();
        const { error } = await admin.from('club_chart_configs').delete().eq('id', id);
        if (error) {
            return err(error.message || 'No se pudo eliminar el gráfico', 500);
        }

        return NextResponse.json({ ok: true, data: { deleted: true } });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo eliminar el gráfico';
        console.error('[api/club-admin/chart-configs DELETE]', error);
        return err(message, 500);
    }
}
