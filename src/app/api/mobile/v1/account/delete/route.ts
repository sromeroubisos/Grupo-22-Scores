import { NextRequest } from 'next/server';
import { isGlobalAdminRole } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { mobileJson, preflight } from '@/lib/server/mobileSync/cors';
import { MobileAuthError, resolveMobileSession } from '@/lib/server/mobileSync/session';

export const dynamic = 'force-dynamic';

/** Estados de `subscriptions` que todavía pueden cobrar: hay que cancelarlos antes de borrar la cuenta. */
const LIVE_SUBSCRIPTION_STATUSES = ['active', 'authorized', 'pending', 'trialing', 'past_due'];

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

/**
 * POST /api/mobile/v1/account/delete — el usuario borra SU cuenta desde la app
 * (requisito 5.1.1(v) de la App Store).
 *
 * Borra el usuario de Supabase Auth. Las claves foráneas hacen el resto: los
 * datos personales (users, membresías, favoritos, notificaciones, prode, votos)
 * se borran en cascada; lo deportivo que cargó (torneos, partidos, clubes)
 * queda en la plataforma sin autor (SET NULL). Verificado en producción el
 * 2026-10-14: ninguna FK a auth.users es RESTRICT/NO ACTION.
 *
 * No borra: administradores globales (perderían el acceso a la plataforma) ni
 * cuentas con una suscripción que todavía puede cobrar.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await resolveMobileSession(request);
    const body = (await request.json().catch(() => ({}))) as { confirm?: unknown };
    if (body.confirm !== 'ELIMINAR') {
      return mobileJson(request, { error: 'Falta confirmar la eliminación.' }, { status: 400 });
    }
    if (isGlobalAdminRole(session.context.role)) {
      return mobileJson(
        request,
        { error: 'Las cuentas de administrador de G22 no se pueden eliminar desde la app. Escribí a soporte.' },
        { status: 403 },
      );
    }

    const admin = createAdminClient();
    const { data: liveSubscriptions, error: subscriptionError } = await admin
      .from('subscriptions')
      .select('id')
      .eq('user_id', session.userId)
      .in('status', LIVE_SUBSCRIPTION_STATUSES)
      .is('cancelled_at', null)
      .limit(1);
    if (subscriptionError) throw subscriptionError;
    if ((liveSubscriptions ?? []).length > 0) {
      return mobileJson(
        request,
        { error: 'Tenés una suscripción activa. Cancelala en g22scores.com antes de eliminar la cuenta.' },
        { status: 409 },
      );
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(session.userId);
    if (deleteError) throw deleteError;
    console.info('[mobileSync] cuenta eliminada desde la app:', session.userId);
    return mobileJson(request, { deleted: true });
  } catch (error) {
    if (error instanceof MobileAuthError) return mobileJson(request, { error: error.message }, { status: error.status });
    console.error('[mobileSync] eliminar cuenta falló:', error);
    return mobileJson(request, { error: 'No pudimos eliminar la cuenta. Intentá de nuevo o escribí a soporte.' }, { status: 500 });
  }
}
