/**
 * Mira competencias de ARUSA antes de importarlas: qué ramas traen, cuántos
 * partidos, y cuáles de esos clubes ya existen en G22.
 *
 *   npx tsx src/scripts/arusa-explorar.ts --lev=1328553
 *   npx tsx src/scripts/arusa-explorar.ts --lev=1329068,1332975,1332976
 *   npx tsx src/scripts/arusa-explorar.ts --todos
 *
 * Con `--todos` recorre las 13 competencias de la temporada 2026. Solo cuenta
 * los partidos de las ramas de tipo `league`: las de playoff se listan pero no
 * se piden, porque hoy están vacías y cada rama son ~18 requests.
 *
 * No escribe nada. Es el paso previo a `arusa-crear-torneo.ts`.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

import { fetchCabecera, fetchPartidosDeGrupo } from '../lib/integrations/arusa/client.ts';
import { ALIAS_CLUBES, normalizarNombre } from '../lib/integrations/arusa/sync.ts';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const H = { apikey: KEY!, authorization: `Bearer ${KEY}` };

/** Las 13 competencias de 2026, en el orden en que las lista arusa.cl. */
const TEMPORADA_2026 = [
    '1328550', '1328552', '1328553', '1328554',
    '1329068', '1329067',
    '1332975', '1332976', '1332977', '1332978',
    '1332982', '1332984', '1332985',
];

const LEV = process.argv.find((a) => a.startsWith('--lev='))?.slice(6);
const IDS = process.argv.includes('--todos') ? TEMPORADA_2026 : (LEV ? LEV.split(',').map((s) => s.trim()) : []);
if (!URL_BASE || !KEY || !IDS.length) {
    console.error('Falta --lev=<id[,id...]> o --todos (o las claves de .env.local)');
    process.exit(1);
}

async function leer<T>(ruta: string): Promise<T> {
    const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: H });
    if (!res.ok) throw new Error(`GET ${ruta}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
}

async function main() {
    // Clubes chilenos ya cargados: por id, por nombre y por nombre corto.
    const clubes = await leer<Array<{ id: string; name: string; short_name: string | null }>>(
        'clubs?select=id,name,short_name&country=eq.Chile&limit=500',
    );
    const porNombre = new Map<string, string>();
    for (const c of clubes) {
        porNombre.set(normalizarNombre(c.id.replace(/-/g, ' ')), c.id);
        porNombre.set(normalizarNombre(c.name), c.id);
        if (c.short_name) porNombre.set(normalizarNombre(c.short_name), c.id);
    }
    const resolver = (nombre: string) => {
        const n = normalizarNombre(nombre);
        return porNombre.get(n) ?? porNombre.get(normalizarNombre((ALIAS_CLUBES[n] ?? '').replace(/-/g, ' '))) ?? null;
    };

    const yaEnG22 = await leer<Array<{ slug: string; name: string }>>('tournaments?select=slug,name&union_id=eq.arusa');
    const faltantesGlobales = new Map<string, string[]>();

    for (const id of IDS) {
        const t = await fetchCabecera(id);
        console.log(`\n=== ${t.nombre} (${id}) · ${t.estado} · ${Object.keys(t.equipos).length} equipos`);

        for (const g of t.grupos) {
            if (g.tipo !== 'league') {
                console.log(`    ${g.nombre.padEnd(38)} [${g.tipo}] — no se cuenta`);
                continue;
            }
            const partidos = await fetchPartidosDeGrupo(g.id, t.equipos);
            const reales = partidos.filter((p) => !p.libre && !p.anulado);
            const jugados = reales.filter((p) => p.jugado);
            const fechas = jugados.map((p) => p.inicioLocal).filter(Boolean).sort();
            console.log(`    ${g.nombre.padEnd(38)} ${String(reales.length).padStart(3)} partidos · ` +
                `${String(jugados.length).padStart(3)} jugados · ${partidos.length - reales.length} libres` +
                (fechas.length ? ` · ${fechas[0]?.slice(0, 10)} → ${fechas[fechas.length - 1]?.slice(0, 10)}` : ''));
        }

        const faltan = Object.values(t.equipos).filter((n) => !resolver(n)).sort();
        if (faltan.length) {
            console.log(`    clubes sin ficha en G22 (${faltan.length}): ${faltan.join(' · ')}`);
            faltantesGlobales.set(t.nombre, faltan);
        } else {
            console.log('    todos los clubes ya existen.');
        }
    }

    console.log(`\nEn G22 hoy: ${yaEnG22.map((x) => x.slug).join(' · ')}`);
    if (faltantesGlobales.size) {
        const todos = new Set([...faltantesGlobales.values()].flat());
        console.log(`\nClubes distintos por crear en total: ${todos.size}`);
        console.log(`  ${[...todos].sort().join(' · ')}`);
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
