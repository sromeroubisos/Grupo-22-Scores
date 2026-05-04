import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { getTournamentIds } from '@/lib/services/flashscore';
import type { FlashScoreConfig } from '@/lib/types/flashscore-integration';
import {
    getTournamentFlashScoreConfig,
    withFlashScoreRuleset,
} from '@/lib/externalProviderPolicy';

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

        const { writer: supabase } = await requireTournamentMutationContext(tournamentId);

        const { data: existing, error: readError } = await supabase
            .from('tournaments')
            .select('ruleset, sport_id, sport')
            .eq('id', tournamentId)
            .single();

        if (readError || !existing) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        const raw = await getTournamentIds(tournament_url);

        if (!raw) {
            return NextResponse.json(
                { error: 'No se pudo obtener IDs de FlashScore. Verifica que la URL sea correcta.' },
                { status: 502 }
            );
        }

        const resolvedConfig: FlashScoreConfig = {
            tournament_url,
            tournament_id: raw.tournament_id ?? raw.tournamentId ?? undefined,
            tournament_stage_id: raw.tournament_stage_id ?? raw.tournamentStageId ?? undefined,
            tournament_template_id: raw.tournament_template_id ?? raw.tournamentTemplateId ?? undefined,
            season_id: raw.season_id ?? raw.seasonId ?? undefined,
            linked_at: new Date().toISOString(),
        };

        const mergedRuleset = withFlashScoreRuleset((existing as any).ruleset, resolvedConfig);

        const { error: updateError } = await supabase
            .from('tournaments')
            .update({ ruleset: mergedRuleset } as any)
            .eq('id', tournamentId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        const config = getTournamentFlashScoreConfig({ ...existing, ruleset: mergedRuleset });
        return NextResponse.json({ config });
    } catch (err: unknown) {
        return tournamentApiErrorResponse(err);
    }
}
