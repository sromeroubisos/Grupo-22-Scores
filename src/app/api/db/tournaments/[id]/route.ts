import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    const supabase = await getReadClient();

    // Try to find a tournament by ID (UUID) or by slug
    const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, display_name, logo_url, sport_id, legacy_sport:sport, country_id, slug, is_visible, status')
        .or(`id.eq.${id},slug.eq.${id}`)
        .maybeSingle();

    if (error || !data) {
        return NextResponse.json({ ok: false }, { status: 404 });
    }

    return NextResponse.json({
        ok: true,
        tournament: {
            ...data,
            sport_id: data.sport_id || data.legacy_sport || 'rugby',
        }
    });
}
