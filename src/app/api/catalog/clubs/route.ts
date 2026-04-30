import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const supabase = await createClient();
    let query = supabase.from('clubs').select('id, name');

    if (search) {
        query = query.ilike('name', `%${search}%`);
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
