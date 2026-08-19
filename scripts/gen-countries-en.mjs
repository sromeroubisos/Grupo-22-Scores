// Genera los nombres EN INGLÉS de los países y uniones del minijuego Carrera.
//
//   node scripts/gen-countries-en.mjs
//
// Sale de la MISMA fuente que los nombres en español (`Intl.DisplayNames`), leída
// con otro locale: así los dos catálogos no se pueden desincronizar por un país
// que alguien agregue a mano de un lado y no del otro.
//
// Los códigos vienen de `countries.generated.ts` (catálogo de nacionalidades) y
// de `RUGBY_UNIONS` (uniones). Los dos son códigos ISO alpha-2 salvo las tres
// home nations británicas, que Intl no conoce y van en `OVERRIDES`.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src', 'features', 'career', 'data');
const OUT = join(ROOT, 'src', 'features', 'career', 'i18n', 'countries.en.generated.ts');

// Lo que `Intl` no sabe o dice de una forma que el rugby no usa.
const OVERRIDES = {
    'gb-eng': 'England',
    'gb-sct': 'Scotland',
    'gb-wls': 'Wales',
    // World Rugby la nombra en francés en las dos lenguas.
    ci: 'Côte d’Ivoire',
};

function codesFrom(file, pattern) {
    const source = readFileSync(join(DATA, file), 'utf8');
    const found = new Set();
    for (const match of source.matchAll(pattern)) found.add(match[1]);
    return found;
}

const fromCountries = codesFrom('countries.generated.ts', /\{ code: '([^']+)'/g);

// `RUGBY_UNIONS` se escribe como objeto literal: claves con y sin comillas.
const nations = readFileSync(join(DATA, 'nations.ts'), 'utf8');
const unionsBlock = nations.slice(
    nations.indexOf('export const RUGBY_UNIONS'),
    nations.indexOf('export const RUGBY_UNION_MAPPINGS'),
);
const fromUnions = new Set();
for (const match of unionsBlock.matchAll(/(?:^|[,{\s])'?([a-z]{2}(?:-[a-z]{3})?)'?:\s*'/gm)) {
    fromUnions.add(match[1]);
}

const codes = [...new Set([...fromCountries, ...fromUnions])].sort();

const en = new Intl.DisplayNames(['en'], { type: 'region' });

const missing = [];
const entries = codes.map((code) => {
    if (OVERRIDES[code]) return [code, OVERRIDES[code]];
    const iso = code.toUpperCase();
    const name = en.of(iso);
    // `Intl` devuelve el código cuando no conoce la región.
    if (name === iso) {
        missing.push(code);
        return [code, code];
    }
    return [code, name];
});

if (missing.length > 0) {
    // REGLA DURA, la misma que el generador en español: no se inventa un nombre
    // ni se deja el código crudo en pantalla. Si falta uno, se agrega a OVERRIDES.
    throw new Error(`sin nombre en inglés: ${missing.join(', ')} — agregalos a OVERRIDES`);
}

const body = entries.map(([code, name]) => `    ${/^[a-z]+$/.test(code) ? code : `'${code}'`}: ${JSON.stringify(name)},`).join('\n');

writeFileSync(OUT, `// ARCHIVO GENERADO — no editar a mano.
// Regenerar con:  node scripts/gen-countries-en.mjs
//
// Nombre EN INGLÉS de cada país y unión, por código. Es UNA sola tabla para los
// dos usos —la nacionalidad del selector y el nombre de la unión— porque las
// claves de \`RUGBY_UNIONS\` son códigos de país: mantener dos tablas separadas
// garantizaba que un día dijeran cosas distintas del mismo código.
//
// Los nombres salen de \`Intl.DisplayNames(['en'])\`, la misma fuente que usa
// \`gen-countries.mjs\` para el español.

export const COUNTRY_NAMES_EN: Readonly<Record<string, string>> = {
${body}
};
`, 'utf8');

console.log(`${entries.length} nombres escritos en ${OUT}`);
