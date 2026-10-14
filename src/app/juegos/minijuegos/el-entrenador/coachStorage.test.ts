// La lectura de un guardado: qué se migra, qué se repara y qué se da por perdido.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CLUB_CATALOG_VERSION,
    COMPETITION_CATALOG_VERSION,
    ENGINE_VERSION,
    EVENTS_VERSION,
    GEO_VERSION,
    CARDS_PER_TRAMO,
    DEFAULT_TRAINING,
    acknowledgeReveal,
    beginDecisions,
    chooseOption,
    closeSeason,
    clubsIn,
    createCareer,
    getEvent,
    nextTramo,
    closeMarketWindow,
    loanPlayer,
    releasePlayer,
    openRenewalNegotiation,
    openSigningNegotiation,
    renewalNegotiationBlock,
    signingNegotiationBlock,
    playKeyFirstHalf,
    playKeySecondHalf,
    playPlayoffMatch,
    playSeason,
    seedWorld,
    simulateTramo,
    submitTraining,
    ACADEMY_MAX,
    ACADEMY_MIN,
    loanKid,
    observeCandidate,
    setDevPlan,
    signScout,
    toggleReserve,
    type CoachState,
} from '../../../../features/coach/index.ts';
import { SCHEMA, migrateSchema, readSavedCareer } from './coachStorage.ts';

const state = createCareer(11, 'sb-marabunta-r-c', 'estratega');

function payload(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        schema: SCHEMA,
        engineVersion: ENGINE_VERSION,
        clubCatalogVersion: CLUB_CATALOG_VERSION,
        competitionCatalogVersion: COMPETITION_CATALOG_VERSION,
        geoVersion: GEO_VERSION,
        eventsVersion: EVENTS_VERSION,
        savedAt: 1,
        state,
        ...overrides,
    });
}

test('un guardado de hoy vuelve idéntico y sin marcas de reparación', () => {
    const r = readSavedCareer(payload());
    assert.equal(r.kind, 'ok');
    if (r.kind !== 'ok') return;
    assert.deepEqual(r.state, state);
    assert.equal(r.repaired, false);
});

test('un catálogo o motor distinto NO borra la partida: se repara y se avisa', () => {
    for (const field of ['engineVersion', 'clubCatalogVersion', 'competitionCatalogVersion', 'geoVersion', 'eventsVersion']) {
        const r = readSavedCareer(payload({ [field]: '0.0.1' }));
        assert.equal(r.kind, 'ok', `${field} distinto tiró la partida`);
        if (r.kind === 'ok') assert.equal(r.repaired, true, `${field} distinto y no se avisó`);
    }
});

test('un guardado del futuro se da por perdido en vez de inventarle campos', () => {
    assert.equal(readSavedCareer(payload({ schema: 99 })).kind, 'outdated');
});

test('un esquema sin migrador se da por perdido', () => {
    assert.equal(readSavedCareer(payload({ schema: 0 })).kind, 'outdated');
});

test('basura, JSON sin estado y estado sin club: perdido, nunca una excepción', () => {
    assert.equal(readSavedCareer('{no es json').kind, 'outdated');
    assert.equal(readSavedCareer('null').kind, 'outdated');
    assert.equal(readSavedCareer(JSON.stringify({ schema: SCHEMA })).kind, 'outdated');
    assert.equal(readSavedCareer(payload({ state: { ...state, clubId: 'ARG_NADIE' } })).kind, 'outdated');
});

test('los migradores se aplican en cadena y en orden', () => {
    const migrations = {
        1: (s: Record<string, unknown>) => ({ ...s, a: 1 }),
        2: (s: Record<string, unknown>) => ({ ...s, b: (s.a as number) + 1 }),
    };
    assert.deepEqual(migrateSchema({}, 1, 3, migrations), { a: 1, b: 2 });
    assert.deepEqual(migrateSchema({ x: 0 }, 3, 3, migrations), { x: 0 }, 'sin distancia no se toca nada');
    assert.equal(migrateSchema({}, 2, 4, migrations), null, 'falta el migrador 3 y se inventó');
    assert.equal(migrateSchema({}, 4, 3, migrations), null, 'del futuro al pasado no hay camino');
});

test('un guardado del esquema 1 (sin mejoras ni evaluación) se migra y sigue la carrera', () => {
    // La forma exacta del esquema 1: el club sin `upgrades`, temporadas sin `board`.
    const clubV1: Record<string, unknown> = { ...state.club };
    delete clubV1.upgrades;
    const v1 = { ...state, club: clubV1 };
    const r = readSavedCareer(payload({ schema: 1, engineVersion: '1.0.0', state: v1 }));
    assert.equal(r.kind, 'ok');
    if (r.kind !== 'ok') return;
    assert.deepEqual(r.state.club.upgrades, {}, 'el club migrado arranca sin mejoras');
    assert.deepEqual(r.state.club.finances, state.club.finances, 'la caja no se toca');
    assert.equal(r.state.seed, state.seed);
    assert.equal(r.repaired, true, 'cambió la forma y no se avisó');
});

test('mejoras guardadas: las desconocidas se descartan y los niveles se acotan', () => {
    const club = { ...state.club, upgrades: { kinesiologia: 2, gimnasio: 9, tribuna: 1, video: -1 } };
    const r = readSavedCareer(payload({ state: { ...state, club } }));
    assert.equal(r.kind, 'ok');
    if (r.kind !== 'ok') return;
    assert.deepEqual(r.state.club.upgrades, { gimnasio: 3, kinesiologia: 2 });
});

test('un guardado del catálogo viejo (esquema 2) sigue con el mismo club, con su id del canon', () => {
    // Marabunta con su id de rugby-manager-pro, como quedó guardado antes del canon.
    const v2 = { ...state, clubId: 'ARG_MARABUNTA_CIPOLLETTI', history: [{ clubId: 'ARG_MARABUNTA_CIPOLLETTI', fromSeason: 1, toSeason: null }] };
    const r = readSavedCareer(payload({ schema: 2, state: v2 }));
    assert.equal(r.kind, 'ok');
    if (r.kind !== 'ok') return;
    assert.equal(r.state.clubId, 'sb-marabunta-r-c');
    assert.equal(r.state.history[0].clubId, 'sb-marabunta-r-c');
    assert.equal(r.state.world.divisions['sb-marabunta-r-c'], r.state.competitionId, 'el club quedó afuera de la pirámide');
    assert.equal(r.repaired, true);
});

/** Una partida como la guardaba el esquema 4: sin mercado, sin bancos, llave vieja. */
function asSchema4(s: CoachState): Record<string, unknown> {
    const v4: Record<string, unknown> = { ...s, world: { ratings: s.world.ratings, divisions: s.world.divisions } };
    delete v4.market;
    return v4;
}

test('un guardado del esquema 4 (sin mercado ni bancos) se migra: los otros clubes reciben técnico y el mercado arranca vacío', () => {
    const r = readSavedCareer(payload({ schema: 4, engineVersion: '1.3.0', state: asSchema4(state) }));
    assert.equal(r.kind, 'ok');
    if (r.kind !== 'ok') return;
    assert.deepEqual(r.state.market.offers, []);
    assert.equal(r.state.world.benches[r.state.clubId], undefined, 'el club del jugador no puede tener otro técnico');
    const sinBanco = Object.keys(r.state.world.divisions).filter(
        (id) => id !== r.state.clubId && !r.state.world.benches[id],
    );
    assert.deepEqual(sinBanco, []);
    assert.equal(r.state.clubId, state.clubId);
    assert.equal(r.state.seed, state.seed);
    assert.equal(r.repaired, true);
});

test('un guardado a mitad de un playoff de Primera C, que el reglamento 2026 ya no tiene, se resuelve con las reglas nuevas', () => {
    // El esquema 4 le hacía jugar semis y final al primero de Primera C. Una
    // partida guardada en esa llave no explota ni la sigue jugando: la fase
    // regular queda como se jugó y el primero sale campeón y asciende directo.
    const club = clubsIn(seedWorld(), 'ar-urba-primera-c')[5];
    const fresh = createCareer(4, club, 'estratega');
    const strong = { ...fresh, squad: fresh.squad.map((p) => ({ ...p, level: 88, potential: 90 })), decisionsLeft: 0 };
    const played = playSeason(strong);
    const seeds = played.lastTable.slice(0, 4).map((r) => r.clubId);
    assert.ok(seeds.includes(club), 'el club fuerte no quedó entre los cuatro primeros');
    const ratings: Record<string, number> = {};
    for (const id of seeds) ratings[id] = 30;
    const midPlayoff = {
        ...asSchema4(strong),
        phase: 'playoff',
        lastTable: played.lastTable,
        lastMatches: played.lastMatches,
        lastKnockout: [],
        seasons: [],
        playoff: {
            competitionId: 'ar-urba-primera-c',
            seeds,
            ratings,
            played: [],
            stage: 'semis',
            homeId: seeds[0],
            awayId: seeds[3],
            neutral: false,
        },
    };
    const r = readSavedCareer(payload({ schema: 4, engineVersion: '1.3.0', state: midPlayoff }));
    assert.equal(r.kind, 'ok');
    if (r.kind !== 'ok') return;
    const position = r.state.lastTable.findIndex((row) => row.clubId === club) + 1;
    if (position === 1) {
        assert.equal(r.state.phase, 'season', 'el primero quedó esperando un playoff que no existe');
        const entry = r.state.seasons[0];
        assert.equal(entry.champion, true);
        assert.equal(entry.movement, 'ascenso');
        assert.equal(entry.promotedVia, 'campeon');
    } else {
        // Del 2° al 5°: el reducido por el ascenso, con las reglas nuevas.
        assert.ok(r.state.phase === 'playoff' || r.state.phase === 'season');
        if (r.state.phase === 'playoff') assert.equal(r.state.playoff?.kind, 'ascenso');
    }
});

/** Una partida como la guardaba el esquema 5: jugadores sin ánimo ni vínculo, sin caja v2 ni objetivos. */
function asSchema5(s: CoachState): Record<string, unknown> {
    const v5: Record<string, unknown> = { ...s };
    delete v5.finance;
    delete v5.objectives;
    delete v5.project;
    v5.squad = s.squad.map((p) => ({
        id: p.id,
        name: p.name,
        number: p.number,
        position: p.position,
        age: p.age,
        level: p.level,
        potential: p.potential,
        ...('certified' in p ? { certified: (p as { certified?: unknown }).certified } : {}),
    }));
    return v5;
}

test('un guardado del esquema 5 (antes de la v2) se migra: cada jugador recibe sus campos nuevos, neutros y deterministas', () => {
    const raw = payload({ schema: 5, engineVersion: '1.4.0', state: asSchema5(state) });
    const a = readSavedCareer(raw);
    const b = readSavedCareer(raw);
    assert.equal(a.kind, 'ok');
    if (a.kind !== 'ok' || b.kind !== 'ok') return;
    assert.deepEqual(a.state, b.state, 'migrar dos veces el mismo guardado dio distinto');
    assert.equal(a.state.squad.length, state.squad.length);
    for (const p of a.state.squad) {
        assert.ok(Number.isFinite(p.morale) && Number.isFinite(p.fatigue), `${p.name} quedó sin ánimo o cansancio`);
        assert.equal(p.injury, 0);
        assert.ok(p.deal && typeof p.deal.kind === 'string', `${p.name} quedó sin vínculo`);
        assert.ok(p.stats, `${p.name} quedó sin estadísticas`);
    }
    assert.ok(a.state.finance, 'la caja v2 no se inicializó');
    assert.equal(a.state.clubId, state.clubId);
    assert.equal(a.state.seed, state.seed);
});

/* ------------------------------------------------------------------ */
/* Esquema 6 → 7: la temporada en tramos                               */
/* ------------------------------------------------------------------ */

/** Una partida como la guardaba el esquema 6: sin temporada en curso, sin semana fija, sin tackles. */
function asSchema6(s: CoachState): Record<string, unknown> {
    const v6: Record<string, unknown> = { ...s };
    delete v6.inSeason;
    delete v6.trainingDefault;
    delete v6.transfers;
    const noTackles = (st: unknown) => {
        const out = { ...(st as Record<string, unknown>) };
        delete out.tackles;
        return out;
    };
    v6.squad = s.squad.map((p) => ({ ...p, stats: noTackles(p.stats), career: noTackles(p.career) }));
    return v6;
}

/** Contesta tarjetas con la primera opción hasta que se terminan. Devuelve cuántas contestó. */
function answerCards(s: CoachState): { state: CoachState; answered: number } {
    let cur = s;
    let answered = 0;
    for (let guard = 0; guard < 20 && (cur.phase === 'decision' || cur.phase === 'reveal'); guard++) {
        if (cur.phase === 'decision') {
            const first = getEvent(cur.pendingEventId as string)?.options[0];
            assert.ok(first, 'una tarjeta sin opciones');
            cur = chooseOption(cur, first.id);
            answered++;
        } else {
            cur = acknowledgeReveal(cur);
        }
    }
    return { state: cur, answered };
}

test('esquema 6 → 7: una partida guardada a mitad de las cinco tarjetas sigue con las que le quedan y juega en tramos sin repetir', () => {
    // El esquema 6 sacaba las cinco tarjetas juntas en la pretemporada. Una
    // partida con dos contestadas (quedan tres) y una tarjeta en la mesa.
    const begun = beginDecisions(createCareer(11, 'sb-marabunta-r-c', 'estratega'));
    assert.equal(begun.phase, 'decision');
    const v6 = { ...asSchema6(begun), decisionsLeft: 3 };
    const r = readSavedCareer(payload({ schema: 6, engineVersion: '2.0.0', state: v6 }));
    assert.equal(r.kind, 'ok');
    if (r.kind !== 'ok') return;
    assert.equal(r.repaired, true, 'cambió la forma y no se avisó');
    assert.equal(r.state.phase, 'decision', 'la tarjeta en la mesa se perdió');
    assert.equal(r.state.inSeason, null, 'se inventó una temporada en curso');
    assert.equal(r.state.decisionsLeft, 3, 'se le cobraron o regalaron tarjetas');
    for (const p of r.state.squad) assert.equal(p.stats.tackles, 0, `${p.name} quedó sin tackles`);

    // Contesta las tres que le quedaban y arranca la fase regular, sin tarjetas por tramo.
    const { state: trained, answered } = answerCards(r.state);
    assert.equal(answered, 3, `contestó ${answered} tarjetas en vez de las tres que le quedaban`);
    assert.equal(trained.phase, 'training');
    assert.deepEqual(trained.inSeason?.cards, [0, 0, 0], 'las cinco del año ya salieron: los tramos no traen más');

    // Y la temporada se juega entera en tramos sin pedir ninguna tarjeta más.
    let s = trained;
    const phases: string[] = [];
    for (let guard = 0; guard < 30 && s.phase !== 'season'; guard++) {
        phases.push(s.phase);
        if (s.phase === 'training' || s.phase === 'keymatch') s = simulateTramo(s);
        else if (s.phase === 'tramo') s = nextTramo(s);
        else if (s.phase === 'market') s = closeMarketWindow(s);
        else if (s.phase === 'playoff') s = playPlayoffMatch(s, 'plan');
        else break;
    }
    assert.equal(s.phase, 'season', `la temporada migrada no terminó: ${phases.join(' → ')}`);
    assert.ok(!phases.includes('decision'), 'la temporada migrada pidió tarjetas de más');
    assert.equal(s.seasons.length, 1);

    // Determinista: cargar el mismo guardado y hacer lo mismo da lo mismo.
    const again = readSavedCareer(payload({ schema: 6, engineVersion: '2.0.0', state: v6 }));
    assert.equal(again.kind, 'ok');
    if (again.kind === 'ok') assert.deepEqual(answerCards(again.state).state, trained);
});

test('esquema 6 → 7: una partida guardada en el cierre del año o en la pretemporada carga y sigue', () => {
    let played = playSeason(createCareer(5, 'sb-marabunta-r-c', 'estratega'));
    while (played.phase === 'playoff') played = playPlayoffMatch(played, 'plan');
    assert.equal(played.phase, 'season');
    const seasonsV6 = played.seasons.map((e) => {
        const old: Record<string, unknown> = { ...e };
        delete old.stars;
        return old;
    });
    const atClose = { ...asSchema6(played), seasons: seasonsV6 };
    const r = readSavedCareer(payload({ schema: 6, engineVersion: '2.0.0', state: atClose }));
    assert.equal(r.kind, 'ok');
    if (r.kind !== 'ok') return;
    assert.equal(r.state.phase, 'season');
    assert.equal(r.state.inSeason, null);
    const next = closeSeason(r.state);
    assert.ok(next.phase === 'preseason' || next.phase === 'fired');
    if (next.phase === 'preseason') {
        const begun = beginDecisions(next);
        assert.ok(begun.inSeason, 'la temporada siguiente no arrancó en tramos');
        assert.deepEqual(begun.inSeason.cards, [...CARDS_PER_TRAMO]);
    }

    const pre = readSavedCareer(payload({ schema: 6, engineVersion: '2.0.0', state: asSchema6(state) }));
    assert.equal(pre.kind, 'ok');
    if (pre.kind === 'ok') {
        assert.equal(pre.state.phase, 'preseason');
        assert.equal(pre.state.trainingDefault, null);
    }
});

test('una partida de hoy guardada en cada fase de un tramo vuelve idéntica y sin marcas de reparación', () => {
    let s = beginDecisions(createCareer(17, 'sb-marabunta-r-c', 'estratega'));
    const seen = new Set<string>();
    for (let guard = 0; guard < 60 && s.phase !== 'season'; guard++) {
        const r = readSavedCareer(payload({ state: s }));
        assert.equal(r.kind, 'ok', `no cargó en la fase ${s.phase}`);
        if (r.kind === 'ok') {
            assert.deepEqual(r.state, s, `la fase ${s.phase} no volvió idéntica`);
            assert.equal(r.repaired, false, `la fase ${s.phase} se marcó como reparada`);
        }
        seen.add(s.phase);
        if (s.phase === 'decision' || s.phase === 'reveal') s = answerCards(s).state;
        else if (s.phase === 'keymatch' && !s.inSeason?.key?.firstHalf) s = playKeyFirstHalf(s, 'cerrado');
        else if (s.phase === 'keymatch') s = playKeySecondHalf(s, 'rotar');
        else if (s.phase === 'training') s = submitTraining(s, DEFAULT_TRAINING);
        else if (s.phase === 'tramo') s = nextTramo(s);
        else if (s.phase === 'market') s = closeMarketWindow(s);
        else if (s.phase === 'playoff') s = playPlayoffMatch(s, 'plan');
    }
    for (const phase of ['decision', 'training', 'keymatch', 'tramo', 'market']) assert.ok(seen.has(phase), `no pasó por ${phase}`);
});

/* ------------------------------------------------------------------ */
/* Esquema 7 → 8: el mercado de jugadores                              */
/* ------------------------------------------------------------------ */

/** Una partida como la guardaba el esquema 7: sin mercado de jugadores. */
function asSchema7(s: CoachState): Record<string, unknown> {
    const v7: Record<string, unknown> = { ...s };
    delete v7.transfers;
    return v7;
}

test('esquema 7 → 8: el mercado arranca vacío y sin cedidos, y la partida sigue con sus dos ventanas', () => {
    const pre = readSavedCareer(payload({ schema: 7, engineVersion: '2.1.0', state: asSchema7(state) }));
    assert.equal(pre.kind, 'ok');
    if (pre.kind !== 'ok') return;
    assert.equal(pre.repaired, true, 'cambió la forma y no se avisó');
    assert.equal(pre.state.phase, 'preseason');
    assert.equal(pre.state.transfers.window, null, 'se inventó una ventana que nadie abrió');
    assert.deepEqual(pre.state.transfers.offers, []);
    assert.deepEqual(pre.state.transfers.loaned, []);
    assert.equal(pre.state.transfers.ledger.season, pre.state.season);
    assert.deepEqual(pre.state.squad, state.squad, 'el plantel cambió al migrar');

    // La temporada se juega: la ventana corta aparece entre el tramo 1 y el 2,
    // y al cerrar el año se abre la de la pretemporada.
    let s = beginDecisions(pre.state);
    const phases: string[] = [];
    for (let guard = 0; guard < 60 && s.phase !== 'season'; guard++) {
        phases.push(s.phase);
        if (s.phase === 'decision' || s.phase === 'reveal') s = answerCards(s).state;
        else if (s.phase === 'training' || s.phase === 'keymatch') s = simulateTramo(s);
        else if (s.phase === 'tramo') s = nextTramo(s);
        else if (s.phase === 'market') s = closeMarketWindow(s);
        else if (s.phase === 'playoff') s = playPlayoffMatch(s, 'plan');
    }
    assert.equal(s.phase, 'season');
    assert.ok(phases.includes('market'), 'no hubo ventana corta');
    const next = closeSeason(s);
    if (next.phase === 'preseason') assert.equal(next.transfers.window?.kind, 'pretemporada');

    // Una del esquema 7 a mitad del tramo 1 sigue y abre la ventana corta.
    let mid = beginDecisions(createCareer(23, 'sb-marabunta-r-c', 'estratega'));
    for (let guard = 0; guard < 20 && mid.phase !== 'tramo'; guard++) {
        mid = mid.phase === 'decision' || mid.phase === 'reveal' ? answerCards(mid).state : simulateTramo(mid);
    }
    assert.equal(mid.phase, 'tramo');
    const r = readSavedCareer(payload({ schema: 7, engineVersion: '2.1.0', state: asSchema7(mid) }));
    assert.equal(r.kind, 'ok');
    if (r.kind === 'ok') {
        assert.equal(r.state.phase, 'tramo');
        assert.equal(nextTramo(r.state).phase, 'market');
    }
});

test('una partida con la ventana abierta, un cedido y una negociación a medias vuelve idéntica', () => {
    // Un club del Top 14: ahí los vínculos se negocian en pesos.
    let s = createCareer(29, clubsIn(seedWorld(), 'ar-urba-top14')[3], 'estratega');
    assert.equal(s.transfers.window?.kind, 'pretemporada');
    // Se libera uno para tener lugar, se abre la negociación y se cede al más pibe.
    s = releasePlayer(s, [...s.squad].sort((a, b) => a.level - b.level || a.id.localeCompare(b.id))[0].id);
    const renewable = s.squad.find((p) => !renewalNegotiationBlock(s, p.id));
    const c = s.transfers.arrivals.find((a) => !signingNegotiationBlock(s, a.id));
    if (renewable) s = openRenewalNegotiation(s, renewable.id);
    else if (c) s = openSigningNegotiation(s, c.id);
    assert.ok(s.transfers.negotiation, 'no hubo negociación para guardar a medias');
    const kid = [...s.squad].sort((a, b) => a.age - b.age || a.id.localeCompare(b.id))[0];
    s = loanPlayer(s, kid.id);
    assert.equal(s.transfers.loaned.length, 1, 'no se pudo ceder al más pibe');
    const r = readSavedCareer(payload({ state: s }));
    assert.equal(r.kind, 'ok');
    if (r.kind !== 'ok') return;
    assert.deepEqual(r.state, s);
    assert.equal(r.repaired, false);
});

/* ------------------------------------------------------------------ */
/* Esquema 8 → 9: el M19                                               */
/* ------------------------------------------------------------------ */

/** Una partida como la guardaba el esquema 8: sin M19. */
function asSchema8(s: CoachState): Record<string, unknown> {
    const v8: Record<string, unknown> = { ...s };
    delete v8.academy;
    return v8;
}

test('esquema 8 → 9: el M19 se arma con la semilla y el club, sin correr la carrera, y la partida sigue', () => {
    const raw = payload({ schema: 8, engineVersion: '2.2.0', state: asSchema8(state) });
    const a = readSavedCareer(raw);
    const b = readSavedCareer(raw);
    assert.equal(a.kind, 'ok');
    if (a.kind !== 'ok' || b.kind !== 'ok') return;
    assert.equal(a.repaired, true, 'cambió la forma y no se avisó');
    assert.deepEqual(a.state, b.state, 'migrar dos veces el mismo guardado dio distinto');
    assert.equal(a.state.rngState, state.rngState, 'armar el M19 corrió el RNG de la carrera');
    assert.deepEqual(a.state.squad, state.squad, 'el plantel cambió al migrar');
    const n = a.state.academy.players.length;
    assert.ok(n >= ACADEMY_MIN && n <= ACADEMY_MAX, `el M19 migrado tiene ${n} pibes`);
    // En la pretemporada, además, la jornada de captación del año.
    assert.equal(a.state.academy.scouting?.season, a.state.season);
    for (const k of a.state.academy.players) {
        assert.ok(k.estMin <= k.ceiling && k.ceiling <= k.estMax, `${k.name}: el rango no contiene al techo`);
    }

    // La temporada se juega y el cierre cubre los lugares con el M19.
    let s = beginDecisions(a.state);
    for (let guard = 0; guard < 60 && s.phase !== 'season'; guard++) {
        if (s.phase === 'decision' || s.phase === 'reveal') s = answerCards(s).state;
        else if (s.phase === 'training' || s.phase === 'keymatch') s = simulateTramo(s);
        else if (s.phase === 'tramo') s = nextTramo(s);
        else if (s.phase === 'market') s = closeMarketWindow(s);
        else if (s.phase === 'playoff') s = playPlayoffMatch(s, 'plan');
    }
    assert.equal(s.phase, 'season');
    const next = closeSeason(s);
    if (next.phase === 'preseason') {
        assert.ok(next.academy.players.length >= ACADEMY_MIN);
        assert.equal(next.academy.scouting?.season, next.season);
    }

    // Una del esquema 8 a mitad de temporada también carga, con su M19.
    let mid = beginDecisions(createCareer(23, 'sb-marabunta-r-c', 'estratega'));
    for (let guard = 0; guard < 20 && mid.phase !== 'tramo'; guard++) {
        mid = mid.phase === 'decision' || mid.phase === 'reveal' ? answerCards(mid).state : simulateTramo(mid);
    }
    const r = readSavedCareer(payload({ schema: 8, engineVersion: '2.2.0', state: asSchema8(mid) }));
    assert.equal(r.kind, 'ok');
    if (r.kind === 'ok') {
        assert.equal(r.state.phase, 'tramo');
        assert.ok(r.state.academy.players.length >= ACADEMY_MIN);
        assert.equal(nextTramo(r.state).phase, 'market');
    }
});

test('una partida con la jornada a medias, un pibe cedido y otro reservado vuelve idéntica', () => {
    let s = createCareer(31, 'sb-marabunta-r-c', 'formador');
    const day = s.academy.scouting;
    assert.ok(day && !day.done);
    s = observeCandidate(s, day.candidates[0].id);
    s = signScout(s, day.candidates[1].id);
    const older = s.academy.players.filter((k) => k.age >= 18);
    s = loanKid(s, older[0].id);
    s = toggleReserve(s, older[1].id);
    s = setDevPlan(s, older[2].id, 'fisico');
    const r = readSavedCareer(payload({ state: s }));
    assert.equal(r.kind, 'ok');
    if (r.kind !== 'ok') return;
    assert.deepEqual(r.state, s);
    assert.equal(r.repaired, false);
});
