import { NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { RUGBY_TOURNAMENTS_INTERNATIONAL } from '@/lib/data/tournaments/rugby';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const supabase = await getReadClient();
    let query = supabase
        .from('tournaments')
        .select('id, name, display_name, is_visible, status')
        .neq('is_visible', false);

    if (search) {
        query = query.or(`name.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Include static international tournaments if they match the search
    const staticTournaments = RUGBY_TOURNAMENTS_INTERNATIONAL
        .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()))
        .map(t => ({
            id: `fs-${t.id || (t.url ? t.url.split('/').filter(Boolean).pop() : 'unknown')}`, // Use slug as ID if no ID
            label: t.name,
            meta: 'fs',
            url: t.url
        }));

    const dbResults = (data || []).filter((t) => {
        const status = t.status?.toLowerCase?.() || null;
        return status !== 'archived' && status !== 'deleted';
    });

    const results = [
        ...dbResults.map(t => ({
            id: t.id,
            label: t.display_name || t.name,
            meta: t.id.split('-')[0]
        })),
        ...staticTournaments
    ].slice(0, limit);

    return NextResponse.json({ data: results });
}
