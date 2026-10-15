// Cuenta una vista de una noticia publicada.
//
// Lo llama la baliza del lector (NewsViewBeacon), una vez por navegador cada
// 12 horas. La suma la hace increment_news_view en la base, que solo cuenta
// notas publicadas y solo la puede ejecutar service_role. Si la migración
// todavía no corrió, la nota se lee igual: la vista simplemente no se anota.

import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse/i;

type RpcClient = {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export async function POST(req: Request) {
    const body = (await req.json().catch(() => ({}))) as { id?: unknown };
    const id = typeof body.id === 'string' ? body.id : '';
    if (!UUID.test(id)) {
        return NextResponse.json({ error: 'Falta el id de la noticia.' }, { status: 400 });
    }

    // Los rastreadores y las vistas previas de los chats no son lectores.
    if (BOT.test(req.headers.get('user-agent') ?? '')) {
        return NextResponse.json({ counted: false });
    }

    try {
        const admin = createAdminClient() as unknown as RpcClient;
        const { error } = await admin.rpc('increment_news_view', { p_id: id });
        if (error) {
            console.warn('[api/news/view]', error);
            return NextResponse.json({ counted: false });
        }
        return NextResponse.json({ counted: true });
    } catch (error) {
        console.warn('[api/news/view]', error);
        return NextResponse.json({ counted: false });
    }
}
