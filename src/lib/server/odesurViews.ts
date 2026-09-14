/**
 * Del modelo de partido de la app a la vista liviana que usa el apartado de
 * los Juegos Suramericanos. El `Match` completo lleva fechas como `Date`,
 * metadatos del sync y campos que la pantalla no mira; esto es lo que dibuja.
 */
import type { Match } from '@/types/match';
import type { OdesurMatchView } from '@/app/juegos-odesur/types';

export function toOdesurMatchView(match: Match): OdesurMatchView {
    const scheduledAt = match.scheduledAt as Date | string | null | undefined;
    const startsAt = scheduledAt instanceof Date
        ? (Number.isNaN(scheduledAt.getTime()) ? null : scheduledAt.toISOString())
        : (typeof scheduledAt === 'string' ? scheduledAt : null);

    return {
        id: String(match.id),
        startsAt,
        status: match.status,
        minute: match.currentMinute ? String(match.currentMinute) : null,
        stage: match.leagueStageName || '',
        venue: match.venueName || '',
        home: {
            name: match.homeTeamName,
            logo: match.homeTeamLogo || '',
            score: match.score?.home ?? null,
        },
        away: {
            name: match.awayTeamName,
            logo: match.awayTeamLogo || '',
            score: match.score?.away ?? null,
        },
    };
}
