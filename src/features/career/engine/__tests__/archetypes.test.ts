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
        peakEmployment: 'semi-professional',
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
        { ...base(), startRoute: 'amateur', caps: 10 },
        { ...base(), clubsPlayed: 1, seasons: 14 },
        { ...base(), titles: 5 },
        { ...base(), caps: 40 },
        { ...base(), startRoute: 'amateur', firstProfessionalAge: 29 },
        { ...base(), startRoute: 'amateur', firstProfessionalAge: 22 },
        { ...base(), peakOvr: 82 },
        { ...base(), peakOvr: 74 },
        { ...base(), startRoute: 'amateur', peakEmployment: 'semi-professional' },
        { ...base(), startRoute: 'amateur', peakEmployment: 'amateur', seasons: 10 },
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

test('la ruta amateur con caps gana sobre multicampeón y emblema', () => {
    const i: ArchetypeInput = { ...base(), startRoute: 'amateur', caps: 35, titles: 6 };
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
    const conCaps = { ...base(), caps: 12 };
    assert.equal(careerArchetype({ ...conCaps, startRoute: 'amateur' }).id, 'de-la-quinta-al-seleccionado');
    for (const route of ['development', 'professional'] as const) {
        assert.notEqual(
            careerArchetype({ ...conCaps, startRoute: route }).id,
            'de-la-quinta-al-seleccionado',
            `la ruta ${route} no debería poder desbloquearlo`,
        );
    }
});

test('"se hizo solo" SOLO se desbloquea desde la ruta amateur', () => {
    const subio = { ...base(), firstProfessionalAge: 23 };
    assert.equal(careerArchetype({ ...subio, startRoute: 'amateur' }).id, 'se-hizo-solo');
    assert.notEqual(careerArchetype({ ...subio, startRoute: 'professional' }).id, 'se-hizo-solo');
});

test('"amateur de ley" exige no haberse profesionalizado nunca', () => {
    const i: ArchetypeInput = { ...base(), startRoute: 'amateur', peakEmployment: 'amateur', seasons: 10 };
    assert.equal(careerArchetype(i).id, 'amateur-de-ley');
    // El que llegó a profesional ya no es "amateur de ley".
    assert.notEqual(careerArchetype({ ...i, firstProfessionalAge: 25 }).id, 'amateur-de-ley');
});

test('"el que estuvo cerca" separa al semipro del amateur puro', () => {
    const cerca: ArchetypeInput = { ...base(), startRoute: 'amateur', peakEmployment: 'semi-professional', seasons: 10 };
    assert.equal(careerArchetype(cerca).id, 'el-que-estuvo-cerca');
    assert.equal(careerArchetype({ ...cerca, peakEmployment: 'amateur' }).id, 'amateur-de-ley');
});

test('"el que llegó tarde" no le toca al que arrancó en el profesionalismo', () => {
    // Arrancar en la ruta profesional y firmar el full-time a los 28 no es
    // llegar tarde: es el camino normal de esa ruta.
    const tarde = { ...base(), firstProfessionalAge: 28 };
    assert.notEqual(careerArchetype({ ...tarde, startRoute: 'professional' }).id, 'el-que-llego-tarde');
    assert.equal(careerArchetype({ ...tarde, startRoute: 'development' }).id, 'el-que-llego-tarde');
});

// ── Integración con el resumen real ──────────────────────────────────────────

const rotatingChooser: Chooser = (event, state) => {
    const idx = hashSeed(`${event.id}:${state.player.seasonsPlayed}`) % event.options.length;
    return event.options[idx].id;
};

test('toda carrera terminada sale con un arquetipo coherente con su ruta', () => {
    const ids = new Set(allArchetypeIds());
    // Arquetipos que NO puede sacar quien arrancó ya adentro del profesionalismo.
    const soloAmateur = new Set(['de-la-quinta-al-seleccionado', 'se-hizo-solo', 'amateur-de-ley', 'el-que-estuvo-cerca']);

    for (const [route, seedBase] of [['amateur', 500], ['development', 900], ['professional', 1300]] as const) {
        for (let i = 0; i < 25; i++) {
            const state = runCareer(
                { position: 'flyhalf', nationalityCountryCode: 'ar', startRoute: route },
                seedBase + i * 13,
                rotatingChooser,
            );
            const { archetype } = buildCareerSummary(state);
            assert.ok(ids.has(archetype.id), `arquetipo desconocido: ${archetype.id}`);
            if (route !== 'amateur') {
                assert.ok(
                    !soloAmateur.has(archetype.id),
                    `la ruta ${route} sacó un arquetipo exclusivo de la amateur: ${archetype.id}`,
                );
            }
        }
    }
});

test('la ruta amateur no colapsa en un único arquetipo', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
        const state = runCareer(
            { position: (['flyhalf', 'prop', 'wing', 'lock'] as const)[i % 4], nationalityCountryCode: 'ar', startRoute: 'amateur' },
            2000 + i * 29,
            rotatingChooser,
        );
        seen.add(buildCareerSummary(state).archetype.id);
    }
    // La rejugabilidad de la ruta amateur depende de esto: si el retiro siempre
    // dice lo mismo, no hay motivo para volver a jugarla.
    assert.ok(seen.size >= 3, `la ruta amateur solo produjo ${seen.size} arquetipo(s): ${[...seen].join(', ')}`);
});
