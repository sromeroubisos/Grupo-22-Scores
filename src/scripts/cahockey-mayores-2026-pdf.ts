/**
 * Campeonato Argentino de Seleccionados Mayores 2026 (Córdoba, 14 al 18 de
 * octubre) cargado desde el fixture en PDF, antes de que la CAH lo suba:
 *
 *   npx tsx src/scripts/cahockey-mayores-2026-pdf.ts            plan
 *   npx tsx src/scripts/cahockey-mayores-2026-pdf.ts --execute  escribe
 *
 * Fuente: fedhockeycba.com.ar/wp-content/uploads/2026/10/2026-FIXTURE-CAMPEONATO-
 * ARGENTINO-DE-SELECCIONADOS-MAYORES-DAMAS-Y-CABALLEROS-2026-CORDOBA_DEL-14-AL-18-10-2026.pdf
 * (transcripto a mano: el PDF es una planilla y su texto sale desordenado).
 *
 * Un torneo por rama, como el Sub 19 Caballeros (1589): cuatro zonas en una
 * fase de grupos —A y B son el Campeonato, C y D el Ascenso— porque el fixture
 * numera los partidos por rama y cruza las dos divisiones en la reubicación.
 *
 * Entran sólo los 48 partidos de zona. Sábado y domingo son cruces ("3° C vs
 * 4° D", "Gan. Part. 27"): no son equipos, y el cron de la CAH los da de alta
 * cuando SICAH los define. Para eso el torneo nace con external_id
 * `cahockey-pendiente:mayores:<rama>` y el cron lo vincula solo apenas la CAH
 * lo publica (ver `src/lib/integrations/cahockey/pendientes.ts`).
 *
 * Idempotente por external_id: un torneo ya cargado se saltea.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import * as dotenv from 'dotenv';

import { CAHOCKEY_ID_PREFIX, resolverClubCah } from '../lib/integrations/cahockey/nombres.ts';
import { CAHOCKEY_PENDIENTE_PREFIX } from '../lib/integrations/cahockey/pendientes.ts';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const EJECUTAR = process.argv.includes('--execute');

/** El Sub 19 Caballeros 2026: misma organización, mismo formato de zonas, ya sincronizado. */
const PLANTILLA_EXTERNAL_ID = `${CAHOCKEY_ID_PREFIX}1589`;
const SPORT = 'field-hockey';
const TEMPORADA = '2026';
const OFFSET_AR = '-03:00';

const FECHA = { Miércoles: '2026-10-14', Jueves: '2026-10-15', Viernes: '2026-10-16' } as const;
const CANCHA: Record<number, string> = {
  1: 'Kempes (agua)', 2: 'Jockey (agua)', 3: 'Jockey (2)', 4: 'Jockey (3)', 5: 'Anexo Athletic',
};

type Rama = 'damas' | 'caballeros';
type Partido = [dia: keyof typeof FECHA, hora: string, nro: number, cancha: number, local: string, visitante: string, zona: string];

const BSAS = 'Asociación de Buenos Aires';
const BAHIA = 'Asociación Bahiense';
const LITORAL = 'Asociación Litoral';
const MDP = 'Asociación Marplatense';
const MENDOZA = 'Asociación Mendocina';
const CORDOBA = 'Federación Cordobesa';
const SALTA = 'Asociación Salteña';
const SANJUAN = 'Asociación Sanjuanina';
const TANDIL = 'Federación Tandilense';
const SANTIAGO = 'Federación de Santiago del Estero';
const SUDOESTE = 'Asociación Sudoeste de Buenos Aires';
const CATAMARCA = 'Federación Catamarqueña de Hockey';
const TUCUMAN = 'Asociación Tucumana';
const SANTAFE = 'Asociación Santafesina';
const CHACO = 'Federación Chaqueña';
const ENTRE_RIOS = 'Federación Entrerriana';
const NEUQUEN = 'Federación Neuquina';
const CENTRO = 'Asociación del Centro Pcia. Buenos Aires';
const CHUBUT = 'Asociación del Valle de Chubut';

const TORNEOS: Record<Rama, { nombre: string; gender: string; zonas: Record<string, string[]>; partidos: Partido[] }> = {
  damas: {
    nombre: 'Campeonato Argentino de Seleccionados Mayores Damas',
    gender: 'femenino',
    zonas: {
      'Zona A': [BSAS, BAHIA, LITORAL, MDP],
      'Zona B': [MENDOZA, CORDOBA, SALTA, SANJUAN],
      'Zona C': [TANDIL, SANTIAGO, SUDOESTE, CATAMARCA],
      'Zona D': [TUCUMAN, SANTAFE, CHACO, ENTRE_RIOS],
    },
    partidos: [
      ['Miércoles', '08:30', 1, 1, SANTAFE, ENTRE_RIOS, 'Zona D'],
      ['Miércoles', '08:30', 2, 2, TUCUMAN, CHACO, 'Zona D'],
      ['Miércoles', '10:10', 3, 1, SANTIAGO, CATAMARCA, 'Zona C'],
      ['Miércoles', '10:10', 4, 2, SUDOESTE, TANDIL, 'Zona C'],
      ['Miércoles', '15:10', 8, 1, BSAS, LITORAL, 'Zona A'],
      ['Miércoles', '15:10', 7, 2, BAHIA, MDP, 'Zona A'],
      ['Miércoles', '16:50', 5, 1, CORDOBA, SANJUAN, 'Zona B'],
      ['Miércoles', '16:50', 6, 2, MENDOZA, SALTA, 'Zona B'],
      ['Jueves', '11:50', 10, 1, TUCUMAN, SANTAFE, 'Zona D'],
      ['Jueves', '11:50', 9, 2, CHACO, ENTRE_RIOS, 'Zona D'],
      ['Jueves', '13:30', 12, 1, TANDIL, SANTIAGO, 'Zona C'],
      ['Jueves', '13:30', 11, 2, SUDOESTE, CATAMARCA, 'Zona C'],
      ['Jueves', '18:30', 16, 1, BSAS, BAHIA, 'Zona A'],
      ['Jueves', '18:30', 15, 2, LITORAL, MDP, 'Zona A'],
      ['Jueves', '20:10', 14, 1, MENDOZA, CORDOBA, 'Zona B'],
      ['Jueves', '20:10', 13, 2, SALTA, SANJUAN, 'Zona B'],
      ['Viernes', '08:30', 19, 1, SANTIAGO, SUDOESTE, 'Zona C'],
      ['Viernes', '08:30', 20, 2, TANDIL, CATAMARCA, 'Zona C'],
      ['Viernes', '10:10', 17, 1, SANTAFE, CHACO, 'Zona D'],
      ['Viernes', '10:10', 18, 2, TUCUMAN, ENTRE_RIOS, 'Zona D'],
      ['Viernes', '15:10', 21, 1, CORDOBA, SALTA, 'Zona B'],
      ['Viernes', '15:10', 22, 2, MENDOZA, SANJUAN, 'Zona B'],
      ['Viernes', '16:50', 23, 1, BAHIA, LITORAL, 'Zona A'],
      ['Viernes', '16:50', 24, 2, BSAS, MDP, 'Zona A'],
    ],
  },
  caballeros: {
    nombre: 'Campeonato Argentino de Seleccionados Mayores Caballeros',
    gender: 'masculino',
    zonas: {
      'Zona A': [BSAS, LITORAL, TUCUMAN, TANDIL],
      'Zona B': [CORDOBA, MENDOZA, SANJUAN, SALTA],
      'Zona C': [SANTIAGO, ENTRE_RIOS, NEUQUEN, CENTRO],
      'Zona D': [BAHIA, SANTAFE, CHUBUT, CHACO],
    },
    partidos: [
      ['Miércoles', '11:50', 2, 1, SANTAFE, CHACO, 'Zona D'],
      ['Miércoles', '11:50', 1, 2, BAHIA, CHUBUT, 'Zona D'],
      ['Miércoles', '13:30', 3, 1, ENTRE_RIOS, CENTRO, 'Zona C'],
      ['Miércoles', '13:30', 4, 2, NEUQUEN, SANTIAGO, 'Zona C'],
      ['Miércoles', '18:30', 8, 1, BSAS, TUCUMAN, 'Zona A'],
      ['Miércoles', '18:30', 7, 2, LITORAL, TANDIL, 'Zona A'],
      ['Miércoles', '20:10', 5, 1, CORDOBA, SANJUAN, 'Zona B'],
      ['Miércoles', '20:10', 6, 2, MENDOZA, SALTA, 'Zona B'],
      ['Jueves', '08:30', 10, 1, CHUBUT, CHACO, 'Zona D'],
      ['Jueves', '08:30', 9, 2, BAHIA, SANTAFE, 'Zona D'],
      ['Jueves', '10:10', 11, 1, NEUQUEN, CENTRO, 'Zona C'],
      ['Jueves', '10:10', 12, 2, SANTIAGO, ENTRE_RIOS, 'Zona C'],
      ['Jueves', '15:10', 16, 1, TUCUMAN, TANDIL, 'Zona A'],
      ['Jueves', '15:10', 15, 2, BSAS, LITORAL, 'Zona A'],
      ['Jueves', '16:50', 13, 1, CORDOBA, MENDOZA, 'Zona B'],
      ['Jueves', '16:50', 14, 2, SANJUAN, SALTA, 'Zona B'],
      ['Viernes', '11:50', 20, 1, SANTIAGO, CENTRO, 'Zona C'],
      ['Viernes', '11:50', 19, 2, ENTRE_RIOS, NEUQUEN, 'Zona C'],
      ['Viernes', '13:30', 17, 2, SANTAFE, CHUBUT, 'Zona D'],
      ['Viernes', '13:30', 18, 1, BAHIA, CHACO, 'Zona D'],
      ['Viernes', '18:30', 23, 1, LITORAL, TUCUMAN, 'Zona A'],
      ['Viernes', '18:30', 24, 2, BSAS, TANDIL, 'Zona A'],
      ['Viernes', '20:10', 22, 1, CORDOBA, SALTA, 'Zona B'],
      ['Viernes', '20:10', 21, 2, MENDOZA, SANJUAN, 'Zona B'],
    ],
  },
};

const clubDe = (nombre: string) => resolverClubCah(new Map(), PLANTILLA_EXTERNAL_ID, nombre);

async function leer<T>(ruta: string): Promise<T> {
  const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${ruta}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function escribir(ruta: string, metodo: 'POST' | 'PATCH', cuerpo: unknown): Promise<void> {
  const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    method: metodo,
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`${metodo} ${ruta}: ${r.status} ${await r.text()}`);
}

/** Lo que el PDF dice, chequeado contra sí mismo antes de escribir una fila. */
function validar(rama: Rama): string[] {
  const t = TORNEOS[rama];
  const problemas: string[] = [];
  const zonaDe = new Map<string, string>();
  for (const [zona, equipos] of Object.entries(t.zonas)) for (const e of equipos) zonaDe.set(e, zona);
  const pares = new Set<string>();
  for (const [, , nro, , local, visitante, zona] of t.partidos) {
    if (zonaDe.get(local) !== zona || zonaDe.get(visitante) !== zona) problemas.push(`${rama} ${nro}: ${local} vs ${visitante} no son de la ${zona}`);
    const par = [local, visitante].sort().join('|');
    if (pares.has(par)) problemas.push(`${rama} ${nro}: ${local} vs ${visitante} repetido`);
    pares.add(par);
  }
  // todos contra todos: 4 equipos → 6 partidos por zona
  if (pares.size !== Object.keys(t.zonas).length * 6) problemas.push(`${rama}: ${pares.size} cruces de zona, se esperaban ${Object.keys(t.zonas).length * 6}`);
  const nros = t.partidos.map((p) => p[2]);
  if (new Set(nros).size !== nros.length) problemas.push(`${rama}: números de partido repetidos`);
  return problemas;
}

async function main() {
  const problemas = [...validar('damas'), ...validar('caballeros')];
  if (problemas.length) { console.error(problemas.join('\n')); process.exit(1); }

  const nombres = new Set(Object.values(TORNEOS).flatMap((t) => Object.values(t.zonas).flat()));
  const ids = [...nombres].map(clubDe);
  const clubes = await leer<{ id: string; name: string }[]>(`clubs?select=id,name&id=in.(${ids.join(',')})`);
  const nombreDeClub = new Map(clubes.map((c) => [c.id, c.name]));
  const faltan = [...nombres].filter((n) => !nombreDeClub.has(clubDe(n)));
  if (faltan.length) { console.error(`Clubes que no existen: ${faltan.map((n) => `${n} → ${clubDe(n)}`).join(', ')}`); process.exit(1); }

  const [plantilla] = await leer<Record<string, unknown>[]>(`tournaments?external_id=eq.${encodeURIComponent(PLANTILLA_EXTERNAL_ID)}`);
  if (!plantilla) throw new Error(`No está la plantilla ${PLANTILLA_EXTERNAL_ID}`);
  const [fasePlantilla] = await leer<{ settings: unknown }[]>(`tournament_phases?tournament_id=eq.${plantilla.id}&phase_type=eq.group_stage&select=settings`);
  if (!fasePlantilla) throw new Error('La plantilla no tiene fase de grupos');

  const ahora = new Date().toISOString();
  const fasesParaRecalcular: { torneo: string; fase: string }[] = [];

  for (const rama of ['damas', 'caballeros'] as const) {
    const t = TORNEOS[rama];
    const externalId = `${CAHOCKEY_PENDIENTE_PREFIX}mayores:${rama}`;
    const ya = await leer<{ id: string }[]>(`tournaments?select=id&or=(external_id.eq.${externalId},slug.eq.${slugDe(t.nombre)})`);
    console.log(`\n${t.nombre}  [${externalId}]`);
    if (ya.length) { console.log('  ya cargado, se saltea'); continue; }
    for (const [zona, equipos] of Object.entries(t.zonas)) console.log(`  ${zona}: ${equipos.map((e) => nombreDeClub.get(clubDe(e))).join(' · ')}`);
    for (const [dia, hora, nro, cancha, local, visitante, zona] of t.partidos) {
      console.log(`  ${String(nro).padStart(2)} ${dia.slice(0, 3)} ${hora} C${cancha} ${zona}  ${local} vs ${visitante}`);
    }
    if (!EJECUTAR) continue;

    const tournamentId = crypto.randomUUID();
    const seasonId = crypto.randomUUID();
    const phaseId = crypto.randomUUID();
    const slug = slugDe(t.nombre);

    await escribir('tournaments', 'POST', [{
      id: tournamentId,
      union_id: plantilla.union_id,
      season_id: TEMPORADA,
      name: t.nombre,
      original_name: t.nombre,
      slug,
      status: 'published',
      age_grade: 'Mayores',
      region: plantilla.region,
      country: plantilla.country,
      country_id: plantilla.country_id,
      format: 'league',
      is_visible: true,
      ruleset: plantilla.ruleset,
      ruleset_version: plantilla.ruleset_version,
      logo_url: plantilla.logo_url,
      sport_id: SPORT,
      sport: SPORT,
      external_id: externalId,
      priority: 0,
      sponsors: [],
      social_links: {},
      display_order: 0,
      is_popular: false,
      is_api_managed: false,
      review_status: 'approved',
      gender: t.gender,
      created_at: ahora,
      updated_at: ahora,
    }]);
    await escribir('tournament_seasons', 'POST', [{
      id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId,
      season_code: TEMPORADA, name: t.nombre, display_name: t.nombre, slug,
      status: 'active', is_active: true, format: 'league', ruleset: plantilla.ruleset,
      created_at: ahora, updated_at: ahora,
    }]);
    await escribir(`tournaments?id=eq.${tournamentId}`, 'PATCH', { current_season_id: seasonId });
    await escribir('tournament_phases', 'POST', [{
      id: phaseId, tournament_id: tournamentId, season_id: seasonId, name: 'Fase Regular',
      phase_type: 'group_stage', order_index: 1, is_active: true, settings: fasePlantilla.settings,
      created_at: ahora, updated_at: ahora,
    }]);

    const grupoDe = new Map<string, string>();
    for (const [i, zona] of Object.keys(t.zonas).entries()) {
      const id = crypto.randomUUID();
      await escribir('tournament_groups', 'POST', [{ id, phase_id: phaseId, season_id: seasonId, name: zona, order_index: i + 1 }]);
      grupoDe.set(zona, id);
    }

    // las tres tablas de participantes, con el grupo en las dos que lo leen
    for (const [zona, equipos] of Object.entries(t.zonas)) {
      for (const nombre of equipos) {
        const clubId = clubDe(nombre);
        const participantId = crypto.randomUUID();
        const entryId = crypto.randomUUID();
        await escribir('tournament_participants', 'POST', [{
          id: participantId, tournament_id: tournamentId, season_id: seasonId, club_id: clubId,
          name: nombreDeClub.get(clubId), type: 'club', status: 'active', group_id: grupoDe.get(zona),
        }]);
        await escribir('team_season_entries', 'POST', [{
          id: entryId, season_id: seasonId, tournament_id: tournamentId, club_id: clubId, team_id: null,
          source_participant_id: participantId, status: 'active', settings: { source: 'cahockey-pdf' },
        }]);
        await escribir(`tournament_participants?id=eq.${participantId}`, 'PATCH', { season_entry_id: entryId });
        await escribir('tournament_phase_participants', 'POST', [{
          id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, phase_id: phaseId,
          participant_id: participantId, group_id: grupoDe.get(zona), status: 'active',
        }]);
      }
    }

    await escribir('matches', 'POST', t.partidos.map(([dia, hora, nro, cancha, local, visitante, zona]) => ({
      external_id: `${externalId}:${nro}`,
      home_club_id: clubDe(local),
      away_club_id: clubDe(visitante),
      date_time: `${FECHA[dia]}T${hora}:00${OFFSET_AR}`,
      status: 'scheduled',
      score: null,
      venue: CANCHA[cancha],
      round_label: zona,
      points_autocalculated: false,
      home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
      tournament_id: tournamentId,
      sport_id: SPORT,
      sport: SPORT,
      is_visible: true,
      phase_id: phaseId,
      group_id: grupoDe.get(zona),
      season_id: seasonId,
    })));

    fasesParaRecalcular.push({ torneo: tournamentId, fase: phaseId });
    console.log(`  ✓ creado ${tournamentId} — ${t.partidos.length} partidos`);
  }

  if (!EJECUTAR) { console.log('\nModo plan. Correr con --execute para aplicar.'); process.exit(0); }

  if (fasesParaRecalcular.length) {
    const { recalculatePhaseStandingsScopes } = await import('../lib/server/recalculateStandings.ts');
    for (const { torneo, fase } of fasesParaRecalcular) {
      const r = await recalculatePhaseStandingsScopes(torneo, fase, 'general');
      console.log(`  tabla ${torneo}: ${r.ok ? 'ok' : 'falló'}`);
    }
    try {
      const { invalidateMatchesFeedCaches } = await import('../lib/server/matchesFeedInvalidation.ts');
      await invalidateMatchesFeedCaches();
      console.log('Caches del feed invalidados');
    } catch (e) {
      // Fuera de Next falla por `server-only`: purgar matches_feed_cache a mano.
      console.warn(`! no se pudieron invalidar los caches del feed: ${String(e).slice(0, 120)}`);
    }
  }
  process.exit(0);
}

function slugDe(nombre: string): string {
  return `${nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${TEMPORADA}`;
}

main().catch((e) => { console.error(e); process.exit(1); });
