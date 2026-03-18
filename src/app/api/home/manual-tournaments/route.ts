import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('tournaments')
            .select(`
                id,
                name,
                display_name,
                sport,
                country,
                custom_logo_url,
                logo_url,
                category,
                season_id,
                is_visible,
                age_grade,
                format
            `)
            .eq('status', 'published')
            .eq('is_visible', true)
            .order('display_name', { ascending: true });

        if (error) {
            console.error('[GET /api/home/manual-tournaments] query failed:', error);
            return NextResponse.json(
                { error: 'No se pudieron cargar los torneos manuales.' },
                { status: 500 }
            );
        }

        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('[GET /api/home/manual-tournaments] unexpected error:', error);
        return NextResponse.json(
            { error: 'No se pudieron cargar los torneos manuales.' },
            { status: 500 }
        );
    }
}
