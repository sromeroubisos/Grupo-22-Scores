import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeResultsApiRequest,
  describeResultsApiAuthFailure,
} from '@/lib/server/resultsApi';
import {
  issueFixtureDraftToken,
  verifyFixtureDraftToken,
  type FixtureDraftPlan,
} from '@/lib/server/fixtureDraftToken';
import { resolveClubName } from '@/lib/integrations/whatsappMatchSync';
import { FixtureService } from '@/lib/services/fixtureService';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/utils/postgrest';

/**
 * Alta de partido por API key, en dos pasos.
 *
 * Un bot resolviendo nombres contra el catalogo se equivoca: hay clubes
 * duplicados, filiales que se llaman casi igual y torneos con el mismo nombre
 * en distintas temporadas. Un POST que crea al toque deja partidos colgados del
 * torneo equivocado, y borrarlos despues es peor que no haberlos creado.
 *
 * Por eso el primer pedido NO crea: contesta que entendio — que torneo, que
 * clubes, que fase— y si ya hay un partido parecido. Devuelve un
 * confirmation_token firmado, y recien el segundo pedido, con ese token,
 * inserta. El token lleva el plan adentro, asi que se crea lo que se mostro.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Un partido del mismo par dentro de esta ventana se reporta como posible duplicado. */
const DUPLICATE_WINDOW_DAYS = 3;

function jsonError(message: string, status: number, code: string, details: unknown = null) {
  return NextResponse.json({ ok: false, error: message, code, details }, { status });
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

type ClubResolution = Awaited<ReturnType<typeof resolveClubName>>;

function serializeClub(resolution: ClubResolution) {
  return {
    input: resolution.input,
    club_id: resolution.matchedClubId,
    club_name: resolution.matchedClubName,
    confidence: resolution.confidence,
    ambiguous: resolution.ambiguous,
    alternatives: resolution.alternatives,
  };
}

async function createFromPlan(plan: FixtureDraftPlan) {
  const match = await FixtureService.createMatch({
    tournamentId: plan.tournamentId,
    phaseId: plan.phaseId,
    roundId: null,
    roundLabel: plan.roundLabel ?? undefined,
    homeClubId: plan.homeClubId,
    awayClubId: plan.awayClubId,
    dateTime: plan.dateTime,
    venue: plan.venue,
    status: 'scheduled',
  });

  if (!match) {
    throw new Error('El partido no se pudo crear.');
  }

  return match;
}

export async function POST(request: NextRequest) {
  const auth = await authorizeResultsApiRequest(request.headers, 'matches:create');

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
  const confirmationToken = text(payload.confirmation_token);

  // --- Paso 2: viene el token, se crea lo que el paso 1 mostro ---------------
  if (confirmationToken) {
    const verification = verifyFixtureDraftToken(confirmationToken, auth.keyId);

    if (!verification.ok) {
      const message =
        verification.reason === 'expired'
          ? 'El plan vencio. Volve a pedirlo sin confirmation_token y confirma el nuevo.'
          : verification.reason === 'other_key'
            ? 'Ese plan lo pidio otra API key.'
            : 'El confirmation_token no es valido. Pedi el plan de nuevo.';

      return jsonError(message, 400, `token_${verification.reason}`);
    }

    try {
      const match = await createFromPlan(verification.plan);

      return NextResponse.json({
        ok: true,
        created: true,
        match_id: match.id,
        plan: verification.plan,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'El partido no se pudo crear.';
      console.error('[results/fixtures] no se pudo crear el partido', error);
      // Los mensajes de FixtureService estan escritos para una persona ("La
      // fase seleccionada no pertenece al torneo activo"), asi que sirven tal
      // cual para que el bot entienda que corregir.
      return jsonError(message, 422, 'create_failed');
    }
  }

  // --- Paso 1: resolver y proponer -----------------------------------------
  const tournamentInput = text(payload.tournament) || text(payload.tournament_id);
  const homeInput = text(payload.home_team);
  const awayInput = text(payload.away_team);
  const date = text(payload.match_date) || text(payload.date);
  const time = text(payload.time) || '00:00';
  const venue = text(payload.venue);
  const roundLabel = text(payload.round) || text(payload.round_label);
  const requestedPhaseId = text(payload.phase_id);

  const missing = [
    !tournamentInput ? 'tournament' : null,
    !homeInput ? 'home_team' : null,
    !awayInput ? 'away_team' : null,
    !date ? 'match_date' : null,
  ].filter((field): field is string => field !== null);

  if (missing.length > 0) {
    return jsonError(`Faltan datos: ${missing.join(', ')}.`, 400, 'invalid_payload', { missing });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError('match_date va como YYYY-MM-DD.', 400, 'invalid_payload');
  }

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return jsonError('time va como HH:mm.', 400, 'invalid_payload');
  }

  const client = createAdminClient();

  try {
    // 1. El torneo. Por uuid es exacto; por nombre puede haber varios.
    let tournamentRows: Array<{ id: string; name: string; status: string | null }> = [];

    if (isUuid(tournamentInput)) {
      const { data, error } = await client
        .from('tournaments')
        .select('id, name, status')
        .eq('id', tournamentInput)
        .maybeSingle();
      if (error) throw error;
      tournamentRows = data ? [data as { id: string; name: string; status: string | null }] : [];
    } else {
      const { data, error } = await client
        .from('tournaments')
        .select('id, name, status')
        .ilike('name', `%${tournamentInput}%`)
        .limit(10);
      if (error) throw error;
      tournamentRows = (data ?? []) as Array<{ id: string; name: string; status: string | null }>;
    }

    const usableTournaments = tournamentRows.filter(
      (row) => row.status !== 'archived' && row.status !== 'deleted',
    );

    if (usableTournaments.length === 0) {
      return jsonError(
        `No hay ningun torneo que coincida con "${tournamentInput}". Busca primero con searchResultsTournaments.`,
        404,
        'tournament_not_found',
      );
    }

    if (usableTournaments.length > 1) {
      return jsonError(
        `"${tournamentInput}" coincide con ${usableTournaments.length} torneos. Repeti el pedido con tournament_id.`,
        409,
        'tournament_ambiguous',
        { tournaments: usableTournaments },
      );
    }

    const tournament = usableTournaments[0];

    // 2. La fase. Con una sola no hay nada que preguntar.
    const { data: phaseRows, error: phasesError } = await client
      .from('tournament_phases')
      .select('id, name, phase_type')
      .eq('tournament_id', tournament.id)
      .order('name');
    if (phasesError) throw phasesError;

    const phases = (phaseRows ?? []) as Array<{
      id: string;
      name: string;
      phase_type: string | null;
    }>;

    if (phases.length === 0) {
      return jsonError(
        `El torneo "${tournament.name}" todavia no tiene ninguna fase. Hay que crearla desde el gestor.`,
        422,
        'tournament_without_phase',
      );
    }

    const phase = requestedPhaseId
      ? phases.find((row) => row.id === requestedPhaseId)
      : phases.length === 1
        ? phases[0]
        : undefined;

    if (!phase) {
      return jsonError(
        requestedPhaseId
          ? 'Esa fase no pertenece al torneo.'
          : `El torneo "${tournament.name}" tiene ${phases.length} fases. Repeti el pedido con phase_id.`,
        409,
        'phase_required',
        { phases },
      );
    }

    // 3. Los clubes.
    const [home, away] = await Promise.all([
      resolveClubName(client, homeInput),
      resolveClubName(client, awayInput),
    ]);

    const unresolved = [
      !home.matchedClubId || home.ambiguous || home.confidence === 'baja'
        ? serializeClub(home)
        : null,
      !away.matchedClubId || away.ambiguous || away.confidence === 'baja'
        ? serializeClub(away)
        : null,
    ].filter((entry) => entry !== null);

    if (unresolved.length > 0) {
      return jsonError(
        'No pude identificar con seguridad a los dos clubes. Mira las alternativas y repeti con el nombre exacto.',
        409,
        'clubs_unresolved',
        { clubs: unresolved },
      );
    }

    if (home.matchedClubId === away.matchedClubId) {
      return jsonError(
        `Los dos nombres resuelven al mismo club (${home.matchedClubName}).`,
        409,
        'same_club',
      );
    }

    // 4. Un partido igual ya cargado. No corta el alta: se avisa y decide quien
    //    confirma, porque una ida y vuelta el mismo fin de semana es legitima.
    const from = new Date(`${date}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - DUPLICATE_WINDOW_DAYS);
    const to = new Date(`${date}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + DUPLICATE_WINDOW_DAYS);

    const { data: nearbyRows, error: nearbyError } = await client
      .from('matches')
      .select('id, date_time, status, home_club_id, away_club_id')
      .eq('tournament_id', tournament.id)
      .gte('date_time', from.toISOString())
      .lte('date_time', to.toISOString())
      .limit(50);
    if (nearbyError) throw nearbyError;

    const pair = [home.matchedClubId, away.matchedClubId];
    const duplicates = (
      (nearbyRows ?? []) as Array<{
        id: string;
        date_time: string;
        status: string | null;
        home_club_id: string | null;
        away_club_id: string | null;
      }>
    ).filter(
      (row) =>
        row.home_club_id &&
        row.away_club_id &&
        pair.includes(row.home_club_id) &&
        pair.includes(row.away_club_id),
    );

    const plan: FixtureDraftPlan = {
      tournamentId: tournament.id,
      phaseId: phase.id,
      roundLabel: roundLabel || null,
      homeClubId: home.matchedClubId as string,
      awayClubId: away.matchedClubId as string,
      dateTime: `${date}T${time}:00`,
      venue,
    };

    return NextResponse.json({
      ok: true,
      created: false,
      confirmation_token: issueFixtureDraftToken(plan, auth.keyId),
      expires_in_seconds: 900,
      resolved: {
        tournament: { id: tournament.id, name: tournament.name },
        phase: { id: phase.id, name: phase.name },
        round_label: plan.roundLabel,
        home: serializeClub(home),
        away: serializeClub(away),
        date_time_local: plan.dateTime,
        venue: plan.venue || null,
      },
      warnings:
        duplicates.length > 0
          ? [
              {
                code: 'possible_duplicate',
                message: `Ya hay ${duplicates.length} partido(s) de estos dos clubes en este torneo dentro de los ${DUPLICATE_WINDOW_DAYS} dias. Revisa antes de confirmar.`,
                matches: duplicates,
              },
            ]
          : [],
      next_step:
        'Mostrale esto a la persona. Si esta bien, repeti el pedido con confirmation_token y nada mas.',
    });
  } catch (error: unknown) {
    console.error('[results/fixtures] no se pudo armar el plan', error);
    return jsonError('No se pudo resolver el partido.', 500, 'fixture_plan_error');
  }
}
