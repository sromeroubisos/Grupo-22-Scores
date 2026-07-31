// MANIFIESTO DE LOGOS LOCALES.
//
// Recorre public/clubs, public/competiciones y public/premios y anota qué ids
// tienen un archivo
// REAL cargado a mano (.png). Emite src/features/career/data/logo-manifest.generated.ts.
//
// Sólo entran los .png, NO los .svg: los .svg son los placeholders que genera
// gen-club-placeholders.mjs, y si entraran, los 496 cuadraditos con iniciales
// taparían los escudos reales que hoy llegan del proxy para los clubes AR/UY/CL.
// El manifiesto existe justamente para eso: para que el componente sepa si hay
// archivo local ANTES de pedirlo, y no se coma un 404 por club.
//
//   node scripts/gen-logo-manifest.mjs      (corre solo en `prebuild`)

import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'features', 'career', 'data', 'logo-manifest.generated.ts');

function pngIdsIn(folder) {
    const dir = join(ROOT, 'public', folder);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith('.png'))
        .map((f) => f.slice(0, -4))
        .sort();
}

const clubs = pngIdsIn('clubs');
const competitions = pngIdsIn('competiciones');
const awards = pngIdsIn('premios');

const lines = (ids) => (ids.length === 0 ? '' : `\n${ids.map((id) => `    '${id}',`).join('\n')}\n`);

writeFileSync(OUT, `// GENERADO por scripts/gen-logo-manifest.mjs — no editar a mano.
//
// Ids que tienen un logo REAL cargado en public/. El componente lo consulta
// antes de pedir la imagen: si el id no está acá, ni siquiera intenta la
// petición y va directo al proxy o al monograma. Sin esto, cada club sin
// archivo se comería un 404 (y el endpoint devuelve el HTML de la página de
// error, ~102 KB, con la imagen rota igual).

export const LOCAL_CLUB_LOGOS: ReadonlySet<string> = new Set([${lines(clubs)}]);

export const LOCAL_COMPETITION_LOGOS: ReadonlySet<string> = new Set([${lines(competitions)}]);

// Premios individuales (public/premios/<id>.png). El id es el de
// \`carrera-rugby/premios.ts\`, no el nombre que se lee en pantalla.
export const LOCAL_AWARD_LOGOS: ReadonlySet<string> = new Set([${lines(awards)}]);
`);

console.log(`Manifiesto: ${clubs.length} clubes, ${competitions.length} competiciones y ${awards.length} premios con logo real.`);
