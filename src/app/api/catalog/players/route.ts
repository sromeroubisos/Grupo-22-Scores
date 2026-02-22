import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const supabase = await createClient();
    let query = supabase.from('players').select('id, name, position');

    if (search) {
        query = query.ilike('name', `%${search}%`);
    }

    query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = data.map(p => ({
        id: p.id,
        label: p.name || 'Unknown',
        meta: p.position ? `Pos: ${p.position}` : p.id.split('-')[0]
    }));

    return NextResponse.json({ data: results });
}
