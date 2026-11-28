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

/**
 * Para lo que también puede hacer alguien que entró por un link compartido
 * (leer la lista, editar, renovar, salir): alcanza con la sesión. El permiso
 * sobre cada overlay lo decide el store (dueño o co-gestor).
 */
export async function signedInGuard(): Promise<{ userId: string; canCreate: boolean } | { error: NextResponse }> {
  const access = await getOverlayAccess();
  if (access.status === 'signed-out') return { error: json({ error: 'Entrá a tu cuenta de G22 para usar tus overlays.' }, 401) };
  return { userId: access.userId, canCreate: access.status === 'ok' };
}
