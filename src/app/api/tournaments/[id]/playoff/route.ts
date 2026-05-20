import { NextRequest, NextResponse } from 'next/server';
import {
  requireTournamentMutationContext,
  tournamentApiErrorResponse,
} from '@/lib/auth/tournamentApi';
import { invalidateMatchesFeedCaches } from '@/lib/server/matchesFeedInvalidation';
import {
  clearPlayoffBracket,
  generatePlayoffBracket,
  loadPlayoffBracket,
  reschedulePlayoffBracket,
  reseedPlayoffBracket,
} from '@/lib/server/playoffBracket';
import { listPlayoffTemplates, type PlayoffTemplateId } from '@/lib/playoff/templates';
import { readPlayoffSeedingConfig } from '@/lib/playoff/seedingFromStandings';
import { createClient } from '@/lib/supabase/server';

/** Group-stage phases of a tournament that can seed a playoff bracket. */
async function loadSourcePhases(supabase: any, tournamentId: string) {
  const { data } = await supabase
    .from('tournament_phases')
    .select('id, name, phase_type, order_index')
    .eq('tournament_id', tournamentId)
    .order('order_index', { ascending: true });
  return (data ?? [])
    .filter((p: any) => p.phase_type === 'group_stage')
    .map((p: any) => ({ id: p.id, name: p.name }));
}

export const dynamic = 'force-dynamic';

/**
 * GET  /api/tournaments/:id/playoff?phaseId=...   -> bracket board + templates
 * POST /api/tournaments/:id/playoff               -> generate | regenerate | clear
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: tournamentId } = await params;
    const phaseId = request.nextUrl.searchParams.get('phaseId');
    const templates = listPlayoffTemplates();

    if (!phaseId) {
      return NextResponse.json({ ok: true, templates, board: { hasBracket: false, cups: [] } });
    }

    const supabase = await createClient();
    const [board, sourcePhases, { data: phaseRow }] = await Promise.all([
      loadPlayoffBracket(supabase, phaseId),
      loadSourcePhases(supabase, tournamentId),
      supabase.from('tournament_phases').select('settings').eq('id', phaseId).maybeSingle(),
    ]);
    const seeding = readPlayoffSeedingConfig(phaseRow?.settings);
    return NextResponse.json({ ok: true, templates, board, seeding, sourcePhases });
  } catch (error: unknown) {
    return tournamentApiErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: tournamentId } = await params;
    const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
    const body = await request.json().catch(() => ({}));

    const action: string = body.action || 'generate';
    const phaseId: string | undefined = body.phaseId;

    if (!phaseId) {
      return NextResponse.json({ ok: false, error: 'Falta phaseId.' }, { status: 400 });
    }

    // Verify the phase belongs to this tournament.
    const { data: phase, error: phaseError } = await supabase
      .from('tournament_phases')
      .select('id, tournament_id, season_id, phase_type, settings')
      .eq('id', phaseId)
      .eq('tournament_id', tournamentId)
      .maybeSingle();

    if (phaseError || !phase) {
      return NextResponse.json({ ok: false, error: 'Fase no encontrada.' }, { status: 404 });
    }

    const baseSettings =
      phase.settings && typeof phase.settings === 'object' ? phase.settings : {};

    // Persist / clear the zone-stage classification source for this playoff.
    if (action === 'setSeeding') {
      const sourcePhaseId = String(body.sourcePhaseId ?? '').trim();
      const format = body.format === 'zone_rank' ? 'zone_rank' : 'overall';
      const nextSettings = sourcePhaseId
        ? { ...baseSettings, playoffSeeding: { sourcePhaseId, format, locked: false } }
        : (() => {
            const s = { ...baseSettings } as Record<string, unknown>;
            delete s.playoffSeeding;
            return s;
          })();
      const { error } = await supabase
        .from('tournament_phases')
        .update({ settings: nextSettings })
        .eq('id', phaseId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, seeding: readPlayoffSeedingConfig(nextSettings) });
    }

    if (action === 'reseed') {
      const result = await reseedPlayoffBracket(supabase, { phaseId });
      if (!result.ok) {
        const status = result.code === 'missing_migration' ? 503 : 400;
        return NextResponse.json({ ok: false, ...result }, { status });
      }
      await invalidateMatchesFeedCaches();
      const board = await loadPlayoffBracket(supabase, phaseId);
      return NextResponse.json({ ok: true, reseeded: result.reseeded, board });
    }

    if (action === 'closeZones' || action === 'reopenZones') {
      const current = readPlayoffSeedingConfig(baseSettings);
      if (!current) {
        return NextResponse.json(
          { ok: false, error: 'Esta fase no tiene configurada una clasificación desde zonas.' },
          { status: 400 },
        );
      }
      // Closing does a final reseed first so the bracket reflects the final
      // standings before it is frozen.
      if (action === 'closeZones') {
        await reseedPlayoffBracket(supabase, { phaseId });
      }
      const nextSettings = {
        ...baseSettings,
        playoffSeeding: { ...current, locked: action === 'closeZones' },
      };
      const { error } = await supabase
        .from('tournament_phases')
        .update({ settings: nextSettings })
        .eq('id', phaseId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      await invalidateMatchesFeedCaches();
      const board = await loadPlayoffBracket(supabase, phaseId);
      return NextResponse.json({ ok: true, seeding: readPlayoffSeedingConfig(nextSettings), board });
    }

    if (action === 'reschedule') {
      const result = await reschedulePlayoffBracket(supabase, {
        phaseId,
        config: body.schedule || { mode: 'manual' },
        force: Boolean(body.force),
      });
      if (!result.ok) {
        const status = result.code === 'missing_migration' ? 503 : 400;
        return NextResponse.json({ ok: false, ...result }, { status });
      }
      await invalidateMatchesFeedCaches();
      const board = await loadPlayoffBracket(supabase, phaseId);
      return NextResponse.json({ ok: true, scheduled: result.scheduled, board });
    }

    if (action === 'clear') {
      const result = await clearPlayoffBracket(supabase, {
        phaseId,
        force: Boolean(body.force),
      });
      if (!result.ok) {
        const status = result.code === 'has_results' ? 409 : 400;
        return NextResponse.json({ ok: false, ...result }, { status });
      }
      await invalidateMatchesFeedCaches();
      return NextResponse.json({ ok: true });
    }

    // generate | regenerate (regenerate just forces the clear).
    const templateId = body.templateId as PlayoffTemplateId;
    const isCustom = templateId === 'custom';
    const teamCount = Number(body.teamCount);
    if (!templateId) {
      return NextResponse.json(
        { ok: false, error: 'Configuración inválida: falta templateId.' },
        { status: 400 },
      );
    }
    if (!isCustom && (!Number.isFinite(teamCount) || teamCount < 2)) {
      return NextResponse.json(
        { ok: false, error: 'Configuración inválida: teamCount es obligatorio.' },
        { status: 400 },
      );
    }
    if (isCustom && (!body.customSpec || typeof body.customSpec !== 'object')) {
      return NextResponse.json(
        { ok: false, error: 'La estructura personalizada requiere customSpec.' },
        { status: 400 },
      );
    }

    const result = await generatePlayoffBracket(supabase, {
      tournamentId,
      phaseId,
      seasonId: phase.season_id ?? null,
      config: {
        templateId,
        teamCount: Number.isFinite(teamCount) ? teamCount : 0,
        cupNames: body.cupNames && typeof body.cupNames === 'object' ? body.cupNames : undefined,
        thirdPlace: body.thirdPlace !== false,
        seedMode: body.seedMode === 'random' ? 'random' : 'seed',
        customSpec: isCustom ? body.customSpec : undefined,
      },
      schedule: body.schedule || { mode: 'manual' },
      force: action === 'regenerate' || Boolean(body.force),
    });

    if (!result.ok) {
      const status =
        result.code === 'has_results' ? 409 : result.code === 'missing_migration' ? 503 : 400;
      return NextResponse.json({ ok: false, ...result }, { status });
    }

    await invalidateMatchesFeedCaches();
    const board = await loadPlayoffBracket(supabase, phaseId);
    return NextResponse.json({
      ok: true,
      matchesCreated: result.matchesCreated,
      rulesCreated: result.rulesCreated,
      board,
    });
  } catch (error: unknown) {
    return tournamentApiErrorResponse(error);
  }
}
