// Lo que comparten las rutas de /api/video-polls: respuestas sin caché,
// el gate editorial y la traducción de errores a HTTP.

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import {
    canManageTournamentContext,
    getTournamentManagementTarget,
    getUserAccessContext,
    type UserAccessContext,
} from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES, hasEditorialAccess } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { VideoPollsUnavailableError, VIDEO_POLLS_MIGRATION } from '@/lib/server/videoPolls';
import {
    MAX_POLL_NAME_LENGTH,
    MAX_POLL_OPTION_LABEL_LENGTH,
    MAX_POLL_OPTIONS,
    MAX_POLL_TITLE_LENGTH,
    MIN_POLL_OPTIONS,
} from '@/lib/videoHub/polls';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cada video de la votación lleva su título: sin él no se entiende qué se vota. */
export const PollOptionSchema = z.object({
    matchId: z.string().trim().min(1).max(128),
    videoId: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(MAX_POLL_OPTION_LABEL_LENGTH),
});

export const PollOptionsSchema = z.array(PollOptionSchema).min(MIN_POLL_OPTIONS).max(MAX_POLL_OPTIONS);
export const PollNameSchema = z.string().trim().min(1).max(MAX_POLL_NAME_LENGTH);
export const PollTitleSchema = z.string().trim().min(1).max(MAX_POLL_TITLE_LENGTH);
export const PollStatusSchema = z.enum(['open', 'closed']);
/** ISO con zona ("2026-08-30T21:00:00.000Z"); null = sin fecha de cierre. */
export const PollClosesAtSchema = z.string().datetime({ offset: true }).nullable();

export function json(body: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return NextResponse.json(body, { ...init, headers });
}

export function jsonError(message: string, status: number, details?: unknown) {
    return json({ error: message, ...(details !== undefined ? { details } : {}) }, { status });
}

/** Sin tablas → 503 con el nombre de la migración; lo demás → 500. */
export function pollErrorResponse(error: unknown, fallback: string) {
    if (error instanceof VideoPollsUnavailableError) {
        return jsonError(error.message, 503, { migration: VIDEO_POLLS_MIGRATION, reason: error.reason });
    }
    console.error('[video-polls]', error);
    // El mensaje crudo (de Supabase o de Postgres) va al log, no a la pantalla.
    return jsonError(fallback, 500);
}

export interface PollEditor {
    ok: true;
    userId: string;
    isGlobalEditor: boolean;
    access: UserAccessContext;
}

/**
 * Quién arma, edita y borra votaciones: la editorial global (super_admin,
 * admin_general, redactor) sobre cualquier torneo, o quien administra ESE
 * torneo (membresía admin/editor sobre el torneo, su deporte o su unión). Antes
 * alcanzaba con cualquier rol de admin —un editor de club borraba la votación
 * de otro torneo con service_role—. Sin sesión verificada es 401 (pasa un
 * instante durante el refresh del token: conviene reintentar); con sesión pero
 * sin ningún permiso, 403. El alcance por torneo lo cierra
 * `requirePollTournamentAccess`.
 */
export async function requireEditor(): Promise<PollEditor | { ok: false; response: NextResponse }> {
    const context = await getServerAuthRole();
    const userId = context.session?.user?.id ?? null;
    if (!userId) {
        return { ok: false, response: jsonError('No se pudo verificar tu sesión. Probá de nuevo en unos segundos.', 401) };
    }
    const access = await getUserAccessContext(await createClient()).catch(() => null);
    if (!access || access.userId !== userId) {
        return { ok: false, response: jsonError('No se pudo verificar tu sesión. Probá de nuevo en unos segundos.', 401) };
    }
    const isGlobalEditor = hasEditorialAccess(context.role);
    const hasTournamentMembership = access.memberships.some((membership) =>
        (membership.scopeType === 'tournament' || membership.scopeType === 'sport' || membership.scopeType === 'union') &&
        EDIT_MEMBERSHIP_ROLES.has(membership.role as never)
    );
    if (!isGlobalEditor && !hasTournamentMembership) {
        return { ok: false, response: jsonError('No tenés permiso para administrar votaciones.', 403) };
    }
    return { ok: true, userId, isGlobalEditor, access };
}

/**
 * null si el editor puede tocar votaciones de ese torneo; si no, el 403 listo
 * para devolver. El torneo se lee con service_role: uno oculto sigue siendo de
 * quien lo administra.
 */
export async function requirePollTournamentAccess(editor: PollEditor, tournamentId: string): Promise<NextResponse | null> {
    if (editor.isGlobalEditor) return null;
    const admin = createAdminClient() as unknown as Awaited<ReturnType<typeof createClient>>;
    const target = await getTournamentManagementTarget(admin, tournamentId).catch(() => null);
    if (target && canManageTournamentContext(editor.access, target, EDIT_MEMBERSHIP_ROLES)) return null;
    return jsonError('No administrás ese torneo.', 403);
}

/** El usuario verificado, o null si no hay sesión válida. */
export async function verifiedUserId(): Promise<string | null> {
    const { session } = await getServerAuthRole();
    return session?.user?.id ?? null;
}
