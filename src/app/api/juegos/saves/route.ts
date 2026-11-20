/**
 * Partidas de los minijuegos en la cuenta del usuario (tabla minigame_saves).
 *
 *   GET    /api/juegos/saves?game=rugby-seven         → los casilleros guardados
 *   PUT    /api/juegos/saves  { game, slot, data, savedAt }  → guarda uno
 *   DELETE /api/juegos/saves?game=rugby-seven&slot=2  → borra uno
 *
 * `data` llega ya comprimido (gzip + base64) desde el navegador: acá no se
 * abre, solo se guarda. Todo va con la sesión del usuario, así que las
 * políticas RLS de la tabla aseguran que cada uno toca solo lo suyo. Sin
 * sesión contesta 401 y el juego sigue guardando en el navegador.
 */
import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const GAME = /^[a-z0-9-]{1,40}$/;
const MAX_BYTES = 400_000;
const noStore = { 'Cache-Control': 'no-store' };

async function session() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return { supabase, userId: user?.id ?? null };
}

const parseSlot = (v: unknown) => {
    const n = typeof v === 'string' ? Number(v) : v;
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 9 ? n : null;
};

export async function GET(request: NextRequest) {
    const game = request.nextUrl.searchParams.get('game') ?? '';
    if (!GAME.test(game)) return NextResponse.json({ error: 'game inválido' }, { status: 400, headers: noStore });
    const { supabase, userId } = await session();
    if (!userId) return NextResponse.json({ error: 'Sin sesión' }, { status: 401, headers: noStore });
    const { data, error } = await supabase.from('minigame_saves').select('slot, data, saved_at').eq('user_id', userId).eq('game', game);
    if (error) {
        console.error('[api/juegos/saves] GET', error.message);
        return NextResponse.json({ error: 'No se pudo leer' }, { status: 500, headers: noStore });
    }
    const slots = (data ?? []).map((r: { slot: number; data: string; saved_at: string }) => ({ slot: r.slot, data: r.data, savedAt: Date.parse(r.saved_at) }));
    return NextResponse.json({ slots }, { headers: noStore });
}

export async function PUT(request: NextRequest) {
    let body: { game?: unknown; slot?: unknown; data?: unknown; savedAt?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: noStore });
    }
    const game = typeof body.game === 'string' ? body.game : '';
    const slot = parseSlot(body.slot);
    const data = typeof body.data === 'string' ? body.data : '';
    const savedAt = typeof body.savedAt === 'number' && Number.isFinite(body.savedAt) ? body.savedAt : NaN;
    if (!GAME.test(game) || slot === null || !data || !/^[A-Za-z0-9+/=]+$/.test(data) || Number.isNaN(savedAt)) {
        return NextResponse.json({ error: 'Datos inválidos' }, { status: 400, headers: noStore });
    }
    if (data.length > MAX_BYTES) return NextResponse.json({ error: 'Partida demasiado grande' }, { status: 413, headers: noStore });
    const { supabase, userId } = await session();
    if (!userId) return NextResponse.json({ error: 'Sin sesión' }, { status: 401, headers: noStore });
    // Una hora del dispositivo absurda (adelantada) no puede ganarle para siempre a las demás.
    const at = new Date(Math.min(savedAt, Date.now() + 60_000)).toISOString();
    const { error } = await supabase
        .from('minigame_saves')
        .upsert({ user_id: userId, game, slot, data, bytes: data.length, saved_at: at, updated_at: new Date().toISOString() }, { onConflict: 'user_id,game,slot' });
    if (error) {
        console.error('[api/juegos/saves] PUT', error.message);
        return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500, headers: noStore });
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function DELETE(request: NextRequest) {
    const game = request.nextUrl.searchParams.get('game') ?? '';
    const slot = parseSlot(request.nextUrl.searchParams.get('slot'));
    if (!GAME.test(game) || slot === null) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400, headers: noStore });
    const { supabase, userId } = await session();
    if (!userId) return NextResponse.json({ error: 'Sin sesión' }, { status: 401, headers: noStore });
    const { error } = await supabase.from('minigame_saves').delete().eq('user_id', userId).eq('game', game).eq('slot', slot);
    if (error) {
        console.error('[api/juegos/saves] DELETE', error.message);
        return NextResponse.json({ error: 'No se pudo borrar' }, { status: 500, headers: noStore });
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
}
