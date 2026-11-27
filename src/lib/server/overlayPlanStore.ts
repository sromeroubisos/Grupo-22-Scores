import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { planFor, type OverlayPlan } from '@/lib/overlay/overlayPlan';

/**
 * El plan de overlays de un usuario (tabla `overlay_plans`, solo service_role).
 * Sin fila: básico. Super admin: premium siempre. `role` se pasa si ya se
 * conoce; si no, se lee de `users`.
 */
export async function getOverlayPlan(userId: string, role?: string | null): Promise<OverlayPlan> {
  const admin = createAdminClient();
  const [planRow, roleRow] = await Promise.all([
    admin.from('overlay_plans').select('plan').eq('user_id', userId).maybeSingle(),
    role === undefined ? admin.from('users').select('role').eq('id', userId).maybeSingle() : Promise.resolve(null),
  ]);
  if (planRow.error) throw new Error(planRow.error.message);
  const resolvedRole = role === undefined ? (roleRow?.data as { role?: string } | null)?.role ?? null : role;
  return planFor(resolvedRole, (planRow.data as { plan?: string } | null)?.plan);
}
