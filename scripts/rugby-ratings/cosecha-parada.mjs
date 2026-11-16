/**
 * COSECHA DE PELOTA PARADA POR EQUIPO. Para cada partido de la cosecha de
 * planillas, pide el detalle de RugbyPass (UN request por partido) y guarda lo que
 * cada equipo hizo en scrum y en line: cantidad y porcentaje ganado.
 *
 * El proveedor no publica scrum ni line por jugador, pero si por equipo, y eso
 * alcanza para el indice de pelota parada de `rugbyPlayerRating.ts`: los pilares
 * y los hookers cargan con el scrum, el hooker y las segundas lineas con el line.
 *
 *   node scripts/rugby-ratings/cosecha-parada.mjs <planillas.jsonl> <parada.jsonl>
 *
 * Reanudable: saltea los partidos que ya estan en la salida.
 */
import { readFileSync, appendFileSync, existsSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const PLANILLAS = process.argv[2];
const SALIDA = process.argv[3];
if (!PLANILLAS || !SALIDA) {
    console.error('uso: node scripts/rugby-ratings/cosecha-parada.mjs <planillas.jsonl> <parada.jsonl>');
    process.exit(1);
}

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

const raiz = pathToFileURL(process.cwd() + '/').href;
const { getRugbyPassMatchDetail } = await import(raiz + 'src/lib/services/rugbyPass.ts');
const { rugbyPassGameIdOf } = await import(raiz + 'src/lib/services/rugbyPassMatchBundle.ts');
const { rugbyPassTeamSlugOf } = await import(raiz + 'src/lib/services/rugbyPassParser.ts');

/** Los ids de partido de un JSONL (de planillas o de la salida). */
async function idsDe(ruta, soloConJugadores) {
    const ids = new Set();
    const rl = createInterface({ input: createReadStream(ruta), crlfDelay: Infinity });
    for await (const linea of rl) {
        if (!linea.trim()) continue;
        try {
            const o = JSON.parse(linea);
            if (!o.match_id) continue;
            if (soloConJugadores && (o.marca || o.number == null)) continue;
            ids.add(o.match_id);
        } catch { /* linea cortada: se ignora */ }
    }
    return ids;
}
// Solo interesan los partidos que ya tienen planilla de jugadores.
const conPlanilla = await idsDe(PLANILLAS, true);
const hechos = existsSync(SALIDA) ? await idsDe(SALIDA, false) : new Set();

const partidos = [];
for (let off = 0; ; off += 1000) {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/external_match_cache?select=id,home_team,away_team&id=like.rp-*&status=eq.final&order=date_time.desc&offset=${off}&limit=1000`, { headers: H });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const lote = await r.json();
    for (const f of lote) {
        if (!conPlanilla.has(f.id) || hechos.has(f.id)) continue;
        const home = String(f.home_team?.id ?? ''), away = String(f.away_team?.id ?? '');
        if (home && away) partidos.push({ id: f.id, home, away });
    }
    if (lote.length < 1000) break;
}
console.log(`[parada] a pedir: ${partidos.length} (con planilla ${conPlanilla.size}, ya hechos ${hechos.size})`);

const numero = (s) => { const n = parseFloat(String(s ?? '').replace('%', '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const lado = (stats, cual) => {
    const v = (etiqueta) => numero(stats.find((s) => s.label === etiqueta)?.[cual]);
    const pct = (x) => (x == null ? null : x / 100);
    return {
        scrums: v('Scrums'), scrumsGanados: pct(v('Scrums ganados %')),
        lines: v('Lines'), linesGanados: pct(v('Lines ganados %')),
    };
};

let ok = 0, vacios = 0, fallados = 0;
const t0 = Date.now();
const CONCURRENCIA = 2;
async function cosechar(p) {
    const gameId = rugbyPassGameIdOf(p.id);
    if (gameId === null) { vacios++; return; }
    const d = await getRugbyPassMatchDetail(gameId, rugbyPassTeamSlugOf(p.home), rugbyPassTeamSlugOf(p.away));
    const stats = d?.stats ?? [];
    const fila = { match_id: p.id, home: lado(stats, 'home'), away: lado(stats, 'away') };
    // Aunque no traiga nada se marca, para que reanudar no lo repita.
    appendFileSync(SALIDA, JSON.stringify(fila) + '\n');
    if (fila.home.scrums == null && fila.home.lines == null) vacios++; else ok++;
}
for (let i = 0; i < partidos.length; i += CONCURRENCIA) {
    await Promise.all(partidos.slice(i, i + CONCURRENCIA).map((p) => cosechar(p).catch((e) => {
        fallados++;
        if (fallados <= 5) console.warn(`[parada] ${p.id}: ${e.message}`);
    })));
    if ((i / CONCURRENCIA) % 50 === 0) console.log(`[parada] ${i + CONCURRENCIA}/${partidos.length} · ok ${ok} · vacios ${vacios} · fallados ${fallados} · ${((Date.now() - t0) / 60000).toFixed(1)}min`);
}
console.log(`[parada] FIN · ok ${ok} · vacios ${vacios} · fallados ${fallados} · ${((Date.now() - t0) / 60000).toFixed(1)}min`);
