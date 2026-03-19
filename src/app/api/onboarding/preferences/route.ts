import { NextRequest, NextResponse } from 'next/server'

import { getActiveSports } from '@/lib/data/sports'
import {
    completeOnboarding,
    getFavoriteLeagues,
    getFavoriteSports,
    getLeaguesBySports,
    getOnboardingStatus,
    saveFavoriteLeagues,
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
    leagues?: unknown
}

type SportRow = {
    id: string
    name: string
    name_es: string | null
    icon: string | null
    display_order: number | null
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
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error || !session?.user) {
        return { supabase, userId: null as string | null }
    }

    return { supabase, userId: session.user.id }
}

async function getSports(supabase: Awaited<ReturnType<typeof createClient>>) {
    const { data, error } = await supabase
        .from('sports')
        .select('id, name, name_es, icon, display_order')
        .neq('is_visible', false)
        .is('group_key', null)
        .order('display_order', { ascending: true })

    if (error) {
        console.warn('[api/onboarding/preferences] sports query error, using fallback:', error.message)
    }

    const mapped = ((data ?? []) as SportRow[]).map(sport => ({
        id: sport.id,
        name: sport.name,
        nameEs: sport.name_es || sport.name,
        icon: sport.icon || '?',
        displayOrder: sport.display_order ?? 100,
    }))

    return mapped.length > 0 ? mapped : buildFallbackSports()
}

function parseSportIds(value: string | null) {
    if (!value) return []

    return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
}

function normalizeSportIds(value: unknown) {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function normalizeLeagues(value: unknown) {
    if (!Array.isArray(value)) return []

    return value
        .filter((item): item is { leagueId: string; sportId: string } => (
            typeof item === 'object' &&
            item !== null &&
            typeof (item as { leagueId?: unknown }).leagueId === 'string' &&
            typeof (item as { sportId?: unknown }).sportId === 'string'
        ))
        .map(item => ({
            leagueId: item.leagueId,
            sportId: item.sportId,
        }))
}

export async function GET(request: NextRequest) {
    try {
        const mode = request.nextUrl.searchParams.get('mode')
        const { supabase, userId } = await getCurrentUserId()

        if (mode === 'status') {
            if (!userId) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }

            const status = await getOnboardingStatus(supabase, userId)
            const onboardingCompleted = !!(status?.preferences_onboarding_completed || status?.skipped)

            return NextResponse.json({ onboardingCompleted })
        }

        const sportIds = parseSportIds(request.nextUrl.searchParams.get('sportIds'))
        const [sports, leagues, favoriteSports, favoriteLeagues] = await Promise.all([
            getSports(supabase),
            sportIds.length > 0 ? getLeaguesBySports(supabase, sportIds) : Promise.resolve([]),
            userId ? getFavoriteSports(supabase, userId) : Promise.resolve([]),
            userId ? getFavoriteLeagues(supabase, userId) : Promise.resolve([]),
        ])

        return NextResponse.json({
            sports,
            leagues,
            favoriteSports,
            favoriteLeagues,
        })
    } catch (error) {
        console.error('[api/onboarding/preferences] GET error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as SavePreferencesPayload
        const { supabase, userId } = await getCurrentUserId()

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (payload.skipped) {
            await completeOnboarding(supabase, userId, { skipped: true })
            return NextResponse.json({ ok: true, onboardingCompleted: true })
        }

        const sportIds = normalizeSportIds(payload.sportIds)
        const leagues = normalizeLeagues(payload.leagues).filter(league => sportIds.includes(league.sportId))

        await saveFavoriteSports(supabase, userId, sportIds)
        await saveFavoriteLeagues(supabase, userId, leagues)
        await completeOnboarding(supabase, userId, {
            skipped: false,
            sportsCompleted: sportIds.length > 0,
            leaguesCompleted: leagues.length > 0,
        })

        return NextResponse.json({ ok: true, onboardingCompleted: true })
    } catch (error) {
        console.error('[api/onboarding/preferences] POST error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
