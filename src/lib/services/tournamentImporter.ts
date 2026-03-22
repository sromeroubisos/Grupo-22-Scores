import { createClient } from '@/lib/supabase';
import { RUGBY_TOURNAMENTS_INTERNATIONAL, RUGBY_TOURNAMENTS_BY_COUNTRY } from '@/lib/data/tournaments/rugby';
import { BASKETBALL_TOURNAMENTS_INTERNATIONAL, BASKETBALL_TOURNAMENTS_BY_COUNTRY } from '@/lib/data/tournaments/basketball';
import { HOCKEY_TOURNAMENTS_INTERNATIONAL, HOCKEY_TOURNAMENTS_BY_COUNTRY } from '@/lib/data/tournaments/hockey';
import type { Tournament } from '@/lib/types';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type SportId = 'rugby' | 'field-hockey' | 'basketball';

export const syncStaticTournaments = async () => {
    const results = {
        total: 0,
        inserted: 0,
        updated: 0,
        errors: [] as string[]
    };

    const allData: { sportId: SportId; international: Tournament[]; byCountry: Record<string, Tournament[]> }[] = [
        {
            sportId: 'rugby',
            international: RUGBY_TOURNAMENTS_INTERNATIONAL,
            byCountry: RUGBY_TOURNAMENTS_BY_COUNTRY
        },
        {
            sportId: 'basketball',
            international: BASKETBALL_TOURNAMENTS_INTERNATIONAL,
            byCountry: BASKETBALL_TOURNAMENTS_BY_COUNTRY
        },
        {
            sportId: 'field-hockey',
            international: HOCKEY_TOURNAMENTS_INTERNATIONAL,
            byCountry: HOCKEY_TOURNAMENTS_BY_COUNTRY
        }
    ];

    for (const sport of allData) {
        // Import International
        for (const t of sport.international) {
            await upsertTournament(t, sport.sportId, results);
        }

        // Import Local
        for (const countryId in sport.byCountry) {
            for (const t of sport.byCountry[countryId]) {
                await upsertTournament(t, sport.sportId, results);
            }
        }
    }

    return results;
};

const upsertTournament = async (t: Tournament, sportId: SportId, results: any) => {
    results.total++;
    
    try {
        const payload = {
            id: t.id,
            name: t.name,
            sport_id: sportId,
            country_id: t.countryId || 'international',
            is_api_managed: true,
            data_source: 'static_ts_files',
            display_name: t.name, // Default to name
            status: 'active',
            priority: t.priority ?? 0,
            // Map other relevant fields if they exist in schema
            // url: t.url,
        };

        let { error } = await supabase
            .from('tournaments')
            .upsert(payload, {
                onConflict: 'id'
            });

        if (error && isMissingColumnError(error, 'priority')) {
            const { priority: _ignoredPriority, ...payloadWithoutPriority } = payload;
            ({ error } = await supabase
                .from('tournaments')
                .upsert(payloadWithoutPriority, {
                    onConflict: 'id'
                }));
        }

        if (error) {
            results.errors.push(`Error upserting ${t.id}: ${error.message}`);
        } else {
            results.updated++; // In Supabase upsert, we don't easily know if it was insert or update without a prior select
        }
    } catch (e: any) {
        results.errors.push(`Exception upserting ${t.id}: ${e.message}`);
    }
};
