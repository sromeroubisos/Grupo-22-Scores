'use client'

import { createClient } from '@/lib/supabase/client'

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
        if (
            error.message.includes('supabase_auth_unreachable')
            || error.message.includes('Supabase auth request failed')
            || error.message.includes('Failed to fetch')
        ) {
            throw new Error('No pudimos contactar el servicio de autenticacion. Intenta de nuevo en unos segundos.')
        }

        if (error.message.includes('Invalid login credentials')) {
            throw new Error('Credenciales incorrectas. Verifica tu email y contrasena.')
        }

        if (error.message.includes('Email not confirmed')) {
            throw new Error('Tu email todavia no fue confirmado. Revisa tu correo y abre el enlace de confirmacion antes de iniciar sesion.')
        }

        throw error
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
