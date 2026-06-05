import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import { interpretWorkbook } from '@/lib/tournamentImport/interpret';
import { commitInterpretedTournament } from '@/lib/tournamentImport/commit';
import type {
  ImportSelection,
  InterpretedTournament,
  SheetData,
} from '@/lib/tournamentImport/types';

export const dynamic = 'force-dynamic';

function err(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details: details ?? null }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  let context;
  try {
    context = await requireTournamentAdminContext(supabase);
  } catch {
    return err('Unauthorized', 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return err('Payload JSON inválido', 400);
  }

  const action = String(body.action ?? '');

  if (action === 'interpret') {
    const sheets = Array.isArray(body.sheets) ? (body.sheets as SheetData[]) : [];
    if (sheets.length === 0) return err('No se recibieron hojas para interpretar.', 400);
    try {
      const interpreted = interpretWorkbook(sheets, {
        fileName: typeof body.fileName === 'string' ? body.fileName : undefined,
        mapping:
          body.mapping && typeof body.mapping === 'object'
            ? (body.mapping as any)
            : undefined,
      });
      return NextResponse.json({ ok: true, interpreted });
    } catch (e) {
      return err('No se pudo interpretar el archivo.', 500, (e as Error)?.message);
    }
  }

  if (action === 'commit') {
    const interpreted = body.interpreted as InterpretedTournament | undefined;
    if (!interpreted || typeof interpreted !== 'object') {
      return err('Falta la estructura interpretada a confirmar.', 400);
    }
    const sel = (body.selection ?? {}) as Partial<ImportSelection>;
    const selection: ImportSelection = {
      teams: sel.teams !== false,
      zones: sel.zones !== false,
      matches: sel.matches !== false,
      players: sel.players === true,
    };
    const writer = getServiceWriter(supabase, 'admin/torneo/import');
    try {
      const result = await commitInterpretedTournament(writer, {
        interpreted,
        selection,
        userId: context.userId,
        fileName: typeof body.fileName === 'string' ? body.fileName : null,
      });
      if (!result.ok) return err(result.error || 'No se pudo crear el torneo.', 400, result);
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      return err('Error al crear el torneo.', 500, (e as Error)?.message);
    }
  }

  return err('Acción inválida.', 400);
}
