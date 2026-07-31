// INVENTARIO DE LOGOS DE COMPETENCIAS Y TROFEOS.
//
// Contesta una sola pregunta, que es la que aparece cada vez que hay que cargar
// un escudo a mano: ¿con qué nombre tengo que guardar este archivo para que el
// juego lo encuentre? Emite `docs/logos/inventario-logos.json`.
//
// Se GENERA, no se escribe a mano: los nombres salen del catálogo del motor, así
// que si mañana entra una competición nueva aparece acá sola. Correr:
//
//     node scripts/gen-logo-inventory.mjs
//
// La regla del juego: un logo existe si hay un .PNG con el id como nombre en
// `public/competiciones/`. Los .svg son placeholders que genera
// `gen-competition-placeholders.mjs` y NO cuentan como logo real — el manifiesto
// que compila `gen-logo-manifest.mjs` sólo mira los .png.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = process.cwd();
const CARPETA_COMPETICIONES = 'public/competiciones';
const SALIDA = 'docs/logos';

const importar = (rel) => import(pathToFileURL(join(RAIZ, rel)).href);

const { ALL_COMPETITIONS } = await importar('src/features/career/data/clubs2026/competitions2026.ts');
// EL CALENDARIO INTERNACIONAL ES EL OTRO CATÁLOGO, y hasta ahora el inventario
// no lo miraba: el Mundial, el Seis Naciones y el Rugby Championship no tenían
// ranura de archivo, así que un festejo de título de selección no podía mostrar
// su trofeo ni había forma de saber que faltaba. Comparten carpeta con las de
// club (un trofeo es su competición, misma regla), y los ids no chocan.
const { INTERNATIONAL_COMPETITIONS } = await importar('src/features/career/data/international-calendar.ts');
const { CLUBS } = await importar('src/features/career/data/clubs.ts');
const { competitionLabelOf } = await importar('src/features/career/data/competition-levels2026.ts');
const { isUmbrellaSystem } = await importar('src/features/career/engine/competition-identity.ts');

/** Qué hay hoy en disco, por extensión. */
function enDisco(carpeta) {
    let archivos = [];
    try {
        archivos = readdirSync(join(RAIZ, carpeta));
    } catch {
        // La carpeta puede no existir todavía: se informa como que falta todo.
    }
    const png = new Set();
    const svg = new Set();
    for (const f of archivos) {
        const punto = f.lastIndexOf('.');
        if (punto < 0) continue;
        const id = f.slice(0, punto);
        const ext = f.slice(punto + 1).toLowerCase();
        if (ext === 'png') png.add(id);
        if (ext === 'svg') svg.add(id);
    }
    return { png, svg };
}

const { png, svg } = enDisco(CARPETA_COMPETICIONES);

const TIPO_ES = {
    league: 'liga',
    'domestic-cup': 'copa doméstica',
    'continental-cup': 'copa continental',
    'regional-cup': 'copa regional',
};

const deClubes = [...ALL_COMPETITIONS].map((c) => ({
    id: c.id,
    nombre: c.label,
    tipo: TIPO_ES[c.kind] ?? c.kind,
    alcance: c.scope,
    region: c.region,
}));

// Las de selecciones: mismo formato, para que la lista sea una sola. El torneo
// internacional no tiene `scope` ni `region` de club — se marca como tal.
const deSelecciones = [...INTERNATIONAL_COMPETITIONS].map((c) => ({
    id: c.id,
    nombre: c.name,
    tipo: c.kind === 'tournament' ? 'torneo de selecciones' : c.kind,
    alcance: 'national-team',
    region: 'internacional',
}));

const competencias = [...deClubes, ...deSelecciones]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => ({
        ...c,
        archivoQueEsperaElJuego: `${CARPETA_COMPETICIONES}/${c.id}.png`,
        tieneLogoReal: png.has(c.id),
        hayPlaceholderSvg: svg.has(c.id),
    }));

// LOS TROFEOS son los títulos que pueden entrar en la vitrina de una carrera, y
// un trofeo ES su competición: el juego no tiene una carpeta aparte para copas.
// Por eso el archivo que espera es el mismo, y por eso están listados al lado.
//
// Los sistemas paraguas (AR/UY/CL) suman los suyos: ahí el título no se llama
// como la competición sino como la DIVISIÓN real del club ("Torneo del Interior
// A"), que es lo que el jugador ve en su vitrina. Ese nombre no tiene id propio
// de archivo: hoy hereda el logo de su paraguas.
const trofeos = competencias.map((c) => ({
    nombre: c.nombre,
    competenciaId: c.id,
    origen: c.tipo,
    archivoQueEsperaElJuego: c.archivoQueEsperaElJuego,
    tieneLogoReal: c.tieneLogoReal,
}));

const divisiones = new Map();
for (const club of CLUBS) {
    if (!isUmbrellaSystem(club.competitionId) || !club.divisionName) continue;
    if (divisiones.has(club.divisionName)) continue;
    divisiones.set(club.divisionName, {
        nombre: club.divisionName,
        competenciaId: club.competitionId,
        origen: `división de ${competitionLabelOf(club.competitionId)}`,
        archivoQueEsperaElJuego: `${CARPETA_COMPETICIONES}/${club.competitionId}.png`,
        tieneLogoReal: png.has(club.competitionId),
    });
}

const trofeosTodos = [...trofeos, ...[...divisiones.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))];

// ---- PREMIOS INDIVIDUALES -------------------------------------------------
//
// No son competiciones: no se ganan con el club sino con la carrera, y en la
// pantalla de retiro viven en "Logros", separados de la vitrina de títulos.
//
// La lista se LEE del motor (`statistics.ts`), no se copia acá: si mañana se
// agrega uno y este archivo lo transcribiera, el inventario diría una cosa y el
// juego otra — que es exactamente lo que un inventario no puede hacer.
const CARPETA_PREMIOS = 'public/premios';
const { PREMIOS } = await importar('src/app/juegos/minijuegos/carrera-rugby/premios.ts');
const iconos = enDisco(CARPETA_PREMIOS).png;

function premiosDelMotor() {
    const fuente = readFileSync(join(RAIZ, 'src/features/career/engine/statistics.ts'), 'utf8');
    const re = /flags\['([a-z_]+)'\][^)]*\)\s*>\s*0\)\s*distinctions\.add\('([^']+)'\)/g;
    const premios = [];
    for (const [, flag, nombre] of fuente.matchAll(re)) premios.push({ flag, nombre });
    if (premios.length === 0) throw new Error('no encontré ninguna distinción en statistics.ts: cambió la forma y este script quedó ciego');
    return premios;
}

/** Qué evento otorga la flag, para saber cuándo aparece el premio. */
function eventoQueOtorga(flag) {
    const carpeta = 'src/features/career/data/events';
    for (const archivo of readdirSync(join(RAIZ, carpeta)).filter((f) => f.endsWith('.ts'))) {
        const texto = readFileSync(join(RAIZ, carpeta, archivo), 'utf8');
        const pos = texto.indexOf(`flags: { ${flag}`);
        if (pos < 0) continue;
        // El id del evento es el último declarado con la indentación de evento
        // (ocho espacios) antes de la flag; los de dieciséis son de las opciones.
        const anteriores = [...texto.slice(0, pos).matchAll(/\n {8}id: '([^']+)'/g)];
        const id = anteriores.length > 0 ? anteriores[anteriores.length - 1][1] : null;
        return { archivo: `${carpeta}/${archivo}`, eventoId: id };
    }
    return { archivo: null, eventoId: null };
}

// El id de archivo lo decide `premios.ts` (es presentación, no motor), y el
// nombre y el evento salen del motor. Si los dos no coinciden, el que avisa es
// `premios.test.ts`: acá se cruzan por nombre y un premio sin ficha quedaría con
// `id: null`, que es justo lo que esa prueba impide.
const premiosIndividuales = premiosDelMotor().map(({ flag, nombre }) => {
    const { archivo, eventoId } = eventoQueOtorga(flag);
    const ficha = PREMIOS.find((x) => x.label === nombre) ?? null;
    const id = ficha === null ? null : ficha.id;
    return {
        id,
        nombre,
        flag,
        loOtorga: eventoId,
        definidoEn: archivo,
        archivoQueEsperaElJuego: id === null ? null : `${CARPETA_PREMIOS}/${id}.png`,
        tieneIcono: id !== null && iconos.has(id),
    };
});

// ---- CLUBES ---------------------------------------------------------------
//
// Misma pregunta y misma regla que las competencias, sobre `public/clubs/`: el
// archivo se llama `<id>.png` y los .svg son placeholders generados que el
// manifiesto ignora. Faltaba acá y era justamente la mitad más grande del
// trabajo — son cientos de escudos, contra sesenta competencias.
//
// Se informan además dos cosas que sólo se ven cruzando disco y catálogo, y que
// son la causa más común de "cargué el logo y no aparece":
//
//   · HUÉRFANOS — un .png que no matchea ningún club. El escudo está cargado y el
//     juego no lo va a usar nunca, casi siempre porque el id cambió (un club que
//     salió del catálogo, o un catálogo que se regeneró con otros ids).
//   · SIN PLACEHOLDER — clubes que tampoco tienen .svg, así que hoy se dibujan con
//     las iniciales. Aparecen cuando entra un club nuevo y no se volvió a correr
//     `npm run logos`.
//
// OJO CON QUÉ SIGNIFICA "SIN LOGO". No tener .png no es lo mismo que verse sin
// escudo: `ClubBadge` tiene tres escalones —archivo local, después el proxy de la
// app para los clubes que existen en el catálogo real (`sourceId`), y recién
// entonces el monograma de iniciales—. Los que de verdad FALTAN son los del
// tercer escalón, y son los únicos que un .png cargado a mano cambia de aspecto:
// para un club con `sourceId` el archivo solo reemplaza un escudo que ya se ve.
const CARPETA_CLUBES = 'public/clubs';
const discoClubes = enDisco(CARPETA_CLUBES);

const clubes = [...CLUBS]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => {
        const tieneLogoReal = discoClubes.png.has(c.id);
        const tieneEscudoPorProxy = (c.sourceId ?? null) !== null;
        return {
            id: c.id,
            nombre: c.labelEs ?? c.name,
            competencia: competitionLabelOf(c.competitionId),
            competenciaId: c.competitionId,
            pais: c.countryCode,
            archivoQueEsperaElJuego: `${CARPETA_CLUBES}/${c.id}.png`,
            tieneLogoReal,
            tieneEscudoPorProxy,
            claveDelProxy: c.sourceId ?? null,
            // Lo que ve el jugador hoy, que es la única pregunta que importa.
            seDibujaConIniciales: !tieneLogoReal && !tieneEscudoPorProxy,
            hayPlaceholderSvg: discoClubes.svg.has(c.id),
        };
    });

const clubesSinLogo = clubes.filter((c) => !c.tieneLogoReal);
const clubesConIniciales = clubes.filter((c) => c.seDibujaConIniciales);
const idsDeClubes = new Set(CLUBS.map((c) => c.id));
const clubesHuerfanos = [...discoClubes.png].filter((id) => !idsDeClubes.has(id)).sort();

/**
 * Cuántos se dibujan con iniciales por competencia. Es el orden en que conviene
 * cargarlos: un torneo entero con monogramas se nota, uno suelto no.
 */
const clubesPorCompetencia = [...new Map(
    clubesConIniciales.map((c) => [c.competenciaId, { competenciaId: c.competenciaId, competencia: c.competencia, pais: c.pais, conIniciales: 0, sinPng: 0, total: 0 }]),
).values()];
for (const fila of clubesPorCompetencia) {
    fila.total = clubes.filter((c) => c.competenciaId === fila.competenciaId).length;
    fila.sinPng = clubesSinLogo.filter((c) => c.competenciaId === fila.competenciaId).length;
    fila.conIniciales = clubesConIniciales.filter((c) => c.competenciaId === fila.competenciaId).length;
    fila.clubes = clubesConIniciales
        .filter((c) => c.competenciaId === fila.competenciaId)
        .map((c) => ({ id: c.id, nombre: c.nombre, archivoQueEsperaElJuego: c.archivoQueEsperaElJuego }));
}
clubesPorCompetencia.sort((a, b) => b.conIniciales - a.conIniciales || a.competenciaId.localeCompare(b.competenciaId));

const inventario = {
    queEsEsto: 'Con qué nombre hay que guardar cada logo para que el juego lo use. Generado por scripts/gen-logo-inventory.mjs.',
    reglas: [
        'El archivo va en public/competiciones/ y se llama <id>.png — el id es el de esta lista, no el nombre.',
        'Los escudos de club van en public/clubs/<id>.png, con la misma regla del id.',
        'Los que FALTAN de verdad son los de seDibujaConIniciales: sin archivo local y sin sourceId, el juego los dibuja con un monograma. Los que tienen tieneEscudoPorProxy ya muestran su escudo real aunque no tengan .png.',
        'Un .png que no matchea ningún id queda HUÉRFANO: está cargado y el juego no lo usa (mirá clubesHuerfanos).',
        'Sólo cuentan los .png: los .svg son placeholders generados y el manifiesto compilado los ignora.',
        'Después de soltar archivos, el manifiesto se regenera solo en el próximo npm run dev o npm run build (predev/prebuild).',
        'Un trofeo es su competición: no hay carpeta separada para copas, comparten el mismo archivo.',
        'Los premios individuales van en public/premios/<id>.png. El ícono es opcional: sin archivo, la ficha se dibuja como texto, igual que hoy.',
    ],
    generadoPor: 'scripts/gen-logo-inventory.mjs',
    resumen: {
        competencias: competencias.length,
        competenciasConLogoReal: competencias.filter((c) => c.tieneLogoReal).length,
        competenciasSinLogo: competencias.filter((c) => !c.tieneLogoReal).map((c) => c.id),
        trofeos: trofeosTodos.length,
        trofeosSinLogo: trofeosTodos.filter((t) => !t.tieneLogoReal).length,
        premiosIndividuales: premiosIndividuales.length,
        premiosSinIcono: premiosIndividuales.filter((x) => !x.tieneIcono).map((x) => x.id),
        clubes: clubes.length,
        clubesConLogoReal: clubes.length - clubesSinLogo.length,
        clubesSinLogo: clubesSinLogo.length,
        clubesConEscudoPorProxy: clubes.filter((c) => !c.tieneLogoReal && c.tieneEscudoPorProxy).length,
        clubesConIniciales: clubesConIniciales.length,
        clubesSinPlaceholder: clubesSinLogo.filter((c) => !c.hayPlaceholderSvg).length,
        clubesHuerfanos: clubesHuerfanos.length,
    },
    competencias,
    trofeos: trofeosTodos,
    premiosIndividuales,
    clubesPorCompetencia,
    clubes,
    clubesHuerfanos,
};

mkdirSync(join(RAIZ, SALIDA), { recursive: true });
const destino = join(RAIZ, SALIDA, 'inventario-logos.json');
writeFileSync(destino, `${JSON.stringify(inventario, null, 2)}\n`, 'utf8');

console.log(`${SALIDA}/inventario-logos.json`);
console.log(`  competencias: ${competencias.length} (con logo real: ${inventario.resumen.competenciasConLogoReal})`);
console.log(`  trofeos: ${trofeosTodos.length} (sin logo: ${inventario.resumen.trofeosSinLogo})`);
console.log(`  premios individuales: ${premiosIndividuales.length} (con ícono: ${premiosIndividuales.filter((x) => x.tieneIcono).length})`);
console.log(`  clubes: ${clubes.length} (png propio: ${inventario.resumen.clubesConLogoReal}, escudo por proxy: ${inventario.resumen.clubesConEscudoPorProxy}, CON INICIALES: ${clubesConIniciales.length})`);
for (const fila of clubesPorCompetencia.slice(0, 10)) {
    console.log(`    ${fila.conIniciales}/${fila.total}  ${fila.pais} · ${fila.competencia}`);
}
if (clubesPorCompetencia.length > 10) {
    console.log(`    …y ${clubesPorCompetencia.length - 10} competencia(s) más — la lista completa va en el JSON, en clubesPorCompetencia`);
}
if (clubesHuerfanos.length > 0) {
    console.log(`  ⚠ ${clubesHuerfanos.length} png huérfano(s) en ${CARPETA_CLUBES}: ${clubesHuerfanos.join(', ')}`);
}
