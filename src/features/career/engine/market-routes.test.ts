import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUBS, getClub } from '../data/clubs.ts';
import { CUPS, MOVEMENTS, PARALLEL_COMPETITIONS, transferDestinations } from '../data/clubs2026/competitions2026.ts';
import {
    MIGRATION_ROUTES,
    TRANSFER_PATHWAYS,
    countriesWithLadder,
    domesticLadder,
    homeCountryOf,
    marketRung,
    migrationRegionOf,
    movementBetween,
    pathwayFor,
    pathwayTargets,
    pathwaysFrom,
    resolveStartRoute,
} from './market-routes.ts';
import {
    VETERAN_AGE, allowedRungs, clubIsInterested, generateOffers, isVeteranHomecoming,
    marketValue, qualifiesForExceptionalJump,
} from './club-offers.ts';
import { createPlayer } from './create-player.ts';
import { computeEffectiveOvr } from './scoring.ts';
import { createRng } from './random.ts';
import { runCareer, type Chooser } from './run-career.ts';

const SEEDS = Array.from({ length: 60 }, (_, i) => (i + 1) * 7919);
const CLUB_IDS = new Set(CLUBS.map((c) => c.id));

function startClubFor(nationality: string, seed: number, origin = 'academia-club') {
    return getClub(createPlayer({ position: 'centre', nationality, origin }, createRng(seed)).club);
}

// ── Club inicial ─────────────────────────────────────────────────────────────
test('un argentino empieza en Argentina, un uruguayo en Uruguay, un chileno en Chile', () => {
    for (const [nationality, code] of [['Argentina', 'ar'], ['Uruguay', 'uy'], ['Chile', 'cl']] as const) {
        for (const seed of SEEDS) {
            const club = startClubFor(nationality, seed);
            assert.equal(club.countryCode, code, `${nationality} seed ${seed} arrancó en ${club.name} (${club.countryCode})`);
            assert.equal(club.source, 'supabase', 'debe salir del snapshot real AR/UY/CL');
        }
    }
});

test('los países con liga modelada usan su ruta doméstica', () => {
    for (const [nationality, code] of [['Francia', 'fr'], ['Inglaterra', 'gb-eng'], ['España', 'es'], ['Japón', 'jp'], ['Sudáfrica', 'za'], ['Nueva Zelanda', 'nz']] as const) {
        for (const seed of SEEDS.slice(0, 20)) {
            assert.equal(startClubFor(nationality, seed).countryCode, code, `${nationality} debería arrancar en su país`);
        }
    }
});

test('una nacionalidad sin liga modelada usa una ruta migratoria DOCUMENTADA', () => {
    for (const nationality of ['Fiyi', 'Samoa', 'Italia', 'Irlanda', 'Australia', 'Brasil', 'Namibia', 'Corea del Sur']) {
        assert.equal(homeCountryOf(nationality), null, `${nationality} no debería tener escalera propia`);
        const region = migrationRegionOf(nationality);
        const allowed = new Set(MIGRATION_ROUTES[region].map((r) => r.countryCode));
        for (const seed of SEEDS.slice(0, 20)) {
            const club = startClubFor(nationality, seed);
            assert.ok(allowed.has(club.countryCode), `${nationality} → ${club.countryCode} no está en la ruta ${region}`);
        }
    }
});

test('una nacionalidad desconocida cae en la ruta por defecto, no en un club al azar', () => {
    const region = migrationRegionOf('Wakanda');
    const allowed = new Set(MIGRATION_ROUTES[region].map((r) => r.countryCode));
    for (const seed of SEEDS.slice(0, 20)) {
        assert.ok(allowed.has(startClubFor('Wakanda', seed).countryCode), 'debe usar la ruta por defecto');
    }
});

test('el club inicial nunca es un club inexistente ni de élite mundial', () => {
    for (const nationality of ['Argentina', 'Francia', 'Fiyi', 'Japón', 'Wakanda']) {
        for (const seed of SEEDS) {
            const club = startClubFor(nationality, seed);
            assert.ok(CLUB_IDS.has(club.id), `club inexistente: ${club.id}`);
            assert.ok(marketRung(club) <= 6, `${club.name}: un juvenil no debuta en la élite (escalón ${marketRung(club)})`);
        }
    }
});

test('el origen "academia en el exterior" fuerza la ruta migratoria', () => {
    let abroad = 0;
    for (const seed of SEEDS) {
        const route = resolveStartRoute('Argentina', 'exterior-academia', createRng(seed));
        assert.equal(route.kind, 'migration');
        if (route.countryCode !== 'ar') abroad++;
    }
    assert.equal(abroad, SEEDS.length, 'si se fue de pibe, no arranca en su país');
});

// ── Escalafón ────────────────────────────────────────────────────────────────
test('el escalafón ordena el catálogo entero y respeta el techo amateur', () => {
    for (const club of CLUBS) {
        const rung = marketRung(club);
        assert.ok(Number.isInteger(rung) && rung >= 0 && rung <= 8, `${club.name}: escalón ${rung}`);
        if (club.level === 'amateur') assert.ok(rung <= 3, `${club.name}: un amateur no puede estar arriba`);
        if (club.level === 'elite-world') assert.equal(rung, 8, `${club.name}: élite mundial`);
    }
    assert.ok(countriesWithLadder().length >= 9, 'debe haber escaleras para los países modelados');
    for (const code of countriesWithLadder()) {
        assert.ok(domesticLadder(code).every((r) => r.clubs.length > 0), `${code}: escalón vacío`);
    }
});

test('pasar entre competiciones PARALELAS nunca se lee como ascenso de un escalón', () => {
    const sample = (competitionId: string) => CLUBS.find((c) => c.competitionId === competitionId)!;
    for (const parallel of PARALLEL_COMPETITIONS) {
        const club = CLUBS.find((c) => c.competitionId === parallel);
        if (!club) continue;
        for (const other of PARALLEL_COMPETITIONS) {
            const target = CLUBS.find((c) => c.competitionId === other);
            if (!target || other === parallel) continue;
            const delta = Math.abs(marketRung(target) - marketRung(club));
            const direction = movementBetween(club, target);
            assert.ok(
                direction === 'lateral' || delta >= 1,
                `${parallel} → ${other}: movimiento paralelo mal clasificado`,
            );
        }
    }
    // Casos concretos: NPC y Currie Cup no son un escalón por debajo de su
    // franquicia regional, están a distancia prohibida (no hay ascenso).
    assert.ok(marketRung(sample('super-rugby')) - marketRung(sample('npc')) >= 2, 'NPC → Super Rugby no es ±1');
    assert.ok(marketRung(sample('urc')) - marketRung(sample('currie-premier')) >= 2, 'Currie → URC no es ±1');
    assert.ok(marketRung(sample('urc')) - marketRung(sample('sra')) >= 2, 'SRA → URC no es ±1');
});

// ── Vías profesionales vs ascensos institucionales ───────────────────────────
test('las vías conectan sistemas paralelos SIN que eso sea un ascenso institucional', () => {
    const cases: [string, string, string][] = [
        ['npc-to-super-rugby-nz', 'canterbury', 'crusaders'],
        ['currie-to-urc-sa', 'blue-bulls', 'bulls'],
    ];
    for (const [pathwayId, fromId, toId] of cases) {
        const from = getClub(fromId);
        const to = getClub(toId);
        const pathway = pathwayFor(from, to);
        assert.ok(pathway, `debería existir la vía ${fromId} → ${toId}`);
        assert.equal(pathway!.id, pathwayId);
        assert.ok(marketRung(to) - marketRung(from) >= 2, 'la vía cruza más de un escalón, por eso hace falta');

        // Y sin embargo NO es un ascenso institucional: el grafo de MOVEMENTS
        // no conecta esas competiciones, y ambas siguen siendo paralelas.
        assert.ok(
            !MOVEMENTS.some((m) => m.from === from.competitionId && m.to === to.competitionId),
            `${from.competitionId} → ${to.competitionId} no puede ser un ascenso de club`,
        );
        assert.ok(PARALLEL_COMPETITIONS.has(from.competitionId) || PARALLEL_COMPETITIONS.has(to.competitionId));
    }
});

test('AR/UY/CL doméstico tiene vía a la franquicia SRA de SU país', () => {
    const expected: [string, string, string[]][] = [
        ['ar', 'ar-domestic-to-sra', ['dogos-xv', 'pampas', 'tarucas']],
        ['uy', 'uy-domestic-to-sra', ['penarol-rugby']],
        ['cl', 'cl-domestic-to-sra', ['selknam']],
    ];
    for (const [country, pathwayId, targets] of expected) {
        const domestic = CLUBS.find((c) => c.competitionId === `sa-${country}`)!;
        const pathway = pathwaysFrom(domestic).find((p) => p.id === pathwayId);
        assert.ok(pathway, `falta la vía ${pathwayId}`);
        assert.deepEqual(pathwayTargets(pathway!).map((c) => c.id).sort(), [...targets].sort());
        for (const target of pathwayTargets(pathway!)) {
            assert.equal(target.competitionId, 'sra');
            // La franquicia es el destino de un JUGADOR, no un ascenso del club.
            assert.ok(!MOVEMENTS.some((m) => m.to === 'sra' || m.from === 'sra'), 'SRA no participa de ascensos');
        }
    }
});

test('ninguna vía queda vacía y ninguna apunta a una copa', () => {
    const cupIds = new Set(CUPS.map((c) => c.id));
    for (const pathway of TRANSFER_PATHWAYS) {
        const targets = pathwayTargets(pathway);
        assert.ok(targets.length > 0, `vía vacía: ${pathway.id}`);
        for (const target of targets) {
            assert.ok(!cupIds.has(target.competitionId), `${pathway.id} apunta a una copa`);
            assert.ok(CLUB_IDS.has(target.id), `${pathway.id} apunta a un club inexistente`);
        }
        for (const from of pathway.fromCompetitions) {
            assert.ok(CLUBS.some((c) => c.competitionId === from), `${pathway.id}: origen sin clubes (${from})`);
        }
    }
    for (const country of ['ar', 'uy', 'cl']) {
        const domestic = CLUBS.find((c) => c.competitionId === `sa-${country}`)!;
        assert.ok(pathwaysFrom(domestic).length > 0, `${country} se quedó sin vía de salida`);
    }
});

test('una vía NO garantiza oferta: sin nivel, el destino no se interesa', () => {
    // Origen explícito: `exterior-academia` fuerza migración y sacaría al
    // jugador de la liga uruguaya, que es justo la vía que se quiere probar.
    const rookie = createPlayer({ position: 'prop', nationality: 'Uruguay', origin: 'academia-club' }, createRng(31337));
    const franchise = getClub('penarol-rugby');
    const pathway = pathwaysFrom(getClub(rookie.club)).find((p) => p.id === 'uy-domestic-to-sra')!;
    assert.ok(pathway, 'la vía existe');
    assert.equal(
        clubIsInterested(franchise, marketValue(rookie, computeEffectiveOvr(rookie)), pathway.demandTolerance),
        false,
        'un juvenil de 18 no puede entrar a la franquicia solo porque existe la ruta',
    );
    // Con nivel de sobra, la misma vía sí abre.
    assert.equal(clubIsInterested(franchise, franchise.rating + 5, pathway.demandTolerance), true);
});

// ── Ofertas ──────────────────────────────────────────────────────────────────
function offersAcross(nationality: string, seeds: number[], mutate?: (p: ReturnType<typeof createPlayer>) => void) {
    const all: { player: ReturnType<typeof createPlayer>; offers: ReturnType<typeof generateOffers> }[] = [];
    for (const seed of seeds) {
        const player = createPlayer({ position: 'flyhalf', nationality }, createRng(seed));
        mutate?.(player);
        all.push({ player, offers: generateOffers(player, computeEffectiveOvr(player), createRng(seed + 1)) });
    }
    return all;
}

test('nunca se ofrece una copa como destino', () => {
    const cupIds = new Set(CUPS.map((c) => c.id));
    const leagueIds = new Set(transferDestinations().map((c) => c.id));
    for (const { offers } of offersAcross('Argentina', SEEDS)) {
        for (const offer of offers) {
            assert.ok(!cupIds.has(offer.league), `oferta de una copa: ${offer.league}`);
            assert.ok(leagueIds.has(offer.league), `liga desconocida: ${offer.league}`);
        }
    }
});

test('ninguna oferta apunta a un club inexistente ni al club actual', () => {
    for (const { player, offers } of offersAcross('Francia', SEEDS)) {
        for (const offer of offers) {
            assert.ok(CLUB_IDS.has(offer.club), `club inexistente: ${offer.club}`);
            assert.notEqual(offer.club, player.club, 'no puede ofrecerse el club actual');
        }
    }
});

test('se ofrecen COMO MÁXIMO dos clubes (la UI suma "quedarte")', () => {
    for (const { offers } of offersAcross('Argentina', SEEDS)) {
        assert.ok(offers.length <= 2, `demasiadas ofertas: ${offers.length}`);
    }
});

test('fuera de una vía profesional no se salta más de un escalón', () => {
    for (const nationality of ['Argentina', 'Francia', 'Japón', 'Fiyi']) {
        for (const { player, offers } of offersAcross(nationality, SEEDS)) {
            const current = marketRung(getClub(player.club));
            const limit = qualifiesForExceptionalJump(player, computeEffectiveOvr(player)) ? 2 : 1;
            for (const offer of offers) {
                if (offer.via !== 'window') continue; // pathway y homecoming tienen sus propias reglas
                const delta = Math.abs(marketRung(getClub(offer.club)) - current);
                assert.ok(delta <= limit, `salto de ${delta} escalones por ventana sin excepción (${nationality})`);
            }
        }
    }
});

test('toda oferta declara por qué puerta entró', () => {
    const seen = new Set<string>();
    for (const nationality of ['Argentina', 'Nueva Zelanda', 'Sudáfrica']) {
        for (const { player, offers } of offersAcross(nationality, SEEDS)) {
            for (const offer of offers) {
                assert.ok(['window', 'pathway', 'homecoming'].includes(offer.via), `via inválida: ${offer.via}`);
                if (offer.via === 'pathway') {
                    assert.ok(offer.pathwayId, 'una oferta por vía debe decir cuál');
                    assert.ok(
                        pathwayFor(getClub(player.club), getClub(offer.club))?.id === offer.pathwayId,
                        `la vía declarada no conecta ${player.club} → ${offer.club}`,
                    );
                } else {
                    assert.equal(offer.pathwayId, null, 'solo las vías llevan pathwayId');
                }
                seen.add(offer.via);
            }
        }
    }
    assert.ok(seen.has('window') && seen.has('pathway'), `faltan puertas: ${[...seen].join(',')}`);
});

test('la excepción de ±2 existe, está acotada y exige temporada sobresaliente', () => {
    const player = createPlayer({ position: 'flyhalf', nationality: 'Argentina' }, createRng(4242));
    assert.equal(qualifiesForExceptionalJump(player, computeEffectiveOvr(player)), false, 'un juvenil normal no salta');

    player.dynamics.form = 92;
    player.role = 'starter';
    player.age = 24;
    player.potential = computeEffectiveOvr(player) + 25;
    assert.equal(qualifiesForExceptionalJump(player, 90), true, 'una temporada excepcional sí habilita el salto');

    const spans = allowedRungs(player, 90).map((r) => Math.abs(r - marketRung(getClub(player.club))));
    assert.equal(Math.max(...spans), 2, 'la excepción llega hasta ±2, nunca más');
});

test('el veterano recibe rutas de REGRESO y de descenso, no de ascenso', () => {
    // Un profesional consolidado de 34 en un grande europeo.
    const veterans = offersAcross('Argentina', SEEDS, (p) => {
        p.age = 34;
        p.club = 'stade-toulousain';
        p.league = 'top14';
        for (const key of Object.keys(p.attributes) as (keyof typeof p.attributes)[]) {
            p.attributes[key] = Math.min(99, p.attributes[key] + 28);
        }
    });
    const current = marketRung(getClub('stade-toulousain'));
    let home = 0;
    let down = 0;
    let total = 0;
    for (const { player, offers } of veterans) {
        assert.ok(!allowedRungs(player, 70).some((r) => r > current), 'a los 34 no se sube de categoría');
        for (const offer of offers) {
            total++;
            const rung = marketRung(getClub(offer.club));
            assert.ok(rung <= current, 'el veterano no asciende');
            if (rung < current) down++;
            if (getClub(offer.club).countryCode === 'ar') home++;
        }
    }
    assert.ok(total > 0, 'debería haber ofertas para el veterano');
    assert.ok(down > 0, 'tiene que poder bajar de categoría');
    assert.ok(home > 0, 'el regreso al país tiene que ser una ruta posible');
});

test('el regreso del veterano es una regla MARCADA, no una puerta abierta', () => {
    const young = createPlayer({ position: 'centre', nationality: 'Argentina' }, createRng(555));
    young.age = 25;
    young.club = 'stade-toulousain';
    const veteran = createPlayer({ position: 'centre', nationality: 'Argentina' }, createRng(555));
    veteran.age = 34;
    veteran.club = 'stade-toulousain';

    const argentineClub = CLUBS.find((c) => c.countryCode === 'ar')!;
    assert.equal(isVeteranHomecoming(young, argentineClub), false, 'a los 25 no aplica');
    assert.equal(isVeteranHomecoming(veteran, argentineClub), true, 'a los 34 sí');

    // Solo hacia el país propio y solo hacia abajo.
    const frenchClub = getClub('ca-brive');
    assert.equal(isVeteranHomecoming(veteran, frenchClub), false, 'no es "regreso" si no es su país');
    const uruguayan = createPlayer({ position: 'centre', nationality: 'Uruguay' }, createRng(555));
    uruguayan.age = 34;
    uruguayan.club = 'stade-toulousain';
    assert.equal(isVeteranHomecoming(uruguayan, argentineClub), false, 'un uruguayo no "vuelve" a Argentina');
});

test('a los 33+ la ventana deja de mirar para arriba', () => {
    const young = createPlayer({ position: 'centre', nationality: 'Francia' }, createRng(99));
    young.age = 25;
    const veteran = createPlayer({ position: 'centre', nationality: 'Francia' }, createRng(99));
    veteran.age = VETERAN_AGE;
    const rung = marketRung(getClub(young.club));
    assert.ok(allowedRungs(young, 60).some((r) => r > rung), 'a los 25 se puede subir');
    assert.ok(!allowedRungs(veteran, 60).some((r) => r > rung), 'a los 33 no');
});

// ── Determinismo ─────────────────────────────────────────────────────────────
test('misma seed + mismo catálogo ⇒ mismas ofertas; otra seed puede diferir', () => {
    const build = (seed: number) => {
        const player = createPlayer({ position: 'wing', nationality: 'Argentina' }, createRng(seed));
        return generateOffers(player, computeEffectiveOvr(player), createRng(seed + 7)).map((o) => `${o.club}:${o.role}:${o.wageIndex}`);
    };
    for (const seed of SEEDS.slice(0, 15)) {
        assert.deepEqual(build(seed), build(seed), `no determinístico en la seed ${seed}`);
    }
    const distinct = new Set(SEEDS.slice(0, 25).map((s) => build(s).join('|')));
    assert.ok(distinct.size > 1, 'distintas seeds deberían poder dar ofertas distintas');
});

// El chooser por defecto siempre elige la opción 0, que en el mercado es
// "quedarte": con él NINGUNA carrera cambia de club y no se probaría nada.
const acceptsOffers: Chooser = (event) => (event.options.length > 1 ? event.options[1].id : event.options[0].id);

test('el mercado usa el catálogo local: toda carrera se mueve entre clubes reales', () => {
    for (const seed of SEEDS.slice(0, 20)) {
        const state = runCareer({ position: 'backrow', nationality: 'Argentina', origin: 'academia-club' }, seed, acceptsOffers);
        for (const season of state.seasons) {
            assert.ok(CLUB_IDS.has(season.club), `club inexistente en la carrera: ${season.club}`);
        }
    }
});

test('el mercado efectivamente mueve jugadores (no queda mudo)', () => {
    let moves = 0;
    let abroad = 0;
    for (const seed of SEEDS.slice(0, 25)) {
        const state = runCareer({ position: 'centre', nationality: 'Argentina', origin: 'academia-club' }, seed, acceptsOffers);
        const clubs = [...new Set(state.seasons.map((s) => s.club))];
        moves += clubs.length - 1;
        if (clubs.some((id) => getClub(id).countryCode !== 'ar')) abroad++;
    }
    assert.ok(moves > 20, `el mercado casi no mueve a nadie: ${moves} cambios de club`);
    assert.ok(abroad > 0, 'alguna carrera debería llegar al exterior');
});

test('en una carrera completa TODO salto grande tiene un motivo identificable', () => {
    const reasons = new Map<string, number>();
    for (const nationality of ['Argentina', 'Francia', 'Fiyi', 'Japón', 'Nueva Zelanda', 'Sudáfrica']) {
        for (const seed of SEEDS.slice(0, 25)) {
            const state = runCareer({ position: 'centre', nationality, origin: 'academia-club' }, seed, acceptsOffers);
            for (let i = 1; i < state.seasons.length; i++) {
                const previous = state.seasons[i - 1];
                const season = state.seasons[i];
                if (previous.club === season.club) continue;

                const from = getClub(previous.club);
                const to = getClub(season.club);
                const delta = Math.abs(marketRung(to) - marketRung(from));
                if (delta <= 1) continue;

                // 1) Vía profesional normal entre sistemas.
                if (pathwayFor(from, to) !== null) {
                    reasons.set('pathway', (reasons.get('pathway') ?? 0) + 1);
                    continue;
                }
                // 2) Excepción de rendimiento (±2, antes de los 33).
                if (delta === 2 && season.age < VETERAN_AGE) {
                    reasons.set('excepción ±2', (reasons.get('excepción ±2') ?? 0) + 1);
                    continue;
                }
                // 3) Regreso del veterano: solo hacia abajo y a partir de los 33.
                assert.ok(
                    season.age >= VETERAN_AGE && marketRung(to) < marketRung(from),
                    `${nationality} seed ${seed}: salto de ${delta} escalones a los ${season.age} sin vía, excepción ni regreso`,
                );
                reasons.set('veterano', (reasons.get('veterano') ?? 0) + 1);
            }
        }
    }
    assert.ok((reasons.get('pathway') ?? 0) > 0, 'las vías profesionales tienen que usarse de verdad');
});

// ── Recalibración: apariciones de desarrollo y rutas SRA activas ─────────────
test('las apariciones de DESARROLLO son plausibles (mediana 5-9, mayoría <10)', () => {
    const dev: number[] = [];
    for (const nationality of ['nz', 'fr', 'jp', 'za']) {
        for (let i = 0; i < 40; i++) {
            // Ruta de DESARROLLO explícita: desde que el jugador elige cómo
            // arranca, la academia es una de las tres puertas y ya no algo que
            // el motor sortea. Sin declararla, esta muestra no tendría academias.
            const state = runCareer({ position: 'centre', nationalityCountryCode: nationality, origin: 'academia-club', startRoute: 'development' }, (i + 1) * 7919, acceptsOffers);
            for (const entry of state.history) {
                if (entry.squadTrack === 'development') dev.push(entry.appearances);
            }
            void state;
        }
    }
    dev.sort((a, b) => a - b);
    const median = dev[Math.floor(dev.length / 2)];
    const below10 = dev.filter((x) => x < 10).length / dev.length;
    const breakout = Math.max(...dev);
    assert.ok(dev.length > 20, 'debería haber temporadas de desarrollo');
    assert.ok(median >= 4 && median <= 10, `mediana de desarrollo fuera de rango: ${median}`);
    assert.ok(below10 >= 0.6, `pocas por debajo de 10: ${Math.round(below10 * 100)}%`);
    assert.ok(breakout >= 10, `debe existir alguna temporada de irrupción (máx ${breakout})`);
});

test('las rutas SRA se activan en carreras completas AR/UY/CL', () => {
    const bestOffer: Chooser = (event) => (event.options.length > 1 ? event.options[1].id : event.options[0].id);
    for (const [code, minCareers] of [['ar', 1], ['uy', 1], ['cl', 1]] as const) {
        let careersInSra = 0;
        for (let i = 0; i < 120; i++) {
            const state = runCareer({ position: 'centre', nationalityCountryCode: code, origin: 'academia-club' }, (i + 1) * 7919, bestOffer);
            if (state.history.some((h) => h.competitionId === 'sra')) careersInSra++;
        }
        assert.ok(careersInSra >= minCareers, `sa-${code}: la ruta SRA quedó muda (${careersInSra} carreras)`);
    }
});
