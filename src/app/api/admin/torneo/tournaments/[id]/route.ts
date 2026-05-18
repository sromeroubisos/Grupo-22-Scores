import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import { isScopeAllowedTournament, resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';

function err(message: string, status = 400, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

const UPDATABLE_FIELDS = [
    'name',
    'display_name',
    'status',
    'is_visible',
    'is_popular',
    'season_id',
    'country',
    'union_id',
    'sport_id',
] as const;

function getDefaultTournamentVisibilityForStatus(status: unknown): boolean | null {
    if (typeof status !== 'string') return null;

    const normalizedStatus = status.trim().toLowerCase();
    if (normalizedStatus === 'published' || normalizedStatus === 'active') return true;
    if (normalizedStatus === 'draft' || normalizedStatus === 'archived') return false;

    return null;
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    const { id } = await params;
    if (!id) return err('Falta el id del torneo', 400);

    const scope = await resolveTournamentAdminScope(supabase, context);
    if (!isScopeAllowedTournament(scope, id)) {
        return err('No tenés acceso a este torneo', 403);
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return err('Payload JSON inválido', 400);
    }

    const updates: Record<string, unknown> = {};
    for (const field of UPDATABLE_FIELDS) {
        if (body[field] !== undefined) {
            updates[field] = body[field];
        }
    }

    if (Object.keys(updates).length === 0) {
        return err('No hay campos para actualizar', 400);
    }

    if (body.is_visible === undefined) {
        const defaultVisibility = getDefaultTournamentVisibilityForStatus(updates.status);
        if (defaultVisibility !== null) {
            updates.is_visible = defaultVisibility;
        }
    }

    // Service-role: scope is already enforced above (isScopeAllowedTournament).
    // The only RLS write policy on tournaments is is_admin(), which excludes
    // gestor_torneos, so the request client would silently fail this update.
    const writer = getServiceWriter(supabase, 'admin/torneo/tournaments/[id]');
    const { data, error } = await writer
        .from('tournaments')
        .update(updates)
        .eq('id', id)
        .select('id, name, display_name, slug, sport_id, season_id, status, is_visible, is_popular, country, union_id, created_at, created_by_user_id')
        .single();

    if (error) {
        return err('No se pudo actualizar el torneo', 500, error.message);
    }

    return NextResponse.json({ data });
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    const { id } = await params;
    if (!id) return err('Falta el id del torneo', 400);

    const scope = await resolveTournamentAdminScope(supabase, context);
    if (!isScopeAllowedTournament(scope, id)) {
        return err('No tenés acceso a este torneo', 403);
    }

    // Service-role: scope already enforced above. RLS on tournaments/memberships
    // is is_admin()-only, so the request client cannot delete the tournament nor
    // the memberships of other assigned users (would orphan them).
    const writer = getServiceWriter(supabase, 'admin/torneo/tournaments/[id]');
    const { error } = await writer.from('tournaments').delete().eq('id', id);
    if (error) {
        return err('No se pudo eliminar el torneo', 500, error.message);
    }

    // Clean up every membership scoped to this tournament (creator + assigned users).
    await writer
        .from('memberships')
        .delete()
        .eq('scope_type', 'tournament')
        .eq('scope_id', id);

    return NextResponse.json({ data: { id } });
}
