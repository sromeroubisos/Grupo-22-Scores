import type { NextRequest } from 'next/server';
import { json, overlayLinksGuard } from '../guard';
import { linkKindFromPath, normalizeLinkPath } from '@/lib/overlay/overlayLinks';
import { deleteUserLink, updateUserLink } from '@/lib/server/overlayLinksStore';

/**
 * Un enlace de "Mis overlays".
 *
 *   PATCH  { renovar?: true, title?: string, path?: string }
 *          renovar = otros 15 días desde hoy, MISMO token
 *          path    = editarlo: otra configuración con el MISMO token (OBS no se toca)
 *   DELETE                                     lo borra: la URL deja de funcionar en OBS
 *
 * Solo el dueño (el filtro por user_id va en la consulta).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await overlayLinksGuard();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  if (!UUID_RE.test(id)) return json({ error: 'Overlay inexistente.' }, 404);
  const body = (await request.json().catch(() => ({}))) as { renovar?: unknown; title?: unknown; path?: unknown };
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const path = body.path === undefined ? null : normalizeLinkPath(body.path);
  if (body.path !== undefined && !path) return json({ error: 'Ese enlace no es un overlay que se pueda guardar.' }, 400);
  if (body.renovar !== true && !title && !path) return json({ error: 'No hay nada para cambiar.' }, 400);
  try {
    const link = await updateUserLink(auth.userId, id, {
      renew: body.renovar === true,
      title: title || undefined,
      path: path ?? undefined,
      kind: path ? linkKindFromPath(path) : undefined,
    });
    if (!link) return json({ error: 'Overlay inexistente.' }, 404);
    return json({ link, serverNow: new Date().toISOString() });
  } catch {
    return json({ error: 'No se pudo guardar.' }, 502);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await overlayLinksGuard();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  if (!UUID_RE.test(id)) return json({ error: 'Overlay inexistente.' }, 404);
  try {
    return (await deleteUserLink(auth.userId, id)) ? json({ ok: true }) : json({ error: 'Overlay inexistente.' }, 404);
  } catch {
    return json({ error: 'No se pudo borrar.' }, 502);
  }
}
