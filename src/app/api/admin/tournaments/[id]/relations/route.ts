import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { getTournamentLinkedRelations } from '@/lib/services/tournamentRelatedService';
import type { LooseSupabaseClient } from '@/lib/supabase/loose';
import {
    TOURNAMENT_RELATION_DIRECTION_OPTIONS,
    TOURNAMENT_RELATION_STATUS_OPTIONS,
    TOURNAMENT_RELATION_TYPE_OPTIONS,
} from '@/lib/tournamentRelations';

function isMissingTableError(error: any) {
    return error?.code === '42P01' || String(error?.message || '').toLowerCase().includes('tournament_relations');
}

function isValidOption(value: string | null | undefined, allowed: string[]) {
    if (!value) return false;
    return allowed.includes(value);
}

const DIRECTION_VALUES = TOURNAMENT_RELATION_DIRECTION_OPTIONS.map((option) => option.value);
const STATUS_VALUES = TOURNAMENT_RELATION_STATUS_OPTIONS.map((option) => option.value);
const TYPE_VALUES = TOURNAMENT_RELATION_TYPE_OPTIONS.map((option) => option.value);

async function writeAudit(
    supabase: LooseSupabaseClient,
    userId: string,
    tournamentId: string,
    action: string,
    payload: Record<string, unknown>
) {
    try {
        await (supabase as any).from('admin_audit_log').insert({
            actor_user_id: userId,
            entity_type: 'tournament',
            entity_id: tournamentId,
            action: 'update',
            changes: {
                scope: 'tournament_relations',
                action,
                ...payload,
            },
            source: 'tournament-related-tab',
        });
    } catch {
        // Audit should not block the mutation.
    }
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const result = await getTournamentLinkedRelations(id);
    return NextResponse.json(result);
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
    const { id: tournamentId } = await params;
    const { writer: supabase, actorUserId } = await requireTournamentMutationContext(tournamentId);

    const body = await request.json();
    const linkedTournamentId = String(body.linked_tournament_id || '');
    const relationType = String(body.relation_type || '');
    const relationDirection = body.relation_direction ? String(body.relation_direction) : null;
    const relationStatus = String(body.status || 'active');
    const relationSide = body.relation_side === 'target' ? 'target' : 'source';
    const description = body.description ? String(body.description) : null;

    if (!linkedTournamentId) {
        return NextResponse.json({ error: 'linked_tournament_id is required' }, { status: 400 });
    }

    if (linkedTournamentId === tournamentId) {
        return NextResponse.json({ error: 'No se puede vincular un torneo consigo mismo.' }, { status: 400 });
    }

    if (!isValidOption(relationType, TYPE_VALUES)) {
        return NextResponse.json({ error: 'relation_type invalido' }, { status: 400 });
    }

    if (relationDirection && !isValidOption(relationDirection, DIRECTION_VALUES)) {
        return NextResponse.json({ error: 'relation_direction invalido' }, { status: 400 });
    }

    if (!isValidOption(relationStatus, STATUS_VALUES)) {
        return NextResponse.json({ error: 'status invalido' }, { status: 400 });
    }

    const payload = {
        source_tournament_id: relationSide === 'source' ? tournamentId : linkedTournamentId,
        target_tournament_id: relationSide === 'source' ? linkedTournamentId : tournamentId,
        relation_type: relationType,
        relation_direction: relationDirection,
        description,
        status: relationStatus,
    };

    const { data, error } = await (supabase as any)
        .from('tournament_relations')
        .insert(payload)
        .select('id')
        .single();

    if (error) {
        if (isMissingTableError(error)) {
            return NextResponse.json({ error: 'La tabla tournament_relations no existe todavia.' }, { status: 501 });
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAudit(supabase, actorUserId, tournamentId, 'create_relation', { relationId: data.id, payload });

    return NextResponse.json({ ok: true, id: data.id });
    } catch (error) {
        return tournamentApiErrorResponse(error);
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
    const { id: tournamentId } = await params;
    const relationId = new URL(request.url).searchParams.get('id');
    if (!relationId) {
        return NextResponse.json({ error: 'Missing relation id' }, { status: 400 });
    }

    const { writer: supabase, actorUserId } = await requireTournamentMutationContext(tournamentId);

    const body = await request.json();
    const linkedTournamentId = String(body.linked_tournament_id || '');
    const relationType = String(body.relation_type || '');
    const relationDirection = body.relation_direction ? String(body.relation_direction) : null;
    const relationStatus = String(body.status || 'active');
    const relationSide = body.relation_side === 'target' ? 'target' : 'source';
    const description = body.description ? String(body.description) : null;

    if (!linkedTournamentId || !relationType) {
        return NextResponse.json({ error: 'linked_tournament_id and relation_type are required' }, { status: 400 });
    }

    if (linkedTournamentId === tournamentId) {
        return NextResponse.json({ error: 'No se puede vincular un torneo consigo mismo.' }, { status: 400 });
    }

    if (!isValidOption(relationType, TYPE_VALUES)) {
        return NextResponse.json({ error: 'relation_type invalido' }, { status: 400 });
    }

    if (relationDirection && !isValidOption(relationDirection, DIRECTION_VALUES)) {
        return NextResponse.json({ error: 'relation_direction invalido' }, { status: 400 });
    }

    if (!isValidOption(relationStatus, STATUS_VALUES)) {
        return NextResponse.json({ error: 'status invalido' }, { status: 400 });
    }

    const updates = {
        source_tournament_id: relationSide === 'source' ? tournamentId : linkedTournamentId,
        target_tournament_id: relationSide === 'source' ? linkedTournamentId : tournamentId,
        relation_type: relationType,
        relation_direction: relationDirection,
        description,
        status: relationStatus,
        updated_at: new Date().toISOString(),
    };

    const { error } = await (supabase as any)
        .from('tournament_relations')
        .update(updates)
        .eq('id', relationId);

    if (error) {
        if (isMissingTableError(error)) {
            return NextResponse.json({ error: 'La tabla tournament_relations no existe todavia.' }, { status: 501 });
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAudit(supabase, actorUserId, tournamentId, 'update_relation', { relationId, updates });

    return NextResponse.json({ ok: true });
    } catch (error) {
        return tournamentApiErrorResponse(error);
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
    const { id: tournamentId } = await params;
    const relationId = new URL(request.url).searchParams.get('id');
    if (!relationId) {
        return NextResponse.json({ error: 'Missing relation id' }, { status: 400 });
    }

    const { writer: supabase, actorUserId } = await requireTournamentMutationContext(tournamentId);

    const { error } = await (supabase as any)
        .from('tournament_relations')
        .delete()
        .eq('id', relationId);

    if (error) {
        if (isMissingTableError(error)) {
            return NextResponse.json({ error: 'La tabla tournament_relations no existe todavia.' }, { status: 501 });
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAudit(supabase, actorUserId, tournamentId, 'delete_relation', { relationId });

    return NextResponse.json({ ok: true });
    } catch (error) {
        return tournamentApiErrorResponse(error);
    }
}
