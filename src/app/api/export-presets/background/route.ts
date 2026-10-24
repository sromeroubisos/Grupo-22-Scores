// Sube el fondo PNG de un preset de exportación a Storage y devuelve la URL de
// la foto y la de su miniatura. Lo llama ExportImage al guardar un preset y al
// migrar los que todavía traen la foto embebida en base64.

import { NextResponse } from 'next/server';

import { persistExportBackground } from '@/lib/server/persistExportBackground';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
    const supabase = await createClient();
    // getUser y no getSession: valida el token contra Supabase (ver lib/auth/server).
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Iniciá sesión para guardar el fondo en la nube.' }, { status: 401 });
    }

    let dataUrl = '';
    try {
        const body = await req.json();
        dataUrl = typeof body?.dataUrl === 'string' ? body.dataUrl : '';
    } catch {
        return NextResponse.json({ error: 'El pedido no trae un fondo.' }, { status: 400 });
    }

    const result = await persistExportBackground(user.id, dataUrl);
    if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ src: result.src, thumb: result.thumb });
}
