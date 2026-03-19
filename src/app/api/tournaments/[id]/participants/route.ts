import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTournamentStandings } from '@/lib/services/flashscore';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const tournamentId = (await params).id;

    // Check if query param 'full' is set to return full participant data
    const { searchParams } = new URL(request.url);
    const full = searchParams.get('full') === 'true';

    // ─── FLASH SCORE SUPPORT ──────────────────────────────────────────────────
    if (tournamentId.toLowerCase().startsWith('fs-')) {
      const fsId = tournamentId.slice(3); // Remove 'fs-' prefix
      // Use the ID as stageId, which is commonly what's stored
      const stageId = searchParams.get('stageId') || fsId;
      const tournamentFsId = searchParams.get('tournamentId') || fsId;

      console.log(`[Participants API] Fetching FS participants for stage ${stageId}`);

      const standingsRes = await getTournamentStandings(tournamentFsId, stageId);
      const standings = standingsRes?.DATA || [];

      // Extract all team names from standings
      const teamNames: string[] = [];
      const teamIdMap: Record<string, string> = {}; // Name -> FS ID

      const processStandings = (rows: any[]) => {
        rows.forEach(row => {
          const team = row.team || row.participant || row;
          if (team?.name) {
            teamNames.push(team.name);
            if (team.id || team.team_id) {
              teamIdMap[team.name] = String(team.id || team.team_id);
            }
          }
        });
      };

      if (Array.isArray(standings)) {
        if (standings[0]?.rows) {
          // Grouped standings
          standings.forEach((g: any) => processStandings(g.rows || []));
        } else {
          // Flat standings
          processStandings(standings);
        }
      }

      if (teamNames.length === 0) {
        return NextResponse.json([]);
      }

      // ─── SEARCH IN DATABASE ───────────────────────────────────────────────
      // We look for clubs that match either name OR the external_id
      const { data: dbClubs, error: dbError } = await supabase
        .from('clubs')
        .select('id, name, short_name, logo_url')
        .or(`name.in.(${teamNames.map(n => `"${n.replace(/"/g, '""')}"`).join(',')})`);

      if (dbError) {
        console.error('[Participants API] Error searching clubs:', dbError);
        return NextResponse.json({ error: 'Database search failed' }, { status: 500 });
      }

      const clubs = (dbClubs || []).map(club => ({
        id: club.id,
        name: club.name,
        short_name: club.short_name,
        logo: club.logo_url,
        externalId: null
      }));

      // In participants route, we return the same structure as before
      if (full) {
        // Mock the participant structure for compatibility
        return NextResponse.json(clubs.map(c => ({
          id: `fs-link-${c.id}`,
          club_id: c.id,
          status: 'active',
          clubs: {
            id: c.id,
            name: c.name,
            short_name: c.short_name,
            logo: c.logo
          }
        })));
      }

      return NextResponse.json(clubs);
    }

    // ─── REGULAR SUPABASE SUPPORT ─────────────────────────────────────────────
    const { data: participants, error } = await supabase
      .from('tournament_participants')
      .select(`
        id,
        tournament_id,
        club_id,
        name,
        type,
        status,
        seed,
        group_id,
        short_code,
        notes,
        created_at,
        updated_at,
        clubs:club_id (
          id,
          name,
          short_name,
          logo_url
        )
      `)
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching participants:', error);
      return NextResponse.json(
        { error: 'Error fetching participants' },
        { status: 500 }
      );
    }

    // Return full participant data if requested, otherwise just club info
    if (full) {
      return NextResponse.json(participants || []);
    } else {
      const clubs = (participants || [])
        .filter((p: any) => p.status === 'active' && p.clubs)
        .map((p: any) => ({
          id: p.clubs.id,
          name: p.clubs.name,
          short_name: p.clubs.short_name,
          logo: p.clubs.logo_url,
        }));

      return NextResponse.json(clubs);
    }
  } catch (error: any) {
    console.error('Error in GET /api/tournaments/[id]/participants:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const tournamentId = (await params).id;
    const body = await request.json();

    // Validate required fields
    if (!body.name && !body.club_id) {
      console.error('[Participants API] Validation error: Either name or club_id is required');
      return NextResponse.json(
        { error: 'Se requiere un nombre o un club vinculado' },
        { status: 400 }
      );
    }

    // Log the data being inserted for debugging
    const insertData = {
      tournament_id: tournamentId,
      club_id: body.club_id || null,
      name: body.name,
      type: body.type || 'club',
      status: body.status || 'active',
      seed: body.seed || null,
      group_id: body.group_id || null,
      short_code: body.short_code || null,
      notes: body.notes || null,
    };
    console.log('[Participants API] Inserting participant:', insertData);

    const { data, error } = await supabase
      .from('tournament_participants')
      .insert(insertData)
      .select(`
        id,
        tournament_id,
        club_id,
        name,
        type,
        status,
        seed,
        group_id,
        short_code,
        notes,
        created_at,
        updated_at,
        clubs:club_id (
          id,
          name,
          short_name,
          logo_url
        )
      `)
      .single();

    if (error) {
      console.error('[Participants API] Error creating participant:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      // Provide user-friendly error messages
      let userMessage = error.message;
      if (error.code === '23505') {
        userMessage = 'Este participante ya está registrado en el torneo';
      } else if (error.code === '23503') {
        userMessage = 'El club seleccionado no existe en la base de datos';
      } else if (error.code === '23502') {
        userMessage = 'Faltan campos obligatorios. Por favor verifica el formulario';
      }

      return NextResponse.json({ error: userMessage }, { status: 400 });
    }

    console.log('[Participants API] Participant created successfully:', data.id);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[Participants API] Unexpected error in POST:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const participantId = searchParams.get('id');

    if (!participantId) {
      return NextResponse.json({ error: 'Missing participant ID' }, { status: 400 });
    }

    const body = await request.json();

    // Build update object with only provided fields
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.club_id !== undefined) updateData.club_id = body.club_id;
    if (body.seed !== undefined) updateData.seed = body.seed;
    if (body.group_id !== undefined) updateData.group_id = body.group_id;
    if (body.short_code !== undefined) updateData.short_code = body.short_code;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const { data, error } = await supabase
      .from('tournament_participants')
      .update(updateData)
      .eq('id', participantId)
      .select(`
        id,
        tournament_id,
        club_id,
        name,
        type,
        status,
        seed,
        group_id,
        short_code,
        notes,
        created_at,
        updated_at,
        clubs:club_id (
          id,
          name,
          short_name,
          logo_url
        )
      `)
      .single();

    if (error) {
      console.error('Error updating participant:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing participant ID' }, { status: 400 });
    }

    const { error } = await supabase
      .from('tournament_participants')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
