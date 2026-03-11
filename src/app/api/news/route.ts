import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/auth/roles';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { session } } = await supabase.auth.getSession();

        let isAdmin = false;

        if (session?.user?.id) {
            const { data: userData } = await supabase
                .from('users')
                .select('role')
                .eq('id', session.user.id)
                .single();

            const userRole = userData?.role || session.user.user_metadata?.role;

            const { data: memberships } = await supabase
                .from('memberships')
                .select('scope_type, scope_id, role')
                .eq('user_id', session.user.id);

            const mappedMemberships = (memberships || []).map((m: any) => ({
                scopeType: m.scope_type,
                scopeId: m.scope_id,
                role: m.role
            }));

            isAdmin = isAdminUser(userRole, mappedMemberships);
        }

        let query = supabase.from('news').select('*').order('published_at', { ascending: false });

        // Non-admins only see published news, limited to 10 for pagination/performance.
        if (!isAdmin) {
            query = query.eq('status', 'published').limit(10);
        }

        const { data, error } = await query;
        if (error) throw error;

        return NextResponse.json({ data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

async function verifyAdmin() {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user?.id) {
        throw new Error('Unauthorized');
    }

    const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

    const userRole = userData?.role || session.user.user_metadata?.role;

    const { data: memberships } = await supabase
        .from('memberships')
        .select('scope_type, scope_id, role')
        .eq('user_id', session.user.id);

    const mappedMemberships = (memberships || []).map((m: any) => ({
        scopeType: m.scope_type,
        scopeId: m.scope_id,
        role: m.role
    }));

    if (!isAdminUser(userRole, mappedMemberships)) {
        throw new Error('Unauthorized');
    }
    return supabase;
}

export async function POST(req: Request) {
    try {
        const supabase = await verifyAdmin();
        const body = await req.json();

        // Use ONLY columns that exist in the confirmed minimalist schema
        const { title, summary, content, image_url, status, sport, scope } = body;

        const { data, error } = await supabase.from('news').insert({
            title,
            summary,
            content,
            image_url,
            status,
            sport,
            scope,
            published_at: status === 'published' ? new Date().toISOString() : null
        }).select().single();

        if (error) throw error;
        return NextResponse.json({ data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: err.message === 'Unauthorized' ? 403 : 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const supabase = await verifyAdmin();
        const body = await req.json();

        // Use ONLY columns that exist in the confirmed minimalist schema
        const { id, title, summary, content, image_url, status, sport, scope } = body;

        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (summary !== undefined) updateData.summary = summary;
        if (content !== undefined) updateData.content = content;
        if (image_url !== undefined) updateData.image_url = image_url;
        if (sport !== undefined) updateData.sport = sport;
        if (scope !== undefined) updateData.scope = scope;
        if (status !== undefined) {
            updateData.status = status;
            if (status === 'published') updateData.published_at = new Date().toISOString();
            if (status === 'draft') updateData.published_at = null;
        }

        const { data, error } = await supabase.from('news').update(updateData).eq('id', id).select().single();

        if (error) throw error;
        return NextResponse.json({ data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: err.message === 'Unauthorized' ? 403 : 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const supabase = await verifyAdmin();
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) throw new Error('Missing id');

        const { error } = await supabase.from('news').delete().eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: err.message === 'Unauthorized' ? 403 : 500 });
    }
}
