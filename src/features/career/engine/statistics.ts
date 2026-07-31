import type { Player, PlayerRole } from '../types/player.ts';
import type { SeasonStats } from '../types/season.ts';
import { computePoints, emptyStats } from '../types/season.ts';
import type { CareerState, CareerSummary, ClubSpell } from '../types/career.ts';
import { getPosition } from '../data/positions.ts';
import type { Rng } from './random.ts';
import { hashSeed, rngFromState } from './random.ts';
import type { EmploymentStatus, SquadTrack } from './contracts.ts';
import { employmentRank } from './contracts.ts';
import type { SeasonEnvironment } from './environment.ts';
import { careerArchetype } from './archetypes.ts';

// LA FRACCIÓN DE FECHAS YA NO SALE DE UNA TABLA POR ROL.
//
// Acá vivía `ROLE_SHARE = { starter: 0.82, rotation: 0.58, fringe: 0.28 }`: tres
// números fijos que hacían que el jugador jugara casi lo mismo estuviera donde
// estuviera, y con eso apagaban la decisión más importante del juego — si aceptar
// la oferta del club grande no cuesta partidos, no es una decisión.
//
// Ahora sale de `valor − rating del club` (`engine/squad-role.ts`), en cinco
// bandas, y el llamador lo pasa resuelto.
const ROLE_AVG_MIN: Record<PlayerRole, number> = { starter: 72, rotation: 48, fringe: 28 };

// El contrato de DESARROLLO es el caso clave: entrena en entorno profesional
// pero disputa pocos partidos senior. Los demás apenas ajustan.
// El TRACK de desarrollo es el caso clave: entrena en entorno profesional pero
// disputa pocos partidos senior. El empleo apenas ajusta.
const TRACK_SHARE: Record<SquadTrack, number> = { development: 0.9, senior: 1 };
const EMPLOYMENT_SHARE: Record<EmploymentStatus, number> = {
    amateur: 1, 'amateur-compensated': 1, 'semi-professional': 0.95, 'full-time-professional': 1,
};

export interface SeasonPerformance {
    matches: number;
    minutes: number;
    rating: number;
    stats: SeasonStats;
}

// Escala una tasa por partido → total de temporada, con OVR efectivo y ruido.
function sampleTotal(perMatch: number, matches: number, ovrFactor: number, rng: Rng): number {
    if (perMatch <= 0 || matches <= 0) return 0;
    const mean = perMatch * matches * ovrFactor;
    const sd = Math.sqrt(Math.max(0.5, mean)) * 0.9;
    return Math.max(0, Math.round(rng.normal(mean, sd, 0)));
}

/**
 * Simula el rendimiento de la temporada. `seasonsOutFraction` recorta partidos
 * por lesión. El OVR efectivo mueve tanto el volumen (más partidos/minutos) como
 * la eficiencia (más tries, mejor rating).
 */
export function simulateSeason(
    player: Player,
    effectiveOvr: number,
    seasonsOutFraction: number,
    rng: Rng,
    environment: SeasonEnvironment,
    cupCount = 0,
    /** Semilla de la carrera + índice de temporada: siembran el rng de detalle. */
    careerSeed = 0,
    seasonIndex = 0,
    /**
     * Fracción de las fechas del equipo que le toca por su lugar en el plantel,
     * ya resuelta desde `valor − rating del club` (`engine/squad-role.ts`). Se
     * pasa en vez de derivarse acá porque acá no está el club.
     *
     * El default es la banda de rotación: es lo que usan los tests que llaman a
     * esta función sin club, y deja el comportamiento explícito en vez de
     * escondido en un `?? 0.58`.
     */
    matchShare: readonly [number, number] = [0.40, 0.60],
): SeasonPerformance {
    const pos = getPosition(player.position);
    const role = player.role;

    // Apariciones = fechas DEL EQUIPO × lugar en el plantel × contrato ×
    // disponibilidad. Las copas suman algunos partidos, no fechas de liga.
    const availability = Math.max(0.1, 1 - seasonsOutFraction);
    const leagueSlots = environment.teamMatchesAvailable;
    // La fracción concreta de la banda sale del rng: dos temporadas en el mismo
    // club con el mismo valor no dan exactamente los mismos partidos.
    const roleShare = rng.float(matchShare[0], matchShare[1]);
    const cupSlots = Math.round(cupCount * 4 * roleShare);

    // IRRUPCIÓN del juvenil de desarrollo: la mayoría de sus temporadas son de
    // pocas apariciones, pero de vez en cuando un pibe se gana minutos y tiene
    // una temporada de 10-16 partidos. Determinístico (sale del RNG seedeado).
    const breakout = player.squadTrack === 'development' && rng.chance(0.18) ? 2.6 : 1;
    const share = roleShare * EMPLOYMENT_SHARE[player.employment] * TRACK_SHARE[player.squadTrack] * breakout;
    const matches = Math.max(
        1,
        Math.min(
            leagueSlots + cupSlots,
            Math.round((leagueSlots * share + cupSlots * availability) * availability * rng.float(0.88, 1.08)),
        ),
    );
    const minutes = Math.round(matches * ROLE_AVG_MIN[role] * rng.float(0.9, 1.05));

    // Factor de eficiencia centrado en OVR 70 (jugador competitivo).
    const ovrFactor = Math.max(0.35, effectiveOvr / 70);

    const stats: SeasonStats = emptyStats();
    stats.tries = sampleTotal(pos.stats.tries, matches, ovrFactor, rng);
    stats.tackles = sampleTotal(pos.stats.tackles, matches, Math.max(0.6, ovrFactor * 0.9), rng);
    stats.metres = sampleTotal(pos.stats.metres, matches, ovrFactor, rng);
    stats.assists = sampleTotal(pos.stats.assists, matches, ovrFactor, rng);
    stats.lineBreaks = sampleTotal(pos.stats.lineBreaks, matches, ovrFactor, rng);
    stats.turnovers = sampleTotal(pos.stats.turnovers, matches, ovrFactor, rng);
    stats.lineoutsWon = sampleTotal(pos.stats.lineoutsWon, matches, Math.max(0.7, ovrFactor * 0.85), rng);

    if (pos.stats.goalKicker) {
        stats.kicksAtGoal = sampleTotal(pos.stats.kicksAtGoal, matches, 1, rng);
        // Éxito según técnica + patada del jugador. Calibrado sobre lo real: los
        // mejores pateadores de test andan en 75-80% a lo largo de una carrera,
        // así que el techo del apertura de élite queda ahí y no en 85%. Un
        // pateador medio ronda 68-70%.
        const acc = 0.50 + (player.attributes.kick + player.attributes.technique) / 2 / 100 * 0.32;
        stats.kicksMade = Math.min(stats.kicksAtGoal, Math.round(stats.kicksAtGoal * rng.float(acc - 0.08, acc + 0.06)));
        stats.metresKicked = sampleTotal(pos.stats.metresKicked, matches, ovrFactor, rng);
    } else {
        stats.metresKicked = sampleTotal(pos.stats.metresKicked, matches, ovrFactor, rng);
    }

    // Rating: centrado en OVR efectivo, ± forma y ruido.
    const base = 5.4 + (effectiveOvr - 55) * 0.045 + player.dynamics.form * 0.006;
    const rating = Math.max(4.8, Math.min(9.9, Math.round(rng.normal(base, 0.4) * 10) / 10));

    // ── Detalle de planilla, en un RNG APARTE ───────────────────────────────
    // Todo lo de abajo se sortea con un rng RE-SEMBRADO desde una clave
    // descriptiva, NO con el rng principal. El motivo es concreto: si estas
    // tiradas salieran del stream principal, correrían todo lo que viene
    // después (clubes, lesiones, convocatorias) y una carrera vieja dejaría de
    // reproducirse. Así el desglose es igual de determinístico y el stream
    // principal queda intacto.
    const detailRng = rngFromState(hashSeed(`${careerSeed}:stats-detail:${seasonIndex}`));

    stats.scrumsWon = sampleTotal(pos.stats.scrumsWon, matches, Math.max(0.7, ovrFactor * 0.9), detailRng);

    // Desglose del pie. Una conversión vale 2 y un penal 3, así que sin separar
    // no hay forma de contar los puntos. La partición es EXACTA por
    // construcción: penales = lo que queda, nunca se pierde ni se inventa una.
    // Un pilar tiene kicksMade 0 y las tres salen 0 solas: no hay piso artificial.
    const conversionShare = detailRng.float(0.48, 0.68);
    stats.conversionsMade = Math.round(stats.kicksMade * conversionShare);
    stats.penaltiesMade = stats.kicksMade - stats.conversionsMade;

    // Los drops van FUERA de kicksAtGoal: se patean en juego, no desde un tiro
    // fijo. Son raros incluso para un apertura titular de toda la temporada.
    stats.dropGoals = pos.stats.goalKicker
        ? Math.max(0, Math.round(detailRng.normal(matches * 0.035, 0.85, 0)))
        : 0;

    stats.points = computePoints(stats);

    return { matches, minutes, rating, stats };
}

export function accumulateStats(into: SeasonStats, from: SeasonStats): void {
    into.tries += from.tries;
    into.tackles += from.tackles;
    into.metres += from.metres;
    into.assists += from.assists;
    into.lineBreaks += from.lineBreaks;
    into.turnovers += from.turnovers;
    into.kicksAtGoal += from.kicksAtGoal;
    into.kicksMade += from.kicksMade;
    into.lineoutsWon += from.lineoutsWon;
    into.metresKicked += from.metresKicked;
    into.scrumsWon += from.scrumsWon;
    into.conversionsMade += from.conversionsMade;
    into.penaltiesMade += from.penaltiesMade;
    into.dropGoals += from.dropGoals;
    // Los puntos se ACUMULAN, no se recalculan: una carrera vieja tiene que
    // seguir sumando lo que sumaba aunque cambie la regla de puntuación.
    into.points += from.points;
}

/** Agrega toda la carrera en un resumen compartible (con score para leaderboard). */
export function buildCareerSummary(state: CareerState): CareerSummary {
    const player = state.player;
    const seasons = state.seasons;

    const totals = emptyStats();
    let peakOvr = 0;
    let totalMatches = 0;
    let totalMinutes = 0;
    let ratingWeight = 0;
    let ratingSum = 0;

    const spellByClub = new Map<string, ClubSpell>();
    const honours = new Set<string>();
    // Cuántas veces se ganó CADA torneo. Sin esto, tres Super Rugby Americas se
    // colapsaban en una sola ficha y la vitrina contradecía al contador de
    // títulos, que decía 3.
    const titleCount = new Map<string, number>();

    // Edad del primer contrato profesional: es lo que separa al que llegó tarde
    // del que ya nació adentro. Sale de la trayectoria congelada, que guarda el
    // `employment` de cada temporada — no se recalcula desde el catálogo.
    const firstProfessionalAge = state.history.find(
        (h) => h.employment === 'full-time-professional',
    )?.age ?? null;

    // Techo de empleo alcanzado. El escalafón puede BAJAR al final de la carrera
    // (se pierde el profesionalismo de a un escalón), así que el retiro no dice
    // hasta dónde llegó: hay que mirar toda la trayectoria.
    const peakEmployment = state.history.reduce<EmploymentStatus>(
        (peak, h) => (employmentRank(h.employment) > employmentRank(peak) ? h.employment : peak),
        player.employment,
    );

    // Caps ganados MIENTRAS el tipo laburaba de otra cosa, y sólo si DEBUTÓ así.
    //
    // Las dos condiciones son necesarias y la segunda se descubrió midiendo: sin
    // ella entraba el veterano que llegó a la selección siendo profesional y
    // termina la carrera en un club amateur, que sigue siendo internacional
    // porque la unión ya lo capturó. Esa es una historia real —y correcta— pero
    // es la opuesta a la que el arquetipo quiere contar: no es el que llegó
    // desde abajo, es el que bajó desde arriba.
    //
    // Es DERIVADO: se cruza la temporada con el vínculo que tenía esa temporada,
    // así que no invalida ninguna partida guardada.
    const esAmateur = (i: number) => {
        const employment = state.history[i]?.employment;
        return employment === 'amateur' || employment === 'amateur-compensated';
    };
    const primerCap = state.seasons.findIndex((s) => s.capsGained > 0);
    const debutoAmateur = primerCap >= 0 && esAmateur(primerCap);
    const capsAsAmateur = !debutoAmateur ? 0 : state.seasons.reduce(
        (sum, s, i) => (esAmateur(i) ? sum + s.capsGained : sum),
        0,
    );

    for (const s of seasons) {
        accumulateStats(totals, s.stats);
        peakOvr = Math.max(peakOvr, s.ovrEnd);
        totalMatches += s.matches;
        totalMinutes += s.minutes;
        ratingSum += s.rating * s.matches;
        ratingWeight += s.matches;

        const spell = spellByClub.get(s.club) ?? { club: s.club, league: s.league, seasons: 0, matches: 0, titles: 0, tries: 0 };
        spell.seasons += 1;
        spell.matches += s.matches;
        // SÓLO LOS DE CLUB. Una etapa es "lo que hiciste en ese club", y desde que
        // existen los títulos de selección `s.titles` mezcla las dos cosas: un Seis
        // Naciones ganado mientras jugabas en Benfica se leería como un título de
        // Benfica. El torneo de tu selección no es mérito de tu club.
        spell.titles += s.titlesWon.filter((t) => t.scope !== 'national-team').length;
        spell.tries += s.stats.tries;
        spellByClub.set(s.club, spell);

        for (const title of s.titles) {
            honours.add(title);
            titleCount.set(title, (titleCount.get(title) ?? 0) + 1);
        }
    }

    // DISTINCIONES ≠ TÍTULOS. Un título es un torneo ganado y lo cuenta el
    // contador de títulos; ser capitán de la selección o entrar al salón de la
    // fama son logros y no salen de ninguna final. Mezclados, la vitrina
    // mostraba tres fichas debajo de un contador que decía 1.
    const distinctions = new Set<string>();
    if ((player.flags['campeon_mundo'] ?? 0) > 0) distinctions.add('Campeón del Mundo');
    else if ((player.flags['finalista_mundial'] ?? 0) > 0) distinctions.add('Finalista del Mundial');
    if ((player.flags['salon_fama'] ?? 0) > 0) distinctions.add('Salón de la Fama');
    if ((player.flags['capitan_nacional'] ?? 0) > 0) distinctions.add('Capitán de la selección');
    // Los tres de temporada. Las etiquetas van LITERALES y no armadas con el
    // contador, porque `premios.test.ts` las lee de este archivo con una regex
    // para verificar que cada una tenga ícono: un template literal la dejaría
    // ciega y el premio se dibujaría sin escudo sin que nada falle.
    if ((player.flags['mejor_jugador_mundo'] ?? 0) > 0) distinctions.add('Mejor jugador del mundo');
    if ((player.flags['xv_ideal'] ?? 0) > 0) distinctions.add('XV ideal del año');
    if ((player.flags['mejor_temporada_local'] ?? 0) > 0) distinctions.add('Mejor de la temporada local');

    const debutAge = seasons.length > 0 ? seasons[0].age : player.age;
    const retirementAge = player.age;
    const avgRating = ratingWeight > 0 ? Math.round((ratingSum / ratingWeight) * 10) / 10 : 0;

    const careerScore = Math.round(
        peakOvr * 40 +
            player.titles * 120 +
            player.caps * 8 +
            totals.tries * 6 +
            totals.assists * 2 +
            player.dynamics.fame * 3 +
            seasons.length * 15 +
            ((player.flags['campeon_mundo'] ?? 0) > 0 ? 1500 : 0) +
            ((player.flags['leyenda'] ?? 0) > 0 ? 400 : 0),
    );

    // 74 = techo real alcanzable por los mejores en la escala rebalanceada.
    const finalXI = (player.flags['capitan_nacional'] ?? 0) > 0
        || (player.nationalTeam !== null && seasons.slice(-3).some((s) => s.calledUp) && peakOvr >= 74);

    const byClub = [...spellByClub.values()].sort((a, b) => b.seasons - a.seasons);
    // "Super Rugby Americas ×3": la ficha dice cuántas veces, así la suma de la
    // vitrina cierra con el contador de títulos.
    const honourList = [...honours].map((title) => {
        const n = titleCount.get(title) ?? 1;
        return n > 1 ? `${title} ×${n}` : title;
    });
    const distinctionList = [...distinctions];

    return {
        nickname: player.nickname,
        position: player.position,
        nationality: player.nationality,
        debutAge,
        retirementAge,
        seasons: seasons.length,
        totalMatches,
        totalMinutes,
        caps: player.caps,
        titles: player.titles,
        peakOvr,
        avgRating,
        totals,
        byClub,
        honours: honourList,
        distinctions: distinctionList,
        retirementReason: player.retirementReason,
        careerScore,
        finalXI,
        archetype: careerArchetype({
            startRoute: state.startRoute,
            flags: player.flags,
            // Al arquetipo le llegan las dos listas juntas y SIN el "×3": para
            // decidir el titular de la carrera da lo mismo si el Salón de la
            // Fama es un título o una distinción, pero la regla lo busca por
            // nombre exacto. La separación y el contador son de la vitrina.
            honours: [...honours, ...distinctionList],
            seasons: seasons.length,
            caps: player.caps,
            titles: player.titles,
            peakOvr,
            clubsPlayed: byClub.length,
            firstProfessionalAge,
            peakEmployment,
            capsAsAmateur,
            retirementAge,
            // "Volver" exige haberse ido: el que nunca se movió ya tiene su
            // propio arquetipo y no puede quedarse también con este.
            finishedWhereStarted: state.history.length > 1
                && state.history[0].clubId === state.history[state.history.length - 1].clubId
                && byClub.length >= 2,
        }),
    };
}
