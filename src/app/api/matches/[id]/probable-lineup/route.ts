import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Alineacion probable de cada club: el XV que mas se repite en sus ultimos
 * partidos con planilla. Por camiseta (1 a 15) gana el jugador que mas veces la
 * uso; si empatan, el mas reciente. Sirve hasta que se confirme la oficial.
 * Un club sin partidos con planilla devuelve `players: []`: no se inventa nada.
 */

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOOKBACK = 14; // partidos que se miran por club
const SAMPLE = 6; // con planilla que alcanzan
const MIN_STARTERS = 11; // una planilla a medias no cuenta

type RawPlayer = { id?: unknown; name?: unknown; number?: unknown; role?: unknown };
type Probable = { id: string | null; name: string; number: number; appearances: number };
type Starter = { id: string | null; name: string; number: number };
type Side = { players: Probable[]; basedOn: number };

const EMPTY: Side = { players: [], basedOn: 0 };

function startersOf(list: unknown): Starter[] {
    if (!Array.isArray(list)) return [];
    const out: Starter[] = [];
    const seen = new Set<number>();
    for (const raw of list as RawPlayer[]) {
        const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
        const number = Number(raw?.number);
        if (!name || !Number.isInteger(number) || number < 1 || number > 15 || seen.has(number)) continue;
        if (raw.role && raw.role !== 'starter') continue;
        seen.add(number);
        out.push({ id: typeof raw.id === "string" && raw.id ? raw.id : null, name, number });
    }
    return out;
}

async function probableFor(
    admin: ReturnType<typeof createAdminClient>,
    clubId: string | null,
    matchId: string,
    before: string | null,
): Promise<Side> {
    if (!clubId) return EMPTY;
    let query = admin
        .from('matches')
        .select('home_club_id, away_club_id, date_time, lineups')
        .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
        .neq('id', matchId)
        .order('date_time', { ascending: false })
        .limit(LOOKBACK);
    if (before) query = query.lt('date_time', before);
    const { data, error } = await query;
    if (error || !data) return EMPTY;

    // Mas reciente primero: el orden ya desempata.
    const sheets: Starter[][] = [];
    for (const row of data) {
        const side = row.home_club_id === clubId ? 'home' : 'away';
        const starters = startersOf((row.lineups as Record<string, unknown> | null)?.[side]);
        if (starters.length >= MIN_STARTERS) sheets.push(starters);
        if (sheets.length >= SAMPLE) break;
    }
    if (sheets.length === 0) return EMPTY;

    const players: Probable[] = [];
    for (let n = 1; n <= 15; n += 1) {
        const tally = new Map<string, { id: string | null; name: string; count: number }>();
        for (const sheet of sheets) {
            const found = sheet.find((p) => p.number === n);
            if (!found) continue;
            const key = found.name.toLowerCase();
            const prev = tally.get(key);
            tally.set(key, { id: prev?.id ?? found.id, name: prev?.name ?? found.name, count: (prev?.count ?? 0) + 1 });
        }
        // Map conserva el orden de insercion = mas reciente primero.
        let best: { id: string | null; name: string; count: number } | null = null;
        for (const entry of tally.values()) if (!best || entry.count > best.count) best = entry;
        if (best) players.push({ id: best.id, name: best.name, number: n, appearances: best.count });
    }
    return { players, basedOn: sheets.length };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    if (!ID_PATTERN.test(id)) return NextResponse.json({ home: EMPTY, away: EMPTY });

    const admin = createAdminClient();
    const { data: match } = await admin
        .from('matches')
        .select('home_club_id, away_club_id, date_time')
        .eq('id', id)
        .maybeSingle();
    if (!match) return NextResponse.json({ home: EMPTY, away: EMPTY });

    const [home, away] = await Promise.all([
        probableFor(admin, match.home_club_id ?? null, id, match.date_time ?? null),
        probableFor(admin, match.away_club_id ?? null, id, match.date_time ?? null),
    ]);
    return NextResponse.json(
        { home, away },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
}
