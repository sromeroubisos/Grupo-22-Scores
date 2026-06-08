import { upsertExternalTeamLogoOverride } from '@/lib/server/externalTeamLogoOverrides';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';

type ClubLogoSource = {
    id?: string | null;
    name?: string | null;
    short_name?: string | null;
    slug?: string | null;
    sport?: string | null;
    country?: string | null;
    logo_url?: string | null;
};

function clean(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

/**
 * After a club's logo changes, the new image must also surface wherever the team is rendered
 * from external feeds (FlashScore/ESPN matches, standings, team pages). Those go through
 * /api/assets/team-logo keyed by an external id (fs-team-*, espn-team-*), which resolves via
 * `external_teams` + the override store — never `clubs.logo_url`. There is no club↔external-id
 * column, so the only reliable bridge is name (+ sport).
 *
 * This writes a fresh override keyed by the club id and refreshes any matching `external_teams`
 * rows so the proxy's name-based resolution returns the updated logo. Best-effort: failures are
 * swallowed so a logo save never breaks because of the external cache.
 */
export async function syncClubLogoToExternalSources(
    club: ClubLogoSource,
    options: { supabaseClient?: any } = {},
): Promise<void> {
    const id = clean(club.id) || clean(club.slug);
    const name = clean(club.name);
    const logoUrl = clean(club.logo_url);

    // Without an id and a name there is nothing the external resolver can match against.
    if (!id || !name) return;

    const sport = clean(club.sport);
    const shortName = clean(club.short_name);
    const country = clean(club.country);

    // 1) Override store (file-backed): matched by name/short_name candidates, wins on freshest updated_at.
    try {
        await upsertExternalTeamLogoOverride({
            id,
            source: 'club',
            name,
            short_name: shortName,
            logo_url: logoUrl,
            sport,
            country,
        });
    } catch (error) {
        console.warn('[clubLogoExternalSync] override store sync skipped', {
            id,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    // 2) Refresh matching external_teams rows (by exact name, scoped by sport when known).
    const supabase = options.supabaseClient;
    if (!supabase) return;

    try {
        const updatePayload = {
            logo_url: logoUrl,
            updated_at: new Date().toISOString(),
        };

        for (const column of ['name', 'short_name'] as const) {
            const value = column === 'name' ? name : shortName;
            if (!value) continue;

            let query = (supabase as any)
                .from('external_teams')
                .update(updatePayload)
                .eq(column, value);
            if (sport) query = query.eq('sport', sport);

            const { error } = await query;
            if (error && !isMissingTableError(error, 'external_teams')) {
                console.warn('[clubLogoExternalSync] external_teams update skipped', {
                    id,
                    column,
                    error: error.message,
                });
            }
        }
    } catch (error) {
        console.warn('[clubLogoExternalSync] external_teams sync skipped', {
            id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
