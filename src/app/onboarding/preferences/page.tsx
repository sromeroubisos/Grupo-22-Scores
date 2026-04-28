'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { useAuth } from '@/context/AuthContext'
import { setOnboardingStorageStatus } from '@/lib/onboardingStatus'
import { sanitizeReturnTo } from '@/app/login/redirects'

import styles from './onboarding.module.css'

interface SportOption {
    id: string
    name: string
    nameEs: string
    icon: string
    displayOrder: number
}

interface PreferencesResponse {
    sports: SportOption[]
    favoriteSports: string[]
}


async function readJson<T>(response: Response): Promise<T> {
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
        const message =
            payload &&
                typeof payload === 'object' &&
                'error' in payload &&
                typeof payload.error === 'string'
                ? payload.error
                : `Request failed with status ${response.status}`

        throw new Error(message)
    }

    return payload as T
}

function CheckIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    )
}

function OnboardingPreferencesContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const isEditMode = searchParams.get('edit') === 'true'
    const returnTo = sanitizeReturnTo(searchParams.get('returnTo'), null)
    const { user, refreshOnboardingStatus } = useAuth()

    const [sports, setSports] = useState<SportOption[]>([])
    const [selectedSportIds, setSelectedSportIds] = useState<string[]>([])
    const [loadingSports, setLoadingSports] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function loadSports() {
            setLoadingSports(true)

            try {
                const response = await fetch('/api/onboarding/preferences', {
                    cache: 'no-store',
                    credentials: 'same-origin',
                })
                const payload = await readJson<PreferencesResponse>(response)

                let mapped = payload.sports || []

                if (mapped.length === 0) {
                    const { getActiveSports } = await import('@/lib/data/sports')
                    mapped = getActiveSports()
                        .filter(sport => !sport.groupKey)
                        .map(sport => ({
                            id: sport.id,
                            name: sport.name,
                            nameEs: sport.nameEs,
                            icon: sport.icon,
                            displayOrder: sport.displayOrder ?? sport.priority ?? 100,
                        }))
                }

                setSports(mapped)

                if (isEditMode && user) {
                    setSelectedSportIds(payload.favoriteSports || [])
                }
            } catch (err: unknown) {
                console.error('[Onboarding] loadSports error:', err)
                setError('No se pudieron cargar los deportes. Intenta de nuevo.')
            } finally {
                setLoadingSports(false)
            }
        }

        loadSports()
    }, [isEditMode, user])

    const toggleSport = useCallback((sportId: string) => {
        setSelectedSportIds(prev =>
            prev.includes(sportId)
                ? prev.filter(id => id !== sportId)
                : [...prev, sportId]
        )
    }, [])

    const handleSkip = async () => {
        if (!user) {
            router.push(returnTo)
            return
        }

        setIsSaving(true)

        try {
            const response = await fetch('/api/onboarding/preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({ skipped: true }),
            })

            await readJson<{ ok: boolean }>(response)
            setOnboardingStorageStatus(user.id, { skipped: true })
            await refreshOnboardingStatus()
            router.push(returnTo)
        } catch (err) {
            console.error('[Onboarding] handleSkip error:', err)
            setError('Ocurrio un error. Intenta de nuevo.')
        } finally {
            setIsSaving(false)
        }
    }

    const handleFinish = async () => {
        if (!user) {
            router.push(returnTo)
            return
        }

        setIsSaving(true)
        setError(null)

        try {
            const response = await fetch('/api/onboarding/preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    skipped: false,
                    sportIds: selectedSportIds,
                }),
            })

            await readJson<{ ok: boolean }>(response)
            setOnboardingStorageStatus(user.id, { skipped: false })
            await refreshOnboardingStatus()

            if (isEditMode) {
                router.push('/profile?tab=perfil')
            } else {
                router.push(returnTo)
            }
        } catch (err) {
            console.error('[Onboarding] handleFinish error:', err)
            setError('Error al guardar tus preferencias. Intenta de nuevo.')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div className={styles.brandMark}>
                    <span className={styles.brandLogo}>G22</span>
                    <span className={styles.brandSep} />
                    <span className={styles.brandTagline}>
                        {isEditMode ? 'EDITAR PREFERENCIAS' : 'CONFIGURACION INICIAL'}
                    </span>
                </div>

                <div className={styles.stepLabel}>
                    <span className={styles.stepLabelDot} />
                    Paso 01 / 01
                </div>

                <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: '100%' }} />
                </div>

                <h1 className={styles.title}>
                    {isEditMode ? 'Edita tus deportes favoritos' : 'Elegi tus deportes favoritos'}
                </h1>
                <p className={styles.subtitle}>
                    Te vamos a mostrar primero el contenido del deporte que mas te interesa.
                </p>
            </div>

            <div className={`${styles.container} ${styles.stepEnter}`}>
                {error && (
                    <div style={{
                        padding: '12px 16px',
                        background: 'rgba(220, 38, 38, 0.08)',
                        border: '1px solid rgba(220, 38, 38, 0.25)',
                        borderRadius: '10px',
                        color: '#dc2626',
                        fontSize: '0.88rem',
                        marginBottom: '20px',
                        fontWeight: 500,
                    }}>
                        {error}
                    </div>
                )}

                <div className={`${styles.selectionBadge} ${selectedSportIds.length === 0 ? styles.hidden : ''}`}>
                    ✓ {selectedSportIds.length} deporte{selectedSportIds.length !== 1 ? 's' : ''} seleccionado{selectedSportIds.length !== 1 ? 's' : ''}
                </div>

                {loadingSports ? (
                    <div className={styles.loadingSpinner}>
                        <div className={styles.spinner} />
                    </div>
                ) : sports.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyStateIcon}>🏆</div>
                        <div className={styles.emptyStateText}>No hay deportes disponibles</div>
                        <div className={styles.emptyStateSub}>Podes continuar y configurar esto mas adelante.</div>
                    </div>
                ) : (
                    <div className={styles.sportsGrid}>
                        {sports.map(sport => {
                            const isSelected = selectedSportIds.includes(sport.id)

                            return (
                                <button
                                    key={sport.id}
                                    className={`${styles.sportCard} ${isSelected ? styles.selected : ''}`}
                                    onClick={() => toggleSport(sport.id)}
                                    type="button"
                                    aria-pressed={isSelected}
                                >
                                    <div className={styles.sportCardCheck}>
                                        <CheckIcon size={11} />
                                    </div>
                                    <span className={styles.sportIcon}>{sport.icon}</span>
                                    <span className={styles.sportName}>{sport.nameEs}</span>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            <div className={styles.bottomBar}>
                <div className={styles.bottomBarInner}>
                    {!isEditMode && (
                        <button
                            className={styles.btnGhost}
                            onClick={handleSkip}
                            disabled={isSaving}
                            type="button"
                        >
                            Omitir
                        </button>
                    )}

                    {isEditMode && (
                        <button
                            className={styles.btnSecondary}
                            onClick={() => router.push('/profile?tab=perfil')}
                            type="button"
                        >
                            Cancelar
                        </button>
                    )}

                    <button
                        className={styles.btnPrimary}
                        onClick={handleFinish}
                        disabled={isSaving || selectedSportIds.length === 0}
                        type="button"
                    >
                        {isSaving ? 'Guardando...' : 'Finalizar'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function OnboardingPreferencesPage() {
    return (
        <Suspense>
            <OnboardingPreferencesContent />
        </Suspense>
    )
}
