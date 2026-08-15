// La regla de dependencia de El Capitán, hecha máquina.
//
// Hay tres decisiones de arquitectura que se toman una vez y después nadie
// recuerda. Este test las sostiene sin que haga falta recordarlas:
//
//   1. El motor no depende de React ni de `app/`. Tiene que poder correr en un
//      test de Node sin DOM (CLAUDE.md §7).
//
//   2. Captain le toma prestados los catálogos a Carrera de Rugby por DOS
//      puertas declaradas y ninguna más: `data/catalogs.ts` para los datos y
//      `engine/random.ts` para el PRNG. Si mañana esos catálogos se mudan, hay
//      dos archivos que tocar y no veinte.
//
//   3. NADIE importa el barrel `@/features/career`. Ese barrel re-exporta el
//      motor entero de Carrera de Rugby —eventos, i18n, share-token,
//      run-career, el simulador de temporada— y traerlo para leer una lista de
//      clubes se lleva todo eso al bundle. Es la clase de regresión que no
//      rompe nada, no se ve en ninguna pantalla y solo aparece midiendo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const FEATURE_DIR = dirname(ENGINE_DIR);

/** Las dos únicas puertas hacia `career/`, en ruta con barras normales. */
const PUERTAS = ['data/catalogs.ts', 'engine/random.ts'];

function productionFiles(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir).sort()) {
        if (entry === '__tests__' || entry === 'node_modules') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            found.push(...productionFiles(full));
            continue;
        }
        if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
        if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue;
        found.push(full);
    }
    return found;
}

function stripComments(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(?<!:)\/\/.*$/gm, '');
}

/** Ruta del archivo dentro del feature, siempre con `/` (Windows incluido). */
function localPath(file: string): string {
    return relative(FEATURE_DIR, file).split(/[\\/]/).join('/');
}

/** Todos los especificadores de import/export de un archivo. */
function specifiersOf(file: string): string[] {
    const source = stripComments(readFileSync(file, 'utf8'));
    return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

test('captain/ no importa React ni nada de app/', () => {
    const violations: string[] = [];

    for (const file of productionFiles(FEATURE_DIR)) {
        for (const spec of specifiersOf(file)) {
            const offending =
                spec === 'react' || spec.startsWith('react/') || spec.startsWith('react-dom')
                || spec.startsWith('next/')
                || spec.includes('/app/') || /(^|\/)app\//.test(spec)
                || spec.startsWith('@/app');
            if (offending) violations.push(`${localPath(file)} importa '${spec}'`);
        }
    }

    assert.deepEqual(
        violations,
        [],
        `features/captain/** no puede depender de React ni de app/ (CLAUDE.md §7). Encontrado:\n\n${violations.join('\n')}\n`,
    );
});

test('solo data/catalogs.ts y engine/random.ts importan de career/', () => {
    const violations: string[] = [];

    for (const file of productionFiles(FEATURE_DIR)) {
        const local = localPath(file);
        if (PUERTAS.includes(local)) continue;
        for (const spec of specifiersOf(file)) {
            if (/(^|\/)career\//.test(spec) || spec.includes('features/career')) {
                violations.push(`${local} importa '${spec}'`);
            }
        }
    }

    assert.deepEqual(
        violations,
        [],
        `Captain le pide a career por dos puertas: ${PUERTAS.join(' y ')}. Encontrado:\n\n${violations.join('\n')}\n`,
    );
});

test('nadie importa el barrel de career', () => {
    const violations: string[] = [];

    for (const file of productionFiles(FEATURE_DIR)) {
        for (const spec of specifiersOf(file)) {
            const esBarrel =
                spec === '@/features/career'
                || spec === '../../career'
                || spec === '../career'
                || /(^|\/)career\/index(\.ts)?$/.test(spec);
            if (esBarrel) violations.push(`${localPath(file)} importa el barrel '${spec}'`);
        }
    }

    assert.deepEqual(
        violations,
        [],
        `El barrel de career arrastra el motor entero al bundle: importá por ruta profunda. Encontrado:\n\n${violations.join('\n')}\n`,
    );
});
