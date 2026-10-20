'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

import { useAuth } from '@/context/AuthContext'
import {
    EMPTY_LOCAL_PREFERENCES,
    readLocalPreferences,
    subscribeLocalPreferences,
} from '@/lib/localPreferences'
import { getFavoriteLeagues, getFavoriteSports } from '@/lib/services/preferencesService'
import { createClient } from '@/lib/supabase/client'

interface UserPreferences {
    favoriteSportIds: string[]
    favoriteLeagueIds: string[]
    isLoading: boolean
}

interface Loaded {
    favoriteSportIds: string[]
    favoriteLeagueIds: string[]
    at: number
}

const FRESH_MS = 60_000

// Los deportes favoritos se piden UNA vez por usuario y se comparten entre la
// portada, el perfil y /torneos. Antes cada pantalla los pedía de nuevo y
// arrancaba con la lista vacía: el orden de los deportes saltaba al llegar.
const loadedByUser = new Map<string, Loaded>()
const inFlightByUser = new Map<string, Promise<Loaded>>()
const NONE: string[] = []

function loadPreferences(userId: string): Promise<Loaded> {
    const pending = inFlightByUser.get(userId)
    if (pending) return pending

    const supabase = createClient()
    const promise = Promise.all([
        getFavoriteSports(supabase, userId),
        getFavoriteLeagues(supabase, userId),
    ])
        .then(([sports, leagues]) => {
            const loaded = { favoriteSportIds: sports, favoriteLeagueIds: leagues.map((entry) => entry.leagueId), at: Date.now() }
            loadedByUser.set(userId, loaded)
            return loaded
        })
        .finally(() => {
            inFlightByUser.delete(userId)
        })
    inFlightByUser.set(userId, promise)
    return promise
}

/** Después de guardar el onboarding: la próxima lectura vuelve a pedir y no devuelve lo viejo. */
export function invalidateUserPreferences(userId: string) {
    loadedByUser.delete(userId)
    inFlightByUser.delete(userId)
}

export function useUserPreferences(): UserPreferences {
    const { user, isLoading: authLoading, isSessionVerified } = useAuth()
    const userId = user?.id
    const local = useSyncExternalStore(subscribeLocalPreferences, readLocalPreferences, () => EMPTY_LOCAL_PREFERENCES)
    const [loaded, setLoaded] = useState<Loaded | null>(() => (userId ? loadedByUser.get(userId) ?? null : null))

    useEffect(() => {
        if (authLoading || !isSessionVerified || !userId) return

        let cancelled = false
        // Con datos ya cargados se muestran enseguida y se revalidan por detrás.
        const known = loadedByUser.get(userId)
        if (known) {
            setLoaded(known)
            if (Date.now() - known.at < FRESH_MS) return
        }

        loadPreferences(userId)
            .then((next) => {
                if (!cancelled) setLoaded(next)
            })
            .catch((err) => {
                console.error('[useUserPreferences] load error:', err)
            })

        return () => {
            cancelled = true
        }
    }, [authLoading, isSessionVerified, userId])

    // Sin cuenta, lo que eligió en este dispositivo.
    if (!userId) {
        return {
            favoriteSportIds: local.sportIds,
            favoriteLeagueIds: local.leagues.map((league) => league.id),
            isLoading: authLoading,
        }
    }

    const current = loaded ?? loadedByUser.get(userId) ?? null
    return {
        favoriteSportIds: current?.favoriteSportIds ?? NONE,
        favoriteLeagueIds: current?.favoriteLeagueIds ?? NONE,
        isLoading: current === null,
    }
}
