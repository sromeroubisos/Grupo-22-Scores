// EL CALENDARIO INTERNACIONAL y el tope duro de caps que sale de él.
//
// Dos cosas se vigilan acá y son de naturaleza distinta:
//
//   1. Que el calendario esté bien escrito. Los códigos de país de las listas de
//      participantes se verifican contra `countries.generated`, porque la vuelta
//      pasada se escribió `gb-wal` donde va `gb-wls` y no lo atajó nada: una
//      lista con un código inventado no falla, simplemente deja a Gales sin
//      fixture y nadie se entera hasta que un galés termina la carrera con cero
//      caps.
//   2. EL TOPE DURO. Nadie suma más caps en una temporada que partidos jugó su
//      unión — ni por evento, ni por `testShare`, ni por redondeo. Es el tipo de
//      regla que se rompe callada, así que se verifica sobre TODAS las
//      temporadas de 2000 carreras y no sobre un caso armado.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    INTERNATIONAL_COMPETITIONS, RUGBY_UNIONS, SELECTABLE_COUNTRIES, SELECTABLE_NATIONALITIES,
    SUSPENDED_UNIONS, UNIONS_WITH_FIXTURE, NATIONS_CHAMPIONSHIP_ID, WORLD_CUP_ID,
    buildCareerSummary, competitionsFor, getInternationalCompetition, hasUnion, hashSeed,
    internationalMatches, internationalSeason, isPreWorldCupSeason, isWorldCupYear, runCareer,
    seasonYear, unionAbsenceReason, type Chooser,
} from '../../index.ts';

const rotating: Chooser = (e, s) => e.options[hashSeed(`${e.id}:${s.player.seasonsPlayed}`) % e.options.length].id;
const PUESTOS = ['prop', 'hooker', 'lock', 'backrow', 'scrumhalf', 'flyhalf', 'centre', 'wing', 'fullback'] as const;
const RUTAS = ['development', 'professional'] as const;

// ── 1. El calendario está bien escrito ───────────────────────────────────────

test('todo participante es un código de país que existe', () => {
    const conocidos = new Set(SELECTABLE_COUNTRIES.map((c) => c.code));
    const rotos: string[] = [];
    for (const comp of INTERNATIONAL_COMPETITIONS) {
        for (const union of comp.participants) {
            if (!conocidos.has(union)) rotos.push(`${comp.id}: '${union}'`);
        }
    }
    assert.deepEqual(rotos, [], 'códigos que no existen en countries.generated (¿gb-wal por gb-wls?)');
});

test('todo participante tiene una unión de rugby modelada', () => {
    // Un país puede ser nacionalidad sin tener selección (nations.ts §2). Al revés
    // no: si está en el calendario, tiene que poder ponerse la camiseta.
    const rotos: string[] = [];
    for (const comp of INTERNATIONAL_COMPETITIONS) {
        for (const union of comp.participants) {
            if (!(union in RUGBY_UNIONS)) rotos.push(`${comp.id}: '${union}'`);
        }
    }
    assert.deepEqual(rotos, [], 'participantes sin selección modelada en RUGBY_UNIONS');
});

test('ninguna competición repite un participante', () => {
    for (const comp of INTERNATIONAL_COMPETITIONS) {
        assert.equal(
            new Set(comp.participants).size,
            comp.participants.length,
            `${comp.id} tiene un participante repetido`,
        );
    }
});

test('los ids de competición y de trofeo son únicos', () => {
    const compIds = INTERNATIONAL_COMPETITIONS.map((c) => c.id);
    assert.equal(new Set(compIds).size, compIds.length, 'hay dos competiciones con el mismo id');
    const trofeos = INTERNATIONAL_COMPETITIONS.flatMap((c) => c.trophies.map((t) => t.id));
    assert.equal(new Set(trofeos).size, trofeos.length, 'hay dos trofeos con el mismo id');
});

test('un trofeo restringido sólo lo pueden ganar participantes del torneo', () => {
    for (const comp of INTERNATIONAL_COMPETITIONS) {
        for (const trophy of comp.trophies) {
            for (const union of trophy.eligible ?? []) {
                assert.ok(
                    comp.participants.includes(union),
                    `${trophy.id}: '${union}' no juega ${comp.id}`,
                );
            }
        }
    }
});

test('el Mundial tiene 24 clasificados', () => {
    const mundial = getInternationalCompetition(WORLD_CUP_ID);
    assert.ok(mundial !== null, 'el Mundial tiene que estar en el calendario');
    assert.equal(mundial.participants.length, 24);
});

// ── 2. La aritmética del calendario ──────────────────────────────────────────

test('los Mundiales caen en 2027, 2031 y 2035', () => {
    const mundiales = [];
    for (let s = 0; s < 20; s++) if (isWorldCupYear(s)) mundiales.push(seasonYear(s));
    assert.deepEqual(mundiales, [2027, 2031, 2035, 2039, 2043]);
});

test('la temporada previa al Mundial es la que afloja el umbral', () => {
    for (let s = 0; s < 20; s++) {
        assert.equal(isPreWorldCupSeason(s), isWorldCupYear(s + 1), `temporada ${seasonYear(s)}`);
    }
});

test('el Nations Championship nunca cae en un año de Mundial', () => {
    // Los dos son bianual/cuatrianual desde años de distinta paridad, así que no
    // se pisan nunca. Si alguien mueve una edición, esto lo atrapa: un jugador no
    // puede jugar los dos torneos grandes el mismo año.
    for (let s = 0; s < 20; s++) {
        const juegaNations = competitionsFor('ie', s).some((c) => c.id === NATIONS_CHAMPIONSHIP_ID);
        assert.ok(!(juegaNations && isWorldCupYear(s)), `${seasonYear(s)}: Nations Championship en año de Mundial`);
    }
});

test('toda unión con fixture juega algo todas las temporadas', () => {
    // El piso es DOS y no tres desde que el Asia Rugby Championship quedó
    // verificado en tres equipos y dos partidos: Corea del Sur juega dos tests en
    // una temporada sin clasificatorias, y eso es el dato real, no un agujero.
    for (const union of UNIONS_WITH_FIXTURE) {
        for (let s = 0; s < 12; s++) {
            assert.ok(
                internationalMatches(union, s) >= 2,
                `${union} en ${seasonYear(s)}: ${internationalMatches(union, s)} partidos`,
            );
        }
    }
});

test('un país sin unión no tiene fixture, y eso no rompe nada', () => {
    assert.equal(internationalMatches(null, 0), 0);
    assert.equal(internationalMatches('xx-no-existe', 0), 0);
});

// ── EL INVARIANTE QUE CIERRA LA CLASE DE BUG ─────────────────────────────────
//
// El bug no era Rusia: era que se podía ofrecer una selección que no juega
// ningún partido, y nada lo atajaba. El jugador elige la nacionalidad esperando
// jugar para esa camiseta y no hay un solo test en toda la carrera. Es una
// trampa, y era silenciosa: no falla nada, simplemente los caps quedan en cero
// para siempre.
//
// Con este test, ofrecer una selección sin fixture deja de ser posible. Vale
// para Rusia, para Egipto y para la próxima que a alguien se le ocurra agregar.

test('TODA unión que ofrece selección tiene fixture: nadie promete una camiseta que no se juega', () => {
    const sinFixture: string[] = [];
    for (const union of Object.keys(RUGBY_UNIONS).sort((a, b) => a.localeCompare(b))) {
        // Diez temporadas: alcanza para cubrir un ciclo de Mundial entero y las
        // dos paridades del Nations Championship.
        for (let s = 0; s < 10; s++) {
            if (internationalMatches(union, s) <= 0) {
                sinFixture.push(`${RUGBY_UNIONS[union]} (${union}) en ${seasonYear(s)}`);
                break;
            }
        }
    }
    assert.deepEqual(
        sinFixture,
        [],
        'una unión sin fixture es una selección que no se puede jugar. O entra en una competición '
        + 'del calendario internacional, o sale de RUGBY_UNIONS con su motivo en SUSPENDED_UNIONS.',
    );
});

test('toda nacionalidad OFRECIDA que promete selección la puede jugar', () => {
    // El mismo invariante desde la UI: lo que el selector ofrece tiene que ser
    // cierto. Si el picker muestra un país y `hasUnion` dice que sí, tiene que
    // haber partidos.
    const mentirosas = SELECTABLE_NATIONALITIES
        .filter((c) => hasUnion(c.code))
        .filter((c) => internationalMatches(c.code, 0) <= 0)
        .map((c) => `${c.nameEs} (${c.code})`);
    assert.deepEqual(mentirosas, [], 'el selector ofrece una selección sin fixture');
});

test('Rusia: suspendida, con motivo, y fuera del selector', () => {
    // La unión EXISTE y hoy no juega. Se saca del selector en vez de ofrecerla
    // vacía, y el motivo queda escrito y es distinto del de un país sin rugby.
    assert.ok('ru' in SUSPENDED_UNIONS, 'Rusia tiene que estar en SUSPENDED_UNIONS con su motivo');
    assert.equal(hasUnion('ru'), false, 'una unión suspendida no ofrece selección');
    assert.equal(unionAbsenceReason('ru'), 'suspendida');
    assert.equal(unionAbsenceReason('gl'), 'sin-federacion', 'Groenlandia no tiene federación, no está suspendida');
    assert.equal(unionAbsenceReason('ar'), null, 'Argentina sí tiene selección');

    assert.ok(
        !SELECTABLE_NATIONALITIES.some((c) => c.code === 'ru'),
        'Rusia no se puede ofrecer: sería elegir una camiseta que nunca juega',
    );
    // Pero la nacionalidad sigue existiendo: una carrera guardada con Rusia no
    // puede explotar, y la bandera tiene que seguir resolviendo.
    assert.ok(SELECTABLE_COUNTRIES.some((c) => c.code === 'ru'), 'la nacionalidad rusa no se borra del catálogo');
});

test('el fixture separa a las uniones, que es todo el punto', () => {
    // Argentina juega trece partidos y Georgia siete. El georgiano necesita casi
    // el doble de temporadas para llegar a los mismos caps, y eso sale del
    // fixture, no de un umbral.
    const media = (union: string) =>
        [0, 1, 2, 3].reduce((sum, s) => sum + internationalMatches(union, s), 0) / 4;

    assert.ok(media('ar') >= 12, `Argentina quedó en ${media('ar')} partidos por temporada`);
    assert.ok(media('ge') >= 7 && media('ge') <= 9, `Georgia quedó en ${media('ge')}`);
    assert.ok(media('th') <= 5, `Tailandia quedó en ${media('th')}`);
    assert.ok(media('ar') > media('ge'), 'Argentina tiene que jugar más que Georgia');
    assert.ok(media('ge') > media('th'), 'Georgia tiene que jugar más que Tailandia');
});

test('el desglose suma el total', () => {
    for (const union of ['nz', 'ie', 'ge', 'uy', 'th', 'na']) {
        for (let s = 0; s < 8; s++) {
            const f = internationalSeason(union, s);
            assert.equal(
                f.matches,
                f.competitionMatches + f.tourMatches + f.knockoutMatches + f.qualifierMatches,
                `${union} en ${f.year}: el desglose no cierra`,
            );
        }
    }
});

test('el año de Mundial suma partidos al que clasificó', () => {
    // 2027 contra 2028: el que está en el campo del Mundial juega más.
    const mundial = [...(getInternationalCompetition(WORLD_CUP_ID)?.participants ?? [])];
    for (const union of ['nz', 'ie', 'ar']) {
        assert.ok(mundial.includes(union), `control: ${union} está en el campo del Mundial`);
        assert.ok(
            internationalMatches(union, 1) > internationalMatches(union, 3),
            `${union}: el año de Mundial tiene que sumar partidos`,
        );
    }
});

// ── 3. EL TOPE DURO, sobre 2000 carreras ─────────────────────────────────────

test('NADIE suma más caps en una temporada que partidos jugó su unión', () => {
    const uniones = [...UNIONS_WITH_FIXTURE].sort((a, b) => a.localeCompare(b));
    const violaciones: string[] = [];
    let revisadas = 0;
    let internacionales = 0;

    for (let i = 0; i < 2000; i++) {
        const union = uniones[i % uniones.length];
        const state = runCareer(
            {
                position: PUESTOS[i % PUESTOS.length],
                nationalityCountryCode: union,
                startRoute: RUTAS[i % RUTAS.length],
            },
            hashSeed(`tope-duro:${union}:${i}`) % 0x7fffffff,
            rotating,
        );

        // Las uniones que efectivamente vistió. Casi siempre una; el cambio de
        // elegibilidad (`nt-eligibility-switch`) puede dejar dos, y ahí el tope
        // es el de la más grande — sigue siendo una cota válida.
        const vestidas = Object.keys(state.player.nationalStats).sort((a, b) => a.localeCompare(b));
        if (vestidas.length === 0) continue;
        internacionales++;

        for (const season of state.seasons) {
            if (season.capsGained <= 0) continue;
            revisadas++;
            const tope = Math.max(...vestidas.map((u) => internationalMatches(u, season.seasonIndex)));
            if (season.capsGained > tope) {
                violaciones.push(
                    `${vestidas.join('/')} · ${seasonYear(season.seasonIndex)}: `
                    + `${season.capsGained} caps sobre ${tope} partidos disponibles`,
                );
            }
        }
    }

    assert.ok(internacionales > 500, `sólo ${internacionales} carreras internacionales: la muestra no probó nada`);
    assert.ok(revisadas > 5000, `sólo ${revisadas} temporadas con caps revisadas`);
    assert.deepEqual(violaciones.slice(0, 10), [], `${violaciones.length} temporadas rompen el tope duro`);
});

test('el total de caps de una carrera nunca supera la suma de su fixture', () => {
    // El mismo invariante, mirado desde el otro lado: la carrera entera. Atrapa
    // el caso que el de arriba no ve — que alguien sume caps en una temporada que
    // no jugó.
    const uniones = ['nz', 'ie', 'ar', 'ge', 'uy', 'th'];
    for (let i = 0; i < 300; i++) {
        const union = uniones[i % uniones.length];
        const state = runCareer(
            {
                position: PUESTOS[i % PUESTOS.length],
                nationalityCountryCode: union,
                startRoute: RUTAS[i % RUTAS.length],
            },
            hashSeed(`tope-carrera:${union}:${i}`) % 0x7fffffff,
            rotating,
        );
        const caps = buildCareerSummary(state).caps;
        if (caps === 0) continue;
        const techo = state.seasons.reduce((sum, s) => sum + internationalMatches(union, s.seasonIndex), 0);
        assert.ok(caps <= techo, `${union}: ${caps} caps con un fixture de ${techo} partidos en toda la carrera`);
    }
});
