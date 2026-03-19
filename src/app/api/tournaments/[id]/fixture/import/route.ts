import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { FixtureService } from '@/lib/services/fixtureService';
import { FixtureImportService } from '@/lib/services/fixtureImportService';

export const dynamic = 'force-dynamic';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const actorUserId = await requireAdminApiUser();
        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const phaseId = String(formData.get('phaseId') || '');
            const file = formData.get('file');
            const pastedText = formData.get('pastedText');
            const mappingRaw = formData.get('mapping');

            if (!phaseId) {
                return NextResponse.json({ error: 'Phase ID is required' }, { status: 400 });
            }

            const mapping = typeof mappingRaw === 'string' && mappingRaw
                ? JSON.parse(mappingRaw)
                : null;

            const result = await FixtureImportService.createPreview({
                tournamentId,
                phaseId,
                actorUserId,
                file: file instanceof File ? file : null,
                pastedText: typeof pastedText === 'string' ? pastedText : null,
                mapping,
            });

            return NextResponse.json(result);
        }

        const body = await request.json();

        if (body?.action === 'confirm') {
            const result = await FixtureImportService.confirmImport({
                tournamentId,
                phaseId: body.phaseId,
                actorUserId,
                jobId: body.jobId,
                decisions: Array.isArray(body.decisions) ? body.decisions : [],
            });

            return NextResponse.json(result);
        }

        const { phaseId, matches: matchesData } = body;
        if (!phaseId || !Array.isArray(matchesData)) {
            return NextResponse.json(
                { error: 'Phase ID and matches array are required' },
                { status: 400 }
            );
        }

        const result = await FixtureService.importMatches(tournamentId, phaseId, matchesData);
        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Error in POST /api/tournaments/[id]/fixture/import:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json(
            { error: message },
            { status: message === 'Unauthorized' ? 403 : 500 }
        );
    }
}
