import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasOverlayAccess } from '@/lib/auth/roles';

export type OverlayAccess =
  | { status: 'signed-out' }
  | { status: 'denied'; userId: string; role: string | null }
  | { status: 'ok'; userId: string; role: string | null };

/**
 * Quién puede usar el generador de overlays y crear overlays manuales: el rol
 * `usuario_overlay` y la administración global (`hasOverlayAccess`). El rol se
 * resuelve con el usuario que Supabase valida en getUser(), no con la cookie.
 */
export async function getOverlayAccess(): Promise<OverlayAccess> {
  const context = await getServerAuthRole();
  const userId = context.session?.user?.id;
  if (!userId) return { status: 'signed-out' };
  return hasOverlayAccess(context.role)
    ? { status: 'ok', userId, role: context.role }
    : { status: 'denied', userId, role: context.role };
}
