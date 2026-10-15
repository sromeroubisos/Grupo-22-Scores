import { isAdminUser, isGlobalAdminRole, type MembershipLike } from '@/lib/auth/roles';
import { getUserAccessContext, type UserAccessContext } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { assertMfaSatisfied, isMfaError, MFA_CHALLENGE_ERROR, MFA_ENROLL_ERROR } from '@/lib/auth/mfa';

export type AdminApiGuardOptions = {
  /**
   * Deja pasar al invitado de la demo de club (`userId` = `guest:<clubId>`).
   * Apagado por defecto: el invitado sale de una cookie sin credenciales y
   * resuelve a `familia_club`, que `isAdminUser` acepta, asi que sin este
   * corte podia crear partidos, tocar planteles o inscripciones de temporada.
   * Prenderlo solo en rutas de LECTURA que el panel de club de la demo usa.
   */
  allowGuest?: boolean;
};

export function isGuestUserId(userId: string | null | undefined): boolean {
  return typeof userId === 'string' && userId.startsWith('guest:');
}

export async function requireAdminApiUser(options: AdminApiGuardOptions = {}): Promise<string> {
  const context = await requireAdminApiContext(options);
  return context.userId;
}

export async function requireGlobalAdminApiUser(): Promise<string> {
  const context = await requireGlobalAdminApiContext();
  return context.userId;
}

export async function requireAdminApiContext(options: AdminApiGuardOptions = {}): Promise<UserAccessContext> {
  const supabase = await createClient();
  const context = await getUserAccessContext(supabase);

  if (!context) {
    throw new Error('Unauthorized');
  }

  // 401 y no 403: el invitado no tiene sesion; si quiere esto, que se loguee.
  if (isGuestUserId(context.userId) && !options.allowGuest) {
    throw new Error('Unauthorized');
  }

  if (!isAdminUser(context.rawRole, context.memberships as MembershipLike[])) {
    throw new Error('Unauthorized');
  }

  // Sin esto el segundo factor seria decorativo: el guard de pagina se saltea
  // llamando a la ruta de API directo con la cookie de sesion.
  await assertMfaSatisfied(context.role);

  return context;
}

export async function requireGlobalAdminApiContext(): Promise<UserAccessContext> {
  const supabase = await createClient();
  const context = await getUserAccessContext(supabase);

  if (!context) {
    throw new Error('Unauthorized');
  }

  if (!isGlobalAdminRole(context.role)) {
    throw new Error('Forbidden');
  }

  await assertMfaSatisfied(context.role);

  return context;
}

export function isUnauthorizedApiError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Unauthorized';
}

export function isForbiddenApiError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Forbidden';
}

export function getApiErrorMessage(error: unknown, fallback = 'Internal server error'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function getApiErrorStatus(error: unknown, fallback = 500): number {
  // 403 y no 401: la credencial es valida, falta el segundo factor. Un 401
  // haria que el cliente crea que la sesion vencio y mande a login de nuevo,
  // que es justo lo que no resuelve nada.
  if (isMfaError(error)) return 403;
  if (isForbiddenApiError(error)) return 403;
  return isUnauthorizedApiError(error) ? 401 : fallback;
}

/**
 * Para los `catch` de guard que contestaban 401 a cualquier error: el segundo
 * factor va con 403 y su mensaje accionable, el resto queda como estaba.
 * Se usa como `return err(...guardRejection(error))`.
 */
export function guardRejection(error: unknown): [message: string, status: 401 | 403] {
  if (isMfaError(error)) return [getApiErrorMessageForClient(error), 403];
  return ['Unauthorized', 401];
}

/** Mensaje accionable para el 403 de segundo factor. */
export function getApiErrorMessageForClient(error: unknown, fallback?: string): string {
  if (error instanceof Error && error.message === MFA_CHALLENGE_ERROR) {
    return 'Necesitas completar la verificacion en dos pasos. Entra a /auth/mfa y volve a intentar.';
  }

  if (error instanceof Error && error.message === MFA_ENROLL_ERROR) {
    return 'Tu rol exige verificacion en dos pasos. Configurala en /auth/mfa/alta.';
  }

  return getApiErrorMessage(error, fallback);
}
