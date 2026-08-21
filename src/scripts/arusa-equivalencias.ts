/**
 * Escribe el mapa equipo→club de ARUSA en `club_external_ids`, para las
 * competencias que ya están cargadas en G22.
 *
 *   npx tsx src/scripts/arusa-equivalencias.ts --plan
 *   npx tsx src/scripts/arusa-equivalencias.ts --execute
 *
 * Por qué hace falta: el nombre no alcanza para saber qué club es un equipo.
 * "PWCC" es el primer equipo en Primera y el B en Cuarta; "Old Boys" son tres
 * fichas distintas según la categoría. Leverade sí lo distingue — da un `team`
 * por inscripción — y el `club` del que cuelga dice cuál es la institución.
 *
 * Deja dos clases de fila, las dos con `provider = 'arusa'`:
 *   `equipo:{teamId}` → el club de G22 que juega como ese equipo
 *   `club:{clubId}`   → el club MADRE de G22 de esa institución
 *
 * La segunda es la que después permite dar de alta filiales: para saber que la
 * M18 de "Old Boys Azul" cuelga de `old-boys-r-c` hay que poder ir del club de
 * Leverade al de G22.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

import { fetchCabecera } from '../lib/integrations/arusa/client.ts';
import { CLAVE_CLUB, CLAVE_EQUIPO, construirResolver } from '../lib/integrations/arusa/sync.ts';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const H = { apikey: KEY!, authorization: `Bearer ${KEY}` };
const EJECUTAR = process.argv.includes('--execute');
if (!URL_BASE || !KEY) { console.error('Faltan las claves de .env.local'); process.exit(1); }

/** Las competencias ya cargadas, con la rama que se importó a cada torneo. */
const CARGADAS: { lev: string; slug: string; rama: string }[] = [
    { lev: '1328550', slug: 'top-10-de-arusa', rama: 'Titulares' },
    { lev: '1328552', slug: 'segunda-division-de-arusa', rama: 'Titulares' },
    { lev: '1328553', slug: 'tercera-division-de-arusa', rama: 'Titulares' },
    { lev: '1328554', slug: 'cuarta-division-de-arusa', rama: 'Fase Regular' },
];

/**
 * Equipos que NO son el primer equipo de su club, con el id que les toca.
 * En Cuarta juegan los segundos equipos de PWCC (Primera) y Gauchos (Segunda):
 * el 81-0 a Escuela Militar no puede quedar en la ficha del PWCC que pelea el
 * Top 10. La llave es la competencia y el nombre tal cual lo escribe ARUSA.
 */
const SEGUNDOS_EQUIPOS: Record<string, { club: string; nombre: string; madre: string }> = {
    '1328554|PWCC': { club: 'pwcc-b', nombre: 'PWCC B', madre: 'pwcc' },
    '1328554|Gauchos RC': { club: 'gauchos-rc-b', nombre: 'Gauchos RC B', madre: 'gauchos-rc' },
};

async function leer<T>(ruta: string): Promise<T> {
    const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: H });
    if (!res.ok) throw new Error(`GET ${ruta}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
}

async function escribir(ruta: string, filas: unknown[], resolucion = 'merge-duplicates'): Promise<void> {
    if (!filas.length) return;
    const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
        method: 'POST',
        headers: { ...H, 'content-type': 'application/json', prefer: `return=minimal,resolution=${resolucion}` },
        body: JSON.stringify(filas),
    });
    if (!res.ok) throw new Error(`POST ${ruta}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function main() {
    const filas: Array<{ provider: string; external_id: string; club_id: string; categoria: string | null }> = [];
    const madres = new Map<string, string>();   // club de Leverade → club madre de G22
    const sinResolver: string[] = [];

    for (const c of CARGADAS) {
        const cabecera = await fetchCabecera(c.lev);
        const torneos = await leer<Array<{ id: string; name: string }>>(`tournaments?select=id,name&slug=eq.${c.slug}`);
        if (!torneos.length) { console.error(`  ! ${c.slug}: no existe en la base`); continue; }
        const participantes = await leer<Array<{ club_id: string; clubs: { name: string; short_name: string | null } | null }>>(
            `tournament_participants?select=club_id,clubs(name,short_name)&tournament_id=eq.${torneos[0].id}`,
        );
        const resolver = construirResolver({
            equivalencias: [],
            participantes: participantes.map((p) => ({ club_id: p.club_id, nombre: p.clubs?.name, corto: p.clubs?.short_name })),
        });

        console.log(`\n${cabecera.nombre} · ${Object.keys(cabecera.equipos).length} equipos`);
        for (const [teamId, nombre] of Object.entries(cabecera.equipos)) {
            const segundo = SEGUNDOS_EQUIPOS[`${c.lev}|${nombre}`];
            const clubId = segundo?.club ?? resolver({ id: teamId, nombre });
            if (!clubId) { sinResolver.push(`${cabecera.nombre}: ${nombre} (equipo ${teamId})`); continue; }

            filas.push({ provider: 'arusa', external_id: CLAVE_EQUIPO(teamId), club_id: clubId, categoria: c.rama });

            // El club MADRE: el segundo equipo cuelga del mismo club de
            // Leverade que el primero, así que no puede pisar la fila del padre.
            const clubLev = cabecera.clubes[teamId];
            const madre = segundo?.madre ?? clubId;
            if (clubLev && !madres.has(clubLev)) madres.set(clubLev, madre);

            console.log(`  ${segundo ? '↳' : '·'} ${nombre.padEnd(22)} → ${clubId}${segundo ? `  (madre ${segundo.madre})` : ''}`);
        }
    }

    for (const [clubLev, g22] of madres) {
        filas.push({ provider: 'arusa', external_id: CLAVE_CLUB(clubLev), club_id: g22, categoria: null });
    }

    console.log(`\nFilas a escribir: ${filas.length} (${filas.filter((f) => f.external_id.startsWith('equipo:')).length} equipos · ${madres.size} clubes madre)`);
    if (sinResolver.length) {
        console.log(`Sin resolver (${sinResolver.length}):`);
        sinResolver.forEach((s) => console.log(`  ! ${s}`));
    }

    if (!EJECUTAR) {
        console.log('\n--plan: no se escribió nada. Repetí con --execute.');
        return;
    }

    // Los segundos equipos necesitan su ficha y que el participante del torneo
    // apunte a ella: si no, la tabla de Cuarta la juega el club de Primera.
    for (const clave of Object.keys(SEGUNDOS_EQUIPOS)) {
        const { club, nombre, madre } = SEGUNDOS_EQUIPOS[clave];
        const lev = clave.split('|')[0];
        const slug = CARGADAS.find((c) => c.lev === lev)?.slug;
        if (!slug) continue;

        const existe = await leer<Array<{ id: string }>>(`clubs?select=id&id=eq.${club}`);
        if (!existe.length) {
            const [padre] = await leer<Array<{ logo_url: string | null; primary_color: string | null; city: string | null; region: string | null }>>(
                `clubs?select=logo_url,primary_color,city,region&id=eq.${madre}`,
            );
            await escribir('clubs', [{
                id: club, slug: club, name: nombre, short_name: nombre,
                union_id: 'arusa', city: padre?.city ?? 'Santiago de Chile', region: padre?.region ?? 'Santiago de Chile',
                country: 'Chile', sport: 'rugby', sport_id: 'rugby', entity_type: 'club',
                status: 'active', visibility: 'visible', is_visible: true,
                logo_url: padre?.logo_url ?? null, primary_color: padre?.primary_color ?? null,
            }]);
            console.log(`  + club ${club} (escudo heredado de ${madre})`);
        }

        const [torneo] = await leer<Array<{ id: string }>>(`tournaments?select=id&slug=eq.${slug}`);
        for (const tabla of ['tournament_participants', 'team_season_entries']) {
            const res = await fetch(
                `${URL_BASE}/rest/v1/${tabla}?tournament_id=eq.${torneo.id}&club_id=eq.${madre}`,
                { method: 'PATCH', headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
                  body: JSON.stringify(tabla === 'tournament_participants' ? { club_id: club, name: nombre, short_code: nombre } : { club_id: club }) },
            );
            if (!res.ok) throw new Error(`PATCH ${tabla}: ${res.status} ${(await res.text()).slice(0, 200)}`);
        }
        // Y los partidos ya cargados: si no, el planificador no reconoce el par
        // de clubes, da por huérfano lo que hay y crea 30 duplicados.
        let movidos = 0;
        for (const lado of ['home_club_id', 'away_club_id']) {
            const res = await fetch(
                `${URL_BASE}/rest/v1/matches?tournament_id=eq.${torneo.id}&${lado}=eq.${madre}`,
                { method: 'PATCH', headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' },
                  body: JSON.stringify({ [lado]: club }) },
            );
            if (!res.ok) throw new Error(`PATCH matches.${lado}: ${res.status} ${(await res.text()).slice(0, 200)}`);
            movidos += ((await res.json()) as unknown[]).length;
        }
        console.log(`  ↻ ${slug}: ${madre} pasó a ser ${club} · ${movidos} partidos repuntados`);
    }

    await escribir('club_external_ids', filas);
    console.log('\nListo. Ahora repasá los partidos del torneo que cambió de participante:');
    console.log('  npx tsx src/scripts/arusa-torneo.ts --lev=1328554 --torneo=cuarta-division-de-arusa --ramas="Fase Regular" --execute');
    console.log('  npx tsx src/scripts/arusa-recalcular.ts --torneo=cuarta-division-de-arusa');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
