/**
 * Torneo Austral 2026 (primera): los resultados que la tabla oficial de la
 * Unión de Rugby Austral (fecha 3, actualizada al 09/09/26) exige.
 *
 *   npx tsx src/scripts/austral-2026-tabla-oficial.ts            # dry-run
 *   npx tsx src/scripts/austral-2026-tabla-oficial.ts --apply
 *
 * La tabla publicada y la nuestra diferían en PF/PC de cinco clubes y en un
 * punto de Calafate. Cruzando PF y PC de los diez contra la oficial, la única
 * combinación que cierra son estos tres marcadores:
 *
 *   · Bigornia 31-55 Comodoro (16/08)  -> 31-53   Comodoro PF 183->181, Bigornia PC 109->106 (con el de abajo)
 *   · Calafate 37-19 Draig Goch (22/08) -> 36-19  Calafate PF 135->134, Draig Goch PC 107->106
 *   · Trelew 25-12 Bigornia (22/08)    -> 24-12   Trelew PF 61->60
 *
 * Ojo con la prensa, que no es mejor fuente: Canal 12 publica Trelew 24-12
 * (como la Unión) pero también Madryn 14-45 Patoruzú, cuando la Unión cierra
 * con 48; y Superdepor da 31-55 y 37-19. Manda la Unión, que es la que publica
 * la tabla.
 *
 * El punto de Calafate: la Unión le da UN bonus (13 = 3 victorias + 1) y acá
 * tenía dos (vs Madryn 52-23 y vs Draig Goch). Se le saca el del partido con
 * Draig Goch, el de menor diferencia; la tabla no dice cuál fue, y el total es
 * el mismo cualquiera sea.
 *
 * Los tres partidos están cargados a mano (`points_autocalculated: false`),
 * así que el score y el bonus se escriben directo. Después se recalcula la
 * tabla persistida (ver la memoria "la tabla no se rehace sola").
 */
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const TORNEO = '4e0fb15f-89a2-425f-8830-43eeef981860';
const ROLLBACK = 'AUSTRAL_2026_TABLA_OFICIAL_ROLLBACK.json';
const RAZON = 'Tabla oficial de la URA, fecha 3 (09/09/26)';

type Arreglo = {
    id: string;
    partido: string;
    home: number;
    away: number;
    homeBonus?: number;
    awayBonus?: number;
};

const ARREGLOS: Arreglo[] = [
    { id: 'b7fab4e0-b37a-4f73-9b2c-2ad892c4405d', partido: 'Bigornia - Comodoro (16/08)', home: 31, away: 53 },
    { id: 'aa4f3f9f-abdc-4147-916f-266c05ad2bcd', partido: 'Calafate - Draig Goch (22/08)', home: 36, away: 19, homeBonus: 0 },
    { id: 'b1fc3947-3e94-48b8-b605-978accc36696', partido: 'Trelew - Bigornia (22/08)', home: 24, away: 12 },
];

type Fila = {
    id: string;
    phase_id: string | null;
    season_id: string | null;
    score: Record<string, unknown> | null;
    home_bonus_points: number | null;
    away_bonus_points: number | null;
    points_autocalculated: boolean | null;
    points_override_reason: string | null;
};

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    if (process.argv.includes('--cache')) {
        await borrarSnapshotsDelFeed(supabase);
        return;
    }

    const { data, error } = await supabase
        .from('matches')
        .select('id, phase_id, season_id, score, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
        .eq('tournament_id', TORNEO)
        .in('id', ARREGLOS.map((a) => a.id));
    if (error || !data) { console.error('No pude leer los partidos.', error); process.exit(1); }
    const filas = data as unknown as Fila[];
    const porId = new Map(filas.map((f) => [f.id, f]));

    const { data: eventos } = await supabase.from('match_events').select('match_id, type').in('match_id', ARREGLOS.map((a) => a.id));
    if ((eventos ?? []).length > 0) {
        console.error('Estos partidos tienen eventos cargados: el marcador sale de ahí, no se toca a mano.', eventos);
        process.exit(1);
    }

    const rollback: Fila[] = [];
    for (const a of ARREGLOS) {
        const f = porId.get(a.id);
        if (!f) { console.error('No encontré', a.partido, a.id); process.exit(1); }
        if (f.points_autocalculated !== false) { console.error(a.partido, 'no está cargado a mano; revisar antes.'); process.exit(1); }
        const antes = `${f.score?.home}-${f.score?.away} bonus ${f.home_bonus_points}/${f.away_bonus_points}`;
        const despues = `${a.home}-${a.away} bonus ${a.homeBonus ?? f.home_bonus_points}/${a.awayBonus ?? f.away_bonus_points}`;
        console.log(`${a.partido}: ${antes}  ->  ${despues}`);
        rollback.push(f);
    }

    if (!APPLY) { console.log('\nDry-run. Con --apply se escribe.'); return; }

    // Una segunda corrida no pisa el rollback con los valores ya corregidos.
    if (fs.existsSync(ROLLBACK)) {
        console.log('El rollback ya existe; se conserva el de la primera corrida:', ROLLBACK);
    } else {
        fs.writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 2));
        console.log('Rollback en', ROLLBACK);
    }

    for (const a of ARREGLOS) {
        const f = porId.get(a.id)!;
        const { error: upErr } = await supabase.from('matches').update({
            score: { ...(f.score ?? {}), home: a.home, away: a.away },
            ...(a.homeBonus !== undefined ? { home_bonus_points: a.homeBonus } : {}),
            ...(a.awayBonus !== undefined ? { away_bonus_points: a.awayBonus } : {}),
            points_override_reason: RAZON,
        }).eq('id', a.id);
        if (upErr) { console.error('Falló', a.partido, upErr); process.exit(1); }
        console.log('ok', a.partido);
    }

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const fases = [...new Set(filas.map((f) => f.phase_id).filter((p): p is string => Boolean(p)))];
    for (const fase of fases) {
        const seasonId = filas.find((f) => f.phase_id === fase)?.season_id ?? null;
        const r = await recalculatePhaseStandingsScopes(TORNEO, fase, 'general', seasonId);
        console.log('tabla recalculada', fase, JSON.stringify(r)?.slice(0, 200));
    }

    await borrarSnapshotsDelFeed(supabase);
}

/**
 * Los días del feed que muestran estos partidos. `invalidateMatchesFeedCaches`
 * no sirve desde un script: importa `server-only`, y sin alcance solo borra los
 * snapshots vencidos. Se borran los de las dos fechas, con alcance.
 */
async function borrarSnapshotsDelFeed(supabase: any) {
    const { deleteMatchesFeedSnapshotsForScope } = await import('@/lib/server/matchesFeedCache');
    for (const effectiveDate of ['2026-08-16', '2026-08-22']) {
        const borrados = await deleteMatchesFeedSnapshotsForScope(supabase, { effectiveDate });
        console.log('feed', effectiveDate, 'snapshots borrados:', borrados);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
