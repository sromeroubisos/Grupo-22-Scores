import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const tournament_id = sp.get('tournament_id');
    const phase_id = sp.get('phase_id');
    const group_id = sp.get('group_id');

    const supabase = await createClient();

    let query = supabase
      .from('team_labels')
      .select('id, label_id, club_id, tournament_id, phase_id, group_id, created_at, label:ui_labels(id, name, color, scope)');

    if (tournament_id) query = query.eq('tournament_id', tournament_id);
    if (phase_id) query = query.eq('phase_id', phase_id);
    if (group_id) query = query.eq('group_id', group_id);

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { label_id, club_id, tournament_id, phase_id = null, group_id = null } = body;

    if (!label_id || !club_id) {
      return NextResponse.json({ ok: false, error: 'label_id and club_id are required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('team_labels')
      .insert({ label_id, club_id, tournament_id: tournament_id ?? null, phase_id, group_id })
      .select('id, label_id, club_id, tournament_id, phase_id, group_id, created_at, label:ui_labels(id, name, color, scope)')
      .single();

    if (error) {
      // Unique violation — already assigned
      if (error.code === '23505') {
        return NextResponse.json({ ok: false, error: 'Label already assigned to this team in this context' }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
