/**
 * Saca de `matches` los partidos que están cargados dos veces.
 *
 *   node -r ts-node/register -r tsconfig-paths/register src/scripts/catalogo-partidos-duplicados.ts --plan
 *   node -r ts-node/register -r tsconfig-paths/register src/scripts/catalogo-partidos-duplicados.ts --execute
 *   ... --solo=proveedor        (un solo grupo por vez)
 *
 * Corré esto DESPUÉS de `catalogo-fusionar-clubes.ts`: mientras "Lyon" y
 * "Lyon OU" sean dos clubes, el mismo partido cargado por los dos importadores
 * tiene pares de clubes distintos y no se detecta como repetido. La fusión hace
 * aparecer esa segunda camada.
 *
 * ── Por qué "mismo día + mismo par de clubes" NO alcanza ───────────────────
 * Ese criterio da 2.606 grupos y una parte NO son duplicados. rugbyarchive
 * carga la ida y la vuelta con la MISMA fecha cuando la fuente no la precisa
 * (`round_label` termina en "día sin precisar"): Bayonne-Biarritz 1975 aparece
 * dos veces, 6-3 y 17-6, y son dos partidos de verdad. Borrar por fecha+par se
 * habría llevado puesta la mitad de esos cruces.
 *
 * Por eso acá cada grupo se CLASIFICA y sólo se tocan tres formas, cada una con
 * una causa conocida:
 *
 *   proveedor   `flashscore:` + `rugbyarchive:` en el MISMO torneo y con el
 *               MISMO marcador. El Top 14 y la Pro D2 2025/26 entraron por los
 *               dos importadores con un día de diferencia. Queda la fila de
 *               rugbyarchive, que es la que trae `round_label`.
 *
 *   urba        una fila del archivo histórico (torneo "… de la URBA", sin
 *               external_id) y otra del importador de URBA (`urba:`), 2021-2025.
 *               Son dos modelados de la misma unión que se pisan sólo en la
 *               categoría mayor. Queda la fila del ARCHIVO —es la que tiene la
 *               serie completa desde 1945 y la que el cron actualiza, porque los
 *               cuatro torneos están vinculados por `external_id` a URBA— y
 *               antes de borrar la otra se le copia lo que sólo ella tenía
 *               (`round_label`: la fecha del campeonato).
 *
 *               El cron NO las repone: su alcance es `temporadaEnCurso()` y sólo
 *               ésa (ver `src/lib/integrations/urba/temporada.ts`). Un
 *               `?anio=2023&ocultos=1` a mano sí las recrearía.
 *
 *   fantasma    un `scheduled` 0-0 al lado del `final` del mismo partido, en el
 *               mismo torneo. Es el placeholder que nunca se actualizó.
 *
 * Todo lo demás se informa y no se toca.
 *
 * ── Lo que nunca se borra ──────────────────────────────────────────────────
 * Una fila con formaciones o con eventos, aunque caiga en un grupo. El dato
 * cargado a mano vale más que la prolijidad del catálogo: si la que sobra es la
 * que tiene la planilla, el grupo se informa para resolverlo a mano.
 */
import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
}

const EXECUTE = process.argv.includes('--execute');
const SOLO = (process.argv.find((a) => a.startsWith('--solo=')) || '').split('=')[1] || '';
const BACKUP = path.join(REPO, 'catalogo-partidos-duplicados.backup.json');

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Match = {
    id: string;
    date_time: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    external_id: string | null;
    tournament_id: string | null;
    phase_id: string | null;
    score: { home?: number; away?: number } | null;
    status: string | null;
    venue: string | null;
    round_label: string | null;
    lineup_home_count: number | null;
    lineup_away_count: number | null;
    events_count: number | null;
};

const day = (t: string | null) => (t || '').slice(0, 10);
const src = (e: string | null) => (e || '').split(':')[0] || '(sin)';
const sc = (m: Match) => `${m.score?.home ?? '?'}-${m.score?.away ?? '?'}`;
const tieneDatos = (m: Match) => (m.lineup_home_count || 0) > 0 || (m.lineup_away_count || 0) > 0 || (m.events_count || 0) > 0;

async function todosLosPartidos(): Promise<Match[]> {
    const out: Match[] = [];
    let from = 0;
    for (;;) {
        const { data, error } = await db
            .from('matches')
            .select('id,date_time,home_club_id,away_club_id,external_id,tournament_id,phase_id,score,status,venue,round_label,lineup_home_count,lineup_away_count,events_count')
            .order('date_time', { ascending: true })
            .range(from, from + 999);
        if (error) throw new Error(error.message);
        out.push(...((data || []) as Match[]));
        if (!data || data.length < 1000) break;
        from += 1000;
    }
    return out;
}

type Plan = { bucket: string; keep: Match; drop: Match[]; parche: Record<string, unknown> };

async function main() {
    console.log(EXECUTE ? '── BORRANDO PARTIDOS DUPLICADOS ──' : '── PLAN (no se escribe nada) ──');

    const M = await todosLosPartidos();
    console.log(`partidos en base: ${M.length}`);

    const { data: torneos, error: tErr } = await db.from('tournaments').select('id,name,external_id').limit(5000);
    if (tErr) throw new Error(tErr.message);
    const esArchivoUrba = new Set(
        (torneos || []).filter((t: any) => /de la URBA$/.test(String(t.name))).map((t: any) => t.id),
    );

    const grupos = new Map<string, Match[]>();
    for (const m of M) {
        if (!m.home_club_id || !m.away_club_id) continue;
        const k = day(m.date_time) + '|' + [m.home_club_id, m.away_club_id].sort().join('|');
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k)!.push(m);
    }

    const planes: Plan[] = [];
    const saltados: Array<{ k: string; motivo: string; v: Match[] }> = [];

    for (const [k, v] of grupos) {
        if (v.length < 2) continue;
        const fuentes = new Set(v.map((m) => src(m.external_id)));
        const marcadores = new Set(v.map(sc));
        const anio = Number(k.slice(0, 4));

        // ── urba: archivo (sin external_id, torneo "… de la URBA") vs importador ──
        const archivo = v.filter((m) => !m.external_id && m.tournament_id && esArchivoUrba.has(m.tournament_id));
        const importador = v.filter((m) => src(m.external_id) === 'urba');
        if (archivo.length === 1 && importador.length >= 1 && archivo.length + importador.length === v.length
            && marcadores.size === 1 && anio >= 2021 && anio <= 2025) {
            const keep = archivo[0];
            if (importador.some(tieneDatos) && !tieneDatos(keep)) { saltados.push({ k, motivo: 'la fila del importador tiene planilla', v }); continue; }
            const donante = importador.find((m) => m.round_label);
            const parche: Record<string, unknown> = {};
            if (!keep.round_label && donante?.round_label) parche.round_label = donante.round_label;
            if (!keep.venue && importador.find((m) => m.venue)) parche.venue = importador.find((m) => m.venue)!.venue;
            planes.push({ bucket: 'urba', keep, drop: importador, parche });
            continue;
        }

        // ── proveedor: flashscore vs rugbyarchive, mismo torneo y mismo marcador ──
        const fs_ = v.filter((m) => src(m.external_id) === 'flashscore');
        const ra = v.filter((m) => src(m.external_id) === 'rugbyarchive');
        if (fs_.length >= 1 && ra.length === 1 && fs_.length + ra.length === v.length
            && marcadores.size === 1 && new Set(v.map((m) => m.tournament_id)).size === 1) {
            const keep = ra[0];
            if (fs_.some(tieneDatos) && !tieneDatos(keep)) { saltados.push({ k, motivo: 'la fila de flashscore tiene planilla', v }); continue; }
            planes.push({ bucket: 'proveedor', keep, drop: fs_, parche: {} });
            continue;
        }

        // ── fantasma: scheduled 0-0 al lado del final, mismo torneo ──
        const finales = v.filter((m) => m.status === 'final');
        const fantasmas = v.filter((m) => m.status !== 'final' && (m.score?.home ?? 0) === 0 && (m.score?.away ?? 0) === 0 && !tieneDatos(m));
        if (finales.length === 1 && fantasmas.length && finales.length + fantasmas.length === v.length
            && new Set(v.map((m) => m.tournament_id)).size === 1) {
            planes.push({ bucket: 'fantasma', keep: finales[0], drop: fantasmas, parche: {} });
            continue;
        }

        saltados.push({
            k,
            motivo: marcadores.size > 1 ? 'marcadores distintos: son partidos distintos (ida y vuelta sin fecha)' : `no encaja (${[...fuentes].join('+')})`,
            v,
        });
    }

    const activos = SOLO ? planes.filter((p) => p.bucket === SOLO) : planes;
    const porBucket = new Map<string, { grupos: number; borra: number; parches: number }>();
    for (const p of activos) {
        const e = porBucket.get(p.bucket) || { grupos: 0, borra: 0, parches: 0 };
        e.grupos++; e.borra += p.drop.length; if (Object.keys(p.parche).length) e.parches++;
        porBucket.set(p.bucket, e);
    }

    console.log('\ngrupos con más de una fila:', [...grupos.values()].filter((v) => v.length > 1).length);
    console.log('a resolver:');
    for (const [b, e] of porBucket) console.log(`   ${b.padEnd(11)} ${String(e.grupos).padStart(5)} grupos · borra ${e.borra} filas · completa ${e.parches} round_label/venue`);

    const motivos = new Map<string, number>();
    for (const s of saltados) motivos.set(s.motivo, (motivos.get(s.motivo) || 0) + 1);
    console.log('se dejan como están:');
    for (const [m, n] of [...motivos].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(5)}  ${m}`);

    const aBorrar = activos.flatMap((p) => p.drop.map((m) => m.id));
    const backup = {
        generado: new Date().toISOString(),
        borradas: activos.flatMap((p) => p.drop.map((m) => ({ bucket: p.bucket, keep: p.keep.id, row: m }))),
        parches: activos.filter((p) => Object.keys(p.parche).length).map((p) => ({ id: p.keep.id, parche: p.parche })),
    };
    fs.writeFileSync(BACKUP, JSON.stringify(backup));
    console.log(`\nrespaldo: ${BACKUP} (${(fs.statSync(BACKUP).size / 1024).toFixed(0)} KB)`);

    if (!EXECUTE) {
        console.log('\n-- 6 ejemplos de lo que se borraría --');
        for (const p of activos.slice(0, 6)) {
            console.log(`  [${p.bucket}] queda ${p.keep.id.slice(0, 8)} (${p.keep.external_id || 'sin ext'}, ${p.keep.round_label || 'sin fecha'}) ${Object.keys(p.parche).length ? '+ ' + JSON.stringify(p.parche) : ''}`);
            for (const d of p.drop) console.log(`         borra ${d.id.slice(0, 8)} (${d.external_id || 'sin ext'}, ${d.round_label || 'sin fecha'}, ${d.status})`);
        }
        console.log('\nCorré con --execute para escribir.');
        return;
    }

    // 1) completar el que queda
    let parcheados = 0;
    for (const p of activos) {
        if (!Object.keys(p.parche).length) continue;
        const { error } = await db.from('matches').update(p.parche).eq('id', p.keep.id);
        if (error) throw new Error(`update ${p.keep.id}: ${error.message}`);
        parcheados++;
    }

    // 2) soltar lo que cuelga de las filas que se van, y borrarlas
    const chunk = <T,>(a: T[], n: number): T[][] => (a.length ? [a.slice(0, n), ...chunk(a.slice(n), n)] : []);
    let eventos = 0, rankings = 0, borradas = 0;
    for (const part of chunk(aBorrar, 50)) {
        const ev = await db.from('match_events').delete().in('match_id', part).select('id');
        if (ev.error) throw new Error(`match_events: ${ev.error.message}`);
        eventos += (ev.data || []).length;

        const rk = await db.from('club_ranking_match_applications').delete().in('match_id', part).select('id');
        if (rk.error && !/does not exist/i.test(rk.error.message)) throw new Error(`ranking: ${rk.error.message}`);
        rankings += (rk.data || []).length;

        const { error, data } = await db.from('matches').delete().in('id', part).select('id');
        if (error) throw new Error(`matches: ${error.message}`);
        borradas += (data || []).length;
    }

    console.log(`\ncompletados: ${parcheados} · partidos borrados: ${borradas} · eventos colgados: ${eventos} · aplicaciones de ranking: ${rankings}`);

    // 3) torneos que quedaron sin un solo partido
    const restantes = await todosLosPartidos();
    const conPartidos = new Set(restantes.map((m) => m.tournament_id).filter(Boolean) as string[]);
    const vacios = (torneos || []).filter((t: any) => !conPartidos.has(t.id) && /^URBA: /.test(String(t.name)));
    if (vacios.length) {
        console.log(`\ntorneos del importador que quedaron sin partidos: ${vacios.length}`);
        for (const t of vacios.slice(0, 15)) console.log('   ', t.id.slice(0, 8), t.name);
        console.log('   (se dejan publicados: esconderlos es una decisión de catálogo aparte)');
    }
    if (rankings) console.log('\nOjo: se soltaron aplicaciones de ranking. Corré el rebuild para que las posiciones no queden con el partido contado dos veces.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
