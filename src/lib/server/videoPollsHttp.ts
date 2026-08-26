// Lo que comparten las rutas de /api/video-polls: respuestas sin caché,
// el gate editorial y la traducción de errores a HTTP.

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
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
    return jsonError(error instanceof Error ? error.message : fallback, 500);
}

/**
 * Quien administra noticias arma y cierra votaciones. Sin sesión verificada
 * es 401 (pasa un instante durante el refresh del token: conviene reintentar);
 * con sesión pero sin rol editorial, 403.
 */
export async function requireEditor(): Promise<{ ok: true; userId: string | null } | { ok: false; response: NextResponse }> {
    const context = await getServerAuthRole();
    const userId = context.session?.user?.id ?? null;
    if (!userId) {
        return { ok: false, response: jsonError('No se pudo verificar tu sesión. Probá de nuevo en unos segundos.', 401) };
    }
    if (!hasNewsManagementAccess(context.role)) {
        return { ok: false, response: jsonError('No tenés permiso para administrar votaciones.', 403) };
    }
    return { ok: true, userId };
}

/** El usuario verificado, o null si no hay sesión válida. */
export async function verifiedUserId(): Promise<string | null> {
    const { session } = await getServerAuthRole();
    return session?.user?.id ?? null;
}
