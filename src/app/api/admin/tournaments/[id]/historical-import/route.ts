import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { HistoricalTournamentImportService } from '@/lib/services/historicalTournamentImportService';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actorUserId = await requireAdminApiUser();
    const { id: baseTournamentId } = await params;
    const body = await request.json();
    const action = String(body?.action || 'preview');
    const rawText = String(body?.rawText || '');

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: 'rawText es obligatorio para importar una temporada historica.' },
        { status: 400 }
      );
    }

    if (action === 'preview') {
      const preview = await HistoricalTournamentImportService.preview(baseTournamentId, rawText);
      return NextResponse.json(preview);
    }

    if (action === 'confirm') {
      const result = await HistoricalTournamentImportService.confirm({
        baseTournamentId,
        actorUserId,
        rawText,
        overrides: body?.overrides || {},
        tournamentName: body?.tournamentName || null,
        displayName: body?.displayName || null,
        slug: body?.slug || null,
        publish: body?.publish === true,
      });

      if (!result.ok) {
        return NextResponse.json(result, { status: 400 });
      }

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Accion invalida.' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: message === 'Unauthorized' ? 401 : 500 }
    );
  }
}
