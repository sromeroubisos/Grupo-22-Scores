import { NextRequest, NextResponse } from 'next/server'

import { SPORTS, getActiveSports } from '@/lib/data/sports'
import { buildOnboardingMetadata, getOnboardingMetadataStatus } from '@/lib/onboardingStatus'
import {
    completeOnboarding,
    getFavoriteSports,
    getOnboardingStatus,
    saveFavoriteSports,
} from '@/lib/services/preferencesService'
import { createClient } from '@/lib/supabase/server'

type SportOption = {
    id: string
    name: string
    nameEs: string
    icon: string
    displayOrder: number
}

type SavePreferencesPayload = {
    skipped?: boolean
    sportIds?: unknown
}

type SportRow = {
    id: string
    name: string
    icon: string | null
    display_order: number | null
}

async function clearLeagueFavoritesState(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string
) {
    void supabase
    void userId
}

function buildFallbackSports(): SportOption[] {
    return getActiveSports()
        .filter(sport => !sport.groupKey)
        .map(sport => ({
            id: sport.id,
            name: sport.name,
            nameEs: sport.nameEs,
            icon: sport.icon,
            displayOrder: sport.displayOrder ?? sport.priority ?? 100,
        }))
}

async function getCurrentUserId() {
    const supabase = await createClient()
    const { data: { user: authUser }, error } = await supabase.auth.getUser()

    if (error || !authUser) {
        return { supabase, authUser: null, userId: null as string | null }
    }

    return { supabase, authUser, userId: authUser.id }
}

async function getSports(supabase: Awaited<ReturnType<typeof createClient>>) {
    const { data, error } = await supabase
        .from('sports')
        .select('id, name, icon, display_order')
        .neq('is_visible', false)
        .order('display_order', { ascending: true })

    if (error) {
        console.warn('[api/onboarding/preferences] sports query error, using fallback:', error.message)
    }

    const mapped = ((data ?? []) as SportRow[])
        .filter(sport => !SPORTS[sport.id as keyof typeof SPORTS]?.groupKey)
        .map(sport => {
            const staticSport = SPORTS[sport.id as keyof typeof SPORTS]

            return {
                id: sport.id,
                name: sport.name,
                nameEs: staticSport?.nameEs || sport.name,
                icon: sport.icon || staticSport?.icon || '?',
                displayOrder: sport.display_order ?? staticSport?.priority ?? 100,
            }
        })

    return mapped.length > 0 ? mapped : buildFallbackSports()
}

function normalizeSportIds(value: unknown) {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export async function GET(request: NextRequest) {
    try {
        const mode = request.nextUrl.searchParams.get('mode')
        const { supabase, authUser, userId } = await getCurrentUserId()

        if (mode === 'status') {
            if (!userId) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }

            const status = await getOnboardingStatus(supabase, userId)
            const metadataStatus = getOnboardingMetadataStatus(authUser?.user_metadata)
            const onboardingCompleted = !!(
                status?.preferences_onboarding_completed ||
                status?.skipped ||
                metadataStatus.completed
            )

            return NextResponse.json({ onboardingCompleted })
        }

        const [sports, favoriteSports] = await Promise.all([
            getSports(supabase),
            userId ? getFavoriteSports(supabase, userId) : Promise.resolve([]),
        ])

        return NextResponse.json({
            sports,
            leagues: [],
            favoriteSports,
            favoriteLeagues: [],
        })
    } catch (error) {
        console.error('[api/onboarding/preferences] GET error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as SavePreferencesPayload
        const { supabase, authUser, userId } = await getCurrentUserId()

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const persistMetadataFallback = async (skipped: boolean) => {
            const { error } = await supabase.auth.updateUser({
                data: buildOnboardingMetadata(authUser?.user_metadata, { skipped }),
            })

            if (error) {
                console.warn('[api/onboarding/preferences] auth metadata update failed:', error.message)
            }
        }

        if (payload.skipped) {
            await clearLeagueFavoritesState(supabase, userId)
            await completeOnboarding(supabase, userId, { skipped: true })
            await persistMetadataFallback(true)
            return NextResponse.json({ ok: true, onboardingCompleted: true })
        }

        const sportIds = normalizeSportIds(payload.sportIds)

        await saveFavoriteSports(supabase, userId, sportIds)
        await clearLeagueFavoritesState(supabase, userId)
        await completeOnboarding(supabase, userId, {
            skipped: false,
            sportsCompleted: sportIds.length > 0,
            leaguesCompleted: false,
        })
        await persistMetadataFallback(false)

        return NextResponse.json({ ok: true, onboardingCompleted: true })
    } catch (error) {
        console.error('[api/onboarding/preferences] POST error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
