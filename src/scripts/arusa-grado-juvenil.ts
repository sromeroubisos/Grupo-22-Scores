/**
 * Le pone el grado de edad real a los torneos juveniles de ARUSA.
 *
 *   npx tsx src/scripts/arusa-grado-juvenil.ts --plan
 *   npx tsx src/scripts/arusa-grado-juvenil.ts --execute
 *
 * Los quince torneos de ARUSA nacieron con el `age_grade` del torneo modelo
 * —el Top 10, o sea `Mayores`— porque el alta lo copiaba tal cual. Para las
 * ocho competencias de mayores da igual; para las siete juveniles no:
 * `resolveTournamentAudience` mira el grado ANTES que el nombre, así que la M18
 * caía en la portada de mayores aunque se llame "M18 Primera de ARUSA".
 *
 * El valor sale de `gradoDeEdadArusa`, la misma función que usa el alta desde
 * ahora. Si acá se calculara aparte, el torneo que entre mañana quedaría
 * clasificado distinto que estos siete, en silencio.
 *
 * No toca nada más: la audiencia se resuelve sola con el grado, y `category` y
 * `subcategory` de ARUSA están en null a propósito —no hay grados dentro de una
 * misma división, cada rama es una fase.
 */
import fs from 'node:fs';
import path from 'node:path';

import { gradoDeEdadArusa } from '../lib/integrations/arusa/sync.ts';

const REPO = process.cwd();
const modo = process.argv.includes('--execute') ? 'execute'
    : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const env: Record<string, string> = { ...process.env as Record<string, string> };
const envFile = path.join(REPO, '.env.local');
if (fs.existsSync(envFile)) {
    for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales de Supabase');
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };

interface Torneo { id: string; name: string; age_grade: string | null }

async function main() {
    const res = await fetch(
        `${URL_BASE}/rest/v1/tournaments?select=id,name,age_grade&name=ilike.*de%20ARUSA&order=name`,
        { headers: H },
    );
    if (!res.ok) throw new Error(`tournaments: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const torneos = await res.json() as Torneo[];

    const cambios = torneos
        .map((t) => ({ ...t, grado: gradoDeEdadArusa(t.name) }))
        .filter((t) => t.grado && t.grado !== t.age_grade);

    console.log(`torneos de ARUSA ${torneos.length} · a corregir ${cambios.length}\n`);
    for (const t of torneos) {
        const grado = gradoDeEdadArusa(t.name);
        const destino = grado ?? t.age_grade;
        const marca = grado && grado !== t.age_grade ? '→' : ' ';
        console.log(`  ${marca} ${String(t.age_grade).padEnd(8)} ${marca === '→' ? destino : ''}`.padEnd(24) + t.name);
    }

    if (modo === 'plan') { console.log('\n(plan: no se escribió nada)'); return; }
    if (!cambios.length) { console.log('\nnada que hacer'); return; }

    for (const t of cambios) {
        const r = await fetch(`${URL_BASE}/rest/v1/tournaments?id=eq.${t.id}`, {
            method: 'PATCH', headers: { ...H, prefer: 'return=minimal' },
            body: JSON.stringify({ age_grade: t.grado }),
        });
        if (!r.ok) throw new Error(`${t.name}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
        console.log(`  ok  ${t.name} → ${t.grado}`);
    }
    console.log(`\n${cambios.length} torneos corregidos`);
}

main().catch((err) => { console.error(err); process.exit(1); });
