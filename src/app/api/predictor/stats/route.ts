import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Contadores GLOBALES del predictor (compartidos por todos los usuarios). El estado
// vive en Supabase (ver migración 20260630120000_predictor_global_stats.sql). Si la
// migración todavía no se aplicó, devolvemos los seeds para no romper la UI.

export const dynamic = 'force-dynamic';

// "Veces jugadas" se deriva de la suma de votos de campeón (cada jugada suma un
// voto). Los seeds suman 127, que es el piso inicial.
const SEED_TIMES_PLAYED = 127;
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

// "Veces jugadas" = suma de TODOS los votos de campeón. Cada jugada agrega
// exactamente un voto, y la suma de los seeds es 127, así el contador arranca en
// 127 y sube 1 por jugada. Esto evita depender de un contador aparte y garantiza
// que el número siga siempre a los votos (que sí persisten).
async function readStats(admin: ReturnType<typeof createAdminClient>) {
    const votesResult = await admin
        .from('predictor_champion_votes')
        .select('name, votes')
        .order('votes', { ascending: false });

    if (votesResult.error && !isMissingRelationError(votesResult.error)) {
        throw new Error(votesResult.error.message || 'No se pudieron leer los votos del predictor.');
    }

    const champions: ChampionEntry[] = (votesResult.data && votesResult.data.length)
        ? (votesResult.data as AnyRow[]).map((row) => ({
            name: String(row.name ?? ''),
            count: Number(row.votes) || 0,
        }))
        : seedChampions();

    const timesPlayed = champions.reduce((sum, champion) => sum + champion.count, 0);

    return { timesPlayed, champions };
}

export async function GET() {
    try {
        const admin = createAdminClient();
        const stats = await readStats(admin);
        return NextResponse.json({ ...stats, persisted: true });
    } catch {
        return NextResponse.json({
            timesPlayed: SEED_TIMES_PLAYED,
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

        // Una jugada = un voto de campeón. Si no llega campeón, no hay jugada que
        // registrar; igual devolvemos el estado actual.
        if (championName) {
            const voteResult = await admin.rpc('add_predictor_champion_vote', {
                p_key: normalizeChampionKey(championName),
                p_name: championName,
            });
            if (voteResult.error) {
                // Migración no aplicada todavía: seeds + 1 optimista, sin persistir.
                if (isMissingRelationError(voteResult.error)) {
                    return NextResponse.json({
                        timesPlayed: SEED_TIMES_PLAYED + 1,
                        champions: seedChampions(),
                        persisted: false,
                    });
                }
                throw new Error(voteResult.error.message || 'No se pudo registrar el voto de campeón.');
            }
        }

        const stats = await readStats(admin);
        return NextResponse.json({ ...stats, persisted: true });
    } catch {
        return NextResponse.json({
            timesPlayed: SEED_TIMES_PLAYED + 1,
            champions: seedChampions(),
            persisted: false,
        });
    }
}
