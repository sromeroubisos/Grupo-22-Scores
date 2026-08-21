/**
 * Control del import de ARUSA: arma la tabla con lo que quedó en la base y la
 * compara contra la tabla OFICIAL que publica arusa.cl.
 *
 *   npx tsx src/scripts/arusa-verificar.ts --lev=1328550 --torneo=top-10-de-arusa
 *   npx tsx src/scripts/arusa-verificar.ts --lev=1332982 --torneo=m18-segunda-de-arusa --rama="Zona 1"
 *
 * `--rama` elige la rama de ARUSA y, con ella, la fase de G22 que se llama
 * igual. Sin él se toma la primera rama de tipo `league`. En un torneo con
 * varias fases hay que verificar de a una: mezclarlas daría una tabla que no
 * existe en ningún lado.
 *
 * Sale con código 1 si alguna fila no coincide. No escribe nada.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

import { fetchCabecera, fetchTabla } from '../lib/integrations/arusa/client.ts';
import { construirResolver, normalizarNombre } from '../lib/integrations/arusa/sync.ts';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const H = { apikey: KEY!, authorization: `Bearer ${KEY}` };

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const LEV = arg('lev');
const TORNEO = arg('torneo');
const RAMA = arg('rama') ?? arg('grupo');
if (!URL_BASE || !KEY || !LEV || !TORNEO) {
    console.error('Faltan --lev y --torneo (o las claves de .env.local).');
    process.exit(1);
}

async function leer<T>(ruta: string): Promise<T> {
    const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: H });
    if (!res.ok) throw new Error(`GET ${ruta}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
}

const clave = (s: string) => normalizarNombre(s).replace(/ /g, '');

async function main() {
    const filtro = /^[0-9a-f-]{36}$/i.test(TORNEO!) ? `id=eq.${TORNEO}` : `slug=eq.${TORNEO}`;
    const [torneo] = await leer<Array<{ id: string; name: string }>>(`tournaments?select=id,name&${filtro}`);
    if (!torneo) { console.error(`No existe el torneo "${TORNEO}".`); process.exit(1); }

    const arusa = await fetchCabecera(LEV!);
    const rama = RAMA
        ? arusa.grupos.find((g) => clave(g.nombre) === clave(RAMA))
        : arusa.grupos.find((g) => g.tipo === 'league');
    if (!rama) {
        console.error(`No existe la rama "${RAMA}". Hay: ${arusa.grupos.map((g) => g.nombre).join(' · ')}`);
        process.exit(1);
    }

    const fases = await leer<Array<{ id: string; name: string }>>(
        `tournament_phases?select=id,name,order_index&tournament_id=eq.${torneo.id}&order=order_index.asc`,
    );
    const fase = fases.find((f) => clave(f.name) === clave(rama.nombre)) ?? (fases.length === 1 ? fases[0] : undefined);
    if (!fase) {
        console.error(`La rama "${rama.nombre}" no tiene fase equivalente (hay: ${fases.map((f) => f.name).join(', ')}).`);
        process.exit(1);
    }

    const partidos = await leer<Array<{
        status: string; score: { home: number; away: number } | null;
        home_club_id: string; away_club_id: string;
        home_base_points: number; home_bonus_points: number;
        away_base_points: number; away_bonus_points: number;
    }>>(`matches?select=status,score,home_club_id,away_club_id,home_base_points,home_bonus_points,away_base_points,away_bonus_points`
        + `&tournament_id=eq.${torneo.id}&phase_id=eq.${fase.id}&limit=2000`);

    const tabla = new Map<string, { pj: number; pts: number; pf: number; pc: number }>();
    const fila = (id: string) => {
        if (!tabla.has(id)) tabla.set(id, { pj: 0, pts: 0, pf: 0, pc: 0 });
        return tabla.get(id)!;
    };
    for (const m of partidos) {
        if (m.status !== 'final' || !m.score) continue;
        const l = fila(m.home_club_id);
        const v = fila(m.away_club_id);
        l.pj += 1; v.pj += 1;
        l.pf += m.score.home; l.pc += m.score.away;
        v.pf += m.score.away; v.pc += m.score.home;
        l.pts += (m.home_base_points ?? 0) + (m.home_bonus_points ?? 0);
        v.pts += (m.away_base_points ?? 0) + (m.away_bonus_points ?? 0);
    }

    const parts = await leer<Array<{ club_id: string; name: string | null; clubs: { name: string; short_name: string | null } | null }>>(
        `tournament_participants?select=club_id,name,clubs(name,short_name)&tournament_id=eq.${torneo.id}`,
    );
    const porNombre = new Map<string, string>();
    for (const p of parts) {
        if (p.name) porNombre.set(clave(p.name), p.club_id);
        if (p.clubs?.name) porNombre.set(clave(p.clubs.name), p.club_id);
        if (p.clubs?.short_name) porNombre.set(clave(p.clubs.short_name), p.club_id);
    }

    // El MISMO resolver que el importador: por id de equipo dentro de la rama.
    // Por nombre no alcanza —ARUSA escribe "Old Boys" donde G22 tiene "Old Boys
    // R.C.", y "PWCC" donde el participante es "PWCC B"—, y la tabla oficial
    // trae el id de cada equipo, así que no hay que adivinar nada.
    const equivalencias = await leer<Array<{ external_id: string; club_id: string }>>(
        'club_external_ids?select=external_id,club_id&provider=eq.arusa&limit=4000',
    );
    const resolver = construirResolver({
        equivalencias,
        participantes: parts.map((p) => ({ club_id: p.club_id, nombre: p.clubs?.name, corto: p.clubs?.short_name })),
        ramaId: rama.id,
    });

    const oficial = await fetchTabla(rama.id);
    console.log(`${torneo.name} · ${arusa.nombre} / ${rama.nombre} → fase "${fase.name}"\n`);
    console.log('  #  equipo                 pts(G22)  pts(ARUSA)   pj   pf   pc');
    let fallas = 0;
    for (const f of oficial) {
        const id = resolver({ id: f.equipoId, nombre: f.equipo }) ?? porNombre.get(clave(f.equipo));
        // Un equipo que todavía no jugó en esta rama no tiene fila acá: la
        // tabla se arma con partidos finales. Si la oficial también lo tiene
        // todo en cero, coinciden.
        const mia = (id ? tabla.get(id) : null)
            ?? (id && !f.jugados && !f.puntos && !f.aFavor && !f.enContra ? { pj: 0, pts: 0, pf: 0, pc: 0 } : null);
        const ok = mia && mia.pts === f.puntos && mia.pj === f.jugados && mia.pf === f.aFavor && mia.pc === f.enContra;
        if (!ok) fallas += 1;
        console.log(`  ${String(f.posicion).padStart(2)} ${f.equipo.padEnd(20).slice(0, 20)} `
            + `${String(mia?.pts ?? '–').padStart(8)} ${String(f.puntos).padStart(11)} `
            + `${String(f.jugados).padStart(4)} ${String(f.aFavor).padStart(4)} ${String(f.enContra).padStart(4)}  `
            + (ok ? '' : `<-- NO COINCIDE${mia ? ` (G22 pj=${mia.pj} pf=${mia.pf} pc=${mia.pc})` : id ? '' : ' — sin club'}`));
    }
    console.log(`\n${fallas === 0 ? 'La tabla de G22 da igual que la oficial de ARUSA.' : `${fallas} filas no coinciden.`}`);
    process.exit(fallas === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
