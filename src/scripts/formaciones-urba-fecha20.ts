/**
 * Carga en lote las formaciones de una fecha de un torneo LOCAL (las que viven
 * en `matches.lineups`), desde un JSON con un objeto por partido.
 *
 *   TS_NODE_TRANSPILE_ONLY=true \
 *   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","noEmit":false}' \
 *   node -r ts-node/register -r tsconfig-paths/register \
 *     src/scripts/formaciones-urba-fecha20.ts src/scripts/formaciones/<archivo>.json --plan
 *
 * Pasa por `persistMatchCenterSupplementalData`, la misma funcion que usa
 * `PATCH /api/admin/matches/[id]`: ella resuelve cada nombre contra `people`,
 * crea la ficha que falta y escribe `club_person_roles` y `squad_members`. Un
 * INSERT crudo del jsonb dejaria a los jugadores sin `id` y sin ficha.
 *
 * Los contadores `lineup_home_count` / `lineup_away_count` NO se actualizan
 * solos —no hay trigger, y el servicio tampoco los toca—, asi que se escriben
 * en el mismo paso: sin eso la pestana de alineaciones queda apagada aunque el
 * jsonb tenga los 15. Un lado sin datos (formacion "a confirmar") no entra en
 * el update: se deja su contador como esta.
 *
 * Ver [[cargar-formaciones-por-script]]. Para un partido EXTERNO el camino es
 * otro: `formaciones-partido-externo.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

// Cargar el entorno ANTES de importar nada que arme el cliente de Supabase.
const envFile = path.join(REPO, '.env.local');
if (fs.existsSync(envFile)) {
  for (const linea of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

// `server-only` y `client-only` son centinelas que resuelve el bundler de Next:
// fuera de `next build` no existen en node_modules y cortan la cadena de imports
// (matchCenterService -> externalTournamentOverrides -> supabase/server). Acá no
// hay bundler, asi que se resuelven a un modulo vacio.
{
  const Module = require('node:module') as typeof import('node:module') & {
    _load: (request: string, ...rest: unknown[]) => unknown;
  };
  const cargar = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === 'server-only' || request === 'client-only') return {};
    return cargar.call(this, request, ...rest);
  };
}

/** El numero de camiseta es el puesto. 16 en adelante entra desde el banco. */
const PUESTO_POR_NUMERO: Record<number, string> = {
  1: 'Pilar', 2: 'Hooker', 3: 'Pilar',
  4: 'Segunda línea', 5: 'Segunda línea',
  6: 'Tercera línea', 7: 'Tercera línea', 8: 'Tercera línea',
  9: 'Medio scrum', 10: 'Apertura',
  11: 'Wing', 12: 'Centro', 13: 'Centro', 14: 'Wing', 15: 'Fullback',
};

/**
 * `id` es la ficha de `people` a reusar. Hace falta porque el matcher del servicio
 * no pliega tildes: "Tomas Gahan" y "Tomás Gahan" terminan en dos fichas. Ver
 * [[fichas-duplicadas-por-tilde]]. Sin `id`, el servicio busca por nombre o crea.
 */
type JugadorJson = { numero: number; nombre: string; id?: string; capitan?: boolean; puesto?: string };
type LadoJson = { nombre?: string; sinDatos?: boolean; titulares: JugadorJson[]; suplentes?: JugadorJson[] };
type PartidoJson = { id: string; rotulo: string; local: LadoJson; visitante: LadoJson };
type Datos = { descripcion?: string; torneo?: string; partidos: PartidoJson[] };

function armarLado(lado: LadoJson) {
  const uno = (j: JugadorJson, role: 'starter' | 'substitute') => ({
    id: j.id ?? null,
    number: j.numero,
    name: j.nombre,
    position: j.puesto ?? PUESTO_POR_NUMERO[j.numero] ?? null,
    role,
    rating: null,
    isCaptain: Boolean(j.capitan),
  });
  return [
    ...lado.titulares.map((j) => uno(j, 'starter')),
    ...(lado.suplentes ?? []).map((j) => uno(j, 'substitute')),
  ];
}

async function main() {
  const argumentos = process.argv.slice(2);
  const archivo = argumentos.find((a) => !a.startsWith('--'));
  const modo = argumentos.includes('--execute') ? 'execute' : argumentos.includes('--plan') ? 'plan' : null;

  if (!archivo || !modo) {
    console.error('uso: formaciones-urba-fecha20.ts <datos.json> --plan|--execute');
    process.exit(2);
  }

  const datos = JSON.parse(fs.readFileSync(path.resolve(REPO, archivo), 'utf8')) as Datos;
  console.log(datos.descripcion ?? '');

  for (const partido of datos.partidos) {
    const lineups = { home: armarLado(partido.local), away: armarLado(partido.visitante) };
    console.log(`\n${partido.rotulo}  ·  ${partido.id}`);
    for (const [rotulo, lado, jugadores] of [
      ['local    ', partido.local, lineups.home],
      ['visitante', partido.visitante, lineups.away],
    ] as const) {
      if (lado.sinDatos) {
        console.log(`  ${rotulo} · ${lado.nombre ?? '—'} · sin datos publicados (no se toca)`);
        continue;
      }
      console.log(`  ${rotulo} · ${lado.nombre ?? '—'} · ${jugadores.length} jugadores`);
    }
  }

  if (modo === 'plan') {
    console.log('\n(plan: no se escribió nada)');
    return;
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { persistMatchCenterSupplementalData } = await import('@/lib/services/matchCenterService');
  const db = createAdminClient();

  for (const partido of datos.partidos) {
    const lineups = { home: armarLado(partido.local), away: armarLado(partido.visitante) };
    const guardado = await persistMatchCenterSupplementalData(db as never, partido.id, { lineups });

    // Los contadores no los escribe el servicio: van a mano, y solo del lado
    // que efectivamente trajo formacion.
    const contadores: Record<string, number> = {};
    if (!partido.local.sinDatos) contadores.lineup_home_count = lineups.home.length;
    if (!partido.visitante.sinDatos) contadores.lineup_away_count = lineups.away.length;
    if (Object.keys(contadores).length > 0) {
      const { error } = await db.from('matches').update(contadores).eq('id', partido.id);
      if (error) throw new Error(`contadores de ${partido.rotulo}: ${error.message}`);
    }

    const resultado = guardado as { lineups?: { home?: unknown[]; away?: unknown[] } };
    console.log(
      `guardado · ${partido.rotulo} · ${resultado.lineups?.home?.length ?? 0} local · ${resultado.lineups?.away?.length ?? 0} visitante`
    );
  }

  console.log(`\nlisto · ${datos.partidos.length} partidos`);
}

main().catch((err) => { console.error(err); process.exit(1); });
