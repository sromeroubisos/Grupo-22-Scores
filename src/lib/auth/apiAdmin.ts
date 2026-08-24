import { isAdminUser, isGlobalAdminRole, type MembershipLike } from '@/lib/auth/roles';
import { getUserAccessContext, type UserAccessContext } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { assertMfaSatisfied, isMfaError, MFA_CHALLENGE_ERROR, MFA_ENROLL_ERROR } from '@/lib/auth/mfa';

export async function requireAdminApiUser(): Promise<string> {
  const context = await requireAdminApiContext();
  return context.userId;
}

export async function requireGlobalAdminApiUser(): Promise<string> {
  const context = await requireGlobalAdminApiContext();
  return context.userId;
}

export async function requireAdminApiContext(): Promise<UserAccessContext> {
  const supabase = await createClient();
  const context = await getUserAccessContext(supabase);

  if (!context) {
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
