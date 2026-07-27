import type { Player, PlayerRole } from '../types/player.ts';
import type { SeasonStats } from '../types/season.ts';
import { emptyStats } from '../types/season.ts';
import type { CareerState, CareerSummary, ClubSpell } from '../types/career.ts';
import { getPosition } from '../data/positions.ts';
import type { Rng } from './random.ts';
import type { EmploymentStatus, SquadTrack } from './contracts.ts';
import type { SeasonEnvironment } from './environment.ts';

// Fracción de las fechas DEL EQUIPO que el jugador llega a disputar según su
// rol. No son partidos garantizados: después pesan lesiones y contrato.
const ROLE_SHARE: Record<PlayerRole, number> = { starter: 0.82, rotation: 0.58, fringe: 0.28 };
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
): SeasonPerformance {
    const pos = getPosition(player.position);
    const role = player.role;

    // Apariciones = fechas DEL EQUIPO × rol × contrato × disponibilidad.
    // Las copas suman algunos partidos, no se cuentan como fechas de liga.
    const availability = Math.max(0.1, 1 - seasonsOutFraction);
    const leagueSlots = environment.teamMatchesAvailable;
    const cupSlots = Math.round(cupCount * 4 * ROLE_SHARE[role]);

    // IRRUPCIÓN del juvenil de desarrollo: la mayoría de sus temporadas son de
    // pocas apariciones, pero de vez en cuando un pibe se gana minutos y tiene
    // una temporada de 10-16 partidos. Determinístico (sale del RNG seedeado).
    const breakout = player.squadTrack === 'development' && rng.chance(0.18) ? 2.6 : 1;
    const share = ROLE_SHARE[role] * EMPLOYMENT_SHARE[player.employment] * TRACK_SHARE[player.squadTrack] * breakout;
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
        // Éxito según técnica + patada del jugador.
        const acc = 0.55 + (player.attributes.kick + player.attributes.technique) / 2 / 100 * 0.35;
        stats.kicksMade = Math.min(stats.kicksAtGoal, Math.round(stats.kicksAtGoal * rng.float(acc - 0.08, acc + 0.06)));
        stats.metresKicked = sampleTotal(pos.stats.metresKicked, matches, ovrFactor, rng);
    } else {
        stats.metresKicked = sampleTotal(pos.stats.metresKicked, matches, ovrFactor, rng);
    }

    // Rating: centrado en OVR efectivo, ± forma y ruido.
    const base = 5.4 + (effectiveOvr - 55) * 0.045 + player.dynamics.form * 0.006;
    const rating = Math.max(4.8, Math.min(9.9, Math.round(rng.normal(base, 0.4) * 10) / 10));

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
        spell.titles += s.titles.length;
        spell.tries += s.stats.tries;
        spellByClub.set(s.club, spell);

        for (const title of s.titles) honours.add(title);
    }

    if ((player.flags['campeon_mundo'] ?? 0) > 0) honours.add('Campeón del Mundo');
    else if ((player.flags['finalista_mundial'] ?? 0) > 0) honours.add('Finalista del Mundial');
    if ((player.flags['salon_fama'] ?? 0) > 0) honours.add('Salón de la Fama');
    if ((player.flags['capitan_nacional'] ?? 0) > 0) honours.add('Capitán de la selección');

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
        byClub: [...spellByClub.values()].sort((a, b) => b.seasons - a.seasons),
        honours: [...honours],
        retirementReason: player.retirementReason,
        careerScore,
        finalXI,
    };
}
