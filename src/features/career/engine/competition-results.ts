// Resolución MÍNIMA, pura y seedeada del resultado deportivo de un club.
//
// Separa explícitamente las cuatro cosas que antes estaban mezcladas:
//   1. CLASIFICACIÓN → competitions2026.qualifiesFor (posición final / plazas)
//   2. PARTICIPACIÓN → competitions2026.participatingCompetitions
//   3. RESULTADO     → este archivo (posición final de liga / ganador de copa)
//   4. TÍTULO        → solo si el resultado es "campeón"
//
// El rating influye en SIMULAR el resultado; nunca decide quién clasifica.
//
// Simplificación documentada: el motor solo simula la temporada del club del
// jugador. Para el resto del campo se usa la TABLA DE REFERENCIA del catálogo
// (orden por rating dentro de su competición), que hace las veces de "cómo
// terminaron la temporada anterior". Cuando el motor genere tablas completas,
// solo hay que reemplazar `referenceStanding`.

import type { ClubDef } from '../data/clubs.ts';
import { CLUBS, clubsByLeague } from '../data/clubs.ts';
import type { CompetitionDef, LeagueStanding } from '../data/clubs2026/competitions2026.ts';
import { getCompetition, qualifiesFor } from '../data/clubs2026/competitions2026.ts';
import { clubLeagueIdentity } from './competition-identity.ts';
import type { Rng } from './random.ts';

const DEFAULT_VOLATILITY = 6;

/**
 * Campo competitivo real de un club: contra quién se juega el título.
 * Para el catálogo internacional es su competición entera. Para AR/UY/CL es la
 * DIVISIÓN real que disputa (ej. "Top 14 de la URBA").
 *
 * REGLA CLAVE (fix títulos falsos): un club de un sistema paraguas SIN división
 * cargada NO se agrupa por `#t{tier}` — eso mezclaba uniones distintas en un
 * mismo campo y coronaba a clubes solitarios. Recibe una clave ÚNICA: queda
 * solo en su campo y `resolveLeagueFinish`/el motor NO le acreditan título
 * (la competición no está identificada). Nunca hay campeón cruzando uniones.
 */
export function fieldKeyOf(club: ClubDef): string {
    const identity = clubLeagueIdentity(club);
    return identity.identified ? identity.id : `${club.competitionId}#unresolved#${club.id}`;
}

/** Cantidad mínima de equipos para que una liga sea un torneo real con campeón. */
export const MIN_LEAGUE_FIELD = 2;

export function leagueFieldOf(club: ClubDef): ClubDef[] {
    const key = fieldKeyOf(club);
    return clubsByLeague(club.competitionId).filter((c) => fieldKeyOf(c) === key);
}

// Tabla de referencia por campo competitivo: orden por rating desc, desempate
// estable por id. Se calcula una sola vez; es pura (no consume RNG).
function buildReferenceStandings(): Map<string, LeagueStanding> {
    const byCompetition = new Map<string, ClubDef[]>();
    for (const club of CLUBS) {
        const key = fieldKeyOf(club);
        const list = byCompetition.get(key) ?? [];
        list.push(club);
        byCompetition.set(key, list);
    }

    const standings = new Map<string, LeagueStanding>();
    for (const clubs of byCompetition.values()) {
        const ordered = [...clubs].sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
        ordered.forEach((club, index) => {
            // `competitionId` sigue siendo el de la liga: es lo que leen las
            // reglas de clasificación a copas.
            standings.set(club.id, { competitionId: club.competitionId, position: index + 1, teams: ordered.length });
        });
    }
    return standings;
}

const REFERENCE_STANDINGS = buildReferenceStandings();

/** Posición de referencia del club (proxy de "cómo terminó la temporada pasada"). */
export function referenceStanding(club: ClubDef): LeagueStanding {
    return (
        REFERENCE_STANDINGS.get(club.id) ?? { competitionId: club.competitionId, position: 1, teams: 1 }
    );
}

/**
 * Posición de partida válida para el club: la última posición REAL si es de su
 * competición actual (si el jugador se mudó de liga ya no aplica), o la de
 * referencia.
 */
export function standingFor(club: ClubDef, last: LeagueStanding | null): LeagueStanding {
    if (last && last.competitionId === club.competitionId) return last;
    return referenceStanding(club);
}

function volatilityOf(competitionId: string): number {
    return getCompetition(competitionId)?.volatility ?? DEFAULT_VOLATILITY;
}

interface Scored {
    id: string;
    score: number;
}

// Puntaje de temporada de cada club del campo: fuerza + ruido seedeado. El club
// del jugador recibe además el aporte del propio jugador. El orden de iteración
// es estable (por id) para que la secuencia de RNG sea reproducible.
function scoreField(field: ClubDef[], volatility: number, rng: Rng, boostedClubId: string, boost: number): Scored[] {
    const ordered = [...field].sort((a, b) => a.id.localeCompare(b.id));
    const scored: Scored[] = ordered.map((club) => ({
        id: club.id,
        score: club.rating + rng.normal(0, volatility) + (club.id === boostedClubId ? boost : 0),
    }));
    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return scored;
}

/**
 * Resuelve la posición final del club en su liga. `boost` es el aporte del
 * jugador (rendimiento + empujes de decisiones), en puntos de rating.
 */
export function resolveLeagueFinish(club: ClubDef, rng: Rng, boost: number): LeagueStanding {
    const field = leagueFieldOf(club);
    if (field.length <= 1) {
        return { competitionId: club.competitionId, position: 1, teams: Math.max(1, field.length) };
    }
    const scored = scoreField(field, volatilityOf(club.competitionId), rng, club.id, boost);
    const position = scored.findIndex((s) => s.id === club.id) + 1;
    return {
        competitionId: club.competitionId,
        position: position > 0 ? position : field.length,
        teams: field.length,
    };
}

/**
 * Campo real de una copa: todos los clubes que CLASIFICAN. Para el club del
 * jugador se usa su posición real; para el resto, la tabla de referencia.
 */
export function cupField(comp: CompetitionDef, playerClub: ClubDef, playerStanding: LeagueStanding): ClubDef[] {
    return CLUBS.filter((club) =>
        qualifiesFor(comp, club, club.id === playerClub.id ? playerStanding : referenceStanding(club)),
    );
}

/**
 * Resuelve el campeón de una copa entre los clubes que efectivamente clasificaron.
 * Participar NO es ganar: con un campo fuerte, ganar es poco frecuente.
 */
export function resolveCupWinner(
    comp: CompetitionDef,
    field: ClubDef[],
    rng: Rng,
    boostedClubId: string,
    boost: number,
): string | null {
    if (field.length === 0) return null;
    if (field.length === 1) return field[0].id;
    return scoreField(field, comp.volatility, rng, boostedClubId, boost)[0].id;
}
