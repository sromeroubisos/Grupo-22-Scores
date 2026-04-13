import { isAdminUser, type MembershipLike } from '@/lib/auth/roles';
import { getUserAccessContext, type UserAccessContext } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';

export async function requireAdminApiUser(): Promise<string> {
  const context = await requireAdminApiContext();
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

export function isUnauthorizedApiError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Unauthorized';
}

export function getApiErrorMessage(error: unknown, fallback = 'Internal server error'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function getApiErrorStatus(error: unknown, fallback = 500): number {
  return isUnauthorizedApiError(error) ? 401 : fallback;
}
