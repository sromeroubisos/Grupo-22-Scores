'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { useAuth } from '@/context/AuthContext'
import { type LeagueItem } from '@/lib/services/preferencesService'

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
    leagues: LeagueItem[]
    favoriteSports: string[]
    favoriteLeagues: { leagueId: string; sportId: string }[]
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

function SearchIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
        </svg>
    )
}

function ArrowLeftIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
    )
}

function ArrowRightIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
    )
}

function OnboardingPreferencesContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const isEditMode = searchParams.get('edit') === 'true'
    const { user, refreshOnboardingStatus } = useAuth()

    const [step, setStep] = useState<1 | 2>(1)
    const [sports, setSports] = useState<SportOption[]>([])
    const [selectedSportIds, setSelectedSportIds] = useState<string[]>([])
    const [leagues, setLeagues] = useState<LeagueItem[]>([])
    const [selectedLeagueEntries, setSelectedLeagueEntries] = useState<{ leagueId: string; sportId: string }[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [loadingSports, setLoadingSports] = useState(true)
    const [loadingLeagues, setLoadingLeagues] = useState(false)
    const [leagueLoadError, setLeagueLoadError] = useState(false)
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

    const loadLeagues = useCallback(async () => {
        if (selectedSportIds.length === 0) return

        setLoadingLeagues(true)
        setLeagueLoadError(false)

        try {
            const params = new URLSearchParams({
                sportIds: selectedSportIds.join(','),
            })
            const response = await fetch(`/api/onboarding/preferences?${params.toString()}`, {
                cache: 'no-store',
                credentials: 'same-origin',
            })
            const payload = await readJson<PreferencesResponse>(response)
            const items = payload.leagues || []

            setLeagues(items)

            if (isEditMode && user && selectedLeagueEntries.length === 0) {
                const filtered = (payload.favoriteLeagues || []).filter(entry => selectedSportIds.includes(entry.sportId))
                setSelectedLeagueEntries(filtered.map(entry => ({
                    leagueId: entry.leagueId,
                    sportId: entry.sportId,
                })))
            }
        } catch (err) {
            console.error('[Onboarding] loadLeagues error:', err)
            setLeagueLoadError(true)
        } finally {
            setLoadingLeagues(false)
        }
    }, [isEditMode, selectedLeagueEntries.length, selectedSportIds, user])

    useEffect(() => {
        if (step !== 2) return
        loadLeagues()
    }, [loadLeagues, step])

    const toggleSport = useCallback((sportId: string) => {
        setSelectedSportIds(prev =>
            prev.includes(sportId)
                ? prev.filter(id => id !== sportId)
                : [...prev, sportId]
        )
    }, [])

    const toggleLeague = useCallback((leagueId: string, sportId: string) => {
        setSelectedLeagueEntries(prev => {
            const exists = prev.some(entry => entry.leagueId === leagueId)
            if (exists) {
                return prev.filter(entry => entry.leagueId !== leagueId)
            }

            return [...prev, { leagueId, sportId }]
        })
    }, [])

    const isLeagueSelected = useCallback((leagueId: string) => {
        return selectedLeagueEntries.some(entry => entry.leagueId === leagueId)
    }, [selectedLeagueEntries])

    const filteredLeagues = useMemo(() => {
        if (!searchQuery.trim()) return leagues

        const query = searchQuery.toLowerCase()
        return leagues.filter(league =>
            league.name.toLowerCase().includes(query) ||
            (league.country || '').toLowerCase().includes(query)
        )
    }, [leagues, searchQuery])

    const groupedLeagues = useMemo(() => {
        const groups: Record<string, { sport: SportOption; leagues: LeagueItem[] }> = {}

        for (const sportId of selectedSportIds) {
            const sport = sports.find(item => item.id === sportId)
            if (!sport) continue

            const sportLeagues = filteredLeagues.filter(league => league.sport === sportId)
            if (sportLeagues.length > 0) {
                groups[sportId] = { sport, leagues: sportLeagues }
            }
        }

        return groups
    }, [filteredLeagues, selectedSportIds, sports])

    const handleSkip = async () => {
        if (!user) {
            router.push('/')
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
            await refreshOnboardingStatus()
            router.push('/')
        } catch (err) {
            console.error('[Onboarding] handleSkip error:', err)
            setError('Ocurrio un error. Intenta de nuevo.')
        } finally {
            setIsSaving(false)
        }
    }

    const handleContinue = () => {
        if (selectedSportIds.length === 0) return

        setStep(2)
        setSearchQuery('')
        setError(null)
    }

    const handleBack = () => {
        setStep(1)
        setError(null)
    }

    const handleFinish = async (skipLeagues = false) => {
        if (!user) {
            router.push('/')
            return
        }

        setIsSaving(true)
        setError(null)

        try {
            const leaguesToSave = skipLeagues ? [] : selectedLeagueEntries
            const response = await fetch('/api/onboarding/preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    skipped: false,
                    sportIds: selectedSportIds,
                    leagues: leaguesToSave,
                }),
            })

            await readJson<{ ok: boolean }>(response)
            await refreshOnboardingStatus()

            if (isEditMode) {
                router.push('/profile?tab=ajustes')
            } else {
                router.push('/')
            }
        } catch (err) {
            console.error('[Onboarding] handleFinish error:', err)
            setError('Error al guardar tus preferencias. Intenta de nuevo.')
        } finally {
            setIsSaving(false)
        }
    }

    const progressPct = step === 1 ? 50 : 100

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
                    Paso {step === 1 ? '01' : '02'} / 02
                </div>

                <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
                </div>

                {step === 1 ? (
                    <>
                        <h1 className={styles.title}>
                            {isEditMode ? 'Edita tus deportes favoritos' : 'Elegi tus deportes favoritos'}
                        </h1>
                        <p className={styles.subtitle}>
                            Te vamos a mostrar primero el contenido que mas te interesa.
                        </p>
                    </>
                ) : (
                    <>
                        <h1 className={styles.title}>Elegi tus ligas favoritas</h1>
                        <p className={styles.subtitle}>
                            Personaliza tu feed con las competencias que seguis de cerca.
                        </p>
                    </>
                )}
            </div>

            <div className={`${styles.container} ${styles.stepEnter}`} key={step}>
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

                {step === 1 && (
                    <>
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
                    </>
                )}

                {step === 2 && (
                    <>
                        {selectedLeagueEntries.length > 0 && (
                            <div className={styles.selectionBadge}>
                                ✓ {selectedLeagueEntries.length} liga{selectedLeagueEntries.length !== 1 ? 's' : ''} seleccionada{selectedLeagueEntries.length !== 1 ? 's' : ''}
                            </div>
                        )}

                        <div className={styles.searchWrapper}>
                            <span className={styles.searchIcon}><SearchIcon /></span>
                            <input
                                type="text"
                                className={styles.searchInput}
                                placeholder="Buscar liga, pais o division..."
                                value={searchQuery}
                                onChange={event => setSearchQuery(event.target.value)}
                            />
                        </div>

                        {loadingLeagues ? (
                            <div className={styles.loadingSpinner}>
                                <div className={styles.spinner} />
                                <p style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--ob-text-dim)' }}>
                                    Cargando ligas...
                                </p>
                            </div>
                        ) : leagueLoadError ? (
                            <div className={styles.emptyState}>
                                <div className={styles.emptyStateIcon}>⚠️</div>
                                <div className={styles.emptyStateText}>No se pudieron cargar las ligas</div>
                                <div className={styles.emptyStateSub}>Verifica tu conexion e intenta de nuevo.</div>
                                <button
                                    onClick={() => loadLeagues()}
                                    type="button"
                                    style={{
                                        marginTop: '16px',
                                        padding: '10px 20px',
                                        background: 'var(--ob-primary)',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '10px',
                                        fontSize: '0.88rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    Reintentar
                                </button>
                            </div>
                        ) : Object.keys(groupedLeagues).length === 0 ? (
                            <div className={styles.emptyState}>
                                <div className={styles.emptyStateIcon}>
                                    {searchQuery ? '🔍' : '📭'}
                                </div>
                                <div className={styles.emptyStateText}>
                                    {searchQuery ? 'No se encontraron resultados' : 'No hay ligas disponibles para estos deportes'}
                                </div>
                                <div className={styles.emptyStateSub}>
                                    {searchQuery
                                        ? 'Proba con otro termino de busqueda.'
                                        : 'Podes finalizar igual y configurar esto mas adelante desde tu perfil.'}
                                </div>
                            </div>
                        ) : (
                            <div className={styles.leagueGroups}>
                                {Object.entries(groupedLeagues).map(([sportId, { sport, leagues: sportLeagues }]) => (
                                    <div key={sportId} className={styles.leagueGroup}>
                                        <div className={styles.leagueGroupHeader}>
                                            <span className={styles.leagueGroupIcon}>{sport.icon}</span>
                                            <span className={styles.leagueGroupName}>{sport.nameEs}</span>
                                            <span className={styles.leagueGroupCount}>{sportLeagues.length}</span>
                                        </div>
                                        <div className={styles.leagueList}>
                                            {sportLeagues.map(league => {
                                                const isSelected = isLeagueSelected(league.id)
                                                return (
                                                    <button
                                                        key={league.id}
                                                        className={`${styles.leagueRow} ${isSelected ? styles.selected : ''}`}
                                                        onClick={() => toggleLeague(league.id, league.sport)}
                                                        type="button"
                                                        aria-pressed={isSelected}
                                                    >
                                                        <div className={styles.leagueLogo}>
                                                            {league.logoUrl ? (
                                                                <img
                                                                    src={league.logoUrl}
                                                                    alt={league.name}
                                                                    onError={event => {
                                                                        event.currentTarget.style.display = 'none'
                                                                        const next = event.currentTarget.nextElementSibling as HTMLElement | null
                                                                        if (next) next.style.display = 'flex'
                                                                    }}
                                                                />
                                                            ) : null}
                                                            <span
                                                                className={styles.leagueLogoFallback}
                                                                style={league.logoUrl ? { display: 'none' } : {}}
                                                            >
                                                                🏆
                                                            </span>
                                                        </div>
                                                        <div className={styles.leagueInfo}>
                                                            <div className={styles.leagueName}>{league.name}</div>
                                                            {league.country && (
                                                                <div className={styles.leagueCountry}>{league.country}</div>
                                                            )}
                                                        </div>
                                                        <div className={styles.leagueCheck}>
                                                            <CheckIcon size={10} />
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className={styles.bottomBar}>
                <div className={styles.bottomBarInner}>
                    {step === 1 ? (
                        <>
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
                                    onClick={() => router.push('/profile?tab=ajustes')}
                                    type="button"
                                >
                                    Cancelar
                                </button>
                            )}
                            <button
                                className={styles.btnPrimary}
                                onClick={handleContinue}
                                disabled={selectedSportIds.length === 0}
                                type="button"
                            >
                                Continuar <ArrowRightIcon />
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                className={styles.btnSecondary}
                                onClick={handleBack}
                                disabled={isSaving}
                                type="button"
                            >
                                <ArrowLeftIcon /> Volver
                            </button>
                            {!isEditMode && (
                                <button
                                    className={styles.btnGhost}
                                    onClick={() => handleFinish(true)}
                                    disabled={isSaving}
                                    type="button"
                                >
                                    Omitir
                                </button>
                            )}
                            <button
                                className={styles.btnPrimary}
                                onClick={() => handleFinish(false)}
                                disabled={isSaving}
                                type="button"
                            >
                                {isSaving ? 'Guardando...' : 'Finalizar'}
                            </button>
                        </>
                    )}
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
