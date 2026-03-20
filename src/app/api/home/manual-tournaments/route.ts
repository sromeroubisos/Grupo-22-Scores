import { NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';

export async function GET() {
    try {
        const supabase = await getReadClient();
        const { data, error } = await supabase
            .from('tournaments')
            .select(`
                id,
                name,
                display_name,
                sport_id,
                legacy_sport:sport,
                country_id,
                logo_url,
                category,
                season_id,
                status,
                is_visible,
                age_grade,
                format
            `)
            .neq('is_visible', false)
            .order('display_name', { ascending: true });

        if (error) {
            console.error('[GET /api/home/manual-tournaments] query failed:', error);
            return NextResponse.json(
                { error: 'No se pudieron cargar los torneos manuales.' },
                { status: 500 }
            );
        }

        const visibleTournaments = (data || []).filter((tournament) => {
            const status = tournament.status?.toLowerCase?.() || null;
            return status !== 'archived' && status !== 'deleted';
        }).map((tournament) => ({
            ...tournament,
            sport_id: tournament.sport_id || tournament.legacy_sport || 'rugby',
        }));

        return NextResponse.json({ data: visibleTournaments });
    } catch (error) {
        console.error('[GET /api/home/manual-tournaments] unexpected error:', error);
        return NextResponse.json(
            { error: 'No se pudieron cargar los torneos manuales.' },
            { status: 500 }
        );
    }
}
