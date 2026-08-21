/**
 * Publica los torneos de ARUSA: los saca de borrador y los deja visibles.
 *
 *   npx tsx src/scripts/arusa-publicar.ts --plan
 *   npx tsx src/scripts/arusa-publicar.ts --execute
 *   npx tsx src/scripts/arusa-publicar.ts --torneo=top-10-de-arusa --execute
 *
 * Qué toca, y por qué las cuatro banderas:
 *   `tournaments.status = 'published'`  el feed pide exactamente eso
 *   `tournaments.is_active = true`      la RLS del anónimo filtra por acá, no
 *                                       por `is_visible`
 *   `tournament_seasons.status = 'active'` + `is_active`  es la temporada en curso
 *
 * De paso les pone fecha de inicio y fin, que salen del primer y último
 * partido cargados — hoy están en null y el gestor las muestra vacías.
 *
 * Con `--despublicar` hace el camino inverso, por si hay que bajar algo.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const H = { apikey: KEY!, authorization: `Bearer ${KEY}` };

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const EJECUTAR = process.argv.includes('--execute');
const BAJAR = process.argv.includes('--despublicar');
const SOLO = arg('torneo');
if (!URL_BASE || !KEY) { console.error('Faltan las claves de .env.local'); process.exit(1); }

async function leer<T>(ruta: string): Promise<T> {
    const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: H });
    if (!res.ok) throw new Error(`GET ${ruta}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
}

async function parchear(ruta: string, cuerpo: unknown): Promise<void> {
    const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
        method: 'PATCH',
        headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify(cuerpo),
    });
    if (!res.ok) throw new Error(`PATCH ${ruta}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function main() {
    const filtro = SOLO ? `&slug=eq.${SOLO}` : '';
    const torneos = await leer<Array<{ id: string; name: string; slug: string; status: string; is_active: boolean }>>(
        `tournaments?select=id,name,slug,status,is_active&union_id=eq.arusa${filtro}&order=name`,
    );
    if (!torneos.length) { console.error('No hay torneos de ARUSA que coincidan.'); process.exit(1); }

    const estadoTorneo = BAJAR ? 'draft' : 'published';
    const estadoTemporada = BAJAR ? 'draft' : 'active';
    console.log(`${BAJAR ? 'Bajando' : 'Publicando'} ${torneos.length} torneo(s):\n`);

    const trabajo: Array<{ id: string; slug: string; nombre: string; desde: string; inicio: string | null; fin: string | null; partidos: number }> = [];
    for (const t of torneos) {
        const partidos = await leer<Array<{ date_time: string | null }>>(
            `matches?select=date_time&tournament_id=eq.${t.id}&order=date_time.asc&limit=2000`,
        );
        const fechas = partidos.map((m) => m.date_time).filter(Boolean) as string[];
        trabajo.push({
            id: t.id, slug: t.slug, nombre: t.name,
            desde: `${t.status}/act=${t.is_active}`,
            inicio: fechas[0]?.slice(0, 10) ?? null,
            fin: fechas[fechas.length - 1]?.slice(0, 10) ?? null,
            partidos: partidos.length,
        });
        console.log(`  ${t.name.padEnd(32)} ${String(partidos.length).padStart(3)} partidos · ${t.status}/act=${t.is_active} → ${estadoTorneo}/act=${!BAJAR}`
            + (fechas.length ? ` · ${fechas[0].slice(0, 10)} → ${fechas[fechas.length - 1].slice(0, 10)}` : ''));
    }

    if (!EJECUTAR) {
        console.log('\n--plan: no se escribió nada. Repetí con --execute.');
        return;
    }

    for (const t of trabajo) {
        await parchear(`tournaments?id=eq.${t.id}`, {
            status: estadoTorneo,
            is_active: !BAJAR,
            is_visible: true,
            review_status: 'approved',
        });
        await parchear(`tournament_seasons?tournament_id=eq.${t.id}`, {
            status: estadoTemporada,
            is_active: !BAJAR,
            ...(t.inicio && { start_date: t.inicio }),
            ...(t.fin && { end_date: t.fin }),
        });
    }
    console.log(`\nListo: ${trabajo.length} torneo(s) ${BAJAR ? 'en borrador' : 'publicados'}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
