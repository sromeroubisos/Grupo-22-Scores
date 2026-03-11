import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTournamentIds } from '@/lib/services/flashscore';
import type { FlashScoreConfig } from '@/lib/types/flashscore-integration';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const body = await request.json();
        const { tournament_url } = body;

        if (!tournament_url || typeof tournament_url !== 'string') {
            return NextResponse.json({ error: 'tournament_url is required' }, { status: 400 });
        }

        if (!tournament_url.startsWith('/')) {
            return NextResponse.json(
                { error: 'tournament_url debe ser una ruta relativa (ej: /rugby-union/argentina/top-12/)' },
                { status: 400 }
            );
        }

        const raw = await getTournamentIds(tournament_url);

        if (!raw) {
            return NextResponse.json(
                { error: 'No se pudo obtener IDs de FlashScore. Verificá que la URL sea correcta.' },
                { status: 502 }
            );
        }

        // Map FlashScore API response fields
        const resolvedConfig: FlashScoreConfig = {
            tournament_url,
            tournament_id: raw.tournament_id ?? raw.tournamentId ?? undefined,
            tournament_stage_id: raw.tournament_stage_id ?? raw.tournamentStageId ?? undefined,
            tournament_template_id: raw.tournament_template_id ?? raw.tournamentTemplateId ?? undefined,
            season_id: raw.season_id ?? raw.seasonId ?? undefined,
            linked_at: new Date().toISOString(),
        };

        // Persist to DB immediately
        const supabase = await createClient();

        const { data: existing, error: readError } = await supabase
            .from('tournaments')
            .select('ruleset')
            .eq('id', tournamentId)
            .single();

        if (readError || !existing) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        const currentRuleset = (existing as any).ruleset ?? {};
        const mergedRuleset = {
            ...currentRuleset,
            flashscore: {
                ...(currentRuleset.flashscore ?? {}),
                ...resolvedConfig,
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
