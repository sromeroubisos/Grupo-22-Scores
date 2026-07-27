// Guardia de determinismo por INSPECCIÓN DEL CÓDIGO, no por comportamiento.
//
// El test de determinismo detecta la entropía cuando ya rompió algo. Este la
// detecta al escribirla: recorre los archivos de producción de engine/ y falla
// si aparece cualquier fuente de azar o de entorno que no sea el PRNG sembrado.
//
// También verifica la regla de dependencia del CLAUDE.md §7: el motor no importa
// React ni nada de app/, porque tiene que poder correr en un test de Node sin DOM.

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
 * Quita comentarios para no dar falsos positivos: `random.ts` documenta en su
 * cabecera que NO se usa Math.random, y eso no puede hacer fallar el test.
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
    { label: 'localStorage', pattern: /\blocalStorage\b/, why: 'la persistencia vive en app/careerStorage.ts' },
    { label: 'sessionStorage', pattern: /\bsessionStorage\b/, why: 'la persistencia vive en app/careerStorage.ts' },
    { label: 'window', pattern: /\bwindow\s*\./, why: 'el motor tiene que correr en Node sin DOM' },
    { label: 'document', pattern: /\bdocument\s*\./, why: 'el motor tiene que correr en Node sin DOM' },
    { label: 'navigator', pattern: /\bnavigator\s*\./, why: 'el motor tiene que correr en Node sin DOM' },
    { label: 'crypto.randomUUID/getRandomValues', pattern: /\bcrypto\s*\.\s*(randomUUID|getRandomValues)\b/, why: 'usá el rng sembrado' },
    { label: 'process.env', pattern: /\bprocess\s*\.\s*env\b/, why: 'el motor no depende del entorno de ejecución' },
];

test('engine/ no tiene ninguna fuente de entropía', () => {
    const violations: string[] = [];

    for (const file of productionFiles(ENGINE_DIR)) {
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

test('el motor no importa React ni nada de app/', () => {
    const violations: string[] = [];

    for (const file of productionFiles(FEATURE_DIR)) {
        const source = stripComments(readFileSync(file, 'utf8'));
        for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
            const spec = match[1];
            const offending =
                spec === 'react' || spec.startsWith('react/') || spec.startsWith('react-dom')
                || spec.startsWith('next/')
                || spec.includes('/app/') || /(^|\/)app\//.test(spec)
                || spec.startsWith('@/app');
            if (offending) violations.push(`${relative(FEATURE_DIR, file)} importa '${spec}'`);
        }
    }

    assert.deepEqual(
        violations,
        [],
        `features/career/** no puede depender de React ni de app/ (CLAUDE.md §7). Encontrado:\n\n${violations.join('\n')}\n`,
    );
});

test('el único Math.random del proyecto está en CareerFlow.tsx (la semilla)', () => {
    const gameDir = join(FEATURE_DIR, '..', '..', 'app', 'juegos', 'minijuegos', 'carrera-rugby');
    const conMathRandom: string[] = [];

    for (const file of productionFiles(gameDir)) {
        const source = stripComments(readFileSync(file, 'utf8'));
        if (/\bMath\s*\.\s*random\b/.test(source)) conMathRandom.push(file.split(/[\\/]/).pop()!);
    }

    assert.deepEqual(
        conMathRandom,
        ['CareerFlow.tsx'],
        'Math.random solo se permite en CareerFlow.tsx, para sortear la semilla inicial (CLAUDE.md §1)',
    );
});
