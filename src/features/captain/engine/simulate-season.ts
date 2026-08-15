// EL CAPITÁN — la temporada.
//
// El orden de este archivo ES el diseño del juego. Se juega, después se cobra,
// y recién después se envejece: si se envejeciera primero, la temporada la
// jugaría un jugador que todavía no existía.
//
// ── De dónde sale cada cosa, ahora que no hay fichas ──
// Hasta 0.6.0 cinco de estas vías eran ranuras donde poner fichas de ⏳. Se
// fueron todas, y cada una tiene ahora una fuente que no es una ranura:
//
//   atributos dirigidos → la carta de pretemporada (`data/trainings.ts`)
//   atributos generales → el RENDIMIENTO: cuánto jugaste (`aging.ts`)
//   Pertenencia         → quedarse, jugar y ganar. Ya era el grueso; ahora es todo
//   el cuerpo           → los partidos, más lo que se lleve la carta elegida,
//                         menos un descanso fijo de pretemporada
//   la estabilidad      → el evento `per-trabajo-y-entrenamiento`, que ya existía
//
// ── Lo que la carta cobra, y dónde ──
// Una carta cara no es solo más puntos: se paga en tres lugares distintos de
// este archivo, y a propósito, porque un costo que se cobra en un solo número es
// un descuento y no una decisión.
//
//   minutos  → paso 1, por el mismo eje que el `playingTime` de una decisión
//   lesión   → paso 1, una tirada que SIEMPRE se hace y a veces se aplica
//   cuerpo   → paso 9, del lado del desgaste y no del descanso
//
// La que NO tiene reemplazo todavía es el empuje del gimnasio del PlaDAR sobre
// la escalera representativa: se fue con las fichas y vuelve como convocatoria
// jugable. Mientras tanto la escalera la decide la media y nada más, que es
// exactamente el `no-alcanzo-su-techo = 0` que las convocatorias vienen a
// romper. Está anotado a propósito: es deuda con fecha, no un olvido.
//
// ── LA DISPONIBILIDAD (0.10.0) ───────────────────────────────────────────────
// Este archivo tenía UN número donde tiene que haber dos, y el nombre del que
// había —`share`— describía al que no estaba. Es la falla del §1.9 del CLAUDE.md
// de captain otra vez: el nombre y la cosa diciendo cosas distintas.
//
//   TU LUGAR      cuánto de lo disponible te da el técnico. Sale de `ovr −
//                 clubRating` más lo que dejó una decisión. Es `share`.
//   LA AUSENCIA   las fechas que no vas a estar, decida lo que decida el
//                 técnico: la gira, el cuerpo roto, la suspensión.
//
// Los partidos del club son el PRODUCTO de los dos, y no una resta después del
// hecho. La diferencia no es cosmética: restando, una suspensión de tres fechas
// le costaba tres partidos al titular y tres al suplente que jugaba cuatro.
// Multiplicando, cada uno pierde la parte que le tocaba.
//
// Y el crecimiento pasa a leer los partidos jugados —`rendimiento`— en vez del
// lugar en el equipo. Sin eso, la lesión de media temporada no frenaba nada.

import type { CaptainState } from '../types/captain.ts';
import type { CaptainSeasonEntry } from '../types/season.ts';
import type { SeasonAwardId } from '../types/achievements.ts';
import type { Rng } from './random.ts';
import type { DivisionMove } from './promotion.ts';
import { FAME_MAX, FAME_MIN } from '../types/currencies.ts';
import { FIRST_TEAM_AGE } from '../types/player.ts';
import { MATCH_CAP_PER_SEASON } from '../types/season.ts';
import { getFamily } from '../data/positions.ts';
import { getTraining } from '../data/trainings.ts';
import {
    clubLeague,
    competitionLabelOf,
    regularSeasonMatchesOf,
    sportingBandOf,
} from '../data/catalogs.ts';
import { applyBelonging, belongingFormFactor, belongingOf } from './belonging.ts';
import { addBodyDamage, addHeadDamage } from './damage.ts';
import { applyMoney } from './money.ts';
import { ageOneSeason, applyHeadRegression, applySeriousInjuryRegression } from './aging.ts';
import { hasRule, shopPerks, tickShop } from './shop.ts';
import { seasonGrowthScale } from './growth.ts';
import { seasonRating } from './season-rating.ts';
import { evaluateSeasonAwards } from './awards.ts';
import { nationalTitlesFor } from './international-results.ts';
import { tournamentDue } from './tournament-gate.ts';
import { WORLD_CUP_ID } from '../data/catalogs.ts';
import { detectMilestones } from './milestones.ts';
import { applyDivisionMove, resolveClub } from './promotion.ts';
import { playingTimeOf, seasonStats } from './statistics.ts';
import {
    TITLE_MIN_SHARE,
    clubRatingOf,
    cupChampionOf,
    cupsFor,
    generateOffers,
    leagueStandingOf,
    salaryFor,
    wonCompetition,
} from './clubs.ts';
import {
    ageRival,
    DECLINE_MEMORY_SEASONS,
    evaluateNationalTeam,
    higherTrack,
    reachableTrack,
    recordCaps,
    representativeClubCostOf,
    representativeMatchesOf,
    trackLabelOf,
} from './national-team.ts';
import { TRIAL_TOUR_EVENT_ID } from '../data/events/index.ts';
import { advanceRegistration } from './eligibility.ts';
import { namedTestOf, testLine } from './test-match.ts';
import { potentialOf } from './ovr.ts';
import { belongingSituation, currentContract } from './contracts.ts';
import { inFarewell } from './retirement.ts';

/**
 * Fechas que da la temporada de un club, antes de tu disponibilidad.
 *
 * ── ERA UN 22 FIJO PARA TODO EL PLANETA, Y NO LO ES ────────────────────────
 * `regularSeasonMatchesOf` está en `competition-levels2026.ts` desde siempre,
 * con las fechas declaradas competición por competición: el Top 14 son 26, la
 * URC 18, y una liga chica catorce. Un 22 parejo le daba al de la Tercera de la
 * URBA la misma exposición que a un francés, y de las fechas salen los partidos,
 * el desgaste, las lesiones y la Pertenencia. O sea: casi todo.
 *
 * El 22 queda como PISO cuando la competición no tiene perfil —un club sin
 * división resoluble— porque cero fechas convertiría la temporada en un año en
 * blanco, y eso es peor que una aproximación.
 */
const FALLBACK_CLUB_MATCHES = 22;

/**
 * Fechas que agrega cada copa que el club disputa.
 *
 * Es un número de este archivo y no del catálogo, y hay que decir por qué: las
 * copas del catálogo declaran plazas y volatilidad, no calendario. Seis es una
 * fase de grupos corta más una llave — lo que suma la Champions Cup a un club de
 * Top 14 sin llegar a la final.
 *
 * ESPEJO de `MATCH_CAP_PER_SEASON`: con dos copas encima de una liga de 26, el
 * club solo ya empuja las 38 fechas, así que el techo de treinta pasa a morder
 * de verdad. Es a propósito — es exactamente la decisión que World Rugby le puso
 * enfrente a los clubes en octubre de 2025.
 */
const CUP_MATCHES_EACH = 6;

/**
 * Fechas del club que te cuesta cada cap.
 *
 * UNO, y no una fracción: la ventana internacional no se juega el fin de semana
 * libre. Un test de julio se concentra la semana anterior y el club juega esa
 * fecha sin vos, así que el canje es uno a uno. Con las dos ventanas y el
 * Championship, una temporada de titular de la mayor te saca ocho o diez fechas
 * del club — que es exactamente lo que le pasa a un Puma del Top 14 y la razón
 * por la que Contepomi los descansó en julio de 2026.
 *
 * ES EL PARÁMETRO QUE HACE QUE LAS DOS ESCALERAS SE PELEEN DE VERDAD. En cero,
 * la selección es gratis y no hay decisión: se sube y ya. Cada punto que sube
 * encarece la camiseta de la unión en moneda de Pertenencia.
 */
const CLUB_MATCHES_PER_CAP = 1;

/**
 * Pertenencia por temporada en el club. Quedarse ES la construcción, y por eso
 * pesa más acá que en el fútbol: en rugby quedarse es la norma y no la
 * excepción, así que una carrera de doce años en el mismo club tiene que llegar
 * sola a la mitad del camino.
 */
const BELONGING_PER_SEASON = 1.5;

/** Título del torneo del club. */
const BELONGING_PER_TITLE = 5;

/**
 * Lo que suma cada cap. El club se cuelga de vos: que uno de los suyos juegue
 * para la mayor es del club tanto como tuyo.
 */
const BELONGING_PER_CAP = 0.8;

/** Desgaste del cuerpo por partido jugado. */
const BODY_PER_MATCH = 0.42;

/**
 * Lo que descansa el cuerpo en la pretemporada, sin contar el aguante ni lo
 * comprado.
 *
 * ── El comentario anterior describía un mundo, y el mundo estaba roto ───────
 * Decía —correctamente— que 3,5 era exactamente lo que rendía una ficha de
 * familia, elegido para que sacar las fichas no moviera la esperanza de vida de
 * una carrera. Lo que nunca se auditó es si esa esperanza de vida era la que
 * queríamos, y no lo era: con 3,5 fijo contra un desgaste de 10 por temporada de
 * titular, el cuerpo subía +6,7 todos los años y no bajaba nunca. Medido sobre
 * 320 carreras, el desgaste mediano al retiro daba 91 de 100 y a los 23 años más
 * de la mitad de los jugadores ya había cruzado el primer umbral de adelanto.
 *
 * O sea que el desgaste no era un reloj: era un trinquete que todos maximizaban,
 * y por lo tanto no informaba nada sobre nadie. La tabla de edades de
 * `positions.ts` terminaba mintiendo dos o tres años sin que nada fallara.
 *
 * ── Lo que este número afirma ahora ────────────────────────────────────────
 * Que el desgaste tiene que poder ADMINISTRARSE. Con el descanso completo —base
 * más aguante más lo comprado— el desgaste al retiro pasa a repartirse en vez de
 * amontonarse contra el techo: mediana 44, cuartil alto 73, y solo el 11% de las
 * carreras llega a 90. O sea que el adelanto del tope blando vuelve a medir lo
 * que siempre dijo que medía.
 */
const BODY_REST_BASE = 4;

/**
 * Y lo que cada punto de aguante le agrega al descanso.
 *
 * El aguante ya estaba del lado del desgaste —`1,25 − aguante/200`— pero ahí
 * pesa poco: los treinta puntos que separan a un jugador de otro mueven el
 * desgaste un 12%. Del lado del descanso pesa el triple, y esa es la razón de
 * ponerlo acá: el aguante es el atributo que la góndola del cuerpo vende y que
 * NO entra en la media de ningún puesto (`data/positions.ts` lo deja afuera por
 * construcción). Su premio tenía que ser años, y hasta la 0.29.0 casi no lo era.
 *
 * Con 0,058 y la banda real de aguante —de 45 a 75 contando lo comprado— el
 * descanso va de 6,6 a 8,4. Contra un desgaste de 10, es la diferencia entre
 * gastarse 3,4 por temporada y gastarse 1,4: la carrera entera.
 */
const BODY_REST_PER_AGUANTE = 0.058;

/**
 * Qué parte de la temporada del club te come una lesión de pretemporada.
 *
 * La severidad media de una lesión de rugby son 38 días, que sobre un torneo de
 * veintidós fechas es cerca de un tercio. No es la carrera: es el año, que es
 * exactamente lo que una carta cara tiene que poder costarte.
 */
const PRESEASON_INJURY_COST = 0.35;

/** Y lo que la lesión le deja al cuerpo, además de los partidos que se comió. */
const PRESEASON_INJURY_BODY = 4;

/**
 * Riesgo de LESIÓN SERIA por partido jugado.
 *
 * "Seria" quiere decir de las que te sacan fechas, no de las que se juegan con
 * una infiltración. El rugby profesional anda en 80-90 lesiones por cada 1.000
 * horas de juego en partido; con ochenta minutos por fecha eso da cerca de una
 * lesión cada nueve partidos, contando todas. Acá se modelan solo las que
 * cuestan tiempo, así que el número es bastante más bajo.
 *
 * Con 0,014 y una temporada de veinte partidos, la chance de perderse fechas
 * ronda el 24% por año: un jugador se rompe tres o cuatro veces en la carrera y
 * llegar entero al retiro sigue siendo posible. Que sea POSIBLE y no fácil es el
 * punto — es la mitad de la respuesta a por qué unos llegan a los 35 y otros no.
 */
const INJURY_RISK_PER_MATCH = 0.014;

/**
 * Cuántas fechas te saca. La severidad media de una lesión de rugby son 38 días
 * y la mediana bastante menos, así que la banda va de un mes corto a un torneo
 * entero perdido. Uniforme y no normal a propósito: la cola larga —el año que se
 * fue en una rodilla— tiene que poder pasar, y con una normal angosta no pasa
 * nunca.
 */
const INJURY_ROUNDS_MIN = 3;
const INJURY_ROUNDS_MAX = 14;

/**
 * A PARTIR DE CUÁNTAS FECHAS PERDIDAS LA LESIÓN ES GRAVE.
 *
 * Ocho sobre veintidós: más de un tercio del torneo. Por debajo te perdiste
 * partidos y volviste; por encima estuviste meses parado, y de eso no se vuelve
 * igual — `applySeriousInjuryRegression` te cobra velocidad, choque y aguante.
 *
 * Es ESPEJO de `INJURY_ROUNDS_MAX`: el corte tiene sentido mientras la banda de
 * severidad siga siendo [3, 14]. Si esa banda se mueve, este número se mueve con
 * ella o deja de partirla por la mitad.
 */
const SERIOUS_INJURY_ROUNDS = 8;

/** Lo que cada fecha perdida le deja al cuerpo. Romperse deja marca. */
const INJURY_BODY_PER_ROUND = 0.8;

/**
 * Riesgo de HIA por partido. La conmoción es la lesión número uno del rugby,
 * con el 24% del total y 18,4 por 1.000 horas de juego.
 *
 * Calibrado para que una carrera media termine con dos o tres, y para que
 * retirarse sin ninguna sea posible pero raro. Con 0,011 el 96% de las carreras
 * terminaba con conmociones y la media era de casi cuatro: cuando le pasa a
 * todos, deja de significar algo y el dilema de `inj-te-pegaste` se vuelve
 * decorativo.
 */
const HIA_RISK_PER_MATCH = 0.007;

export interface SeasonReport {
    entry: CaptainSeasonEntry;
    ovrDelta: number;
    /** Lo que la pantalla cuenta en una línea. */
    headline: string;
    /** Los hitos que se alcanzaron esta temporada, si se alcanzó alguno. */
    milestones: string[];
    /** El movimiento de división del club, para poder anunciarlo. */
    divisionMove: DivisionMove | null;
}

/**
 * Juega una temporada. Muta el estado —el reducer trabaja sobre un clon— y
 * devuelve lo que hay que mostrar.
 */
export function simulateSeason(state: CaptainState, rng: Rng): SeasonReport {
    const { player } = state;
    const family = getFamily(player.family);
    const notas: string[] = [];

    // ── El entrenamiento de esta pretemporada ───────────────────────────────
    // Se resuelve contra la familia: un id que no es de este puesto no existe, y
    // vale lo mismo que no haber entrenado.
    const training = state.training ? getTraining(player.family, state.training) : null;

    // ── 0 · EL CLUB, CON LA DIVISIÓN DE ESTA CARRERA ────────────────────────
    // No el del catálogo: si ascendió o descendió, esta temporada se juega donde
    // el club terminó. De la competición salen solas la banda deportiva, el
    // nivel del entorno, el campeonato que peleás y el sueldo — todas derivadas,
    // ninguna guardada aparte.
    const club = player.clubId ? resolveClub(state.divisions, player.clubId) : null;
    const competitionId = club?.competitionId ?? null;

    // ── ¿PRIMERA O JUVENILES? ───────────────────────────────────────────────
    // A los 16 y a los 17 se juega con los de tu edad y no en el plantel
    // superior: es la puerta del club de verdad y no una cuestión de nivel, así
    // que no la decide la media ni el puesto sino la edad (`FIRST_TEAM_AGE`).
    //
    // Lo que cambia es DE QUÉ CAMISETA son los partidos, no cuántos: el pibe
    // sigue jugando su temporada y sigue creciendo por jugarla —`rendimiento`
    // son minutos, sean de la camiseta que sean—. Lo que no puede es levantar la
    // copa de la división mayor ni contar como titular de primera.
    const enJuveniles = player.age < FIRST_TEAM_AGE;

    // ── EL ÍNDICE DEL CALENDARIO, en un solo lugar ──────────────────────────
    // El calendario internacional cuenta desde 0 —la temporada 0 es la del
    // catálogo, 2026— y El Capitán cuenta desde 1. La resta vive acá y con
    // nombre: repartida por el motor, alcanzaba con que un llamador se olvidara
    // para que a una carrera le tocara el Mundial un año antes que a otra.
    const seasonIndex = state.season - 1;

    // ── LAS COPAS ───────────────────────────────────────────────────────────
    // El club juega su liga MÁS las copas a las que clasificó por dónde terminó
    // EL AÑO PASADO. Por eso se lee `lastStanding` y no la posición de esta
    // temporada, que todavía no existe: la Champions Cup se juega con la tabla
    // del año anterior, igual que en el rugby de verdad.
    const copas = club ? cupsFor(club, state.lastStanding) : [];

    // Las fechas del club salen de la competición y no de una constante, más lo
    // que agregue cada copa.
    const fechasDeLiga = competitionId
        ? regularSeasonMatchesOf(competitionId)
        : FALLBACK_CLUB_MATCHES;
    const clubMatches = fechasDeLiga + copas.length * CUP_MATCHES_EACH;

    // ── 1 · Tu lugar en el equipo ───────────────────────────────────────────
    // OJO: esto NO es cuánto vas a jugar. Es qué parte de lo que esté
    // disponible te toca a vos, que es una pregunta distinta y anterior. Los
    // minutos que cuesta la carta entran por el MISMO eje que el `playingTime`
    // de una decisión: son escalones, no una resta de partidos. Así el que
    // eligió la carta cara pierde lugar en el equipo de verdad y no solo un par
    // de fechas en la cuenta final.
    // LO QUE COMPRÓ EL JUGADOR, leído UNA VEZ para toda la temporada. Se deriva
    // de lo que tiene puesto (`engine/shop.ts`) y no se guarda: un consumible
    // que venza deja de estar acá al año siguiente sin que nadie lo borre.
    const perks = shopPerks(player);

    const clubRating = clubRatingOf(player.clubId);
    const minutosResignados = training?.cost?.minutes ?? 0;
    const { share, role } = playingTimeOf(
        player,
        clubRating,
        state.damage.cuerpo,
        state.pendingPlayingTime - minutosResignados,
        hasRule(perks, 'piso-de-forma'),
    );

    // El riesgo de la pretemporada. SE TIRA SIEMPRE, haya o no carta y tenga o
    // no riesgo: si la tirada dependiera de lo elegido, el stream dependería de
    // la decisión y dos partidas con la misma semilla dejarían de ser
    // comparables. Es la misma regla que el ruido de `aging.ts`.
    const tirada = rng.float(0, 1);
    const lesionDePretemporada = tirada < (training?.cost?.injuryRisk ?? 0);

    // ── 2 · La escalera representativa ──────────────────────────────────────
    // Va ANTES de contar los partidos y no después, y ese orden es el cambio:
    // los caps son fechas del club que te vas a perder, así que hay que saber
    // cuántos son para poder restarlos.
    //
    // ── EL REGISTRO, PRIMERO DE TODO (Reg. 8.1(c) y (d)) ────────────────────
    // Los meses de registro se suman con el club de ESTA temporada y antes de
    // que la convocatoria mire nada: es lo que hace que el que lleva cinco años
    // en Francia pueda ser mirado por Francia este año y no el que viene.
    advanceRegistration(state.national.eligibility, club?.countryCode ?? null);

    // Hasta dónde llegás solo. Nunca devuelve `nacional`: la camiseta de la
    // mayor no se alcanza por media, se gana, y eso lo resuelve la convocatoria.
    const trackJuvenil = reachableTrack(player, state.rival?.ovr ?? null);

    // ── LAS CUATRO CUENTAS QUE SALEN DEL HISTORIAL Y NO DE UN CONTADOR ──────
    // Las cuatro se leen de `state.history`, que ya congela el estado de cada
    // temporada. Un contador guardado sería una segunda fuente de verdad, y
    // alcanza con un pase que se olvide de resetearlo para que la cabecera
    // mienta (CLAUDE.md §2, «lo derivado no sube nada»).
    const ultima = state.history[state.history.length - 1];
    const missedLastSeason = ultima !== undefined
        && !ultima.calledUp
        && (ultima.nationalStatus === 'squad' || ultima.nationalStatus === 'starter');
    const caidaIdx = state.history.map((h) => h.lostShirt).lastIndexOf(true);
    let trialSeasons = 0;
    for (let i = state.history.length - 1; i >= 0 && state.history[i].nationalStatus === 'trial'; i -= 1) {
        trialSeasons += 1;
    }
    let squadSeasons = 0;
    for (let i = state.history.length - 1; i >= 0; i -= 1) {
        const st = state.history[i].nationalStatus;
        if (st !== 'squad' && st !== 'starter') break;
        squadSeasons += 1;
    }

    // ── LA QUINTA CUENTA, y sale del mismo lugar que las otras cuatro ───────
    // «¿Le dijiste que no a una gira hace poco?». El `decisionLog` ya guarda qué
    // se eligió y en qué temporada, así que la memoria de la unión se DERIVA en
    // vez de guardarse: un `national.declinedSeason` sería una segunda fuente de
    // verdad sobre un hecho que el historial ya congela, y alcanzaría un camino
    // que se olvide de escribirlo para que el recargo se aplique al que nunca
    // rechazó nada (CLAUDE.md raíz §2).
    //
    // Se recorre de atrás para adelante y se corta en el primero: lo que importa
    // es el rechazo MÁS RECIENTE, y los anteriores ya se olvidaron por su cuenta.
    const declinedRecently = (() => {
        for (let i = state.decisionLog.length - 1; i >= 0; i -= 1) {
            const d = state.decisionLog[i];
            if (d.eventId !== TRIAL_TOUR_EVENT_ID || d.optionId !== 'decir-que-no') continue;
            return state.season - d.season <= DECLINE_MEMORY_SEASONS;
        }
        return false;
    })();

    const nt = evaluateNationalTeam(player, state.national, {
        careerSeed: state.seed,
        seasonIndex,
        lastRating: ultima?.rating ?? null,
        clubBand: club ? sportingBandOf(club) : null,
        amateur: state.stage === 'amateur',
        potential: potentialOf(player),
        fame: state.fame,
        rival: state.rival,
        missedLastSeason,
        seasonsSinceLostShirt: caidaIdx < 0 ? null : state.history.length - caidaIdx - 1,
        trialSeasons,
        squadSeasons,
        declinedRecently,
    });

    // El escalón de la temporada: la mayor le gana a cualquier carril juvenil.
    // Un convocado de los Pumas no juega además el Argentino de su unión.
    const track = nt.calledUp ? 'nacional' : trackJuvenil;
    const caps = nt.capsGained;

    state.national.track = track;
    state.national.bestTrack = higherTrack(state.national.bestTrack, track);
    state.national.caps += caps;
    if (nt.union !== null && caps > 0) {
        // Por unión, porque los caps son de una camiseta. Y los de gira no
        // compran titularidad: sólo los de plantel cuentan para el descuento.
        recordCaps(state.national, nt.union, caps, nt.status !== 'trial');
    }
    if (state.rival) state.rival = { ...state.rival, caps: state.rival.caps + nt.rivalCaps };

    if (nt.debut && caps > 0) {
        state.national.debutSeason = state.season;
        state.fame = Math.min(FAME_MAX, state.fame + 20);
    }
    if (nt.lostShirt) notas.push('Perdiste la camiseta de la mayor.');

    // ── EL TEST QUE TIENE NOMBRE ────────────────────────────────────────────
    // Los caps llegaban como un entero. Uno de los partidos del año se cuenta
    // con el rival y el torneo adentro, y el resto sigue siendo agregado: no se
    // simulan las ventanas, se le da pantalla al partido que la carrera va a
    // recordar. Sale del calendario y no consume el rng de la carrera
    // (`engine/test-match.ts`).
    //
    // Reemplaza a «Debutaste con la mayor.», que decía la mitad de la frase: un
    // debut es contra alguien, en algún lado, y ese dato ya estaba en el
    // calendario esperando que alguien lo leyera.
    if (caps > 0 && nt.union !== null) {
        const test = namedTestOf(nt.union, seasonIndex, state.seed);
        if (test) notas.push(testLine(test, { debut: nt.debut }));
        else if (nt.debut) notas.push('Debutaste con la mayor.');
    }

    // ── Y LA LÍNEA QUE DICE POR QUÉ NO ──────────────────────────────────────
    // Sólo cuando NO te convocaron: al que está adentro no hay nada que
    // explicarle, y una causa escrita el año que jugaste se lee como una excusa.
    // El texto sale de la convocatoria, que es la única que tuvo a la vista la
    // vara final y la presión (`diagnoseSelection`).
    if (!nt.calledUp && nt.diagnosis) notas.push(nt.diagnosis.text);

    // ── 3 · LAS AUSENCIAS ───────────────────────────────────────────────────
    // Las fechas del club que NO vas a poder jugar, pase lo que pase con el
    // técnico. Son cuatro y ninguna es "ser flojo": la gira, la lesión del año,
    // lo que arrastrás de una decisión, y la suspensión.
    // La gira son las fechas del club que te comen las convocatorias: los caps
    // de la mayor y —esto entró en 0.15.0— los partidos de los carriles de abajo,
    // que hasta ahora no existían en ningún número.
    const partidosRepresentativos = representativeMatchesOf(track);
    const fechasDeGira = caps * CLUB_MATCHES_PER_CAP + representativeClubCostOf(track);

    // ── LA LESIÓN DEL AÑO ───────────────────────────────────────────────────
    // Hasta 0.9.0 la única lesión del juego era el riesgo de una carta de
    // pretemporada: si no elegías la carta cara, el cuerpo no existía. En un
    // deporte con 80-90 lesiones por cada 1.000 horas de juego eso no es una
    // simplificación, es otro deporte.
    //
    // El riesgo se calcula sobre los partidos que ibas a jugar —jugar es lo que
    // te expone— y el forward se lleva la peor parte, igual que en el HIA. Las
    // DOS tiradas se hacen SIEMPRE, aunque el riesgo dé cero: si la cantidad de
    // tiradas dependiera de la carta elegida, el stream dependería de la
    // decisión y dos partidas con la misma semilla dejarían de ser comparables.
    // Es la misma regla que el ruido de `aging.ts`.
    const exposicion = family.group === 'forward' ? 1.25 : 1;
    const fechasDePretemporada = lesionDePretemporada
        ? Math.round(clubMatches * PRESEASON_INJURY_COST)
        : 0;
    const antesDeRomperse = Math.round(
        Math.max(0, clubMatches - fechasDeGira - fechasDePretemporada - state.pendingSanction) * share,
    );
    const riesgoDeLesion = 1 - (1 - INJURY_RISK_PER_MATCH * exposicion) ** antesDeRomperse;
    const tiradaLesion = rng.float(0, 1);
    const severidad = rng.int(INJURY_ROUNDS_MIN, INJURY_ROUNDS_MAX);
    const fechasDeLesion = tiradaLesion < riesgoDeLesion ? severidad : 0;

    const fechasRotas = state.pendingInjury + fechasDePretemporada + fechasDeLesion;
    const ausencias = fechasDeGira + fechasRotas + state.pendingSanction;
    const disponibles = Math.max(0, clubMatches - ausencias);

    // La convocatoria se cuenta ANTES que lo que costó, porque es la noticia: el
    // renglón que faltaba era este, no el de las fechas perdidas.
    if (partidosRepresentativos > 0) {
        notas.push(
            `Jugaste ${partidosRepresentativos} ${partidosRepresentativos === 1 ? 'partido' : 'partidos'} `
            + `con ${trackLabelOf(track, player.countryCode)}.`,
        );
    }
    if (fechasDeGira > 0) {
        notas.push(`Te perdiste ${fechasDeGira} ${fechasDeGira === 1 ? 'fecha' : 'fechas'} del club por la gira.`);
    }
    if (lesionDePretemporada) notas.push('Te rompiste en la pretemporada y volviste con el torneo empezado.');
    if (fechasDeLesion > 0) {
        notas.push(`Te lesionaste y estuviste ${fechasDeLesion} fechas afuera.`);
        state.damage = addBodyDamage(state.damage, fechasDeLesion * INJURY_BODY_PER_ROUND);
    }
    if (state.pendingInjury > 0) {
        notas.push(`Arrastraste la lesión ${state.pendingInjury} ${state.pendingInjury === 1 ? 'fecha' : 'fechas'}.`);
    }
    if (state.pendingSanction > 0) {
        notas.push(`Te comiste ${state.pendingSanction} ${state.pendingSanction === 1 ? 'fecha' : 'fechas'} de suspensión.`);
    }

    // Y ACÁ SE MULTIPLICAN LAS DOS COSAS, que es todo el cambio: tu lugar en el
    // equipo, aplicado sobre lo que estuviste para jugar. Antes `share` se
    // aplicaba sobre la temporada entera y las ausencias se restaban después,
    // así que al suplente la suspensión no le costaba nada —ya no jugaba— y al
    // titular le costaba lo mismo que al suplente. Proporcional es lo correcto:
    // el que juega todo pierde todo lo que falta.
    const partidosDeClub = Math.round(disponibles * share);

    // ── 4 · El techo de 30 ──────────────────────────────────────────────────
    // Directrices de World Rugby, octubre de 2025. Pasarse no está prohibido:
    // está caro. Es lo que le pasa hoy a los Pumas que juegan en Francia.
    let partidos = partidosDeClub + caps + partidosRepresentativos;
    if (partidos > MATCH_CAP_PER_SEASON) {
        const exceso = partidos - MATCH_CAP_PER_SEASON;
        partidos = MATCH_CAP_PER_SEASON;
        state.damage = addBodyDamage(state.damage, exceso * 1.6);
        notas.push(`Te pasaste del límite de treinta partidos. El cuerpo lo anotó.`);
    }
    state.matches.played = partidos;

    // ── LOS DOS NÚMEROS QUE SALEN DE ACÁ, Y QUÉ CONTESTA CADA UNO ────────────
    // El motor los venía confundiendo en `share`, que decía ser uno y era el
    // otro. Separados:
    //
    //   clubShare   — QUÉ PARTE DE LA TEMPORADA DEL CLUB JUGASTE. Es lo que
    //                 construye la Pertenencia, lo que te hace campeón y lo que
    //                 se guarda en la trayectoria, porque es lo que el hincha
    //                 del club vio.
    //   rendimiento — CUÁNTOS MINUTOS JUGASTE, DE LA CAMISETA QUE SEA. Es lo
    //                 que te hace mejor. La gira te saca del club pero no te
    //                 saca del rugby: el que se pasó el año con la mayor jugó, y
    //                 el que se pasó el año lesionado no.
    const clubShare = Math.round((partidosDeClub / clubMatches) * 1000) / 1000;
    const rendimiento = Math.min(1, partidos / clubMatches);

    // ── 5 · La planilla del puesto ──────────────────────────────────────────
    const stats = seasonStats(player, partidos, rng, state.pendingStatBoost);

    // ── 6 · El club: dónde terminó, y si eso te da una copa ─────────────────
    // La tabla es una sola —`leagueTableOf`— y de ella salen las tres cosas que
    // este bloque necesita: quién salió campeón, en qué puesto quedaste y si eso
    // mueve al club de división. Con tres sorteos separados se podía dar un
    // campeón que además descendía.
    const standing = competitionId
        ? leagueStandingOf(player.clubId, competitionId, state.season, state.divisions)
        : { competitionId: '', position: 0, teams: 0 };

    const titulos: string[] = [];
    // Los de club, aparte. La Pertenencia los cuenta y a los de selección no:
    // son dos vitrinas distintas y el §11 explica por qué se separaron.
    //
    // Y EL JUVENIL NO LEVANTA LA COPA DE PRIMERA. El corte de participación ya
    // existía —`TITLE_MIN_SHARE`, «si no te pusiste la camiseta, la medalla no es
    // tuya»— y esta es la misma regla una puerta antes: el de 16 no se puso la
    // camiseta de primera ni un sábado, jugó la suya.
    let titulosDeClub = 0;
    if (!enJuveniles && club && competitionId && wonCompetition(player.clubId, competitionId, clubShare, state.season, state.divisions)) {
        const label = clubLeague(player.clubId)?.labelEs ?? competitionLabelOf(competitionId);
        state.titles.push({
            season: state.season,
            competitionId,
            labelEs: label,
            clubId: player.clubId,
            kind: 'club',
        });
        titulos.push(label);
        titulosDeClub += 1;
    }

    // ── 6b · LAS COPAS DEL CLUB ─────────────────────────────────────────────
    // Cada una tiene su propio campo y su propia volatilidad, así que la
    // Champions Cup se la puede llevar el cuarto de la liga y el Nacional de
    // Clubes no. El corte de participación es el MISMO que el de la liga: si no
    // te pusiste la camiseta, la medalla no es tuya.
    for (const copa of copas) {
        if (enJuveniles) break;
        if (cupChampionOf(copa, state.season, state.divisions) !== player.clubId) continue;
        if (clubShare < TITLE_MIN_SHARE) continue;
        state.titles.push({
            season: state.season,
            competitionId: copa.id,
            labelEs: copa.label,
            clubId: player.clubId,
            kind: 'club',
        });
        titulos.push(copa.label);
        titulosDeClub += 1;
    }

    // ── 6c · La copa de tu unión ────────────────────────────────────────────
    // (el helper vive abajo, junto al resto de la plomería de esta función)
    // El torneo existe con o sin vos: lo gana quien lo gana. El título es tuyo
    // solamente si esa temporada te pusiste la camiseta al menos una vez.
    // El Mundial que vas a jugar vos no lo reparte el sorteo: lo decide tu llave,
    // que se destapa después de esta función. Ver `playedIds`.
    const jugados = playedCompetitionIds(state);
    for (const titulo of nationalTitlesFor({
        unionCode: player.countryCode,
        seasonIndex,
        caps,
        playedIds: jugados,
    })) {
        state.titles.push(titulo);
        titulos.push(titulo.labelEs);
        notas.push(`Tu selección ganó ${titulo.labelEs}.`);
    }

    // ── 7 · Cartel ──────────────────────────────────────────────────────────
    let fama = caps * 0.8 + titulos.length * 3 + clubShare * 0.6;
    if (track === 'nacional') fama += 1.5;
    state.fame = Math.min(FAME_MAX, Math.max(FAME_MIN, Math.round((state.fame + fama) * 10) / 10));

    // ── 8 · Plata ───────────────────────────────────────────────────────────
    //
    // EL SUELDO ES EL QUE DECÍA LA OFERTA, y hasta acá no lo era: la tarjeta de
    // mercado prometía `salaryFor(club)` —US$ 817.500 al año en un club de
    // élite— y la temporada pagaba `rating × 900`, o sea 81.000. El jugador
    // firmaba por una cifra y cobraba la décima parte sin que nada se lo dijera.
    //
    // Ahora paga EL CONTRATO, que es la misma cifra que la tarjeta prometió
    // porque de ahí salió: `contract.salary` se copió de la oferta que el jugador
    // eligió. Una sola respuesta a «cuánto ganás», que es la regla §1.9 aplicada
    // al caso más caro posible.
    //
    // ── Y ES EL SUELDO DE CUANDO FIRMASTE, NO EL DE HOY ────────────────────
    // Desde la 0.30.0 el contrato dura dos o tres años, así que la media con la
    // que se calculó ya pasó. Es el punto entero del plazo: el que firma a los 22
    // y explota cobra de menos hasta que le toque renovar, y el que se cae cobra
    // de más. Recalcular `salaryFor` todos los junios borraría las dos mitades de
    // la apuesta y dejaría el plazo como decoración.
    //
    // El `?? salaryFor` de abajo no es un segundo camino: es el profesional sin
    // contrato vigente, que hoy no existe —`signProfessional` siempre firma uno—
    // y que si algún día existiera tiene que cobrar algo antes que cero.
    //
    // Se guarda cuánto entró ESTE AÑO, y eso sí hace falta guardarlo: el saldo
    // se mueve también por las compras, así que restar dos saldos consecutivos
    // no da el ingreso. Es la cuenta que la billetera muestra por temporada.
    let ingreso = 0;
    if (state.stage === 'professional' && club) {
        ingreso = currentContract(state)?.salary ?? salaryFor(club, player.ovr);
        state.money = applyMoney(state.money, ingreso, state.stage);
    }

    // ── 9 · El cuerpo y la cabeza ───────────────────────────────────────────
    // Lo que se lleva la carta va del lado del desgaste y no del descanso: una
    // pretemporada a doble turno no es "descansar menos", es sumar carga. Con el
    // descanso fijo en 3,5, una carta de 2,5 te deja el año en apenas un punto
    // de recuperación — no te rompe de golpe, te deja sin margen para el resto.
    const aguante = player.attrs.aguante;
    const desgaste = partidos * BODY_PER_MATCH * (1.25 - aguante / 200);
    const cargaDeLaCarta = training?.cost?.body ?? 0;
    // EL DESCANSO ES LA MITAD DEL RELOJ, y las tres partes que lo componen son
    // las tres formas de administrarlo: lo que descansa cualquiera, lo que te
    // devuelve tu propio aguante, y lo que pagaste para que te lo devuelvan.
    const descanso = BODY_REST_BASE + aguante * BODY_REST_PER_AGUANTE + perks.recovery;
    state.damage = addBodyDamage(state.damage, desgaste + cargaDeLaCarta - descanso);
    if (lesionDePretemporada) state.damage = addBodyDamage(state.damage, PRESEASON_INJURY_BODY);

    // El tackle causa la mitad de las lesiones y la conmoción es la número uno.
    // Un tirón por partido, y el que más se expone es el que más tackle mete —
    // `exposicion` es la misma que la de la lesión del año, y por eso vive
    // arriba: son el mismo hecho del rugby contado dos veces.
    let hia = 0;
    for (let i = 0; i < partidos; i += 1) {
        if (rng.chance(HIA_RISK_PER_MATCH * exposicion)) hia += 1;
    }
    if (hia > 0) {
        state.damage = addHeadDamage(state.damage, hia);
        // Y ADEMÁS CUESTA VISIÓN. Hasta acá la cuenta de la cabeza subía y no la
        // leía nadie: un HIA valía exactamente lo mismo que no tenerlo, en un
        // juego que declara que el protocolo de conmoción no se banaliza. El
        // seguimiento neurológico evita esta línea; la cuenta sube igual.
        applyHeadRegression(player, hia, perks);
        notas.push(hia === 1 ? 'Diste positivo en un HIA.' : `Diste positivo en ${hia} HIA.`);
    }

    // ── 10 · EL PUNTAJE DE LA TEMPORADA ─────────────────────────────────────
    // Va acá, entre el cuerpo y el envejecimiento, porque necesita la temporada
    // terminada —planilla, partidos, copas— y porque de él salen las TRES cosas
    // que vienen: la Pertenencia de este año, los premios de este año y el
    // mérito del que viene. Es el número que no existía y sin el cual no se
    // podía preguntar "¿esta temporada fue buena?".
    const rating = seasonRating({
        glory: stats.primary,
        expectedGlory: stats.expectedPrimary,
        share: clubShare,
        matchesPlayed: partidos,
        caps,
        titles: titulos.length,
    });

    // ── 11 · Pertenencia ────────────────────────────────────────────────────
    // Va con `clubShare` y no con el lugar en el equipo: la cancha con tu nombre
    // se construye jugando PARA EL CLUB. El año que te pasaste de gira sumás
    // menos por acá —y por eso los caps tienen su propia línea abajo: el club se
    // cuelga de vos igual, pero no es lo mismo que haber estado.
    //
    // ── ESTABA ARRIBA, ANTES DEL PUNTAJE, Y POR ESO NO PODÍA LEERLO (0.23.0) ──
    // El bloque vivía en el §7, doscientas líneas antes de que el puntaje de la
    // temporada existiera. Bajarlo acá no mueve una sola tirada —no consume azar
    // y nadie lee `state.belonging` en el medio—, y es lo que le da a la
    // hinchada el único dato que le importaba y no tenía: cómo jugaste.
    //
    // LOS TÍTULOS SON LOS DEL CLUB Y NADA MÁS. Antes entraba `titulos.length`,
    // que incluye los de tu selección, y eso hacía que ganar un Rugby
    // Championship construyera la cancha de tu club como si la hubieras ganado
    // con ellos. El comentario de `calibration.test.ts` lo marcaba como
    // discutible desde la 0.11.0; acá se decide. La selección paga en Cartel y
    // en caps, que tienen su propia línea.
    if (player.clubId) {
        const situacion = belongingSituation(state, player.clubId);
        let delta = BELONGING_PER_SEASON * (0.65 + clubShare * 0.35) * belongingFormFactor(rating);
        delta += titulosDeClub * BELONGING_PER_TITLE;
        delta += caps * BELONGING_PER_CAP;
        state.belonging = applyBelonging(state.belonging, delta, situacion);
    }

    // ── 12 · Envejecer ──────────────────────────────────────────────────────
    // La carta mueve lo que apuntó; los MINUTOS mueven el resto. Antes acá iba
    // `share` —tu lugar en el equipo— y por eso una lesión de media temporada no
    // frenaba el crecimiento: seguías siendo el titular, aunque de traje.
    //
    // Y encima corre `growthScale`: cuánto RINDE el trabajo de este año, que
    // sale entero de `growth.ts`. El mérito lee la temporada ANTERIOR —la última
    // fila del historial, que todavía no incluye esta— y eso es a propósito: lo
    // que empuja el crecimiento de un año es cómo te fue en el anterior, no cómo
    // te está yendo mientras crecés.
    const anterior = state.history[state.history.length - 1];
    const { scale } = seasonGrowthScale(
        {
            age: player.age,
            stage: state.stage,
            clubLevel: club?.level ?? null,
            profile: player.developmentProfile,
            previous: anterior ? { rating: anterior.rating, track } : null,
        },
        rng,
    );

    const ovrDelta = ageOneSeason(player, rng, training, state.damage.cuerpo, rendimiento, {
        growthScale: scale,
        perks,
    });

    // LA LESIÓN GRAVE COBRA EN ATRIBUTOS, y va DESPUÉS de envejecer. El orden
    // importa: si cobrara antes, el crecimiento del año se repartiría sobre un
    // jugador ya castigado y la mordida se disolvería adentro de la misma
    // temporada. Cobrando después, la media puede CAER en un año que entrenaste
    // bien — que es exactamente lo que hace que una lesión se sienta como una
    // lesión.
    if (fechasDeLesion >= SERIOUS_INJURY_ROUNDS) {
        applySeriousInjuryRegression(player, rng, perks);
        notas.push('Volviste de la lesión sin las piernas de antes.');
    }

    if (state.rival) state.rival = ageRival(state.rival, player.age, rng);

    // ── 13 · Los premios de la temporada ────────────────────────────────────
    // El rng va re-sembrado adentro de `evaluateSeasonAwards` y NO toca el
    // stream de la carrera: agregar o recalibrar un premio no mueve una sola
    // tirada del resto del motor.
    // La banda sale del CLUB RESUELTO y no del id de competición: en las ligas
    // domésticas argentinas la banda depende además de `divisionTier`, que es un
    // campo del club y que `resolveClub` acaba de corregir si ascendió.
    const banda = club ? sportingBandOf(club) : 0;
    const premios: SeasonAwardId[] = evaluateSeasonAwards({
        ovr: player.ovr,
        rating,
        matchesPlayed: partidos,
        band: banda,
        leaguePosition: standing.position,
        leagueTeams: standing.teams,
        track,
        careerSeed: state.seed,
        season: state.season,
    });
    for (const id of premios) state.awards.push({ id, season: state.season });

    // ── 14 · Ascenso y descenso ─────────────────────────────────────────────
    // Se resuelve con la temporada YA jugada: el ascenso se gana en la última
    // fecha y se cobra en la pretemporada siguiente. La fila del historial
    // conserva la competición en la que se jugó, que es la verdad de ese año.
    let movimiento: DivisionMove | null = null;
    if (player.clubId && competitionId) {
        movimiento = applyDivisionMove(
            state.divisions, player.clubId, competitionId, standing.position, standing.teams,
        );
        if (movimiento) {
            const destino = competitionLabelOf(movimiento.to);
            notas.push(movimiento.direction === 'promotion'
                ? `Tu club ascendió: la que viene se juega en ${destino}.`
                : `Tu club descendió a ${destino}.`);
        }
    }

    // ── 15 · Los hitos ──────────────────────────────────────────────────────
    // Se detectan, no se otorgan, y no consumen azar. Van al final porque miran
    // el estado ya cerrado: el título que acabás de ganar cuenta para el primero.
    const hitos = detectMilestones(state, {
        matchesPlayed: partidos,
        band: banda,
        clubCountry: club?.countryCode ?? null,
        track,
    });
    for (const hito of hitos) {
        state.milestones.push(hito);
        // El hito se cuenta en la fila del año además de guardarse en la línea
        // de tiempo del retiro. Son dos lecturas distintas del mismo hecho: acá
        // es la noticia del año, allá es la forma de la carrera.
        notas.push(hito.text);
    }

    // ── 16 · Quién te quiere ────────────────────────────────────────────────
    state.offers = generateOffers(
        {
            player,
            stage: state.stage,
            // El contrato llega VALIDADO —club y vigencia— desde el único lugar
            // que sabe leerlo. `generateOffers` solo pregunta cuántas temporadas
            // le quedan, que es lo que decide si hay mesa.
            contract: currentContract(state),
            scouted: track === 'm20' || track === 'a-xv' || track === 'nacional',
            // DERIVADO del historial, nunca guardado (§1.9). No alcanza con la
            // etapa de hoy: el que volvió a su club es amateur otra vez y sin
            // embargo ya dio el salto, así que el mercado del exterior no se le
            // vuelve a cerrar. Las filas de temporada ya guardan la etapa con la
            // que se jugó cada año, así que la respuesta ya está en el estado.
            everProfessional: state.stage === 'professional'
                || state.history.some((h) => h.stage === 'professional'),
            season: state.season,
            agent: hasRule(perks, 'representante'),
            // DERIVADO de la marca que dejó la vuelta a casa, nunca guardado
            // aparte (§1.9): el que volvió a terminar no recibe ofertas.
            farewell: inFarewell(player),
        },
        rng,
    );

    // ── 17 · Se sella dónde terminó el club ─────────────────────────────────
    // Va DESPUÉS del movimiento de división y guarda la competición en la que se
    // JUGÓ, no la nueva: la copa del año que viene se clasifica por dónde
    // terminaste este año, y este año jugaste en la división vieja. Guardar la
    // nueva le daría al recién ascendido la copa de una división que todavía no
    // disputó.
    state.lastStanding = standing.teams > 0 ? standing : null;

    // ── 18 · Se apagan los modificadores ────────────────────────────────────
    state.pendingPlayingTime = 0;
    state.pendingStatBoost = 0;
    state.pendingSanction = 0;
    state.pendingInjury = 0;

    // Y con ellos, LO QUE SE COMPRÓ CON FECHA. Los botines y la clínica de
    // contacto son modificadores de temporada como cualquier otro, así que el
    // tiempo les pasa en el mismo renglón: dos lugares distintos donde caduca lo
    // que caduca es como se olvida uno de los dos.
    for (const linea of tickShop(player)) notas.push(linea);

    const entry: CaptainSeasonEntry = {
        season: state.season,
        age: player.age,
        clubId: player.clubId,
        stage: state.stage,
        ovr: player.ovr,
        belonging: belongingOf(state.belonging, player.clubId),
        fame: state.fame,
        money: state.money,
        income: ingreso,
        matchesPlayed: partidos,
        glory: stats.primary,
        glorySecondary: stats.secondary,
        caps,
        trackId: track,
        nationalStatus: nt.status,
        calledUp: nt.calledUp,
        lostShirt: nt.lostShirt,
        share: clubShare,
        rating,
        titles: titulos,
        awards: premios,
        leaguePosition: standing.position,
        leagueTeams: standing.teams,
        divisionMove: movimiento?.direction ?? null,
        training: training?.id ?? null,
        headDamage: state.damage.cabeza,
        bodyDamage: state.damage.cuerpo,
        decisionText: null,
        note: notas.length > 0 ? notas.join(' ') : null,
    };

    return {
        entry,
        ovrDelta,
        headline: headlineFor(entry, role, family.glory.primary.labelEs),
        milestones: hitos.map((h) => h.text),
        divisionMove: movimiento,
    };
}

/**
 * LOS TORNEOS DEL CALENDARIO QUE EL JUGADOR VA A JUGAR ÉL MISMO.
 *
 * Hoy es uno solo —el Mundial— porque es el único torneo jugable que además
 * existe en el calendario internacional: el Argentino Juvenil y el M20 son
 * catálogo propio y el sorteo de uniones nunca opinó sobre ellos.
 *
 * ── El orden importa, así que queda dicho ──
 * Esto se evalúa DENTRO de `simulateSeason`, y la compuerta del Mundial mira
 * tres cosas: la edad, el escalón y el año de edición. La edad no se toca acá,
 * el año tampoco, y el escalón ya quedó fijado más arriba (§ los caps). O sea
 * que da lo mismo que el reducer vuelva a preguntar después de esta función:
 * las dos respuestas son la misma.
 *
 * Si algún día un torneo se abriera por MEDIA, esto dejaría de valer —la media
 * sí se mueve adentro de la temporada— y habría que mover la pregunta afuera.
 */
function playedCompetitionIds(state: CaptainState): readonly string[] {
    return tournamentDue(state) === 'mundial-mayor' ? [WORLD_CUP_ID] : [];
}

/**
 * La línea que resume la temporada. Crónica, no planilla.
 *
 * LA CAMISETA SE DERIVA DE LA EDAD DE LA FILA (`FIRST_TEAM_AGE`) y no se guarda:
 * la fila ya trae `age`, así que preguntar «¿esto fue en juveniles?» no necesita
 * un campo nuevo ni migrar el guardado (§1.9). Y hace falta preguntarlo: a los
 * 16 el pibe no juega de titular de primera, juega de titular en juveniles, y
 * una crónica que no lo distinga cuenta un debut que no pasó.
 */
function headlineFor(entry: CaptainSeasonEntry, role: string, gloryLabel: string): string {
    const juveniles = entry.age < FIRST_TEAM_AGE;
    if (entry.matchesPlayed === 0) {
        return juveniles ? 'Año de juveniles sin jugar un partido.' : 'Temporada sin jugar un partido.';
    }

    const partidos = `${entry.matchesPlayed} ${entry.matchesPlayed === 1 ? 'partido' : 'partidos'}`;
    const gloria = `${entry.glory} ${gloryLabel.toLowerCase()}`;
    const rol = role === 'titular' ? 'de titular'
        : role === 'rotacion' ? 'entrando y saliendo'
            : role === 'banco' ? 'desde el banco'
                : 'casi sin lugar';

    const caps = entry.caps > 0 ? `, y ${entry.caps} ${entry.caps === 1 ? 'cap' : 'caps'} con la mayor` : '';
    const donde = juveniles ? ' en juveniles' : '';
    return `${partidos}${donde} ${rol}: ${gloria}${caps}.`;
}
