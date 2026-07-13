import { createAdminClient } from '@/lib/supabase/admin';
import { getReadClient } from '@/lib/supabase/read';
import { escapePostgrestLike } from '@/lib/utils/postgrest';

/**
 * A searchable index of external tournaments, which we have to build ourselves: the
 * provider exposes no search endpoint (/search 404s), so a competition it serves is
 * unfindable unless someone created a local row for it.
 *
 * The index is fed for free from the matches feed the home page already fetches. The
 * feed emits one entry per STAGE ("… - Play Offs", "… - 9th-12th places"), each with
 * its own id, and the tournament URL is the only field every stage shares — so the URL
 * is the key, and one competition yields one row no matter how many stages it runs.
 */

export type ExternalTournamentCatalogEntry = {
    url: string;
    routeId: string;
    name: string;
    country: string | null;
    sport: string | null;
    logoUrl: string | null;
};

const TABLE = 'external_tournament_catalog';

// The table lands with a migration; until it is applied every call must be a no-op
// rather than an error, and we should stop hammering the DB for it.
let tableMissing = false;

function isMissingTableError(error: any): boolean {
    if (!error) return false;
    const code = String(error.code || '');
    const message = String(error.message || '');
    return code === 'PGRST205' || code === '42P01' || message.includes(TABLE);
}

function getWriteClient() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return null;
    }
    try {
        return createAdminClient();
    } catch {
        return null;
    }
}

/** Collapses a batch of matches into one row per competition. */
export function collectCatalogEntries(matches: any[], sport?: string): ExternalTournamentCatalogEntry[] {
    const byUrl = new Map<string, ExternalTournamentCatalogEntry>();

    for (const match of matches || []) {
        const url = String(match?.leagueUrl || '').trim();
        const name = String(match?.leagueName || '').trim();
        const routeId = String(match?.tournamentId || '').trim();
        // No URL means no stable identity across stages — skip rather than invent one.
        if (!url || !name || !routeId) continue;
        if (byUrl.has(url)) continue;

        const country = String(match?.countryName || '').trim();
        const logoUrl = String(match?.leagueLogo || '').trim();

        byUrl.set(url, {
            url,
            routeId,
            name,
            country: country || null,
            sport: sport || null,
            logoUrl: logoUrl || null,
        });
    }

    return [...byUrl.values()];
}

/**
 * Records the competitions seen in a matches payload. Fire-and-forget: the catalog is
 * a search convenience, so a write failure must never take the matches feed down.
 */
export async function recordExternalTournamentsFromMatches(matches: any[], sport?: string): Promise<void> {
    if (tableMissing) return;

    const entries = collectCatalogEntries(matches, sport);
    if (entries.length === 0) return;

    const client = getWriteClient();
    if (!client) return;

    const nowIso = new Date().toISOString();
    const rows = entries.map((entry) => ({
        url: entry.url,
        route_id: entry.routeId,
        provider: 'flashscore',
        name: entry.name,
        country: entry.country,
        sport: entry.sport,
        logo_url: entry.logoUrl,
        last_seen_at: nowIso,
    }));

    const { error } = await (client as any).from(TABLE).upsert(rows, { onConflict: 'url' });

    if (error) {
        if (isMissingTableError(error)) {
            tableMissing = true;
            console.warn(`[catalog] ${TABLE} is missing — run the migration to make external tournaments searchable.`);
            return;
        }
        console.warn('[catalog] External tournament catalog write failed.', {
            code: error.code,
            message: error.message,
        });
    }
}

export type ExternalTournamentSearchHit = {
    routeId: string;
    url: string;
    name: string;
    country: string | null;
    sport: string | null;
    logoUrl: string | null;
};

/** Name search over the catalog. Returns [] when the table is not there yet. */
export async function searchExternalTournamentCatalog(
    query: string,
    limit: number,
): Promise<ExternalTournamentSearchHit[]> {
    if (tableMissing) return [];

    const term = escapePostgrestLike(query);
    const supabase = await getReadClient();

    const { data, error } = await supabase
        .from(TABLE)
        .select('url, route_id, name, country, sport, logo_url')
        .ilike('name', `%${term}%`)
        .order('last_seen_at', { ascending: false })
        .limit(limit);

    if (error) {
        if (isMissingTableError(error)) {
            tableMissing = true;
            return [];
        }
        console.warn('[catalog] External tournament search failed.', { code: error.code, message: error.message });
        return [];
    }

    return (data || []).map((row: any) => ({
        routeId: String(row.route_id),
        url: String(row.url),
        name: String(row.name),
        country: row.country ?? null,
        sport: row.sport ?? null,
        logoUrl: row.logo_url ?? null,
    }));
}
