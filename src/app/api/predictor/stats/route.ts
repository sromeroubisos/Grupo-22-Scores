import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Contadores GLOBALES del predictor (compartidos por todos los usuarios). El estado
// vive en Supabase (ver migración 20260630120000_predictor_global_stats.sql). Si la
// migración todavía no se aplicó, devolvemos los seeds para no romper la UI.

export const dynamic = 'force-dynamic';

const COUNTER_KEY = 'predictor_brackets_exported';
const SEED_BRACKETS_EXPORTED = 127;
const SEED_CHAMPIONS: Array<{ name: string; count: number }> = [
    { name: 'Argentina', count: 40 },
    { name: 'España', count: 36 },
    { name: 'Francia', count: 30 },
    { name: 'Portugal', count: 20 },
    { name: 'Brasil', count: 1 },
];

type ChampionEntry = { name: string; count: number };
type AnyRow = Record<string, unknown>;
type QueryError = { message?: string | null } | null;

function normalizeChampionKey(name: string) {
    return name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

function seedChampions(): ChampionEntry[] {
    return [...SEED_CHAMPIONS].sort((a, b) => b.count - a.count);
}

function isMissingRelationError(error: QueryError) {
    const message = error?.message || '';
    return message.includes('does not exist')
        || message.includes('schema cache')
        || message.includes('Could not find');
}

async function readStats(admin: ReturnType<typeof createAdminClient>) {
    const [counterResult, votesResult] = await Promise.all([
        admin.from('app_counters').select('value').eq('key', COUNTER_KEY).maybeSingle(),
        admin.from('predictor_champion_votes').select('name, votes').order('votes', { ascending: false }),
    ]);

    if (counterResult.error && !isMissingRelationError(counterResult.error)) {
        throw new Error(counterResult.error.message || 'No se pudo leer el contador del predictor.');
    }
    if (votesResult.error && !isMissingRelationError(votesResult.error)) {
        throw new Error(votesResult.error.message || 'No se pudieron leer los votos del predictor.');
    }

    const bracketsExported = counterResult.data
        ? Number((counterResult.data as AnyRow).value) || SEED_BRACKETS_EXPORTED
        : SEED_BRACKETS_EXPORTED;

    const champions: ChampionEntry[] = (votesResult.data && votesResult.data.length)
        ? (votesResult.data as AnyRow[]).map((row) => ({
            name: String(row.name ?? ''),
            count: Number(row.votes) || 0,
        }))
        : seedChampions();

    return { bracketsExported, champions };
}

export async function GET() {
    try {
        const admin = createAdminClient();
        const stats = await readStats(admin);
        return NextResponse.json({ ...stats, persisted: true });
    } catch {
        return NextResponse.json({
            bracketsExported: SEED_BRACKETS_EXPORTED,
            champions: seedChampions(),
            persisted: false,
        });
    }
}

export async function POST(request: Request) {
    let championName: string | null = null;
    try {
        const body = await request.json().catch(() => ({}));
        const raw = (body as AnyRow)?.champion;
        if (typeof raw === 'string' && raw.trim()) {
            championName = raw.trim();
        }
    } catch {
        championName = null;
    }

    try {
        const admin = createAdminClient();

        const incrementResult = await admin.rpc('increment_predictor_export');
        if (incrementResult.error) {
            // Migración no aplicada todavía: respondemos seeds con +1 optimista para
            // que la UI muestre el incremento de esta sesión.
            if (isMissingRelationError(incrementResult.error)) {
                return NextResponse.json({
                    bracketsExported: SEED_BRACKETS_EXPORTED + 1,
                    champions: seedChampions(),
                    persisted: false,
                });
            }
            throw new Error(incrementResult.error.message || 'No se pudo incrementar el contador.');
        }

        if (championName) {
            const voteResult = await admin.rpc('add_predictor_champion_vote', {
                p_key: normalizeChampionKey(championName),
                p_name: championName,
            });
            if (voteResult.error && !isMissingRelationError(voteResult.error)) {
                throw new Error(voteResult.error.message || 'No se pudo registrar el voto de campeón.');
            }
        }

        const stats = await readStats(admin);
        return NextResponse.json({ ...stats, persisted: true });
    } catch {
        return NextResponse.json({
            bracketsExported: SEED_BRACKETS_EXPORTED + 1,
            champions: seedChampions(),
            persisted: false,
        });
    }
}
