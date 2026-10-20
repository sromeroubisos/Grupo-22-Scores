'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import PreferencesWizard from '@/components/PreferencesWizard'
import { useAuth } from '@/context/AuthContext'
import { sanitizeReturnTo } from '@/app/login/redirects'

// Primer ingreso con cuenta (ConditionalLayout manda acá hasta que se completa o
// se saltea) y edición de favoritos (?edit=true). El recorrido en sí vive en
// PreferencesWizard; la misma pieza se ofrece sobre la home a quien no tiene cuenta.
function OnboardingPreferencesContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { user } = useAuth()
    const isEditMode = searchParams.get('edit') === 'true'
    const returnTo = sanitizeReturnTo(searchParams.get('returnTo'), null)

    return (
        <PreferencesWizard
            variant="page"
            editing={isEditMode}
            onClose={() => router.push(isEditMode && user ? '/profile?tab=perfil' : returnTo)}
        />
    )
}

export default function OnboardingPreferencesPage() {
    return (
        <Suspense>
            <OnboardingPreferencesContent />
        </Suspense>
    )
}
