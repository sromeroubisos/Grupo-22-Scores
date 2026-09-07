/**
 * REPUNTUAR LO YA GUARDADO.
 *
 * Cambiar el motor deja `external_match_player_ratings` con notas de la version
 * anterior: la ficha del jugador seguiria mostrando el 7,8 que la v1 le daba a
 * cualquier apertura. Este script recalcula toda la cosecha con el motor de hoy
 * y reescribe las filas.
 *
 *   node scripts/rugby-ratings/repuntuar.mjs <planillas.jsonl>           (seco)
 *   node scripts/rugby-ratings/repuntuar.mjs <planillas.jsonl> --escribir
 *
 * SECO POR DEFECTO. Son decenas de miles de filas de produccion: la escritura
 * se pide a proposito, nunca por omision.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ENTRADA = process.argv[2];
const ESCRIBIR = process.argv.includes('--escribir');
if (!ENTRADA) {
    console.error('uso: node scripts/rugby-ratings/repuntuar.mjs <planillas.jsonl> [--escribir]');
    process.exit(1);
}

const raiz = pathToFileURL(process.cwd() + '/').href;
const { rateRugbyPlayer } = await import(raiz + 'src/lib/matches/rugbyPlayerRating.ts');

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const filas = [];
const vistos = new Set();
const rl = createInterface({ input: createReadStream(ENTRADA), crlfDelay: Infinity });
for await (const linea of rl) {
    if (!linea.trim()) continue;
    let f;
    try { f = JSON.parse(linea); } catch { continue; }
    if (f.marca || !f.slug) continue;

    // Un slug repetido dentro del mismo partido volaria el upsert entero por
    // clave duplicada. Gana el primero, igual que en el cron.
    const clave = `${f.match_id}|${f.slug}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    const r = rateRugbyPlayer({ stats: f.stats ?? {}, minutes: f.minutes, number: f.number });
    if (!r) continue;
    filas.push({
        match_id: f.match_id,
        player_slug: f.slug,
        player_name: f.name,
        rating: r.value,
        minutes: r.minutes,
        position: r.position,
        kickoff: f.kickoff,
    });
}

console.log(`[repuntuar] ${filas.length} filas de ${new Set(filas.map((f) => f.match_id)).size} partidos`);
if (!ESCRIBIR) {
    console.log('[repuntuar] SECO: no se escribio nada. Agregar --escribir para reescribir la tabla.');
    process.exit(0);
}

const TANDA = 500;
let escritas = 0;
for (let i = 0; i < filas.length; i += TANDA) {
    const lote = filas.slice(i, i + TANDA);
    const r = await fetch(`${URL_SB}/rest/v1/external_match_player_ratings?on_conflict=match_id,player_slug`, {
        method: 'POST',
        headers: {
            apikey: KEY,
            Authorization: `Bearer ${KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(lote),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    escritas += lote.length;
    if ((i / TANDA) % 10 === 0) console.log(`[repuntuar] ${escritas}/${filas.length}`);
}
console.log(`[repuntuar] FIN · ${escritas} filas reescritas`);
