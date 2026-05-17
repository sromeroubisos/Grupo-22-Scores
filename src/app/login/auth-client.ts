'use client'

import { clearSupabaseBrowserSession, createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage } from '@/lib/auth/errors'
import { commitSupabaseSessionForServer } from '@/lib/supabase/sessionBridge'

export function normalizeEmail(value: string): string {
    return value.trim().toLowerCase()
}

// Errors that are NOT user fault and where a forced session reset + retry
// is a sensible recovery (covers stale cookies, poisoned local storage,
// cached client referencing an old session, etc.). Credential errors are
// explicitly excluded - we should never silently retry "wrong password".
function shouldRetryAfterReset(error: { message?: string; status?: number; code?: string } | null) {
    if (!error) return false
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('invalid login credentials')) return false
    if (msg.includes('email not confirmed')) return false
    if (error.status === 400 && msg.includes('credentials')) return false
    return (
        msg.includes('refresh token') ||
        msg.includes('code verifier') ||
        msg.includes('code_verifier') ||
        msg.includes('session') ||
        msg.includes('jwt') ||
        msg.includes('token') ||
        msg.includes('unauthorized') ||
        error.status === 401 ||
        error.status === 403
    )
}

export async function signInWithPasswordAndRedirect(input: {
    email: string
    password: string
    returnTo: string
}) {
    const normalizedEmail = normalizeEmail(input.email)
    const trimmedPassword = input.password.trim()

    if (!normalizedEmail || !trimmedPassword) {
        throw new Error('Por favor completa todos los campos')
    }

    // Proactively wipe any stale session/cookie state BEFORE attempting to
    // sign in. This is the root fix for "works in incognito, fails in
    // normal browser": stale sb-*-auth-token cookies (especially under the
    // shared .g22scores.com domain) get sent to Supabase and to our own
    // SSR routes, where they shadow the new credentials being set.
    // Password login is a hard reset by definition, so clearing prior
    // session data is always safe here.
    clearSupabaseBrowserSession()

    let supabase = createClient()
    let { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: trimmedPassword,
    })

    // One automatic retry after a forced reset when the failure smells
    // like state corruption rather than bad credentials.
    if (error && shouldRetryAfterReset(error)) {
        console.warn('[login] first attempt failed with recoverable auth error, retrying after reset:', error.message)
        clearSupabaseBrowserSession()
        supabase = createClient()
        const retry = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password: trimmedPassword,
        })
        data = retry.data
        error = retry.error
    }

    if (error) {
        throw new Error(getAuthErrorMessage(error, 'No pudimos iniciar sesion. Intenta nuevamente.'))
    }

    console.log('[login] Login successful for:', data.user?.email)
    console.log('[login] Session present:', !!data.session)

    if (!data.session) {
        throw new Error('No pudimos confirmar la sesion. Intenta nuevamente.')
    }

    await commitSupabaseSessionForServer(data.session, input.returnTo)

    try {
        await fetch('/api/auth/guest-club-family', {
            method: 'DELETE',
            credentials: 'same-origin',
        })
    } catch (guestCleanupError) {
        console.warn('[login] guest cleanup failed, continuing:', guestCleanupError)
    }

    try {
        await fetch('/api/auth/sync-user', {
            method: 'POST',
            credentials: 'same-origin',
        })
    } catch (syncError) {
        console.warn('[login] sync-user failed, continuing with redirect:', syncError)
    }

    window.location.assign(input.returnTo)
}
