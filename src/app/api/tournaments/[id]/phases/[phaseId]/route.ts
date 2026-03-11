import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// PATCH update a phase
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string, phaseId: string }> }
) {
  try {
    const supabase = await createClient();
    const { phaseId } = await params;
    const body = await request.json();

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.phase_type !== undefined) updateData.phase_type = body.phase_type;
    if (body.order_index !== undefined) updateData.order_index = body.order_index;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.settings !== undefined) updateData.settings = body.settings;

    const { data: phase, error } = await supabase
      .from('tournament_phases')
      .update(updateData)
      .eq('id', phaseId)
      .select()
      .single();

    if (error) {
      console.error('Error updating phase:', error);
      return NextResponse.json({ error: 'Error updating phase' }, { status: 500 });
    }

    return NextResponse.json({ data: phase });
  } catch (error: any) {
    console.error('Error in PATCH /api/tournaments/[id]/phases/[phaseId]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE a phase
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string, phaseId: string }> }
) {
  try {
    const supabase = await createClient();
    const { phaseId } = await params;

    const { error } = await supabase.from('tournament_phases').delete().eq('id', phaseId);

    if (error) {
      console.error('Error deleting phase:', error);
      return NextResponse.json({ error: 'Error deleting phase' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/tournaments/[id]/phases/[phaseId]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
