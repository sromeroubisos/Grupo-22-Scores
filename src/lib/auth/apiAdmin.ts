import { isAdminUser, isGlobalAdminRole, type MembershipLike } from '@/lib/auth/roles';
import { getUserAccessContext, type UserAccessContext } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';

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
  if (isForbiddenApiError(error)) return 403;
  return isUnauthorizedApiError(error) ? 401 : fallback;
}
