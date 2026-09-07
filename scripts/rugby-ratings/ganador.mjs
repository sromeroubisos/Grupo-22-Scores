/**
 * ¿EL MOTOR MIDE RUGBY O MIDE POSESION?
 *
 * El test que decide: el equipo que GANO tiene que promediar por encima del que
 * perdio en la mayoria de los partidos. Si no lo hace, el puntaje esta midiendo
 * quien tuvo la pelota, no quien jugo mejor —y hay estilos enteros, como el de
 * Sudafrica, que ganan justamente sin tenerla.
 *
 *   node scripts/rugby-ratings/ganador.mjs <planillas.jsonl>
 *
 * EL LADO DE CADA JUGADOR NO ESTA EN LA COSECHA, se reconstruye. Las filas se
 * escribieron en el orden `[...local, ...visitante]`, asi que el corte esta
 * donde el numero de camiseta deja de subir. Un partido cuyo corte no deje dos
 * planteles creibles se descarta en vez de adivinarlo.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { partidosDeLaCosecha } from './lados.mjs';

const ENTRADA = process.argv[2];
if (!ENTRADA) {
    console.error('uso: node scripts/rugby-ratings/ganador.mjs <planillas.jsonl>');
    process.exit(1);
}

const raiz = pathToFileURL(process.cwd() + '/').href;
const { rateRugbyPlayer } = await import(raiz + 'src/lib/matches/rugbyPlayerRating.ts');

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

const marcador = new Map();
for (let off = 0; ; off += 1000) {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/external_match_cache?select=id,score&id=like.rp-*&status=eq.final&offset=${off}&limit=1000`, { headers: H });
    const lote = await r.json();
    for (const f of lote) {
        if (typeof f.score?.home === 'number' && typeof f.score?.away === 'number') {
            marcador.set(f.id, { local: f.score.home, visitante: f.score.away });
        }
    }
    if (lote.length < 1000) break;
}

const { partidos, descartados: sinPartir } = await partidosDeLaCosecha(ENTRADA);
const promedio = (v) => v.reduce((a, b) => a + b, 0) / v.length;

let comparados = 0, aFavor = 0, empatados = 0, descartados = 0;
const diferencias = [];
const todas = [];

for (const partido of partidos) {
    const res = marcador.get(partido.matchId);
    if (!res) { descartados++; continue; }

    const puntuar = ({ jugadores, totales }) => jugadores
        .map((f) => rateRugbyPlayer({ stats: f.stats ?? {}, minutes: f.minutes, number: f.number, team: totales }))
        .filter(Boolean)
        .map((r) => r.value);

    const [pl, pv] = partido.planteles.map(puntuar);
    if (pl.length < 12 || pv.length < 12) { descartados++; continue; }
    todas.push(...pl, ...pv);

    if (res.local === res.visitante) { empatados++; continue; }
    const ganador = res.local > res.visitante ? promedio(pl) : promedio(pv);
    const perdedor = res.local > res.visitante ? promedio(pv) : promedio(pl);
    comparados++;
    if (ganador >= perdedor) aFavor++;
    diferencias.push(ganador - perdedor);
}

const orden = [...diferencias].sort((a, b) => a - b);
console.log(`Partidos comparados   ${comparados}  (empates ${empatados}, sin marcador ${descartados}, sin partir ${sinPartir})`);
console.log('');
console.log(`EL GANADOR PROMEDIA MAS EN EL ${(100 * aFavor / comparados).toFixed(1)}% DE LOS PARTIDOS`);
console.log(`   criterio: >= 70%   ${100 * aFavor / comparados >= 70 ? 'CUMPLE' : 'NO CUMPLE'}`);
console.log('');
console.log(`Ventaja media del ganador   ${promedio(diferencias).toFixed(3)} puntos`);
console.log(`   mediana ${orden[Math.floor(orden.length / 2)].toFixed(3)} · p10 ${orden[Math.floor(orden.length * 0.1)].toFixed(2)} · p90 ${orden[Math.floor(orden.length * 0.9)].toFixed(2)}`);

const ord = [...todas].sort((a, b) => a - b);
const banda = (lo, hi) => 100 * todas.filter((x) => x >= lo && x < hi).length / todas.length;
console.log('');
console.log(`Puntajes ${todas.length} · media ${promedio(todas).toFixed(2)} · mediana ${ord[Math.floor(ord.length / 2)].toFixed(2)}`);
console.log(`   < 5,0        ${banda(0, 5).toFixed(1)}%`);
console.log(`   5,0 - 5,5    ${banda(5, 5.5).toFixed(1)}%`);
console.log(`   5,5 - 6,0    ${banda(5.5, 6).toFixed(1)}%`);
console.log(`   6,0 - 6,5    ${banda(6, 6.5).toFixed(1)}%`);
console.log(`   6,5 - 7,0    ${banda(6.5, 7).toFixed(1)}%`);
console.log(`   7,0 - 8,0    ${banda(7, 8).toFixed(1)}%`);
console.log(`   >= 8,0       ${banda(8, 99).toFixed(1)}%`);
