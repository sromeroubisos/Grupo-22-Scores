import { normalizeSlug } from '@/lib/utils/normalize';
import { createClient } from '@/lib/supabase/server';
import { 
    getSports, 
    getCountriesBySport, 
    getTournamentsBySportAndEntity, 
    getSeasonsByTournament, 
    getFixturesByTournamentOrSeason 
} from '@/lib/services/flashscore';
import {
    getRugbyApiSportsCountries,
    getRugbyApiSportsGames,
    getRugbyApiSportsLeagues,
} from '@/lib/services/rugbyApiSports';
import {
    getTournamentRugbyApiSportsConfig,
    isRugbySport,
    withRugbyApiSportsRuleset,
} from '@/lib/externalProviderPolicy';
import { resolveTournamentCountryId, resolveTournamentCountryLabel } from '@/lib/data/countries';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

export interface ExternalEntity {
    id: string;
    name: string;
    type: 'country' | 'continental';
    flag_emoji?: string;
}

export interface ExternalTournament {
    id: string;
    name: string;
    original_name?: string;
    country_id: string;
    sport_id: string;
    logo_url?: string;
    url?: string;
    status: 'api_only' | 'available_for_import' | 'linked' | 'stale';
    internal_id?: string;
}

function parseRugbyLeagueId(value: string | number | null | undefined) {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    const prefixedMatch = /^ras-league-(\d+)$/i.exec(raw);
    if (prefixedMatch) return prefixedMatch[1];
    return null;
}

export class TournamentIngestionService {
    static normalizeName(name: string): string {
        return normalizeSlug(name);
    }

    /**
     * Get sports list (normalized)
     */
    static async getAvailableSports() {
        const data = await getSports();
        const sports = Array.isArray((data as any)?.data)
            ? (data as any).data
            : Array.isArray(data)
                ? data
                : [];
        const normalized = sports.map((sport: any) => ({
            id: String(sport.id ?? sport.sport_id ?? sport.slug ?? sport.name ?? ''),
            name: String(sport.name ?? sport.sport_name ?? sport.label ?? sport.id ?? ''),
        })).filter((sport: any) => sport.id && sport.name);

        if (!normalized.some((sport: any) => isRugbySport(sport.id) || String(sport.name).toLowerCase() === 'rugby')) {
            normalized.unshift({ id: 'rugby', name: 'Rugby' });
        }

        return normalized;
    }

    /**
     * Get entities (countries + continentals 1-8)
     */
    static async getEntities(sportId: string | number) {
        if (isRugbySport(sportId)) {
            const countries = await getRugbyApiSportsCountries();
            const mappedCountries: ExternalEntity[] = countries.map((country: any) => ({
                id: String(country.id),
                name: country.name,
                type: 'country',
            }));

            return [
                { id: 'all', name: 'Todos los paises', type: 'continental' },
                ...mappedCountries,
            ];
        }

        const countries = await getCountriesBySport(sportId);
        
        // Manual continental entities (IDs 1-8 frequently used by FL for International, Europe, etc.)
        const continentals: ExternalEntity[] = [
            { id: '1', name: 'Mundial / Internacional', type: 'continental' },
            { id: '2', name: 'Europa', type: 'continental' },
            { id: '3', name: 'Sudamérica', type: 'continental' },
            { id: '4', name: 'Norte y Centroamérica', type: 'continental' },
            { id: '5', name: 'Asia', type: 'continental' },
            { id: '6', name: 'África', type: 'continental' },
            { id: '7', name: 'Oceanía', type: 'continental' },
            { id: '8', name: 'Antártida / Especial', type: 'continental' }
        ];

        const mappedCountries: ExternalEntity[] = (countries?.data || []).map((c: any) => ({
            id: c.country_id?.toString(),
            name: c.name,
            type: 'country',
            flag_emoji: c.flag
        }));

        // Merge and ensure special IDs are present if not in countries list
        const countryIds = new Set(mappedCountries.map(c => c.id));
        const filteredContinentals = continentals.filter(c => !countryIds.has(c.id));

        return [...filteredContinentals, ...mappedCountries];
    }

    /**
     * Get tournaments and match them with internal ones
     */
    static async getTournaments(sportId: string | number, entityId: string | number) {
        if (isRugbySport(sportId)) {
            const query = String(entityId) === 'all'
                ? {}
                : /^\d+$/.test(String(entityId))
                    ? { country_id: entityId }
                    : { country: String(entityId) };
            const externalTournaments = await getRugbyApiSportsLeagues(query as any);

            const supabase = await createClient();
            const { data: internalTournaments } = await supabase
                .from('tournaments')
                .select('id, name, slug, external_id, ruleset, sport_id');

            const slugMap = new Map<string, any>();
            const nameMap = new Map<string, any>();
            const externalIdMap = new Map<string, any>();

            (internalTournaments || []).filter((it: any) => isRugbySport(it?.sport_id)).forEach((it: any) => {
                if (it.slug) slugMap.set(it.slug, it);
                if (it.external_id) externalIdMap.set(String(it.external_id), it);
                const linkedConfig = getTournamentRugbyApiSportsConfig(it);
                if (linkedConfig?.league_id != null) {
                    externalIdMap.set(String(linkedConfig.league_id), it);
                }
                nameMap.set(this.normalizeName(it.name), it);
            });

            return externalTournaments.map((league: any) => {
                const matched =
                    externalIdMap.get(String(league.id)) ||
                    slugMap.get(normalizeSlug(league.name)) ||
                    nameMap.get(this.normalizeName(league.name));
                const seasons = Array.isArray(league.seasons)
                    ? [...league.seasons].sort((left: any, right: any) => Number(right?.season || 0) - Number(left?.season || 0))
                    : [];
                const currentSeason = seasons.find((season: any) => season.current === true)?.season ?? seasons[0]?.season ?? null;

                return {
                    id: `ras-league-${league.id}`,
                    name: league.name,
                    original_name: league.name,
                    country_id: String(league.country?.id || entityId || ''),
                    country_name: league.country?.name || '',
                    sport_id: 'rugby',
                    logo_url: league.logo || '',
                    url: null,
                    current_season: currentSeason,
                    seasons: seasons.map((season: any) => ({
                        tournament_stage_id: String(season.season),
                        tournament_stage_name: String(season.season),
                        current: season.current === true,
                    })),
                    status: matched ? 'linked' : 'available_for_import',
                    internal_id: matched?.id,
                };
            });
        }

        const externalData = await getTournamentsBySportAndEntity(sportId, entityId);
        const externalTournaments = externalData?.data || [];

        const supabase = await createClient();
        
        // Fetch internal tournaments for this sport to match
        const { data: internalTournaments } = await supabase
            .from('tournaments')
            .select('id, name, slug')
            .eq('sport_id', sportId);

        const internalMap = new Map<string, any>();
        const slugMap = new Map<string, any>();
        const nameMap = new Map<string, any>();
        const externalIdMap = new Map<string, any>();

        (internalTournaments || []).forEach(it => {
            if (it.slug) slugMap.set(it.slug, it);
            const normName = this.normalizeName(it.name);
            nameMap.set(normName, it);
        });

        return externalTournaments.map((et: any) => {
            let matched = externalIdMap.get(et.tournament_id?.toString());
            
            if (!matched) {
                const etSlug = normalizeSlug(et.name);
                matched = slugMap.get(etSlug);
            }

            if (!matched) {
                const normName = this.normalizeName(et.name);
                matched = nameMap.get(normName);
            }

            return {
                id: et.tournament_id?.toString(),
                name: et.name,
                original_name: et.name,
                country_id: entityId.toString(),
                sport_id: sportId.toString(),
                logo_url: et.image,
                url: et.url || et.link || null,
                status: matched ? 'linked' : 'available_for_import',
                internal_id: matched?.id
            };
        });
    }

    /**
     * Get seasons for a tournament
     */
    static async getSeasons(tournamentId: string) {
        const rugbyLeagueId = parseRugbyLeagueId(tournamentId);
        if (rugbyLeagueId) {
            const [league] = await getRugbyApiSportsLeagues({ id: rugbyLeagueId });
            if (league) {
                return (league.seasons || [])
                    .slice()
                    .sort((left, right) => right.season - left.season)
                    .map((season) => ({
                        tournament_stage_id: String(season.season),
                        tournament_stage_name: String(season.season),
                        current: season.current === true,
                    }));
            }
        }

        const data = await getSeasonsByTournament(tournamentId);
        return data?.data || [];
    }

    /**
     * Preview fixtures for a tournament/season
     */
    static async previewFixtures(tournamentId: string, seasonId?: string) {
        const rugbyLeagueId = parseRugbyLeagueId(tournamentId);
        if (rugbyLeagueId) {
            let finalSeasonId = seasonId;

            if (!finalSeasonId) {
                const seasons = await this.getSeasons(tournamentId);
                if (seasons.length > 0) {
                    finalSeasonId = String(seasons[0].tournament_stage_id);
                }
            }

            if (!finalSeasonId) return [];

            const games = await getRugbyApiSportsGames({
                league: rugbyLeagueId,
                season: finalSeasonId,
                timezone: 'America/Argentina/Buenos_Aires',
            });

            return games.map((game: any) => ({
                id: String(game.id),
                home_team: game.teams?.home?.name || 'Local',
                away_team: game.teams?.away?.name || 'Visitante',
                date: game.date,
                score: game.scores?.home != null && game.scores?.away != null
                    ? `${game.scores.home}-${game.scores.away}`
                    : undefined,
            }));
        }

        let finalSeasonId = seasonId;

        // If no seasonId provided, get seasons and take the first (usually current)
        if (!finalSeasonId) {
            const seasons = await this.getSeasons(tournamentId);
            if (seasons.length > 0) {
                finalSeasonId = seasons[0].tournament_stage_id;
            }
        }

        if (!finalSeasonId) return [];

        const fixtures = await getFixturesByTournamentOrSeason(tournamentId, finalSeasonId);
        
        // Map to a cleaner format for the UI
        return (fixtures?.data || []).map((f: any) => ({
            id: f.match_id,
            home_team: f.home_participant,
            away_team: f.away_participant,
            date: f.start_time ? new Date(f.start_time * 1000).toISOString() : new Date().toISOString(),
            score: f.results?.score_overall
        }));
    }

    /**
     * Create an internal tournament from external data
     */
    static async createFromExternal(externalTournament: any, internalParams: any) {
        const supabase = await createClient();
        const isRugbyExternalTournament = isRugbySport(externalTournament?.sport_id);
        const rugbyLeagueId =
            parseRugbyLeagueId(externalTournament?.id) ||
            (/^\d+$/.test(String(externalTournament?.id || '')) ? String(externalTournament.id) : null);
        const rugbyRuleset = isRugbyExternalTournament
            ? withRugbyApiSportsRuleset(undefined, {
                league_id: rugbyLeagueId != null ? Number(rugbyLeagueId) : undefined,
                season: externalTournament.current_season != null ? Number(externalTournament.current_season) : undefined,
                country_id: externalTournament.country_id != null ? Number(externalTournament.country_id) : undefined,
                league_name: externalTournament.name || null,
                country_name: externalTournament.country_name || null,
                league_logo: externalTournament.logo_url || null,
                resolved_at: new Date().toISOString(),
            })
            : undefined;
        const resolvedCountryId =
            resolveTournamentCountryId(externalTournament.country_name) ||
            resolveTournamentCountryId(externalTournament.country_id);
        const resolvedCountryLabel =
            resolveTournamentCountryLabel(externalTournament.country_name) ||
            resolveTournamentCountryLabel(externalTournament.country_id) ||
            (typeof externalTournament.country_name === 'string' ? externalTournament.country_name : null);

        if (resolvedCountryId) {
            const { error: countryError } = await supabase
                .from('countries')
                .upsert(
                    {
                        id: resolvedCountryId,
                        name: resolvedCountryLabel || resolvedCountryId,
                    },
                    { onConflict: 'id' },
                );

            if (countryError && !countryError.message?.includes('Could not find the table')) {
                throw countryError;
            }
        }

        const payload = {
            name: internalParams.name || externalTournament.name,
            display_name: internalParams.display_name || externalTournament.name,
            slug: normalizeSlug(internalParams.name || externalTournament.name),
            sport_id: externalTournament.sport_id,
            country: resolvedCountryLabel || null,
            country_id: resolvedCountryId,
            logo_url: externalTournament.logo_url,
            url: externalTournament.url || null,
            external_id: rugbyLeagueId || externalTournament.id || null,
            ruleset: rugbyRuleset,
            is_visible: true,
            priority: internalParams.priority ?? 0
        };

        let { data, error } = await supabase
            .from('tournaments')
            .insert(payload)
            .select()
            .single();

        if (error && isMissingColumnError(error, 'priority')) {
            const { priority: _ignoredPriority, ...payloadWithoutPriority } = payload;
            ({ data, error } = await supabase
                .from('tournaments')
                .insert(payloadWithoutPriority)
                .select()
                .single());
        }

        if (error) throw error;
        return data;
    }

    /**
     * Link external tournament to existing internal one
     */
    static async linkTournament(externalId: string, internalId: string, externalUrl?: string) {
        const supabase = await createClient();
        const rugbyLeagueId =
            parseRugbyLeagueId(externalId) ||
            (/^\d+$/.test(String(externalId || '')) ? String(externalId) : null);

        const { data: existingTournament } = await supabase
            .from('tournaments')
            .select('sport_id, ruleset')
            .eq('id', internalId)
            .maybeSingle();

        const updatePayload: Record<string, unknown> = {
            external_id: rugbyLeagueId || externalId,
            updated_at: new Date().toISOString(),
        };
        if (externalUrl) {
            updatePayload.url = externalUrl;
        }
        if (isRugbySport((existingTournament as any)?.sport_id)) {
            updatePayload.ruleset = withRugbyApiSportsRuleset((existingTournament as any)?.ruleset, {
                league_id: rugbyLeagueId != null ? Number(rugbyLeagueId) : undefined,
                resolved_at: new Date().toISOString(),
            });
        }

        const { error } = await supabase
            .from('tournaments')
            .update(updatePayload)
            .eq('id', internalId);

        if (error) throw error;
        return true;
    }
}
