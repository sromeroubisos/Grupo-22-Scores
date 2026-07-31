// Arquetipo de retiro (Fase 4). La tabla es una función pura, así que se testea
// caso por caso sin correr una carrera entera: lo que importa es que el ORDEN de
// prioridad sea el que se quiso y que los arquetipos de la ruta amateur no
// queden tapados por los genéricos.

import test from 'node:test';
import assert from 'node:assert/strict';
import { allArchetypeIds, careerArchetype, type ArchetypeInput } from '../archetypes.ts';
import { runCareer, hashSeed, buildCareerSummary, type Chooser } from '../../index.ts';

/** Carrera mínima e insulsa: no dispara ningún arquetipo salvo el fallback. */
function base(): ArchetypeInput {
    return {
        startRoute: 'professional',
        flags: {},
        honours: [],
        seasons: 4,
        caps: 0,
        titles: 0,
        peakOvr: 60,
        clubsPlayed: 3,
        firstProfessionalAge: null,
        // Amateur y no semipro: al sacarle a 'el-que-estuvo-cerca' el gate de ruta
        // —que con el arranque unificado no filtraba nada— el semipro pasó a ser un
        // desenlace con nombre propio, y la carrera insulsa dejó de ser insulsa.
        peakEmployment: 'amateur',
    };
}

test('la tabla siempre devuelve un arquetipo (nunca queda sin respuesta)', () => {
    assert.equal(careerArchetype(base()).id, 'entrega');
});

test('los ids son únicos', () => {
    const ids = allArchetypeIds();
    assert.equal(new Set(ids).size, ids.length);
});

test('todo arquetipo trae etiqueta y crónica no vacías', () => {
    // Se recorre disparando cada regla con un caso hecho a medida.
    const cases: ArchetypeInput[] = [
        { ...base(), flags: { campeon_mundo: 1 } },
        { ...base(), honours: ['Salón de la Fama'] },
        { ...base(), caps: 10, firstProfessionalAge: 25 },
        { ...base(), clubsPlayed: 1, seasons: 14 },
        { ...base(), titles: 5 },
        { ...base(), caps: 40 },
        { ...base(), startRoute: 'development', firstProfessionalAge: 29 },
        { ...base(), startRoute: 'development', firstProfessionalAge: 22 },
        { ...base(), peakOvr: 82 },
        { ...base(), peakOvr: 74 },
        { ...base(), peakEmployment: 'semi-professional' },
        { ...base(), peakEmployment: 'amateur', seasons: 10 },
        { ...base(), seasons: 13 },
        base(),
    ];
    for (const c of cases) {
        const a = careerArchetype(c);
        assert.ok(a.label.length > 0, `${a.id}: etiqueta vacía`);
        assert.ok(a.blurb.length > 0, `${a.id}: crónica vacía`);
        assert.ok(!a.label.includes('!') && !a.blurb.includes('!'), `${a.id}: signos de exclamación`);
    }
});

// ── Prioridad ────────────────────────────────────────────────────────────────

test('el campeón del mundo gana sobre cualquier otra cosa', () => {
    const i: ArchetypeInput = { ...base(), flags: { campeon_mundo: 1 }, titles: 9, caps: 60, peakOvr: 85 };
    assert.equal(careerArchetype(i).id, 'campeon-mundo');
});

test('el que llegó de abajo a la selección gana sobre multicampeón y emblema', () => {
    const i: ArchetypeInput = { ...base(), caps: 35, titles: 6, firstProfessionalAge: 25 };
    assert.equal(careerArchetype(i).id, 'de-la-quinta-al-seleccionado');
});

test('un club toda la vida exige un solo club Y una carrera larga', () => {
    assert.equal(careerArchetype({ ...base(), clubsPlayed: 1, seasons: 14 }).id, 'un-club-toda-la-vida');
    // Un solo club pero carrera corta: no alcanza.
    assert.notEqual(careerArchetype({ ...base(), clubsPlayed: 1, seasons: 6 }).id, 'un-club-toda-la-vida');
    // Carrera larga pero con varios clubes: tampoco.
    assert.notEqual(careerArchetype({ ...base(), clubsPlayed: 4, seasons: 14 }).id, 'un-club-toda-la-vida');
});

// ── Los arquetipos de la ruta amateur ────────────────────────────────────────

test('"de la quinta al seleccionado" SOLO se desbloquea desde la ruta amateur', () => {
    // Llegar a la selección no alcanza: hay que haber pasado cinco temporadas sin
    // vivir del rugby. El que firma a los 20 llegó por el camino previsto.
    const tarde = { ...base(), caps: 12, firstProfessionalAge: 25 };
    assert.equal(careerArchetype(tarde).id, 'de-la-quinta-al-seleccionado');
    assert.notEqual(
        careerArchetype({ ...tarde, firstProfessionalAge: 20 }).id,
        'de-la-quinta-al-seleccionado',
        'el que firmó a los 20 no viene de la quinta',
    );
});

test('"se hizo solo" es de la rama larga: al que ya se le veía no le corresponde', () => {
    const subio = { ...base(), firstProfessionalAge: 23 };
    assert.equal(careerArchetype({ ...subio, startRoute: 'development' }).id, 'se-hizo-solo');
    assert.notEqual(careerArchetype({ ...subio, startRoute: 'professional' }).id, 'se-hizo-solo');
});

test('"amateur de ley" exige no haberse profesionalizado nunca', () => {
    const i: ArchetypeInput = { ...base(), peakEmployment: 'amateur', seasons: 10 };
    assert.equal(careerArchetype(i).id, 'amateur-de-ley');
    // El que llegó a profesional ya no es "amateur de ley".
    assert.notEqual(careerArchetype({ ...i, firstProfessionalAge: 25 }).id, 'amateur-de-ley');
});

test('"el que estuvo cerca" separa al semipro del amateur puro', () => {
    const cerca: ArchetypeInput = { ...base(), peakEmployment: 'semi-professional', seasons: 10 };
    assert.equal(careerArchetype(cerca).id, 'el-que-estuvo-cerca');
    assert.equal(careerArchetype({ ...cerca, peakEmployment: 'amateur' }).id, 'amateur-de-ley');
});

test('"el que llegó tarde" mira la EDAD del primer contrato, no la rama', () => {
    // Ya no excluye a nadie por rama: nadie arranca adentro del profesionalismo,
    // así que firmar el full-time a los 28 es llegar tarde vengas de donde vengas.
    const tarde = { ...base(), firstProfessionalAge: 28 };
    for (const startRoute of ['development', 'professional'] as const) {
        assert.equal(careerArchetype({ ...tarde, startRoute }).id, 'el-que-llego-tarde');
    }
    assert.notEqual(careerArchetype({ ...tarde, firstProfessionalAge: 22 }).id, 'el-que-llego-tarde');
});

// ── Integración con el resumen real ──────────────────────────────────────────

const rotatingChooser: Chooser = (event, state) => {
    const idx = hashSeed(`${event.id}:${state.player.seasonsPlayed}`) % event.options.length;
    return event.options[idx].id;
};

test('toda carrera terminada sale con un arquetipo de la tabla', () => {
    const ids = new Set(allArchetypeIds());
    // `soloAmateur` se fue: con el arranque unificado no hay arquetipos vedados por
    // rama salvo `se-hizo-solo`, que tiene su propio test arriba. Lo que queda por
    // proteger es que la tabla NUNCA se quede sin respuesta.
    const soloRamaLarga = new Set(['se-hizo-solo']);

    for (const [route, seedBase] of [['development', 900], ['professional', 1300]] as const) {
        for (let i = 0; i < 25; i++) {
            const state = runCareer(
                { position: 'flyhalf', nationalityCountryCode: 'ar', startRoute: route },
                seedBase + i * 13,
                rotatingChooser,
            );
            const { archetype } = buildCareerSummary(state);
            assert.ok(ids.has(archetype.id), `arquetipo desconocido: ${archetype.id}`);
            if (route === 'professional') {
                assert.ok(
                    !soloRamaLarga.has(archetype.id),
                    `la rama rápida sacó un arquetipo de la rama larga: ${archetype.id}`,
                );
            }
        }
    }
});

test('la ruta amateur no colapsa en un único arquetipo', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
        const state = runCareer(
            { position: (['flyhalf', 'prop', 'wing', 'lock'] as const)[i % 4], nationalityCountryCode: 'ar', startRoute: 'development' },
            2000 + i * 29,
            rotatingChooser,
        );
        seen.add(buildCareerSummary(state).archetype.id);
    }
    // La rejugabilidad de la ruta amateur depende de esto: si el retiro siempre
    // dice lo mismo, no hay motivo para volver a jugarla.
    assert.ok(seen.size >= 3, `la ruta amateur solo produjo ${seen.size} arquetipo(s): ${[...seen].join(', ')}`);
});
