import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUBS, getClub } from '../data/clubs.ts';
import { CUPS, MOVEMENTS, PARALLEL_COMPETITIONS, transferDestinations } from '../data/clubs2026/competitions2026.ts';
import { AR_DIVISIONS } from '../data/clubs2026/arSystem2026.ts';
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
    VETERAN_AGE, allowedRungs, clubIsInterested, generateOffers, isLadderBridge, isVeteranHomecoming,
    marketValue, qualifiesForExceptionalJump,
} from './club-offers.ts';
import { createPlayer } from './create-player.ts';
import { computeEffectiveOvr, computeOvr } from './scoring.ts';
import { createRng } from './random.ts';
import { runCareer, type Chooser } from './run-career.ts';

const SEEDS = Array.from({ length: 60 }, (_, i) => (i + 1) * 7919);
const CLUB_IDS = new Set(CLUBS.map((c) => c.id));

/**
 * Un club doméstico de ese país. Argentina ya no tiene una competición paraguas
 * `sa-ar`: hay que buscarlo por país, porque sus clubes están repartidos en las
 * divisiones reales de las dos ramas.
 */
function domesticClubOf(countryCode: string) {
    const club = CLUBS.find((c) => c.countryCode === countryCode && c.level === 'amateur');
    assert.ok(club, `sin clubes domésticos para ${countryCode}`);
    return club!;
}

function startClubFor(nationality: string, seed: number, origin = 'academia-club') {
    return getClub(createPlayer({ position: 'centre', nationality, origin }, createRng(seed)).club);
}

// ── Club inicial ─────────────────────────────────────────────────────────────
test('un argentino empieza en Argentina, un uruguayo en Uruguay, un chileno en Chile', () => {
    for (const [nationality, code] of [['Argentina', 'ar'], ['Uruguay', 'uy'], ['Chile', 'cl']] as const) {
        for (const seed of SEEDS) {
            const club = startClubFor(nationality, seed);
            assert.equal(club.countryCode, code, `${nationality} seed ${seed} arrancó en ${club.name} (${club.countryCode})`);
            // Argentina sale del canon (`arSystem2026.ts`); Uruguay y Chile del
            // snapshot real. En los dos casos es un club REAL, no inventado.
            const expected = code === 'ar' ? 'canon-ar' : 'supabase';
            assert.equal(club.source, expected, `${club.name}: fuente del club inicial`);
        }
    }
});

test('los países con liga modelada usan su ruta doméstica', () => {
    // Estados Unidos, Italia, Portugal y Brasil entraron en el catálogo `2026-27.9`
    // y por eso están acá y ya no en la lista de abajo: un estadounidense arranca en
    // la Ivy o en la D1A, un italiano en la Serie A, un portugués en la Divisão de
    // Honra y un brasileño en el Super 12.
    for (const [nationality, code] of [
        ['Francia', 'fr'], ['Inglaterra', 'gb-eng'], ['España', 'es'], ['Japón', 'jp'],
        ['Sudáfrica', 'za'], ['Nueva Zelanda', 'nz'],
        ['Estados Unidos', 'us'], ['Italia', 'it'], ['Portugal', 'pt'], ['Brasil', 'br'],
    ] as const) {
        for (const seed of SEEDS.slice(0, 20)) {
            assert.equal(startClubFor(nationality, seed).countryCode, code, `${nationality} debería arrancar en su país`);
        }
    }
});

test('una nacionalidad sin liga modelada usa una ruta migratoria DOCUMENTADA', () => {
    // Italia y Brasil SALIERON de esta lista al entrar sus ligas (catálogo
    // `2026-27.9`): ahora tienen escalera propia y su ruta es doméstica.
    for (const nationality of ['Fiyi', 'Samoa', 'Irlanda', 'Australia', 'Namibia', 'Corea del Sur']) {
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
    // QUÉ PROTEGE EL TECHO, que no es una opinión sobre el nivel del amateurismo:
    // la SRA tiene que quedar a MÁS de un escalón de cualquier club amateur. Un
    // pase de ±1 escalón es un movimiento normal y no pide nada; el salto al
    // profesionalismo tiene que pasar por la vía, que exige 59 de media. Con el
    // URBA Top 14 en el escalón 4 la SRA quedaba a ±1 y la oferta entraba por la
    // ventana normal: medido, un jugador de 56 en La Plata recibía oferta de
    // franquicia sin cumplir el requisito.
    const amateurCeiling = Math.max(...CLUBS.filter((c) => c.level === 'amateur').map(marketRung));
    const sraRung = marketRung(CLUBS.find((c) => c.competitionId === 'sra')!);
    assert.ok(sraRung - amateurCeiling >= 2, `SRA (${sraRung}) debe quedar a más de un escalón del amateurismo (${amateurCeiling})`);
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
        const domestic = domesticClubOf(country);
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
        // TODA VÍA TIENE QUE DECLARAR DE DÓNDE SALE, por competición o por club.
        // Desde que existe `fromClubIds` —lo pide el reparto de academias italiano,
        // que nace en Benetton y Zebre y no en la URC entera— una vía puede tener
        // `fromCompetitions: []`, y sin esta línea el bucle de abajo no recorrería
        // nada y una vía sin origen pasaría en silencio.
        assert.ok(
            pathway.fromCompetitions.length > 0 || (pathway.fromClubIds?.length ?? 0) > 0,
            `${pathway.id}: no declara ningún origen`,
        );
        for (const from of pathway.fromCompetitions) {
            assert.ok(CLUBS.some((c) => c.competitionId === from), `${pathway.id}: origen sin clubes (${from})`);
        }
        for (const from of pathway.fromClubIds ?? []) {
            assert.ok(CLUB_IDS.has(from), `${pathway.id}: club de origen inexistente (${from})`);
        }
    }
    for (const country of ['ar', 'uy', 'cl']) {
        assert.ok(pathwaysFrom(domesticClubOf(country)).length > 0, `${country} se quedó sin vía de salida`);
    }
    // Y la vía argentina sale de TODAS sus divisiones, no solo del Top 14: se
    // abre por el nivel del jugador, no por el escudo que tiene puesto.
    for (const division of AR_DIVISIONS) {
        const club = CLUBS.find((c) => c.competitionId === division.competitionId)!;
        assert.ok(
            pathwaysFrom(club).some((p) => p.id === 'ar-domestic-to-sra'),
            `${division.label} se quedó sin vía a la SRA`,
        );
    }
});

test('las cinco ligas nuevas tienen su vía de salida DECLARADA', () => {
    const vias = (competitionId: string) => {
        const club = CLUBS.find((c) => c.competitionId === competitionId)!;
        return pathwaysFrom(club).map((p) => p.id);
    };
    // Cada una sale por donde sale en la realidad, y ninguna por mercado abierto.
    assert.ok(vias('us-d1a').includes('us-college-to-mlr'), 'la D1A sale a la MLR');
    assert.ok(vias('us-ncr-d1').includes('us-college-to-mlr'), 'NCR también: es lo único que las conecta');
    assert.ok(vias('us-mlr').includes('mlr-to-abroad'), 'con la liga contrayéndose, hay salida al exterior');
    assert.ok(vias('pt-honra').includes('pt-honra-to-lusitanos'), 'Portugal sale por Lusitanos XV');
    assert.ok(vias('pt-honra').includes('emerging-europe-to-pro'), 'y por Francia, que es donde juegan los Lobos');
    assert.ok(vias('ita-serie-a-elite').includes('ita-elite-to-franchises'), 'Italia sale por los permit players');
    assert.ok(vias('br-super12').includes('br-super12-to-cobras'), 'Brasil sale por Cobras');

    // EL REPARTO DE ACADEMIAS VA AL REVÉS: nace en Benetton y Zebre y baja a la
    // Élite. Es la única vía del archivo declarada por CLUB de origen, y tiene que
    // seguir siéndolo: desde `urc` le llevaría ofertas de Viadana a un juvenil de
    // Leinster por un mecanismo que sólo existe en Italia.
    const reparto = TRANSFER_PATHWAYS.find((p) => p.id === 'ita-franchise-academy-to-elite')!;
    assert.deepEqual(reparto.fromCompetitions, [], 'no nace en una competición entera');
    assert.deepEqual([...reparto.fromClubIds!].sort(), ['benetton-treviso', 'zebre-parma']);
    assert.ok(pathwaysFrom(getClub('benetton-treviso')).some((p) => p.id === reparto.id));
    assert.ok(pathwaysFrom(getClub('zebre-parma')).some((p) => p.id === reparto.id));
    assert.ok(
        !pathwaysFrom(getClub('leinster')).some((p) => p.id === reparto.id),
        'un juvenil de Leinster no entra al reparto de la FIR',
    );
});

test('una vía NO garantiza oferta: sin nivel, el destino no se interesa', () => {
    // Origen explícito: `exterior-academia` fuerza migración y sacaría al
    // jugador de la liga uruguaya, que es justo la vía que se quiere probar.
    const rookie = createPlayer({ position: 'prop', nationality: 'Uruguay', origin: 'academia-club' }, createRng(31337));
    const franchise = getClub('penarol-rugby');
    const pathway = pathwaysFrom(getClub(rookie.club)).find((p) => p.id === 'uy-domestic-to-sra')!;
    assert.ok(pathway, 'la vía existe');

    // EL GATE ES `minOvr`, y es el que hace el trabajo que antes se le pedía a
    // `clubIsInterested`. Ese seguía dejando pasar al juvenil porque compara
    // `marketValue`, que a los 18 suma hasta 7 puntos de proyección por encima del
    // OVR: la promesa abría una puerta que no le correspondía.
    const ovr = computeOvr(rookie.attributes, rookie.position);
    assert.ok(ovr < pathway.minOvr!, `un juvenil de 18 (OVR ${ovr}) no llega al nivel que pide la vía`);

    // Y no es sólo la precondición: la oferta NO aparece.
    const offers = generateOffers(rookie, computeEffectiveOvr(rookie), createRng(31337));
    assert.ok(
        !offers.some((o) => o.club === franchise.id),
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
                // EL PUENTE SOBRE EL POZO es la cuarta razón legítima. Siete
                // pirámides tienen un hueco entre su base y el escalón de arriba
                // (fr 2→5, nz 1→6, gb-eng 2→6…), y sin puente el que arrancaba en
                // el sótano quedaba atrapado de por vida. Se pregunta al motor en
                // vez de recalcular la regla acá: un test que la reimplementa deja
                // de vigilarla.
                if (isLadderBridge(player.club, offer.club, player.nationality)) continue;
                // LA APERTURA POR NIVEL es la quinta razón legítima: si sos tan
                // bueno que le alcanzás al club sin tolerancia, saltás escalones.
                // Se le pregunta al motor con la misma función que decide, en vez
                // de recalcular la regla acá.
                const destino = getClub(offer.club);
                if (
                    marketRung(destino) > current
                    && clubIsInterested(destino, marketValue(player, computeEffectiveOvr(player)), 0)
                ) continue;
                const delta = Math.abs(marketRung(getClub(offer.club)) - current);
                assert.ok(delta <= limit, `salto de ${delta} escalones por ventana sin excepción (${nationality})`);
            }
        }
    }
});

test('toda oferta declara por qué puerta entró', () => {
    const seen = new Set<string>();

    // Un recién creado arranca en el PISO de su pirámide (Heartland, Community
    // Cup, Fédérale 2…), y desde ahí las vías profesionales todavía no están
    // abiertas: hay que subir primero. Para ejercitar la puerta `pathway` hay
    // que poner al jugador donde la vía nace, que es justamente lo que la vía
    // significa. Antes esto salía por accidente porque el catálogo no tenía
    // piso amateur y un juvenil neozelandés debutaba directo en el NPC.
    // El caso REAL de la vía: no un pibe de 18, sino el destacado del NPC al que
    // una franquicia mira. Una vía profesional no es un regalo — exige nivel.
    const destacadoDelNpc = (p: ReturnType<typeof createPlayer>) => {
        p.club = 'auckland';
        p.league = 'npc';
        p.role = 'starter';
        p.age = 24;
        p.dynamics.form = 84;
        for (const key of Object.keys(p.attributes) as (keyof typeof p.attributes)[]) {
            p.attributes[key] = 78;
        }
    };

    const casos = [
        ...offersAcross('Argentina', SEEDS),
        ...offersAcross('Nueva Zelanda', SEEDS),
        ...offersAcross('Sudáfrica', SEEDS),
                ...offersAcross('Nueva Zelanda', SEEDS, destacadoDelNpc),
    ];

    {
        for (const { player, offers } of casos) {
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
                // 3) El PUENTE sobre el pozo de la escalera propia: el escalón
                //    inmediatamente superior de tu pirámide, esté a uno o a cinco.
                if (isLadderBridge(previous.club, season.club, nationality)) {
                    reasons.set('puente', (reasons.get('puente') ?? 0) + 1);
                    continue;
                }
                // 3b) LA APERTURA POR NIVEL, que cambia el CONTRATO de este test.
                //
                //     Subir de escalón porque le alcanzás al club es exactamente lo
                //     que el mercado tiene que permitir: si sos muy bueno saltás, y
                //     si no, la peleás desde abajo. Así que un salto HACIA ARRIBA de
                //     cualquier tamaño ya no necesita justificarse — la puerta la
                //     abrió `clubIsInterested` con tolerancia cero, que es más duro
                //     que la ventana de ±1.
                //
                //     No se verifica acá con un proxy sobre el OVR y es a propósito:
                //     el motor decide con `marketValue` del momento —que descuenta
                //     edad y lesiones— y el historial no guarda ese número. Un proxy
                //     que no coincide con la regla real no vigila nada; sólo falla
                //     en los bordes y se termina aflojando hasta que no sirve.
                //
                //     Lo que este test SIGUE vigilando, que es donde estaba el
                //     riesgo real, es el salto grande HACIA ABAJO: bajar tres
                //     escalones sin vía, sin ser veterano y sin volver a casa es un
                //     bug, y ninguna regla nueva lo justifica.
                if (marketRung(to) > marketRung(from)) {
                    reasons.set('nivel', (reasons.get('nivel') ?? 0) + 1);
                    continue;
                }
                // 4) Regreso del veterano: solo hacia abajo y a partir de los 33.
                assert.ok(
                    season.age >= VETERAN_AGE && marketRung(to) < marketRung(from),
                    `${nationality} seed ${seed}: salto de ${delta} escalones a los ${season.age} sin vía, excepción, puente ni regreso`,
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
        // 250 y no 40: con 40 la muestra quedaba en ~46 temporadas de academia y
        // el porcentaje se movía 15 puntos ante cualquier cambio que corriera el
        // stream del rng, sin que el balance real se hubiera movido. Medido con
        // n≈250 el valor se estabiliza en 60-64%.
        for (let i = 0; i < 250; i++) {
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
    // Vuelve a 0.6 (había bajado a 0.55 en 1.9.0 persiguiendo lo que resultó ser
    // ruido de una muestra de 46). Con la muestra ampliada el valor real es 60-64%.
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
