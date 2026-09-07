/**
 * PUNTUA DE ATRAS PARA ADELANTE todos los partidos de RugbyPass que ya estan en
 * `external_match_cache` y todavia no tienen puntaje.
 *
 *   npx tsx src/scripts/rugbypass-backfill-ratings.ts            # plan, no escribe
 *   npx tsx src/scripts/rugbypass-backfill-ratings.ts --execute
 *   npx tsx src/scripts/rugbypass-backfill-ratings.ts --execute --limit 50
 *   npx tsx src/scripts/rugbypass-backfill-ratings.ts --execute --viejos
 *
 * El cron `rugbypass-ratings` alcanza para ir al dia —una fecha de rugby son
 * unos cuarenta partidos por semana— pero no para la historia que ya esta en la
 * cache. Eso es este script, que se corre una vez.
 *
 * Medido: del orden de tres segundos por partido, asi que la cache entera son
 * unos veinte minutos con la concurrencia de abajo. Va del partido mas nuevo al
 * mas viejo porque es lo que la gente mira primero; con `--viejos` va al reves,
 * para cerrar la cola.
 *
 * Se puede cortar con Ctrl+C sin miedo: cada partido se guarda apenas se
 * puntua, y el que ya tiene marca no se vuelve a pedir.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) {
    console.error('Faltan credenciales en .env.local');
    process.exit(1);
}

const EJECUTAR = process.argv.includes('--execute');
const VIEJOS = process.argv.includes('--viejos');
const iLimite = process.argv.indexOf('--limit');
const LIMITE = iLimite >= 0 ? Number(process.argv[iLimite + 1]) || 0 : 0;

/**
 * Tres partidos a la vez. Son veintitres requests cada uno: mas que esto es
 * castigar al proveedor por una tabla que se llena una sola vez en la vida.
 */
const CONCURRENCIA = 3;

async function main() {
    // Los servicios se importan DESPUES de cargar el entorno: arman el cliente
    // de Supabase al evaluarse y sin las variables salen sin credenciales.
    const {
        pendingMatches,
        ratePlayersOfMatch,
        saveMatchRatings,
    } = await import('../lib/services/rugbyPassMatchRatings.ts');

    const supabase = createClient(URL_BASE!, KEY!, { auth: { persistSession: false } });

    const cupo = LIMITE > 0 ? LIMITE : 5000;
    const pendientes = await pendingMatches(supabase, cupo, { oldestFirst: VIEJOS });

    console.log(`Partidos sin puntuar: ${pendientes.length}${VIEJOS ? ' (del mas viejo al mas nuevo)' : ''}`);
    if (pendientes.length === 0) return;

    if (!EJECUTAR) {
        for (const p of pendientes.slice(0, 10)) console.log(`  ${p.id}  ${p.dateTime}`);
        if (pendientes.length > 10) console.log(`  … y ${pendientes.length - 10} mas`);
        console.log('\nPlan. Agregá --execute para escribir.');
        return;
    }

    const t0 = Date.now();
    let puntuados = 0;
    let jugadores = 0;
    let sinPlanilla = 0;
    let fallados = 0;

    for (let i = 0; i < pendientes.length; i += CONCURRENCIA) {
        const tanda = pendientes.slice(i, i + CONCURRENCIA);
        await Promise.all(
            tanda.map(async (partido) => {
                try {
                    const { rows, ok } = await ratePlayersOfMatch(partido);
                    await saveMatchRatings(supabase, partido.id, rows, ok);
                    puntuados++;
                    jugadores += rows.length;
                    if (!ok) sinPlanilla++;
                } catch (e) {
                    fallados++;
                    console.warn(`  ${partido.id}: ${e instanceof Error ? e.message : String(e)}`);
                }
            })
        );

        const hechos = Math.min(i + CONCURRENCIA, pendientes.length);
        const porSegundo = hechos / ((Date.now() - t0) / 1000);
        const faltan = Math.round((pendientes.length - hechos) / Math.max(porSegundo, 0.01));
        process.stdout.write(
            `\r  ${hechos}/${pendientes.length} · ${jugadores} jugadores · faltan ~${Math.round(faltan / 60)} min   `
        );
    }

    console.log(
        `\n\nListo en ${Math.round((Date.now() - t0) / 1000)} s: ${puntuados} partidos, ${jugadores} puntajes` +
        (sinPlanilla ? ` — ${sinPlanilla} sin planilla publicada` : '') +
        (fallados ? ` — ${fallados} fallaron (quedan sin marca, los agarra la próxima corrida)` : '')
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
