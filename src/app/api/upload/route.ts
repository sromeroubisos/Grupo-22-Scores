import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/auth/roles';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function verifyAdmin() {
    const supabase = await createServerClient();
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
    return true;
}

export async function POST(req: Request) {
    try {
        await verifyAdmin();
        
        const formData = await req.formData();
        const file = formData.get('file') as File;
        
        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const supabaseAdmin = createAdminClient();
        
        // Sanitize filename or use a random one
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const filePath = `news/${fileName}`;

        const buffer = await file.arrayBuffer();
        
        const { data, error } = await supabaseAdmin.storage
            .from('news')
            .upload(filePath, buffer, {
                contentType: file.type,
                upsert: false
            });

        if (error) {
            console.error('[UploadAPI] Storage error:', error);
            throw error;
        }

        // Get public URL
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('news')
            .getPublicUrl(filePath);

        return NextResponse.json({ url: publicUrl });
    } catch (err: any) {
        console.error('[UploadAPI] Error:', err);
        return NextResponse.json({ error: err.message }, { status: err.message === 'Unauthorized' ? 403 : 500 });
    }
}
