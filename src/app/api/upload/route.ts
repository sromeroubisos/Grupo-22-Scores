import { createAdminClient } from '@/lib/supabase/admin';
import { requireNewsSuperAdminServer } from '@/lib/auth/newsAccess';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function verifyEditorialUser() {
    await requireNewsSuperAdminServer();
}

export async function POST(req: Request) {
    try {
        await verifyEditorialUser();
        
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
        
        const { error } = await supabaseAdmin.storage
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
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[UploadAPI] Error:', err);
        return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 403 : 500 });
    }
}
