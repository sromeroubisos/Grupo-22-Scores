/**
 * LAS VARAS DE CADA PUESTO, medidas sobre la cosecha de planillas.
 *
 * Genera `src/lib/matches/rugbyRatingReferences.generated.ts`: para cada puesto
 * y cada rubro, que PARTE del total de su equipo se lleva un jugador normal de
 * ese puesto en ochenta minutos, y cuanto se dispersa alrededor de eso.
 *
 * De aca salen los dos arreglos centrales:
 *
 *  · La vara es POR PUESTO. Con una sola vara para los quince, el pilar derecho
 *    promediaba 5,32 y el apertura 7,81 sobre 60.339 puntajes. Con la propia,
 *    el promedio de cada puesto vuelve al mismo lugar.
 *  · La vara es sobre la PARTE, no sobre el conteo. Con conteos, el puntaje de
 *    un equipo seguia a su volumen de pases con r = 0,726, asi que jugar sin la
 *    pelota hundia a los quince. En partes, el denominador se cancela.
 *
 *   node scripts/rugby-ratings/calibrar.mjs <planillas.jsonl>
 *
 * Corre en dos pasadas: la primera escribe las varas, la segunda puntua con
 * ellas para medir el SESGO —la mediana de la señal— y lo reescribe. Hace falta
 * porque el sesgo solo se puede medir con las varas ya puestas.
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { partidosDeLaCosecha } from './lados.mjs';

const ENTRADA = process.argv[2];
const SALIDA = process.argv[3] ?? 'src/lib/matches/rugbyRatingReferences.generated.ts';
if (!ENTRADA) {
    console.error('uso: node scripts/rugby-ratings/calibrar.mjs <planillas.jsonl> [salida.ts]');
    process.exit(1);
}

/** El mismo mapa que el motor: el banco hereda el puesto de su numero. */
const PUESTO_POR_NUMERO = {
    1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8,
    9: 9, 10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 15,
    16: 2, 17: 1, 18: 3, 19: 4, 20: 6, 21: 9, 22: 10, 23: 13,
};

/**
 * Con cuantos minutos una planilla sirve para MEDIR la vara.
 *
 * No es el minimo para ser puntuado —eso lo decide el motor— sino para entrar
 * en el promedio: la parte por ochenta de un tipo que jugo doce minutos es una
 * extrapolacion de doce minutos, y mete mas ruido que señal en la referencia.
 */
const MINUTOS_PARA_MEDIR = 50;

/** La tarjeta no lleva vara: se descuenta plana y no se compara con nada. */
const SIN_VARA = new Set(['yellowCards', 'redCards']);

/**
 * Lo que el proveedor ya publica como TASA no se mide por ochenta minutos.
 *
 * `tacklesPerMinute` y compañia son cocientes: multiplicarlos por 80/minutos da
 * un numero que no significa nada, y guardado en el archivo generado tienta a
 * usarlo. Se dejan afuera por la forma del id, que es como vienen del proveedor.
 */
const YA_ES_TASA = (metricId) => /PerMinute$/.test(metricId);

/**
 * CUANTO SE NORMALIZA POR EL EQUIPO. 1 es la fraccion pura, 0 el conteo crudo.
 *
 * Los dos extremos fallan y en direcciones opuestas: en 0 el puntaje sigue a la
 * posesion (r = 0,726 entre los pases de un equipo y su puntaje medio), y en 1
 * el promedio de un plantel deja de decir si el plantel jugo bien (el ganador
 * promedia mas en solo el 60,7% de los partidos, contra 75,3% en 0).
 *
 * Se elige barriendolo: `node scripts/rugby-ratings/barrer-normalizacion.mjs`.
 */
const NORMALIZACION = Number(process.env.NORMALIZACION ?? 0.5);

const { partidos, descartados } = await partidosDeLaCosecha(ENTRADA);

// El total de un equipo PROMEDIO por rubro. Es la otra mitad del denominador,
// asi que se calcula antes de tocar ninguna parte.
const promedioDelRubro = new Map();
{
    const suma = new Map(), cuenta = new Map();
    for (const partido of partidos) {
        for (const { totales } of partido.planteles) {
            for (const [metricId, total] of Object.entries(totales)) {
                suma.set(metricId, (suma.get(metricId) ?? 0) + total);
                cuenta.set(metricId, (cuenta.get(metricId) ?? 0) + 1);
            }
        }
    }
    for (const [metricId, s] of suma) promedioDelRubro.set(metricId, s / cuenta.get(metricId));
}

const porPuesto = new Map();
const global = new Map();
const totalesDeEquipo = new Map();
let planillas = 0;

for (const partido of partidos) {
    for (const { jugadores, totales } of partido.planteles) {
        for (const [metricId, total] of Object.entries(totales)) {
            if (SIN_VARA.has(metricId) || YA_ES_TASA(metricId)) continue;
            if (!totalesDeEquipo.has(metricId)) totalesDeEquipo.set(metricId, []);
            totalesDeEquipo.get(metricId).push(total);
        }

        for (const jugador of jugadores) {
            const puesto = PUESTO_POR_NUMERO[jugador.number];
            if (!puesto || !(jugador.minutes >= MINUTOS_PARA_MEDIR)) continue;
            planillas++;

            const por80 = 80 / jugador.minutes;
            if (!porPuesto.has(puesto)) porPuesto.set(puesto, new Map());
            const delPuesto = porPuesto.get(puesto);

            for (const [metricId, valor] of Object.entries(jugador.stats ?? {})) {
                if (SIN_VARA.has(metricId) || YA_ES_TASA(metricId) || !Number.isFinite(valor)) continue;
                const total = totales[metricId];
                // Sin total del equipo no hay parte. Pasa cuando el unico que
                // hizo algo en ese rubro quedo fuera de la planilla.
                if (!total || total <= 0) continue;
                const denominador = Math.pow(total, NORMALIZACION)
                    * Math.pow(promedioDelRubro.get(metricId) ?? total, 1 - NORMALIZACION);
                if (denominador <= 0) continue;
                const parte = (valor / denominador) * por80;
                if (!delPuesto.has(metricId)) delPuesto.set(metricId, []);
                delPuesto.get(metricId).push(parte);
                if (!global.has(metricId)) global.set(metricId, []);
                global.get(metricId).push(parte);
            }
        }
    }
}

/**
 * OJO CON EL CERO AUSENTE.
 *
 * El proveedor lista solo a quien hizo algo, asi que un jugador sin tries no
 * figura en esa columna. Si la vara se sacara solo de los que aparecen, la
 * media de tries de un pilar seria "la media de los pilares que marcaron", que
 * es cerca de uno, y el pilar normal quedaria tres desvios abajo por hacer lo
 * normal. Los ausentes se cuentan como el cero que son.
 */
function completarCeros(muestras, total) {
    const faltan = total - muestras.length;
    return faltan <= 0 ? muestras : muestras.concat(new Array(faltan).fill(0));
}

const jugadoresPorPuesto = new Map();
for (const [puesto, rubros] of porPuesto) {
    jugadoresPorPuesto.set(puesto, Math.max(...[...rubros.values()].map((v) => v.length)));
}
const totalGlobal = Math.max(...[...global.values()].map((v) => v.length));

function resumen(muestras) {
    const n = muestras.length;
    const media = muestras.reduce((a, b) => a + b, 0) / n;
    const desvio = Math.sqrt(muestras.reduce((a, b) => a + (b - media) ** 2, 0) / n);
    return { media, desvio };
}

const redondear = (x) => Math.round(x * 100000) / 100000;
const SALTO = String.fromCharCode(10);
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const refPorPuesto = {};
for (const [puesto, rubros] of [...porPuesto].sort((a, b) => a[0] - b[0])) {
    const total = jugadoresPorPuesto.get(puesto);
    refPorPuesto[puesto] = {};
    for (const [metricId, muestras] of [...rubros].sort()) {
        const { media, desvio } = resumen(completarCeros(muestras, total));
        refPorPuesto[puesto][metricId] = { media: redondear(media), desvio: redondear(desvio) };
    }
}

const refGlobal = {};
for (const [metricId, muestras] of [...global].sort()) {
    const { media, desvio } = resumen(completarCeros(muestras, totalGlobal));
    refGlobal[metricId] = { media: redondear(media), desvio: redondear(desvio) };
}

const totalDeEquipo = {};
for (const [metricId, muestras] of [...totalesDeEquipo].sort()) {
    totalDeEquipo[metricId] = Math.round(resumen(muestras).media * 100) / 100;
}

const cuerpo = (obj, sangria, fmt) => Object.entries(obj)
    .map(([k, v]) => `${sangria}${k}: ${fmt(v)},`)
    .join('\n');
const comoRef = (v) => `{ media: ${v.media}, desvio: ${v.desvio} }`;
const tilde = '`';

function archivo(sesgo) {
    return `/**
 * GENERADO. No editar a mano: ${tilde}node scripts/rugby-ratings/calibrar.mjs${tilde}.
 *
 * Que PARTE del total de su equipo se lleva un jugador normal de cada puesto en
 * ochenta minutos, y cuanto se dispersa alrededor de eso. Es contra estas varas
 * que ${tilde}rugbyPlayerRating.ts${tilde} mide a cada jugador.
 *
 * Son partes y no conteos porque el conteo arrastra la posesion: con conteos,
 * el puntaje medio de un equipo seguia a su volumen de pases con r = 0,726, y
 * un equipo que ganaba sin la pelota mandaba a sus quince jugadores debajo de
 * la vara. Un apertura se lleva una quinta parte de los pases de su equipo
 * tenga el equipo 105 o 182.
 *
 * Los ausentes cuentan como cero: el proveedor lista solo a quien hizo algo, y
 * no marcar un try es un cero, no un dato que falta.
 *
 * Muestra: ${partidos.length} partidos, ${planillas} planillas de ${MINUTOS_PARA_MEDIR}+ minutos.
 */

export interface Referencia {
    /** La parte del total del equipo que se lleva un jugador normal del puesto. */
    media: number;
    /** Cuanto se dispersa alrededor de la media, en las mismas unidades. */
    desvio: number;
}

/** Partidos que entraron en la medicion. Sube cuando se recalibra. */
export const REFERENCIAS_MUESTRA = {
    partidos: ${partidos.length},
    planillas: ${planillas},
    minutosMinimos: ${MINUTOS_PARA_MEDIR},
} as const;

/**
 * LA MEDIANA DE LA SEÑAL, que el motor resta para recentrar.
 *
 * Las varas centran cada rubro en su PROMEDIO, que es lo que iguala a los
 * quince puestos. Pero un conteo tiene cola a la derecha: centrado en el
 * promedio, mas de la mitad del plantel queda abajo y la mediana del partido
 * caia en 5,90, con el 30% de las notas entre 5,5 y 6,0 y solo el 14% entre 6,0
 * y 6,5. No existia la banda del "buen partido": existia "normal-bajo" y
 * "estrella". Restando esto, el partido tipico vale 6 y la media queda un poco
 * arriba, que es como se lee una escala de puntajes.
 */
export const SESGO = ${sesgo.global};

/**
 * Cuanto se normaliza cada rubro por el total del equipo: 1 es la fraccion
 * pura, 0 el conteo crudo. Ver el comentario del denominador en el motor.
 */
export const NORMALIZACION = ${NORMALIZACION};

/**
 * Y uno por puesto, porque la asimetria no es la misma en todos.
 *
 * Con un solo sesgo global el medio scrum quedaba en 5,99 y el wing en 6,37:
 * las varas ya igualaban el PROMEDIO de la señal en los quince, pero la curva
 * no es lineal, asi que dos puestos con la misma media y distinta forma salen
 * en lugares distintos. La parte de pases de un 9 se reparte con el que entra
 * por el; la de un pilar, no. Centrar la mediana de cada puesto lo cierra.
 */
export const SESGO_POR_PUESTO: Readonly<Record<number, number>> = {
${sesgo.porPuesto}
};

/**
 * Lo que hace un equipo PROMEDIO en cada rubro, para el llamador que puntua un
 * jugador suelto y no tiene el plantel a mano. Deja la cuenta en la escala
 * correcta, pero para ese jugador vuelve el sesgo de posesion.
 */
export const TOTAL_DE_EQUIPO: Readonly<Record<string, number>> = {
${cuerpo(totalDeEquipo, '    ', (v) => String(v))}
};

export const REFERENCIAS_POR_PUESTO: Readonly<Record<number, Readonly<Record<string, Referencia>>>> = {
${Object.entries(refPorPuesto).map(([puesto, rubros]) => `    ${puesto}: {\n${cuerpo(rubros, '        ', comoRef)}\n    },`).join('\n')}
};

/** La vara de los quince juntos, para el que no trae numero de camiseta. */
export const REFERENCIA_GLOBAL: Readonly<Record<string, Referencia>> = {
${cuerpo(refGlobal, '    ', comoRef)}
};
`;
}

// PRIMERA PASADA: las varas, con el sesgo todavia en cero. Tiene que ser cero
// de verdad y no una tabla vacia: el motor lo lee para puntuar la segunda.
writeFileSync(SALIDA, archivo({ global: 0, porPuesto: '' }));

// SEGUNDA PASADA: con las varas puestas ya se puede medir la señal y sacarle la
// mediana. El motor se importa recien ahora, cuando el archivo existe.
const raiz = pathToFileURL(process.cwd() + '/').href;
const { rateRugbyPlayer } = await import(raiz + 'src/lib/matches/rugbyPlayerRating.ts');
const señales = [];
for (const partido of partidos) {
    for (const { jugadores, totales } of partido.planteles) {
        for (const jugador of jugadores) {
            const r = rateRugbyPlayer({
                stats: jugador.stats ?? {},
                minutes: jugador.minutes,
                number: jugador.number,
                team: totales,
            });
            if (r && r.position != null) señales.push({ signal: r.signal, puesto: r.position });
        }
    }
}
const sesgo = {
    global: Math.round(mediana(señales.map((s) => s.signal)) * 100000) / 100000,
    porPuesto: [...new Set(señales.map((s) => s.puesto))].sort((a, b) => a - b)
        .map((puesto) => {
            const suyas = señales.filter((s) => s.puesto === puesto).map((s) => s.signal);
            return `    ${puesto}: ${Math.round(mediana(suyas) * 100000) / 100000},`;
        }).join(SALTO),
};
writeFileSync(SALIDA, archivo(sesgo));

console.log(`[calibrar] ${partidos.length} partidos (${descartados} sin partir) · ${planillas} planillas de ${MINUTOS_PARA_MEDIR}+ min`);
console.log(`[calibrar] puestos: ${Object.keys(refPorPuesto).length} · rubros: ${Object.keys(refGlobal).length}`);
console.log(`[calibrar] normalizacion: ${NORMALIZACION} · sesgo global: ${sesgo.global}`);
console.log(`[calibrar] escrito ${SALIDA}`);
