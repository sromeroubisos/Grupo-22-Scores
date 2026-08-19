// Genera el catálogo COMPLETO de países seleccionables del minijuego Carrera.
//
//  - baja TODAS las banderas en SVG a public/flags/{code}.svg
//  - genera src/features/career/data/countries.generated.ts con
//    {code, nameEs, region, flagPath} — el catálogo vive en el MOTOR, no en la UI
//  - escribe public/flags/LICENSE.txt y public/flags/_manifest.json
//
//   node scripts/gen-countries.mjs
//
// Fuente de banderas: flagcdn.com / flagpedia.net — dominio público (CC0).
// Nombres en español vía Intl.DisplayNames.
//
// REGLA DURA: todo código DEBE tener una región migratoria explícita. Si falta
// alguna, el script FALLA en vez de mandar el país a Europa por descarte.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLAGS_DIR = join(ROOT, 'public', 'flags');
const OUT_TS = join(ROOT, 'src', 'features', 'career', 'data', 'countries.generated.ts');

// Naciones de rugby que se ofrecen primero (en este orden).
const FREQUENT = ['ar', 'uy', 'cl', 'fr', 'gb-eng', 'ie', 'gb-sct', 'gb-wls', 'it', 'es', 'nz', 'au', 'za', 'jp', 'us', 'fj', 'ws', 'to', 'ge', 'ro', 'pt', 'na', 'ca', 'br'];

// Subdivisiones del Reino Unido (selecciones propias en rugby).
const UK_HOME = { 'gb-eng': 'Inglaterra', 'gb-sct': 'Escocia', 'gb-wls': 'Gales' };

// ── Regiones migratorias, país por país ──────────────────────────────────────
// Los transcontinentales se resuelven con criterio RUGBÍSTICO: Georgia, Turquía,
// Armenia, Azerbaiyán y Chipre juegan Rugby Europe → 'europe'.
const REGION_CODES = {
    'south-america': 'ar uy cl br py pe bo co ec ve gy sr gf fk gs',
    'north-america': 'us ca mx gt bz sv hn ni cr pa cu do ht jm pr tt bs bb ag dm gd kn lc vc ai aw bq bm cw ky gp mq ms mf bl pm sx tc vg vi gl',
    'british-isles': 'ie gb gb-eng gb-sct gb-wls im je gg',
    europe: 'al ad at by be ba bg hr cz dk ee fo fi fr de gi gr hu is it xk lv li lt lu mt md mc me nl mk no pl pt ro ru sm rs sk si es se ch ua va ax sj bv eu un tr cy ge am az',
    africa: 'dz ao bj bw bf bi cv cm cf td km cg cd ci dj eg gq er sz et ga gm gh gn gw ke ls lr ly mg mw ml mr mu yt ma mz na ne ng re rw sh st sn sc sl so za ss sd tz tg tn ug eh zm zw tf',
    pacific: 'fj ws to pg sb vu nc pf ck nu tv ki fm mh nr pw as gu mp wf tk pn um',
    oceania: 'au nz aq hm nf cx cc',
    asia: 'af bh bd bt bn kh cn hk in id ir iq il jp jo kz kw kg la lb mo my mv mn mm np kp om pk ps ph qa sa sg kr lk sy tw tj th tl tm ae uz vn ye io',
};

function buildRegionMap() {
    const map = new Map();
    for (const [region, codes] of Object.entries(REGION_CODES)) {
        for (const code of codes.split(/\s+/).filter(Boolean)) {
            if (map.has(code)) throw new Error(`país en dos regiones: ${code} (${map.get(code)} y ${region})`);
            map.set(code, region);
        }
    }
    return map;
}

const esNames = new Intl.DisplayNames(['es'], { type: 'region' });

function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

async function download(code) {
    const target = join(FLAGS_DIR, `${code}.svg`);
    if (existsSync(target)) return 'cache';
    const res = await fetch(`https://flagcdn.com/${code}.svg`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    return 'downloaded';
}

async function main() {
    mkdirSync(FLAGS_DIR, { recursive: true });
    const regions = buildRegionMap();

    const res = await fetch('https://flagcdn.com/en/codes.json');
    const allCodes = Object.keys(await res.json());
    const codes = allCodes.filter((c) => /^[a-z]{2}$/.test(c)).concat(Object.keys(UK_HOME));

    const rows = [];
    const missingRegion = [];
    for (const code of codes) {
        let nameEs;
        if (UK_HOME[code]) {
            nameEs = UK_HOME[code];
        } else {
            const resolved = esNames.of(code.toUpperCase());
            if (!resolved || resolved.toUpperCase() === code.toUpperCase()) continue; // código no resoluble
            nameEs = titleCase(resolved);
        }
        const region = regions.get(code);
        if (!region) { missingRegion.push(code); continue; }
        rows.push({ code, nameEs, region });
    }

    if (missingRegion.length > 0) {
        console.error(`FALTA región migratoria para ${missingRegion.length} códigos:`, missingRegion.join(' '));
        process.exit(1);
    }

    // Descarga con concurrencia limitada.
    const queue = [...rows];
    let downloaded = 0;
    let cached = 0;
    const failed = [];
    async function worker() {
        while (queue.length) {
            const row = queue.shift();
            try {
                const result = await download(row.code);
                if (result === 'downloaded') downloaded++; else cached++;
            } catch (error) {
                failed.push(`${row.code} (${error.message})`);
            }
        }
    }
    await Promise.all(Array.from({ length: 12 }, worker));
    if (failed.length > 0) {
        console.error('banderas que no se pudieron bajar:', failed.join(', '));
        process.exit(1);
    }

    // Orden: frecuentes primero, luego alfabético español.
    const collator = new Intl.Collator('es');
    const rank = new Map(FREQUENT.map((code, i) => [code, i]));
    rows.sort((a, b) => {
        const ra = rank.has(a.code);
        const rb = rank.has(b.code);
        if (ra && rb) return rank.get(a.code) - rank.get(b.code);
        if (ra) return -1;
        if (rb) return 1;
        return collator.compare(a.nameEs, b.nameEs);
    });

    const body = rows
        .map((r) => `    { code: '${r.code}', nameEs: ${JSON.stringify(r.nameEs)}, region: '${r.region}', flagPath: '/flags/${r.code}.svg' },`)
        .join('\n');

    writeFileSync(OUT_TS, `// ARCHIVO GENERADO — no editar a mano.
// Regenerar con:  node scripts/gen-countries.mjs
//
// Catálogo COMPLETO de países y territorios seleccionables como nacionalidad
// (ISO 3166-1 alpha-2 + las tres home nations británicas, que tienen selección
// propia en rugby). Vive en el MOTOR: la UI lo consume, no lo define.
//
// Cada país tiene una región migratoria EXPLÍCITA. Ninguno cae en Europa por
// descarte: el generador falla si falta una asignación.
//
// Banderas: SVG locales en public/flags/{code}.svg (flagcdn.com, dominio público).

import type { MigrationRegion } from '../engine/market-routes.ts';

export interface SelectableCountry {
    code: string;
    nameEs: string;
    region: MigrationRegion;
    flagPath: string;
}

/** Naciones de rugby que se ofrecen primero en el selector. */
export const FREQUENT_COUNTRY_CODES: readonly string[] = ${JSON.stringify(FREQUENT)};

export const SELECTABLE_COUNTRIES: SelectableCountry[] = [
${body}
];
`, 'utf8');

    writeFileSync(join(FLAGS_DIR, 'LICENSE.txt'),
        'Banderas SVG de flagcdn.com / flagpedia.net - dominio publico (CC0).\n'
        + 'Generadas por scripts/gen-countries.mjs. No editar a mano.\n', 'utf8');
    writeFileSync(join(FLAGS_DIR, '_manifest.json'),
        JSON.stringify({ format: 'svg', source: 'flagcdn.com', license: 'public-domain (CC0)', count: rows.length, codes: rows.map((r) => r.code) }, null, 2), 'utf8');

    console.log(`paises: ${rows.length} | banderas nuevas: ${downloaded} | ya estaban: ${cached}`);
    console.log(`escrito ${OUT_TS}`);
}

await main();
