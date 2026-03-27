import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncPhaseLabels } from '@/lib/server/phaseLabels';
import type { GroupLabel } from '@/types/phase-settings';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: tournamentId } = await params;
    const supabase = await createClient();

    const { data: tournament, error } = await supabase
        .from('tournaments')
        .select('ruleset')
        .eq('id', tournamentId)
        .single();

    if (error) {
        return NextResponse.json({ ok: false, error: 'Tournament not found' }, { status: 404 });
    }

    const ruleset = tournament.ruleset as Record<string, unknown> | null;
    const circuit = ruleset?.circuit as Record<string, unknown> | undefined;
    const globalLabels: GroupLabel[] = Array.isArray(circuit?.globalLabels)
        ? (circuit.globalLabels as GroupLabel[])
        : [];

    return NextResponse.json({ ok: true, data: globalLabels });
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: tournamentId } = await params;
    const supabase = await createClient();

    const body = await req.json().catch(() => ({}));
    const rawLabels = Array.isArray(body.labels) ? body.labels : [];

    // Sync labels through ui_labels so each gets a stable UUID
    let synced: GroupLabel[] = [];
    if (rawLabels.length > 0) {
        try {
            synced = await syncPhaseLabels(supabase, rawLabels);
        } catch (err) {
            console.error('Error syncing circuit global labels:', err);
            return NextResponse.json({ ok: false, error: 'Failed to sync labels' }, { status: 500 });
        }
    }

    // Read current ruleset
    const { data: tournament, error: fetchError } = await supabase
        .from('tournaments')
        .select('ruleset')
        .eq('id', tournamentId)
        .single();

    if (fetchError) {
        return NextResponse.json({ ok: false, error: 'Tournament not found' }, { status: 404 });
    }

    const existingRuleset = (tournament.ruleset as Record<string, unknown>) ?? {};
    const existingCircuit = (existingRuleset.circuit as Record<string, unknown>) ?? {};

    const updatedRuleset = {
        ...existingRuleset,
        circuit: {
            ...existingCircuit,
            globalLabels: synced,
        },
    };

    const { error: updateError } = await supabase
        .from('tournaments')
        .update({ ruleset: updatedRuleset })
        .eq('id', tournamentId);

    if (updateError) {
        console.error('Error updating circuit global labels:', updateError);
        return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: synced });
}
