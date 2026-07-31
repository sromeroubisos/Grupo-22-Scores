// EL CAPITÁN — la temporada.
//
// El orden de este archivo ES el diseño del juego. Se juega, después se cobra,
// y recién después se envejece: si se envejeciera primero, la temporada la
// jugaría un jugador que todavía no existía.
//
// ── Adónde va cada ficha de ⏳ ──
//   entrenar  → crecimiento de atributos (`aging.ts`)
//   club      → Pertenencia, que es la vía barata a la camiseta
//   familia   → descanso: baja el desgaste del cuerpo
//   trabajar  → estabilidad: sin ninguna, la crisis te saca de la cancha
//   gimnasio  → te acerca al escalón representativo siguiente
//
// Ninguna es obviamente correcta, y esa es toda la idea.

import type { CaptainState } from '../types/captain.ts';
import type { CaptainSeasonEntry } from '../types/season.ts';
import type { Rng } from './random.ts';
import { FAME_MAX, FAME_MIN, TIME_SLOTS } from '../types/currencies.ts';
import { MATCH_CAP_PER_SEASON } from '../types/season.ts';
import { getFamily } from '../data/positions.ts';
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

/** Lo que suma cada ficha de ⏳ puesta en el club. La vía barata a la camiseta. */
const BELONGING_PER_CLUB_TOKEN = 0.8;

/** Título del torneo del club. */
const BELONGING_PER_TITLE = 5;

/**
 * Lo que suma cada cap. El club se cuelga de vos: que uno de los suyos juegue
 * para la mayor es del club tanto como tuyo.
 */
const BELONGING_PER_CAP = 0.8;

/** Desgaste del cuerpo por partido jugado. */
const BODY_PER_MATCH = 0.42;

/** Lo que descansa el cuerpo por cada ficha de familia. */
const BODY_PER_FAMILY_TOKEN = 3.5;

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

    // ── Las fichas de esta temporada ────────────────────────────────────────
    const fichas: Record<string, number> = {};
    for (const slot of TIME_SLOTS) fichas[slot] = state.time.spent[slot] ?? 0;

    // ── 1 · Cuánto jugás ────────────────────────────────────────────────────
    const clubRating = clubRatingOf(player.clubId);
    const { share, role } = playingTimeOf(player, clubRating, state.damage.cuerpo, state.pendingPlayingTime);

    let partidosDeClub = Math.round(CLUB_MATCHES * share);
    if (state.pendingSanction > 0) {
        partidosDeClub = Math.max(0, partidosDeClub - state.pendingSanction);
        notas.push(`Te comiste ${state.pendingSanction} ${state.pendingSanction === 1 ? 'fecha' : 'fechas'} de suspensión.`);
    }

    // ── 2 · La escalera representativa ──────────────────────────────────────
    // El gimnasio del PlaDAR te acerca al escalón siguiente: no te regala la
    // convocatoria, te sube la media efectiva con la que te miran.
    const empujeGimnasio = fichas.gimnasio * 1.2;
    const jugadorMirado = { ...player, ovr: player.ovr + empujeGimnasio };
    const track = reachableTrack(jugadorMirado);
    const caps = capsThisSeason(jugadorMirado, track, state.rival, rng);

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
    if (player.clubId && wonCompetition(player.clubId, share, rng)) {
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
        delta += fichas.club * BELONGING_PER_CLUB_TOKEN;
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
    const aguante = player.attrs.aguante;
    const desgaste = partidos * BODY_PER_MATCH * (1.25 - aguante / 200);
    state.damage = addBodyDamage(state.damage, desgaste - fichas.familia * BODY_PER_FAMILY_TOKEN);

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

    // ── 10 · Sin laburo no hay carrera ──────────────────────────────────────
    if (state.stage === 'amateur' && fichas.trabajar === 0 && rng.chance(0.4)) {
        state.pendingPlayingTime -= 1;
        notas.push('El año sin trabajo te lo cobró la vida: llegaste a marzo sin poder pagarte los viajes.');
    }

    // ── 11 · Envejecer ──────────────────────────────────────────────────────
    const ovrDelta = ageOneSeason(player, rng, fichas.entrenar, state.damage.cuerpo);
    if (state.rival) state.rival = ageRival(state.rival, player.age, rng);

    // ── 12 · Quién te quiere ────────────────────────────────────────────────
    state.offers = generateOffers(
        {
            player,
            stage: state.stage,
            scouted: track === 'm20' || track === 'a-xv' || track === 'nacional',
            season: state.season,
        },
        rng,
    );

    // ── 13 · Se apagan los modificadores ────────────────────────────────────
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
        time: { ...state.time.spent },
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
