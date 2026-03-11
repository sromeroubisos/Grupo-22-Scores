import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('tournaments')
            .select('ruleset')
            .eq('id', tournamentId)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        const ruleset = (data as any).ruleset ?? {};
        const config = ruleset.flashscore ?? null;

        return NextResponse.json({ config });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const body = await request.json();
        const { config } = body;

        if (!config || typeof config !== 'object') {
            return NextResponse.json({ error: 'config object is required' }, { status: 400 });
        }

        const supabase = await createClient();

        // Read current ruleset to merge
        const { data: existing, error: readError } = await supabase
            .from('tournaments')
            .select('ruleset')
            .eq('id', tournamentId)
            .single();

        if (readError || !existing) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        const currentRuleset = (existing as any).ruleset ?? {};
        const currentFlashscore = currentRuleset.flashscore ?? {};

        const mergedRuleset = {
            ...currentRuleset,
            flashscore: {
                ...currentFlashscore,
                ...config,
            },
        };

        const { error: updateError } = await supabase
            .from('tournaments')
            .update({ ruleset: mergedRuleset } as any)
            .eq('id', tournamentId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ config: mergedRuleset.flashscore });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
