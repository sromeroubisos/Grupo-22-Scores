/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTournamentLinkedRelations } from '@/lib/services/tournamentRelatedService';
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
    supabase: Awaited<ReturnType<typeof createClient>>,
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
    const { id: tournamentId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    await writeAudit(supabase, user.id, tournamentId, 'create_relation', { relationId: data.id, payload });

    return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: tournamentId } = await params;
    const relationId = new URL(request.url).searchParams.get('id');
    if (!relationId) {
        return NextResponse.json({ error: 'Missing relation id' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    await writeAudit(supabase, user.id, tournamentId, 'update_relation', { relationId, updates });

    return NextResponse.json({ ok: true });
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: tournamentId } = await params;
    const relationId = new URL(request.url).searchParams.get('id');
    if (!relationId) {
        return NextResponse.json({ error: 'Missing relation id' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    await writeAudit(supabase, user.id, tournamentId, 'delete_relation', { relationId });

    return NextResponse.json({ ok: true });
}
