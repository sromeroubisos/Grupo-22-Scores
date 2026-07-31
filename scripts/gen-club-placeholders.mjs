// Genera LOGOS PLACEHOLDER para los clubes del catálogo estático internacional
// (los que NO están en Supabase). Lee los ids/monogramas REALES desde el catálogo
// del motor (src/features/career/data/clubs.ts) para que cada archivo coincida
// con el club que usa el juego. Emite public/clubs/{id}.svg + _manifest.json.
// El usuario reemplaza cada archivo por el logo real (mismo path).
//
//   node scripts/gen-club-placeholders.mjs

import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CLUBS } from '../src/features/career/data/clubs.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'clubs');

function hashHue(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % 360;
}

function svgFor(club) {
    const mono = club.shortName || club.name.slice(0, 3).toUpperCase();
    const hue = hashHue(club.id);
    const bg = `hsl(${hue}, 42%, 30%)`;
    const bg2 = `hsl(${hue}, 42%, 22%)`;
    const size = mono.length >= 4 ? 26 : mono.length === 3 ? 32 : 40;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label="${club.name}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>
  <rect width="100" height="100" rx="22" fill="url(#g)"/>
  <rect x="4" y="4" width="92" height="92" rx="19" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>
  <text x="50" y="52" font-family="Arial, sans-serif" font-weight="800" font-size="${size}" fill="#ffffff" text-anchor="middle" dominant-baseline="central" letter-spacing="0.5">${mono}</text>
</svg>
`;
}

// Limpia svgs previos (ids viejos no coincidían con el catálogo real).
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) {
    if (f.endsWith('.svg')) rmSync(join(OUT, f));
}

const ids = new Set();
for (const club of CLUBS) {
    if (ids.has(club.id)) throw new Error(`ID duplicado: ${club.id}`);
    ids.add(club.id);
    writeFileSync(join(OUT, `${club.id}.svg`), svgFor(club));
}

const manifest = CLUBS.map((c) => ({ id: c.id, name: c.name, competition: c.competitionId, level: c.level, file: `public/clubs/${c.id}.svg` }));
writeFileSync(join(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`Generados ${CLUBS.length} logos placeholder en public/clubs/ (${new Set(CLUBS.map((c) => c.competitionId)).size} competiciones)`);
