/**
 * Carga los resultados de una fecha de un torneo de rugby cargado a mano.
 *
 *   npx tsx src/scripts/rugby-cargar-resultados-fecha.ts noa            # dry-run
 *   npx tsx src/scripts/rugby-cargar-resultados-fecha.ts noa --apply
 *
 * Mismo criterio que `trp-2026-cargar-resultados.ts`: la fuente da el marcador,
 * no los tries. El bonus OFENSIVO va declarado (`ofensivo`, el "(1)" de los
 * partes) y entra con los puntos a mano; el resto entra en automático y el
 * motor pone el DEFENSIVO (perder por 7 o menos).
 *
 * `home`/`away` son los del fixture cargado, no los del orden en que lo publique
 * la fuente. `reprogramar` mueve partidos que la programación corrió de día
 * (hora de Argentina).
 *
 * Para la fecha siguiente: cambiar `fecha`, `resultados` y `reprogramar` del
 * torneo que corresponda.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

type Resultado = { home: string; away: string; homeScore: number; awayScore: number; ofensivo?: 'home' | 'away' };
type Reprogramacion = { home: string; away: string; nuevaFecha: string };
type Carga = { torneo: string; fecha: string; razon: string; resultados: Resultado[]; reprogramar?: Reprogramacion[] };

const CARGAS: Record<string, Carga> = {
    noa: {
        torneo: 'a4a4d389-5eaa-4e16-9024-81c54abe64cc',
        fecha: '2026-09-12',
        razon: 'Resultado del Regional del NOA "A". El bonus ofensivo va declarado: la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'universitario-de-salta', away: 'universitario-de-tucuman', homeScore: 23, awayScore: 30 },
        ],
    },
    austral: {
        torneo: '4e0fb15f-89a2-425f-8830-43eeef981860',
        fecha: '2026-09-12',
        razon: 'Parte de la Unión de Rugby Austral: el "(1)" es el bonus ofensivo; la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'deportivo-portugues', away: 'patoruzu-r-c', homeScore: 20, awayScore: 38 },
            { home: 'calafate-r-c', away: 'bigornia-r-c', homeScore: 67, awayScore: 3, ofensivo: 'home' },
            { home: 'puerto-madryn-r-c', away: 'san-jorge-r-c-ua', homeScore: 69, awayScore: 5, ofensivo: 'home' },
        ],
        reprogramar: [
            { home: 'trelew-r-c', away: 'comodoro-r-c', nuevaFecha: '2026-09-13T15:30:00-03:00' },
            { home: 'chenque-r-c', away: 'draig-goch-r-c', nuevaFecha: '2026-09-13T16:00:00-03:00' },
        ],
    },
};

const APPLY = process.argv.includes('--apply');
const MARGEN_DEFENSIVO = 7;

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
    const clave = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '';
    const carga = CARGAS[clave];
    if (!carga) { console.error(`Torneo desconocido "${clave}". Opciones: ${Object.keys(CARGAS).join(', ')}`); process.exit(1); }
    const { torneo, fecha, razon, resultados, reprogramar = [] } = carga;

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from('matches')
        .select('id, phase_id, season_id, status, date_time, home_club_id, away_club_id, score')
        .eq('tournament_id', torneo)
        .gte('date_time', `${fecha}T00:00:00-03:00`)
        .lt('date_time', `${fecha}T23:59:59-03:00`);
    if (error || !data) { console.error('No pude leer la fecha.', error); process.exit(1); }

    const buscar = (home: string, away: string) => {
        const partido = data.find((m) => m.home_club_id === home && m.away_club_id === away);
        if (!partido) { console.error('No está el partido', home, 'vs', away, 'el', fecha); process.exit(1); }
        return partido;
    };

    const planes = resultados.map((r) => {
        const partido = buscar(r.home, r.away);
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
    const movidas = reprogramar.map((m) => {
        const partido = buscar(m.home, m.away);
        const nueva = new Date(m.nuevaFecha).toISOString();
        console.log(`${m.home} vs ${m.away} | ${partido.date_time} -> ${nueva}`);
        return { partido, nueva };
    });

    if (!APPLY) { console.log('\nDry-run. Con --apply se escribe.'); return; }

    for (const { partido, r, p, manual } of planes) {
        const { error: upErr } = await supabase.from('matches').update({
            status: 'final',
            score: { home: r.homeScore, away: r.awayScore },
            ...p,
            points_autocalculated: !manual,
            points_override_reason: manual ? razon : null,
        }).eq('id', partido.id);
        if (upErr) { console.error('Falló', r.home, r.away, upErr); process.exit(1); }
        console.log('ok', r.home, r.homeScore, '-', r.awayScore, r.away);
    }
    for (const { partido, nueva } of movidas) {
        const { error: upErr } = await supabase.from('matches').update({ date_time: nueva }).eq('id', partido.id);
        if (upErr) { console.error('Falló la reprogramación', partido.id, upErr); process.exit(1); }
        console.log('reprogramado', partido.home_club_id, 'vs', partido.away_club_id, nueva);
    }

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    for (const fase of [...new Set(planes.map(({ partido }) => partido.phase_id).filter(Boolean))] as string[]) {
        const seasonId = planes.find(({ partido }) => partido.phase_id === fase)?.partido.season_id ?? null;
        const r = await recalculatePhaseStandingsScopes(torneo, fase, 'general', seasonId);
        console.log('tabla recalculada', fase, JSON.stringify(r)?.slice(0, 200));
    }

    // `invalidateMatchesFeedCaches` importa `server-only` y no corre desde un
    // script: se borran los snapshots de los días tocados con alcance.
    const { deleteMatchesFeedSnapshotsForScope } = await import('@/lib/server/matchesFeedCache');
    const dias = new Set([fecha, ...reprogramar.map((m) => m.nuevaFecha.slice(0, 10))]);
    for (const dia of dias) {
        console.log('feed', dia, 'snapshots borrados:', await deleteMatchesFeedSnapshotsForScope(supabase, { effectiveDate: dia }));
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
