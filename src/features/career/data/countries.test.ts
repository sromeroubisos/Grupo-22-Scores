import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    FREQUENT_COUNTRY_CODES,
    NATIONS_VERSION,
    RUGBY_UNIONS,
    SELECTABLE_COUNTRIES,
    SELECTABLE_NATIONALITIES,
    findCountry,
    findCountryByName,
    flagPathOf,
    hasUnion,
    normalizeSearch,
    regionOfCountry,
    searchCountries,
    unionAbsenceReason,
    unionReputation,
    worldRanking,
    RANKED_UNION_COUNT,
} from './nations.ts';
import { MIGRATION_ROUTES } from '../engine/market-routes.ts';
import { START_OVR_MAX, START_OVR_MIN, createPlayer } from '../engine/create-player.ts';
import { createRng } from '../engine/random.ts';
import { computeOvr } from '../engine/scoring.ts';

const PUBLIC_DIR = join(process.cwd(), 'public');

test('el catálogo cubre todos los países y no tiene duplicados', () => {
    assert.ok(SELECTABLE_COUNTRIES.length >= 250, `catálogo corto: ${SELECTABLE_COUNTRIES.length}`);
    const codes = SELECTABLE_COUNTRIES.map((c) => c.code);
    assert.equal(new Set(codes).size, codes.length, 'códigos duplicados');
    const names = SELECTABLE_COUNTRIES.map((c) => c.nameEs);
    assert.equal(new Set(names).size, names.length, 'nombres duplicados');
    assert.ok(NATIONS_VERSION.length > 0, 'versión del catálogo sellada');
});

test('todo país tiene nombre, código estable y región migratoria VÁLIDA', () => {
    const validRegions = new Set(Object.keys(MIGRATION_ROUTES));
    for (const country of SELECTABLE_COUNTRIES) {
        assert.ok(/^[a-z]{2}(-[a-z]{3})?$/.test(country.code), `código raro: ${country.code}`);
        assert.ok(country.nameEs.length > 1, `${country.code} sin nombre`);
        assert.ok(validRegions.has(country.region), `${country.nameEs}: región inválida (${country.region})`);
        assert.equal(regionOfCountry(country.code), country.region);
    }
});

test('ningún país cae en Europa por descarte', () => {
    // Muestra de países que NO son europeos: si alguno figura como 'europe',
    // es que se coló por el fallback en vez de tener asignación explícita.
    const nonEuropean: [string, string][] = [
        ['jp', 'asia'], ['br', 'south-america'], ['ke', 'africa'], ['fj', 'pacific'],
        ['au', 'oceania'], ['mx', 'north-america'], ['ie', 'british-isles'],
        ['mn', 'asia'], ['pg', 'pacific'], ['bo', 'south-america'], ['ci', 'africa'],
        ['tv', 'pacific'], ['gl', 'north-america'], ['bt', 'asia'], ['sr', 'south-america'],
    ];
    for (const [code, expected] of nonEuropean) {
        assert.equal(regionOfCountry(code), expected, `${code} debería ser ${expected}`);
    }
    const europeans = SELECTABLE_COUNTRIES.filter((c) => c.region === 'europe');
    assert.ok(europeans.length < SELECTABLE_COUNTRIES.length * 0.35, `demasiados países en Europa: ${europeans.length}`);
});

test('cada país tiene un SVG local y el manifiesto coincide', () => {
    const missing: string[] = [];
    for (const country of SELECTABLE_COUNTRIES) {
        assert.ok(country.flagPath.endsWith('.svg'), `${country.nameEs}: la bandera debe ser SVG`);
        assert.equal(country.flagPath, `/flags/${country.code}.svg`);
        assert.equal(flagPathOf(country.code), country.flagPath);
        if (!existsSync(join(PUBLIC_DIR, country.flagPath))) missing.push(country.code);
    }
    assert.deepEqual(missing, [], `faltan banderas: ${missing.join(', ')}`);

    const manifest = JSON.parse(readFileSync(join(PUBLIC_DIR, 'flags', '_manifest.json'), 'utf8')) as {
        format: string; count: number; codes: string[];
    };
    assert.equal(manifest.format, 'svg');
    assert.equal(manifest.count, SELECTABLE_COUNTRIES.length, 'el manifiesto quedó desactualizado');
    assert.deepEqual([...manifest.codes].sort(), SELECTABLE_COUNTRIES.map((c) => c.code).sort());
    assert.ok(existsSync(join(PUBLIC_DIR, 'flags', 'LICENSE.txt')), 'falta la licencia de las banderas');
});

test('la búsqueda tolera mayúsculas, minúsculas y tildes', () => {
    assert.equal(normalizeSearch('España'), 'espana');
    for (const query of ['españa', 'ESPAÑA', 'Espana', 'espana', ' esPAÑa ']) {
        const hits = searchCountries(query);
        assert.ok(hits.some((c) => c.code === 'es'), `no encuentra España con "${query}"`);
    }
    assert.ok(searchCountries('japon').some((c) => c.code === 'jp'), 'Japón sin tilde');
    assert.ok(searchCountries('sudafrica').some((c) => c.code === 'za'), 'Sudáfrica sin tilde');
    // Sin query devuelve todo lo OFRECIBLE, que es el catálogo menos las uniones
    // suspendidas: el buscador y la grilla tienen que mostrar la misma lista.
    assert.equal(searchCountries('').length, SELECTABLE_NATIONALITIES.length, 'sin query devuelve todo lo ofrecible');
    // Ojo: 'rusia' matchea Bielorrusia, que sí se ofrece. Lo que no puede
    // aparecer es el código suspendido.
    assert.ok(
        !searchCountries('rusia').some((c) => c.code === 'ru'),
        'una unión suspendida tampoco aparece buscándola',
    );
    assert.equal(searchCountries('zzzzz').length, 0, 'sin resultados no rompe');

    assert.equal(findCountryByName('Espana')?.code, 'es', 'busca por nombre sin tilde');
    assert.equal(findCountryByName('España')?.code, 'es');
    assert.equal(findCountry('gb-eng')?.nameEs, 'Inglaterra');
});

test('las naciones de rugby frecuentes encabezan el catálogo', () => {
    const head = SELECTABLE_COUNTRIES.slice(0, FREQUENT_COUNTRY_CODES.length).map((c) => c.code);
    assert.deepEqual(head, [...FREQUENT_COUNTRY_CODES]);
    // El resto queda alfabético en español.
    const rest = SELECTABLE_COUNTRIES.slice(FREQUENT_COUNTRY_CODES.length).map((c) => c.nameEs);
    assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b, 'es')), 'el resto no está alfabético');
});

test('el ranking mundial es completo, sin empates y ordenado por reputación', () => {
    const puestos = Object.keys(RUGBY_UNIONS).map((code) => worldRanking(code));
    assert.ok(puestos.every((p) => p !== null), 'toda unión tiene puesto');
    assert.equal(new Set(puestos).size, puestos.length, 'dos uniones comparten puesto');
    assert.deepEqual(
        [...puestos].sort((a, b) => a! - b!),
        Array.from({ length: RANKED_UNION_COUNT }, (_, i) => i + 1),
        'el ranking tiene que ser 1..N sin huecos',
    );
    // Ordenado por reputación: nadie de una banda alta queda debajo de una baja.
    for (const a of Object.keys(RUGBY_UNIONS)) {
        for (const b of Object.keys(RUGBY_UNIONS)) {
            if (unionReputation(a) <= unionReputation(b)) continue;
            assert.ok(worldRanking(a)! < worldRanking(b)!, `${a} (rep ${unionReputation(a)}) tiene que rankear sobre ${b}`);
        }
    }
    assert.equal(worldRanking('xx-no-existe'), null);
    assert.equal(worldRanking(null), null);
});

test('un país sin selección lo dice: no tiene puesto ni promete convocatorias', () => {
    // El bug de Egipto: diecinueve temporadas, 392 partidos, cero caps, y la fila
    // decía "Egipto SELECCIONADO". Un país sin unión no puede tener un puesto en
    // el ranking, porque tener puesto es exactamente lo que implica que existe.
    // Egipto YA NO sirve de ejemplo, y ése era el objetivo: es miembro pleno de
    // Rugby Africa desde 2024 y ahora tiene unión y fixture. Los ejemplos de acá
    // son exclusiones deliberadas: Nueva Caledonia y Wallis y Futuna dependen de
    // la federación francesa y no son uniones propias.
    assert.equal(hasUnion('eg'), true, 'Egipto tiene unión: era el caso que abrió todo esto');
    for (const code of ['gl', 'nc', 'wf']) {
        assert.equal(hasUnion(code), false, `control: ${code} no tiene unión modelada`);
        assert.equal(worldRanking(code), null, `${code} no puede tener puesto en el ranking`);
        assert.equal(unionAbsenceReason(code), 'sin-federacion');
    }
});

test('un país SIN unión de rugby puede crear una carrera igual', () => {
    const withoutUnion = SELECTABLE_COUNTRIES.filter((c) => !hasUnion(c.code));
    // Bajó de 210 a ~127 con el catálogo completo de uniones: las seis
    // asociaciones regionales juntas son 128 uniones. Los que quedan afuera
    // siguen siendo mayoría del catálogo ISO y siguen pudiendo jugar.
    assert.ok(withoutUnion.length > 100, `sólo ${withoutUnion.length} países sin unión`);

    for (const country of [withoutUnion[0], withoutUnion[40], withoutUnion[100]]) {
        const player = createPlayer({ position: 'wing', nationalityCountryCode: country.code }, createRng(2026));
        assert.equal(player.nationality, country.nameEs, 'conserva la identidad elegida');
        assert.equal(player.eligibility.nationalityCountryCode, country.code);
        assert.deepEqual(player.eligibility.claims, [], 'sin selección ficticia');
        assert.ok(player.club.length > 0, 'igual recibe un club inicial');
        // La banda va LEÍDA de `create-player`, no escrita a mano. Acá decía
        // 34-46, que era el arranque de antes de que 1.26.0 unificara las rutas:
        // el test pedía un jugador que el motor ya no produce y fallaba con 55,
        // que es un valor perfectamente correcto. Un número copiado a mano de otro
        // módulo es un test que envejece solo.
        //
        // EL PISO DE 45 ES UNA REGLA DEL JUEGO, no una consecuencia: nadie que
        // entre a una carrera vale menos que eso. De ahí a que le vaya bien hay un
        // trecho, y ése lo decide la carrera.
        const ovr = computeOvr(player.attributes, player.position);
        assert.ok(ovr >= START_OVR_MIN && ovr <= START_OVR_MAX, `OVR fuera de banda: ${ovr}`);
        assert.ok(START_OVR_MIN >= 45, `el piso de arranque bajó a ${START_OVR_MIN}`);
    }
});

test('un país CON unión arranca elegible para su selección', () => {
    for (const code of ['ar', 'fj', 'ge', 'jp']) {
        const country = findCountry(code)!;
        const player = createPlayer({ position: 'centre', nationalityCountryCode: code }, createRng(77));
        assert.deepEqual(player.eligibility.claims, [{ union: code, route: 'birth' }], `${country.nameEs}`);
        assert.equal(RUGBY_UNIONS[code], country.nameEs, 'el nombre de la unión coincide con el del país');
    }
});

test('la UI puede pasar el CÓDIGO y el motor resuelve el resto', () => {
    const player = createPlayer({ position: 'prop', nationalityCountryCode: 'gb-eng' }, createRng(5));
    assert.equal(player.nationality, 'Inglaterra');
    assert.equal(player.eligibility.nationalityCountryCode, 'gb-eng');
});
