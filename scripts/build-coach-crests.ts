// Cruza los clubes de El Entrenador contra los escudos que ya tiene Carrera de
// Rugby y escribe `src/features/coach/data/legacy-crests.generated.ts`.
//
//   node --experimental-strip-types scripts/build-coach-crests.ts
//
// Por qué un archivo generado y no una función en runtime: el juego NO depende
// de `features/career`. Cruzar en runtime lo ataría a once archivos del otro
// motor (ver la memoria "Captain arrastra catálogos de career"); cruzar acá deja
// en el juego un mapa de strings y nada más.
//
// La fuente de escudos es `public/clubs/<id>.png` (el manifiesto compilado de
// career dice cuáles existen). No se usa el proxy de Supabase: de los clubes
// que cruzan, uno solo tiene `sourceId` sin PNG, y por uno no vale la pena
// pagar el 404 de 102 KB que devuelve el proxy con una clave que no existe.

import { writeFileSync } from 'node:fs';
import { AR_CLUBS, normalizeArName } from '../src/features/career/data/clubs2026/arCatalog.ts';
import { LOCAL_CLUB_LOGOS } from '../src/features/career/data/logo-manifest.generated.ts';
import { CLUBS } from '../src/features/coach/data/legacy-clubs.generated.ts';
import { CREST_ALIASES } from '../src/features/coach/data/crest-aliases.ts';
import { selectableClubs, seedWorld } from '../src/features/coach/engine/world.ts';

const OUT = 'src/features/coach/data/legacy-crests.generated.ts';

const careerByName = new Map<string, string[]>();
for (const club of AR_CLUBS) {
    const key = normalizeArName(club.name);
    careerByName.set(key, [...(careerByName.get(key) ?? []), club.id]);
}
const careerIds = new Set(AR_CLUBS.map((c) => c.id));

const crests: Record<string, string> = {};
const missingAlias: string[] = [];
const aliasWithoutPng: string[] = [];
const selectable = new Set(selectableClubs(seedWorld()));

for (const club of [...CLUBS].sort((a, b) => a.id.localeCompare(b.id))) {
    const alias = CREST_ALIASES[club.id];
    if (alias && !careerIds.has(alias)) missingAlias.push(`${club.id} → ${alias}`);
    const byName = careerByName.get(normalizeArName(club.name)) ?? [];
    // El alias declarado gana sobre el nombre; entre dos por nombre, el primero
    // es arbitrario, así que se exige que sea uno solo.
    const careerId = alias ?? (byName.length === 1 ? byName[0] : undefined);
    if (!careerId) continue;
    if (!LOCAL_CLUB_LOGOS.has(careerId)) {
        if (alias) aliasWithoutPng.push(`${club.id} → ${alias}`);
        continue;
    }
    crests[club.id] = `/clubs/${careerId}.png`;
}

const withCrest = Object.keys(crests);
const selectableWithCrest = withCrest.filter((id) => selectable.has(id)).length;

const lines = [
    '// GENERADO por scripts/build-coach-crests.ts — no editar a mano.',
    '//',
    '// Escudo real de cada club del juego, cruzado contra los PNG que ya tiene',
    '// Carrera de Rugby en `public/clubs/`. Un club que no está acá se dibuja con',
    '// su escudo de color y sigla. Para sumar uno: si el nombre no cruza solo,',
    '// declaralo en `crest-aliases.ts` y volvé a correr el script.',
    '//',
    `// Cobertura: ${withCrest.length} de ${CLUBS.length} clubes; ${selectableWithCrest} de ${selectable.size} dirigibles.`,
    '',
    'export const CLUB_CRESTS: Readonly<Record<string, string>> = {',
    ...withCrest.map((id) => `    ${id}: '${crests[id]}',`),
    '};',
    '',
];
writeFileSync(OUT, lines.join('\n'));

console.log(`${OUT}: ${withCrest.length}/${CLUBS.length} clubes con escudo, ${selectableWithCrest}/${selectable.size} dirigibles`);
if (missingAlias.length) console.log(`ALIAS A UN ID QUE NO EXISTE:\n${missingAlias.join('\n')}`);
if (aliasWithoutPng.length) console.log(`ALIAS SIN PNG (no sirven de nada):\n${aliasWithoutPng.join('\n')}`);
