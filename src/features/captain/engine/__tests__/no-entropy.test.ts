// Guardia de determinismo por INSPECCIÓN DEL CÓDIGO, no por comportamiento.
//
// Es el test de `career/engine/__tests__/no-entropy.test.ts` traído a captain,
// con una diferencia deliberada: allá se inspecciona solo `engine/`, acá se
// inspecciona EL FEATURE ENTERO. Career tiene historia y catálogos que se
// escribieron antes de la regla; captain nace con ella, así que no hay motivo
// para dejarle una zona franca a `types/`, `data/` o `state/`.
//
// El test de comportamiento detecta la entropía cuando ya rompió una partida.
// Este la detecta al escribirla.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const FEATURE_DIR = dirname(ENGINE_DIR);

/** Archivos de PRODUCCIÓN de un directorio (sin tests ni este directorio). */
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

/**
 * Quita comentarios para no dar falsos positivos: varios archivos documentan en
 * su cabecera que NO se usa Math.random, y eso no puede hacer fallar el test.
 * El `(?<!:)` evita cortar en el `//` de una URL.
 */
function stripComments(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(?<!:)\/\/.*$/gm, '');
}

interface Rule {
    label: string;
    pattern: RegExp;
    why: string;
}

const FORBIDDEN: Rule[] = [
    { label: 'Math.random()', pattern: /\bMath\s*\.\s*random\b/, why: 'usá el rng sembrado de engine/random.ts' },
    { label: 'Date.now()', pattern: /\bDate\s*\.\s*now\b/, why: 'el motor no lee el reloj: pasá el dato por parámetro' },
    { label: 'new Date()', pattern: /\bnew\s+Date\b/, why: 'el motor no lee el reloj: pasá el dato por parámetro' },
    { label: 'performance.now()', pattern: /\bperformance\s*\.\s*now\b/, why: 'el motor no mide tiempo real' },
    { label: 'localStorage', pattern: /\blocalStorage\b/, why: 'la persistencia vive en app/captainStorage.ts' },
    { label: 'sessionStorage', pattern: /\bsessionStorage\b/, why: 'la persistencia vive en app/captainStorage.ts' },
    { label: 'window', pattern: /\bwindow\s*\./, why: 'el motor tiene que correr en Node sin DOM' },
    { label: 'document', pattern: /\bdocument\s*\./, why: 'el motor tiene que correr en Node sin DOM' },
    { label: 'navigator', pattern: /\bnavigator\s*\./, why: 'el motor tiene que correr en Node sin DOM' },
    { label: 'crypto.randomUUID/getRandomValues', pattern: /\bcrypto\s*\.\s*(randomUUID|getRandomValues)\b/, why: 'usá el rng sembrado' },
    { label: 'process.env', pattern: /\bprocess\s*\.\s*env\b/, why: 'el motor no depende del entorno de ejecución' },
];

test('captain/ no tiene ninguna fuente de entropía', () => {
    const violations: string[] = [];

    for (const file of productionFiles(FEATURE_DIR)) {
        const source = stripComments(readFileSync(file, 'utf8'));
        source.split('\n').forEach((line, i) => {
            for (const rule of FORBIDDEN) {
                if (rule.pattern.test(line)) {
                    violations.push(`${relative(FEATURE_DIR, file)}:${i + 1}  ${rule.label} — ${rule.why}\n    ${line.trim()}`);
                }
            }
        });
    }

    assert.deepEqual(
        violations,
        [],
        `El motor tiene que ser determinista (CLAUDE.md §1). Encontrado:\n\n${violations.join('\n')}\n`,
    );
});

test('el único Math.random del juego está en CaptainFlow.tsx (la semilla)', () => {
    // Un solo lugar legítimo, igual que en Carrera de Rugby: sortear la semilla
    // inicial. De ahí en adelante todo sale del PRNG sembrado, y por eso la
    // misma semilla con las mismas decisiones da la misma carrera.
    const gameDir = join(FEATURE_DIR, '..', '..', 'app', 'juegos', 'minijuegos', 'el-capitan');
    const conMathRandom: string[] = [];

    for (const file of productionFiles(gameDir)) {
        const source = stripComments(readFileSync(file, 'utf8'));
        if (/\bMath\s*\.\s*random\b/.test(source)) conMathRandom.push(file.split(/[\\/]/).pop()!);
    }

    assert.deepEqual(
        conMathRandom,
        ['CaptainFlow.tsx'],
        'Math.random solo se permite en el orquestador, para sortear la semilla (CLAUDE.md §1)',
    );
});
