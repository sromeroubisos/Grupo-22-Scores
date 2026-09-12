/**
 * Torneo Regional Pampeano 2026 (Primera): carga los resultados de una fecha.
 *
 *   npx tsx src/scripts/trp-2026-cargar-resultados.ts            # dry-run
 *   npx tsx src/scripts/trp-2026-cargar-resultados.ts --apply
 *
 * La fuente (@rugbymdq) da el marcador, no los tries. Por eso:
 *
 *   · el bonus OFENSIVO va declarado (`ofensivo`): ese partido entra con los
 *     puntos a mano (`points_autocalculated: false`, 4 + 1 al ganador), porque
 *     el motor no puede deducirlo sin tries;
 *   · el resto entra en automático y el motor pone el DEFENSIVO con la regla
 *     del torneo (perder por 7 o menos). Mismo criterio que la fecha del 05/09.
 *
 * Para la fecha siguiente: cambiar FECHA y RESULTADOS.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const TORNEO = '594fcb55-b052-4a8f-bf24-5a288e35e4f5';
const FECHA = '2026-09-12';
const RAZON = 'Resultados de Primera del TRP A publicados por @rugbymdq. El bonus ofensivo va declarado: la fuente da el marcador, no los tries.';
const MARGEN_DEFENSIVO = 7;

type Resultado = { home: string; away: string; homeScore: number; awayScore: number; ofensivo?: 'home' | 'away' };

const RESULTADOS: Resultado[] = [
    { home: 'sociedad-sportiva-de-bahia-blanca', away: 'mar-del-plata-club', homeScore: 25, awayScore: 31 },
    { home: 'ipr-sporting', away: 'comercial-r-c', homeScore: 69, awayScore: 31, ofensivo: 'home' },
    { home: 'universitario-de-mar-del-plata', away: 'san-ignacio-r-c', homeScore: 63, awayScore: 19, ofensivo: 'home' },
    { home: 'los-cardos-r-c', away: 'argentino-de-bahia-blanca', homeScore: 39, awayScore: 31 },
];

/** Los puntos del partido, como los escribe el gestor: base + bonus por lado. */
function puntos(r: Resultado) {
    const gana = r.homeScore > r.awayScore ? 'home' : r.homeScore < r.awayScore ? 'away' : null;
    const base = (lado: 'home' | 'away') => (gana === null ? 2 : gana === lado ? 4 : 0);
    const diferencia = Math.abs(r.homeScore - r.awayScore);
    const bonus = (lado: 'home' | 'away') =>
        (r.ofensivo === lado ? 1 : 0) + (gana !== null && gana !== lado && diferencia <= MARGEN_DEFENSIVO ? 1 : 0);
    return {
        home_base_points: base('home'),
        away_base_points: base('away'),
        home_bonus_points: bonus('home'),
        away_bonus_points: bonus('away'),
    };
}

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from('matches')
        .select('id, phase_id, season_id, status, home_club_id, away_club_id, score')
        .eq('tournament_id', TORNEO)
        .gte('date_time', `${FECHA}T00:00:00-03:00`)
        .lt('date_time', `${FECHA}T23:59:59-03:00`);
    if (error || !data) { console.error('No pude leer la fecha.', error); process.exit(1); }

    const planes = RESULTADOS.map((r) => {
        const partido = data.find((m) => m.home_club_id === r.home && m.away_club_id === r.away);
        if (!partido) { console.error('No está el partido', r.home, 'vs', r.away, 'el', FECHA); process.exit(1); }
        const p = puntos(r);
        const manual = Boolean(r.ofensivo);
        console.log(
            `${r.home} ${r.homeScore}-${r.awayScore} ${r.away}`,
            `| base ${p.home_base_points}/${p.away_base_points} bonus ${p.home_bonus_points}/${p.away_bonus_points}`,
            manual ? '| MANUAL (ofensivo declarado)' : '| AUTO',
            `| antes: ${partido.status} ${partido.score?.home}-${partido.score?.away}`,
        );
        return { partido, r, p, manual };
    });

    if (!APPLY) { console.log('\nDry-run. Con --apply se escribe.'); return; }

    for (const { partido, r, p, manual } of planes) {
        const { error: upErr } = await supabase.from('matches').update({
            status: 'final',
            score: { home: r.homeScore, away: r.awayScore },
            ...p,
            points_autocalculated: !manual,
            points_override_reason: manual ? RAZON : null,
        }).eq('id', partido.id);
        if (upErr) { console.error('Falló', r.home, r.away, upErr); process.exit(1); }
        console.log('ok', r.home, r.homeScore, '-', r.awayScore, r.away);
    }

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    for (const fase of [...new Set(planes.map(({ partido }) => partido.phase_id).filter(Boolean))] as string[]) {
        const seasonId = planes.find(({ partido }) => partido.phase_id === fase)?.partido.season_id ?? null;
        const r = await recalculatePhaseStandingsScopes(TORNEO, fase, 'general', seasonId);
        console.log('tabla recalculada', fase, JSON.stringify(r)?.slice(0, 200));
    }

    // `invalidateMatchesFeedCaches` importa `server-only` y no corre desde un
    // script: se borran los snapshots del día con alcance.
    const { deleteMatchesFeedSnapshotsForScope } = await import('@/lib/server/matchesFeedCache');
    console.log('feed', FECHA, 'snapshots borrados:', await deleteMatchesFeedSnapshotsForScope(supabase, { effectiveDate: FECHA }));
}

main().catch((e) => { console.error(e); process.exit(1); });
