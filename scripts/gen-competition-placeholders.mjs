// Genera LOGOS PLACEHOLDER para las competiciones del catálogo del motor.
// Mismo trato que los clubes (ver gen-club-placeholders.mjs): lee los ids REALES
// desde el catálogo para que cada archivo coincida con la competición que usa el
// juego, y emite public/competiciones/{id}.svg + _manifest.json.
//
// El usuario reemplaza cada archivo por el logo real, MISMO NOMBRE, en .png o
// .svg — el manifiesto se regenera y toma la extensión que encuentre.
//
//   node scripts/gen-competition-placeholders.mjs

import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ALL_COMPETITIONS } from '../src/features/career/data/clubs2026/competitions2026.ts';
import { competitionLabelOf } from '../src/features/career/data/competition-levels2026.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'competiciones');

function hashHue(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % 360;
}

/** Monograma: las iniciales de las palabras, o las tres primeras letras. */
function monogramOf(name) {
    const words = name.split(/[^A-Za-zÀ-ÿ0-9]+/).filter((w) => w.length > 1);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').slice(0, 3).toUpperCase();
}

function svgFor(id, name) {
    const mono = monogramOf(name);
    const hue = hashHue(id);
    // Los torneos van en rombo y los clubes en cuadrado redondeado: en la línea
    // de tiempo y en el festejo aparecen juntos, y la forma los separa antes de
    // que haga falta leer el nombre.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label="${name}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue}, 38%, 32%)"/><stop offset="1" stop-color="hsl(${hue}, 38%, 20%)"/></linearGradient></defs>
  <rect x="50" y="2" width="68" height="68" rx="12" fill="url(#g)" transform="rotate(45 50 50)"/>
  <text x="50" y="52" font-family="Arial, sans-serif" font-weight="800" font-size="${mono.length >= 3 ? 26 : 32}" fill="#ffffff" text-anchor="middle" dominant-baseline="central" letter-spacing="0.5">${mono}</text>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
// Sólo se borran los placeholders: un .png cargado a mano sobrevive.
for (const f of readdirSync(OUT)) {
    if (f.endsWith('.svg')) rmSync(join(OUT, f));
}

const manifest = [];
for (const comp of ALL_COMPETITIONS) {
    // EL NOMBRE SALE DE LA COMPETICIÓN, y `competitionLabelOf` queda de respaldo.
    //
    // Estaba al revés y las ONCE COPAS del catálogo quedaban con su slug de nombre:
    // "champions-cup" en vez de "Champions Cup", y con eso el monograma del
    // placeholder salía "CHA" en lugar de "CC" y el `aria-label` leía el id.
    //
    // No era un descuido de este script sino una consecuencia: `competitionLabelOf`
    // lee la tabla de NIVELES, y una copa no tiene perfil de nivel a propósito (hay
    // un test que lo exige — una copa no es una liga ni un destino de fichaje). O
    // sea que para una copa siempre iba a caer al fallback. `comp.label` es el dato
    // que sí existe para las 69, así que va primero.
    const name = comp.label || competitionLabelOf(comp.id) || comp.id;
    // Si ya hay un archivo real cargado, no se pisa: se registra y listo.
    const png = existsSync(join(OUT, `${comp.id}.png`));
    if (!png) writeFileSync(join(OUT, `${comp.id}.svg`), svgFor(comp.id, name));
    manifest.push({
        id: comp.id,
        name,
        kind: comp.kind,
        scope: comp.scope,
        file: `public/competiciones/${comp.id}.${png ? 'png' : 'svg'}`,
        real: png,
    });
}

writeFileSync(join(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2));
const faltan = manifest.filter((m) => !m.real);
console.log(`${manifest.length} competiciones en public/competiciones/ — ${manifest.length - faltan.length} con logo real, ${faltan.length} con placeholder.`);
if (faltan.length > 0) console.log('Faltan:', faltan.map((m) => m.id).join(' '));
