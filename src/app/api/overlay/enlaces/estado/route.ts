import type { NextRequest } from 'next/server';
import { json } from '../guard';
import { findLinkByToken } from '@/lib/server/overlayLinksStore';

/**
 * Vencimiento y configuración de un enlace por su token. Lo consulta la página
 * al aire cada medio minuto: si el dueño lo renovó, sigue; si venció, se apaga;
 * si lo editó, se recarga con la ruta nueva.
 * Público (el token ya está en la URL de OBS); devuelve la fecha y la ruta, que
 * es la misma que OBS ya tiene en la URL.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t') ?? '';
  try {
    const link = await findLinkByToken(token);
    if (!link) return json({ error: 'Enlace inexistente.' }, 404);
    return json({ expiresAt: link.expiresAt, path: link.path, serverNow: new Date().toISOString() });
  } catch {
    return json({ error: 'No se pudo leer.' }, 502);
  }
}
