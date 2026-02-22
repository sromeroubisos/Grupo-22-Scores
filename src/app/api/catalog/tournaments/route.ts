import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const supabase = await createClient();
    let query = supabase.from('tournaments').select('id, name');

    if (search) {
        query = query.ilike('name', `%${search}%`);
    }

    query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = data.map(t => ({
        id: t.id,
        label: t.name,
        meta: t.id.split('-')[0]
    }));

    return NextResponse.json({ data: results });
}
