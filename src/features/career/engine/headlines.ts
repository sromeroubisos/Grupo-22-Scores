import type { Player } from '../types/player.ts';
import type { SeasonStats } from '../types/season.ts';
import { getClub } from '../data/clubs.ts';
import { getPosition } from '../data/positions.ts';
import type { Rng } from './random.ts';

export interface HeadlineContext {
    player: Player;
    rating: number;
    matches: number;
    stats: SeasonStats;
    titles: string[];
    capsGained: number;
    debutNational: boolean;
    seriousInjury: boolean;
    movedFrom: string | null; // club anterior si hubo pase
}

// La narrativa NUNCA usa un nombre propio: el usuario solo eligió nacionalidad
// y posición, así que el protagonista es "el apertura", "el wing", "el pilar".
const FEMININE_POSITIONS = new Set(['lock', 'backrow']); // "la segunda línea", "la tercera línea"

function subject(player: Player): string {
    const label = getPosition(player.position).labelEs.toLowerCase();
    return `${FEMININE_POSITIONS.has(player.position) ? 'la' : 'el'} ${label}`;
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Elige el titular según el hecho más relevante de la temporada. */
export function makeHeadline(ctx: HeadlineContext, rng: Rng): string {
    const { player } = ctx;
    const clubName = getClub(player.club).labelEs;
    const who = subject(player);
    const Who = capitalize(who);

    if (ctx.titles.length > 0) {
        return rng.pick([
            `${Who} sale campeón con ${clubName}: ${ctx.titles[0]}`,
            `${clubName} lo grita: ${who} levanta ${ctx.titles[0]}`,
            `Temporada de gloria en ${clubName} (${ctx.titles[0]})`,
        ]);
    }
    if (ctx.debutNational) {
        return rng.pick([
            `Debut soñado: ${who} viste la camiseta de ${player.nationality}`,
            `${Who} es citado por la selección de ${player.nationality}`,
        ]);
    }
    if (ctx.seriousInjury) {
        return rng.pick([
            `Golpe duro: una lesión frena ${who === 'el' ? who : `a ${who}`}`,
            `${Who} pelea contra las lesiones esta temporada`,
        ]);
    }
    if (ctx.movedFrom) {
        return `${Who} llega a ${clubName} y arranca una nueva etapa`;
    }
    if (ctx.stats.tries >= 10) {
        return rng.pick([
            `${Who} imparable: ${ctx.stats.tries} tries en la temporada`,
            `${Who} rompe redes con ${ctx.stats.tries} tries`,
        ]);
    }
    if (ctx.rating >= 8.2) {
        return `Temporadón ${who === 'el' ? '' : 'de '}${who} en ${clubName}`;
    }
    if (ctx.rating < 6.2) {
        return `Temporada gris para ${who} en ${clubName}`;
    }
    return rng.pick([
        `${Who} sigue sumando rodaje en ${clubName}`,
        `Temporada correcta ${who.startsWith('la') ? 'de ' : 'del '}${who.replace(/^(el|la) /, '')} en ${clubName}`,
        `${Who} aporta de a poco en ${clubName}`,
    ]);
}
