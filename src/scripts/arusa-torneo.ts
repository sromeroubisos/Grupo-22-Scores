/**
 * Sincroniza a mano un torneo de ARUSA (arusa.cl → Leverade) contra un torneo
 * que ya existe en G22:
 *
 *   npx tsx src/scripts/arusa-torneo.ts --lev=1328550 --torneo=top-10-de-arusa --plan
 *   npx tsx src/scripts/arusa-torneo.ts --lev=1328550 --torneo=top-10-de-arusa --execute
 *
 * `--lev` es el id de `arusa.cl/es/tournament/{id}/summary`. En 2026:
 *   1328550 Primera · 1328552 Segunda · 1328553 Tercera · 1328554 Cuarta
 *   1329068 Femenino XV · 1329067 Masters M+35
 *   1332975/76/77/78 M18/M16/M14/M13 Primera · 1332982/84/85 M18/M16/M14 Segunda
 *
 * `--ramas` elige qué ramas de la competencia entran, separadas por coma. Sin
 * él entran TODAS las de tipo `league`: en Primera eso incluiría Intermedia y
 * Pre-Intermedia, y en los juveniles de Segunda las zonas y la segunda rueda.
 * Cada rama va a su propia fase del torneo, emparejada por nombre.
 *
 * Para la corrida periódica está `/api/cron/arusa-sync`, que además rehace la
 * tabla de posiciones. Este script NO la rehace: después de un `--execute`
 * corré `npx tsx src/scripts/arusa-recalcular.ts --torneo=…`.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

import { fetchCabecera, fetchPartidosDeGrupo } from '../lib/integrations/arusa/client.ts';
import {
    construirResolver,
    normalizarNombre,
    planArusaMatches,
    type PartidoExistente,
} from '../lib/integrations/arusa/sync.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

function arg(nombre: string): string | null {
    const prefijo = `--${nombre}=`;
    const encontrado = process.argv.find((a) => a.startsWith(prefijo));
    return encontrado ? encontrado.slice(prefijo.length) : null;
}

const EJECUTAR = process.argv.includes('--execute');
const LEV = arg('lev');
const TORNEO = arg('torneo');
const RAMAS = arg('ramas')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;

if (!LEV || !TORNEO) {
    console.error('Faltan --lev=<id de arusa.cl> y --torneo=<slug o uuid del torneo en la base>');
    process.exit(1);
}

const CAMPOS = 'id,date_time,venue,status,score,home_club_id,away_club_id,home_base_points,'
    + 'home_bonus_points,away_base_points,away_bonus_points,points_autocalculated,points_override_reason,'
    + 'round_label,external_id,phase_id,season_id';

async function leer<T>(ruta: string): Promise<T> {
    const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: H });
    const texto = await res.text();
    if (!res.ok) throw new Error(`GET ${ruta}: ${res.status} ${texto.slice(0, 300)}`);
    return JSON.parse(texto) as T;
}

async function escribir(metodo: 'POST' | 'PATCH', ruta: string, cuerpo: unknown): Promise<void> {
    const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
        method: metodo,
        headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify(cuerpo),
    });
    if (!res.ok) throw new Error(`${metodo} ${ruta}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function main() {
    const filtro = /^[0-9a-f-]{36}$/i.test(TORNEO!) ? `id=eq.${TORNEO}` : `slug=eq.${TORNEO}`;
    const torneos = await leer<Array<{ id: string; name: string; current_season_id: string | null }>>(
        `tournaments?select=id,name,current_season_id&${filtro}`,
    );
    if (torneos.length !== 1) {
        console.error(`El torneo "${TORNEO}" no existe o está repetido (${torneos.length} filas).`);
        process.exit(1);
    }
    const torneoId = torneos[0].id;

    const participantes = await leer<Array<{ club_id: string; clubs: { name: string; short_name: string | null } | null }>>(
        `tournament_participants?select=club_id,clubs(name,short_name)&tournament_id=eq.${torneoId}`,
    );
    const equivalencias = await leer<Array<{ external_id: string; club_id: string }>>(
        'club_external_ids?select=external_id,club_id&provider=eq.arusa&limit=2000',
    );
    const paraResolver = participantes.map((p) => ({ club_id: p.club_id, nombre: p.clubs?.name, corto: p.clubs?.short_name }));

    const cabecera = await fetchCabecera(LEV!);
    const ligas = cabecera.grupos.filter((g) => g.tipo === 'league');
    const clave = (s: string) => normalizarNombre(s).replace(/ /g, '');
    const elegidas = RAMAS
        ? ligas.filter((g) => RAMAS.some((r) => clave(r) === clave(g.nombre)))
        : ligas;
    if (!elegidas.length) {
        console.error(`Ninguna rama coincide. La competencia tiene: ${cabecera.grupos.map((g) => `${g.nombre} [${g.tipo}]`).join(' · ')}`);
        process.exit(1);
    }

    const fases = await leer<Array<{ id: string; name: string; season_id: string | null; order_index: number }>>(
        `tournament_phases?select=id,name,season_id,order_index&tournament_id=eq.${torneoId}&order=order_index.asc`,
    );
    const enBase = await leer<Array<PartidoExistente & { phase_id: string | null; season_id: string | null }>>(
        `matches?select=${CAMPOS}&tournament_id=eq.${torneoId}&limit=2000`,
    );

    console.log(`ARUSA  ${cabecera.nombre} · ${elegidas.length} rama(s): ${elegidas.map((g) => g.nombre).join(' · ')}`);
    console.log(`G22    ${torneos[0].name} · ${fases.length} fase(s) · ${enBase.length} partidos\n`);

    const parches: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const altas: Array<Record<string, unknown>> = [];

    for (const rama of elegidas) {
        // La fase se empareja por nombre; si el torneo tiene una sola fase y se
        // pidió una sola rama, es esa (los torneos viejos tienen la fase
        // "Regular Season" y la rama se llama "Titulares").
        const fase = fases.find((f) => clave(f.name) === clave(rama.nombre))
            ?? (fases.length === 1 && elegidas.length === 1 ? fases[0] : undefined);
        if (!fase) {
            console.error(`  ! "${rama.nombre}" no tiene fase equivalente en G22 (hay: ${fases.map((f) => f.name).join(', ')}). Se saltea.`);
            continue;
        }

        const partidos = await fetchPartidosDeGrupo(rama.id, cabecera.equipos);
        const reales = partidos.filter((p) => !p.libre && !p.anulado);
        const deLaFase = enBase.filter((m) => m.phase_id === fase.id);

        const plan = planArusaMatches({
            partidos,
            existentes: deLaFase,
            resolverClub: construirResolver({ equivalencias, participantes: paraResolver, ramaId: rama.id }),
            plantillaDeAlta: {
                tournament_id: torneoId,
                phase_id: fase.id,
                season_id: fase.season_id ?? torneos[0].current_season_id ?? null,
                sport_id: 'rugby',
                sport: 'rugby',
                is_visible: true,
                review_status: 'approved',
            },
            nuevoId: randomUUID,
        });

        const nuevos = plan.actualizar.filter((c) => c.cambios.some((x) => x.startsWith('estado')) && c.patch.status === 'final');
        const corregidos = plan.actualizar.filter((c) => c.cambios.some((x) => x.startsWith('marcador')) && !nuevos.includes(c));

        console.log(`  ${rama.nombre} → fase "${fase.name}"`);
        console.log(`    fuente ${reales.length} partidos (${reales.filter((p) => p.jugado).length} jugados) · base ${deLaFase.length}`);
        console.log(`    altas ${plan.crear.length} · a tocar ${plan.actualizar.length} · al día ${plan.sinCambios}` +
            (plan.localiaCorregida ? ` · localía corregida ${plan.localiaCorregida}` : '') +
            (plan.huerfanos.length ? ` · sin par en ARUSA ${plan.huerfanos.length}` : ''));
        for (const c of nuevos) {
            const s = c.patch.score as { home: number; away: number };
            console.log(`      + ${c.rotulo} → ${s.home}-${s.away}`);
        }
        for (const c of corregidos) console.log(`      ! ${c.rotulo} · ${c.cambios.find((x) => x.startsWith('marcador'))}`);
        if (plan.clubesSinMapa.length) {
            console.log(`    equipos sin club en G22 (${plan.clubesSinMapa.length}) — sus partidos NO entran:`);
            plan.clubesSinMapa.forEach((n) => console.log(`      ! ${n}`));
        }

        parches.push(...plan.actualizar.map((c) => ({ id: c.id, patch: c.patch })));
        altas.push(...plan.crear);
    }

    console.log(`\nTotal: ${parches.length} a actualizar · ${altas.length} a crear`);

    if (!EJECUTAR) {
        console.log('--plan: no se escribió nada. Repetí con --execute.');
        return;
    }

    for (const c of parches) await escribir('PATCH', `matches?id=eq.${c.id}`, c.patch);
    for (let i = 0; i < altas.length; i += 100) await escribir('POST', 'matches', altas.slice(i, i + 100));
    console.log(`Listo: ${parches.length} actualizados` + (altas.length ? ` y ${altas.length} creados` : '') + '.');
    console.log(`Acordate de rehacer la tabla: npx tsx src/scripts/arusa-recalcular.ts --torneo=${TORNEO}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
