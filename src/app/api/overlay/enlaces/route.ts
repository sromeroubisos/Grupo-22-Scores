import type { NextRequest } from 'next/server';
import { json, overlayLinksGuard, signedInGuard } from './guard';
import { MAX_LINKS_PER_USER, linkKindFromPath, normalizeLinkPath } from '@/lib/overlay/overlayLinks';
import { countUserLinks, insertUserLink, listUserLinks } from '@/lib/server/overlayLinksStore';

/**
 * "Mis overlays": los enlaces que el usuario guardó para OBS / vMix.
 *
 *   GET   la lista del usuario (con su vencimiento)
 *   POST  { path, title }  guarda un enlace nuevo; vale 15 días
 *
 * Pide el rol `usuario_overlay` (o admin global), igual que el generador.
 */

const missingTable = (message: string) => /overlay_links|PGRST205|42P01/.test(message);

export async function GET() {
  const auth = await signedInGuard();
  if ('error' in auth) return auth.error;
  try {
    return json({ links: await listUserLinks(auth.userId), canCreate: auth.canCreate, serverNow: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    return json({ error: missingTable(message) ? 'Mis overlays todavía no está habilitado en la base.' : 'No se pudo leer la lista.' }, 502);
  }
}

export async function POST(request: NextRequest) {
  const auth = await overlayLinksGuard();
  if ('error' in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { path?: unknown; title?: unknown };
  const path = normalizeLinkPath(body.path);
  if (!path) return json({ error: 'Ese enlace no es un overlay que se pueda guardar.' }, 400);
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  try {
    if ((await countUserLinks(auth.userId)) >= MAX_LINKS_PER_USER) {
      return json({ error: `Llegaste al tope de ${MAX_LINKS_PER_USER} overlays guardados. Borrá los que ya no uses.` }, 409);
    }
    const link = await insertUserLink(auth.userId, { title: title || 'Overlay', kind: linkKindFromPath(path), path });
    return json({ link, serverNow: new Date().toISOString() }, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    return json({ error: missingTable(message) ? 'Mis overlays todavía no está habilitado en la base.' : 'No se pudo guardar.' }, 502);
  }
}
