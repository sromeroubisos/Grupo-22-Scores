/**
 * COSECHA DE PLANILLAS. Pide a RugbyPass los rubros crudos de cada partido ya
 * puntuado y los deja en un JSONL, una fila por jugador-partido.
 *
 * De aca salen las referencias POR PUESTO del motor nuevo. Es una sola pasada:
 * el archivo queda y no hay que volver a molestar al proveedor.
 *
 * Reanudable: si se corta, saltea los partidos que ya estan en el archivo.
 *
 *   node scripts/rugby-ratings/cosecha.mjs planillas.jsonl
 *
 * SON VEINTITRES REQUESTS POR PARTIDO y unos veinte minutos para la base
 * entera. No se corre por gusto: el archivo que deja es la entrada de
 * `calibrar.mjs`, `validar.mjs`, `ganador.mjs` y `repuntuar.mjs`.
 *
 * NO REDIRIJAS LA SALIDA A `head`: cuando head cierra el pipe, node muere a
 * mitad de la cosecha con codigo 0 y parece que termino bien.
 */
import { readFileSync, appendFileSync, existsSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const SALIDA = process.argv[2] ?? 'planillas.jsonl';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// Los modulos se resuelven desde el repo, no desde donde vive este script.
const raiz = pathToFileURL(process.cwd() + '/').href;
const { getRugbyPassMatchDetail, getRugbyPassPlayerStats } = await import(raiz + 'src/lib/services/rugbyPass.ts');
const { planillaDelPartido, claveNombre, rugbyPassGameIdOf } = await import(raiz + 'src/lib/services/rugbyPassMatchBundle.ts');
const { rugbyPassTeamSlugOf } = await import(raiz + 'src/lib/services/rugbyPassParser.ts');
const { minutesFromLineup } = await import(raiz + 'src/lib/matches/rugbyPlayerRating.ts');

// Los partidos: los mismos que ya tienen puntaje, para que la calibracion se
// mida contra exactamente la poblacion que hoy esta en la base.
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const partidos = new Map();
for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_SB}/rest/v1/external_match_cache?select=id,date_time,home_team,away_team&id=like.rp-*&status=eq.final&order=date_time.desc&offset=${off}&limit=1000`, { headers: H });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const lote = await r.json();
    for (const f of lote) {
        const home = String(f.home_team?.id ?? ''), away = String(f.away_team?.id ?? '');
        if (home && away) partidos.set(f.id, { id: f.id, dateTime: f.date_time, homeTeamId: home, awayTeamId: away });
    }
    if (lote.length < 1000) break;
}
console.log(`[cosecha] partidos finales en cache: ${partidos.size}`);

// Reanudar: lo que ya esta cosechado no se vuelve a pedir.
const hechos = new Set();
if (existsSync(SALIDA)) {
    const rl = createInterface({ input: createReadStream(SALIDA), crlfDelay: Infinity });
    for await (const linea of rl) { if (linea.trim()) { try { hechos.add(JSON.parse(linea).match_id); } catch {} } }
    console.log(`[cosecha] ya cosechados: ${hechos.size} partidos`);
}

const pendientes = [...partidos.values()].filter((p) => !hechos.has(p.id));
console.log(`[cosecha] a pedir: ${pendientes.length}`);

const CONCURRENCIA = 2;   // igual que el cron: el proveedor no tiene por que aguantar mas
let ok = 0, vacios = 0, fallados = 0, filas = 0;
const t0 = Date.now();

async function cosechar(partido) {
    const gameId = rugbyPassGameIdOf(partido.id);
    if (gameId === null) { vacios++; return; }
    const [detalle, planilla] = await Promise.all([
        getRugbyPassMatchDetail(gameId, rugbyPassTeamSlugOf(partido.homeTeamId), rugbyPassTeamSlugOf(partido.awayTeamId)),
        getRugbyPassPlayerStats(gameId, rugbyPassTeamSlugOf(partido.homeTeamId), rugbyPassTeamSlugOf(partido.awayTeamId)).catch(() => []),
    ]);
    const lineups = detalle?.lineups ?? { home: [], away: [] };
    if (lineups.home.length === 0 && lineups.away.length === 0) { vacios++; return; }

    const hoja = planillaDelPartido(lineups, planilla);
    if (hoja.extras.size === 0) { vacios++; return; }

    const lineas = [];
    const vistos = new Set();
    for (const jugador of [...lineups.home, ...lineups.away]) {
        if (!jugador.slug || vistos.has(jugador.slug)) continue;
        const extra = hoja.extras.get(claveNombre(jugador.name));
        if (!extra) continue;
        vistos.add(jugador.slug);
        const stats = {};
        for (const [metricId, m] of Object.entries(extra)) stats[metricId] = m.value;
        lineas.push(JSON.stringify({
            match_id: partido.id, kickoff: partido.dateTime, slug: jugador.slug, name: jugador.name,
            number: jugador.number, minutes: minutesFromLineup(jugador), stats,
        }));
    }
    // Aunque no salga ninguna fila se marca el partido, para que reanudar no lo repita.
    lineas.push(JSON.stringify({ match_id: partido.id, marca: true, jugadores: lineas.length }));
    appendFileSync(SALIDA, lineas.join('\n') + '\n');
    filas += lineas.length - 1;
    ok++;
}

for (let i = 0; i < pendientes.length; i += CONCURRENCIA) {
    const tanda = pendientes.slice(i, i + CONCURRENCIA);
    await Promise.all(tanda.map((p) => cosechar(p).catch((e) => {
        fallados++;
        if (fallados <= 5) console.warn(`[cosecha] ${p.id}: ${e.message}`);
    })));
    if ((i / CONCURRENCIA) % 25 === 0) {
        const min = (Date.now() - t0) / 60000;
        const resta = min / Math.max(1, i + CONCURRENCIA) * (pendientes.length - i);
        console.log(`[cosecha] ${i + tanda.length}/${pendientes.length} · ok ${ok} · vacios ${vacios} · fallados ${fallados} · filas ${filas} · ${min.toFixed(1)}min (faltan ~${resta.toFixed(0)}min)`);
    }
}
console.log(`[cosecha] FIN · ok ${ok} · vacios ${vacios} · fallados ${fallados} · filas ${filas} · ${((Date.now() - t0) / 60000).toFixed(1)}min`);
