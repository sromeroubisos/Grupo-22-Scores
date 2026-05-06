'use client'

import { createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage } from '@/lib/auth/errors'

export function normalizeEmail(value: string): string {
    return value.trim().toLowerCase()
}

export async function signInWithPasswordAndRedirect(input: {
    email: string
    password: string
    returnTo: string
}) {
    const supabase = createClient()
    const normalizedEmail = normalizeEmail(input.email)
    const trimmedPassword = input.password.trim()

    if (!normalizedEmail || !trimmedPassword) {
        throw new Error('Por favor completa todos los campos')
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: trimmedPassword,
    })

    if (error) {
        throw new Error(getAuthErrorMessage(error, 'No pudimos iniciar sesion. Intenta nuevamente.'))
    }

    console.log('[login] Login successful for:', data.user?.email)
    console.log('[login] Session present:', !!data.session)

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
