import type { CareerMilestone, CareerState } from '../types/career.ts';
import type { Player } from '../types/player.ts';
import type { SeasonCompetitionParticipation, SeasonResult } from '../types/season.ts';
import { getPosition } from '../data/positions.ts';
import type { ClubDef } from '../data/clubs.ts';
import { getClub } from '../data/clubs.ts';
import { secondaryStatOf } from '../data/guides.ts';
import { economicModelOf, sportingBandOf } from '../data/competition-levels2026.ts';
import { renewContract } from './contracts.ts';
import { marketValue } from './club-offers.ts';
import { participatingCompetitions, type TitleWon } from '../data/clubs2026/competitions2026.ts';
import { CATALOG_SEASON } from '../data/clubs2026/rosters2026.ts';
import type { Rng } from './random.ts';
import { MIN_LEAGUE_FIELD, cupField, resolveCupWinner, resolveLeagueFinish, standingFor } from './competition-results.ts';
import { clubLeagueIdentity } from './competition-identity.ts';
import { computeOvr, computeEffectiveOvr } from './scoring.ts';
import { applyAging, growthScaleFor } from './aging.ts';
import { advanceRegistration } from './eligibility.ts';
import { computeSeasonLoad, deriveEnvironment, seasonInjuryRisk } from './environment.ts';
import { rollInjury } from './injuries.ts';
import { roleAtClub } from './club-offers.ts';
import { simulateSeason as simulatePerformance } from './statistics.ts';
import { evaluateNationalTeam } from './national-team.ts';
import { canRepresent, targetUnion } from './eligibility.ts';
import { makeHeadline } from './headlines.ts';

function clamp01_100(v: number): number {
    return Math.max(0, Math.min(100, v));
}

/**
 * Simula UNA temporada completa. Muta `state.player` y agrega el SeasonResult.
 * Se llama después de resolver el evento pendiente (si hubo).
 */
export function simulateSeason(state: CareerState, rng: Rng, movedFrom: string | null = null): SeasonResult {
    const p: Player = state.player;
    const pos = getPosition(p.position);
    const group = pos.group;
    const club = getClub(p.club);
    const clubPrestige = club.prestige;

    const ovrStart = computeOvr(p.attributes, p.position);

    // 0) ENTORNO de la temporada: entrenamiento, intensidad, soporte, vida,
    //    viajes y exposición. Se deriva del club + contrato + edad + rol.
    const standingForCups = standingFor(club, state.lastStanding);
    const cupCount = participatingCompetitions(club, standingForCups).filter((c) => c.kind !== 'league').length;
    const environment = deriveEnvironment({
        club,
        employment: p.employment,
        squadTrack: p.squadTrack,
        age: p.age,
        role: p.role,
        severeInjuries: p.injuries.filter((i) => i.severity === 'grave').length,
        cupCount,
        international: p.nationalTeam !== null,
    });

    // 1) Envejecimiento: el entorno modula CUÁNTO rinde el trabajo, no el techo.
    //    Se separan los aportes para no contar dos veces forma/fatiga/edad.
    // Calibrado para que un entorno medio valga ~1.0: el amateur queda cerca de
    // 0.8 (progresa, pero más lento) y el profesional/desarrollo cerca de 1.25.
    const environmentSupport = 0.72 + environment.trainingQuality * 0.50 + environment.trainingLoad * 0.16;
    const loadPenaltyFactor = 1 - environment.lifeLoad * 0.14;
    // Empuje juvenil: hasta los 23 el desarrollo es MÁS marcado (un pibe sano y
    // con techo crece de forma visible, no de a +0/+1). El potencial sigue siendo
    // el techo: `growthScaleFor` se apaga solo al acercarse a él, sin overshoot.
    const youthDrive = p.age <= 20 ? 1.22 : p.age <= 23 ? 1.1 : 1;
    // Variación REAL temporada a temporada: la mayoría cerca de 1, con
    // irrupciones (crecimiento fuerte) y amesetamientos. Determinístico (RNG
    // seedeado): dos jugadores iguales NO tienen la misma curva, y un mismo
    // jugador no repite +0 mecánicamente todos los años.
    const developmentRoll = rng.normal(1, 0.22, 0.6, 1.5);
    const growthScale = growthScaleFor(ovrStart, p.potential)
        * environmentSupport * loadPenaltyFactor * youthDrive * developmentRoll;
    const attributeDeltas = applyAging(p.attributes, p.age, group, rng, growthScale);

    // 2) Rol de la temporada según nivel actual vs club.
    p.role = roleAtClub(computeEffectiveOvr(p), clubPrestige);

    // 3) Lesión de la temporada: el riesgo sale de la CARGA y de su SALTO
    //    respecto del año anterior, no del enum de contrato.
    const provisionalLoad = computeSeasonLoad(environment, Math.round(environment.teamMatchesAvailable * 0.55), p.role, state.previousSeasonLoad, p);
    const rolled = rollInjury(p, rng, seasonInjuryRisk(provisionalLoad, environment, p));
    const seasonInjuries = p.injuries.filter((i) => i.season === p.seasonsPlayed);
    const seasonsOutFraction = Math.min(0.9, seasonInjuries.reduce((sum, i) => sum + i.seasonsOut, 0));
    const seriousInjury = seasonInjuries.some((i) => i.severity === 'grave');

    // Regresión por lesión grave: el cuerpo paga. Baja atributos físicos, así que
    // el OVR de la temporada puede CAER aunque el jugador entrene (spec §9).
    if (seriousInjury) {
        for (const key of ['power', 'speed', 'stamina'] as const) {
            p.attributes[key] = Math.max(1, p.attributes[key] - rng.float(1.5, 3.2));
        }
    }

    // 4) OVR efectivo + rendimiento (planilla, partidos, minutos, rating).
    const effectiveOvr = computeEffectiveOvr(p);
    // `state.seed` y la temporada siembran el rng de detalle de planilla, que va
    // aparte para no correr el stream principal (ver statistics.ts).
    const perf = simulatePerformance(p, effectiveOvr, seasonsOutFraction, rng, environment, cupCount, state.seed, p.seasonsPlayed);

    // 4b) Registro y presencia de la temporada en la unión del país del club
    //     (Reg. 8.1(c)/(d)). Las franquicias multinacionales ('multi') no
    //     atribuyen registro a ninguna unión concreta. Cambiar de club dentro
    //     del mismo país NO corta la continuidad; cambiar de país sí.
    advanceRegistration(p.eligibility, club.countryCode === 'multi' ? null : club.countryCode);

    // 5) Selección nacional (en paralelo al club) + bonus de decisiones. El
    //    bonus de un evento SOLO cuenta si el jugador puede representar a una
    //    unión: un país sin unión modelada no suma caps por una decisión.
    const nt = evaluateNationalTeam(p, effectiveOvr, rng);
    const union = targetUnion(p.eligibility);
    const eligibleForCaps = union !== null && canRepresent(p.eligibility, union);
    const capBoost = eligibleForCaps ? state.pendingCapBoost : 0;
    const capsGained = nt.capsGained + capBoost;
    if (capBoost > 0) p.caps += capBoost;
    const calledUp = nt.calledUp || capBoost > 0;

    // 6) Competiciones: ELEGIBLE → CLASIFICADO → INSCRIPTO → SIMULADO → CAMPEÓN
    //    → TÍTULO DEL CLUB → (con apariciones senior) TÍTULO DEL JUGADOR.
    //    Cada etapa es explícita; ninguna se colapsa. Clasificar no regala nada.
    //
    //    DISPUTA SENIOR: un juvenil de desarrollo que no debutó no "jugó" nada.
    //    Es la puerta que separa el título del CLUB del título del JUGADOR.
    const MIN_SENIOR_APPEARANCES = 3;
    const disputedSenior = p.squadTrack === 'senior' || perf.matches >= MIN_SENIOR_APPEARANCES;
    const playerAppearances = disputedSenior ? perf.matches : 0;
    const competitiveBand = disputedSenior ? sportingBandOf(club) : 0;
    p.competitiveBandReached = Math.max(p.competitiveBandReached, competitiveBand);

    const titles: string[] = []; // etiquetas de títulos DEL JUGADOR (para mostrar)
    const titlesWon: TitleWon[] = []; // títulos DEL JUGADOR
    const clubTitlesWon: TitleWon[] = []; // títulos DEL CLUB (institucionales)
    const participations: SeasonCompetitionParticipation[] = [];
    const roleFactor = p.role === 'starter' ? 1 : p.role === 'rotation' ? 0.55 : 0.25;

    // Aporte del jugador al rendimiento del club, en puntos de rating: pesa poco
    // (es uno entre treinta) pero una gran temporada de la figura mueve la aguja.
    const playerBoost = (perf.rating - 7) * roleFactor * 1.8 + state.pendingTitleBoost * 14;

    const standing = standingFor(club, state.lastStanding);
    const competitions = participatingCompetitions(club, standing);
    const leagueIdentity = clubLeagueIdentity(club);

    // 6a) LIGA PRIMARIA (una por temporada). El título es terminar 1º, pero solo
    //     si la competición está IDENTIFICADA (un club de sistema paraguas sin
    //     división resoluble no gana nada) y hay un campo real (no un club solo).
    const finish = resolveLeagueFinish(club, rng, playerBoost);
    const league = competitions.find((c) => c.kind === 'league');
    const leagueChampion = leagueIdentity.identified && finish.position === 1 && finish.teams >= MIN_LEAGUE_FIELD;
    if (league) {
        const cat: TitleWon['category'] = 'league';
        if (leagueChampion) {
            clubTitlesWon.push({ competitionId: leagueIdentity.id, season: CATALOG_SEASON, club: p.club, category: cat, scope: league.scope });
            if (disputedSenior) {
                titles.push(leagueIdentity.name);
                titlesWon.push({ competitionId: leagueIdentity.id, season: CATALOG_SEASON, club: p.club, category: cat, scope: league.scope });
            }
        }
        // El jugador SIEMPRE disputa su liga primaria (entered:true), pero solo
        // se corona campeón si la competición está IDENTIFICADA (una división sin
        // resolver no otorga título: se registra en el ledger sin campeón).
        participations.push({
            competitionId: leagueIdentity.id,
            competitionName: leagueIdentity.name,
            role: 'primary-league',
            entered: true,
            playerAppearances,
            result: leagueChampion ? 'champion' : finish.position <= 2 ? 'runner-up' : 'regular-season',
            clubWon: leagueChampion,
            playerCredited: leagueChampion && disputedSenior,
        });
    }

    // 6b) COPAS: se disputan contra el campo REAL de clasificados. El título del
    //     jugador exige, además de ganar, haber disputado la temporada senior.
    for (const comp of competitions) {
        if (comp.kind === 'league') continue;
        const field = cupField(comp, club, standing);
        const winner = resolveCupWinner(comp, field, rng, club.id, playerBoost);
        const clubWon = winner === club.id;
        const cupApps = disputedSenior ? Math.max(1, Math.round(perf.matches * 0.25)) : 0;
        if (clubWon) {
            clubTitlesWon.push({ competitionId: comp.id, season: CATALOG_SEASON, club: p.club, category: comp.kind, scope: comp.scope });
            if (disputedSenior) {
                titles.push(comp.label);
                titlesWon.push({ competitionId: comp.id, season: CATALOG_SEASON, club: p.club, category: comp.kind, scope: comp.scope });
            }
        }
        participations.push({
            competitionId: comp.id,
            competitionName: comp.label,
            role: comp.scope === 'continental' ? 'continental-cup' : comp.scope === 'regional' ? 'regional-cup' : 'domestic-cup',
            entered: true,
            playerAppearances: cupApps,
            result: clubWon ? 'champion' : 'eliminated',
            clubWon,
            playerCredited: clubWon && disputedSenior,
        });
    }

    const competitionsPlayed = participations.filter((x) => x.entered).map((x) => x.competitionId);

    state.lastStanding = finish;
    p.titles += titles.length;

    // 7) Deriva de variables dinámicas.
    p.dynamics.form = clamp01_100(p.dynamics.form * 0.5 + (50 + (perf.rating - 7) * 6) * 0.5);
    p.dynamics.fatigue = clamp01_100(p.dynamics.fatigue * 0.45 + perf.matches * 1.5 + Math.max(0, p.age - 30) * 1.5);
    p.dynamics.morale = clamp01_100(
        p.dynamics.morale * 0.7 + 55 * 0.3 + (perf.rating - 7) * 3 + titles.length * 6 - (seriousInjury ? 8 : 0),
    );
    p.dynamics.fame = clamp01_100(
        p.dynamics.fame * 0.96 + perf.stats.tries * 0.4 + titles.length * 4 + capsGained * 0.8 + (clubPrestige > 70 ? 2 : 0),
    );
    p.dynamics.injuryRisk = clamp01_100(p.dynamics.injuryRisk + Math.max(0, p.age - 31) * 0.8);

    // Tope duro de progresión por temporada: ningún entorno justifica un salto
    // absurdo de OVR de un año a otro. Es un LÍMITE DE SEGURIDAD, no un objetivo.
    // (Antes se bajaban los atributos pero NO se recomputaba el OVR registrado,
    // así que el tope no se cumplía en la planilla — se corrige recomputando.)
    const MAX_OVR_GAIN = 9;
    let ovrEnd = computeOvr(p.attributes, p.position);
    if (ovrEnd - ovrStart > MAX_OVR_GAIN) {
        const excess = ovrEnd - ovrStart - MAX_OVR_GAIN;
        for (const key of Object.keys(p.attributes) as (keyof typeof p.attributes)[]) {
            p.attributes[key] = Math.max(1, p.attributes[key] - excess);
        }
        ovrEnd = computeOvr(p.attributes, p.position);
    }

    // Carga real de la temporada (normalizada), para medir el salto de la próxima.
    const seasonLoad = computeSeasonLoad(environment, perf.matches, p.role, state.previousSeasonLoad, p);
    state.previousSeasonLoad = seasonLoad.currentSeasonLoad;

    // 7b) Situación al cierre. El empleo se GANA de a poco; el track gradúa a
    //     senior cuando el jugador ya rinde. Puede bajar por edad/lesión/rendimiento.
    const renewed = renewContract(
        { employment: p.employment, track: p.squadTrack },
        { club, age: p.age, value: marketValue(p, effectiveOvr), potential: p.potential, ovr: ovrEnd, role: p.role },
    );
    p.employment = renewed.employment;
    p.squadTrack = renewed.track;

    const headline = makeHeadline(
        {
            player: p,
            rating: perf.rating,
            matches: perf.matches,
            stats: perf.stats,
            titles,
            capsGained,
            debutNational: nt.debut,
            seriousInjury,
            movedFrom,
        },
        rng,
    );

    const result: SeasonResult = {
        seasonIndex: p.seasonsPlayed,
        age: p.age,
        club: p.club,
        league: p.league,
        role: p.role,
        position: p.position,
        ovrStart,
        ovrEnd,
        effectiveOvr,
        matches: perf.matches,
        minutes: perf.minutes,
        rating: perf.rating,
        titles,
        titlesWon,
        clubTitlesWon,
        leaguePosition: finish.position,
        leagueTeams: finish.teams,
        competitionsPlayed,
        participations,
        capsGained,
        calledUp,
        injuries: seasonInjuries,
        stats: perf.stats,
        attributeDeltas,
        headline,
        eventId: state.decisionLog.length > 0 && state.decisionLog[state.decisionLog.length - 1].seasonIndex === p.seasonsPlayed
            ? state.decisionLog[state.decisionLog.length - 1].eventId
            : null,
        decisionText: state.decisionLog.length > 0 && state.decisionLog[state.decisionLog.length - 1].seasonIndex === p.seasonsPlayed
            ? state.decisionLog[state.decisionLog.length - 1].text
            : null,
    };

    // 8) Avanzar el reloj y limpiar modificadores de la temporada.
    p.seasonsPlayed += 1;
    p.age += 1;
    state.pendingTitleBoost = 0;
    state.pendingCapBoost = 0;
    void rolled;

    state.seasons.push(result);

    // Snapshot HISTÓRICO congelado. Empleo/track/banda disputada son los de
    // ESTA temporada (ya renovados). `competitiveBand` y `normalizedLoad` se
    // pasan explícitos porque se computaron con datos locales.
    const secondary = secondaryStatOf(result.position, result.stats);
    const milestones = detectMilestones(state, result, club, competitiveBand);
    state.history.push({
        season: result.seasonIndex + 1,
        age: result.age,
        clubId: club.id,
        clubName: club.labelEs,
        competitionId: leagueIdentity.id,
        competitionName: leagueIdentity.name,
        sportingBand: sportingBandOf(club),
        competitiveBand,
        economicModel: economicModelOf(club),
        employment: p.employment,
        squadTrack: p.squadTrack,
        ovr: result.ovrEnd,
        ovrDelta: result.ovrEnd - result.ovrStart,
        appearances: result.matches,
        points: result.stats.points,
        tries: result.stats.tries,
        tackles: result.stats.tackles,
        secondaryStatLabel: secondary.label,
        secondaryStat: secondary.display,
        caps: result.capsGained,
        titlesWon: result.titlesWon,
        clubTitlesWon: result.clubTitlesWon,
        participations: result.participations,
        severeInjury: seriousInjury,
        milestones,
        normalizedLoad: seasonLoad.currentSeasonLoad,
    });
    return result;
}

// Rank de empleo para no re-registrar hitos "de subida" en un veterano que baja.
const EMP_RANK: Record<string, number> = {
    amateur: 0, 'amateur-compensated': 1, 'semi-professional': 2, 'full-time-professional': 3,
};

function detectMilestones(
    state: CareerState,
    result: SeasonResult,
    club: ClubDef,
    competitiveBand: number,
): CareerMilestone[] {
    const player = state.player;
    const reached = new Set(player.milestonesReached);
    const found: CareerMilestone[] = [];

    const add = (milestone: CareerMilestone) => {
        if (reached.has(milestone)) return;
        reached.add(milestone);
        found.push(milestone);
    };

    // Pico histórico de empleo: un hito "de subida" solo cuenta si es un empleo
    // que el jugador nunca tuvo (evita "primer compensado a los 34" en un ex-pro).
    const peakEmployment = Math.max(
        EMP_RANK[player.employment],
        ...state.history.map((h) => EMP_RANK[h.employment]),
    );

    if (result.seasonIndex === 0) add('senior-debut');
    if (peakEmployment >= EMP_RANK['amateur-compensated'] && player.employment === 'amateur-compensated') add('first-compensated');
    if (peakEmployment >= EMP_RANK['semi-professional'] && player.employment === 'semi-professional') add('first-semi-professional');
    if (player.employment === 'full-time-professional') add('first-professional');
    // "Élite" = banda DISPUTADA, no la del club (un juvenil de desarrollo no cuenta).
    if (competitiveBand >= 8) add('first-elite-competition');
    if (result.capsGained > 0) add('first-call-up');
    if (result.titlesWon.length > 0) add('first-title');

    const previous = state.history[state.history.length - 1];
    if (previous && previous.clubId !== club.id) {
        const previousClub = getClub(previous.clubId);
        if (previousClub.countryCode !== club.countryCode) add('international-transfer');
        const home = player.eligibility.nationalityCountryCode;
        if (home && club.countryCode === home && previousClub.countryCode !== home) add('return-home');
    }

    player.milestonesReached = [...reached];
    return found;
}

/** ¿El jugador se retira? Depende de edad, ventana por posición, nivel y estado. */
export function shouldRetire(player: Player, rng: Rng): boolean {
    const { soft, hard } = getPosition(player.position).retirement;
    if (player.age >= hard) return true;
    if (player.age < soft) return false;

    const eff = computeEffectiveOvr(player);
    let pressure = ((player.age - soft) / Math.max(1, hard - soft)) * 0.5;
    if (eff < 58) pressure += 0.2;
    if (player.dynamics.morale < 35) pressure += 0.15;
    if (player.injuries.filter((i) => i.severity === 'grave').length >= 2) pressure += 0.15;
    return rng.chance(Math.min(0.95, pressure));
}
