import type { CareerMilestone, CareerState } from '../types/career.ts';
import type { NationalStatus, Player } from '../types/player.ts';
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
import { applyAging, growthScaleFor, meritDrive } from './aging.ts';
import { peakShiftOf, profileGrowthFactor } from './development-profile.ts';
import { advanceRegistration } from './eligibility.ts';
import { computeSeasonLoad, deriveEnvironment, seasonInjuryRisk } from './environment.ts';
import { rollInjury } from './injuries.ts';
import { matchShareFor, playerRoleOf, roleAt } from './squad-role.ts';
import { adjustShare, applyStatBoost, banFraction, bannedMatches, playingTimeFactor } from './season-modifiers.ts';
import { applyDivisionMove, resolveClub } from './promotion.ts';
import { simulateSeason as simulatePerformance } from './statistics.ts';
import { evaluateNationalTeam, starterLevel } from './national-team.ts';
import { internationalTitlesFor } from './international-results.ts';
import { isWorldCupYear } from '../data/international-calendar.ts';
import { resolveWorldCup } from './world-cup.ts';
import { hashSeed, rngFromState } from './random.ts';
import { unionReputation } from '../data/nations.ts';
import { canRepresent, targetUnion } from './eligibility.ts';
import { makeHeadline } from './headlines.ts';
import { AWARD_FLAGS, evaluateSeasonAwards } from './awards.ts';

function clamp01_100(v: number): number {
    return Math.max(0, Math.min(100, v));
}

/**
 * Simula UNA temporada completa. Muta `state.player` y agrega el SeasonResult.
 * Se llama después de resolver el evento pendiente (si hubo).
 */
/**
 * Suma los tests de la temporada a la planilla de ESA unión.
 *
 * Las tasas por test salen del puesto, igual que las de club, pero un poco por
 * debajo: un test es contra los mejores quince del otro país, no contra un
 * equipo de liga. Todo con un rng re-sembrado desde `semilla:nt-stats:temporada`,
 * así que es determinístico y no toca el stream principal.
 */
function registerCaps(
    p: Player,
    union: string,
    caps: number,
    effectiveOvr: number,
    careerSeed: number,
    seasonIndex: number,
    status: NationalStatus,
): void {
    const pos = getPosition(p.position);
    const ntRng = rngFromState(hashSeed(`${careerSeed}:nt-stats:${seasonIndex}`));
    const factor = Math.max(0.35, effectiveOvr / 70) * 0.85;
    const total = (perMatch: number): number => {
        if (perMatch <= 0) return 0;
        const mean = perMatch * caps * factor;
        return Math.max(0, Math.round(ntRng.normal(mean, Math.sqrt(Math.max(0.5, mean)) * 0.9, 0)));
    };

    const bucket = p.nationalStats[union] ?? {
        caps: 0, squadCaps: 0, points: 0, tries: 0, tackles: 0, metres: 0, kicksAtGoal: 0, kicksMade: 0, wins: 0,
    };

    const tries = total(pos.stats.tries);
    const kicksAtGoal = pos.stats.goalKicker ? total(pos.stats.kicksAtGoal) : 0;
    const accuracy = 0.50 + (p.attributes.kick + p.attributes.technique) / 2 / 100 * 0.32;
    const kicksMade = Math.min(kicksAtGoal, Math.round(kicksAtGoal * ntRng.float(accuracy - 0.08, accuracy + 0.06)));
    // Puntos: try 5, conversión 2, penal 3. La partición del pie es la misma
    // proporción que usa la planilla de club, para que un mismo pateador no
    // rinda distinto según la camiseta.
    const conversions = Math.round(kicksMade * ntRng.float(0.48, 0.68));
    const penalties = kicksMade - conversions;

    bucket.caps += caps;
    // Los caps de gira (`trial`) NO cuentan para ganarse el descuento: si
    // contaran, el debutante acumularia caps baratos y se protegeria solo.
    if (status === 'squad' || status === 'starter') bucket.squadCaps += caps;
    bucket.tries += tries;
    bucket.tackles += total(pos.stats.tackles);
    bucket.metres += total(pos.stats.metres);
    bucket.kicksAtGoal += kicksAtGoal;
    bucket.kicksMade += kicksMade;
    bucket.points += tries * 5 + conversions * 2 + penalties * 3;
    // Tests ganados: la reputación de la unión dice cuánto suele ganar. No es
    // una simulación del partido — la selección corre en paralelo al club y no
    // tiene fixture propio — pero un cap de una potencia no vale lo mismo.
    const winRate = 0.34 + Math.max(0, Math.min(5, unionReputation(union))) * 0.08;
    bucket.wins += Math.round(caps * winRate);

    p.nationalStats[union] = bucket;
}

export function simulateSeason(state: CareerState, rng: Rng, movedFrom: string | null = null): SeasonResult {
    const p: Player = state.player;
    const pos = getPosition(p.position);
    const group = pos.group;
    // EL CLUB CON SU DIVISIÓN DE HOY, no la del catálogo: si ascendió o descendió,
    // esta temporada se juega donde el club terminó, y de la competición salen
    // solas la banda, la economía, las copas y el techo de contrato.
    const club = resolveClub(state, p.club);
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
        international: p.nationalStatus === 'squad' || p.nationalStatus === 'starter',
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
    // Rendir IMPORTA para crecer: la temporada pasada empuja o frena el
    // desarrollo. Antes de 1.9.0 el titular con gran rating y el suplente
    // crecían igual, que es justo lo contrario de cómo funciona el deporte.
    // Al club que anduvo bien se le reconoce: entrenar todo un año peleando el
    // título forma mejor que hacerlo en un equipo que terminó último. Sale de la
    // temporada anterior, que ya congela la posición y el tamaño de la liga.
    const previousSeason = state.seasons[state.seasons.length - 1];
    const merit = meritDrive(previousSeason && {
        rating: previousSeason.rating,
        role: previousSeason.role,
        leaguePosition: previousSeason.leaguePosition,
        teams: previousSeason.leagueTeams,
    });
    // PERFIL: el `early` explota de pibe y el `late` recién arranca a los 27.
    // Cambia el CUÁNDO de la curva, no el techo — eso sigue siendo `potential`.
    const profileFactor = profileGrowthFactor(p.developmentProfile, p.age);
    const growthScale = growthScaleFor(ovrStart, p.potential, p.position)
        * environmentSupport * loadPenaltyFactor * youthDrive * developmentRoll * merit * profileFactor;
    const attributeDeltas = applyAging(
        p.attributes, p.age, group, rng, growthScale, peakShiftOf(p.developmentProfile),
    );

    // 2) El rol de la temporada SE RESUELVE EN EL PASO 4, junto con los partidos,
    //    porque los dos salen de la misma resta (`valor − rating del club`).
    //    Calcularlo acá con `computeEffectiveOvr` contra `prestige` era medir otra
    //    cosa: `prestige` es el glamour que hace que un club te llame, `rating` es
    //    lo que hay que superar para jugar.

    // 3) Lesión de la temporada: el riesgo sale de la CARGA y de su SALTO
    //    respecto del año anterior, no del enum de contrato.
    const provisionalLoad = computeSeasonLoad(environment, Math.round(environment.teamMatchesAvailable * 0.55), p.role, state.previousSeasonLoad, p);
    const rolled = rollInjury(p, rng, seasonInjuryRisk(provisionalLoad, environment, p));
    const seasonInjuries = p.injuries.filter((i) => i.season === p.seasonsPlayed);
    // 3b) SUSPENSIÓN: los partidos que la disciplina se lleva de esta temporada
    //     entran por el mismo canal que la lesión —la DISPONIBILIDAD— y no
    //     restándole partidos a la planilla al final. Un suspendido no juega esas
    //     fechas, así que tampoco hace los tackles de esas fechas.
    const banned = bannedMatches(p, p.seasonsPlayed);
    const seasonsOutFraction = Math.min(
        0.9,
        seasonInjuries.reduce((sum, i) => sum + i.seasonsOut, 0)
        + banFraction(banned, environment.teamMatchesAvailable),
    );
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
    // EL LUGAR EN EL PLANTEL sale de `valor − rating del club`, y de ahí salen los
    // partidos. Se resuelve acá porque acá está el club: `statistics.ts` recibe la
    // fracción ya calculada. `p.role` es el mismo dato en tres valores, para el
    // entorno y los eventos — una sola fuente, dos granularidades.
    // VALOR DEPORTIVO, no de mercado. `marketValue` lleva fama, proyección y un
    // bono por ser titular que dependía del rol — o sea que cerraba un bucle con
    // esta misma resta, y encima se escapaba al escalón de mercado. Ver la cabecera
    // de `squad-role.ts`: el mercado y el puesto son dos preguntas distintas.
    const squadValue = effectiveOvr;
    const squadRole = roleAt(squadValue, club.rating);
    p.role = playerRoleOf(squadRole);
    // `state.seed` y la temporada siembran el rng de detalle de planilla, que va
    // aparte para no correr el stream principal (ver statistics.ts).
    // 🕒 EL TIEMPO DE JUEGO QUE DEJÓ LA DECISIÓN multiplica la banda del lugar en
    // el plantel, no la reemplaza: hablar con el técnico consigue minutos, no la
    // titularidad de otro. Con 0 escalones el factor es 1 y la cuenta queda
    // idéntica a la de siempre.
    const perf = simulatePerformance(
        p, effectiveOvr, seasonsOutFraction, rng, environment, cupCount, state.seed, p.seasonsPlayed,
        adjustShare(
            matchShareFor(squadValue, club.rating, p.squadTrack),
            playingTimeFactor(state.pendingPlayingTime),
        ),
    );
    // 📋 Y lo que la decisión le agrega a la planilla. Va ANTES de la deriva de
    // dinámicas para que la fama del año cuente los tries que el jugador ve.
    applyStatBoost(perf.stats, state.pendingStatBoost);

    // 4b) Registro y presencia de la temporada en la unión del país del club
    //     (Reg. 8.1(c)/(d)). Las franquicias multinacionales ('multi') no
    //     atribuyen registro a ninguna unión concreta. Cambiar de club dentro
    //     del mismo país NO corta la continuidad; cambiar de país sí.
    advanceRegistration(p.eligibility, club.countryCode === 'multi' ? null : club.countryCode);

    // 5) Selección nacional (en paralelo al club). ÚNICA fuente de caps: una
    //    decisión puede mover cuántos tests juega (`pendingTestShare`), nunca
    //    sumar caps por su cuenta.
    //
    //    "Quedó afuera estando adentro" sale de la temporada pasada y no de un
    //    contador guardado: si venía en el plantel y no fue convocada, ésta es
    //    la segunda seguida y pierde la camiseta.
    const lastSeason = state.seasons[state.seasons.length - 1];
    const missedLastSeason = lastSeason !== undefined
        && !lastSeason.calledUp
        && (lastSeason.nationalStatus === 'squad' || lastSeason.nationalStatus === 'starter');
    // Temporadas desde que perdió la camiseta. Sale del historial congelado, no
    // de un contador: `seasons[].lostShirt` ya marca cuándo pasó.
    const lostIdx = state.seasons.map((x) => x.lostShirt).lastIndexOf(true);
    // Temporadas consecutivas cerradas a prueba, contadas desde el final.
    let trialSeasons = 0;
    for (let i = state.seasons.length - 1; i >= 0 && state.seasons[i].nationalStatus === 'trial'; i--) {
        trialSeasons++;
    }
    // Antiguedad en el plantel principal, contada desde el final. Una temporada
    // fuera corta la racha, asi que el que cae y vuelve empieza de cero.
    //
    // NO hace falta cortarla tambien al cambiar de union, aunque la antiguedad
    // que protege deberia ser la de ESA camiseta: hoy un jugador con caps no
    // puede cambiar de union. `captureFor` sella `capturedBy` en el debut y
    // `canRepresent` rechaza cualquier otra desde ahi; `nt-eligibility-switch`
    // deja una bandera narrativa y nada mas. La transferencia internacional del
    // 8.6/8.8 esta documentada como NO implementada en `engine/eligibility.ts`.
    //
    // Escribir igual la condicion seria codigo muerto que se lee como si cubriera
    // un caso real. Cuando se implemente el 8.6, este bucle es uno de los lugares
    // a revisar — y el test "un internacional representa a UNA sola union" de
    // `national-reputation.test.ts` es el que va a avisar.
    let squadSeasons = 0;
    for (let i = state.seasons.length - 1; i >= 0; i--) {
        const st = state.seasons[i].nationalStatus;
        if (st !== 'squad' && st !== 'starter') break;
        squadSeasons++;
    }
    const nt = evaluateNationalTeam(p, {
        careerSeed: state.seed,
        seasonIndex: p.seasonsPlayed,
        testShare: state.pendingTestShare,
        missedLastSeason,
        seasonsSinceLostShirt: lostIdx < 0 ? null : state.seasons.length - lostIdx - 1,
        selectionPenalty: state.selectionPenaltySeasons > 0 ? state.selectionPenalty : 0,
        trialSeasons,
        squadSeasons,
    });
    const union = targetUnion(p.eligibility);
    const eligibleForCaps = union !== null && canRepresent(p.eligibility, union);
    const capsGained = nt.capsGained;
    const calledUp = nt.calledUp;

    // 5b) PLANILLA CON LA SELECCIÓN, por unión. Se registra acá y no en
    //     `national-team.ts` porque necesita la semilla de la carrera: el
    //     desglose sale de un rng RE-SEMBRADO aparte, con la misma técnica que
    //     el detalle de planilla del club, para no correr el stream principal.
    //     Sin esto, agregar la fila de selección habría cambiado todas las
    //     carreras existentes por un dato que es de presentación.
    const capUnion = nt.union ?? (eligibleForCaps ? union : null);
    if (capsGained > 0 && capUnion !== null) {
        registerCaps(p, capUnion, capsGained, effectiveOvr, state.seed, p.seasonsPlayed, nt.status);
    }
    // `caps` es el total de la unión que representa HOY, no la suma de todas.
    p.caps = p.nationalStats[p.nationalTeam ?? capUnion ?? '']?.caps ?? p.caps;

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
            clubTitlesWon.push({ competitionId: leagueIdentity.id, season: CATALOG_SEASON, club: p.club, union: null, category: cat, scope: league.scope });
            if (disputedSenior) {
                titles.push(leagueIdentity.name);
                titlesWon.push({ competitionId: leagueIdentity.id, season: CATALOG_SEASON, club: p.club, union: null, category: cat, scope: league.scope });
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
            clubTitlesWon.push({ competitionId: comp.id, season: CATALOG_SEASON, club: p.club, union: null, category: comp.kind, scope: comp.scope });
            if (disputedSenior) {
                titles.push(comp.label);
                titlesWon.push({ competitionId: comp.id, season: CATALOG_SEASON, club: p.club, union: null, category: comp.kind, scope: comp.scope });
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

    // 6c) TÍTULOS DE SELECCIÓN. La pieza que faltaba: hasta acá el motor coronaba
    //      campeón a un club y nunca a una selección, así que una carrera con
    //      ochenta caps podía cerrar sin un solo torneo internacional en la
    //      vitrina. Los diecinueve trofeos del calendario estaban declarados y no
    //      los leía nadie (ver `engine/international-results.ts`).
    //
    //      LA MISMA REGLA QUE EL CLUB, y por eso se lee igual: la unión gana o no
    //      gana por su cuenta —el torneo existe con o sin vos— y el título se te
    //      ACREDITA sólo si lo jugaste. Para el club el corte son las apariciones
    //      senior; acá es haber sumado al menos un cap esa temporada, que es la
    //      misma idea dicha en el idioma de la selección: estar en la lista y no
    //      entrar nunca no es haber salido campeón.
    //
    //      `capUnion` y no `p.nationalTeam`: es la unión que efectivamente lo
    //      convocó esta temporada, que es la que puede haber ganado algo con él
    //      adentro.
    /**
     * CUÁNTO PESA EL JUGADOR EN SU SELECCIÓN, de 0 a 1. Es lo que le suma a su
     * unión en el Mundial.
     *
     * Se mide contra el umbral de TITULAR de esa unión, no contra un número fijo:
     * un OVR de 80 es un titular indiscutido de Rumania y un suplente de Nueva
     * Zelanda, y el aporte tiene que decir eso. El rol manda sobre el nivel —
     * estar en el plantel sin jugar no gana partidos.
     */
    const pesoEnSeleccion = capUnion === null ? 0 : Math.max(0, Math.min(1,
        (p.nationalStatus === 'starter' ? 0.6 : p.nationalStatus === 'squad' ? 0.3 : 0.15)
        + Math.max(0, Math.min(0.4, (effectiveOvr - starterLevel(capUnion)) / 20))));
    const wcBoost = capUnion !== null && capsGained > 0
        ? { union: capUnion, weight: pesoEnSeleccion }
        : null;

    const nationalTitles = capsGained > 0 ? internationalTitlesFor(capUnion, p.seasonsPlayed, state.seed, wcBoost) : [];

    // EL MUNDIAL SE JUEGA Y DEJA CAMPEÓN Y FINALISTA. Antes las dos distinciones
    // salían de un evento que tiraba su propia moneda sin mirar si tu unión había
    // llegado siquiera a la final. Ahora se leen del bracket, que es el mismo que
    // decidió el título: una sola verdad para el mismo hecho.
    if (capUnion !== null && capsGained > 0 && isWorldCupYear(p.seasonsPlayed)) {
        const mundial = resolveWorldCup(p.seasonsPlayed, state.seed, wcBoost);
        if (mundial.champion === capUnion) p.flags['campeon_mundo'] = 1;
        else if (mundial.runnerUp === capUnion) p.flags['finalista_mundial'] = 1;
    }
    for (const title of nationalTitles) {
        titles.push(title.trophyName);
        titlesWon.push({
            competitionId: title.competitionId,
            season: CATALOG_SEASON,
            club: null,
            union: title.union,
            category: 'national-tournament',
            scope: 'national-team',
        });

        // (la marca de campeón del mundo se pone abajo, con el bracket, que
        //  además sabe quién perdió la final)
        // SI EL MOTOR TE CORONÓ, LA VITRINA DE LOGROS SE ENTERA.
        //
        // Había dos fuentes de verdad para el mismo hecho y se contradecían. El
        // título del Mundial lo resuelve `internationalTitlesFor` mirando el
        // calendario, la unión y el sorteo determinista, sin mirar la edad: un
        // pibe de 19 convocado a un Mundial que su unión gana ES campeón del
        // mundo. Pero la distinción de la vitrina salía de `campeon_mundo`, un
        // flag que sólo ponía el evento `mil-world-cup-final` — gateado en 22
        // años vía `mundialista`. Resultado: el jugador tenía la copa en los
        // títulos y NO el logro en los logros.
        //
        // Se DERIVA del resultado real y no se sortea de nuevo: el evento tira
        // su propio 50/50 sin mirar si tu unión ganó de verdad ese año, así que
        // era además la fuente menos confiable de las dos.
        //
        // No consume RNG: es leer algo que ya se calculó.
    }

    const competitionsPlayed = participations.filter((x) => x.entered).map((x) => x.competitionId);

    state.lastStanding = finish;
    p.titles += titles.length;

    // 6c) ASCENSO / DESCENSO. Se resuelve con la temporada ya jugada: la plaza se
    //     gana en la última fecha y se cobra en la pretemporada siguiente, así que
    //     la entrada histórica de ESTA temporada conserva la competición en la que
    //     se jugó. Si el club se movió, `p.league` lo acompaña — es un derivado del
    //     club y dejarlo viejo sería una segunda fuente de verdad.
    const divisionMove = applyDivisionMove(state, club, finish);
    if (divisionMove !== null) p.league = divisionMove.to;

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

    // PREMIOS INDIVIDUALES de la temporada. Van acá, con la temporada ya cerrada,
    // porque necesitan el rating y la posición final del club — antes de esto
    // ninguno de los dos existe. Se acumulan como contador en `flags`: el XV ideal
    // es repetible y "entró tres años" no es lo mismo que "entró".
    //
    // Y quedan además EN LA TEMPORADA: `flags` es el contador de carrera y no
    // sabe en qué año se ganó cada uno, así que sin esta lista la UI no podía
    // festejar el premio cuando pasa. Se guardan en el orden en que los devuelve
    // el evaluador, que es estable.
    const awardsWon = evaluateSeasonAwards({
        ovr: ovrEnd,
        rating: perf.rating,
        matches: perf.matches,
        band: sportingBandOf(club),
        leaguePosition: finish.position,
        leagueTeams: finish.teams,
        nationalStatus: p.nationalStatus,
        careerSeed: state.seed,
        seasonIndex: p.seasonsPlayed,
    });
    for (const award of awardsWon) {
        const flag = AWARD_FLAGS[award];
        p.flags[flag] = (p.flags[flag] ?? 0) + 1;
    }

    const result: SeasonResult = {
        seasonIndex: p.seasonsPlayed,
        age: p.age,
        club: p.club,
        league: p.league,
        role: p.role,
        squadRole,
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
        nationalStatus: nt.status,
        lostShirt: nt.lostShirt,
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
    state.pendingTestShare = 1;
    // Los modificadores de la decisión duran UNA temporada. Si el empujón de
    // minutos se acumulara, dos charlas con el técnico en cinco años te dejarían
    // titular para siempre sin haber jugado mejor.
    state.pendingPlayingTime = 0;
    state.pendingStatBoost = { tries: 0, tackles: 0 };
    // El castigo de selección dura varias temporadas: se descuenta una por
    // temporada y se apaga solo.
    if (state.selectionPenaltySeasons > 0) {
        state.selectionPenaltySeasons -= 1;
        if (state.selectionPenaltySeasons === 0) state.selectionPenalty = 0;
    }
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
        squadRole: result.squadRole,
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
        awardsWon,
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
    // Entrar al plantel principal es un momento distinto del debut: es cuando
    // dejas de ser una promesa a la que llevan de gira.
    if (result.nationalStatus === 'squad' || result.nationalStatus === 'starter') add('national-squad');
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
/**
 * El retiro AUTOMÁTICO se mudó a `engine/retirement.ts` en 1.15.0, junto con la
 * regla nueva: no se retira a nadie por edad antes de los 39, y entre los 34 y
 * los 38 el que decide es el jugador. Se re-exporta desde acá porque este era su
 * lugar histórico y hay tests que lo importan de este módulo.
 *
 * Las edades `soft`/`hard` de `data/positions.ts` siguen existiendo —las usan
 * las guías de puesto para contar cuánto suele durar cada uno— pero ya no
 * retiran a nadie.
 */
export { shouldRetire } from './retirement.ts';
