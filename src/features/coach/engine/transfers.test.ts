// El mercado de jugadores (etapa 3): determinismo, puertas, restricciones y las
// distribuciones medidas en cientos de carreras.
//
// LOS NÚMEROS MEDIDOS (2026-10-14, motor 2.2.0, 200 carreras × 12 temporadas,
// el jugador resuelve el mercado al azar con `market-policy.ts`). Ofertas por
// titular y por temporada (las dos ventanas), por tercio de nivel del XV:
//
//   estatus      alto   medio   bajo    parte del exterior
//   amateur      0,24   0,09    0,02     3 %   (solo por vía declarada)
//   viáticos     0,29   0,12    0,03    33 %   (el techo de una rama del interior
//                                               no tiene arriba más que el Top 14)
//   semipro      0,40   0,28    0,10   100 %   (el Top 14 es el techo del país)
//
// Por dónde llegan (4.605 ofertas): 3.183 de clubes de acá, 654 del mercado
// abierto, 710 por convenio, 39 de una franquicia y 19 de una academia. De las
// 768 del exterior a jugadores sin contrato, ninguna por fuera de una vía
// declarada.
//
// A igual nivel frente a su división, el titular con nota de 6,2 o más recibe
// entre 0,05 y 0,09 ofertas por ventana; el que estuvo en el plantel y no jugó,
// ninguna (100 carreras).
//
// Los planteles amateurs no se vacían (80 carreras de clubes amateurs): entre
// 23 y 26 en todas las temporadas, aceptando todo y rechazando todo. La fuerza
// media del XV (carreras que siguen en pie) va de 14,7 a 17,7 aceptando todo y
// de 14,9 a 17,7 rechazando todo: el que vende recupera con las llegadas y el
// M19, y el crecimiento de los pibes manda más que el mercado.

import assert from 'node:assert/strict';
import test from 'node:test';
import { getEvent } from '../data/events/index.ts';
import { COACH_PROFILES } from '../data/profiles.ts';
import { statusOf, type ProStatus } from '../data/professionalism.ts';
import { TRANSFER_PATHWAYS, getPathway } from '../data/transfer-pathways.ts';
import type { CoachState, PlayerStats, SquadPlayer } from '../types/coach.ts';
import { autoResolveWindow, type MarketPolicy } from './market-policy.ts';
import { createRng } from './random.ts';
import {
    acknowledgeReveal,
    beginDecisions,
    chooseOption,
    closeMarketWindow,
    closeSeason,
    createCareer,
    nextTramo,
    playPlayoffMatch,
    simulateTramo,
} from './run-season.ts';
import { emptyStats, startingXV, teamRating } from './squad.ts';
import {
    FOREIGN_CLUBS,
    SQUAD_MAX,
    SQUAD_MIN,
    acceptPlayerOffer,
    clubAttraction,
    divisionLevel,
    foreignClub,
    generateArrivals,
    generateOffers,
    inSeasonRef,
    interestScore,
    loanPlayer,
    marketForeignClubs,
    offerChance,
    openWindow,
    pathwayAdmits,
    retainBlock,
    retainPlayer,
    rosterSize,
    signBlock,
    signCandidate,
    type FormRef,
} from './transfers.ts';
import { clubsIn, selectableClubs, seedWorld } from './world.ts';

const WORLD = seedWorld();
const CLUBS = selectableClubs(WORLD);
const byStatus = (st: ProStatus) => CLUBS.filter((id) => statusOf(WORLD.divisions[id]) === st);

/* ------------------------------------------------------------------ */
/* Determinismo                                                        */
/* ------------------------------------------------------------------ */

test('mismo estado, misma ventana: mismas ofertas y mismos candidatos, y mirar no corre el RNG de la carrera', () => {
    for (const clubId of [byStatus('amateur')[5], byStatus('viaticos')[3], byStatus('semipro')[2]]) {
        const s = createCareer(321, clubId, 'estratega');
        assert.ok(s.transfers.window, 'la pretemporada arranca sin ventana');
        const again = openWindow(s, 'pretemporada', null);
        assert.deepEqual(again.transfers.offers, s.transfers.offers);
        assert.deepEqual(again.transfers.arrivals, s.transfers.arrivals);
        assert.equal(again.rngState, s.rngState, 'abrir la ventana consumió el RNG de la carrera');
        assert.deepEqual(generateOffers(s, 'corta', null), generateOffers(s, 'corta', null));
        assert.deepEqual(generateArrivals(s, 'corta'), generateArrivals(s, 'corta'));
        // Resolver el mercado tampoco lo toca.
        const resolved = autoResolveWindow(s, 'azar', createRng(7));
        assert.equal(resolved.rngState, s.rngState, 'resolver la ventana consumió el RNG de la carrera');
        // Y la misma decisión da el mismo resultado.
        for (const o of s.transfers.offers) assert.deepEqual(acceptPlayerOffer(s, o.id), acceptPlayerOffer(s, o.id));
    }
});

test('una carrera con el mercado resuelto igual da lo mismo dos veces', () => {
    const run = () => {
        const rng = createRng(4);
        let s = createCareer(77, byStatus('viaticos')[0], 'formador');
        for (let y = 0; y < 3; y++) {
            s = autoResolveWindow(s, 'azar', rng);
            s = playYear(s, rng, 'azar');
            s = closeSeason(s);
            if (s.phase === 'fired') break;
        }
        return s;
    };
    assert.deepEqual(run(), run());
});

/* ------------------------------------------------------------------ */
/* Reglas                                                              */
/* ------------------------------------------------------------------ */

/** Hunde la caja hasta la deuda "complicada" (cuatro meses de lo que entra). */
function inDebt(s: CoachState): CoachState {
    return { ...s, club: { ...s.club, finances: { ...s.club.finances, caja: -60_000_000 } } };
}

test('con la deuda complicada no se retiene con plata ni se incorpora a nadie que cobre', () => {
    let checkedRetain = 0;
    let checkedSign = 0;
    for (const clubId of [...byStatus('viaticos').slice(0, 6), ...byStatus('semipro').slice(0, 6)]) {
        const s = inDebt(createCareer(55, clubId, 'estratega'));
        for (const o of s.transfers.offers) {
            assert.match(retainBlock(s, o.id) ?? '', /deuda/);
            assert.equal(retainPlayer(s, o.id), s);
            checkedRetain++;
        }
        const roomy = { ...s, squad: s.squad.slice(0, SQUAD_MIN) };
        for (const c of roomy.transfers.arrivals.filter((a) => a.player.deal.monthly > 0)) {
            assert.match(signBlock(roomy, c.id) ?? '', /deuda/);
            assert.equal(signCandidate(roomy, c.id), roomy);
            checkedSign++;
        }
    }
    assert.ok(checkedRetain + checkedSign > 5, `se miraron ${checkedRetain} retenciones y ${checkedSign} incorporaciones`);
});

test('con el plantel lleno (26 contando cedidos) no se incorpora: hay que liberar', () => {
    const s = createCareer(9, byStatus('amateur')[0], 'estratega');
    assert.equal(rosterSize(s), SQUAD_MAX);
    for (const c of s.transfers.arrivals) assert.match(signBlock(s, c.id) ?? '', /completo/);
});

test('el cedido no juega: no está en el plantel en toda la temporada y vuelve al cierre con crecimiento extra', () => {
    let s = createCareer(31, byStatus('amateur')[12], 'formador');
    const kid = [...s.squad].sort((a, b) => a.age - b.age || a.id.localeCompare(b.id))[0];
    s = loanPlayer(s, kid.id);
    assert.equal(s.transfers.loaned.length, 1);
    assert.equal(rosterSize(s), SQUAD_MAX, 'el cedido dejó de contar para el tope');
    s = beginDecisions(s);
    const rng = createRng(3);
    for (let guard = 0; guard < 80 && s.phase !== 'season'; guard++) {
        assert.ok(!s.squad.some((p) => p.id === kid.id), `el cedido está en el plantel en la fase ${s.phase}`);
        s = step(s, rng, 'rechaza');
    }
    assert.equal(s.transfers.loaned[0].player.stats.apps, 0, 'el cedido sumó partidos para el club');
    const closed = closeSeason(s);
    if (closed.phase === 'fired') return;
    const back = closed.squad.find((p) => p.id === kid.id);
    assert.ok(back, 'el cedido no volvió');
    assert.ok(back.level > kid.level, 'volvió sin crecer');
    assert.equal(back.fatigue, 0);
    assert.equal(closed.transfers.loaned.length, 0);
});

test('las vías declaradas existen en el catálogo de Carrera, y el mercado usa una parte medida de sus 558 clubes', () => {
    assert.equal(FOREIGN_CLUBS.length, 558, 'el catálogo del exterior cambió de tamaño');
    for (const p of TRANSFER_PATHWAYS) {
        for (const league of p.leagues) assert.ok(FOREIGN_CLUBS.some((c) => c.league === league), `${p.id}: la liga ${league} no existe`);
    }
    // Medido: 319 clubes en 29 ligas. 234 en las 22 ligas del mercado abierto
    // (las profesionales y semiprofesionales), más los de las vías declaradas
    // que son amateurs (Fédérale 1, DH Élite, Serie A), los de la región
    // (Uruguay, Chile, Paraguay, Brasil) y los de las ligas de donde vuelve el
    // que se fue. El resto —amateurs de otros continentes— no llama nunca: no
    // hay vía declarada hacia ellos.
    const used = marketForeignClubs();
    assert.equal(used.length, 319, `el mercado usa ${used.length} clubes del catálogo`);
    assert.equal(new Set(used.map((c) => c.league)).size, 29);
});

/* ------------------------------------------------------------------ */
/* El interés                                                          */
/* ------------------------------------------------------------------ */

test('el que se destaca despierta más interés que uno de su mismo nivel que no juega', () => {
    // Medido en el harness (200 carreras): a igual nivel frente a su división,
    // el titular con nota de 6,2 o más recibe entre 0,05 y 0,09 ofertas por
    // ventana; el que no jugó ni un partido, ninguna.
    let compared = 0;
    for (const clubId of [byStatus('amateur')[2], byStatus('viaticos')[1], byStatus('semipro')[4]]) {
        const s = createCareer(41, clubId, 'estratega');
        const div = divisionLevel(s, s.competitionId);
        for (const p of startingXV(s.squad)) {
            const star: PlayerStats = { apps: 20, starts: 20, tries: p.group === 'fondo' ? 9 : 3, points: 45, tackles: 180, rating: 7.1 };
            const ref = (st: PlayerStats): FormRef => ({ stats: { [p.id]: st }, fixtures: 20 });
            const a = offerChance(interestScore(p, ref(star), div), 'pretemporada');
            const b = offerChance(interestScore(p, ref(emptyStats()), div), 'pretemporada');
            assert.ok(a >= b, `${p.name}: destacarse no sumó interés`);
            if (a > b) compared++;
        }
    }
    assert.ok(compared > 20, `solo en ${compared} casos destacarse cambió la chance`);
});

/* ------------------------------------------------------------------ */
/* Cientos de carreras                                                 */
/* ------------------------------------------------------------------ */

function step(s: CoachState, rng: ReturnType<typeof createRng>, mode: MarketPolicy): CoachState {
    if (s.phase === 'decision') {
        const ev = getEvent(s.pendingEventId as string);
        assert.ok(ev);
        return chooseOption(s, ev.options[rng.int(0, ev.options.length - 1)].id);
    }
    if (s.phase === 'reveal') return acknowledgeReveal(s);
    if (s.phase === 'playoff') return playPlayoffMatch(s, 'plan');
    if (s.phase === 'training' || s.phase === 'keymatch') return simulateTramo(s);
    if (s.phase === 'tramo') return nextTramo(s);
    if (s.phase === 'market') return closeMarketWindow(autoResolveWindow(s, mode, rng));
    return s;
}

function playYear(state: CoachState, rng: ReturnType<typeof createRng>, mode: MarketPolicy, onStep?: (s: CoachState) => void): CoachState {
    let s = beginDecisions(state);
    for (let guard = 0; guard < 80 && s.phase !== 'season'; guard++) {
        onStep?.(s);
        s = step(s, rng, mode);
    }
    assert.equal(s.phase, 'season');
    return s;
}

interface Sample {
    /** Ofertas por titular y temporada, por tercio (alto, medio, bajo), por estatus. */
    tercile: Record<ProStatus, { offers: number[]; seats: number[] }>;
    abroad: Record<ProStatus, { offers: number; abroad: number }>;
    /** Ofertas del exterior a alguien sin contrato que no pasan por una vía declarada. */
    outsidePathway: number;
    abroadNoContract: number;
    squadOutside: number;
    /** Fuerza media del XV en la temporada 1 y en la 12 (las carreras que llegan). */
    xvFirst: number[];
    xvLast: number[];
    minSquad: number;
}

function newSample(): Sample {
    const z = () => ({ offers: [0, 0, 0], seats: [0, 0, 0] });
    const a = () => ({ offers: 0, abroad: 0 });
    return {
        tercile: { amateur: z(), viaticos: z(), semipro: z() },
        abroad: { amateur: a(), viaticos: a(), semipro: a() },
        outsidePathway: 0,
        abroadNoContract: 0,
        squadOutside: 0,
        xvFirst: [],
        xvLast: [],
        minSquad: 99,
    };
}

function onWindow(sample: Sample, s: CoachState, preseason: boolean): void {
    const st = statusOf(s.competitionId);
    const offers = s.transfers.offers;
    sample.abroad[st].offers += offers.length;
    for (const o of offers) {
        if (!o.abroad) continue;
        sample.abroad[st].abroad++;
        const p = s.squad.find((x) => x.id === o.playerId) as SquadPlayer;
        if (p.deal.kind === 'contrato') continue;
        sample.abroadNoContract++;
        const way = o.pathwayId ? getPathway(o.pathwayId) : null;
        const club = foreignClub(o.clubId);
        if (!way || !club || !pathwayAdmits(way, p, club)) sample.outsidePathway++;
    }
    const xv = [...startingXV(s.squad)].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
    xv.forEach((p, i) => {
        const t = Math.min(2, Math.floor(i / 5));
        if (preseason) sample.tercile[st].seats[t]++;
        sample.tercile[st].offers[t] += offers.filter((o) => o.playerId === p.id).length;
    });
}

function harness(careers: number, mode: MarketPolicy, clubs: readonly string[]): Sample {
    const sample = newSample();
    for (let c = 0; c < careers; c++) {
        const rng = createRng(1000 + c);
        let s = createCareer(50_000 + c, clubs[c % clubs.length], COACH_PROFILES[c % COACH_PROFILES.length].id);
        const check = (x: CoachState) => {
            if (x.squad.length < SQUAD_MIN || rosterSize(x) > SQUAD_MAX) sample.squadOutside++;
            sample.minSquad = Math.min(sample.minSquad, x.squad.length);
        };
        for (let y = 0; y < 12; y++) {
            onWindow(sample, s, true);
            s = autoResolveWindow(s, mode, rng);
            check(s);
            s = playYear(s, rng, mode, (x) => {
                check(x);
                if (x.phase === 'market') onWindow(sample, x, false);
            });
            if (y === 0) sample.xvFirst.push(teamRating(s.squad));
            if (y === 11) sample.xvLast.push(teamRating(s.squad));
            s = closeSeason(s);
            if (s.phase === 'fired') break;
            check(s);
        }
    }
    return sample;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

let cached: Sample | null = null;
const broad = () => (cached ??= harness(200, 'azar', CLUBS));

test('un titular del tercio de arriba recibe más ofertas que uno del medio, y el del medio más que uno de abajo', () => {
    const s = broad();
    for (const st of ['amateur', 'viaticos', 'semipro'] as const) {
        const rate = s.tercile[st].offers.map((o, i) => o / Math.max(1, s.tercile[st].seats[i]));
        assert.ok(s.tercile[st].seats[0] > 50, `${st}: muy pocas temporadas medidas`);
        assert.ok(rate[0] > rate[1] && rate[1] > rate[2], `${st}: ofertas por tercio ${rate.map((r) => r.toFixed(2)).join(' / ')}`);
        // Ni un desierto ni una feria: el mejor tercio recibe entre una oferta
        // cada siete temporadas y una por temporada.
        assert.ok(rate[0] >= 0.14 && rate[0] <= 1, `${st}: el tercio de arriba recibe ${rate[0].toFixed(2)} por temporada`);
    }
});

test('la parte del exterior depende del estatus: casi nada en el amateur, toda en el Top 14', () => {
    const s = broad();
    const share = (st: ProStatus) => s.abroad[st].abroad / Math.max(1, s.abroad[st].offers);
    assert.ok(share('amateur') < 0.1, `amateur: ${(share('amateur') * 100).toFixed(1)} % del exterior`);
    assert.ok(share('viaticos') < 0.5, `viáticos: ${(share('viaticos') * 100).toFixed(1)} % del exterior`);
    assert.ok(share('semipro') > share('viaticos') && share('viaticos') > share('amateur'), 'el exterior no crece con el estatus');
});

test('ningún amateur, becado ni con viático recibe una oferta del exterior por fuera de una vía declarada', () => {
    const s = broad();
    assert.ok(s.abroadNoContract > 50, `solo ${s.abroadNoContract} ofertas del exterior a jugadores sin contrato: la prueba no prueba nada`);
    assert.equal(s.outsidePathway, 0, `${s.outsidePathway} ofertas del exterior pasaron por fuera de una vía declarada`);
});

test('los clubes amateurs no se vacían: ni aceptando todo ni rechazando todo', () => {
    const amateurs = byStatus('amateur');
    for (const mode of ['acepta', 'rechaza'] as const) {
        const s = harness(80, mode, amateurs);
        assert.equal(s.squadOutside, 0, `${mode}: el plantel salió de ${SQUAD_MIN}..${SQUAD_MAX}`);
        assert.ok(s.minSquad >= SQUAD_MIN);
        const first = mean(s.xvFirst);
        const last = mean(s.xvLast);
        // El XV no se desarma: a las doce temporadas no está más de dos puntos
        // de pirámide por debajo del primer año (medido: sube en los dos casos).
        assert.ok(last >= first - 2, `${mode}: la fuerza del XV cayó de ${first.toFixed(1)} a ${last.toFixed(1)}`);
    }
});

test('el atractivo del club y la ventana corta: hay candidatos en las dos ventanas y la chance se mueve con el club', () => {
    const big = createCareer(5, clubsIn(WORLD, 'ar-urba-top14')[0], 'estratega');
    const small = createCareer(5, byStatus('amateur')[40], 'estratega');
    assert.ok(clubAttraction(big) > clubAttraction(small), 'un club del Top 14 no atrae más que uno de la base');
    assert.ok(big.transfers.arrivals.length > 0 && small.transfers.arrivals.length > 0);
    // La ventana corta se abre con las estadísticas del tramo 1.
    let s = beginDecisions(small);
    const rng = createRng(2);
    for (let guard = 0; guard < 40 && s.phase !== 'market'; guard++) s = step(s, rng, 'rechaza');
    assert.equal(s.phase, 'market');
    assert.equal(s.transfers.window?.kind, 'corta');
    assert.ok(inSeasonRef(s).fixtures > 0, 'la ventana corta no ve el tramo 1');
});
