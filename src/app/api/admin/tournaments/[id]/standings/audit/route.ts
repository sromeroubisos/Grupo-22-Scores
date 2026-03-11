import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const searchParams = request.nextUrl.searchParams;
        const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

        const supabase = await createClient();

        const { data: entries, error } = await supabase
            .from('admin_audit_log')
            .select('id, created_at, action, changes, actor_user_id')
            .eq('entity_type', 'standings')
            .eq('entity_id', tournamentId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        return NextResponse.json({ ok: true, entries: entries || [] });
    } catch (e: any) {
        console.error('Exception fetching standings audit log:', e);
        return NextResponse.json(
            { error: 'Internal server error', details: e.message },
            { status: 500 }
        );
    }
}
