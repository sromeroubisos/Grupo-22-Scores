/**
 * TRAE TEMPORADAS VIEJAS de las competiciones que no viajan en el calendario.
 *
 *   npx tsx src/scripts/rugbypass-temporadas.ts                    # plan
 *   npx tsx src/scripts/rugbypass-temporadas.ts --execute
 *   npx tsx src/scripts/rugbypass-temporadas.ts --execute --desde 2023
 *   npx tsx src/scripts/rugbypass-temporadas.ts --execute --pagina six-nations
 *
 * El cron refresca las dos temporadas mas nuevas de cada pagina, que es lo que
 * se mueve. Las viejas no cambian nunca, asi que entran una sola vez y por acá.
 *
 * Es el mismo `upsertMatches` que usa el cron: no hay un segundo camino de
 * escritura que pueda quedar desincronizado.
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
const iDesde = process.argv.indexOf('--desde');
/**
 * Hasta donde atras. 2024 por defecto: son las temporadas que el hincha
 * todavia mira y las que la ficha de un jugador en actividad muestra arriba.
 * Bajarlo trae mas historia y mas partidos que puntuar despues.
 */
const DESDE = iDesde >= 0 ? Number(process.argv[iDesde + 1]) || 2024 : 2024;
const iPagina = process.argv.indexOf('--pagina');
const SOLO_PAGINA = iPagina >= 0 ? process.argv[iPagina + 1] : null;

const SPORT = 'rugby';

function shortName(name: string): string {
    return name.trim().slice(0, 3).toUpperCase() || 'EQU';
}

async function main() {
    // Igual que en el backfill de puntajes: los servicios se importan DESPUES de
    // cargar el entorno.
    const { getRugbyPassSeasonFixtures, getRugbyPassSeasons } = await import('../lib/services/rugbyPass.ts');
    const { RUGBYPASS_SEASON_PAGES } = await import('../lib/services/rugbyPassParser.ts');
    const { mapExternalMatchToCached, upsertMatches } = await import('../lib/services/externalMatchCache.ts');

    const supabase = createClient(URL_BASE!, KEY!, { auth: { persistSession: false } });
    const paginas = SOLO_PAGINA ? [SOLO_PAGINA] : [...RUGBYPASS_SEASON_PAGES];

    let total = 0;
    let escritos = 0;
    let sinHora = 0;

    for (const pagina of paginas) {
        const temporadas = (await getRugbyPassSeasons(pagina)).filter((t) => t >= DESDE);
        console.log(`\n${pagina}: temporadas ${temporadas.join(', ') || '(ninguna)'}`);

        for (const temporada of temporadas) {
            let partidos;
            try {
                partidos = await getRugbyPassSeasonFixtures(pagina, temporada);
            } catch (e) {
                console.warn(`   ${temporada}: falló — ${e instanceof Error ? e.message : String(e)}`);
                continue;
            }

            const conHora = partidos.filter((m) => m.kickoffKnown);
            sinHora += partidos.length - conHora.length;
            total += partidos.length;

            const porComp = new Map<string, number>();
            for (const m of partidos) porComp.set(m.competitionName, (porComp.get(m.competitionName) ?? 0) + 1);
            const detalle = [...porComp].map(([n, c]) => `${n} ${c}`).join(', ');

            if (!EJECUTAR) {
                console.log(`   ${temporada}: ${partidos.length} partidos — ${detalle}`);
                continue;
            }

            const filas = conHora.map((m) =>
                mapExternalMatchToCached({
                    id: m.id,
                    sport: SPORT,
                    tournamentId: m.tournamentId,
                    tournamentName: m.competitionName,
                    countryName: m.country,
                    homeTeam: {
                        id: m.home.id, name: m.home.name, logo: m.home.logo,
                        shortName: shortName(m.home.name),
                        image_path: m.home.logo, small_image_path: m.home.logo,
                    },
                    awayTeam: {
                        id: m.away.id, name: m.away.name, logo: m.away.logo,
                        shortName: shortName(m.away.name),
                        image_path: m.away.logo, small_image_path: m.away.logo,
                    },
                    score: { home: m.home.score, away: m.away.score },
                    status: m.status,
                    dateTime: m.kickoff as string,
                    roundLabel: m.roundLabel,
                })
            );

            const r = await upsertMatches(filas, supabase);
            escritos += r.written;
            console.log(`   ${temporada}: ${r.written} escritos de ${partidos.length} — ${detalle}`);
            if (r.skipped) console.warn('   CACHÉ NO DISPONIBLE: no se escribió nada');
        }
    }

    console.log(
        `\n${EJECUTAR ? 'Escritos' : 'Se escribirían'} ${EJECUTAR ? escritos : total} partidos` +
        (sinHora ? ` — ${sinHora} sin horario confirmado, no se publican` : '')
    );
    if (!EJECUTAR) console.log('Plan. Agregá --execute para escribir.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
