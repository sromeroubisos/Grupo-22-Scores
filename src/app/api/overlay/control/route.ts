import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOverlayAccess } from '@/lib/auth/overlayAccess';
import { defaultManualState, mergeManualState, type ManualKind } from '@/lib/overlay/manualOverlay';

/**
 * Crea un overlay manual (marcador o titular) y devuelve su ID y la CLAVE del
 * panel. La clave se muestra una sola vez: en la base queda solo su hash.
 *
 * Crear pide el rol `usuario_overlay` (o admin global), igual que el generador:
 * cada fila es una escritura en la base. Manejar uno ya creado pide la clave.
 */
export async function POST(request: NextRequest) {
  const access = await getOverlayAccess();
  if (access.status === 'signed-out') {
    return NextResponse.json({ error: 'Entrá a tu cuenta de G22 para crear un overlay manual.' }, { status: 401 });
  }
  if (access.status === 'denied') {
    return NextResponse.json({ error: 'Tu cuenta no tiene el rol Usuario con overlays.' }, { status: 403 });
  }
  const user = { id: access.userId };

  const body = (await request.json().catch(() => ({}))) as { kind?: string; state?: unknown };
  const kind: ManualKind = body.kind === 'titular' || body.kind === 'sponsors' ? body.kind : 'marcador';
  // Lo que se eligió en el generador (equipos, colores, deporte) entra saneado,
  // igual que lo que manda el panel: el reloj y los eventos no se pueden fijar.
  const initialState = mergeManualState(kind, defaultManualState(kind), body.state ?? {});
  const key = randomBytes(18).toString('base64url');

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('overlay_controls')
    .insert({
      kind,
      edit_key_hash: createHash('sha256').update(key).digest('hex'),
      state: initialState,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    const missing = error?.code === '42P01' || error?.code === 'PGRST205';
    return NextResponse.json(
      { error: missing ? 'Los overlays manuales todavía no están habilitados en la base (falta aplicar la migración).' : 'No se pudo crear el overlay.' },
      { status: missing ? 503 : 500 },
    );
  }

  return NextResponse.json({ id: data.id, kind, key }, { headers: { 'Cache-Control': 'no-store' } });
}
