/**
 * Pone la categoría en el NOMBRE de cada ficha filial de ARUSA.
 *
 *   npx tsx src/scripts/arusa-nombres-filiales.ts --plan
 *   npx tsx src/scripts/arusa-nombres-filiales.ts --execute
 *
 * ARUSA llama "PWCC" al equipo de Primera, al de Intermedia, al de Cuarta y a
 * los cuatro juveniles. Si la ficha se queda con ese nombre, el buscador
 * muestra ocho "PWCC" indistinguibles. La URBA ya resolvió esto hace rato
 * —"Albatros Intermedia", "San Andrés M19", "Asoc. Alumni M17 «A»"— y esto
 * lleva las fichas chilenas a la misma convención.
 *
 * La categoría sale de `club_external_ids.categoria`, que es donde
 * `arusa-crear-torneo.ts` guarda el sufijo con el que nació cada filial. El
 * club madre no tiene sufijo y no se toca.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

import { nombreDeFilial } from '../lib/integrations/arusa/sync.ts';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const H = { apikey: KEY!, authorization: `Bearer ${KEY}` };
const EJECUTAR = process.argv.includes('--execute');
if (!URL_BASE || !KEY) { console.error('Faltan las claves de .env.local'); process.exit(1); }

async function leer<T>(ruta: string): Promise<T> {
    const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: H });
    if (!res.ok) throw new Error(`GET ${ruta}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
}

async function main() {
    const equivalencias = await leer<Array<{ external_id: string; club_id: string; categoria: string | null }>>(
        'club_external_ids?select=external_id,club_id,categoria&provider=eq.arusa&limit=4000',
    );
    // El sufijo por club: el mismo club puede aparecer en varias ramas de la
    // misma categoría (las zonas), pero siempre con el mismo sufijo.
    const sufijoPorClub = new Map<string, string>();
    for (const e of equivalencias) {
        if (!e.external_id.startsWith('equipo:') || !e.categoria) continue;
        sufijoPorClub.set(e.club_id, e.categoria);
    }

    const clubes = await leer<Array<{ id: string; name: string; short_name: string | null }>>(
        'clubs?select=id,name,short_name&union_id=eq.arusa&limit=500',
    );

    const cambios: Array<{ id: string; de: string; a: string }> = [];
    for (const c of clubes) {
        const sufijo = sufijoPorClub.get(c.id);
        // `categoria` guarda la RAMA para los primeros equipos ("Titulares") y
        // el SUFIJO para las filiales. Lo que decide es el id: una filial
        // termina en su sufijo, un club madre no.
        // El sufijo no siempre está al final: `old-boys-r-c-m18-azul` lleva
        // después el distintivo que separa a los dos equipos del club.
        if (!sufijo || !(c.id.endsWith(`-${sufijo}`) || c.id.includes(`-${sufijo}-`))) continue;
        const nuevo = nombreDeFilial(c.name, sufijo);
        if (nuevo !== c.name) cambios.push({ id: c.id, de: c.name, a: nuevo });
    }

    console.log(`Fichas filiales: ${cambios.length} a renombrar\n`);
    for (const c of cambios) console.log(`  ${c.id.padEnd(30)} "${c.de}" → "${c.a}"`);

    if (!EJECUTAR) {
        console.log('\n--plan: no se escribió nada. Repetí con --execute.');
        return;
    }
    for (const c of cambios) {
        const res = await fetch(`${URL_BASE}/rest/v1/clubs?id=eq.${c.id}`, {
            method: 'PATCH',
            headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
            body: JSON.stringify({ name: c.a, short_name: c.a }),
        });
        if (!res.ok) throw new Error(`PATCH clubs ${c.id}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    console.log(`\nListo: ${cambios.length} fichas renombradas.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
