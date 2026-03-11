import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    const supabase = await createClient();

    const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, display_name, logo_url, sport, sport_id, country, country_id, slug, is_visible, status, data_source')
        .eq('id', id)
        .single();

    if (error || !data) {
        return NextResponse.json({ ok: false }, { status: 404 });
    }

    return NextResponse.json({ ok: true, tournament: data });
}
