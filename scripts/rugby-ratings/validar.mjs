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
 *   · 3-7% de notas en 8 o mas (el 8 pide un partido grande y largo), y menos
 *     del 1,5% en 9 o mas
 *   · menos del 2% de notas debajo de 5: el 4 es un partido muy malo
 *
 * v4: la nota es 6,2 + Φ⁻¹(percentil en su grupo) + bonus − tarjetas, asi que
 * los quince puestos coinciden por construccion y lo que se mira es que las
 * colas y los grupos (no los puestos sueltos) queden donde se espera. Antes
 * de correrlo hace falta `calibrar-percentiles.mjs` sobre la misma cosecha.
 */
import { pathToFileURL } from 'node:url';

import { partidosDeLaCosecha } from './lados.mjs';

const ENTRADA = process.argv[2];
if (!ENTRADA) {
    console.error('uso: node scripts/rugby-ratings/validar.mjs <planillas.jsonl> [--barrer-k]');
    process.exit(1);
}

const raiz = pathToFileURL(process.cwd() + '/').href;
const { rateRugbyPlayer } = await import(raiz + 'src/lib/matches/rugbyPlayerRating.ts');

const NOMBRE = {
    1: '1 Pilar', 2: '2 Hooker', 3: '3 Pilar der', 4: '4 Segunda', 5: '5 Segunda',
    6: '6 Ala', 7: '7 Ala', 8: '8 Octavo', 9: '9 Medio', 10: '10 Apertura',
    11: '11 Wing', 12: '12 Centro', 13: '13 Centro', 14: '14 Wing', 15: '15 Fullback',
};

const { partidos } = await partidosDeLaCosecha(ENTRADA);

// Scrum y line por equipo (salida de `cosecha-parada.mjs`), opcional.
const PARADA = process.argv[3];
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

const puntuados = [];
for (const partido of partidos) {
    const paradaDelPartido = paradaPorPartido.get(partido.matchId);
    if (PARADA && !paradaDelPartido) continue;
    for (const [indiceLado, { jugadores, totales }] of partido.planteles.entries()) {
        const parada = paradaDelPartido ? (indiceLado === 0 ? paradaDelPartido.home : paradaDelPartido.away) : null;
        for (const jugador of jugadores) {
            // El plantel entero va como contexto: el puntaje mide la PARTE que
            // el jugador se llevo, no cuanto hizo.
            const r = rateRugbyPlayer({
                stats: jugador.stats ?? {},
                minutes: jugador.minutes,
                number: jugador.number,
                team: totales,
                parada,
            });
            if (!r || r.position == null) continue;
            puntuados.push({ puesto: r.position, valor: r.value, signal: r.signal, minutos: jugador.minutes });
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
        bajo5: 100 * s.filter((x) => x < 5).length / n,
        pc4: 100 * s.filter((x) => x <= 4).length / n,
    };
};

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
console.log(`Notas de 8 o mas       ${g.pc8.toFixed(1)}%   ${g.pc8 >= 3 && g.pc8 <= 7 ? 'CUMPLE' : 'NO CUMPLE'} (3 a 7%)`);
console.log(`Notas de 9 o mas       ${g.pc9.toFixed(1)}%   ${g.pc9 < 1.5 ? 'CUMPLE' : 'NO CUMPLE'} (< 1,5%)`);
console.log(`Notas debajo de 5      ${g.bajo5.toFixed(1)}%   ${g.bajo5 < 2 ? 'CUMPLE' : 'NO CUMPLE'} (< 2%)`);
console.log(`Notas de 4 o menos     ${g.pc4.toFixed(2)}%`);
console.log(`Mediana                ${g.mediana.toFixed(2)}   ${Math.abs(g.mediana - 6.2) <= 0.1 ? 'CUMPLE' : 'NO CUMPLE'} (6,20)`);
console.log(`Forwards ${(fw.reduce((a, b) => a + b, 0) / fw.length).toFixed(2)}  vs  Backs ${(bk.reduce((a, b) => a + b, 0) / bk.length).toFixed(2)}`);
