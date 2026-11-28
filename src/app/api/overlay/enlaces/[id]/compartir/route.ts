import type { NextRequest } from 'next/server';
import { json, signedInGuard } from '../../guard';
import { disableShare, enableShare, removeMember } from '@/lib/server/overlayLinksStore';

/**
 * Compartir un overlay de "Mis overlays" para que otra persona lo gestione.
 * Solo el dueño.
 *
 *   POST                 genera el link para compartir (o devuelve el que ya hay)
 *   DELETE               corta el link: quien no entró todavía ya no puede entrar
 *   DELETE { userId }    saca a una persona que ya lo gestiona
 *
 * Quien abre el link (/overlay/compartir/<token>) tiene que iniciar sesión.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await signedInGuard();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  if (!UUID_RE.test(id)) return json({ error: 'Overlay inexistente.' }, 404);
  try {
    const shareToken = await enableShare(auth.userId, id);
    if (!shareToken) return json({ error: 'Solo quien creó el overlay puede compartirlo.' }, 403);
    return json({ shareToken });
  } catch {
    return json({ error: 'No se pudo generar el link.' }, 502);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await signedInGuard();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  if (!UUID_RE.test(id)) return json({ error: 'Overlay inexistente.' }, 404);
  const body = (await request.json().catch(() => ({}))) as { userId?: unknown };
  try {
    if (typeof body.userId === 'string') {
      if (!UUID_RE.test(body.userId)) return json({ error: 'Persona inexistente.' }, 404);
      return (await removeMember(auth.userId, id, body.userId)) ? json({ ok: true }) : json({ error: 'Solo quien creó el overlay puede sacar a alguien.' }, 403);
    }
    return (await disableShare(auth.userId, id)) ? json({ ok: true }) : json({ error: 'Solo quien creó el overlay puede cortar el link.' }, 403);
  } catch {
    return json({ error: 'No se pudo completar.' }, 502);
  }
}
