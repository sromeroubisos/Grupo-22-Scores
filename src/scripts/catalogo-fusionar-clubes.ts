/**
 * Fusiona los clubes que están cargados dos (o tres) veces en `clubs`.
 *
 *   node -r ts-node/register -r tsconfig-paths/register src/scripts/catalogo-fusionar-clubes.ts --plan
 *   node -r ts-node/register -r tsconfig-paths/register src/scripts/catalogo-fusionar-clubes.ts --execute
 *
 * ── De dónde salen los grupos ──────────────────────────────────────────────
 * NO de una heurística de nombres. El nombre es la evidencia DÉBIL: "Belgrano
 * Athletic" y "Belgrano Rugby Club" se parecen y son dos clubes distintos, y
 * "Angouleme" y "Soyaux Angoulême XV" no se parecen en nada y son el mismo.
 *
 * La evidencia FUERTE es el fixture: dos clubes que el mismo día juegan contra
 * el mismo rival con el mismo marcador son el mismo club cargado dos veces. Los
 * 21 grupos que se listan abajo salieron de ahí (entre 6 y 95 coincidencias
 * cada uno); el nombre sólo se usó después, para sumar al grupo la ficha del
 * renombre histórico que no comparte fixtures con las otras dos.
 *
 * El patrón es siempre el mismo y tiene una causa: `flashscore-importar-clubes`
 * creó la ficha del proveedor con el nombre abreviado ("Lyon"), escudo y
 * `external_id`; los importadores de rugbyarchive crearon la ficha del archivo
 * con el nombre completo ("Lyon OU"), sin escudo y sin país, pero con toda la
 * historia. Ninguno pisa al otro —está bien que no lo hagan— así que quedaron
 * las dos.
 *
 * ── Qué ficha sobrevive ────────────────────────────────────────────────────
 * La del ARCHIVO, y se le pasa lo que sólo tenía la del proveedor: `logo_url`,
 * `country`, `city`, `short_name` y sobre todo `external_id`. Ese último es el
 * que hace que `/api/teams` siga trayendo plantel y ficha del proveedor
 * (`effectiveClub.external_id`): si se perdiera, el club quedaría con la
 * historia y sin actualización.
 *
 * Cuando el club se renombró, sobrevive el id que coincide con el nombre ACTUAL
 * aunque tenga menos partidos (`bristol-bears`, no `bristol-rugby`): el id es la
 * URL, y una URL que dice el nombre viejo del club envejece mal.
 *
 * ── Lo que NO se toca ──────────────────────────────────────────────────────
 * Clubes que se parecen de nombre y son distintos: Belgrano Athletic / Belgrano
 * Rugby Club, Córdoba Athletic / Córdoba Rugby, San José de Paraguay / San José
 * de la URBA, Champagnat de Uruguay / Club Champagnat, FC Lyon / Lyon OU,
 * Lions de Sudáfrica / Lions RC de Chile. Ninguno comparte un solo fixture.
 *
 * ── Reversibilidad ─────────────────────────────────────────────────────────
 * Antes de escribir una sola fila, el script vuelca a un JSON TODO lo que va a
 * tocar (la fila del club que se borra y cada fila que se repunta, con su tabla
 * y su id). Sin ese archivo no hay vuelta atrás: no hay papelera en Postgres.
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
const BACKUP = path.join(REPO, 'catalogo-fusion-clubes.backup.json');

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** Un grupo: el club que queda, su nombre final, y los que se absorben. */
type Fusion = { winner: string; name: string; losers: string[] };

const FUSIONES: Fusion[] = [
    // ── Francia: ficha del proveedor + ficha(s) del archivo ──
    { winner: 'rc-toulon', name: 'RC Toulon', losers: ['rc-toulonnais'] },
    { winner: 'su-agen', name: 'SU Agen', losers: ['agen'] },
    { winner: 'fc-grenoble-rugby', name: 'FC Grenoble Rugby', losers: ['grenoble-fc'] },
    { winner: 'stade-montois', name: 'Stade Montois', losers: ['mont-de-marsan'] },
    { winner: 'stade-aurillacois', name: 'Stade Aurillacois', losers: ['aurillac'] },
    { winner: 'us-montalbanaise', name: 'US Montalbanaise', losers: ['montauban'] },
    { winner: 'lyon-ou', name: 'Lyon OU', losers: ['lyon'] },
    { winner: 'colomiers-rugby', name: 'Colomiers Rugby', losers: ['colomiers'] },
    { winner: 'rc-narbonne', name: 'RC Narbonne', losers: ['narbonne'] },
    { winner: 'sc-albi', name: 'SC Albi', losers: ['albi'] },
    { winner: 'asm-clermont', name: 'ASM Clermont', losers: ['clermont'] },
    { winner: 'union-bordeaux-begles', name: 'Union Bordeaux Bègles', losers: ['bordeaux-begles'] },
    { winner: 'rc-vannes', name: 'RC Vannes', losers: ['vannes'] },
    { winner: 'uson-nevers', name: 'USON Nevers', losers: ['nevers'] },
    { winner: 'oyonnax-rugby', name: 'Oyonnax Rugby', losers: ['us-oyonnax'] },
    { winner: 'us-bressane', name: 'US Bressane', losers: ['bressane'] },
    { winner: 'valence-romans-drome-rugby', name: 'Valence Romans Drôme Rugby', losers: ['valence-romans'] },
    { winner: 'rouen-normandie-rugby', name: 'Rouen Normandie Rugby', losers: ['rouen-normandie'] },
    { winner: 'rc-orleans', name: 'RC Orléans', losers: ['orleans'] },
    { winner: 'us-carmaux', name: 'US Carmaux', losers: ['fc-carmaux'] },
    { winner: 'cr-la-vila', name: 'CR La Vila', losers: ['la-vila'] },

    // ── Renombres: sobrevive el id que dice el nombre de HOY ──
    { winner: 'as-beziers-herault', name: 'AS Béziers Hérault', losers: ['as-beziers', 'beziers'] },
    { winner: 'us-dax-rugby-landes', name: 'US Dax Rugby Landes', losers: ['us-dax'] },
    { winner: 'montpellier-herault-rc', name: 'Montpellier Hérault RC', losers: ['montpellier-rugby', 'montpellier'] },
    { winner: 'soyaux-angouleme-xv', name: 'Soyaux Angoulême XV', losers: ['sc-angouleme', 'angouleme'] },
    { winner: 'bristol-bears', name: 'Bristol Bears', losers: ['bristol-rugby', 'bristol'] },
    { winner: 'us-carcassonnaise', name: 'US Carcassonnaise', losers: ['as-carcassonnaise', 'carcassonne'] },
    { winner: 'edinburgh-rugby', name: 'Edinburgh Rugby', losers: ['edinburgh'] },

    // ── Argentina y hockey ──
    { winner: 'c-u-q', name: 'Club Universitario de Quilmes', losers: ['cuq'] },
    { winner: 'club-bancario', name: 'Club Bancario', losers: ['bancario'] },
    { winner: 'club-somisa', name: 'Club Somisa', losers: ['somisa'] },
    { winner: 'talleres', name: 'Talleres', losers: ['talleres-hockey'] },
    { winner: 'jockey-club-de-rosario-hockey', name: 'Jockey Club de Rosario Hockey', losers: ['jockey-club-de-rosario-hockey-2'] },
];

/**
 * Dónde vive un club fuera de `clubs`, y con qué clave se pisa consigo mismo.
 *
 * `key` es lo que hace única a la fila SIN contar el club. Si el ganador ya
 * tiene una fila con esa misma clave, la del perdedor no se repunta: se borra.
 * Repuntarla sería o un choque de índice único o una fila repetida —dos veces
 * el mismo club en la tabla de posiciones, por ejemplo—, que es justamente lo
 * que se vino a arreglar.
 *
 * `key: null` = no hay forma de chocar (el club es un valor, no parte de la
 * identidad de la fila): se repunta y listo.
 */
const TABLAS: Array<{ table: string; cols: string[]; key: string[] | null }> = [
    { table: 'matches', cols: ['home_club_id', 'away_club_id', 'created_by_club_id'], key: null },
    { table: 'match_events', cols: ['club_id'], key: null },
    { table: 'people', cols: ['club_id'], key: null },
    { table: 'club_person_roles', cols: ['club_id'], key: null },
    { table: 'player_stats', cols: ['club_id'], key: null },
    { table: 'club_ranking_match_applications', cols: ['home_club_id', 'away_club_id'], key: null },
    { table: 'tournament_seasons', cols: ['champion_club_id'], key: null },
    { table: 'club_external_ids', cols: ['club_id'], key: null },
    { table: 'tournament_participants', cols: ['club_id'], key: ['tournament_id'] },
    { table: 'tournament_standings', cols: ['club_id'], key: ['tournament_id', 'phase_id', 'group_id', 'table_type'] },
    { table: 'team_season_entries', cols: ['club_id'], key: ['season_id', 'tournament_id'] },
    { table: 'season_rosters', cols: ['club_id'], key: ['season_id', 'tournament_id', 'roster_type'] },
    { table: 'club_aliases', cols: ['club_id'], key: ['alias'] },
    { table: 'club_enabled_sports', cols: ['club_id'], key: ['sport_id'] },
    { table: 'club_settings', cols: ['club_id'], key: [] },
    { table: 'club_ranking_entries', cols: ['club_id'], key: ['ranking_id'] },
    { table: 'user_favorite_clubs', cols: ['club_id', 'canonical_club_id'], key: ['user_id'] },
    { table: 'club_derivatives', cols: ['base_club_id', 'derived_club_id'], key: ['derivative_type'] },
];

type Backup = { clubs: unknown[]; rows: Array<{ table: string; row: unknown }> };
const backup: Backup = { clubs: [], rows: [] };

const chunk = <T,>(a: T[], n: number): T[][] => (a.length ? [a.slice(0, n), ...chunk(a.slice(n), n)] : []);

/** Todas las filas de `table` donde alguna de `cols` apunta a alguno de `ids`. */
async function rowsFor(table: string, cols: string[], ids: string[]) {
    const out = new Map<string, Record<string, unknown>>();
    for (const col of cols) {
        for (const part of chunk(ids, 40)) {
            let from = 0;
            for (;;) {
                const { data, error } = await db
                    .from(table)
                    .select('*')
                    .in(col, part)
                    .range(from, from + 999);
                if (error) throw new Error(`${table}.${col}: ${error.message}`);
                for (const r of data || []) out.set(String((r as any).id ?? JSON.stringify(r)), r as Record<string, unknown>);
                if (!data || data.length < 1000) break;
                from += 1000;
            }
        }
    }
    return [...out.values()];
}

async function main() {
    console.log(EXECUTE ? '── FUSIONANDO CLUBES ──' : '── PLAN (no se escribe nada) ──');

    const allIds = FUSIONES.flatMap((f) => [f.winner, ...f.losers]);
    const { data: clubRows, error: clubErr } = await db.from('clubs').select('*').in('id', allIds);
    if (clubErr) throw new Error(clubErr.message);
    const byId = new Map((clubRows || []).map((c: any) => [c.id, c]));

    let faltan = 0;
    for (const f of FUSIONES) {
        for (const id of [f.winner, ...f.losers]) if (!byId.has(id)) { console.error(`  ✗ no existe el club ${id}`); faltan++; }
    }
    if (faltan) { console.error('Abortado: revisá la lista.'); process.exit(1); }

    let totalMovidas = 0;
    let totalBorradas = 0;
    const resumen: string[] = [];

    for (const f of FUSIONES) {
        const winner: any = byId.get(f.winner);
        const losers = f.losers.map((id) => byId.get(id) as any);

        // lo que el ganador no tiene y algún perdedor sí
        const parche: Record<string, unknown> = {};
        if (winner.name !== f.name) parche.name = f.name;
        for (const campo of ['logo_url', 'country', 'city', 'external_id', 'short_name'] as const) {
            if (winner[campo]) continue;
            const donante = losers.find((l) => l[campo]);
            if (donante) parche[campo] = donante[campo];
        }
        if (parche.short_name === undefined && winner.short_name !== f.name && !losers.some((l) => l.short_name && l.short_name !== l.name)) {
            parche.short_name = f.name;
        }

        const movidas: Record<string, number> = {};
        const borradas: Record<string, number> = {};

        for (const { table, cols, key } of TABLAS) {
            const loserRows = await rowsFor(table, cols, f.losers);
            if (!loserRows.length) continue;

            let winnerKeys = new Set<string>();
            if (key) {
                const winnerRows = await rowsFor(table, cols, [f.winner]);
                winnerKeys = new Set(winnerRows.map((r) => key.map((k) => String((r as any)[k] ?? '')).join('|')));
            }

            for (const row of loserRows) {
                const patch: Record<string, unknown> = {};
                for (const col of cols) if (f.losers.includes(String((row as any)[col] ?? ''))) patch[col] = f.winner;
                if (!Object.keys(patch).length) continue;

                const k = key ? key.map((c) => String((row as any)[c] ?? '')).join('|') : null;
                const choca = k !== null && winnerKeys.has(k);

                backup.rows.push({ table, row });
                if (choca) {
                    borradas[table] = (borradas[table] || 0) + 1;
                    totalBorradas++;
                    if (EXECUTE) {
                        const { error } = await db.from(table).delete().eq('id', (row as any).id);
                        if (error) throw new Error(`delete ${table} ${(row as any).id}: ${error.message}`);
                    }
                } else {
                    movidas[table] = (movidas[table] || 0) + 1;
                    totalMovidas++;
                    if (k !== null) winnerKeys.add(k);
                    if (EXECUTE) {
                        const idCol = (row as any).id !== undefined ? 'id' : cols[0];
                        const q = db.from(table).update(patch);
                        const { error } = (row as any).id !== undefined
                            ? await q.eq('id', (row as any).id)
                            : await q.eq(idCol, (row as any)[idCol]);
                        if (error) throw new Error(`update ${table}: ${error.message}`);
                    }
                }
            }
        }

        for (const l of losers) backup.clubs.push(l);

        if (EXECUTE) {
            if (Object.keys(parche).length) {
                const { error } = await db.from('clubs').update(parche).eq('id', f.winner);
                if (error) throw new Error(`clubs update ${f.winner}: ${error.message}`);
            }
            const { error: delErr } = await db.from('clubs').delete().in('id', f.losers);
            if (delErr) throw new Error(`clubs delete ${f.losers.join(',')}: ${delErr.message}`);
        }

        const detalle = [
            ...Object.entries(movidas).map(([t, n]) => `${t} +${n}`),
            ...Object.entries(borradas).map(([t, n]) => `${t} -${n}`),
        ].join(' · ');
        resumen.push(`  ${f.winner.padEnd(28)} "${f.name}"  ←  ${f.losers.join(', ')}\n      ${detalle || '(sin filas que mover)'}`
            + (Object.keys(parche).length ? `\n      clubs: ${Object.keys(parche).join(', ')}` : ''));
    }

    fs.writeFileSync(BACKUP, JSON.stringify(backup));
    console.log(resumen.join('\n'));
    console.log('');
    console.log(`grupos: ${FUSIONES.length} · clubes que desaparecen: ${FUSIONES.reduce((a, f) => a + f.losers.length, 0)}`);
    console.log(`filas repuntadas: ${totalMovidas} · filas borradas por chocar con el ganador: ${totalBorradas}`);
    console.log(`respaldo: ${BACKUP} (${(fs.statSync(BACKUP).size / 1024).toFixed(0)} KB)`);
    if (!EXECUTE) console.log('\nCorré con --execute para escribir.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
