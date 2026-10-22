/**
 * Del perfil a la placa. La UNICA traduccion entre lo que sabe el servicio y lo
 * que dibuja `PlayerCard`: la tarjeta no decide nada, y por eso no puede
 * prometer un numero que la ficha no muestre.
 *
 * `origin` va ABSOLUTO. La imagen se arma en el servidor, donde una ruta
 * relativa no resuelve contra nada y el escudo sale roto.
 */

import { formatDateInTimeZone } from '@/lib/timezone';
import type { LocalPlayerProfile } from '@/lib/services/localPlayerProfile';
import type { PlayerCardData, PlayerCardMatch, PlayerCardStat } from './PlayerCard';

function crestUrl(clubId: string | null, clubName: string, origin: string): string | null {
    if (!clubId) return null;
    return `${origin}/api/assets/team-logo?entity=team&sport=rugby&key=${encodeURIComponent(clubId)}&name=${encodeURIComponent(clubName)}&w=128`;
}

function initialsOf(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Los tres numeros de la placa. Partidos va siempre; los otros dos son los que
 * mas dicen de ESTE jugador — un apertura se define por los puntos, un wing por
 * los tries. Si no hay nada que contar, la placa se queda con lo que hay: un
 * cero grande en una imagen que se publica es peor que un hueco.
 */
function statsOf(profile: LocalPlayerProfile): PlayerCardStat[] {
    const { totals } = profile;
    const candidatos: PlayerCardStat[] = [
        { value: String(totals.matches), label: totals.matches === 1 ? 'Partido' : 'Partidos' },
    ];

    const opcionales: Array<[number, string]> = [
        [totals.tries, totals.tries === 1 ? 'Try' : 'Tries'],
        [totals.points, 'Puntos'],
        [totals.conversions, 'Conversiones'],
        [totals.penalties, 'Penales'],
        [totals.starts, 'De titular'],
    ];

    for (const [value, label] of opcionales) {
        if (candidatos.length >= 3) break;
        if (value > 0) candidatos.push({ value: String(value), label });
    }

    // Si no llego a tres, la placa se queda con dos o con uno. Rellenar con
    // ceros es peor: un "0 TRIES" enorme en una imagen que alguien publica dice
    // algo que no es —casi siempre el cero es que no se cargo, no que no hizo.
    return candidatos.slice(0, 3);
}

/**
 * Que hizo el jugador en ese partido, en dos palabras. Solo lo que suma: un
 * knock-on no va a una placa que alguien publica.
 */
function noteOf(match: LocalPlayerProfile['matches'][number]): string {
    const scoring = match.events.filter((event) => event.category === 'score');
    if (scoring.length === 0) return '';
    const tries = scoring.filter((event) => event.type === 'try' || event.type === 'penalty_try');
    const tryCount = tries.reduce((total, event) => total + event.count, 0);
    if (tryCount > 0) return tryCount === 1 ? '1 try' : `${tryCount} tries`;
    if (match.points > 0) return `${match.points} pts`;
    return '';
}

function matchesOf(profile: LocalPlayerProfile, origin: string): PlayerCardMatch[] {
    return profile.matches.map((match) => {
        const own = match.side === 'away' ? match.away : match.home;
        const rival = match.side === 'away' ? match.home : match.away;
        const ownScore = own.score;
        const rivalScore = rival.score;
        return {
            rival: rival.shortName || rival.name,
            crestUrl: crestUrl(rival.id || null, rival.name, origin),
            score: ownScore === null || rivalScore === null ? '–' : `${ownScore}-${rivalScore}`,
            result: match.result,
            note: noteOf(match),
        };
    });
}

export function playerCardData(profile: LocalPlayerProfile, origin: string): PlayerCardData {
    const subtitle = [profile.club?.name, profile.position, profile.mainNumber !== null ? `#${profile.mainNumber}` : null]
        .filter(Boolean)
        .join(' · ');

    // El torneo de la cejilla es el mas reciente en el que jugo, no el "actual":
    // la placa habla de lo que hizo, y lo que hizo tiene fecha.
    const eyebrow = profile.seasons[0]?.tournamentName || '';

    const ultimo = profile.matches[0]?.date;
    const footer = ultimo
        ? `Al ${formatDateInTimeZone(ultimo, 'es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) || ''}`
        : 'Ficha de jugador';

    return {
        name: profile.name,
        initials: initialsOf(profile.name),
        photoUrl: profile.photo,
        clubName: profile.club?.name || null,
        clubCrestUrl: crestUrl(profile.club?.id || null, profile.club?.name || '', origin),
        subtitle: subtitle || 'Jugador',
        eyebrow,
        stats: statsOf(profile),
        matches: matchesOf(profile, origin),
        footer,
    };
}
