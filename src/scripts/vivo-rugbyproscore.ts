/**
 * Sigue EN VIVO partidos que la mesa carga en rugbyproscore.com.ar y los copia
 * a nuestra base: marcador, tries, estado, reloj y eventos de puntos con autor.
 *
 *   TS_NODE_TRANSPILE_ONLY=true \
 *   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","noEmit":false}' \
 *   node -r ts-node/register -r tsconfig-paths/register \
 *     src/scripts/vivo-rugbyproscore.ts <nuestroId>=<idFuente> [...] [--plan] [--once] [--cada=40]
 *
 * La fuente es el Firestore del sitio (`rugbyscore-98771`), legible sin token:
 * `matches/<id>` trae marcador, estado y cronometro; `matches/<id>/score_events`
 * los puntos con `team` explicito; `matches/<id>/players` los nombres. El resto
 * de las subcolecciones da 403. Ver [[rugbyproscore-fuente-ucr]].
 *
 * Cada vuelta REEMPLAZA la lista entera de eventos (`payload.events`), asi que
 * correrlo dos veces o reiniciarlo no duplica nada, y si la mesa borra un evento
 * mal cargado, se borra tambien aca. No manda formaciones: el autor viaja por
 * nombre, sin crear fichas en `people` a mitad de partido.
 *
 * El marcador que se escribe es el de la fuente, no la suma de los eventos: la
 * mesa a veces suma puntos sin cargar el evento. Si no cierran, se avisa.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

const envFile = path.join(REPO, '.env.local');
if (fs.existsSync(envFile)) {
  for (const linea of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

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

const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/rugbyscore-98771/databases/(default)/documents';
const MINUTOS_PRIMER_TIEMPO = 40;
/** Puntos entre dos vueltas que no se creen sin mirar (con --cada=300, 5 min). */
const SALTO_SOSPECHOSO = 28;
/** Eventos nuevos en un mismo minuto que delatan una carga en tanda. */
const EVENTOS_POR_MINUTO = 4;

/** Tipo de la fuente -> tipo nuestro. Lo que no esta aca se avisa y no se carga. */
const TIPO: Record<string, string> = {
  try: 'try', penalty_try: 'penalty_try', conversion: 'conversion',
  penalty: 'penalty', drop: 'drop_goal', drop_goal: 'drop_goal',
};
const PUNTOS: Record<string, number> = { try: 5, penalty_try: 7, conversion: 2, penalty: 3, drop_goal: 3 };

type Valor = Record<string, unknown>;
type Doc = { name: string; fields?: Record<string, Valor> };

function valor(v: Valor): unknown {
  if ('mapValue' in v) {
    const campos = (v.mapValue as { fields?: Record<string, Valor> }).fields ?? {};
    return Object.fromEntries(Object.entries(campos).map(([k, x]) => [k, valor(x)]));
  }
  if ('arrayValue' in v) return ((v.arrayValue as { values?: Valor[] }).values ?? []).map(valor);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('nullValue' in v) return null;
  return v.stringValue ?? v.booleanValue ?? v.timestampValue ?? null;
}

function plano(doc: Doc) {
  const o: Record<string, unknown> = { _id: doc.name.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields ?? {})) o[k] = valor(v);
  return o;
}

async function leer(ruta: string) {
  const r = await fetch(`${FIRESTORE}/${ruta}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${ruta}: HTTP ${r.status}`);
  return r.json() as Promise<Doc & { documents?: Doc[]; nextPageToken?: string }>;
}

async function coleccion(ruta: string) {
  const docs: Record<string, unknown>[] = [];
  let token = '';
  do {
    const j = await leer(`${ruta}?pageSize=300${token ? `&pageToken=${token}` : ''}`);
    docs.push(...(j.documents ?? []).map(plano));
    token = j.nextPageToken ?? '';
  } while (token);
  return docs;
}

/** "Apellido, Nombre" -> "Nombre Apellido". */
function nombreNatural(nombre: string) {
  const [apellido, pila] = nombre.split(',').map((s) => s.trim());
  return pila ? `${pila} ${apellido}` : nombre.trim();
}

type Plantel = { numero: number | null; nombre: string; titular: boolean };

const PUESTO_POR_NUMERO: Record<number, string> = {
  1: 'Pilar', 2: 'Hooker', 3: 'Pilar', 4: 'Segunda línea', 5: 'Segunda línea',
  6: 'Tercera línea', 7: 'Tercera línea', 8: 'Tercera línea', 9: 'Medio scrum', 10: 'Apertura',
  11: 'Wing', 12: 'Centro', 13: 'Centro', 14: 'Wing', 15: 'Fullback',
};

/** Llave de emparejado: sin tildes, en minusculas y con los tokens ordenados. */
function llave(nombre: string) {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
}

function segundosDelReloj(m: Record<string, unknown>) {
  const pausado = Number(m.timer_elapsed_when_paused) || 0;
  if (!m.timer_is_running || !m.timer_started_at) return pausado;
  return pausado + Math.max(0, (Date.now() - Date.parse(String(m.timer_started_at))) / 1000);
}

async function leerFuente(idFuente: string) {
  const [doc, eventos, jugadores] = await Promise.all([
    leer(`matches/${idFuente}`),
    coleccion(`matches/${idFuente}/score_events`),
    coleccion(`matches/${idFuente}/players`),
  ]);
  const partido = plano(doc);
  const nombres = new Map(jugadores.map((j) => [String(j._id), nombreNatural(String(j.name ?? ''))]));
  const desconocidos: string[] = [];

  const lista = eventos
    .map((e) => {
      const periodo = Number(e.half) === 2 ? '2T' : '1T';
      const minutoDelTiempo = Math.floor((Number(e.timer_seconds) || 0) / 60);
      return { e, periodo, minuto: minutoDelTiempo + (periodo === '2T' ? MINUTOS_PRIMER_TIEMPO : 0) };
    })
    // Orden estable: tiempo, segundos, y la hora de carga para desempatar.
    .sort((a, b) => a.minuto - b.minuto
      || (Number(a.e.timer_seconds) || 0) - (Number(b.e.timer_seconds) || 0)
      || String(a.e.created_at).localeCompare(String(b.e.created_at)))
    .flatMap(({ e, periodo, minuto }) => {
      const tipo = TIPO[String(e.type)];
      if (!tipo) { desconocidos.push(String(e.type)); return []; }
      return [{
        minute: minuto,
        period: periodo,
        type: tipo,
        team: (e.team === 'away' ? 'away' : 'home') as 'home' | 'away',
        playerName: e.scorer_player_id ? nombres.get(String(e.scorer_player_id)) ?? '' : '',
        detail: '',
      }];
    })
    .map((e, order) => ({ ...e, order }));

  const suma = { home: 0, away: 0, homeTries: 0, awayTries: 0 };
  for (const e of lista) {
    suma[e.team] += PUNTOS[e.type] ?? 0;
    if (e.type === 'try' || e.type === 'penalty_try') suma[e.team === 'home' ? 'homeTries' : 'awayTries'] += 1;
  }

  const half = Number(partido.half) === 2 ? '2T' : '1T';
  const segundos = segundosDelReloj(partido);
  const planteles = { home: [] as Plantel[], away: [] as Plantel[] };
  for (const j of jugadores) {
    if (!j.name) continue;
    planteles[j.team === 'away' ? 'away' : 'home'].push({
      numero: Number(j.jersey_number) || null,
      nombre: nombreNatural(String(j.name)),
      titular: j.is_starter === true,
    });
  }
  for (const lado of [planteles.home, planteles.away]) lado.sort((a, b) => (a.numero ?? 99) - (b.numero ?? 99));

  return {
    planteles,
    estadoFuente: String(partido.status),
    marcador: { home: Number(partido.home_score) || 0, away: Number(partido.away_score) || 0 },
    suma,
    eventos: lista,
    desconocidos,
    reloj: {
      minute: Math.floor(segundos / 60) + (half === '2T' ? MINUTOS_PRIMER_TIEMPO : 0),
      seconds: Math.floor(segundos % 60),
      period: half,
      running: Boolean(partido.timer_is_running),
    },
    rotulo: `${partido.home_team_name} ${partido.home_score}-${partido.away_score} ${partido.away_team_name}`,
  };
}

/** pending -> no se toca; finished -> final; cualquier otro (first_half, half_time...) -> live. */
function estadoNuestro(estadoFuente: string) {
  if (estadoFuente === 'pending' || estadoFuente === 'scheduled') return null;
  if (estadoFuente === 'finished') return 'final';
  return 'live';
}

async function main() {
  const args = process.argv.slice(2);
  const pares = args.filter((a) => a.includes('=') && !a.startsWith('--')).map((a) => a.split('=') as [string, string]);
  const plan = args.includes('--plan');
  const once = args.includes('--once');
  const cada = Number(args.find((a) => a.startsWith('--cada='))?.split('=')[1]) || 40;
  if (!pares.length) {
    console.error('uso: vivo-rugbyproscore.ts <nuestroId>=<idFuente> [...] [--plan] [--once] [--cada=40]');
    process.exit(2);
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { persistMatchCenterSupplementalData } = await import('@/lib/services/matchCenterService');
  const db = createAdminClient();

  const huella = new Map<string, string>();
  const terminados = new Set<string>();
  const escrito = new Map<string, { home: number; away: number; eventos: number }>();
  // El freno compara contra lo que ya esta en la base: reiniciar a mitad de partido no lo dispara.
  const { data: base } = await db.from('matches').select('id, score, events_count').in('id', pares.map(([id]) => id));
  for (const fila of (base ?? []) as { id: string; score: Record<string, unknown> | null; events_count: number | null }[]) {
    escrito.set(fila.id, {
      home: Number(fila.score?.home) || 0, away: Number(fila.score?.away) || 0, eventos: fila.events_count ?? 0,
    });
  }

  // Fichas existentes de los dos clubes de cada partido, por llave: se fijan por `id`
  // para que el servicio no cree un duplicado por tilde (ver [[fichas-duplicadas-por-tilde]]).
  const fichas = new Map<string, Map<string, string | null>>();
  const { data: filas } = await db.from('matches').select('id, home_club_id, away_club_id').in('id', pares.map(([id]) => id));
  for (const fila of (filas ?? []) as { id: string; home_club_id: string | null; away_club_id: string | null }[]) {
    const clubes = [fila.home_club_id, fila.away_club_id].filter(Boolean) as string[];
    const mapa = new Map<string, string | null>();
    const ids = new Set<string>();
    const { data: dePeople } = await db.from('people').select('id, full_name, name').in('club_id', clubes).limit(5000);
    const { data: deRoles } = await db.from('club_person_roles').select('person_id').in('club_id', clubes).limit(5000);
    const roles = (deRoles ?? []).map((r: { person_id: string }) => r.person_id).filter((id: string) => !ids.has(id));
    const { data: dePeople2 } = roles.length
      ? await db.from('people').select('id, full_name, name').in('id', roles.slice(0, 1000)) : { data: [] };
    for (const p of [...(dePeople ?? []), ...(dePeople2 ?? [])] as { id: string; full_name: string | null; name: string | null }[]) {
      if (ids.has(p.id)) continue;
      ids.add(p.id);
      const k = llave(p.full_name ?? p.name ?? '');
      if (!k) continue;
      // Dos fichas con la misma llave: ambiguo, no se fija (lo resuelve el servicio).
      mapa.set(k, mapa.has(k) ? null : p.id);
    }
    fichas.set(fila.id, mapa);
  }

  // --arranque: la primera vuelta no frena, para ponerse al dia con partidos que ya
  // se jugaron (la base esta en 0 y el salto es legitimo). Las siguientes si frenan.
  let alPonerseAlDia = args.includes('--arranque');

  for (;;) {
    const hora = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date());

    for (const [nuestroId, idFuente] of pares) {
      if (terminados.has(nuestroId)) continue;
      try {
        const f = await leerFuente(idFuente);
        const estado = estadoNuestro(f.estadoFuente);
        const firma = JSON.stringify([f.estadoFuente, f.marcador, f.eventos, f.planteles]);
        const cambio = huella.get(nuestroId) !== firma;

        // Freno: la mesa puede cargar basura y "terminar" el partido (el 136-58 del
        // 2026-10-02, ~30 eventos en el mismo minuto). Si el marcador salta de mas
        // entre dos vueltas, o entran muchos eventos en un solo minuto, no se escribe:
        // se avisa y se vuelve a mirar en la proxima vuelta contra lo ultimo bueno.
        const previo = escrito.get(nuestroId) ?? { home: 0, away: 0, eventos: 0 };
        const salto = (f.marcador.home - previo.home) + (f.marcador.away - previo.away);
        const porMinuto = new Map<number, number>();
        for (const e of f.eventos.slice(previo.eventos)) porMinuto.set(e.minute, (porMinuto.get(e.minute) ?? 0) + 1);
        const amontonados = Math.max(0, ...porMinuto.values());
        if (cambio && !alPonerseAlDia && (salto > SALTO_SOSPECHOSO || amontonados > EVENTOS_POR_MINUTO)) {
          console.log(`[${hora}] FRENO ${f.rotulo} · ${f.estadoFuente} · +${salto} puntos, ${amontonados} eventos en un minuto. No se escribe.`);
          continue;
        }

        if (cambio) {
          console.log(`[${hora}] ${f.rotulo} · ${f.estadoFuente} · ${f.eventos.length} eventos`);
          const ultimo = f.eventos[f.eventos.length - 1];
          if (ultimo) console.log(`         último: ${ultimo.minute}' ${ultimo.team} ${ultimo.type} ${ultimo.playerName || '(sin autor)'}`);
          if (f.suma.home !== f.marcador.home || f.suma.away !== f.marcador.away) {
            console.log(`         AVISO: los eventos suman ${f.suma.home}-${f.suma.away}, la fuente dice ${f.marcador.home}-${f.marcador.away}`);
          }
          if (f.desconocidos.length) console.log(`         AVISO: tipos sin mapear: ${[...new Set(f.desconocidos)].join(', ')}`);
        }

        if (estado && !plan) {
          // Los eventos se reescriben siempre que cambian; el reloj, en cada vuelta mientras corre.
          if (cambio || estado === 'live') {
            // Formaciones: el lado que la fuente no publico se deja como esta en la base.
            const mapa = fichas.get(nuestroId) ?? new Map<string, string | null>();
            const armar = (lado: Plantel[]) => lado.map((j) => ({
              id: mapa.get(llave(j.nombre)) ?? null, number: j.numero, name: j.nombre,
              position: j.numero ? PUESTO_POR_NUMERO[j.numero] ?? null : null,
              role: j.titular ? 'starter' : 'substitute', rating: null, isCaptain: false,
            }));
            let lineups: { home: unknown[]; away: unknown[] } | undefined;
            if (cambio && (f.planteles.home.length || f.planteles.away.length)) {
              const { data: ya } = await db.from('matches').select('lineups').eq('id', nuestroId).single();
              const previos = ((ya as { lineups?: { home?: unknown[]; away?: unknown[] } } | null)?.lineups) ?? {};
              lineups = {
                home: f.planteles.home.length ? armar(f.planteles.home) : previos.home ?? [],
                away: f.planteles.away.length ? armar(f.planteles.away) : previos.away ?? [],
              };
            }
            await persistMatchCenterSupplementalData(db as never, nuestroId, {
              ...(lineups ? { lineups } : {}),
              ...(cambio ? { events: f.eventos } : {}),
              clock: { ...f.reloj, running: estado === 'live' && f.reloj.running, syncedAt: new Date().toISOString() },
            } as never);
          }
          if (cambio) {
            const { data: fila, error } = await db.from('matches').select('score').eq('id', nuestroId).single();
            if (error) throw new Error(error.message);
            const score = {
              ...((fila?.score ?? {}) as Record<string, unknown>),
              home: f.marcador.home, away: f.marcador.away,
              homeTries: f.suma.homeTries, awayTries: f.suma.awayTries,
            };
            const { error: e2 } = await db.from('matches')
              .update({
                score, status: estado, events_count: f.eventos.length,
                ...(f.planteles.home.length ? { lineup_home_count: f.planteles.home.length } : {}),
                ...(f.planteles.away.length ? { lineup_away_count: f.planteles.away.length } : {}),
              })
              .eq('id', nuestroId);
            if (e2) throw new Error(e2.message);
          }
        }

        huella.set(nuestroId, firma);
        escrito.set(nuestroId, { ...f.marcador, eventos: f.eventos.length });
        if (estado === 'final') {
          terminados.add(nuestroId);
          console.log(`[${hora}] FINAL ${f.rotulo}`);
        }
      } catch (err) {
        console.log(`[${hora}] ERROR ${nuestroId}: ${(err as Error).message}`);
      }
    }

    alPonerseAlDia = false;
    if (once || terminados.size === pares.length) break;
    await new Promise((r) => setTimeout(r, cada * 1000));
  }
  console.log('fin del seguimiento');
}

main().catch((err) => { console.error(err); process.exit(1); });
