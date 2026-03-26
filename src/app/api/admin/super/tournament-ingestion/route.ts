import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { TournamentIngestionService } from '@/lib/services/tournamentIngestionService';

export async function GET(req: NextRequest) {
    try {
        await requireAdminApiUser();
        
        const { searchParams } = new URL(req.url);
        const action = searchParams.get('action');

        switch (action) {
            case 'get-sports': {
                const sports = await TournamentIngestionService.getAvailableSports();
                return NextResponse.json(sports);
            }
            case 'get-entities': {
                const sportId = searchParams.get('sportId');
                if (!sportId) return NextResponse.json({ error: 'sportId is required' }, { status: 400 });
                const entities = await TournamentIngestionService.getEntities(sportId);
                return NextResponse.json(entities);
            }
            case 'get-tournaments': {
                const sportId = searchParams.get('sportId');
                const entityId = searchParams.get('entityId');
                if (!sportId || !entityId) return NextResponse.json({ error: 'sportId and entityId are required' }, { status: 400 });
                const tournaments = await TournamentIngestionService.getTournaments(sportId, entityId);
                return NextResponse.json(tournaments);
            }
            case 'get-seasons': {
                const tournamentId = searchParams.get('tournamentId');
                if (!tournamentId) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
                const seasons = await TournamentIngestionService.getSeasons(tournamentId);
                return NextResponse.json(seasons);
            }
            case 'preview-fixtures': {
                const tournamentId = searchParams.get('tournamentId');
                const seasonId = searchParams.get('seasonId') || undefined;
                if (!tournamentId) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
                const fixtures = await TournamentIngestionService.previewFixtures(tournamentId, seasonId);
                return NextResponse.json(fixtures);
            }
            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (error: any) {
        console.error('[Tournament Ingestion API] GET Error:', error);
        return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        await requireAdminApiUser();
        
        const body = await req.json();
        const { action, ...params } = body;

        switch (action) {
            case 'create-tournament': {
                const { externalTournament, internalParams } = params;
                if (!externalTournament) return NextResponse.json({ error: 'externalTournament is required' }, { status: 400 });
                const result = await TournamentIngestionService.createFromExternal(externalTournament, internalParams || {});
                return NextResponse.json(result);
            }
            case 'link-tournament': {
                const { externalId, internalId, externalUrl } = params;
                if (!externalId || !internalId) return NextResponse.json({ error: 'externalId and internalId are required' }, { status: 400 });
                const result = await TournamentIngestionService.linkTournament(externalId, internalId, externalUrl);
                return NextResponse.json({ success: result });
            }
            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (error: any) {
        console.error('[Tournament Ingestion API] POST Error:', error);
        return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 500 });
    }
}
