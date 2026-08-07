/**
 * Los playoffs dejan de ser torneos sueltos y pasan a ser FASES de su temporada.
 *
 *   node src/scripts/urba-fusionar-fases.ts --plan
 *   node src/scripts/urba-fusionar-fases.ts --execute
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ EL `--execute` NO PASA TODAVÍA, Y NO ES UN BUG DE ACÁ                     ║
 * ║                                                                          ║
 * ║ `tournament_phases` tiene un índice único                                ║
 * ║   (tournament_id, COALESCE(season_id, '000…'::uuid))                      ║
 * ║ o sea: UNA SOLA FASE POR TORNEO mientras `season_id` sea NULL. Los 811    ║
 * ║ torneos de URBA tienen exactamente una —`Fase Regular`, del backfill— con ║
 * ║ `season_id` en null, así que la segunda fase choca con la primera.        ║
 * ║                                                                          ║
 * ║ Los 20 torneos de la base que SÍ tienen varias fases las tienen todas     ║
 * ║ colgando de una fila de `tournament_seasons`. O sea que el modelo pide    ║
 * ║ que el torneo entre al subsistema de temporadas ANTES de poder tener un   ║
 * ║ cuadro de playoff. Hoy sólo 8 de los 811 de URBA están ahí.               ║
 * ║                                                                          ║
 * ║ Eso ya no es mudar partidos: es darle una temporada a cada torneo destino ║
 * ║ y repuntar su fase existente, tocando un subsistema del que cuelgan los   ║
 * ║ planteles fijos, los participantes y las tablas. Es una decisión de       ║
 * ║ arquitectura y está esperando respuesta.                                 ║
 * ║                                                                          ║
 * ║ El script falla ANTES de escribir una sola fila, y no por suerte: crea    ║
 * ║ las fases primero y muda los partidos después, justo para que un choque   ║
 * ║ en el paso 1 no deje una fusión a medias. Verificado tras el intento:     ║
 * ║ 0 fases creadas, 0 torneos archivados, 0 partidos movidos.                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── El problema ────────────────────────────────────────────────────────────
 * URBA publica la semifinal y la final de una división como TORNEOS con id
 * propio. En G22 eso los convierte en ediciones sueltas: aparecían en el menú de
 * temporadas como si 2022 fueran tres años, y en el de grados como si `Superior`
 * fueran tres grados. Los menús ya los sacaron de ahí; esto los pone donde van,
 * que es el CUADRO DE PLAYOFF de su temporada.
 *
 * ── Cómo se elige el destino: por NOMBRE, no por clave derivada ────────────
 * Primero se intentó con `competitionKey` y estaba mal: esa clave es
 * (category, subcategory, age_grade, gender), el grano correcto para "la misma
 * división a través de los años" pero demasiado grueso para "de qué torneo es
 * fase esto". Mandaba `Femenino - Seven - Clasificación` a `Femenino - Ten` y
 * `Universitario - Desarrollo` a `Universitario - Campeonato - Revancha`, que
 * son competencias distintas cuya subcategory es null.
 *
 * El destino sale de sacarle el sufijo de fase al nombre y buscar ESE nombre:
 *
 *   1. el torneo regular que se llama así (`Top 13 - Preintermedia B - Final`
 *      -> `Top 13 - Preintermedia B`);
 *   2. si no existe, la CLASIFICACIÓN de su mismo grupo, que es la fase de
 *      grupos y por lo tanto la temporada regular con otro nombre. Es la misma
 *      regla con la que los dos menús eligen quién representa al año.
 *
 * Lo que no resuelve ninguna de las dos NO SE TOCA. Son 19 sobre 38, y quedan
 * listados al final con el motivo: adivinar el destino de un torneo con 939
 * partidos en juego no vale el riesgo.
 *
 * ── Lo que hace por cada fusión ────────────────────────────────────────────
 *   · crea una fase `playoff` en el torneo destino, después de su Fase Regular;
 *   · muda los partidos ahí, con su `phase_id` nuevo;
 *   · da de alta en el destino los clubes que jugaron y no estaban;
 *   · ARCHIVA el torneo-fase (`status='archived'`, oculto e inactivo).
 *
 * No se BORRA la fila, y el motivo es doble: se puede volver atrás, y su
 * `external_id` sigue tomado, así que el cron no la reporta como torneo nuevo
 * cada vez que alguien corra un `?anio=2022`. La guarda que impide que el cron
 * la sincronice —y le reinserte los partidos mudados— está en la ruta.
 */
import fs from 'node:fs';
import path from 'node:path';

import { instanciaDeTorneoUrba } from '../lib/integrations/urba/externalId.ts';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'URBA_FASES_ROLLBACK.sql');

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
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales de servicio');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const HJ = { ...H, 'content-type': 'application/json' };

async function todas(recurso: string): Promise<any[]> {
  const out: any[] = [];
  for (let d = 0; ; d += 1000) {
    const r = await fetch(`${URL_BASE}/rest/v1/${recurso}`, { headers: { ...H, range: `${d}-${d + 999}` } });
    if (!r.ok) throw new Error(`${recurso}: HTTP ${r.status} ${(await r.text()).slice(0, 150)}`);
    const f = await r.json() as any[];
    out.push(...f);
    if (f.length < 1000) return out;
  }
}
const enLotes = <T,>(xs: T[], n: number) => {
  const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out;
};

const normalizar = (s: string) => String(s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/^urba:\s*/, '')
  .replace(/["'`´’]/g, '').replace(/\s+/g, ' ').trim();

/** El nombre sin el sufijo de fase. `X - Semifinal` -> `x`. */
const baseDelNombre = (nombre: string): string | null => {
  const m = normalizar(nombre).match(
    /^(.*?)\s*[-–]\s*(play\s?-?\s?offs?|semi\s?-?\s?finals?|torneo\s+finals?\s*[a-z]?|finals?|(?:re)?clasificacion|ascensos?|permanencia)\s*$/,
  );
  return m && m[1] ? m[1] : null;
};

/** El orden en el que se juegan, para el `order_index` de las fases. */
const ORDEN = ['Clasificación', 'Play Off', 'Semifinal', 'Final', 'Ascenso', 'Permanencia'];
const ordenDe = (nombre: string) => {
  const i = ORDEN.indexOf(instanciaDeTorneoUrba(nombre) ?? '');
  return i === -1 ? ORDEN.length : i;
};

async function main() {
  console.log(`modo: ${modo}\n`);

  const T = await todas('tournaments?select=id,external_id,name,season_id,category,subcategory,age_grade,gender,is_visible,is_active,status&union_id=eq.urba');
  const fases = T.filter((t) => instanciaDeTorneoUrba(t.name) !== null);

  const porNombre = new Map<string, any[]>();
  const porBase = new Map<string, any[]>();
  for (const t of T) {
    const k = `${t.season_id}|${normalizar(t.name)}`;
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k)!.push(t);
  }
  for (const f of fases) {
    const b = baseDelNombre(f.name);
    if (!b) continue;
    const k = `${f.season_id}|${b}`;
    if (!porBase.has(k)) porBase.set(k, []);
    porBase.get(k)!.push(f);
  }

  let mudanzas: Array<{ fase: any; destino: any; instancia: string; via: string }> = [];
  const seQuedan: Array<{ fase: any; motivo: string }> = [];
  for (const f of fases) {
    const base = baseDelNombre(f.name);
    const clave = `${f.season_id}|${base ?? ''}`;
    const instancia = instanciaDeTorneoUrba(f.name)!;

    const regular = (base ? porNombre.get(clave) ?? [] : []).find((h) => instanciaDeTorneoUrba(h.name) === null);
    if (regular) { mudanzas.push({ fase: f, destino: regular, instancia, via: 'regular' }); continue; }

    const clasi = (porBase.get(clave) ?? []).find((h) => instanciaDeTorneoUrba(h.name) === 'Clasificación');
    if (clasi && clasi.id !== f.id) { mudanzas.push({ fase: f, destino: clasi, instancia, via: 'clasificación' }); continue; }

    seQuedan.push({
      fase: f,
      motivo: instancia === 'Clasificación'
        ? 'es la temporada regular de su grupo: ya ES el torneo de la temporada'
        : `no hay torneo "${base}" en ${f.season_id} ni una Clasificación de ese grupo`,
    });
  }

  // ── qué se mueve exactamente ─────────────────────────────────────────────
  const idsCandidatos = mudanzas.map((m) => m.fase.id);
  const partidosTodos = idsCandidatos.length
    ? (await Promise.all(enLotes(idsCandidatos, 40).map((l) =>
        todas(`matches?select=id,tournament_id,phase_id,home_club_id,away_club_id&tournament_id=in.(${l.join(',')})`))))
      .flat()
    : [];
  const porFase = new Map<string, any[]>();
  for (const p of partidosTodos) {
    if (!porFase.has(p.tournament_id)) porFase.set(p.tournament_id, []);
    porFase.get(p.tournament_id)!.push(p);
  }

  // UNA FASE SIN PARTIDOS NO SE CREA. URBA publicó el torneo y nunca le cargó
  // un partido: mudarlo dejaría una fase de playoff que dibuja un cuadro vacío,
  // que es peor que no tenerla. Se quedan donde están, archivados no.
  const vacias = mudanzas.filter((m) => (porFase.get(m.fase.id) ?? []).length === 0);
  for (const v of vacias) seQuedan.push({ fase: v.fase, motivo: 'no tiene un solo partido cargado' });
  mudanzas = mudanzas.filter((m) => (porFase.get(m.fase.id) ?? []).length > 0);

  console.log(`torneos de URBA: ${T.length} · de ellos, fases: ${fases.length}`);
  console.log(`  se mudan a una fase de su temporada: ${mudanzas.length}`);
  console.log(`  se quedan como están               : ${seQuedan.length}\n`);

  const idsFase = mudanzas.map((m) => m.fase.id);
  const partidos = partidosTodos.filter((p) => idsFase.includes(p.tournament_id));

  for (const m of mudanzas) {
    const n = (porFase.get(m.fase.id) ?? []).length;
    console.log(`  ${m.fase.season_id} ${String(m.fase.name).replace(/^URBA: /, '').slice(0, 40).padEnd(42)} ${String(n).padStart(3)} partidos -> ${String(m.destino.name).replace(/^URBA: /, '').slice(0, 38)}  [fase ${m.instancia}]`);
  }
  console.log(`\n  partidos que se mudan: ${partidos.length}`);

  // ── participantes que hay que dar de alta en el destino ──────────────────
  const destinos = [...new Set(mudanzas.map((m) => m.destino.id))];
  const yaParticipan = new Set<string>();
  for (const lote of enLotes(destinos, 40)) {
    for (const p of await todas(`tournament_participants?select=tournament_id,club_id&tournament_id=in.(${lote.join(',')})`)) {
      yaParticipan.add(`${p.tournament_id}|${p.club_id}`);
    }
  }
  const altas: Array<{ tournament_id: string; club_id: string; season_id: string | null }> = [];
  const vistos = new Set<string>();
  for (const m of mudanzas) {
    for (const p of porFase.get(m.fase.id) ?? []) {
      for (const club of [p.home_club_id, p.away_club_id]) {
        if (!club) continue;
        const k = `${m.destino.id}|${club}`;
        if (yaParticipan.has(k) || vistos.has(k)) continue;
        vistos.add(k);
        altas.push({ tournament_id: m.destino.id, club_id: club, season_id: m.destino.season_id });
      }
    }
  }
  console.log(`  clubes a dar de alta en el destino: ${altas.length}`);

  // ── las fases nuevas ─────────────────────────────────────────────────────
  const fasesDestino = destinos.length
    ? (await Promise.all(enLotes(destinos, 40).map((l) =>
        todas(`tournament_phases?select=id,tournament_id,name,order_index&tournament_id=in.(${l.join(',')})`)))).flat()
    : [];
  const maxOrden = new Map<string, number>();
  for (const f of fasesDestino) {
    maxOrden.set(f.tournament_id, Math.max(maxOrden.get(f.tournament_id) ?? 0, Number(f.order_index ?? 0)));
  }
  const nuevasFases = mudanzas
    .slice()
    .sort((a, b) => ordenDe(a.fase.name) - ordenDe(b.fase.name))
    .map((m) => {
      const orden = (maxOrden.get(m.destino.id) ?? 0) + 1;
      maxOrden.set(m.destino.id, orden);
      return { mudanza: m, fila: {
        tournament_id: m.destino.id,
        name: m.instancia,
        phase_type: 'playoff',
        order_index: orden,
        is_active: true,
        // `season_id` NO se copia del torneo: acá es un uuid que apunta a
        // `seasons`, y en `tournaments` de URBA es el año como texto ('2022').
        // Pasarlo tal cual da `invalid input syntax for type uuid: "2021"`.
        // Las fases que ya existen lo tienen en null, así que null va.
        settings: {
          // Lo mínimo que usa una fase de playoff de las que ya hay en la base.
          legs: 1,
          phaseMode: 'playoff',
          stageKind: 'phase',
          // De dónde salió, para que la fusión sea rastreable desde la fila
          // misma — y para que el rollback sepa exactamente qué borrar.
          editor_source: 'urba_fusion',
          urba_external_id: m.fase.external_id,
          urba_nombre: m.fase.name,
        },
      } };
    });
  console.log(`  fases de playoff a crear: ${nuevasFases.length}`);

  console.log('\n── los que se quedan como están ──');
  for (const s of seQuedan) {
    console.log(`  ${s.fase.season_id} ${String(s.fase.name).replace(/^URBA: /, '').slice(0, 44).padEnd(46)} ${s.motivo}`);
  }

  // ── rollback, escrito SIEMPRE y antes de tocar nada ──────────────────────
  const sql = [
    '-- Rollback de la fusión de los playoffs de URBA en fases de su temporada.',
    '-- Devuelve cada partido a su torneo original con su phase_id original,',
    '-- borra las fases creadas y los participantes dados de alta, y desarchiva.',
    'BEGIN;',
    ...partidos.map((p) => `UPDATE public.matches SET tournament_id = '${p.tournament_id}', phase_id = ${p.phase_id ? `'${p.phase_id}'` : 'NULL'} WHERE id = '${p.id}';`),
    ...(altas.length
      ? [`DELETE FROM public.tournament_participants WHERE (tournament_id, club_id) IN (${altas.map((a) => `('${a.tournament_id}','${a.club_id}')`).join(', ')});`]
      : []),
    `DELETE FROM public.tournament_phases WHERE settings ->> 'urba_external_id' IN (${mudanzas.map((m) => `'${m.fase.external_id}'`).join(', ') || "''"});`,
    `UPDATE public.tournaments SET is_visible = TRUE, is_active = TRUE, status = 'published'`,
    `  WHERE external_id IN (${mudanzas.map((m) => `'${m.fase.external_id}'`).join(', ') || "''"});`,
    'COMMIT;',
  ];
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }
  if (!mudanzas.length) { console.log('\nno hay nada que fusionar.'); return; }

  // ── 1. las fases ─────────────────────────────────────────────────────────
  console.log('\ncreando las fases…');
  const idPorFase = new Map<string, string>();
  for (const n of nuevasFases) {
    const r = await fetch(`${URL_BASE}/rest/v1/tournament_phases`, {
      method: 'POST', headers: { ...HJ, prefer: 'return=representation' }, body: JSON.stringify(n.fila),
    });
    if (!r.ok) throw new Error(`POST phase: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    idPorFase.set(n.mudanza.fase.id, (await r.json())[0].id);
  }

  // ── 2. los participantes ─────────────────────────────────────────────────
  if (altas.length) {
    console.log('dando de alta los clubes que faltaban…');
    for (const lote of enLotes(altas, 100)) {
      const r = await fetch(`${URL_BASE}/rest/v1/tournament_participants`, {
        method: 'POST', headers: { ...HJ, prefer: 'return=minimal' }, body: JSON.stringify(lote),
      });
      if (!r.ok) throw new Error(`POST participants: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    }
  }

  // ── 3. los partidos ──────────────────────────────────────────────────────
  console.log('mudando los partidos…');
  let movidos = 0;
  for (const m of mudanzas) {
    const nuevaFase = idPorFase.get(m.fase.id)!;
    const r = await fetch(`${URL_BASE}/rest/v1/matches?tournament_id=eq.${m.fase.id}`, {
      method: 'PATCH', headers: { ...HJ, prefer: 'return=minimal' },
      body: JSON.stringify({ tournament_id: m.destino.id, phase_id: nuevaFase }),
    });
    if (!r.ok) throw new Error(`PATCH matches de ${m.fase.external_id}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    movidos += (porFase.get(m.fase.id) ?? []).length;
  }

  // ── 4. archivar el torneo-fase ───────────────────────────────────────────
  console.log('archivando los torneos-fase…');
  for (const lote of enLotes(mudanzas.map((m) => m.fase.external_id), 40)) {
    const r = await fetch(`${URL_BASE}/rest/v1/tournaments?external_id=in.(${lote.map((e) => `"${e}"`).join(',')})`, {
      method: 'PATCH', headers: { ...HJ, prefer: 'return=minimal' },
      body: JSON.stringify({ is_visible: false, is_active: false, status: 'archived' }),
    });
    if (!r.ok) throw new Error(`PATCH tournaments: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  }

  // ── verificación ─────────────────────────────────────────────────────────
  console.log('\nDESPUÉS:');
  let huerfanos = 0;
  for (const lote of enLotes(idsFase, 40)) {
    huerfanos += (await todas(`matches?select=id&tournament_id=in.(${lote.join(',')})`)).length;
  }
  const enDestino = (await Promise.all(enLotes(destinos, 40).map((l) =>
    todas(`matches?select=id&tournament_id=in.(${l.join(',')})`)))).flat().length;
  console.log(`  partidos mudados            : ${movidos}`);
  console.log(`  partidos que quedan en las fases viejas: ${huerfanos}  (tiene que ser 0)`);
  console.log(`  partidos en los ${destinos.length} torneos destino: ${enDestino}`);
  const conFase = (await Promise.all(enLotes(destinos, 40).map((l) =>
    todas(`tournament_phases?select=id,phase_type&tournament_id=in.(${l.join(',')})`)))).flat();
  console.log(`  fases en los destinos       : ${conFase.length} (${conFase.filter((f) => f.phase_type === 'playoff').length} de playoff)`);
  if (huerfanos !== 0) { console.error('\nQuedaron partidos en un torneo archivado.'); process.exit(1); }
  console.log('\nlisto.');
}

main().catch((e) => { console.error(e); process.exit(1); });
