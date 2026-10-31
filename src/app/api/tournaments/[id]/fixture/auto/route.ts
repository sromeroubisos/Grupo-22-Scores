import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { invalidateMatchesFeedCaches } from '@/lib/server/matchesFeedInvalidation';
import { APP_TIMEZONE, combineLocalDateTimeToUtcIso } from '@/lib/timezone';
import {
  placeInSlots,
  planRounds,
  validateSlotConfig,
  type PairingScope,
  type SlotConfig,
} from '@/lib/fixture/autoFixture';

export const dynamic = 'force-dynamic';

type AutoFixtureBody = {
  phaseId?: string;
  /** `preview` no escribe nada; `commit` guarda. */
  mode?: 'preview' | 'commit';
  teams?: Array<{ id: string; groupId?: string | null }>;
  scope?: PairingScope;
  legs?: number;
  seed?: number;
  slots?: Partial<SlotConfig>;
  /** Borra antes los partidos sin jugar de la fase. */
  replace?: boolean;
};

const SCOPES: PairingScope[] = ['within_groups', 'between_groups', 'all'];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tournamentId = (await params).id;
    const { writer: db } = await requireTournamentMutationContext(tournamentId);
    const body = (await request.json()) as AutoFixtureBody;

    const scope = SCOPES.includes(body.scope as PairingScope) ? (body.scope as PairingScope) : 'all';
    const teams = (body.teams ?? []).filter((t) => t && typeof t.id === 'string' && t.id);
    if (!body.phaseId) return NextResponse.json({ error: 'Falta la fase.' }, { status: 400 });
    if (teams.length < 2) return NextResponse.json({ error: 'Se necesitan al menos 2 equipos.' }, { status: 400 });

    const slots: SlotConfig = {
      startDate: String(body.slots?.startDate ?? ''),
      weekdays: Array.isArray(body.slots?.weekdays) ? body.slots!.weekdays!.map(Number) : [],
      windowStart: String(body.slots?.windowStart ?? ''),
      windowEnd: String(body.slots?.windowEnd ?? ''),
      durationMin: Number(body.slots?.durationMin ?? 0),
      gapMin: Number(body.slots?.gapMin ?? 0),
      venues: Array.isArray(body.slots?.venues) ? body.slots!.venues!.map(String) : [],
      skipDates: Array.isArray(body.slots?.skipDates) ? body.slots!.skipDates!.map(String) : [],
      endDate: body.slots?.endDate ? String(body.slots.endDate) : null,
      seed: typeof body.seed === 'number' ? body.seed : undefined,
      simultaneous: body.slots?.simultaneous === 'last_round' || body.slots?.simultaneous === 'all_rounds' ? body.slots.simultaneous : 'none',
    };
    const problems = validateSlotConfig(slots);
    if (problems.length > 0) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

    const rounds = planRounds({ teams, scope, legs: Number(body.legs ?? 1), seed: slots.seed });
    if (rounds.length === 0) {
      return NextResponse.json(
        { error: scope === 'between_groups' ? 'Para cruzar zonas hacen falta al menos dos zonas con equipos.' : 'No hay cruces para generar.' },
        { status: 400 },
      );
    }
    const placement = placeInSlots(rounds, slots);

    if (body.mode !== 'commit') {
      return NextResponse.json({ ok: true, rounds, placement });
    }

    const { data: phase } = await db
      .from('tournament_phases')
      .select('id, season_id')
      .eq('id', body.phaseId)
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (!phase) return NextResponse.json({ error: 'La fase no pertenece al torneo.' }, { status: 400 });
    const seasonId = phase.season_id ?? null;

    if (body.replace) {
      const { error: delMatches } = await db
        .from('matches')
        .delete()
        .eq('phase_id', body.phaseId)
        .eq('status', 'scheduled');
      if (delMatches) throw delMatches;
      const { data: leftover } = await db.from('matches').select('round_uuid').eq('phase_id', body.phaseId);
      const used = new Set((leftover ?? []).map((m: { round_uuid: string | null }) => m.round_uuid).filter(Boolean));
      const { data: oldRounds } = await db.from('tournament_rounds').select('id').eq('phase_id', body.phaseId);
      const empty = (oldRounds ?? []).map((r: { id: string }) => r.id).filter((id: string) => !used.has(id));
      if (empty.length > 0) await db.from('tournament_rounds').delete().in('id', empty);
    }

    const { count: existingRounds } = await db
      .from('tournament_rounds')
      .select('id', { count: 'exact', head: true })
      .eq('phase_id', body.phaseId);
    const offset = existingRounds ?? 0;

    const roundIds = new Map<number, string>();
    for (const round of rounds) {
      const { data, error } = await db
        .from('tournament_rounds')
        .insert({
          phase_id: body.phaseId,
          season_id: seasonId,
          name: `Fecha ${offset + round.number}`,
          order_index: offset + round.number,
        })
        .select('id')
        .single();
      if (error) throw error;
      roundIds.set(round.number, data.id);
    }

    const rows = placement.placed.map((p) => {
      const dateTime = combineLocalDateTimeToUtcIso(p.date, p.time, APP_TIMEZONE);
      if (!dateTime) throw new Error('No se pudo construir la fecha de uno de los partidos.');
      return {
        tournament_id: tournamentId,
        season_id: seasonId,
        phase_id: body.phaseId,
        round_uuid: roundIds.get(p.roundNumber),
        group_id: p.groupId,
        home_club_id: p.homeId,
        away_club_id: p.awayId,
        date_time: dateTime,
        venue: p.venue ?? '',
        status: 'scheduled',
        score: { home: 0, away: 0 },
      };
    });
    const { data: inserted, error: insertError } = await db.from('matches').insert(rows).select('id');
    if (insertError) throw insertError;
    if ((inserted ?? []).length !== rows.length) throw new Error('No se pudieron guardar todos los partidos.');

    try {
      await invalidateMatchesFeedCaches(db);
    } catch (error) {
      console.error('[fixture/auto] no se pudo invalidar el feed:', error);
    }

    return NextResponse.json({ ok: true, rounds: rounds.length, matches: rows.length, placement });
  } catch (error: unknown) {
    console.error('Error in POST /api/tournaments/[id]/fixture/auto:', error);
    return tournamentApiErrorResponse(error);
  }
}
