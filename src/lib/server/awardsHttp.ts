// Lo que comparten las rutas de /api/awards: respuestas sin caché, el gate de
// quien participa (mail verificado) y el de quien administra, y la traducción
// de errores a HTTP.

import { NextResponse } from 'next/server';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import { getAwardEdition, type AwardEditionConfig } from '@/lib/awards/config';
import { AWARDS_MIGRATION, AwardsRuleError, AwardsUnavailableError } from '@/lib/server/awards';
import { createClient } from '@/lib/supabase/server';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function json(body: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return NextResponse.json(body, { ...init, headers });
}

export function jsonError(message: string, status: number, details?: unknown) {
    return json({ error: message, ...(details !== undefined ? { details } : {}) }, { status });
}

export function awardsErrorResponse(error: unknown, fallback: string) {
    if (error instanceof AwardsUnavailableError) {
        return jsonError(error.message, 503, { migration: AWARDS_MIGRATION });
    }
    if (error instanceof AwardsRuleError) return jsonError(error.message, error.status);
    console.error('[awards]', error);
    // El mensaje crudo (de Supabase o de Postgres) va al log, no a la pantalla.
    return jsonError(fallback, 500);
}

export async function resolveEdition(params: Promise<{ edition: string }>): Promise<AwardEditionConfig | null> {
    return getAwardEdition((await params).edition);
}

export type Participant = { ok: true; userId: string } | { ok: false; response: NextResponse };

/**
 * Participa quien entró con mail y lo tiene verificado. `getUser()` consulta
 * a Supabase (no decodifica la cookie), así que el estado del mail es el real.
 */
export async function requireVerifiedParticipant(): Promise<Participant> {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    const user = data?.user ?? null;
    if (error || !user) {
        return { ok: false, response: jsonError('Entrá con tu mail para participar.', 401) };
    }
    if (!user.email || !user.email_confirmed_at) {
        return { ok: false, response: jsonError('Verificá tu mail para participar. Te mandamos un enlace al registrarte.', 403) };
    }
    return { ok: true, userId: user.id };
}

/** Quien arma la terna y revisa lo que manda la gente: la editorial global. */
export async function requireAwardsEditor(): Promise<Participant> {
    const context = await getServerAuthRole();
    const userId = context.session?.user?.id ?? null;
    if (!userId) {
        return { ok: false, response: jsonError('No se pudo verificar tu sesión. Probá de nuevo en unos segundos.', 401) };
    }
    if (!hasNewsManagementAccess(context.role)) {
        return { ok: false, response: jsonError('No tenés permiso para administrar los premios.', 403) };
    }
    return { ok: true, userId };
}

/** Un link http(s) válido y razonable, o null. */
export function cleanHttpUrl(value: string): string | null {
    try {
        const url = new URL(value.trim());
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        if (url.href.length > 600) return null;
        return url.href;
    } catch {
        return null;
    }
}
