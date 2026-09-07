/**
 * LA TABLA QUE DECIDE SI EL PUNTAJE FUNCIONA.
 *
 * Puntua toda la cosecha con el motor de verdad y saca media, desvio y colas
 * POR PUESTO. Es el unico test que puede decir si el modelo describe jugadores
 * o describe puestos, y ninguna auditoria de un partido lo reemplaza.
 *
 *   node scripts/rugby-ratings/validar.mjs <planillas.jsonl> [--barrer-k]
 *
 * Criterio de aceptacion:
 *   · las medias de los quince puestos, dentro de 0,30 entre si
 *   · desvios parecidos entre puestos, del orden de 0,8 a 1,0
 *   · 8-12% de notas en 8 o mas, y menos del 1,5% en 9 o mas
 *
 * Con `--barrer-k` no puntua: barre la constante de la curva contra la
 * distribucion de `signal` y dice cual cumple las colas. Eso es lo que fija
 * `CURVA.k` en el motor, en vez de elegirlo a ojo.
 */
import { pathToFileURL } from 'node:url';

import { partidosDeLaCosecha } from './lados.mjs';

const ENTRADA = process.argv[2];
const BARRER = process.argv.includes('--barrer-k');
if (!ENTRADA) {
    console.error('uso: node scripts/rugby-ratings/validar.mjs <planillas.jsonl> [--barrer-k]');
    process.exit(1);
}

const raiz = pathToFileURL(process.cwd() + '/').href;
const { rateRugbyPlayer, SANCIONES } =
    await import(raiz + 'src/lib/matches/rugbyPlayerRating.ts');

const NOMBRE = {
    1: '1 Pilar', 2: '2 Hooker', 3: '3 Pilar der', 4: '4 Segunda', 5: '5 Segunda',
    6: '6 Ala', 7: '7 Ala', 8: '8 Octavo', 9: '9 Medio', 10: '10 Apertura',
    11: '11 Wing', 12: '12 Centro', 13: '13 Centro', 14: '14 Wing', 15: '15 Fullback',
};

const { partidos } = await partidosDeLaCosecha(ENTRADA);
const puntuados = [];
for (const partido of partidos) {
    for (const { jugadores, totales } of partido.planteles) {
        for (const jugador of jugadores) {
            // El plantel entero va como contexto: el puntaje mide la PARTE que
            // el jugador se llevo, no cuanto hizo.
            const r = rateRugbyPlayer({
                stats: jugador.stats ?? {},
                minutes: jugador.minutes,
                number: jugador.number,
                team: totales,
            });
            if (!r || r.position == null) continue;
            // El castigo de la tarjeta se guarda aparte para poder barrer la
            // curva sin volver a leer la planilla: no pasa por la curva.
            let castigo = 0;
            for (const [metricId, puntos] of Object.entries(SANCIONES)) {
                castigo += (jugador.stats?.[metricId] ?? 0) * puntos;
            }
            puntuados.push({ puesto: r.position, valor: r.value, signal: r.signal, castigo, minutos: jugador.minutes });
        }
    }
}

const stat = (v) => {
    const s = [...v].sort((a, b) => a - b);
    const n = s.length, m = s.reduce((a, b) => a + b, 0) / n;
    return {
        n, m, sd: Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / n),
        p90: s[Math.floor(0.9 * n)], max: s[n - 1], mediana: s[Math.floor(n / 2)],
        pc8: 100 * s.filter((x) => x >= 8).length / n,
        pc9: 100 * s.filter((x) => x >= 9).length / n,
        pc5: 100 * s.filter((x) => x <= 5).length / n,
    };
};

if (BARRER) {
    // La curva se barre en DOS ejes: cuanto hay que apartarse para mover la
    // nota (`k`) y cuanto se puede caer (`abajo`). Con una sola constante el
    // criterio no cierra: si la distribucion es simetrica, el porcentaje de
    // notas de 5 o menos —un punto bajo la base— es siempre mayor que el de 8 o
    // mas —dos puntos arriba—, y no hay `k` que de 10% de las dos cosas.
    const nota = (p, k, abajo) => {
        const amplitud = p.signal >= 0 ? 4 : abajo;
        const cruda = 6 + amplitud * Math.tanh(p.signal / k) - p.castigo;
        return Math.round(Math.min(10, Math.max(1, cruda)) * 10) / 10;
    };
    console.log('    k | abajo | media | desv | %>=8 | %>=9 | %<=5 |  %=10');
    console.log('-'.repeat(62));
    for (const abajo of [4.0, 3.5, 3.0, 2.5, 2.0]) {
        for (let k = 0.45; k <= 0.91; k += 0.05) {
            const notas = puntuados.map((p) => nota(p, k, abajo));
            const s = stat(notas);
            const dieces = 100 * notas.filter((x) => x >= 9.95).length / notas.length;
            const cumple = s.pc8 >= 8 && s.pc8 <= 12 && s.pc9 < 1.5 && s.pc5 < 8 && s.m >= 6.1 && s.m <= 6.5;
            console.log(`${k.toFixed(2).padStart(5)} | ${abajo.toFixed(1).padStart(5)} | ${s.m.toFixed(2).padStart(5)} | ${s.sd.toFixed(2).padStart(4)} | ${s.pc8.toFixed(1).padStart(4)} | ${s.pc9.toFixed(1).padStart(4)} | ${s.pc5.toFixed(1).padStart(4)} | ${dieces.toFixed(2).padStart(5)}${cumple ? '  <-- cumple' : ''}`);
        }
    }
    process.exit(0);
}

console.log('Puesto        |     n | media | desv |  p90 | max | %>=8 | %>=9 | %<=5');
console.log('-'.repeat(74));
const medias = [], desvios = [];
for (let k = 1; k <= 15; k++) {
    const del = puntuados.filter((p) => p.puesto === k).map((p) => p.valor);
    if (del.length === 0) continue;
    const s = stat(del);
    medias.push(s.m); desvios.push(s.sd);
    console.log(`${NOMBRE[k].padEnd(13)} | ${String(s.n).padStart(5)} | ${s.m.toFixed(2).padStart(5)} | ${s.sd.toFixed(2).padStart(4)} | ${s.p90.toFixed(1).padStart(4)} | ${s.max.toFixed(1).padStart(3)} | ${s.pc8.toFixed(1).padStart(4)} | ${s.pc9.toFixed(1).padStart(4)} | ${s.pc5.toFixed(1).padStart(4)}`);
}
const g = stat(puntuados.map((p) => p.valor));
console.log('-'.repeat(74));
console.log(`${'TODOS'.padEnd(13)} | ${String(g.n).padStart(5)} | ${g.m.toFixed(2).padStart(5)} | ${g.sd.toFixed(2).padStart(4)} | ${g.p90.toFixed(1).padStart(4)} | ${g.max.toFixed(1).padStart(3)} | ${g.pc8.toFixed(1).padStart(4)} | ${g.pc9.toFixed(1).padStart(4)} | ${g.pc5.toFixed(1).padStart(4)}`);

const spread = Math.max(...medias) - Math.min(...medias);
const fw = puntuados.filter((p) => p.puesto <= 8).map((p) => p.valor);
const bk = puntuados.filter((p) => p.puesto >= 9).map((p) => p.valor);
console.log('');
console.log(`SPREAD entre puestos   ${spread.toFixed(2)}   ${spread <= 0.30 ? 'CUMPLE' : 'NO CUMPLE'} (<= 0,30)`);
console.log(`Desvios                ${Math.min(...desvios).toFixed(2)} a ${Math.max(...desvios).toFixed(2)}   ${Math.min(...desvios) >= 0.7 && Math.max(...desvios) <= 1.1 ? 'CUMPLE' : 'revisar'} (0,8 a 1,0)`);
console.log(`Notas de 8 o mas       ${g.pc8.toFixed(1)}%   ${g.pc8 >= 8 && g.pc8 <= 12 ? 'CUMPLE' : 'NO CUMPLE'} (8 a 12%)`);
console.log(`Notas de 9 o mas       ${g.pc9.toFixed(1)}%   ${g.pc9 < 1.5 ? 'CUMPLE' : 'NO CUMPLE'} (< 1,5%)`);
console.log(`Mediana                ${g.mediana.toFixed(2)}   ${Math.abs(g.mediana - 6) <= 0.05 ? 'CUMPLE' : 'NO CUMPLE'} (6,00)`);
console.log(`Forwards ${(fw.reduce((a, b) => a + b, 0) / fw.length).toFixed(2)}  vs  Backs ${(bk.reduce((a, b) => a + b, 0) / bk.length).toFixed(2)}`);
