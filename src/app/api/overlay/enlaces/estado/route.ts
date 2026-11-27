import type { NextRequest } from 'next/server';
import { json } from '../guard';
import { findLinkByToken } from '@/lib/server/overlayLinksStore';

/**
 * Vencimiento de un enlace por su token. Lo consulta la página al aire cuando
 * llega la hora de vencer: si el dueño lo renovó, sigue; si no, se apaga.
 * Público (el token ya está en la URL de OBS); devuelve solo la fecha.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t') ?? '';
  try {
    const link = await findLinkByToken(token);
    if (!link) return json({ error: 'Enlace inexistente.' }, 404);
    return json({ expiresAt: link.expiresAt, serverNow: new Date().toISOString() });
  } catch {
    return json({ error: 'No se pudo leer.' }, 502);
  }
}
