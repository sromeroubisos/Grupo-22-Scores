import { getReadClient } from '@/lib/supabase/read';
import { buildTournamentHistoricalStandings } from '@/lib/server/historicalStandings';
import { buildSquadTable } from '@/lib/standings/squadTable';
import { resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';

/**
 * Tabla de planteles de un torneo: la suma de los puntos de la temporada
 * vigente de cada torneo de su agrupación (`tournament_squad_members`).
 * Reusa las tablas que ya arma la histórica: no recalcula nada propio.
 */

type ReadClient = Awaited<ReturnType<typeof getReadClient>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SquadTablePayload = {
    available: boolean;
    groupName?: string;
    categories?: Array<{ id: string; label: string; tournamentId: string }>;
    rows?: Array<{
        position: number;
        points: number;
        played: number;
        categories: Record<string, number>;
        club: { id: string; name: string; logo: string | null };
    }>;
};

async function resolveTournamentId(supabase: ReadClient, routeId: string): Promise<string | null> {
    const key = routeId.trim();
    if (UUID_RE.test(key)) return key;
    const { data } = await supabase.from('tournaments').select('id').eq('slug', key).maybeSingle();
    return (data as any)?.id ? String((data as any).id) : null;
}

export async function buildTournamentSquadTable(supabase: ReadClient, routeId: string): Promise<SquadTablePayload> {
    const tournamentId = await resolveTournamentId(supabase, routeId);
    if (!tournamentId) return { available: false };

    const own = await supabase
        .from('tournament_squad_members')
        .select('group_key')
        .eq('tournament_id', tournamentId)
        .order('group_key', { ascending: true })
        .limit(1);
    // Tabla ausente (migración sin correr): la pestaña simplemente no existe.
    if (own.error) {
        if (own.error.code === '42P01' || own.error.code === 'PGRST205') return { available: false };
        throw new Error(own.error.message);
    }
    const groupKey = own.data?.[0]?.group_key as string | undefined;
    if (!groupKey) return { available: false };

    const { data: members, error } = await supabase
        .from('tournament_squad_members')
        .select('tournament_id, group_name, label, weight, sort_order')
        .eq('group_key', groupKey)
        .order('sort_order', { ascending: true })
        .order('tournament_id', { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (members ?? []).map((m: any) => String(m.tournament_id));
    const { data: tRows, error: tError } = await supabase
        .from('tournaments')
        .select('id, name, display_name, is_visible')
        .in('id', ids);
    if (tError) throw new Error(tError.message);
    const tournamentById = new Map<string, any>((tRows ?? []).map((t: any) => [String(t.id), t]));

    // Los ocultos no suman, salvo el propio (quien lo abre ya pasó el gate).
    const visible = (members ?? []).filter((m: any) => {
        const t = tournamentById.get(String(m.tournament_id));
        return t && (t.is_visible !== false || String(m.tournament_id) === tournamentId);
    });

    const built = await Promise.all(visible.map(async (m: any) => {
        const result = await buildTournamentHistoricalStandings(supabase, String(m.tournament_id), {
            currentSeasonOfTournamentId: String(m.tournament_id),
            keepUnplayed: true,
        });
        const t = tournamentById.get(String(m.tournament_id));
        return {
            categoryId: String(m.tournament_id),
            label: String(m.label || t?.display_name || t?.name || 'Categoría'),
            weight: Number(m.weight),
            clubs: new Map((result?.rows ?? []).map((r) => [r.clubId, r.club])),
            rows: (result?.rows ?? []).map((r) => ({
                clubId: r.clubId, played: r.played, won: r.won, scored: r.scored, conceded: r.conceded, points: r.points,
            })),
        };
    }));

    // Cada categoría es un club derivado ("Tala Rugby Club Preintermedia A"):
    // para sumar por plantel se agrupa por el club base (club_derivatives).
    // Un club que ya es base, o sin vínculo, se queda con su propio id.
    const allClubIds = [...new Set(built.flatMap((b) => b.rows.map((r) => r.clubId)))];
    const baseOf = new Map<string, string>();
    for (let i = 0; i < allClubIds.length; i += 60) {
        const { data, error: derivError } = await supabase
            .from('club_derivatives')
            .select('derived_club_id, base_club_id')
            .in('derived_club_id', allClubIds.slice(i, i + 60));
        if (derivError) throw new Error(derivError.message);
        (data ?? []).forEach((d: any) => baseOf.set(String(d.derived_club_id), String(d.base_club_id)));
    }
    const toBase = (clubId: string) => baseOf.get(clubId) ?? clubId;

    const table = buildSquadTable(built.map((b) => ({
        categoryId: b.categoryId,
        weight: b.weight,
        rows: b.rows.map((r) => ({ ...r, clubId: toBase(r.clubId) })),
    })));

    // La raíz de la familia sirve para AGRUPAR, no siempre para MOSTRAR: la raíz de
    // Gimnasia de Rosario es "GER B" y la de Universitario de Rosario es la de
    // hockey. Se muestra la raíz solo si figura ella misma en alguna tabla; si no,
    // el club de la primera categoría (en orden de agrupación) donde aparece.
    const displayOf = new Map<string, string>();
    for (const b of built) {
        for (const r of b.rows) {
            const base = toBase(r.clubId);
            if (r.clubId === base) displayOf.set(base, base);
            else if (!displayOf.has(base)) displayOf.set(base, r.clubId);
        }
    }
    const displayId = (baseId: string) => displayOf.get(baseId) ?? baseId;

    const clubInfo = new Map<string, { id: string; name: string; logo: string | null }>();
    const baseIds = [...new Set(table.map((row) => displayId(row.clubId)))];
    for (let i = 0; i < baseIds.length; i += 60) {
        const { data, error: clubError } = await supabase.from('clubs').select('id, name, short_name, logo_url').in('id', baseIds.slice(i, i + 60));
        if (clubError) throw new Error(clubError.message);
        (data ?? []).forEach((club: any) => {
            const name = club.name || club.short_name || 'Club';
            clubInfo.set(String(club.id), { id: String(club.id), name, logo: resolveSerializableLogoUrl(club.logo_url, { key: club.id, name }) });
        });
    }

    return {
        available: true,
        groupName: String((members as any)?.[0]?.group_name || 'Planteles'),
        categories: built.map((b) => ({ id: b.categoryId, label: b.label, tournamentId: b.categoryId })),
        rows: table.map((row) => ({
            position: row.position,
            points: row.points,
            played: row.played,
            categories: row.categories,
            club: clubInfo.get(displayId(row.clubId)) ?? { id: displayId(row.clubId), name: 'Club', logo: resolveSerializableLogoUrl(null, { key: displayId(row.clubId), name: 'Club' }) },
        })),
    };
}

