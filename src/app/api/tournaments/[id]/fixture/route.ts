import { NextRequest, NextResponse } from 'next/server';
import { FixtureService } from '@/lib/services/fixtureService';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tournamentId = (await params).id;
    console.log(`[fixture/route] GET fixture for tournament: ${tournamentId}`);

    const fixture = await FixtureService.getTournamentFixture(tournamentId);

    // If FixtureService succeeded, return the full fixture
    if (fixture) {
      console.log(`[fixture/route] FixtureService returned ${fixture.phases.length} phases`);
      return NextResponse.json(fixture);
    }

    // FixtureService returned null — this could be auth, RLS, or a query error.
    // Instead of returning empty phases (which masks real data), 
    // fall back to a direct query to get at least the phase list.
    console.warn(`[fixture/route] FixtureService returned null, falling back to direct query`);

    const supabase = await createClient();

    // Get basic tournament info
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, name')
      .eq('id', tournamentId)
      .single();

    if (tErr || !tournament) {
      console.error(`[fixture/route] Tournament not found:`, tErr);
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }

    // Direct fallback: query phases from the same table Estructura uses
    const { data: phases, error: pErr } = await supabase
      .from('tournament_phases')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    if (pErr) {
      console.error(`[fixture/route] Error fetching phases fallback:`, pErr);
    }

    const mappedPhases = (phases || []).map((p: any) => ({
      id: p.id,
      tournamentId: p.tournament_id,
      name: p.name,
      phaseType: p.phase_type,
      orderIndex: p.order_index,
      startDate: p.start_date,
      endDate: p.end_date,
      isActive: p.is_active,
      settings: p.settings || {},
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      rounds: [],
      roundCount: 0,
    }));

    const currentPhase = mappedPhases.find((p: any) => p.isActive) || mappedPhases[0] || null;

    console.log(`[fixture/route] Fallback found ${mappedPhases.length} phases`);

    return NextResponse.json({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      tournamentSeason: null,
      currentPhaseId: currentPhase?.id || null,
      currentRoundId: null,
      phases: mappedPhases,
      participants: [],
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error in GET /api/tournaments/[id]/fixture:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
