import type { NextRequest } from 'next/server';
import { json, signedInGuard } from '../guard';
import { linkKindFromPath, normalizeLinkPath } from '@/lib/overlay/overlayLinks';
import { deleteUserLink, leaveLink, linkAccess, updateUserLink } from '@/lib/server/overlayLinksStore';

/**
 * Un enlace de "Mis overlays".
 *
 *   PATCH  { renovar?: true, title?: string, path?: string }
 *          renovar = otros 15 días desde hoy, MISMO token
 *          path    = editarlo: otra configuración con el MISMO token (OBS no se toca)
 *   DELETE el dueño lo BORRA (la URL deja de funcionar en OBS); un co-gestor
 *          solo lo saca de su lista (deja de gestionarlo)
 *
 * El dueño y quienes entraron por su link para compartir (el store lo verifica).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await signedInGuard();
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
  const auth = await signedInGuard();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  if (!UUID_RE.test(id)) return json({ error: 'Overlay inexistente.' }, 404);
  try {
    const access = await linkAccess(auth.userId, id);
    if (access === 'owner') return (await deleteUserLink(auth.userId, id)) ? json({ ok: true }) : json({ error: 'Overlay inexistente.' }, 404);
    if (access === 'member') return (await leaveLink(auth.userId, id)) ? json({ ok: true, left: true }) : json({ error: 'Overlay inexistente.' }, 404);
    return json({ error: 'Overlay inexistente.' }, 404);
  } catch {
    return json({ error: 'No se pudo borrar.' }, 502);
  }
}
