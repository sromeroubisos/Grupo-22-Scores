import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  canManageTournamentContext,
  getTournamentManagementTarget,
  requireUserAccessContext,
  type TournamentManagementTarget,
  type UserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import type { LooseSupabaseClient } from '@/lib/supabase/loose';

export class TournamentApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TournamentApiError';
    this.status = status;
  }
}

export type TournamentMutationContext = {
  actorUserId: string;
  authClient: Awaited<ReturnType<typeof createClient>>;
  context: UserAccessContext;
  target: TournamentManagementTarget;
  writer: LooseSupabaseClient;
};

export async function requireTournamentMutationContext(
  tournamentId: string,
  allowedRoles: ReadonlySet<string> = MANAGEMENT_MEMBERSHIP_ROLES,
): Promise<TournamentMutationContext> {
  const authClient = await createClient();
  let context: UserAccessContext;

  try {
    context = await requireUserAccessContext(authClient);
  } catch {
    throw new TournamentApiError('Unauthorized', 401);
  }

  const target = await getTournamentManagementTarget(authClient, tournamentId);
  if (!target) {
    throw new TournamentApiError('Tournament not found', 404);
  }

  if (!canManageTournamentContext(context, target, allowedRoles)) {
    throw new TournamentApiError('Forbidden', 403);
  }

  return {
    actorUserId: context.userId,
    authClient,
    context,
    target,
    writer: createAdminClient(),
  };
}

export function tournamentApiErrorResponse(error: unknown, fallback = 'Internal server error') {
  if (error instanceof TournamentApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error && error.message ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}
