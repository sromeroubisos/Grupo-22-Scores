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

import type { CaptainState } from '../types/captain.ts';
import type { CaptainSeasonEntry } from '../types/season.ts';
import type { Rng } from './random.ts';
import { FAME_MAX, FAME_MIN } from '../types/currencies.ts';
import { MATCH_CAP_PER_SEASON } from '../types/season.ts';
import { getFamily } from '../data/positions.ts';
import { getTraining } from '../data/trainings.ts';
import { clubLeague, competitionLabelOf, getClub } from '../data/catalogs.ts';
import { applyBelonging, belongingOf } from './belonging.ts';
import { addBodyDamage, addHeadDamage } from './damage.ts';
import { applyMoney } from './money.ts';
import { ageOneSeason } from './aging.ts';
import { playingTimeOf, seasonStats } from './statistics.ts';
import { clubRatingOf, generateOffers, wonCompetition } from './clubs.ts';
import { ageRival, capsThisSeason, higherTrack, reachableTrack, TRACK_LABEL } from './national-team.ts';
import { belongingSituation } from './contracts.ts';

/** Partidos que da la temporada de un club, antes de tu disponibilidad. */
const CLUB_MATCHES = 22;

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
 * Lo que descansa el cuerpo en la pretemporada, siempre.
 *
 * Es exactamente lo que rendía UNA ficha de familia, que era la mediana de los
 * repartos: así el reloj del cuerpo —y con él la edad de retiro, que lo lee para
 * adelantar el tope blando— queda donde estaba para la carrera típica. Sacar las
 * fichas era un cambio de superficie y no de esperanza de vida; si el número
 * fuera otro, estaríamos moviendo dos cosas en el mismo commit.
 */
const BODY_REST_PER_SEASON = 3.5;

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

    // ── 1 · Cuánto jugás ────────────────────────────────────────────────────
    // Los minutos que cuesta la carta entran por el MISMO eje que el
    // `playingTime` de una decisión: son escalones, no una resta de partidos.
    // Así el que eligió la carta cara pierde lugar en el equipo de verdad —con
    // el efecto que eso arrastra sobre el crecimiento general, la Pertenencia y
    // la planilla— y no solo un par de fechas en la cuenta final.
    const clubRating = clubRatingOf(player.clubId);
    const minutosResignados = training?.cost?.minutes ?? 0;
    const { share, role } = playingTimeOf(
        player,
        clubRating,
        state.damage.cuerpo,
        state.pendingPlayingTime - minutosResignados,
    );

    // El riesgo de la pretemporada. SE TIRA SIEMPRE, haya o no carta y tenga o
    // no riesgo: si la tirada dependiera de lo elegido, el stream dependería de
    // la decisión y dos partidas con la misma semilla dejarían de ser
    // comparables. Es la misma regla que el ruido de `aging.ts`.
    const tirada = rng.float(0, 1);
    const lesionDePretemporada = tirada < (training?.cost?.injuryRisk ?? 0);

    let partidosDeClub = Math.round(CLUB_MATCHES * share);
    if (lesionDePretemporada) {
        partidosDeClub = Math.round(partidosDeClub * (1 - PRESEASON_INJURY_COST));
        notas.push('Te rompiste en la pretemporada y volviste con el torneo empezado.');
    }
    if (state.pendingSanction > 0) {
        partidosDeClub = Math.max(0, partidosDeClub - state.pendingSanction);
        notas.push(`Te comiste ${state.pendingSanction} ${state.pendingSanction === 1 ? 'fecha' : 'fechas'} de suspensión.`);
    }

    // ── 2 · La escalera representativa ──────────────────────────────────────
    // Hoy te miran por la media y nada más. Hasta 0.6.0 la ficha del gimnasio
    // del PlaDAR sumaba un empuje acá, y era la única palanca que el jugador
    // tenía sobre esta escalera: se fue con las fichas y vuelve como
    // convocatoria jugable, que es donde tiene que estar.
    const track = reachableTrack(player, state.rival?.ovr ?? null);
    const caps = capsThisSeason(player, track, state.rival, rng);

    state.national.track = track;
    state.national.bestTrack = higherTrack(state.national.bestTrack, track);
    state.national.caps += caps;
    if (caps > 0 && state.national.debutSeason === null) {
        state.national.debutSeason = state.season;
        state.fame = Math.min(FAME_MAX, state.fame + 20);
        notas.push('Debutaste con la mayor.');
    }

    // ── 3 · El techo de 30 ──────────────────────────────────────────────────
    // Directrices de World Rugby, octubre de 2025. Pasarse no está prohibido:
    // está caro. Es lo que le pasa hoy a los Pumas que juegan en Francia.
    let partidos = partidosDeClub + caps;
    if (partidos > MATCH_CAP_PER_SEASON) {
        const exceso = partidos - MATCH_CAP_PER_SEASON;
        partidos = MATCH_CAP_PER_SEASON;
        state.damage = addBodyDamage(state.damage, exceso * 1.6);
        notas.push(`Te pasaste del límite de treinta partidos. El cuerpo lo anotó.`);
    }
    state.matches.played = partidos;

    // ── 4 · La planilla del puesto ──────────────────────────────────────────
    const stats = seasonStats(player, partidos, rng, state.pendingStatBoost);

    // ── 5 · El club ─────────────────────────────────────────────────────────
    const titulos: string[] = [];
    if (player.clubId && wonCompetition(player.clubId, share, state.season)) {
        const club = getClub(player.clubId);
        const label = clubLeague(player.clubId)?.labelEs ?? competitionLabelOf(club.competitionId) ?? 'el torneo';
        state.titles.push({
            season: state.season,
            competitionId: club.competitionId,
            labelEs: label,
            clubId: player.clubId,
            kind: 'club',
        });
        titulos.push(label);
    }

    // ── 6 · Pertenencia ─────────────────────────────────────────────────────
    if (player.clubId) {
        const situacion = belongingSituation(state, player.clubId);
        let delta = BELONGING_PER_SEASON * (0.65 + share * 0.35);
        delta += titulos.length * BELONGING_PER_TITLE;
        delta += caps * BELONGING_PER_CAP;
        state.belonging = applyBelonging(state.belonging, delta, situacion);
    }

    // ── 7 · Cartel ──────────────────────────────────────────────────────────
    let fama = caps * 0.8 + titulos.length * 3 + share * 0.6;
    if (track === 'nacional') fama += 1.5;
    state.fame = Math.min(FAME_MAX, Math.max(FAME_MIN, Math.round((state.fame + fama) * 10) / 10));

    // ── 8 · Plata ───────────────────────────────────────────────────────────
    if (state.stage === 'professional' && player.clubId) {
        const club = getClub(player.clubId);
        const sueldo = Math.round(club.rating * 900);
        state.money = applyMoney(state.money, sueldo, state.stage);
    }

    // ── 9 · El cuerpo y la cabeza ───────────────────────────────────────────
    // Lo que se lleva la carta va del lado del desgaste y no del descanso: una
    // pretemporada a doble turno no es "descansar menos", es sumar carga. Con el
    // descanso fijo en 3,5, una carta de 2,5 te deja el año en apenas un punto
    // de recuperación — no te rompe de golpe, te deja sin margen para el resto.
    const aguante = player.attrs.aguante;
    const desgaste = partidos * BODY_PER_MATCH * (1.25 - aguante / 200);
    const cargaDeLaCarta = training?.cost?.body ?? 0;
    state.damage = addBodyDamage(state.damage, desgaste + cargaDeLaCarta - BODY_REST_PER_SEASON);
    if (lesionDePretemporada) state.damage = addBodyDamage(state.damage, PRESEASON_INJURY_BODY);

    // El tackle causa la mitad de las lesiones y la conmoción es la número uno.
    // Un tirón por partido, y el que más se expone es el que más tackle mete.
    const exposicion = family.group === 'forward' ? 1.25 : 1;
    let hia = 0;
    for (let i = 0; i < partidos; i += 1) {
        if (rng.chance(HIA_RISK_PER_MATCH * exposicion)) hia += 1;
    }
    if (hia > 0) {
        state.damage = addHeadDamage(state.damage, hia);
        notas.push(hia === 1 ? 'Diste positivo en un HIA.' : `Diste positivo en ${hia} HIA.`);
    }

    // ── 10 · Envejecer ──────────────────────────────────────────────────────
    // La carta mueve lo que apuntó; el rendimiento mueve el resto.
    const ovrDelta = ageOneSeason(player, rng, training, state.damage.cuerpo, share);
    if (state.rival) state.rival = ageRival(state.rival, player.age, rng);

    // ── 11 · Quién te quiere ────────────────────────────────────────────────
    state.offers = generateOffers(
        {
            player,
            stage: state.stage,
            scouted: track === 'm20' || track === 'a-xv' || track === 'nacional',
            season: state.season,
        },
        rng,
    );

    // ── 12 · Se apagan los modificadores ────────────────────────────────────
    state.pendingPlayingTime = 0;
    state.pendingStatBoost = 0;
    state.pendingSanction = 0;

    const entry: CaptainSeasonEntry = {
        season: state.season,
        age: player.age,
        clubId: player.clubId,
        stage: state.stage,
        ovr: player.ovr,
        belonging: belongingOf(state.belonging, player.clubId),
        fame: state.fame,
        money: state.money,
        matchesPlayed: partidos,
        glory: stats.primary,
        glorySecondary: stats.secondary,
        caps,
        track: TRACK_LABEL[track],
        share,
        titles: titulos,
        training: training?.id ?? null,
        headDamage: state.damage.cabeza,
        bodyDamage: state.damage.cuerpo,
        decisionText: null,
        note: notas.length > 0 ? notas.join(' ') : null,
    };

    return { entry, ovrDelta, headline: headlineFor(entry, role, family.glory.primary.labelEs) };
}

/** La línea que resume la temporada. Crónica, no planilla. */
function headlineFor(entry: CaptainSeasonEntry, role: string, gloryLabel: string): string {
    if (entry.matchesPlayed === 0) return 'Temporada sin jugar un partido.';

    const partidos = `${entry.matchesPlayed} ${entry.matchesPlayed === 1 ? 'partido' : 'partidos'}`;
    const gloria = `${entry.glory} ${gloryLabel.toLowerCase()}`;
    const rol = role === 'titular' ? 'de titular'
        : role === 'rotacion' ? 'entrando y saliendo'
            : role === 'banco' ? 'desde el banco'
                : 'casi sin lugar';

    const caps = entry.caps > 0 ? `, y ${entry.caps} ${entry.caps === 1 ? 'cap' : 'caps'} con la mayor` : '';
    return `${partidos} ${rol}: ${gloria}${caps}.`;
}
