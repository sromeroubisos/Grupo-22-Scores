import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { escapePostgrestLike } from '@/lib/utils/postgrest';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_SEARCH_LENGTH = 80;

function parseLimit(value: string | null) {
    const parsed = Number.parseInt(value || String(DEFAULT_LIMIT), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
    return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim().slice(0, MAX_SEARCH_LENGTH);
    const limit = parseLimit(searchParams.get('limit'));

    const supabase = await createClient();
    let query = supabase.from('clubs').select('id, name').order('name', { ascending: true });

    if (search.length >= 2) {
        query = query.ilike('name', `%${escapePostgrestLike(search)}%`);
    } else if (search.length > 0) {
        return NextResponse.json({ data: [] });
    }

    query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = data.map(c => ({
        id: c.id,
        label: c.name,
        meta: c.id.split('-')[0] // short UUID or external ID helper
    }));

    return NextResponse.json({ data: results });
}
