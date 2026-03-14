import { normalizeSlug } from '@/lib/utils/normalize';
import { createClient } from '@/lib/supabase/server';
import { 
    getSports, 
    getCountriesBySport, 
    getTournamentsBySportAndEntity, 
    getSeasonsByTournament, 
    getFixturesByTournamentOrSeason 
} from '@/lib/services/flashscore';

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
    status: 'api_only' | 'available_for_import' | 'linked' | 'stale';
    internal_id?: string;
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
        // Map to internal format if needed
        return data || [];
    }

    /**
     * Get entities (countries + continentals 1-8)
     */
    static async getEntities(sportId: string | number) {
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
        const externalData = await getTournamentsBySportAndEntity(sportId, entityId);
        const externalTournaments = externalData?.data || [];

        const supabase = await createClient();
        
        // Fetch internal tournaments for this sport to match
        const { data: internalTournaments } = await supabase
            .from('tournaments')
            // @ts-ignore
            .select('id, name, slug, external_id, data_source')
            .eq('sport_id', sportId);

        const internalMap = new Map<string, any>();
        const slugMap = new Map<string, any>();
        const nameMap = new Map<string, any>();
        const externalIdMap = new Map<string, any>();

        (internalTournaments || []).forEach(it => {
            if (it.external_id) externalIdMap.set(it.external_id, it);
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
                status: matched ? 'linked' : 'available_for_import',
                internal_id: matched?.id
            };
        });
    }

    /**
     * Get seasons for a tournament
     */
    static async getSeasons(tournamentId: string) {
        const data = await getSeasonsByTournament(tournamentId);
        return data?.data || [];
    }

    /**
     * Preview fixtures for a tournament/season
     */
    static async previewFixtures(tournamentId: string, seasonId?: string) {
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
        
        const { data, error } = await supabase
            .from('tournaments')
            .insert({
                name: internalParams.name || externalTournament.name,
                display_name: internalParams.display_name || externalTournament.name,
                original_name: externalTournament.name,
                slug: normalizeSlug(internalParams.name || externalTournament.name),
                sport_id: externalTournament.sport_id,
                country_id: externalTournament.country_id,
                logo_url: externalTournament.logo_url,
                external_id: externalTournament.id,
                data_source: 'flashscore',
                is_api_managed: true,
                is_active: true,
                is_visible: true
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Link external tournament to existing internal one
     */
    static async linkTournament(externalId: string, internalId: string) {
        const supabase = await createClient();
        
        const { error } = await supabase
            .from('tournaments')
            .update({
                external_id: externalId,
                data_source: 'flashscore',
                is_api_managed: true
            })
            .eq('id', internalId);

        if (error) throw error;
        return true;
    }
}
