/**
 * Carga la formación de un partido EXTERNO (FlashScore / ESPN) desde un JSON.
 *
 *   TS_NODE_TRANSPILE_ONLY=true \
 *   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","noEmit":false}' \
 *   node -r ts-node/register -r tsconfig-paths/register \
 *     src/scripts/formaciones-partido-externo.ts src/scripts/formaciones/<archivo>.json --plan
 *
 * Un partido externo NO vive en `matches`: lo sirve el proveedor y lo único
 * nuestro que se le puede colgar es el override de
 * `external_match_lineup_overrides` (hoy, sin esa migración aplicada, cae solo
 * en `external_tournament_standings_overrides`). Por eso acá NO se toca
 * `matches.lineups` ni se crean fichas en `people`: no hay partido local al que
 * engancharlas. Ver [[cargar-formaciones-por-script]] para el otro camino.
 *
 * El JSON trae nombre, número, capitán y nada más. El PUESTO no es dato del
 * partido —en rugby el número lo dice— así que sale de la tabla de abajo, con
 * los rótulos de `features/career/data/positions.ts` para que la ficha del
 * juego y la del partido nombren el puesto igual.
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

/** El número de camiseta es el puesto. 16 en adelante entra desde el banco. */
const PUESTO_POR_NUMERO: Record<number, string> = {
  1: 'Pilar', 2: 'Hooker', 3: 'Pilar',
  4: 'Segunda línea', 5: 'Segunda línea',
  6: 'Tercera línea', 7: 'Tercera línea', 8: 'Tercera línea',
  9: 'Medio scrum', 10: 'Apertura',
  11: 'Wing', 12: 'Centro', 13: 'Centro', 14: 'Wing', 15: 'Fullback',
};

type JugadorJson = { numero: number; nombre: string; capitan?: boolean; puesto?: string };
type LadoJson = { nombre?: string; titulares: JugadorJson[]; suplentes?: JugadorJson[] };
type Datos = { partido: string; proveedor?: string; descripcion?: string; local: LadoJson; visitante: LadoJson };

function armarLado(lado: LadoJson) {
  const uno = (j: JugadorJson, role: 'starter' | 'substitute') => ({
    id: null,
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
  const actor = (argumentos.find((a) => a.startsWith('--actor='))?.split('=')[1] ?? '').trim();

  if (!archivo || !modo) {
    console.error('uso: formaciones-partido-externo.ts <datos.json> --plan|--execute [--actor=<uuid>]');
    process.exit(2);
  }

  const datos = JSON.parse(fs.readFileSync(path.resolve(REPO, archivo), 'utf8')) as Datos;
  const lineups = { home: armarLado(datos.local), away: armarLado(datos.visitante) };

  console.log(`${datos.descripcion ?? datos.partido}`);
  for (const [lado, nombre, jugadores] of [
    ['local', datos.local.nombre, lineups.home],
    ['visitante', datos.visitante.nombre, lineups.away],
  ] as const) {
    const titulares = jugadores.filter((j) => j.role === 'starter');
    const banco = jugadores.filter((j) => j.role === 'substitute');
    console.log(`\n  ${lado} · ${nombre ?? '—'} · ${titulares.length} titulares + ${banco.length} suplentes`);
    for (const j of jugadores) {
      console.log(`    ${String(j.number).padStart(2)} ${j.name}${j.isCaptain ? ' (c)' : ''}${j.position ? ` — ${j.position}` : ''}`);
    }
  }

  if (modo === 'plan') {
    console.log('\n(plan: no se escribió nada)');
    return;
  }

  const { upsertExternalMatchLineupOverride } = await import('@/lib/server/externalMatchLineupOverrides');
  const guardado = await upsertExternalMatchLineupOverride({
    matchId: datos.partido,
    provider: datos.proveedor ?? 'flashscore',
    lineups,
    ratedBy: actor || 'script:formaciones-partido-externo',
  });

  console.log(`\nguardado · ${guardado.lineups.home.length} local · ${guardado.lineups.away.length} visitante · ${guardado.rated_at}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
