import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeResultsApiRequest,
  describeResultsApiAuthFailure,
} from '@/lib/server/resultsApi';
import { parseLineupPayload } from '@/lib/server/lineupPayload';
import { persistMatchCenterSupplementalData } from '@/lib/services/matchCenterService';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/utils/postgrest';

/**
 * Carga de formaciones por API key.
 *
 * Existe aparte de `PATCH /api/matches/[id]` porque aquel pide SESION y ademas
 * escribe eventos, reloj y campos del partido: darle eso a una integracion
 * seria regalar el partido entero cuando lo unico que tiene que poder hacer es
 * poner los quince y los suplentes.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function jsonError(message: string, status: number, code: string, details: unknown = null) {
  return NextResponse.json({ ok: false, error: message, code, details }, { status });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeResultsApiRequest(request.headers, 'lineups:write');

  if (!auth.ok) {
    const failure = describeResultsApiAuthFailure(auth.reason);
    return jsonError(failure.message, failure.status, failure.code);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('El cuerpo del pedido no es JSON valido.', 400, 'invalid_payload');
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const rawMatchId = payload.match_id ?? payload.matchId;
  const matchId = typeof rawMatchId === 'string' ? rawMatchId.trim() : '';

  if (!matchId) {
    return jsonError('Falta match_id.', 400, 'invalid_payload');
  }

  if (!isUuid(matchId)) {
    return jsonError('match_id tiene que ser el uuid del partido.', 400, 'invalid_payload');
  }

  const { home, away, issues } = parseLineupPayload(payload);

  if (home === null && away === null && issues.length === 0) {
    return jsonError(
      'No vino ninguna formacion. Manda home y/o away, como lista de jugadores o con titulares y suplentes.',
      400,
      'invalid_payload',
    );
  }

  if (issues.length > 0) {
    return jsonError('La formacion tiene datos que no cierran.', 400, 'invalid_lineup', { issues });
  }

  try {
    const client = createAdminClient();

    // El lado que no vino NO se manda: mandarlo vacio lo borraria.
    const supplemental = await persistMatchCenterSupplementalData(client, matchId, {
      lineups: {
        ...(home ? { home } : {}),
        ...(away ? { away } : {}),
      },
    });

    if (!supplemental.persistedLineups) {
      return jsonError(
        'El partido existe pero la formacion no se pudo guardar.',
        500,
        'lineups_not_persisted',
      );
    }

    return NextResponse.json({
      ok: true,
      match_id: matchId,
      persisted: {
        home: home ? home.length : null,
        away: away ? away.length : null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No se pudo guardar la formacion.';
    // `persistMatchCenterSupplementalData` usa este texto para el partido que
    // no existe, y eso es un 404, no una falla del servidor.
    const notFound = message.includes('no existe');

    if (!notFound) {
      console.error('[results/lineups] no se pudo guardar la formacion', error);
    }

    return jsonError(
      notFound ? 'El partido que intentas actualizar no existe.' : 'No se pudo guardar la formacion.',
      notFound ? 404 : 500,
      notFound ? 'match_not_found' : 'lineups_error',
    );
  }
}
