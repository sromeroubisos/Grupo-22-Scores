import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';

/**
 * `ui_labels` es un catálogo GLOBAL: una etiqueta se usa en todos los torneos,
 * así que borrarla o renombrarla los toca a todos. Las dos escrituras estaban
 * sin ningún control —cualquier sesión válida podía hacerlo— y por eso van
 * detrás del rol, no de una membresía de torneo (la tabla no tiene torneo).
 */
async function requireLabelAdmin() {
  const supabase = await createClient();
  await requireTournamentAdminContext(supabase);
  return supabase;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, color, scope } = body;

    const updates: Record<string, string> = {};
    if (name) updates.name = name.trim();
    if (color) updates.color = color;
    if (scope) updates.scope = scope;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: 'No fields to update' }, { status: 400 });
    }

    let supabase: Awaited<ReturnType<typeof requireLabelAdmin>>;
    try {
      supabase = await requireLabelAdmin();
    } catch {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('ui_labels')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    let supabase: Awaited<ReturnType<typeof requireLabelAdmin>>;
    try {
      supabase = await requireLabelAdmin();
    } catch {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase.from('ui_labels').delete().eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
