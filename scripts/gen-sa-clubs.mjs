// Genera el snapshot ESTÁTICO de clubes de rugby AR/UY/CL desde Supabase.
//
// Por qué un archivo generado y no una lectura en vivo:
//   · el motor de carrera debe ser REPRODUCIBLE — una carrera vieja tiene que
//     poder re-simularse con exactamente los mismos clubes;
//   · las filas de Supabase son mutables, así que sellar solo una versión no
//     alcanza: hay que poder recuperar el CONTENIDO;
//   · `next build` no debe depender de la base.
//
// Uso:  node scripts/gen-sa-clubs.mjs
// Lee .env.local. Hace EXCLUSIVAMENTE SELECT: no escribe nada en Supabase.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizeSaClubs } from '../src/features/career/data/clubs2026/saNormalize.ts';

const require = createRequire(new URL('../package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const OUT = new URL('../src/features/career/data/clubs2026/saClubs.generated.ts', import.meta.url);

const env = Object.fromEntries(
    readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^\s*[A-Z][A-Z0-9_]*=/.test(line))
        .map((line) => {
            const i = line.indexOf('=');
            return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y una key en .env.local');
    process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const fail = (label, error) => {
    if (!error) return;
    console.error(`Error leyendo ${label}: ${error.message}`);
    process.exit(1);
};

// ── Lectura (solo SELECT) ────────────────────────────────────────────────────
const clubs = await db
    .from('clubs')
    .select('id,name,short_name,country,region,city,slug,sport,union_id,is_visible')
    .eq('sport', 'rugby');
fail('clubs', clubs.error);

const unions = await db.from('unions').select('id,name');
fail('unions', unions.error);

const tournaments = await db.from('tournaments').select('id,name').eq('sport_id', 'rugby');
fail('tournaments', tournaments.error);

const standings = await db
    .from('tournament_standings')
    .select('club_id,tournament_id,played,won,scored,conceded');
fail('tournament_standings', standings.error);

const tournamentName = new Map(tournaments.data.map((t) => [t.id, t.name]));
const standingRows = standings.data
    .filter((s) => tournamentName.has(s.tournament_id))
    .map((s) => ({
        club_id: s.club_id,
        tournament_name: tournamentName.get(s.tournament_id),
        played: s.played,
        won: s.won,
        scored: s.scored,
        conceded: s.conceded,
    }));

// ── Normalización pura ───────────────────────────────────────────────────────
const { clubs: normalized, discarded } = normalizeSaClubs(clubs.data, unions.data, standingRows);

const byCountry = (cc) => normalized.filter((c) => c.countryCode === cc).length;
console.log(`filas leídas de clubs(sport=rugby): ${clubs.data.length}`);
console.log(`clubes normalizados: ${normalized.length}  (ar ${byCountry('ar')} · uy ${byCountry('uy')} · cl ${byCountry('cl')})`);
console.log('descartes:', JSON.stringify(discarded));

// Hash del CONTENIDO normalizado: si cambia un rating, cambia la versión.
const payload = normalized.map((c) => `${c.id}|${c.rating}|${c.prestige}|${c.level}|${c.competitionId}|${c.divisionTier}`).join('\n');
const hash = createHash('sha256').update(payload).digest('hex').slice(0, 12);

const header = `// ARCHIVO GENERADO — no editar a mano.
// Fuente: tabla \`clubs\` de Supabase (rugby AR/UY/CL) + \`unions\` + \`tournament_standings\`.
// Regenerar con:  node scripts/gen-sa-clubs.mjs
// Las reglas de filtrado y de rating viven en saNormalize.ts (puras y testeadas).
//
// Se congela a propósito: el motor debe poder re-simular una carrera vieja con
// EXACTAMENTE los mismos clubes, y las filas remotas son mutables.

import type { ClubDef } from '../clubs.ts';

/** Hash del contenido normalizado. Cambia si cambia cualquier club. */
export const SA_SNAPSHOT_VERSION = '${hash}';

/** Clubes de rugby AR/UY/CL, ya normalizados al contrato del motor. */
export const SA_CLUBS: ClubDef[] = `;

writeFileSync(OUT, `${header}${JSON.stringify(normalized, null, 4)};\n`, 'utf8');
console.log(`escrito ${OUT.pathname} (SA_SNAPSHOT_VERSION=${hash})`);
