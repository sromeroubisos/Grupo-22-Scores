import { NextRequest, NextResponse } from 'next/server';
import { requireUserAccessContext } from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import { combineLocalDateTimeToUtcIso } from '@/lib/timezone';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const context = await requireUserAccessContext(supabase).catch(() => null);

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      homeClubId,
      awayClubId,
      rivalName,
      date,
      time,
      venue,
      isHome: isHomeMatch,
      matchType,
      tournamentId,
      divisionId,
      sport,
      notes,
    } = body;

    // Find the club the user manages
    const clubMembership = context.memberships.find(
      m => (m.scopeType === 'club' || m.scopeType === 'club_family')
        && MANAGEMENT_MEMBERSHIP_ROLES.has(m.role as any)
    );

    if (!clubMembership?.scopeId) {
      return NextResponse.json({ error: 'No club access' }, { status: 403 });
    }

    const originClubId = clubMembership.scopeId;

    // Determine home/away based on isHome flag
    const resolvedHomeClubId = isHomeMatch ? originClubId : (awayClubId || originClubId);
    const resolvedAwayClubId = isHomeMatch ? (awayClubId || rivalName) : originClubId;

    // Build date_time
    let dateTime = null;
    if (date && time) {
      dateTime = combineLocalDateTimeToUtcIso(date, time, 'America/Argentina/Buenos_Aires');
    }

    const insertData: Record<string, unknown> = {
      home_club_id: resolvedHomeClubId,
      away_club_id: resolvedAwayClubId,
      home_division_id: isHomeMatch ? divisionId : null,
      away_division_id: isHomeMatch ? null : divisionId,
      date_time: dateTime,
      venue: venue || null,
      status: 'scheduled',
      sport: sport || null,
      notes: notes || null,
      tournament_id: tournamentId || null,
      score: { home: null, away: null },
    };

    const { data, error } = await supabase
      .from('matches')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[ClubAdmin CREATE match]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[ClubAdmin CREATE match]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
