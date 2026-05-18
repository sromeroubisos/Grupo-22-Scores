import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import {
    isScopeAllowedClub,
    isScopeAllowedTournament,
    resolveTournamentAdminScope,
} from '@/lib/auth/tournamentAdminScope';
import { canAddTeamToTournament, getUserPlanContext } from '@/lib/billing/subscriptions';

function err(message: string, status = 400, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

export async function GET(
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

    // Service-role: scope already enforced. Reading via the request client would
    // drop the joined club row for draft/hidden clubs (clubs RLS = is_visible).
    const reader = getServiceWriter(supabase, 'admin/torneo/participants');
    const { data, error } = await reader
        .from('tournament_participants')
        .select('id, tournament_id, club_id, name, status, clubs:club_id (id, name, slug, logo_url)')
        .eq('tournament_id', id)
        .order('created_at', { ascending: false });

    if (error) {
        return err('No se pudieron cargar los participantes', 500, error.message);
    }

    return NextResponse.json({ data: data ?? [] });
}

export async function POST(
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

    const { id: tournamentId } = await params;
    if (!tournamentId) return err('Falta el id del torneo', 400);

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return err('Payload JSON inválido', 400);
    }

    const clubId = String(body.club_id ?? '').trim();
    if (!clubId) return err('club_id es requerido', 400);

    const scope = await resolveTournamentAdminScope(supabase, context);
    if (!isScopeAllowedTournament(scope, tournamentId)) {
        return err('No tenés acceso a este torneo', 403);
    }
    if (!isScopeAllowedClub(scope, clubId)) {
        return err('No tenés acceso a este club', 403);
    }

    // Service-role: scope already enforced (isScopeAllowedTournament/Club).
    // RLS would hide draft clubs/tournaments and block the participant insert.
    const writer = getServiceWriter(supabase, 'admin/torneo/participants');

    const { data: club, error: clubError } = await writer
        .from('clubs')
        .select('id, name, short_name')
        .eq('id', clubId)
        .maybeSingle();

    if (clubError || !club) {
        return err('Club no encontrado', 404);
    }

    const { data: existing } = await writer
        .from('tournament_participants')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('club_id', clubId)
        .maybeSingle();

    if (existing) {
        return err('El club ya está vinculado a este torneo', 409);
    }

    const { data: tournamentRow } = await writer
        .from('tournaments')
        .select('created_by_user_id')
        .eq('id', tournamentId)
        .maybeSingle();
    const ownerId = (tournamentRow?.created_by_user_id as string | null | undefined) ?? context.userId;
    const planCtx = ownerId === context.userId
        ? await getUserPlanContext(supabase, context.userId, context.rawRole)
        : await getUserPlanContext(supabase, ownerId);

    const { count: currentParticipantsCount } = await writer
        .from('tournament_participants')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId);

    const planCheck = canAddTeamToTournament(planCtx, currentParticipantsCount ?? 0);
    if (!planCheck.allowed) {
        return err(planCheck.reason ?? 'Tu plan no permite vincular más equipos a este torneo.', 402, {
            requiredPlan: planCheck.requiredPlan ?? null,
            currentPlan: planCtx.tier,
            limit: planCtx.plan.limits.maxTeamsPerTournament,
            current: currentParticipantsCount ?? 0,
        });
    }

    const { data, error } = await writer
        .from('tournament_participants')
        .insert([{
            tournament_id: tournamentId,
            club_id: clubId,
            name: club.name,
            short_code: club.short_name ?? null,
            type: 'club',
            status: 'active',
        }])
        .select('id, tournament_id, club_id, name, status')
        .single();

    if (error) {
        return err('No se pudo vincular el club al torneo', 500, error.message);
    }

    return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(
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

    const { id: tournamentId } = await params;
    if (!tournamentId) return err('Falta el id del torneo', 400);

    const { searchParams } = new URL(request.url);
    const participantId = searchParams.get('participantId');
    if (!participantId) return err('Falta participantId', 400);

    const scope = await resolveTournamentAdminScope(supabase, context);
    if (!isScopeAllowedTournament(scope, tournamentId)) {
        return err('No tenés acceso a este torneo', 403);
    }

    // Service-role: scope already enforced. RLS on tournament_participants
    // delete is is_admin()-only, so the request client cannot unlink.
    const writer = getServiceWriter(supabase, 'admin/torneo/participants');
    const { error } = await writer
        .from('tournament_participants')
        .delete()
        .eq('id', participantId)
        .eq('tournament_id', tournamentId);

    if (error) {
        return err('No se pudo desvincular el club', 500, error.message);
    }

    return NextResponse.json({ data: { id: participantId } });
}
