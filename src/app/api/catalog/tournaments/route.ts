import { NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { RUGBY_TOURNAMENTS_INTERNATIONAL } from '@/lib/data/tournaments/rugby';
import { MOTORSPORT_TOURNAMENTS_INTERNATIONAL, MOTORSPORT_TOURNAMENTS_BY_COUNTRY } from '@/lib/data/tournaments/motorsport';

type TournamentCatalogRow = {
    id: string;
    name: string;
    display_name?: string | null;
    is_visible?: boolean | null;
    status?: string | null;
    sport_id?: string | null;
    sport?: string | null;
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const supabase = await getReadClient();
    const runQuery = async (columns: string): Promise<{
        data: TournamentCatalogRow[] | null;
        error: { message?: string | null; details?: string | null } | null;
    }> => {
        let query = supabase
            .from('tournaments')
            .select(columns)
            .neq('is_visible', false);

        if (search) {
            query = query.or(`name.ilike.%${search}%,display_name.ilike.%${search}%`);
        }

        const result = await query.limit(limit);
        return {
            data: (result.data as TournamentCatalogRow[] | null) || null,
            error: result.error ? { message: result.error.message, details: result.error.details } : null,
        };
    };

    let { data, error } = await runQuery('id, name, display_name, is_visible, status, sport_id, sport');
    if (error && `${error.message || ''} ${error.details || ''}`.toLowerCase().includes('sport')) {
        ({ data, error } = await runQuery('id, name, display_name, is_visible, status, sport_id'));
    }
    if (error && `${error.message || ''} ${error.details || ''}`.toLowerCase().includes('sport_id')) {
        ({ data, error } = await runQuery('id, name, display_name, is_visible, status'));
    }

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const staticCatalogSource = [
        ...RUGBY_TOURNAMENTS_INTERNATIONAL,
        ...MOTORSPORT_TOURNAMENTS_INTERNATIONAL,
        ...Object.values(MOTORSPORT_TOURNAMENTS_BY_COUNTRY).flat(),
    ];

    // Include static tournaments if they match the search
    const staticTournaments = staticCatalogSource
        .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()))
        .map(t => ({
            id: String(t.id || `catalog-${t.name.toLowerCase().replace(/\s+/g, '-')}`),
            label: t.name,
            meta: String(t.id || '').startsWith('espn-racing-league-') ? 'espn' : 'fs',
            url: t.url,
            sportId: t.sportId || 'rugby',
        }));

    const dbResults = (data || []).filter((t) => {
        const status = t.status?.toLowerCase?.() || null;
        return status !== 'archived' && status !== 'deleted';
    });

    const results = [
        ...dbResults.map(t => ({
            id: t.id,
            label: t.display_name || t.name,
            meta: t.id.split('-')[0],
            sportId: t.sport_id || t.sport || null,
        })),
        ...staticTournaments
    ].slice(0, limit);

    return NextResponse.json({ data: results });
}
