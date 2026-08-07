import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';

/**
 * Borrar una asignación de etiqueta.
 *
 * No tenía ningún control: con el id de una fila —que viaja en la respuesta del
 * GET— cualquiera con una sesión válida podía sacarle a otro torneo la banda de
 * clasificado o la de descenso.
 *
 * El torneo NO se toma de quien llama: se lee de la propia fila y recién
 * después se pide permiso sobre ESE torneo. Aceptarlo por parámetro sería
 * dejar que el atacante elija contra qué se lo valida.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const lookup = createAdminClient();
    const { data: assignment, error: lookupError } = await lookup
      .from('team_labels')
      .select('id, tournament_id')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ ok: false, error: lookupError.message }, { status: 500 });
    }

    // Ya no está: para el que llama el resultado es el mismo, y así no se puede
    // usar este endpoint para averiguar qué ids existen.
    if (!assignment) {
      return NextResponse.json({ ok: true });
    }

    if (!assignment.tournament_id) {
      return NextResponse.json(
        { ok: false, error: 'La asignación no declara torneo y no se puede autorizar.' },
        { status: 409 },
      );
    }

    let supabase: Awaited<ReturnType<typeof requireTournamentMutationContext>>['writer'];
    try {
      ({ writer: supabase } = await requireTournamentMutationContext(assignment.tournament_id));
    } catch (authError) {
      return tournamentApiErrorResponse(authError);
    }

    const { error } = await supabase.from('team_labels').delete().eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
