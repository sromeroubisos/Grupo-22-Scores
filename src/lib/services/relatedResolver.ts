import { createClient } from '@/lib/supabase/server';
import { EntityType } from './entityResolver';

export type RelatedItem = {
    id: string;
    label: string;
    entityType: EntityType | 'team';
    href: string;
    meta?: string;
    raw?: {
        status?: string;
        date_time?: string | null;
    };
    context?: {
        fromType: EntityType;
        fromId: string;
    };
};

export type RelatedResult = {
    items: RelatedItem[];
    nextOffset?: number;
    totalApprox?: number;
};

export type RelatedSectionData = {
    title: string;
    result: RelatedResult;
};

const getClubName = (joinData: any, fallbackId: string | null) => {
    if (!joinData) return fallbackId ?? 'Unknown';
    if (Array.isArray(joinData)) return joinData[0]?.name ?? fallbackId ?? 'Unknown';
    return joinData.name ?? fallbackId ?? 'Unknown';
};

const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown date';
    try {
        return new Date(dateString).toISOString().split('T')[0];
    } catch {
        return dateString;
    }
};

export async function getRelatedItems(
    entityType: EntityType,
    id: string,
    offset: number = 0,
    limit: number = 20
): Promise<{ sections: RelatedSectionData[], notSupported: string[] }> {
    const supabase = await createClient();
    const sections: RelatedSectionData[] = [];
    const notSupported: string[] = [];

    // ── TOURNAMENT ──────────────────────────────────────────────────────────
    if (entityType === 'tournament') {
        // Matches in this tournament
        const { data: matchesData, error: matchesError, count } = await supabase
            .from('matches')
            .select(`
                id, date_time, status, home_club_id, away_club_id,
                home:clubs!matches_home_club_id_fkey(name),
                away:clubs!matches_away_club_id_fkey(name)
            `, { count: 'estimated' })
            .eq('tournament_id', id)
            .order('date_time', { ascending: false })
            .range(offset, offset + limit - 1);

        if (!matchesError && matchesData) {
            sections.push({
                title: 'Matches',
                result: {
                    items: matchesData.map(m => {
                        const homeName = getClubName(m.home, m.home_club_id);
                        const awayName = getClubName(m.away, m.away_club_id);
                        const dateStr = formatDate(m.date_time);
                        const statusStr = m.status ? ` — ${m.status}` : '';

                        return {
                            id: m.id,
                            label: `${homeName} vs ${awayName}`,
                            entityType: 'match',
                            href: `/admin/entities/${m.id}/manage?type=match&from=tournament:${id}`,
                            meta: `${dateStr}${statusStr}`,
                            raw: { status: m.status, date_time: m.date_time },
                            context: { fromType: 'tournament', fromId: id }
                        };
                    }),
                    nextOffset: matchesData.length === limit ? offset + limit : undefined,
                    totalApprox: count ?? undefined
                }
            });
        }
    }

    // ── CLUB ────────────────────────────────────────────────────────────────
    else if (entityType === 'club') {
        // 1. Matches for this club
        const { data: matchesData, error: matchesError, count: matchesCount } = await supabase
            .from('matches')
            .select(`
                id, date_time, status, home_club_id, away_club_id,
                home:clubs!matches_home_club_id_fkey(name),
                away:clubs!matches_away_club_id_fkey(name)
            `, { count: 'estimated' })
            .or(`home_club_id.eq.${id},away_club_id.eq.${id}`)
            .order('date_time', { ascending: false })
            .range(offset, offset + limit - 1);

        if (!matchesError && matchesData) {
            sections.push({
                title: 'Matches',
                result: {
                    items: matchesData.map(m => {
                        const isHome = m.home_club_id === id;
                        const opponentName = isHome
                            ? getClubName(m.away, m.away_club_id)
                            : getClubName(m.home, m.home_club_id);

                        return {
                            id: m.id,
                            label: `${isHome ? 'vs' : '@'} ${opponentName}`,
                            entityType: 'match',
                            href: `/admin/entities/${m.id}/manage?type=match&from=club:${id}`,
                            meta: `${formatDate(m.date_time)}${m.status ? ` — ${m.status}` : ''}`,
                            raw: { status: m.status, date_time: m.date_time },
                            context: { fromType: 'club', fromId: id }
                        };
                    }),
                    nextOffset: matchesData.length === limit ? offset + limit : undefined,
                    totalApprox: matchesCount ?? undefined
                }
            });
        }

        // 2. Players for this club
        const { data: playersData, error: playersError } = await (supabase as any)
            .from('players')
            .select('id, name, position, nationality')
            .eq('club_id', id)
            .order('name');

        if (!playersError && playersData) {
            sections.push({
                title: 'Players',
                result: {
                    items: playersData.map((p: any) => ({
                        id: p.id,
                        label: p.name,
                        entityType: 'player',
                        href: `/admin/entities/${p.id}/manage?type=player&from=club:${id}`,
                        meta: `${p.position || 'N/A'}${p.nationality ? ` — ${p.nationality}` : ''}`,
                    }))
                }
            });
        }

        // 3. Tournaments (via participating matches)
        const { data: tourneyData } = await supabase
            .from('matches')
            .select(`tournament:tournaments(id, name, status)`)
            .or(`home_club_id.eq.${id},away_club_id.eq.${id}`)
            .not('tournament_id', 'is', null);

        if (tourneyData) {
            const uniqueTourneys = new Map();
            tourneyData.forEach((m: any) => {
                if (m.tournament) uniqueTourneys.set(m.tournament.id, m.tournament);
            });

            if (uniqueTourneys.size > 0) {
                sections.push({
                    title: 'Active Tournaments',
                    result: {
                        items: Array.from(uniqueTourneys.values()).map(t => ({
                            id: t.id,
                            label: t.name,
                            entityType: 'tournament',
                            href: `/admin/entities/${t.id}/manage?type=tournament&from=club:${id}`,
                            meta: t.status || 'Active'
                        }))
                    }
                });
            }
        }
    }

    // ── PLAYER ──────────────────────────────────────────────────────────────
    else if (entityType === 'player') {
        const { data: playerData } = await (supabase as any)
            .from('players')
            .select('*, club:clubs(id, name)')
            .eq('id', id)
            .single();

        if (playerData?.club) {
            sections.push({
                title: 'Current Club',
                result: {
                    items: [{
                        id: playerData.club.id,
                        label: playerData.club.name,
                        entityType: 'club',
                        href: `/admin/entities/${playerData.club.id}/manage?type=club&from=player:${id}`,
                    }]
                }
            });

            // Also show matches for their current club
            const { data: matchesData } = await supabase
                .from('matches')
                .select(`
                    id, date_time, status, home_club_id, away_club_id,
                    home:clubs!matches_home_club_id_fkey(name),
                    away:clubs!matches_away_club_id_fkey(name)
                `)
                .or(`home_club_id.eq.${playerData.club.id},away_club_id.eq.${playerData.club.id}`)
                .order('date_time', { ascending: false })
                .limit(10);

            if (matchesData) {
                sections.push({
                    title: 'Club Matches',
                    result: {
                        items: matchesData.map(m => ({
                            id: m.id,
                            label: `${getClubName(m.home, m.home_club_id)} vs ${getClubName(m.away, m.away_club_id)}`,
                            entityType: 'match',
                            href: `/admin/entities/${m.id}/manage?type=match&from=player:${id}`,
                            meta: formatDate(m.date_time)
                        }))
                    }
                });
            }
        }
    }

    // ── MATCH ───────────────────────────────────────────────────────────────
    else if (entityType === 'match') {
        const { data: matchData } = await supabase
            .from('matches')
            .select(`
                tournament:tournaments(id, name),
                home:clubs!matches_home_club_id_fkey(id, name),
                away:clubs!matches_away_club_id_fkey(id, name)
            `)
            .eq('id', id)
            .single();

        if (matchData) {
            if (matchData.tournament) {
                sections.push({
                    title: 'Tournament',
                    result: {
                        items: [{
                            id: (matchData.tournament as any).id,
                            label: (matchData.tournament as any).name,
                            entityType: 'tournament',
                            href: `/admin/entities/${(matchData.tournament as any).id}/manage?type=tournament&from=match:${id}`,
                        }]
                    }
                });
            }

            const clubs = [];
            if (matchData.home) clubs.push(matchData.home);
            if (matchData.away) clubs.push(matchData.away);

            if (clubs.length > 0) {
                sections.push({
                    title: 'Competing Clubs',
                    result: {
                        items: (clubs as any[]).map(c => ({
                            id: c.id,
                            label: c.name,
                            entityType: 'club',
                            href: `/admin/entities/${c.id}/manage?type=club&from=match:${id}`,
                        }))
                    }
                });
            }
        }
    }

    return { sections, notSupported };
}
