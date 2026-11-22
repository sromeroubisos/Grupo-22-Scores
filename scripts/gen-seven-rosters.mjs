// Genera los 7 nombres de cada club argentino del Rugby 7 a partir de la base.
//
// Quiénes: los 7 que más puntos hicieron en la Primera del club (try 5,
// conversión 2, penal 3, drop 3; desempata por tries). Solo mayores
// (clubs.category null): nunca juveniles. Los clubes femeninos no entran.
//
// Cómo se guardan: NUNCA con el nombre completo. Inicial + último apellido con
// una letra menos: "Gonzalo Gutiérrez Taboada" -> "G. Taboad". Se reconoce de
// qué club se habla, pero no es el nombre tal cual.
//
// Por qué un archivo generado: el juego no consulta la base en vivo.
// Uso:  node scripts/gen-seven-rosters.mjs
// Lee .env.local. Hace EXCLUSIVAMENTE SELECT.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const GEN = new URL('../src/app/juegos/minijuegos/rugby-seven/arClubs.generated.ts', import.meta.url);
const OUT = new URL('../src/app/juegos/minijuegos/rugby-seven/arRosters.generated.ts', import.meta.url);

const env = Object.fromEntries(
    readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^\s*[A-Z][A-Z0-9_]*=/.test(l))
        .map((l) => {
            const i = l.indexOf('=');
            return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const norm = (s) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(club|rugby|asociacion|sociedad|de|del|la|el|los|las|y)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

// Clubes del juego: id y nombre leídos del archivo generado (sin ejecutar TS).
const src = readFileSync(GEN, 'utf8');
const gameClubs = [...src.matchAll(/"id": "(ar-[^"]+)",\s*"name": "([^"]+)"/g)].map((m) => ({ id: m[1], name: m[2] }));
// Selecciones: id `nat-<código>`; en la base se buscan por nombre y como "<país> XV".
const natSrc = readFileSync(new URL('../src/app/juegos/minijuegos/rugby-seven/nations.ts', import.meta.url), 'utf8');
const nations = [...natSrc.matchAll(/code: '([A-Z]+)', name: '([^']+)'/g)].map((m) => ({ id: `nat-${m[1].toLowerCase()}`, name: m[2], nation: true }));
gameClubs.push(...nations);

// PostgREST corta en 1000 filas por pedido: se pagina con un orden estable.
const clubs = [];
for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('clubs').select('id,name').eq('sport', 'rugby').is('category', null).order('id').range(from, from + 999);
    if (error) throw error;
    clubs.push(...data);
    if (data.length < 1000) break;
}
const byName = new Map();
for (const c of clubs) {
    // Hay filas de juveniles con category null ("Club Newman M19 "A""): afuera.
    if (/\bM\s?\d{2}\b|\bpre\s?intermedia\b|\bintermedia\b|\bjuvenil/i.test(c.name)) continue;
    const k = norm(c.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(c.id);
}

// Nacidos después de esta fecha son menores de 18: no entran.
const CUT_18 = new Date(new Date().getFullYear() - 18, new Date().getMonth(), new Date().getDate());

const PTS = { try: 5, conversion: 2, penalty_goal: 3, drop_goal: 3 };

/** "Gonzalo Gutiérrez Taboada" -> "G. Taboad". */
// Nombres compuestos: "Juan Bautista Daireaux" -> el apellido es Daireaux, no Bautista.
const GIVEN2 = new Set(['bautista', 'cruz', 'manuel', 'martin', 'ignacio', 'pablo', 'jose', 'luis', 'carlos', 'maria', 'ángel', 'angel', 'francisco', 'tomas', 'agustin', 'santiago', 'pedro', 'eduardo', 'alberto', 'andres', 'antonio', 'miguel', 'nicolas', 'federico', 'sebastian', 'matias', 'lucas', 'facundo']);
// Apellidos que son uno solo aunque tengan dos palabras (si no, se toma el primero).
const COMPOUND = new Set(['gutierrez taboada']);
// La base los trae sin tilde.
const ACCENT = { gomez: 'Gómez', fernandez: 'Fernández', gonzalez: 'González', rodriguez: 'Rodríguez', perez: 'Pérez', lopez: 'López', martinez: 'Martínez', sanchez: 'Sánchez', garcia: 'García', ramirez: 'Ramírez', diaz: 'Díaz', gutierrez: 'Gutiérrez', hernandez: 'Hernández', alvarez: 'Álvarez', suarez: 'Suárez', dominguez: 'Domínguez', benitez: 'Benítez', jimenez: 'Jiménez', martin: 'Martín', roman: 'Román', ruiz: 'Ruiz', vazquez: 'Vázquez', velez: 'Vélez', ibañez: 'Ibáñez', nuñez: 'Núñez', munoz: 'Muñoz', sosa: 'Sosa', acuna: 'Acuña', luque: 'Luque' };
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Estanislao Gomez Fernandez" -> "E. Gómez". Apellidos largos (7+) pierden la última letra: "G. Taboad". */
function abbreviate(full) {
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return null;
    let i = 1;
    if (parts.length >= 3 && GIVEN2.has(plain(parts[1]))) i = 2; // nombre compuesto
    let surname = parts[i];
    if (!surname) return null;
    const pair = parts[i + 1] ? `${plain(parts[i])} ${plain(parts[i + 1])}` : '';
    if (COMPOUND.has(pair)) surname = parts[i + 1]; // Gutiérrez Taboada -> Taboada
    surname = ACCENT[plain(surname)] ?? surname;
    const cut = surname.length >= 7 ? surname.slice(0, -1) : surname;
    return `${parts[0][0].toUpperCase()}. ${cut}`;
}

const out = {};
let sinDatos = 0;
for (const gc of gameClubs) {
    let ids = gc.nation ? [...(byName.get(`${norm(gc.name)} xv`) ?? []), ...(byName.get(norm(gc.name)) ?? [])] : byName.get(norm(gc.name));
    if ((!ids || ids.length === 0) && !gc.nation) {
        // Cruce flexible: el nombre del juego como palabra completa dentro de uno solo del de la base
        // ("Berazategui" en "Municipalidad de Berazategui"). Si hay más de uno, no se arriesga.
        const gk = norm(gc.name);
        const hits = gk.length >= 5 ? [...byName.keys()].filter((k) => ` ${k} `.includes(` ${gk} `)) : [];
        if (hits.length === 1) ids = byName.get(hits[0]);
    }
    if (!ids || ids.length === 0) {
        sinDatos++;
        continue;
    }
    const rows = [];
    for (let from = 0; ; from += 1000) {
        const { data, error: e } = await db
            .from('match_events')
            .select('player_name,event_type')
            .in('club_id', ids)
            .in('event_type', Object.keys(PTS))
            .not('player_name', 'is', null)
            .range(from, from + 999);
        if (e) throw e;
        rows.push(...data);
        if (data.length < 1000) break;
    }
    const by = new Map();
    for (const r of rows) {
        const key = r.player_name.trim();
        const p = by.get(key) ?? { pts: 0, tries: 0 };
        p.pts += PTS[r.event_type];
        if (r.event_type === 'try') p.tries++;
        by.set(key, p);
    }
    const top = [...by.entries()]
        .sort((a, b) => b[1].pts - a[1].pts || b[1].tries - a[1].tries || a[0].localeCompare(b[0]))
        .map(([n]) => abbreviate(n))
        .filter(Boolean);
    const uniq = [...new Set(top)];
    if (uniq.length < 7) {
        // Faltan goleadores: se completa con jugadores del club que haya en la base (sin menores de 18).
        const { data: roles, error: re } = await db
            .from('club_person_roles')
            .select('people(full_name,first_name,last_name,birth_date)')
            .in('club_id', ids)
            .eq('role', 'player')
            .eq('status', 'active')
            .limit(2000);
        if (re) throw re;
        const adult = (b) => !b || new Date(b) <= CUT_18;
        const extra = (roles ?? [])
            .map((r) => r.people)
            .filter((p) => p && adult(p.birth_date))
            .map((p) => (p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`).trim())
            .sort((a, b) => a.localeCompare(b))
            .map(abbreviate)
            .filter(Boolean);
        for (const n of extra) if (!uniq.includes(n)) uniq.push(n);
    }
    if (uniq.length < 7) {
        // Todavía faltan: los que más aparecen en las formaciones de los partidos del club.
        const count = new Map();
        for (const [col, side] of [['home_club_id', 'home'], ['away_club_id', 'away']]) {
            const { data: ms, error: me } = await db.from('matches').select('lineups').in(col, ids).not('lineups', 'is', null).limit(400);
            if (me) throw me;
            for (const m of ms ?? []) for (const p of m.lineups?.[side] ?? []) if (p?.name) count.set(p.name.trim(), (count.get(p.name.trim()) ?? 0) + 1);
        }
        const more = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => abbreviate(n)).filter(Boolean);
        for (const n of more) if (!uniq.includes(n)) uniq.push(n);
    }
    if (uniq.length >= 7) out[gc.id] = uniq.slice(0, 7);
    else sinDatos++;
}

const body = Object.keys(out)
    .sort()
    .map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(out[k])},`)
    .join('\n');
writeFileSync(
    OUT,
    `// ARCHIVO GENERADO — no editar a mano. Corre: node scripts/gen-seven-rosters.mjs
// Los 7 con más puntos de la Primera de cada club, con el apellido recortado
// (inicial + apellido sin la última letra): no son los nombres completos.
// Los clubes que no están acá (menos de 7 con datos) usan los nombres de fábrica.

export const AR_SEVEN_ROSTERS: Record<string, string[]> = {
${body}
};
`,
);
console.log(`Clubes con plantel: ${Object.keys(out).length} · sin datos suficientes: ${sinDatos}`);
