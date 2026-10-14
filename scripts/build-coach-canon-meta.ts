/* build-coach-canon-meta.ts — los metadatos de El Entrenador sobre el CANON.
 *
 * La estructura del rugby argentino (qué clubes hay, en qué división juega cada
 * uno, en qué orden de fuerza, quién asciende) vive en UN solo lugar:
 * `src/features/career/data/clubs2026/arSystem2026.ts`. El Entrenador la lee de
 * ahí en tiempo de ejecución y no la copia.
 *
 * Lo que el canon no tiene y la pantalla necesita —ciudad, unión, colores, el
 * escudo— sale de acá:
 *
 *   · el id y el escudo, del catálogo real que ya resolvió Carrera (`arCatalog`):
 *     es el mismo club, con el mismo id, en los dos juegos;
 *   · la ciudad, la unión y los colores, del catálogo viejo de El Entrenador
 *     (rugby-manager-pro), cruzado por escudo o por nombre normalizado. Si no
 *     cruza, el campo queda VACÍO y el club figura en `pendientes`: no se inventa
 *     una ciudad.
 *
 *   node --experimental-strip-types scripts/build-coach-canon-meta.ts
 *
 * Sale en src/features/coach/data/club-meta.generated.ts.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AR_CATALOG, normalizeArName } from '../src/features/career/data/clubs2026/arCatalog.ts';
import { AR_DIVISIONS } from '../src/features/career/data/clubs2026/arSystem2026.ts';
import { CLUBS as LEGACY } from '../src/features/coach/data/legacy-clubs.generated.ts';
import { CLUB_CRESTS as LEGACY_CRESTS } from '../src/features/coach/data/legacy-crests.generated.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/features/coach/data/club-meta.generated.ts');

/** Club del catálogo de Carrera, por nombre canónico. */
const careerByName = new Map(AR_CATALOG.clubs.map((c) => [c.name, c]));

/** Club viejo de El Entrenador, por el id de Carrera al que apuntaba su escudo. */
const legacyByCareerId = new Map<string, (typeof LEGACY)[number]>();
for (const club of LEGACY) {
    const crest = LEGACY_CRESTS[club.id];
    const m = crest?.match(/^\/clubs\/(.+)\.png$/);
    if (m && !legacyByCareerId.has(m[1])) legacyByCareerId.set(m[1], club);
}

/** Club viejo por nombre normalizado. Si dos normalizan igual, no se elige: se descarta. */
const legacyByNorm = new Map<string, (typeof LEGACY)[number] | null>();
for (const club of LEGACY) {
    for (const key of new Set([normalizeArName(club.name), normalizeArName(club.short)])) {
        legacyByNorm.set(key, legacyByNorm.has(key) ? null : club);
    }
}

interface Meta {
    id: string;
    legacyId: string | null;
    city: string;
    prov: string;
    unionId: string;
    c1: string;
    c2: string;
    crest: string | null;
}

const meta: Record<string, Meta> = {};
const pendientes: string[] = [];
const usedLegacy = new Set<string>();

for (const division of AR_DIVISIONS) {
    for (const name of division.clubs) {
        const career = careerByName.get(name);
        if (!career) throw new Error(`El canon nombra "${name}" y arCatalog no lo resolvió`);
        let legacy = legacyByCareerId.get(career.id) ?? legacyByNorm.get(normalizeArName(name)) ?? null;
        // Un club viejo no puede prestarle la ciudad a dos clubes del canon.
        if (legacy && usedLegacy.has(legacy.id)) legacy = null;
        if (legacy) usedLegacy.add(legacy.id);
        else pendientes.push(`${name} (${division.competitionId})`);

        const png = `/clubs/${career.id}.png`;
        meta[name] = {
            id: career.id,
            legacyId: legacy?.id ?? null,
            city: legacy?.city ?? '',
            prov: legacy?.prov ?? '',
            unionId: legacy?.unionId ?? '',
            // Sin colores conocidos va un par neutro: el respaldo del escudo no
            // inventa la camiseta de nadie.
            c1: legacy?.c1 ?? '#475569',
            c2: legacy?.c2 ?? '#e2e8f0',
            crest: existsSync(resolve(ROOT, 'public', png.slice(1))) ? png : (legacy ? LEGACY_CRESTS[legacy.id] ?? null : null),
        };
    }
}

const names = Object.keys(meta).sort((a, b) => a.localeCompare(b, 'es'));
const body = names.map((n) => `    ${JSON.stringify(n)}: ${JSON.stringify(meta[n])},`).join('\n');
const crests = names.filter((n) => meta[n].crest).length;

writeFileSync(
    OUT,
    `// GENERADO por scripts/build-coach-canon-meta.ts — NO EDITAR A MANO.
//
// Metadatos de pantalla de los clubes del CANON (arSystem2026.ts), por nombre
// canónico. La estructura —división, orden de fuerza, ascensos— NO está acá: se
// lee del canon. Si el canon suma un club, volvé a correr el script; hay un test
// que falla si algún club del canon no tiene fila.
//
// Clubes: ${names.length}. Con escudo: ${crests}. Sin ciudad/unión conocidas: ${pendientes.length}.

export interface ClubMeta {
    /** El MISMO id que en Carrera de Rugby: es el mismo club. */
    id: string;
    /** Id en el catálogo viejo de El Entrenador, para migrar partidas. */
    legacyId: string | null;
    /** Vacíos cuando no se pudo verificar: se muestran como pendientes. */
    city: string;
    prov: string;
    unionId: string;
    c1: string;
    c2: string;
    crest: string | null;
}

export const CLUB_META: Readonly<Record<string, ClubMeta>> = {
${body}
};

/**
 * Clubes del canon cuya ciudad y unión no se pudieron cruzar con una fuente. Van
 * sin ciudad en la pantalla en vez de con una inventada.
 */
export const CLUB_META_PENDING: readonly string[] = ${JSON.stringify(pendientes.sort(), null, 4)};
`,
);

console.log(`clubes ${names.length} · escudo ${crests} · pendientes ${pendientes.length}`);
console.log(pendientes.join('\n'));
