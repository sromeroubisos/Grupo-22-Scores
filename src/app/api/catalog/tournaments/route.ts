import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RUGBY_TOURNAMENTS_INTERNATIONAL } from '@/lib/data/tournaments/rugby';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const supabase = await createClient();
    let query = supabase.from('tournaments').select('id, name, display_name');

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

    const results = [
        ...data.map(t => ({
            id: t.id,
            label: t.display_name || t.name,
            meta: t.id.split('-')[0]
        })),
        ...staticTournaments
    ].slice(0, limit);

    return NextResponse.json({ data: results });
}
