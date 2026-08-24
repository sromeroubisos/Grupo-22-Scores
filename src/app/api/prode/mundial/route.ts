import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProdeWorldCupScreenData } from '@/lib/server/prodeWorldCupScreenData';

export const dynamic = 'force-dynamic';

// Alimenta el popup del Prode del Mundial con los mismos datos reales que la
// pantalla `/prode/mundial`. Devuelve { available: false } si no hay prode publicado.
export async function GET() {
    try {
        const supabase = await createClient();
        const {
            data: { user: authUser },
        } = await supabase.auth.getUser();

        const data = await getProdeWorldCupScreenData(authUser?.id ?? null);
        if (!data) {
            return NextResponse.json({ available: false });
        }

        return NextResponse.json({ available: true, ...data });
    } catch (error) {
        console.error('[api/prode/mundial] failed', error);
        return NextResponse.json({ available: false });
    }
}
