import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    FREQUENT_COUNTRY_CODES,
    NATIONS_VERSION,
    RUGBY_UNIONS,
    SELECTABLE_COUNTRIES,
    findCountry,
    findCountryByName,
    flagPathOf,
    hasUnion,
    normalizeSearch,
    regionOfCountry,
    searchCountries,
} from './nations.ts';
import { MIGRATION_ROUTES } from '../engine/market-routes.ts';
import { createPlayer } from '../engine/create-player.ts';
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
    assert.equal(searchCountries('').length, SELECTABLE_COUNTRIES.length, 'sin query devuelve todo');
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

test('un país SIN unión de rugby puede crear una carrera igual', () => {
    const withoutUnion = SELECTABLE_COUNTRIES.filter((c) => !hasUnion(c.code));
    assert.ok(withoutUnion.length > 150, 'debería haber muchos países sin unión');

    for (const country of [withoutUnion[0], withoutUnion[40], withoutUnion[100]]) {
        const player = createPlayer({ position: 'wing', nationalityCountryCode: country.code }, createRng(2026));
        assert.equal(player.nationality, country.nameEs, 'conserva la identidad elegida');
        assert.equal(player.eligibility.nationalityCountryCode, country.code);
        assert.deepEqual(player.eligibility.claims, [], 'sin selección ficticia');
        assert.ok(player.club.length > 0, 'igual recibe un club inicial');
        const ovr = computeOvr(player.attributes, player.position);
        assert.ok(ovr >= 34 && ovr <= 46, `OVR fuera de banda: ${ovr}`);
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
