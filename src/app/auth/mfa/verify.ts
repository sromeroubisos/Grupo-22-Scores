'use client'

import type { LooseSupabaseClient } from '@/lib/supabase/loose'
import { commitSupabaseSessionForServer } from '@/lib/supabase/sessionBridge'

/**
 * Verificar el código y quedar con la sesión nueva, en los dos lados.
 *
 * `challengeAndVerify` devuelve tokens NUEVOS: el access token viejo era `aal1`
 * y el nuevo trae `aal: 'aal2'`. Si no se commitea al servidor, el navegador
 * queda verificado y el servidor sigue viendo aal1 — o sea, el guard rebota de
 * nuevo a esta misma pantalla y el usuario queda en un rulo.
 *
 * Y se sale con `window.location.assign`, no con el router: hace falta un
 * request completo para que los Server Components se rendericen con la cookie
 * nueva.
 */
export async function verificarCodigoYSalir(
    supabase: LooseSupabaseClient,
    factorId: string,
    code: string,
    returnTo: string,
): Promise<void> {
    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.replace(/\s+/g, ''),
    })

    if (error) throw error
    if (!data?.access_token || !data?.refresh_token) {
        throw new Error('La verificacion no devolvio una sesion nueva. Intenta de nuevo.')
    }

    await commitSupabaseSessionForServer(
        { access_token: data.access_token, refresh_token: data.refresh_token },
        returnTo,
    )

    window.location.assign(returnTo)
}

/** Los códigos TOTP son seis dígitos. Se limpia lo que pegue el usuario. */
export function normalizarCodigo(raw: string): string {
    return raw.replace(/\D/g, '').slice(0, 6)
}
