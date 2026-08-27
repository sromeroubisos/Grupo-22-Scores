import { NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { escapePostgrestLike } from '@/lib/utils/postgrest';
import { searchExternalTournamentCatalog } from '@/lib/server/externalTournamentCatalog';
import { getPreferredExternalProviderForSport } from '@/lib/externalProviderPolicy';

type SearchResult = {
    id: string;
    type: 'tournament' | 'club';
    title: string;
    subtitle: string;
    url: string;
    logo_url: string | null;
    searchWeight: number;
};

type TournamentSearchRow = {
    id: string;
    name: string | null;
    display_name: string | null;
    slug: string | null;
    sport_id: string | null;
    country_id: string | null;
    logo_url: string | null;
    is_visible: boolean | null;
    status: string | null;
    review_status?: string | null;
    sport?: { name?: string | null } | null;
    country?: { name?: string | null } | null;
};

type ClubSearchRow = {
    id: string;
    name: string | null;
    short_name: string | null;
    slug: string | null;
    city: string | null;
    country: string | null;
    logo_url: string | null;
    is_visible: boolean | null;
};

type ExternalTeamSearchRow = {
    id: string;
    name: string | null;
    short_name: string | null;
    sport: string | null;
    country: string | null;
    team_url: string | null;
    logo_url: string | null;
    source: string | null;
    rugbyarchive_id: string | null;
    last_fetched_at: string | null;
};

function sanitizeSearchLogoUrl(value: unknown, proxyKey: string): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('data:')) {
        return `/api/assets/team-logo?key=${encodeURIComponent(proxyKey)}`;
    }
    return trimmed;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const rawSearch = (searchParams.get('q') || '').slice(0, 80).trim();
    const requestedLimit = parseInt(searchParams.get('limit') || '12', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 12;

    if (!rawSearch || rawSearch.length < 2) {
        return NextResponse.json({ data: [] });
    }

    const search = rawSearch;
    const escapedSearch = escapePostgrestLike(search);
    const supabase = await getReadClient();
    const lSearch = search.toLowerCase();

    let debugInfo: Record<string, unknown> = {
        query: search,
    };

    try {
        // Four sources: local tournaments and clubs, plus their external counterparts.
        // The provider offers no search endpoint (/search 404s), so external results come
        // from our own indexes: the tournament catalog fed by the matches feed, and the
        // external_teams cache filled by team lookups.
        const [tournamentsRes, clubsRes, externalTournaments, externalTeamsRes] = await Promise.all([
            supabase.from('tournaments')
                .select('id, name, display_name, slug, sport_id, country_id, logo_url, is_visible, status, review_status, sport:sports(name), country:countries(name)')
                .or(`name.ilike.%${escapedSearch}%,display_name.ilike.%${escapedSearch}%,slug.ilike.%${escapedSearch}%`)
                .neq('is_visible', false)
                .limit(limit),
            supabase.from('clubs')
                .select('id, name, short_name, slug, city, country, logo_url, is_visible')
                .or(`name.ilike.%${escapedSearch}%,short_name.ilike.%${escapedSearch}%,slug.ilike.%${escapedSearch}%`)
                .neq('is_visible', false)
                .limit(limit),
            searchExternalTournamentCatalog(search, limit).catch(() => []),
            // Se piden mas filas de las que entran en la lista: el mismo club real ocupa
            // varias filas (una por proveedor y por id de proveedor) y recien despues de
            // plegarlas se sabe cuantos clubes distintos hay. Con .limit(limit) una
            // busqueda de "argentina" gastaba cuatro lugares de doce en un solo club.
            supabase.from('external_teams')
                .select('id, name, short_name, sport, country, team_url, logo_url, source, rugbyarchive_id, last_fetched_at')
                .or(`name.ilike.%${escapedSearch}%,short_name.ilike.%${escapedSearch}%`)
                .limit(Math.min(limit * 4, 100)),
        ]);

        debugInfo = {
            ...debugInfo,
            tError: tournamentsRes.error,
            cError: clubsRes.error,
            tCount: tournamentsRes.data?.length || 0,
            cCount: clubsRes.data?.length || 0
        };

        if (tournamentsRes.error) {
            console.error('[Universal Search] Tournament Query Error:', tournamentsRes.error);
        }
        if (clubsRes.error) {
            console.error('[Universal Search] Club Query Error:', clubsRes.error);
        }

        const rawResults: SearchResult[] = [];

        if (tournamentsRes.data) {
            rawResults.push(...(tournamentsRes.data as TournamentSearchRow[])
                .filter((t) => t.is_visible !== false && t.review_status !== 'rejected')
                .map((t) => {
                const title = t.display_name || t.name || 'Torneo';
                const sportLabel = t.sport?.name || t.sport_id || 'Torneo';
                const countryLabel = t.country?.name || t.country_id || 'Internacional';

                return {
                    id: t.id,
                    type: 'tournament' as const,
                    title,
                    subtitle: `${sportLabel} · ${countryLabel}`,
                    url: `/tournaments/${t.slug || t.id}`,
                    logo_url: sanitizeSearchLogoUrl(t.logo_url, t.id),
                    searchWeight: calculateWeight(title, t.name, t.slug, lSearch, 0)
                };
            }));
        }

        if (clubsRes.data) {
            rawResults.push(...(clubsRes.data as ClubSearchRow[])
                .filter((c) => c.is_visible !== false)
                .map((c) => ({
                id: c.id,
                type: 'club' as const,
                title: c.name || c.short_name || 'Club',
                subtitle: `Club · ${c.city || c.country || ''}`,
                url: `/clubs/${c.slug || c.id}`,
                logo_url: sanitizeSearchLogoUrl(c.logo_url, c.id),
                searchWeight: calculateWeight(c.name || c.short_name || '', c.short_name, c.slug, lSearch, 1)
            })));
        }

        // External results are additive: a competition or club we already hold locally is
        // the better record (curated name, logo, slug), so the local one wins on a name clash.
        const dbTournamentNames = new Set(rawResults.filter(r => r.type === 'tournament').map(r => r.title.toLowerCase()));
        const dbClubNames = new Set(rawResults.filter(r => r.type === 'club').map(r => r.title.toLowerCase()));

        for (const hit of externalTournaments) {
            if (dbTournamentNames.has(hit.name.toLowerCase())) continue;

            // The detail page resolves an external tournament from its provider URL, so
            // carry it through — without it the page has to guess which stage to open.
            const params = new URLSearchParams();
            if (hit.sport) params.set('sport', hit.sport);
            params.set('url', hit.url);

            rawResults.push({
                id: hit.routeId,
                type: 'tournament' as const,
                title: hit.name,
                subtitle: `${hit.sport || 'Torneo'} · ${hit.country || 'Internacional'}`,
                url: `/tournaments/${hit.routeId}?${params.toString()}`,
                logo_url: hit.logoUrl,
                searchWeight: calculateWeight(hit.name, null, null, lSearch, 2),
            });
        }

        if (externalTeamsRes.data) {
            for (const team of dedupeExternalTeams(externalTeamsRes.data as ExternalTeamSearchRow[])) {
                const name = team.name || team.short_name || '';
                if (!name || !team.id) continue;
                if (dbClubNames.has(name.toLowerCase())) continue;

                const params = new URLSearchParams({ name });
                if (team.team_url) params.set('team_url', team.team_url);
                // El deporte viaja en el enlace: sin el, la ficha del club no sabe contra
                // que proveedor resolver y cae en el camino por defecto.
                if (team.sport) params.set('sport', team.sport);

                rawResults.push({
                    // El id ya trae su prefijo de fuente cuando no es de FlashScore
                    // ('ra-team-595'); anteponerle otro arma un 'fs-team-ra-team-595'
                    // que no es de ningun proveedor.
                    id: team.id.includes('-') ? team.id : `fs-team-${team.id}`,
                    type: 'club' as const,
                    title: name,
                    subtitle: `Club · ${team.country || team.sport || 'Internacional'}`,
                    url: `/clubs/${team.id}?${params.toString()}`,
                    logo_url: sanitizeSearchLogoUrl(team.logo_url, team.id),
                    searchWeight: calculateWeight(name, team.short_name, null, lSearch, 3),
                });
            }
        }

        const finalResults = rawResults
            .sort((a, b) => {
                if (a.searchWeight !== b.searchWeight) return a.searchWeight - b.searchWeight;
                if (a.type !== b.type) return a.type === 'tournament' ? -1 : 1;
                return a.title.localeCompare(b.title);
            })
            .slice(0, limit);

        const response = NextResponse.json({
            data: finalResults
        });
        response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return response;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Universal Search Error]:', error, debugInfo);
        return NextResponse.json({
            error: message
        }, { status: 500 });
    }
}

/**
 * UN CLUB REAL, UNA FILA.
 *
 * `external_teams` guarda una fila por (proveedor, id del proveedor), asi que el
 * mismo club aparece repetido: "Argentina" tenia cuatro —tres de FlashScore y una de
 * rugbyarchive—, iguales en la lista salvo por el escudo, y de las cuatro una sola
 * abria con datos (498 partidos contra 43, 0 y 0).
 *
 * Se agrupa por nombre EXACTO mas deporte. Exacto a proposito: "Argentina 7s",
 * "Argentina A" y "Argentina W" son equipos distintos y no se pliegan con la mayor.
 */
function dedupeExternalTeams(rows: ExternalTeamSearchRow[]): ExternalTeamSearchRow[] {
    const grupos = new Map<string, ExternalTeamSearchRow>();

    for (const row of rows) {
        const nombre = (row.name || row.short_name || '').trim();
        if (!nombre || !row.id) continue;

        const clave = `${nombre.toLowerCase()}|${(row.sport || '').toLowerCase()}`;
        const actual = grupos.get(clave);
        if (!actual || comparaExternalTeams(row, actual) < 0) grupos.set(clave, row);
    }

    return Array.from(grupos.values());
}

/**
 * Las senales con que se elige cual de las filas repetidas es el club, en orden.
 * Ninguna es estetica: cada una separa la ficha que abre con datos de la cascara que
 * el proveedor nunca llego a completar.
 */
function rangoExternalTeam(team: ExternalTeamSearchRow): number[] {
    const preferido = getPreferredExternalProviderForSport(team.sport);
    return [
        // 1. El proveedor habilitado para ESE deporte. En rugby es FlashScore;
        //    rugbyarchive es el archivo historico, no la fuente viva.
        (team.source || '').toLowerCase() === preferido ? 0 : 1,
        // 2. Sin team_url no hay contra que resolver y la ficha abre en blanco.
        team.team_url ? 0 : 1,
        // 3. El escudo se escribe recien cuando una lectura del equipo trajo datos: su
        //    ausencia delata la fila creada al ver un nombre suelto en un partido.
        team.logo_url ? 0 : 1,
        // 4. El vinculo con el archivo historico, que es de donde sale el palmares.
        team.rugbyarchive_id ? 0 : 1,
        // 5. Y recien empatado todo lo anterior, la mas fresca. Va ultima porque la
        //    cascara suele ser la mas nueva: nace cada vez que aparece un partido.
        -(Date.parse(team.last_fetched_at || '') || 0),
    ];
}

function comparaExternalTeams(a: ExternalTeamSearchRow, b: ExternalTeamSearchRow): number {
    const ra = rangoExternalTeam(a);
    const rb = rangoExternalTeam(b);
    for (let i = 0; i < ra.length; i += 1) {
        if (ra[i] !== rb[i]) return ra[i] - rb[i];
    }
    // Desempate estable: sin esto el ganador depende del orden en que vino la consulta.
    return a.id.localeCompare(b.id);
}

function calculateWeight(title: string, secondary: string | null, slug: string | null, search: string, entityPriority: number): number {
    const t = title.toLowerCase();
    const s = secondary?.toLowerCase() || '';
    const sl = slug?.toLowerCase() || '';

    if (t === search || s === search) return 0 + entityPriority * 0.1;
    if (t.startsWith(search) || s.startsWith(search) || sl.startsWith(search)) return 1 + entityPriority * 0.1;
    if (t.includes(search) || s.includes(search)) return 2 + entityPriority * 0.1;

    return 3 + entityPriority * 0.1;
}
