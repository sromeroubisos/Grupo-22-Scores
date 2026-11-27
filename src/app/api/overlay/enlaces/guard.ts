import { NextResponse } from 'next/server';
import { getOverlayAccess } from '@/lib/auth/overlayAccess';

/** Lo común de las rutas de "Mis overlays": respuesta sin caché y quién puede usarlas. */

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function overlayLinksGuard(): Promise<{ userId: string } | { error: NextResponse }> {
  const access = await getOverlayAccess();
  if (access.status === 'signed-out') return { error: json({ error: 'Entrá a tu cuenta de G22 para guardar overlays.' }, 401) };
  if (access.status === 'denied') return { error: json({ error: 'Tu cuenta no tiene el rol Usuario con overlays.' }, 403) };
  return { userId: access.userId };
}
