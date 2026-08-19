import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnboardingStatus {
    user_id: string
    preferences_onboarding_completed: boolean
    sports_completed: boolean
    leagues_completed: boolean
    skipped: boolean
    completed_at: string | null
    updated_at: string
}

export interface FavoriteLeagueEntry {
    leagueId: string
    sportId: string
    sortOrder: number
}

export interface LeagueItem {
    id: string
    name: string
    displayName: string | null
    sport: string
    country: string | null
    logoUrl: string | null
}

interface FavoriteSportRow {
    sport_id: string
}

interface FavoriteLeagueRow {
    league_id: string
    sport_id: string | null
    sort_order: number | null
}

interface UnionBranding {
    logo_url?: string | null
    organization?: {
        identity?: {
            sport?: string | null
        }
    }
}

interface UnionRow {
    id: string
    name: string
    country: string | null
    branding?: UnionBranding | null
}

interface TournamentRow {
    id: string
    name: string
    display_name: string | null
    country_id: string | null
    sport_id: string
    logo_url: string | null
}

// ─── Transport failures ───────────────────────────────────────────────────────

type QueryError = { message?: string; code?: string }
type QueryResult<T> = { data: T | null; error: QueryError | null }

// supabase-js does not throw when the network fails: it catches the TypeError
// and hands it back as `error.message === 'TypeError: Failed to fetch'`. That
// bucket holds a dropped connection, a tab navigating away with the request in
// flight, an extension blocking supabase.co, the browser's ~6 connections/host
// cap under a burst, and a 5xx from the pooler that arrives without CORS
// headers. None of them is a query error, and one more attempt clears most.
const TRANSPORT_ERROR_HINTS = [
    'failed to fetch',
    'networkerror',
    'network request failed',
    'load failed',
    'fetch failed',
]

const TRANSPORT_RETRY_DELAY_MS = 400

function isTransportError(error: QueryError | null | undefined): boolean {
    if (!error?.message) return false
    const message = error.message.toLowerCase()
    return TRANSPORT_ERROR_HINTS.some((hint) => message.includes(hint))
}

/**
 * Runs a read query and retries it once when the transport failed rather than
 * the query. Only reads go through here: every one of them degrades to an empty
 * result, so replaying it is free. Writes stay single-shot on purpose — an
 * insert whose response was lost may well have landed server-side.
 *
 * A transport failure is logged as a warning, not an error: the caller already
 * handles it, and Next's dev overlay promotes every console.error to a full
 * error card.
 */
async function readWithRetry<T>(
    label: string,
    run: () => Promise<QueryResult<T>>,
    options: { ignoreCodes?: string[] } = {}
): Promise<T | null> {
    let result = await run()

    if (isTransportError(result.error)) {
        await new Promise((resolve) => setTimeout(resolve, TRANSPORT_RETRY_DELAY_MS))
        result = await run()
    }

    const { data, error } = result
    if (!error) return data
    if (error.code && options.ignoreCodes?.includes(error.code)) return data

    if (isTransportError(error)) {
        console.warn(
            `[preferencesService] ${label}: Supabase unreachable (${error.message}). Continuing without data.`
        )
    } else {
        console.error(`[preferencesService] ${label} error:`, error.message)
    }

    return null
}

// ─── Onboarding Status ────────────────────────────────────────────────────────

export async function getOnboardingStatus(
    supabase: SupabaseClient,
    userId: string
): Promise<OnboardingStatus | null> {
    const data = await readWithRetry<OnboardingStatus>(
        'getOnboardingStatus',
        async () => supabase
            .from('user_onboarding_status')
            .select('*')
            .eq('user_id', userId)
            .single(),
        { ignoreCodes: ['PGRST116'] }
    )

    return data ?? null
}

export async function ensureOnboardingStatus(
    supabase: SupabaseClient,
    userId: string
): Promise<void> {
    const { error } = await supabase
        .from('user_onboarding_status')
        .upsert({
            user_id: userId,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

    if (error) {
        console.error('[preferencesService] ensureOnboardingStatus error:', error.message)
        throw error
    }
}

export async function completeOnboarding(
    supabase: SupabaseClient,
    userId: string,
    options: { skipped: boolean; sportsCompleted?: boolean; leaguesCompleted?: boolean }
): Promise<void> {
    const { error } = await supabase
        .from('user_onboarding_status')
        .upsert({
            user_id: userId,
            preferences_onboarding_completed: true,
            sports_completed: options.sportsCompleted ?? !options.skipped,
            leagues_completed: options.leaguesCompleted ?? !options.skipped,
            skipped: options.skipped,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

    if (error) {
        console.error('[preferencesService] completeOnboarding error:', error.message)
        throw error
    }
}

// ─── Favorite Sports ──────────────────────────────────────────────────────────

export async function getFavoriteSports(
    supabase: SupabaseClient,
    userId: string
): Promise<string[]> {
    const data = await readWithRetry<FavoriteSportRow[]>(
        'getFavoriteSports',
        async () => supabase
            .from('user_favorite_sports')
            .select('sport_id, sort_order')
            .eq('user_id', userId)
            .order('sort_order', { ascending: true })
    )

    return (data ?? []).map((row) => row.sport_id)
}

export async function saveFavoriteSports(
    supabase: SupabaseClient,
    userId: string,
    sportIds: string[]
): Promise<void> {
    // Delete all existing favorites for this user
    const { error: deleteError } = await supabase
        .from('user_favorite_sports')
        .delete()
        .eq('user_id', userId)

    if (deleteError) {
        console.error('[preferencesService] saveFavoriteSports delete error:', deleteError.message)
        throw deleteError
    }

    if (sportIds.length === 0) return

    // Insert new favorites with sort order
    const rows = sportIds.map((sportId, index) => ({
        user_id: userId,
        sport_id: sportId,
        sort_order: index,
    }))

    const { error: insertError } = await supabase
        .from('user_favorite_sports')
        .insert(rows)

    if (insertError) {
        console.error('[preferencesService] saveFavoriteSports insert error:', insertError.message)
        throw insertError
    }
}

// ─── Favorite Leagues ─────────────────────────────────────────────────────────

export async function getFavoriteLeagues(
    supabase: SupabaseClient,
    userId: string
): Promise<FavoriteLeagueEntry[]> {
    const data = await readWithRetry<FavoriteLeagueRow[]>(
        'getFavoriteLeagues',
        async () => supabase
            .from('user_favorite_leagues')
            .select('league_id, sport_id, sort_order')
            .eq('user_id', userId)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false })
    )

    return (data ?? []).map((row) => ({
        leagueId: String(row.league_id),
        sportId: String(row.sport_id || ''),
        sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    }))
}

export async function saveFavoriteLeagues(
    supabase: SupabaseClient,
    userId: string,
    leagues: { leagueId: string; sportId: string }[]
): Promise<void> {
    const { error: deleteError } = await supabase
        .from('user_favorite_leagues')
        .delete()
        .eq('user_id', userId)

    if (deleteError) {
        console.error('[preferencesService] saveFavoriteLeagues delete error:', deleteError.message)
        throw deleteError
    }

    if (leagues.length === 0) return

    const rows = leagues.map((league, index) => ({
        user_id: userId,
        league_id: league.leagueId,
        sport_id: league.sportId,
        display_name: league.leagueId,
        sort_order: index,
    }))

    const { error: insertError } = await supabase
        .from('user_favorite_leagues')
        .insert(rows)

    if (insertError) {
        console.error('[preferencesService] saveFavoriteLeagues insert error:', insertError.message)
        throw insertError
    }
}

// ─── League Discovery ─────────────────────────────────────────────────────────

export async function getLeaguesBySports(
    supabase: SupabaseClient,
    sportIds: string[]
): Promise<LeagueItem[]> {
    if (sportIds.length === 0) return []

    // Query 1: tournaments table
    // - Exclude only 'archived' (include draft, published, active)
    // - Use neq(is_visible, false) to include both true AND null values
    const tourData = await readWithRetry<TournamentRow[]>(
        'getLeaguesBySports tournaments',
        async () => supabase
            .from('tournaments')
            .select('id, name, display_name, country_id, sport_id, logo_url, is_visible, slug')
            .in('sport_id', sportIds)
            .neq('is_visible', false)
            .order('name', { ascending: true })
    )

    // Query 2: unions table (federations/leagues/associations)
    // sport column may not exist — fetch all and filter client-side via branding JSONB
    const unionData = await readWithRetry<UnionRow[]>(
        'getLeaguesBySports unions',
        async () => supabase
            .from('unions')
            .select('id, name, country, branding')
            .order('name', { ascending: true })
    )

    const results: LeagueItem[] = []

    // Map tournaments — use raw UUID as id (matches tournament IDs used in the home page)
    for (const t of (tourData ?? [])) {
        results.push({
            id: String(t.id),
            name: t.display_name || t.name,
            displayName: t.display_name ?? null,
            sport: t.sport_id,
            country: t.country_id ?? null,
            logoUrl: t.logo_url || null,
        })
    }

    // Map unions — extract sport from branding JSONB, filter client-side
    for (const u of (unionData ?? [])) {
        const effectiveSport = u.branding?.organization?.identity?.sport
        if (!effectiveSport || !sportIds.includes(effectiveSport)) continue
        results.push({
            id: String(u.id),
            name: u.name,
            displayName: null,
            sport: effectiveSport,
            country: u.country ?? null,
            logoUrl: u.branding?.logo_url ?? null,
        })
    }

    return results.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
