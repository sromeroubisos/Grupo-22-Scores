// EL CAPITÁN — la escalera del club.
//
// La primera de las dos escaleras, y la que define el final del juego: la
// cancha 1 con tu nombre se hace en un club, no en una selección.
//
// ── La ventana del amateur no cruza la frontera ──
// Es la regla §5 del CLAUDE.md y hay que respetarla acá: a un pibe de 18 en un
// club amateur no lo ficha por mercado abierto un club de otro continente.
// Mientras seas amateur, las ofertas salen de tu país y nada más. Se abre sola
// al profesionalizarte.
//
// Y ojo con el porqué, porque el síntoma engaña: el problema no es el peso de
// la cercanía sino el VOLUMEN del catálogo. Hay cientos de clubes argentinos en
// los escalones bajos y doce sudafricanos; cualquier ponderación que no sea una
// puerta termina mandando al pibe de Durban a la Tercera de la URBA. Cuando un
// mercado se desbalancea por volumen, la respuesta es una puerta y no un
// multiplicador más grande — el multiplicador se queda corto con el próximo
// catálogo nacional que entre.

import type { ClubDef } from '../data/catalogs.ts';
import type { CaptainPlayer, CaptainStage } from '../types/player.ts';
import type { ClubOffer } from '../types/captain.ts';
import type { Rng } from './random.ts';
import { CLUBS, getClub, clubLeague } from '../data/catalogs.ts';

/** Los niveles que cuentan como profesionales de verdad. */
const PRO_LEVELS = new Set(['elite-world', 'elite-pro', 'pro-second']);

/** Clubes donde puede empezar un pibe de 18: amateur o desarrollo. */
const START_LEVELS = new Set(['amateur', 'development', 'semipro']);

/**
 * Todos los clubes de un país, ORDENADOS DE FORMA ESTABLE.
 *
 * El `sort` no es decorativo: `CLUBS` es un array construido al cargar el
 * módulo, y elegir sobre él sin ordenar ata la carrera al orden de inserción
 * del catálogo, que es no-determinismo encubierto (CLAUDE.md §1).
 */
function clubsOfCountry(countryCode: string): ClubDef[] {
    return CLUBS
        .filter((c) => c.countryCode === countryCode)
        .sort((a, b) => a.id.localeCompare(b.id));
}

export function isProfessionalClub(club: ClubDef): boolean {
    return PRO_LEVELS.has(club.level);
}

/** La fuerza del club, que es contra lo que peleás el puesto. */
export function clubRatingOf(clubId: string | null): number {
    if (!clubId) return 45;
    return getClub(clubId).rating;
}

export function clubLabel(clubId: string | null): string {
    if (!clubId) return 'Sin club';
    return getClub(clubId).name;
}

export function competitionLabel(clubId: string | null): string {
    if (!clubId) return '';
    return clubLeague(clubId)?.labelEs ?? '';
}

/**
 * Dónde empieza un pibe de 18.
 *
 * En un club de su país y de los escalones de abajo. Nadie debuta en el Top 14:
 * se llega. Si el país no tiene clubes en el catálogo —pasa con las uniones
 * chicas— se devuelve `null` y la carrera arranca sin club, que es honesto.
 */
export function startingClub(countryCode: string, rng: Rng): string | null {
    const propios = clubsOfCountry(countryCode);
    if (propios.length === 0) return null;

    const abajo = propios.filter((c) => START_LEVELS.has(c.level));
    const pool = abajo.length > 0 ? abajo : propios;

    // Los más chicos son más probables: hay muchos más clubes de barrio que
    // clubes grandes, y ahí es donde empieza casi todo el mundo.
    const mayor = pool.reduce((max, c) => Math.max(max, c.rating), 0);
    return rng.weighted(pool, (c) => mayor - c.rating + 4).id;
}

/**
 * ¿Ganó el club su torneo?
 *
 * Una moneda pesada por la fuerza del club dentro de su competición. No hay
 * tabla de posiciones: el juego dura ocho minutos y una tabla de treinta
 * equipos que nadie mira no le agrega nada.
 */
export function wonCompetition(clubId: string | null, share: number, rng: Rng): boolean {
    if (!clubId) return false;
    const club = getClub(clubId);
    const rivales = CLUBS
        .filter((c) => c.competitionId === club.competitionId)
        .sort((a, b) => a.id.localeCompare(b.id));
    if (rivales.length < 2) return false;

    const mejor = rivales.reduce((max, c) => Math.max(max, c.rating), 0);
    // Un club diez puntos por debajo del mejor casi no gana; el mejor gana una
    // de cada tres. Y si vos no jugaste, el título es del club pero no tuyo.
    const base = Math.max(0.02, 0.34 - (mejor - club.rating) * 0.03);
    return rng.chance(base * (0.45 + share * 0.55));
}

export interface OfferContext {
    player: CaptainPlayer;
    stage: CaptainStage;
    /** Escalón representativo, para saber si te miran de afuera. */
    scouted: boolean;
    season: number;
}

/**
 * Qué clubes te quieren esta temporada.
 *
 * Devuelve como mucho dos ofertas, para que la decisión sea una decisión y no
 * un listado. La regla dura está arriba: mientras seas amateur, la ventana se
 * queda en tu país.
 */
export function generateOffers(ctx: OfferContext, rng: Rng): ClubOffer[] {
    const { player, stage } = ctx;
    const actual = player.clubId ? getClub(player.clubId) : null;
    const ratingActual = actual?.rating ?? 40;

    // Nadie te busca si no superaste a tu club, y nadie busca a un veterano
    // para hacerlo crecer.
    if (player.ovr < ratingActual + 3) return [];

    const puedeSalirDelPais = stage === 'professional' || ctx.scouted;
    const universo = puedeSalirDelPais
        ? [...CLUBS].sort((a, b) => a.id.localeCompare(b.id))
        : clubsOfCountry(player.countryCode);

    const candidatos = universo.filter((c) => {
        if (c.id === player.clubId) return false;
        // Que sea un paso adelante, pero alcanzable: nadie salta de la Tercera
        // de la URBA al Top 14 en una temporada.
        if (c.rating <= ratingActual) return false;
        if (c.rating > player.ovr + 6) return false;
        // Un club profesional solo aparece si ya sos profesional o si te vieron.
        if (isProfessionalClub(c) && stage !== 'professional' && !ctx.scouted) return false;
        return true;
    });

    if (candidatos.length === 0) return [];

    const cuantas = candidatos.length > 1 && rng.chance(0.35) ? 2 : 1;
    const elegidos: ClubDef[] = [];
    for (let i = 0; i < cuantas; i += 1) {
        const restantes = candidatos.filter((c) => !elegidos.some((e) => e.id === c.id));
        if (restantes.length === 0) break;
        // Los clubes que mejor te calzan son los más probables: los que están
        // apenas por encima tuyo.
        elegidos.push(rng.weighted(restantes, (c) => Math.max(1, 12 - Math.abs(c.rating - player.ovr))));
    }

    return elegidos.map((club) => ({
        clubId: club.id,
        kind: isProfessionalClub(club) ? 'professional' : 'amateur',
        salary: isProfessionalClub(club) ? salaryFor(club) : 0,
        season: ctx.season,
    }));
}

/**
 * El sueldo anual de un club profesional, en dólares.
 *
 * Los tramos son los reales, y los saltos son enormes a propósito: Super Rugby
 * Américas paga entre 14 y 18 mil al año —el escalón más bajo del
 * profesionalismo mundial— y el Top 14 promedia 223 mil para un wing y 343 mil
 * para un apertura. La gloria y la plata no viven en el mismo puesto.
 */
export function salaryFor(club: ClubDef): number {
    const porNivel: Record<string, [number, number]> = {
        'elite-world': [420_000, 900_000],
        'elite-pro': [150_000, 380_000],
        'pro-second': [60_000, 130_000],
        'pro-regional': [16_000, 34_000],
        semipro: [4_000, 12_000],
        development: [0, 0],
        amateur: [0, 0],
    };
    const [lo, hi] = porNivel[club.level] ?? [0, 0];
    if (hi === 0) return 0;
    // Dentro del nivel, el prestigio del club decide dónde caés.
    const t = Math.min(1, Math.max(0, (club.rating - 55) / 35));
    return Math.round((lo + (hi - lo) * t) / 500) * 500;
}
