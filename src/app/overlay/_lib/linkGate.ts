import 'server-only';
import { redirect } from 'next/navigation';
import { getOverlayAccess } from '@/lib/auth/overlayAccess';
import { linkAirPath, sameLinkTarget } from '@/lib/overlay/overlayLinks';
import type { OverlayPlan } from '@/lib/overlay/overlayPlan';
import { findLinkByToken } from '@/lib/server/overlayLinksStore';
import { getOverlayPlan } from '@/lib/server/overlayPlanStore';
import { first, type SearchParams } from './config';

/**
 * ¿Esta página al aire puede dibujar el gráfico, y con qué plan?
 *
 *   - `prueba=1`: sí (datos de muestra, lo usan la galería y las vistas previas).
 *   - `enlace=<token>` guardado en "Mis overlays", para ESTA ruta y sin vencer: sí,
 *     con el plan del DUEÑO del enlace; la página vigila el vencimiento.
 *   - Sin enlace, con la sesión de alguien con acceso a overlays: sí, con su plan
 *     (la vista previa del generador). OBS y vMix no tienen esa sesión.
 *   - Si la base no contesta, se deja pasar sin recortar nada: un corte nuestro
 *     no apaga ni cambia una transmisión.
 *
 * Un enlace EDITADO conserva el token: si lo que pide la URL de OBS ya no es lo
 * guardado, se redirige a la ruta guardada. Así editar no obliga a tocar OBS.
 */
export type LinkGate =
  | { status: 'ok'; token: string | null; expiresAt: string | null; plan: OverlayPlan; path?: string }
  | { status: 'vencido' | 'sin-enlace' | 'inexistente' };

export async function checkOverlayLink(query: SearchParams, pathname: string): Promise<LinkGate> {
  if (first(query.prueba) === '1') return { status: 'ok', token: null, expiresAt: null, plan: 'premium' };
  // Solo en local: un partido REAL sin guardar enlace, para probar tamaños y
  // tipografías con escudos y nombres de verdad. En producción no existe.
  if (first(query.prueba) === 'real' && process.env.NODE_ENV !== 'production') {
    return { status: 'ok', token: null, expiresAt: null, plan: 'premium' };
  }

  const token = first(query.enlace)?.trim() ?? '';
  let knownBad: LinkGate | null = null;
  let moveTo: string | null = null;
  if (token) {
    try {
      const link = await findLinkByToken(token);
      if (link && Date.parse(link.expiresAt) > Date.now() && !sameLinkTarget(link.path, pathname, query)) {
        // Editado después de pegarlo en OBS: a la configuración guardada (fuera del try: redirect lanza).
        moveTo = linkAirPath(link.path, token);
      } else if (link && Date.parse(link.expiresAt) > Date.now()) {
        const plan = await getOverlayPlan(link.userId).catch(() => 'premium' as const);
        return { status: 'ok', token, expiresAt: link.expiresAt, plan, path: link.path };
      } else if (link) {
        knownBad = { status: 'vencido' };
      } else {
        knownBad = { status: 'inexistente' };
      }
    } catch {
      return { status: 'ok', token: null, expiresAt: null, plan: 'premium' };
    }
  }
  if (moveTo) redirect(moveTo);

  // La vista previa del generador: el iframe lleva la sesión del usuario.
  if (!token) {
    try {
      const access = await getOverlayAccess();
      if (access.status === 'ok') {
        const plan = await getOverlayPlan(access.userId, access.role).catch(() => 'premium' as const);
        return { status: 'ok', token: null, expiresAt: null, plan };
      }
    } catch {
      // Sin sesión legible: sigue como cualquier navegador.
    }
  }
  return knownBad ?? { status: 'sin-enlace' };
}
