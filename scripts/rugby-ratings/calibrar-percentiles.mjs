/**
 * LAS TABLAS DEL PUNTAJE v4, medidas sobre la cosecha de planillas.
 *
 * Genera `src/lib/matches/rugbyRatingPercentiles.generated.ts` con dos cosas:
 *
 *  · la efectividad de tackle (`tackles / intentos`) de cada puesto, que es la
 *    vara contra la que se lee ese rubro;
 *  · los cuantiles del RENDIMIENTO AJUSTADO de cada grupo de puestos, que es lo
 *    que convierte un rendimiento en percentil y el percentil en nota.
 *
 * Requiere que `rugbyRatingReferences.generated.ts` ya exista (varas por
 * puesto de `calibrar.mjs`): el rendimiento se mide con ellas.
 *
 *   node scripts/rugby-ratings/calibrar-percentiles.mjs <planillas.jsonl> [salida.ts]
 *
 * Se mide con TODOS los jugadores que llevan nota (cinco minutos o mas), no solo
 * con los titulares: el percentil tiene que ser el de la poblacion que despues se
 * puntua, cameos incluidos.
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { partidosDeLaCosecha } from './lados.mjs';

const ENTRADA = process.argv[2];
const SALIDA = process.argv[3] ?? 'src/lib/matches/rugbyRatingPercentiles.generated.ts';
// Scrum y line por equipo (salida de `cosecha-parada.mjs`). Sin esto, el eje de parada no entra.
const PARADA = process.argv[4];
if (!ENTRADA) {
    console.error('uso: node scripts/rugby-ratings/calibrar-percentiles.mjs <planillas.jsonl> [salida.ts]');
    process.exit(1);
}

/** Con cuantos minutos una planilla sirve para medir la efectividad del puesto. */
const MINUTOS_PARA_MEDIR = 50;

const raiz = pathToFileURL(process.cwd() + '/').href;
const {
    rendimientoDe, GRUPO_POR_PUESTO, GRUPO_SIN_PUESTO, PROBABILIDADES,
    EFECTIVIDAD_DE_TACKLE, MINUTOS_MINIMOS,
} = await import(raiz + 'src/lib/matches/rugbyPlayerRating.ts');

const { partidos, descartados } = await partidosDeLaCosecha(ENTRADA);

const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const desvio = (v) => { const m = media(v); return Math.sqrt(media(v.map((x) => (x - m) ** 2))); };
const redondo = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

// ── Pasada 1: la efectividad de tackle de cada puesto ─────────────────────────
const PUESTO_POR_NUMERO = {
    1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 15,
    16: 2, 17: 1, 18: 3, 19: 4, 20: 6, 21: 9, 22: 10, 23: 13,
};
const efPorPuesto = new Map();
const efTodos = [];
for (const partido of partidos) {
    for (const { jugadores } of partido.planteles) {
        for (const j of jugadores) {
            if (!(j.minutes >= MINUTOS_PARA_MEDIR)) continue;
            const sinPases = j.number === 21 && (j.stats?.passes ?? 0) / j.minutes < 0.25;
            const puesto = sinPases ? undefined : PUESTO_POR_NUMERO[j.number];
            const tackles = j.stats?.tackles ?? 0;
            const intentos = tackles + (j.stats?.missedTackles ?? 0);
            if (!puesto || intentos < EFECTIVIDAD_DE_TACKLE.minimoIntentos) continue;
            const ef = tackles / intentos;
            if (!efPorPuesto.has(puesto)) efPorPuesto.set(puesto, []);
            efPorPuesto.get(puesto).push(ef);
            efTodos.push(ef);
        }
    }
}
const efectividad = {};
for (const [puesto, v] of [...efPorPuesto].sort((a, b) => a[0] - b[0])) {
    efectividad[puesto] = { media: redondo(media(v), 5), desvio: redondo(desvio(v), 5) };
}
const efGlobal = { media: redondo(media(efTodos), 5), desvio: redondo(desvio(efTodos), 5) };

// ── Pasada 1b: scrum y line de la liga ────────────────────────────────────────
// Por equipo y partido, con al menos un evento: el porcentaje de un equipo sin
// scrums no es un dato. La media y el desvio son los de esa poblacion.
const paradaPorPartido = new Map();
if (PARADA) {
    const { createReadStream } = await import('node:fs');
    const { createInterface } = await import('node:readline');
    const rl = createInterface({ input: createReadStream(PARADA), crlfDelay: Infinity });
    for await (const linea of rl) {
        if (!linea.trim()) continue;
        try { const o = JSON.parse(linea); paradaPorPartido.set(o.match_id, o); } catch { /* linea cortada */ }
    }
}
const ligaDe = (leer) => {
    const v = [];
    for (const p of paradaPorPartido.values()) for (const lado of [p.home, p.away]) { const x = leer(lado); if (x != null) v.push(x); }
    return v.length >= 100 ? { media: redondo(media(v), 5), desvio: redondo(desvio(v), 5), n: v.length } : null;
};
const liga = PARADA ? {
    scrum: ligaDe((l) => (l.scrums > 0 ? l.scrumsGanados : null)),
    line: ligaDe((l) => (l.lines > 0 ? l.linesGanados : null)),
} : null;
if (PARADA) console.log(`[percentiles] liga scrum ${JSON.stringify(liga.scrum)} · line ${JSON.stringify(liga.line)} · ${paradaPorPartido.size} partidos con parada`);

// ── Pasada 2: la distribucion del rendimiento ajustado por grupo ──────────────
const porGrupo = new Map([[GRUPO_SIN_PUESTO, []]]);
let jugadores = 0;
for (const partido of partidos) {
    const paradaDelPartido = paradaPorPartido.get(partido.matchId);
    // Con parada, solo cuentan los partidos que la tienen: mezclar con y sin el
    // eje armaria cuantiles de dos poblaciones distintas.
    if (PARADA && !paradaDelPartido) continue;
    for (const [indiceLado, { jugadores: plantel, totales }] of partido.planteles.entries()) {
        // El primer plantel es el local, igual que en la cosecha de planillas.
        const parada = liga?.scrum && liga?.line && paradaDelPartido
            ? (indiceLado === 0 ? paradaDelPartido.home : paradaDelPartido.away)
            : null;
        for (const j of plantel) {
            if (!(j.minutes >= MINUTOS_MINIMOS)) continue;
            const r = rendimientoDe(
                { stats: j.stats ?? {}, minutes: j.minutes, number: j.number, team: totales, parada },
                { efectividad, liga: liga?.scrum && liga?.line ? { scrum: liga.scrum, line: liga.line } : undefined }
            );
            const grupo = r.puesto != null ? GRUPO_POR_PUESTO[r.puesto] : GRUPO_SIN_PUESTO;
            if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
            porGrupo.get(grupo).push(r.ajustado);
            // El grupo `todos` junta a los quince: es el respaldo del jugador sin puesto.
            if (grupo !== GRUPO_SIN_PUESTO) porGrupo.get(GRUPO_SIN_PUESTO).push(r.ajustado);
            jugadores++;
        }
    }
}

const cuantil = (ordenado, p) => {
    const i = p * (ordenado.length - 1);
    const lo = Math.floor(i), hi = Math.ceil(i);
    return ordenado[lo] + (ordenado[hi] - ordenado[lo]) * (i - lo);
};
const cuantiles = {};
for (const [grupo, v] of [...porGrupo].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (v.length < 200) { console.warn(`[percentiles] ${grupo}: solo ${v.length} jugadores, se omite`); continue; }
    const ordenado = [...v].sort((a, b) => a - b);
    cuantiles[grupo] = PROBABILIDADES.map((p) => redondo(cuantil(ordenado, p), 4));
}

const linea = (o) => `{ media: ${o.media}, desvio: ${o.desvio} }`;
const ts = `/**
 * GENERADO por scripts/rugby-ratings/calibrar-percentiles.mjs. No editar a mano.
 *
 * Medido sobre ${partidos.length} partidos (${descartados} descartados), ${jugadores} jugadores con nota.
 */
import type { Referencia } from './rugbyRatingReferences.generated.ts';

/** Efectividad de tackle (tackles / intentos) de cada puesto, con ${EFECTIVIDAD_DE_TACKLE.minimoIntentos} intentos o mas. */
export const EFECTIVIDAD_POR_PUESTO: Readonly<Record<number, Referencia>> = {
${Object.entries(efectividad).map(([p, o]) => `    ${p}: ${linea(o)},`).join('\n')}
};

/** Respaldo cuando no hay puesto. */
export const EFECTIVIDAD_GLOBAL: Referencia = ${linea(efGlobal)};

/** Scrum y line de la liga: media y desvio del porcentaje ganado por equipo y partido. */
export const PARADA_LIGA: { scrum: Referencia; line: Referencia } = {
${liga?.scrum && liga?.line
    ? `    scrum: ${linea(liga.scrum)},\n    line: ${linea(liga.line)},`
    : '    scrum: { media: 0.93, desvio: 0.1 },\n    line: { media: 0.85, desvio: 0.1 },'}
};

/** Cuantiles del rendimiento ajustado por grupo, en las probabilidades de \`PROBABILIDADES\`. */
export const CUANTILES_POR_GRUPO: Readonly<Record<string, readonly number[]>> = {
${Object.entries(cuantiles).map(([g, q]) => `    '${g}': [${q.join(', ')}],`).join('\n')}
};
`;
writeFileSync(SALIDA, ts);

console.log(`[percentiles] ${partidos.length} partidos, ${jugadores} jugadores con nota`);
console.log(`[percentiles] efectividad global ${efGlobal.media} ± ${efGlobal.desvio}`);
for (const [g, q] of Object.entries(cuantiles)) {
    const i = (p) => PROBABILIDADES.findIndex((x) => Math.abs(x - p) < 1e-9);
    console.log(`  ${g.padEnd(10)} p10 ${q[i(0.1)]}  p50 ${q[i(0.5)]}  p90 ${q[i(0.9)]}  p99 ${q[i(0.99)]}`);
}
console.log(`[percentiles] escrito ${SALIDA}`);
