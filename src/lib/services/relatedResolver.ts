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

    if (entityType === 'tournament') {
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
                            raw: {
                                status: m.status,
                                date_time: m.date_time
                            },
                            context: { fromType: 'tournament', fromId: id }
                        };
                    }),
                    nextOffset: matchesData.length === limit ? offset + limit : undefined,
                    totalApprox: count ?? undefined
                }
            });
        } else {
            sections.push({ title: 'Matches', result: { items: [] } });
        }
    }

    else if (entityType === 'club') {
        const { data: matchesData, error: matchesError, count } = await supabase
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
                        const opponentName = m.home_club_id === id
                            ? getClubName(m.away, m.away_club_id)
                            : getClubName(m.home, m.home_club_id);

                        const dateStr = formatDate(m.date_time);
                        const statusStr = m.status ? ` — ${m.status}` : '';

                        return {
                            id: m.id,
                            label: `vs ${opponentName}`,
                            entityType: 'match',
                            href: `/admin/entities/${m.id}/manage?type=match&from=club:${id}`,
                            meta: `${dateStr}${statusStr}`,
                            raw: {
                                status: m.status,
                                date_time: m.date_time
                            },
                            context: { fromType: 'club', fromId: id }
                        };
                    }),
                    nextOffset: matchesData.length === limit ? offset + limit : undefined,
                    totalApprox: count ?? undefined
                }
            });
        } else {
            sections.push({ title: 'Matches', result: { items: [] } });
        }

        // players table does not exist in compile-time Database types!
        notSupported.push('Players');
        notSupported.push('Teams');
        notSupported.push('Tournaments (no club_id)');
    }

    else if (entityType === 'player') {
        notSupported.push('Club');
        notSupported.push('Matches');
    }

    else if (entityType === 'match') {
        // We could perhaps show Tournament or Clubs but let's just use what's explicit
        notSupported.push('Related entities for matches are not explicitly defined in the task but can be inferred.');
    }

    return { sections, notSupported };
}
