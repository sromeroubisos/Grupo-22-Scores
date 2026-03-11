import { NextRequest, NextResponse } from 'next/server';
import { FixtureService } from '@/lib/services/fixtureService';
import type { MatchFormData } from '@/lib/types/fixture';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const matchId = (await params).id;
    const match = await FixtureService.getMatch(matchId);

    if (!match) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(match);
  } catch (error: any) {
    console.error('Error in GET /api/matches/[id]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const matchId = (await params).id;
    const body = await request.json();

    console.log('[API PATCH /matches]', matchId, 'keys:', Object.keys(body));

    // FixtureService expects camelCase keys for its known fields,
    // but events and lineups are passed through directly
    const match = await FixtureService.updateMatch(matchId, body);

    if (!match) {
      return NextResponse.json(
        { error: 'Failed to update match. Check server logs for Supabase error details.' },
        { status: 500 }
      );
    }

    return NextResponse.json(match);
  } catch (error: any) {
    console.error('Error in PATCH /api/matches/[id]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const matchId = (await params).id;
    const success = await FixtureService.deleteMatch(matchId);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete match' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/matches/[id]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
