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

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeText(value: unknown) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) return err('No autenticado', 401);

        const body = await request.json();
        const clubId = normalizeText(body?.clubId);
        const panelKey = normalizeText(body?.panelKey);
        const orderedIds: unknown = body?.orderedIds;

        if (!clubId) return err('clubId requerido', 400);
        if (!ALLOWED_PANELS.has(panelKey)) return err('panelKey inválido', 400);
        if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
            return err('orderedIds requerido', 400);
        }

        const ids = orderedIds.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
        if (ids.length !== orderedIds.length) {
            return err('orderedIds inválido', 400);
        }
        if (new Set(ids).size !== ids.length) {
            return err('orderedIds tiene duplicados', 400);
        }

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target || !canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) {
            return err('Sin permisos para administrar este club', 403);
        }

        const admin = createAdminClient();

        const { data: rows, error: loadError } = await admin
            .from('club_chart_configs')
            .select('id')
            .eq('club_id', target.clubId)
            .eq('panel_key', panelKey)
            .in('id', ids);

        if (loadError) {
            return err(loadError.message || 'No se pudieron validar los gráficos', 500);
        }

        const knownIds = new Set((rows || []).map((r: { id: string }) => r.id));
        if (knownIds.size !== ids.length) {
            return err('Algunos gráficos no pertenecen a este club/panel', 400);
        }

        const updates = ids.map((id, index) =>
            admin.from('club_chart_configs').update({ position: index, updated_at: new Date().toISOString() }).eq('id', id)
        );
        const results = await Promise.all(updates);
        const failed = results.find((r) => r.error);
        if (failed?.error) {
            return err(failed.error.message || 'No se pudo reordenar', 500);
        }

        return NextResponse.json({ ok: true, data: { updated: ids.length } });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo reordenar';
        console.error('[api/club-admin/chart-configs/reorder]', error);
        return err(message, 500);
    }
}
