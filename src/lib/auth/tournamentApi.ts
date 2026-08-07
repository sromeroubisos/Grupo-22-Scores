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
import { MANAGEMENT_MEMBERSHIP_ROLES, VIEW_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
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

/**
 * La versión de sólo lectura: exige pertenecer al torneo, pero acepta también al
 * rol `viewer`, que no puede escribir nada.
 *
 * Existe porque los endpoints de lectura de Posiciones no tenían NINGÚN control:
 * cualquiera con una sesión podía leer la tabla, las reglas y la auditoría de
 * cualquier torneo con sólo saber su id. Y porque la alternativa que se venía
 * usando —el cliente anónimo con RLS— no alcanza: las políticas de
 * `admin_audit_log` piden `authorize_admin()`, así que un administrador de
 * torneo veía el panel vacío y sin error, que es la peor de las respuestas.
 *
 * Devuelve el `writer` (cliente admin) a propósito: una vez resuelto QUIÉN
 * pregunta y a QUÉ torneo, la consulta puede saltear RLS con el scope ya
 * acotado en el código.
 */
export async function requireTournamentReadContext(
  tournamentId: string,
): Promise<TournamentMutationContext> {
  return requireTournamentMutationContext(tournamentId, VIEW_MEMBERSHIP_ROLES);
}

export function tournamentApiErrorResponse(error: unknown, fallback = 'Internal server error') {
  if (error instanceof TournamentApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error && error.message ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}
