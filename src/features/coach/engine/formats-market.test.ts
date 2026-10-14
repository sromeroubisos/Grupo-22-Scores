// Formatos por edición, ascensos y el mercado de entrenadores.
//
// Son los escenarios que tienen que funcionar sí o sí: el primero de una
// división con ascenso directo sube sin jugar un playoff que no corresponde; el
// reducido arma los cruces 2°-5° y 3°-4°; cada división desciende lo que dice su
// reglamento; los clubes se quedan sin técnico y el mercado elige candidatos; el
// jugador recibe propuestas cuando sus resultados lo justifican, puede aceptar
// una y seguir la carrera en otro club, y los bancos de los dos clubes quedan
// bien.

import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPETITIONS, getCompetition } from '../data/competitions.ts';
import {
    FORMAT_EDITIONS,
    formatFor,
    pickEdition,
    promotionSlotsOf,
    relegationSlotsOf,
    type FormatEdition,
} from '../data/formats.ts';
import type { CoachState, SeasonEntry, TableRow } from '../types/coach.ts';
import { stagePairs } from './bracket.ts';
import { marketTick, playerInterest, type PlayerProfile } from './market.ts';
import { createRng } from './random.ts';
import {
    FIRST_YEAR,
    acceptOffer,
    beginDecisions,
    closeSeason,
    createCareer,
    declineOffer,
    playPlayoffMatch,
    playSeason,
} from './run-season.ts';
import { directPromoted, movementOf, reducidoSeeds, titleSeeds } from './season.ts';
import { clubsIn, seedWorld, tickWorld, type WorldState } from './world.ts';

const PRIMERA_C = 'ar-urba-primera-c';
const PRIMERA_B = 'ar-urba-primera-b';
const TOP14 = 'ar-urba-top14';

function table(ids: readonly string[]): TableRow[] {
    return ids.map((clubId, i) => ({
        clubId,
        played: 26,
        won: 26 - i,
        drawn: 0,
        lost: i,
        pf: 500 - i * 10,
        pc: 200 + i * 10,
        tries: 60,
        bonusOf: 0,
        bonusDef: 0,
        points: 100 - i * 4,
    }));
}

const IDS = Array.from({ length: 14 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`);

/** Un plantel imbatible para la categoría: el club termina primero casi seguro. */
function dominant(state: CoachState): CoachState {
    return { ...state, squad: state.squad.map((p) => ({ ...p, level: 88, potential: 90 })) };
}

/** Un plantel que pelea arriba pero no suele salir primero. */
function contender(state: CoachState, level: number): CoachState {
    return { ...state, squad: state.squad.map((p) => ({ ...p, level, potential: Math.max(p.potential, level) })) };
}

/* ------------------------------------------------------------------ */
/* Los formatos                                                        */
/* ------------------------------------------------------------------ */

test('cada división jugable tiene su formato declarado, y las ediciones están en orden', () => {
    for (const comp of COMPETITIONS) {
        const editions = FORMAT_EDITIONS[comp.id];
        assert.ok(editions && editions.length > 0, `${comp.id} no tiene formato declarado`);
        for (let i = 1; i < editions.length; i++) {
            assert.ok(editions[i].fromYear > editions[i - 1].fromYear, `${comp.id}: ediciones fuera de orden`);
        }
    }
});

test('el formato respeta el grafo: no asciende quien no tiene a dónde, y lo que sube es lo que baja', () => {
    for (const comp of COMPETITIONS) {
        const f = formatFor(comp.id, FIRST_YEAR);
        if (!comp.promotesTo) assert.equal(f.promotion, null, `${comp.id} declara ascensos y no asciende a ninguna división`);
        if (!comp.relegatesTo) assert.equal(f.relegation, null, `${comp.id} declara descensos y no desciende a ninguna división`);
        if (comp.promotesTo) {
            assert.equal(
                promotionSlotsOf(f),
                relegationSlotsOf(formatFor(comp.promotesTo, FIRST_YEAR)),
                `${comp.id} sube ${promotionSlotsOf(f)} y ${comp.promotesTo} baja otra cantidad`,
            );
        }
        if (f.title.kind === 'playoff') assert.ok(f.title.size <= comp.teams, `${comp.id}: playoff más grande que la división`);
    }
});

test('URBA 2026: Primera A, B, C y Segunda no tienen playoff por el título; el Top 14 sí', () => {
    for (const id of ['ar-urba-primera-a', PRIMERA_B, PRIMERA_C, 'ar-urba-segunda']) {
        const f = formatFor(id, 2026);
        assert.equal(f.title.kind, 'table', `${id}: el primero tiene que ser campeón`);
        assert.equal(f.promotion?.champion, true);
        assert.deepEqual(f.promotion?.reducido, { from: 2, to: 5 });
        assert.equal(f.relegation?.direct, 2);
        assert.equal(f.rounds, 2, `${id}: se juega ida y vuelta`);
        assert.equal(f.status, 'verificado');
    }
    const top = formatFor(TOP14, 2026);
    assert.deepEqual(top.title, { kind: 'playoff', size: 4 });
    assert.equal(top.relegation?.direct, 2);
});

test('cada edición rige desde su año: un cambio de reglamento no reescribe las temporadas anteriores', () => {
    const e2026: FormatEdition = formatFor(PRIMERA_C, 2026);
    const e2028: FormatEdition = { ...e2026, fromYear: 2028, title: { kind: 'playoff', size: 4 }, promotion: null };
    const editions = [e2026, e2028];
    assert.equal(pickEdition(editions, 2026), e2026);
    assert.equal(pickEdition(editions, 2027), e2026);
    assert.equal(pickEdition(editions, 2028), e2028);
    assert.equal(pickEdition(editions, 2035), e2028, 'después de la última edición rige la última');
    // Una carrera en 2031 juega con lo último conocido.
    assert.equal(formatFor(PRIMERA_C, 2031), formatFor(PRIMERA_C, 2026));
});

/* ------------------------------------------------------------------ */
/* Ascensos, reducido y descensos                                      */
/* ------------------------------------------------------------------ */

test('primero en una división con ascenso directo: campeón y asciende, sin playoff ni reducido', () => {
    const f = formatFor(PRIMERA_C, 2026);
    const t = table(IDS);
    assert.deepEqual(titleSeeds(f, t), [], 'no hay playoff por el título');
    assert.deepEqual(directPromoted(f, t, 'c01'), ['c01']);
    // El reducido es del 2° al 5°: el campeón no está.
    assert.deepEqual(reducidoSeeds(f, t, ['c01']), ['c02', 'c03', 'c04', 'c05']);
    const m = movementOf(f, t, 'c01', 'c04');
    assert.deepEqual(m.promoted, ['c01', 'c04']);
    assert.deepEqual(m.relegated, ['c13', 'c14']);
});

test('el reducido arma 2° vs 5° y 3° vs 4°, con el mejor ubicado de local, y la final', () => {
    const seeds = ['c02', 'c03', 'c04', 'c05'];
    assert.deepEqual(stagePairs(seeds, 'semis', seeds), [
        ['c02', 'c05'],
        ['c03', 'c04'],
    ]);
    // Si pasan el 5° y el 3°, la final la abre el 3°, el mejor ubicado.
    assert.deepEqual(stagePairs(seeds, 'final', ['c05', 'c03']), [['c03', 'c05']]);
});

test('un playoff de seis: 3°-6° y 4°-5° en cuartos, y el 1° recibe al peor ubicado que quede', () => {
    const seeds = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
    assert.deepEqual(stagePairs(seeds, 'cuartos', seeds), [
        ['a3', 'a6'],
        ['a4', 'a5'],
    ]);
    assert.deepEqual(stagePairs(seeds, 'semis', ['a1', 'a2', 'a6', 'a4']), [
        ['a1', 'a6'],
        ['a2', 'a4'],
    ]);
});

test('cada división desciende lo que dice su reglamento', () => {
    const t = table(IDS);
    assert.deepEqual(movementOf(formatFor(TOP14, 2026), t, 'c03', null).relegated, ['c13', 'c14']);
    assert.deepEqual(movementOf(formatFor('ar-urba-tercera', 2026), t.slice(0, 11), 'c01', 'c02').relegated, ['c11']);
    assert.deepEqual(movementOf(formatFor('ar-urba-desarrollo', 2026), t.slice(0, 10), 'c01', null).relegated, []);
    // El Top 14 es el techo: su campeón no asciende a ningún lado.
    assert.deepEqual(movementOf(formatFor(TOP14, 2026), t, 'c03', null).promoted, []);
});

test('en el juego: salir primero en Primera C es ascenso directo como campeón, sin frenar en un playoff', () => {
    const club = clubsIn(seedWorld(), PRIMERA_C)[5];
    let hits = 0;
    for (let seed = 1; seed <= 12; seed++) {
        const s = playSeason({ ...dominant(createCareer(seed, club, 'estratega')), decisionsLeft: 0 });
        const entry = s.seasons[0];
        if (!entry || entry.position !== 1) continue;
        hits++;
        assert.equal(s.phase, 'season', 'el primero no tiene que jugar ninguna llave');
        assert.equal(entry.champion, true);
        assert.equal(entry.movement, 'ascenso');
        assert.equal(entry.promotedVia, 'campeon');
        assert.ok(
            !s.lastKnockout.some((t) => t.competitionId === PRIMERA_C && (t.homeId === club || t.awayId === club)),
            'jugó un cruce de su división siendo primero',
        );
        // El año que viene juega en Primera B.
        const next = closeSeason(s);
        assert.equal(next.competitionId, PRIMERA_B);
        assert.equal(next.world.divisions[club], PRIMERA_B);
        assert.equal(clubsIn(next.world, PRIMERA_B).length, getCompetition(PRIMERA_B)?.teams);
        assert.equal(clubsIn(next.world, PRIMERA_C).length, getCompetition(PRIMERA_C)?.teams);
    }
    assert.ok(hits >= 6, `el club dominante salió primero solo ${hits} de 12 veces`);
});

test('en el juego: del 2° al 5° en Primera C se juega el reducido, partido a partido, y el que lo gana asciende', () => {
    const club = clubsIn(seedWorld(), PRIMERA_C)[5];
    let reducidos = 0;
    for (let seed = 1; seed <= 60 && reducidos < 4; seed++) {
        let s = playSeason({ ...contender(createCareer(seed, club, 'estratega'), 42), decisionsLeft: 0 });
        if (s.phase !== 'playoff') continue;
        reducidos++;
        const p = s.playoff;
        assert.ok(p);
        assert.equal(p.kind, 'ascenso');
        assert.equal(p.stage, 'semis');
        const pos = s.lastTable.findIndex((r) => r.clubId === club) + 1;
        assert.ok(pos >= 2 && pos <= 5, `entró al reducido terminando ${pos}°`);
        const expectedRival = ({ 2: 5, 3: 4, 4: 3, 5: 2 } as Record<number, number>)[pos];
        const rival = p.homeId === club ? p.awayId : p.homeId;
        assert.equal(s.lastTable.findIndex((r) => r.clubId === rival) + 1, expectedRival);
        while (s.phase === 'playoff') s = playPlayoffMatch(s, 'plan');
        const entry = s.seasons[0];
        const final = s.lastKnockout.find((t) => t.competitionId === PRIMERA_C && t.bracket === 'ascenso' && t.stage === 'final');
        assert.ok(final, 'no se jugó la final del reducido');
        const winner = final.homePf >= final.awayPf ? final.homeId : final.awayId;
        assert.equal(entry.movement === 'ascenso', winner === club);
        if (winner === club) assert.equal(entry.promotedVia, 'reducido');
        assert.equal(entry.champion, false, 'el reducido no da el título');
        assert.ok(s.lastLeagueMovement?.promoted.includes(s.lastTable[0].clubId), 'el campeón no ascendió');
        assert.ok(s.lastLeagueMovement?.promoted.includes(winner), 'el ganador del reducido no ascendió');
    }
    assert.ok(reducidos >= 2, `en 60 semillas el club entró al reducido solo ${reducidos} veces`);
});

test('el tick respeta los movimientos jugados y las divisiones conservan su tamaño', () => {
    const world = seedWorld();
    const pc = clubsIn(world, PRIMERA_C);
    const decided = { [PRIMERA_C]: { promoted: [pc[3], pc[7]], relegated: [pc[12], pc[13]] } };
    const { world: next, moved } = tickWorld(world, createRng(5), decided, 2026);
    assert.equal(next.divisions[pc[3]], PRIMERA_B);
    assert.equal(next.divisions[pc[7]], PRIMERA_B);
    assert.equal(next.divisions[pc[12]], 'ar-urba-segunda');
    assert.equal(moved[pc[3]], 'ascenso');
    assert.equal(moved[pc[13]], 'descenso');
    for (const comp of COMPETITIONS) {
        assert.equal(clubsIn(next, comp.id).length, comp.teams, `${comp.id} cambió de tamaño`);
    }
});

/* ------------------------------------------------------------------ */
/* El mercado de entrenadores                                          */
/* ------------------------------------------------------------------ */

function profile(over: Partial<PlayerProfile> = {}): PlayerProfile {
    return {
        name: 'Jugador Test',
        reputation: 25,
        clubId: null,
        level: 4,
        regionId: 'urba',
        seasons: [],
        justFired: false,
        ...over,
    };
}

function goodSeasons(n: number): SeasonEntry[] {
    return Array.from({ length: n }, (_, i) => ({
        season: i + 1,
        year: 2026 + i,
        clubId: 'x',
        competitionId: PRIMERA_C,
        competitionName: 'Primera C',
        position: 1,
        teams: 14,
        points: 100,
        won: 24,
        drawn: 0,
        lost: 2,
        pf: 800,
        pc: 300,
        champion: true,
        movement: 'ascenso' as const,
        tdi: null,
        nacional: false,
        objectiveMet: true,
        objectiveText: '',
        verdict: '',
        pressure: 20,
        caja: 1000,
        decisions: [],
    }));
}

function badSeasons(n: number): SeasonEntry[] {
    return goodSeasons(n).map((s) => ({
        ...s,
        position: 13,
        champion: false,
        movement: 'descenso' as const,
        objectiveMet: false,
    }));
}

/** Los clubes sin banco, salvo el del jugador y los que esperan respuesta. Tiene que dar vacío. */
function emptyBenches(world: WorldState, except: readonly string[]): string[] {
    return Object.keys(world.divisions)
        .filter((id) => !except.includes(id))
        .filter((id) => !world.benches[id]);
}

test('al cierre los clubes cambian de técnico, el mercado cubre las vacantes y todos los bancos quedan ocupados', () => {
    let news = 0;
    let relegatedChanged = 0;
    let relegatedTotal = 0;
    let promotedChanged = 0;
    let promotedTotal = 0;
    for (let seed = 1; seed <= 10; seed++) {
        const { world: ticked, moved } = tickWorld(seedWorld(), createRng(seed), {}, 2026);
        const out = marketTick({
            seed,
            season: 2,
            year: 2027,
            world: ticked,
            moved,
            lastTable: [],
            player: profile({ clubId: null }),
            leftClubId: null,
        });
        news += out.market.news.length;
        assert.deepEqual(emptyBenches(out.world, out.market.offers.map((o) => o.clubId)), []);
        const changed = new Set(out.market.news.map((n) => n.clubId));
        for (const id of Object.keys(moved)) {
            if (moved[id] === 'descenso') {
                relegatedTotal++;
                if (changed.has(id)) relegatedChanged++;
            } else {
                promotedTotal++;
                if (changed.has(id)) promotedChanged++;
            }
        }
    }
    const perYear = news / 10;
    assert.ok(perYear >= 10 && perYear <= 80, `${perYear} cambios de técnico por año en 264 clubes`);
    // Descender te cuesta el técnico más seguido que ascender.
    assert.ok(
        relegatedChanged / relegatedTotal > promotedChanged / promotedTotal + 0.2,
        `cambian de técnico el ${relegatedChanged}/${relegatedTotal} de los que bajan y el ${promotedChanged}/${promotedTotal} de los que suben`,
    );
});

test('el mercado evalúa candidatos: un libre de mucho nombre en la bolsa consigue club', () => {
    const base = seedWorld();
    const world: WorldState = { ...base, freeAgents: [{ name: 'Candidato Fuerte', rep: 95, since: 2020 }] };
    for (let seed = 1; seed <= 5; seed++) {
        const out = marketTick({
            seed,
            season: 2,
            year: 2027,
            world,
            moved: {},
            lastTable: [],
            player: profile({ clubId: 'ninguno', reputation: 0 }),
            leftClubId: null,
        });
        assert.ok(
            out.market.news.some((n) => n.incoming === 'Candidato Fuerte'),
            `semilla ${seed}: el mejor libre de la bolsa no consiguió club`,
        );
    }
});

test('el jugador recibe propuestas cuando sus resultados lo justifican, y menos cuando no', () => {
    const world = seedWorld();
    const clubId = clubsIn(world, PRIMERA_C)[0];
    const run = (p: PlayerProfile) => {
        let total = 0;
        for (let seed = 1; seed <= 20; seed++) {
            const { world: ticked, moved } = tickWorld(world, createRng(seed), {}, 2026);
            total += marketTick({ seed, season: 2, year: 2027, world: ticked, moved, lastTable: [], player: p, leftClubId: null })
                .market.offers.length;
        }
        return total;
    };
    const strong = run(profile({ clubId, reputation: 55, seasons: goodSeasons(2) }));
    const weak = run(profile({ clubId, reputation: 10, seasons: badSeasons(2) }));
    assert.ok(strong >= 15, `con dos ascensos y nombre llegaron solo ${strong} propuestas en 20 cierres`);
    assert.ok(weak < strong / 2, `con dos descensos llegaron ${weak} propuestas contra ${strong}`);
});

test('el interés sube con el ascenso y con la reputación, y un salto de dos categorías cuesta', () => {
    const world = seedWorld();
    const pa = clubsIn(world, 'ar-urba-primera-a')[6];
    const plain = playerInterest(world, pa, null, profile({ clubId: 'x', reputation: 30, level: 4 })).interest;
    const promoted = playerInterest(world, pa, null, profile({ clubId: 'x', reputation: 30, level: 4, seasons: goodSeasons(1) }))
        .interest;
    const famous = playerInterest(world, pa, null, profile({ clubId: 'x', reputation: 60, level: 4 })).interest;
    const fromBase = playerInterest(world, pa, null, profile({ clubId: 'x', reputation: 30, level: 5 })).interest;
    assert.ok(promoted > plain, 'un ascenso no mejoró el interés');
    assert.ok(famous > plain, 'más reputación no mejoró el interés');
    assert.ok(fromBase < plain, 'saltar dos escalones no le costó nada');
});

test('el que se quedó sin club no queda bloqueado: siempre le llega alguna propuesta', () => {
    for (let seed = 1; seed <= 10; seed++) {
        const { world: ticked, moved } = tickWorld(seedWorld(), createRng(seed), {}, 2026);
        const out = marketTick({
            seed,
            season: 2,
            year: 2027,
            world: ticked,
            moved,
            lastTable: [],
            player: profile({ clubId: null, reputation: 2, seasons: badSeasons(3), justFired: true }),
            leftClubId: null,
        });
        assert.ok(out.market.offers.length > 0, `semilla ${seed}: un despedido sin ninguna propuesta`);
    }
});

/* ------------------------------------------------------------------ */
/* Aceptar una propuesta y seguir                                      */
/* ------------------------------------------------------------------ */

/** Una carrera con propuestas sobre la mesa en la pretemporada. */
function withOffers(): CoachState {
    const club = clubsIn(seedWorld(), PRIMERA_C)[5];
    for (let seed = 1; seed <= 80; seed++) {
        let s = playSeason({ ...dominant(createCareer(seed, club, 'estratega')), decisionsLeft: 0 });
        while (s.phase === 'playoff') s = playPlayoffMatch(s, 'plan');
        s = closeSeason(s);
        if (s.phase === 'preseason' && s.market.offers.length > 0) return s;
    }
    throw new Error('ninguna de 80 carreras recibió propuestas después de salir campeón');
}

test('aceptar una propuesta: la carrera sigue en el club nuevo, y los dos bancos quedan bien', () => {
    const s = withOffers();
    const offer = s.market.offers[0];
    const oldClub = s.clubId;
    assert.equal(s.world.benches[offer.clubId], undefined, 'el club que llama no puede tener técnico');

    const next = acceptOffer(s, offer.clubId);
    assert.equal(next.clubId, offer.clubId);
    assert.equal(next.competitionId, offer.competitionId);
    assert.equal(next.phase, 'preseason');
    assert.equal(next.season, s.season, 'cambiar de club no se come una temporada');
    assert.equal(next.seasons.length, s.seasons.length, 'se perdió la trayectoria');
    assert.equal(next.market.offers.length, 0, 'las otras propuestas no se cayeron');

    // El club que dejaste contrató a otro; el nuevo no tiene banco: sos vos.
    assert.ok(next.world.benches[oldClub], 'el club que dejaste quedó sin técnico');
    assert.equal(next.world.benches[offer.clubId], undefined);
    assert.ok(next.market.news.some((n) => n.clubId === oldClub && n.reason === 'salida'));
    for (const other of s.market.offers.slice(1)) {
        assert.ok(next.world.benches[other.clubId], `${other.clubId} quedó esperando para siempre`);
    }
    assert.deepEqual(emptyBenches(next.world, [next.clubId]), []);

    // La historia: el ciclo anterior cerrado en la temporada que se jugó, el nuevo abierto.
    const h = next.history;
    assert.equal(h[h.length - 2].toSeason, s.season - 1);
    assert.deepEqual(h[h.length - 1], { clubId: offer.clubId, fromSeason: s.season, toSeason: null });

    // Y se puede jugar la temporada en el club nuevo.
    let played = playSeason({ ...beginDecisions(next), decisionsLeft: 0 });
    while (played.phase === 'playoff') played = playPlayoffMatch(played, 'orden');
    const entry = played.seasons[played.seasons.length - 1];
    assert.equal(entry.clubId, offer.clubId);
    assert.equal(entry.competitionId, offer.competitionId);
});

test('rechazar una propuesta: el club contrata a otro y la propuesta se va', () => {
    const s = withOffers();
    const offer = s.market.offers[0];
    const next = declineOffer(s, offer.clubId);
    assert.ok(!next.market.offers.some((o) => o.clubId === offer.clubId));
    assert.ok(next.world.benches[offer.clubId], 'el club que rechazaste quedó sin técnico');
    assert.equal(next.clubId, s.clubId);
});

test('arrancar la temporada sin contestar: las propuestas se caen y esos clubes contratan a otro', () => {
    const s = withOffers();
    const next = beginDecisions(s);
    assert.equal(next.market.offers.length, 0);
    for (const o of s.market.offers) assert.ok(next.world.benches[o.clubId], `${o.clubId} quedó sin técnico`);
});

test('el despido mueve el mundo igual: el club que te echó contrata a otro y te llegan propuestas', () => {
    const club = clubsIn(seedWorld(), PRIMERA_C)[5];
    let s = playSeason({ ...createCareer(3, club, 'estratega'), decisionsLeft: 0 });
    while (s.phase === 'playoff') s = playPlayoffMatch(s, 'plan');
    const fired = closeSeason({ ...s, pressure: 100 });
    assert.equal(fired.phase, 'fired');
    assert.equal(fired.season, s.season + 1, 'el año no avanzó');
    assert.ok(fired.world.benches[club], 'el club que te echó quedó sin técnico');
    assert.ok(fired.market.offers.length > 0, 'despedido y sin ninguna propuesta');
});

test('mismo estado, misma semilla: el mercado es determinista', () => {
    const a = withOffers();
    const b = withOffers();
    assert.deepEqual(a.market, b.market);
    assert.deepEqual(a.world.benches, b.world.benches);
});
