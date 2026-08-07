import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';

export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get('scope');
    const supabase = await createClient();

    let query = supabase.from('ui_labels').select('*').order('created_at', { ascending: true });
    if (scope) query = query.eq('scope', scope);

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

/**
 * `ui_labels` es un catálogo GLOBAL, no cuelga de un torneo, así que el control
 * no puede ser por membresía de torneo: es el rol. Sin esto, cualquiera con una
 * sesión podía crear, renombrar y BORRAR etiquetas que se usan en todos los
 * torneos del sistema.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, color, scope = 'standings' } = body;

    if (!name || !color) {
      return NextResponse.json({ ok: false, error: 'name and color are required' }, { status: 400 });
    }

    const supabase = await createClient();

    let user: { id: string };
    try {
      const context = await requireTournamentAdminContext(supabase);
      user = { id: context.userId };
    } catch {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('ui_labels')
      .insert({ name: name.trim(), color, scope, created_by: user.id })
      .select()
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
