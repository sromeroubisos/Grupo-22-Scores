import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isGlobalAdminRole } from '@/lib/auth/roles';

/**
 * Segundo factor (TOTP) para los roles que pueden romper todo.
 *
 * ## Por qué el AAL se lee con getClaims() y no con getSession()
 *
 * Que una sesión haya completado el segundo factor vive en el claim `aal` del
 * access token. `getSession()` decodifica la cookie sin verificar la firma, y
 * esa cookie se emite sin httpOnly: un token fabricado con `aal: 'aal2'`
 * pasaría. `getClaims()` valida —contra el JWKS del proyecto si la firma es
 * asimétrica, y si no cayendo a `getUser()`, que valida del lado de Supabase—
 * y recién ahí devuelve los claims. Con la firma probada, `aal` es confiable.
 *
 * ## Por qué la exigencia de ALTA es opt-in y la del DESAFÍO no
 *
 * `MFA_REQUIRED_FOR_ADMINS=true` obliga a un admin **sin** factor a darlo de
 * alta. Viene apagado porque prenderlo antes de que el equipo enrole deja a
 * todos afuera del panel de golpe.
 *
 * El desafío, en cambio, se exige SIEMPRE que el usuario tenga un factor
 * verificado, con el flag apagado o prendido. Si alguien se tomó el trabajo de
 * enrolar, quiere que se le pida: un segundo factor que se puede saltear
 * ignorándolo no es un segundo factor.
 */

export type MfaGate =
    /** Puede pasar. */
    | 'ok'
    /** Tiene factor pero esta sesion es aal1: que lo complete. */
    | 'challenge'
    /** Su rol exige MFA y no tiene ningun factor: que lo de de alta. */
    | 'enroll';

export const MFA_CHALLENGE_PATH = '/auth/mfa';
export const MFA_ENROLL_PATH = '/auth/mfa/alta';

export function isMfaEnrollmentEnforced(): boolean {
    return process.env.MFA_REQUIRED_FOR_ADMINS === 'true';
}

/**
 * Hoy: los roles globales (`super_admin`, `admin_general`), que son los que
 * pueden tocar cualquier club, torneo y usuario. Para ampliarlo a los admins de
 * torneo se toca solo esta funcion.
 */
export function roleRequiresMfa(role?: string | null): boolean {
    return isGlobalAdminRole(role);
}

/**
 * Memoizado por request: el layout de admin y el guard de API lo piden los dos.
 *
 * Las dos consultas van EN PARALELO porque las dos pegan contra Supabase y no
 * dependen una de la otra. Ninguna se puede evitar:
 *
 * - `getClaims()` es la unica forma confiable de leer `aal`.
 * - `listFactors()` hace falta aunque parezca que `session.user.factors` ya lo
 *   tiene. Ese objeto es una copia cacheada dentro de la cookie, que se emite
 *   sin httpOnly: alguien con XSS puede dejar el access token valido y borrarle
 *   los factores al blob para que el gate lo deje pasar. `listFactors()` lo
 *   pregunta del lado del servidor.
 *
 * El costo se paga solo en rutas de admin, y una vez por request.
 */
const resolveMfaState = cache(async (): Promise<{ aal2: boolean; hasFactor: boolean }> => {
    const supabase = await createClient();

    const [aal2, hasFactor] = await Promise.all([
        supabase.auth.getClaims()
            .then(({ data }) => (data?.claims as { aal?: unknown } | undefined)?.aal === 'aal2')
            // Si no se pudo probar la firma, la sesion NO cuenta como aal2. Es
            // el lado conservador y no deja a nadie afuera: como mucho, un
            // desafio de mas.
            .catch(() => false),
        supabase.auth.mfa.listFactors()
            .then(({ data }) => (data?.totp ?? []).some((factor) => factor.status === 'verified'))
            .catch(() => false),
    ]);

    return { aal2, hasFactor };
});

export async function resolveMfaGate(role?: string | null): Promise<MfaGate> {
    const { aal2, hasFactor } = await resolveMfaState();

    // El desafio se exige apenas hay un factor verificado, sin mirar el rol:
    // quien enrolo quiere que se le pida.
    if (hasFactor) {
        return aal2 ? 'ok' : 'challenge';
    }

    if (!roleRequiresMfa(role)) {
        return 'ok';
    }

    return isMfaEnrollmentEnforced() ? 'enroll' : 'ok';
}

export const MFA_CHALLENGE_ERROR = 'MfaRequired';
export const MFA_ENROLL_ERROR = 'MfaEnrollmentRequired';

export function isMfaError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.message === MFA_CHALLENGE_ERROR || error.message === MFA_ENROLL_ERROR;
}

/** Lanza el error que `resolveAdminGuardRedirect` sabe traducir a una pantalla. */
export async function assertMfaSatisfied(role?: string | null): Promise<void> {
    const gate = await resolveMfaGate(role);

    if (gate === 'challenge') {
        throw new Error(MFA_CHALLENGE_ERROR);
    }

    if (gate === 'enroll') {
        throw new Error(MFA_ENROLL_ERROR);
    }
}
