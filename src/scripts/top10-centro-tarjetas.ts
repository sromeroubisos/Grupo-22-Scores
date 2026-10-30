/**
 * Arma el JSON de `ficha-partido-local.ts` desde las TARJETAS OFICIALES de la
 * Unión Cordobesa (PDF escaneados, ya pasados por OCR y validados contra el
 * marcador en `cards.json`).
 *
 *   TS_NODE_TRANSPILE_ONLY=true \
 *   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","noEmit":false}' \
 *   node -r ts-node/register -r tsconfig-paths/register \
 *     src/scripts/top10-centro-tarjetas.ts <cards.json> --out src/scripts/formaciones/<salida>.json
 *
 * Qué hace, en orden:
 *  1. Empareja cada tarjeta con su partido de la temporada (fecha local + los dos
 *     clubes + marcador). Lo que no empareja se informa, no se adivina.
 *  2. Unifica a cada jugador por su DNI dentro del club: el OCR y los delegados
 *     escriben el mismo nombre de formas distintas, el DNI no.
 *  3. Reusa la ficha de `people` si el nombre plegado (sin tildes, tokens
 *     ordenados) calza con UNA sola; si hay varias se queda con la más usada en
 *     formaciones (ver [[fichas-duplicadas-por-tilde]]). Sin calce, va sin `id`
 *     y el servicio la crea.
 *
 * El DNI se usa SOLO para unificar: no se escribe en el JSON de salida ni en la
 * base (`people.id_number` queda como está).
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

const SEASON_ID = 'b0f440a7-c46b-4f16-a31f-d83de7b1967e'; // Top 10 del Centro 2026
const TZ = 'America/Argentina/Cordoba';

/** Nombre que imprime la tarjeta -> id de `clubs`. */
const CLUBES: Record<string, string> = {
  'cordoba athletic': 'cordoba-athletic-club',
  'jockey club cordoba': 'jockey-club-cordoba',
  'tala r c': 'tala-rugby-club',
  'carlos paz r c': 'carlos-paz-rugby-club',
  'club universitario': 'club-universitario-de-cordoba',
  'la tablada': 'club-la-tablada',
  'palermo bajo': 'club-palermo-bajo',
  'san martin r c': 'san-martin-de-villa-maria',
  'uru cure rc': 'uru-cure-rugby-club',
  'uru curerc': 'uru-cure-rugby-club',
  'jockey club villa maria': 'jockey-club-de-villa-maria',
};

/**
 * Intermedia (`--intermedia`): el mismo club juega con una ficha propia
 * (`<club>-intermedia`) y el OCR pega o separa las palabras del nombre, así que
 * la clave va sin espacios.
 */
const SEASON_INTERMEDIA = 'aac69e77-f09e-4f5c-94a5-4b1d636d22d0'; // Torneo Cordobés - Intermedia
const CLUBES_INTERMEDIA: Record<string, string> = {
  cordobaathletic: 'cordoba-athletic-club-intermedia',
  universitario: 'club-universitario-de-cordoba-intermedia',
  jockeyclubcordoba: 'jockey-club-cordoba-intermedia',
  jockeyvillamaria: 'jockey-club-de-villa-maria-intermedia',
  palermobajo: 'club-palermo-bajo-intermedia',
  urucure: 'uru-cure-rugby-club-intermedia',
  carlospazrc: 'carlos-paz-rugby-club-intermedia',
  sanmartinrcvm: 'san-martin-de-villa-maria-intermedia',
  latablada: 'la-tablada-intermedia',
  talarc: 'tala-rugby-club-intermedia',
};

type Jug ={ pos: number; dor: number; name: string; doc: string | null };
type Ev = {
  tipo: string; tiempo: '1T' | '2T'; rel: number | null; dor: number | null;
  jugador: string | null; entra?: string | null; dor_in?: number | null; obs: string;
};
type Tarjeta = {
  file: string; tarjeta: string; fecha_iso: string; ronda?: string; home: string; away: string; score: [number, number];
  local: Jug[]; visit: Jug[]; ev_local: Ev[]; ev_visit: Ev[]; arbitro?: string | null;
};

const plegar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s: string) => plegar(s).split(' ').filter(Boolean);
const clave = (s: string) => tokens(s).sort().join(' ');

/** "Apellido, Nombre" -> "Nombre Apellido" (orden natural, que es como se guarda). */
function natural(n: string): string {
  const partes = n.split(',').map((p) => p.trim()).filter(Boolean);
  return partes.length === 2 ? `${partes[1]} ${partes[0]}` : n.trim();
}

/**
 * En la tarjeta el nombre largo se pisa con la columna del DNI y el OCR lo lee
 * roto ("Esteba4Ds2Jeβ"). Los que se alcanzan a leer en la imagen van a mano;
 * del resto se descarta solo el token corrupto (el resolver lo completa con la
 * ficha existente por subconjunto de tokens).
 */
const ARREGLOS: [RegExp, string][] = [
  [/^Lautaro Esteba\S*\s+Ramirez Juncos$/i, 'Lautaro Esteban Ramirez Juncos'],
  [/^Mateo Francisc\S*\s+Frontera Croizet$/i, 'Mateo Francisco Frontera Croizet'],
  // Intermedia: el nombre se pisa con la columna del DNI y queda un resto ("Bau" + "ist").
  [/^Joaquin\s+\S{1,4}\s+Moyano Pinchasowicz$/i, 'Joaquin Moyano Pinchasowicz'],
  [/^Joaquir\s+Moyano Pinchasowicz$/i, 'Joaquin Moyano Pinchasowicz'],
  [/^Juan Bau\S*\s+Molina Morra Cort\S*$/i, 'Juan Bautista Molina Morra Cortés'],
  [/^Luciano\s+\S{1,3}\s+Zalazar Castellanos$/i, 'Luciano Zalazar Castellanos'],
  [/^Joaquin Aleja\s+\S+\s+Castillo Ceballos$/i, 'Joaquin Castillo Ceballos'],
  [/^Joaquin Anc\s+Sanchez Salguero$/i, 'Joaquin Sanchez Salguero'],
  [/^Juan Ignac\s+Cattaneo Del Prado$/i, 'Juan Ignacio Cattaneo Del Prado'],
  [/^Nicolas Agl\s+Fernandez ladonisi$/i, 'Nicolas Fernandez Ladonisi'],
  [/^Tom\S+s Fac\s+Altamira Pasqualini$/i, 'Tomás Altamira Pasqualini'],
];
function reparar(n: string): string {
  for (const [re, v] of ARREGLOS) if (re.test(n)) return v;
  const t = n.split(/\s+/).filter((tok) => /^[\p{L}'.\-]+$/u.test(tok) && tok.length > 1);
  return t.length >= 2 ? t.join(' ') : n;
}

function fechaLocal(iso: string): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date(iso));
}

async function main() {
  const args = process.argv.slice(2);
  const entrada = args.find((a) => !a.startsWith('--'));
  const iOut = args.indexOf('--out');
  const salida = iOut >= 0 ? args[iOut + 1] : null;
  if (!entrada || !salida) {
    console.error('uso: top10-centro-tarjetas.ts <cards.json> --out <salida.json>');
    process.exit(2);
  }
  const tarjetas = JSON.parse(fs.readFileSync(entrada, 'utf8')) as Tarjeta[];
  const intermedia = args.includes('--intermedia');
  const seasonId = intermedia ? SEASON_INTERMEDIA : SEASON_ID;
  const clubDe = (nombre: string): string | undefined =>
    intermedia ? CLUBES_INTERMEDIA[plegar(nombre).replace(/ /g, '')] : CLUBES[plegar(nombre)];
  const clubesDelTorneo = intermedia ? Object.values(CLUBES_INTERMEDIA) : Object.values(CLUBES);

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const db = createAdminClient();

  const { data: partidos, error } = await db
    .from('matches')
    .select('id, date_time, home_club_id, away_club_id, score, status, lineups')
    .eq('season_id', seasonId);
  if (error || !partidos) throw new Error(`no se pudieron leer los partidos: ${error?.message}`);

  // Uso de cada ficha en formaciones ya cargadas: desempata fichas duplicadas.
  const uso = new Map<string, number>();
  for (const p of partidos) {
    const l = (p.lineups ?? {}) as { home?: { id?: string }[]; away?: { id?: string }[] };
    for (const j of [...(l.home ?? []), ...(l.away ?? [])]) if (j.id) uso.set(j.id, (uso.get(j.id) ?? 0) + 1);
  }

  const clubes = [...new Set(clubesDelTorneo)];
  const { data: gente, error: errorGente } = await db
    .from('people').select('id, club_id, full_name, name').in('club_id', clubes);
  if (errorGente || !gente) throw new Error(`no se pudo leer people: ${errorGente?.message}`);
  const porClub = new Map<string, { id: string; nombre: string }[]>();
  for (const g of gente) {
    const nombre = (g.full_name || g.name || '').trim();
    if (!nombre) continue;
    const l = porClub.get(g.club_id as string) ?? [];
    l.push({ id: g.id as string, nombre });
    porClub.set(g.club_id as string, l);
  }

  // 1. Emparejar tarjeta -> partido.
  const vistas = new Set<string>();
  const emparejadas: { t: Tarjeta; matchId: string; homeClub: string; awayClub: string }[] = [];
  const sinPartido: string[] = [];
  for (const t of tarjetas) {
    if (vistas.has(t.tarjeta)) { console.log(`  (tarjeta ${t.tarjeta} repetida en ${t.file}: se ignora)`); continue; }
    vistas.add(t.tarjeta);
    const hc = clubDe(t.home);
    const ac = clubDe(t.away);
    if (!hc || !ac) { sinPartido.push(`${t.file}: club desconocido (${t.home} / ${t.away})`); continue; }
    const candidatos = partidos.filter((p) => p.home_club_id === hc && p.away_club_id === ac);
    const exacto = candidatos.filter((p) => fechaLocal(p.date_time as string) === t.fecha_iso);
    const mismoDia = exacto.length ? exacto : candidatos.filter((p) => {
      const d = Math.abs(new Date(fechaLocal(p.date_time as string)).getTime() - new Date(t.fecha_iso).getTime());
      return d <= 86400000;
    });
    if (mismoDia.length !== 1) { sinPartido.push(`${t.file}: ${mismoDia.length} partidos para ${hc} vs ${ac} el ${t.fecha_iso}`); continue; }
    const p = mismoDia[0];
    const sc = (p.score ?? {}) as { home?: number; away?: number };
    if (Number(sc.home) !== t.score[0] || Number(sc.away) !== t.score[1]) {
      sinPartido.push(`${t.file}: marcador ${t.score.join('-')} != base ${sc.home}-${sc.away} (${p.id})`);
      continue;
    }
    emparejadas.push({ t, matchId: p.id as string, homeClub: hc, awayClub: ac });
  }

  // Tildes que el OCR pierde: se recuperan de las fichas que ya existen
  // ("Pena" -> "Peña") cuando el token plegado tiene UNA sola grafía con tilde.
  const conTilde = new Map<string, Set<string>>();
  for (const l of porClub.values()) {
    for (const { nombre } of l) {
      for (const tok of nombre.split(/\s+/)) {
        if (!/[À-ſ]/.test(tok) || tok === tok.toUpperCase()) continue;
        const k = plegar(tok);
        (conTilde.get(k) ?? conTilde.set(k, new Set()).get(k)!).add(tok);
      }
    }
  }
  const restituirTildes = (n: string) => n.split(/\s+/).map((tok) => {
    if (/[À-ſ]/.test(tok)) return tok;
    const v = conTilde.get(plegar(tok));
    return v && v.size === 1 ? [...v][0] : tok;
  }).join(' ');

  // 2. Nombre canónico por (club, DNI): la variante limpia más repetida entre
  // las tarjetas. El OCR a veces pisa el nombre con la columna del DNI
  // ("In4a06259"): esas variantes traen dígitos y pierden contra la limpia.
  const variantes = new Map<string, Map<string, number>>();
  const registrar = (club: string, js: Jug[]) => {
    for (const j of js) {
      if (!j.doc) continue;
      const k = `${club}|${j.doc}`;
      const nuevo = reparar(natural(j.name));
      const m = variantes.get(k) ?? variantes.set(k, new Map()).get(k)!;
      m.set(nuevo, (m.get(nuevo) ?? 0) + 1);
    }
  };
  for (const e of emparejadas) { registrar(e.homeClub, e.t.local); registrar(e.awayClub, e.t.visit); }
  const limpia = (n: string) => /^[\p{L}][\p{L}' .\-]*$/u.test(n) && tokens(n).length >= 2;
  const canonico = new Map<string, string>();
  for (const [k, m] of variantes) {
    // Un nombre largo se corta en el ancho de la columna, y el ancho cambia de una
    // tarjeta a otra: la variante con un token que otra completa ("Bau" ->
    // "Bautista") está cortada y pierde.
    const todos = [...m.keys()].flatMap((v) => v.split(/\s+/));
    const cortada = (v: string) => v.split(/\s+/).some((tok) =>
      todos.some((o) => o.length > tok.length && plegar(o).startsWith(plegar(tok))));
    const orden = [...m.entries()].sort((a, b) =>
      Number(limpia(b[0])) - Number(limpia(a[0])) || Number(cortada(a[0])) - Number(cortada(b[0])) || b[1] - a[1] || b[0].length - a[0].length);
    canonico.set(k, restituirTildes(orden[0][0]));
  }

  // 3. Resolver ficha por club (cacheada por DNI, o por nombre si no hay DNI).
  const cacheId = new Map<string, string | null>();
  let reusadas = 0; let nuevas = 0;
  const nuevasLista: string[] = [];
  function resolver(club: string, nombre: string, doc: string | null): string | null {
    const ck = doc ? `${club}|${doc}` : `${club}|n:${clave(nombre)}`;
    if (cacheId.has(ck)) return cacheId.get(ck)!;
    const cands = porClub.get(club) ?? [];
    const src = tokens(nombre);
    const key = clave(nombre);
    const elegir = (l: { id: string; nombre: string }[]) =>
      [...l].sort((a, b) => (uso.get(b.id) ?? 0) - (uso.get(a.id) ?? 0) || a.id.localeCompare(b.id))[0].id;
    let hallado: string | null = null;
    const exactas = cands.filter((c) => clave(c.nombre) === key);
    if (exactas.length) hallado = elegir(exactas);
    else {
      const sub = cands.filter((c) => {
        const ct = tokens(c.nombre);
        return ct.length >= 2 && ct.every((x) => src.includes(x));
      });
      const sup = cands.filter((c) => {
        const ct = tokens(c.nombre);
        return src.length >= 2 && src.every((x) => ct.includes(x));
      });
      if (sub.length === 1) hallado = sub[0].id;
      else if (sup.length === 1) hallado = sup[0].id;
    }
    cacheId.set(ck, hallado);
    if (hallado) reusadas++; else { nuevas++; nuevasLista.push(`${club}: ${nombre}`); }
    return hallado;
  }

  const salidaPartidos = emparejadas.map((e) => {
    const armarLado = (lado: 'home' | 'away') => {
      const club = lado === 'home' ? e.homeClub : e.awayClub;
      const js = lado === 'home' ? e.t.local : e.t.visit;
      const porDorsal = new Map<number, string>();
      const lista = js.map((j) => {
        const nombre = (j.doc && canonico.get(`${club}|${j.doc}`)) || restituirTildes(reparar(natural(j.name)));
        porDorsal.set(j.dor, nombre);
        const id = resolver(club, nombre, j.doc);
        return { numero: j.dor, pos: j.pos, nombre, ...(id ? { id } : {}) };
      });
      const sinPos = ({ numero, nombre, id }: { numero: number; nombre: string; id?: string }) => ({ numero, nombre, ...(id ? { id } : {}) });
      const titulares = lista.filter((j) => j.pos <= 15).map(sinPos);
      const suplentes = lista.filter((j) => j.pos > 15).map(sinPos);
      return { porDorsal, lado: { nombre: lado === 'home' ? e.t.home : e.t.away, titulares, suplentes } };
    };
    const L = armarLado('home');
    const V = armarLado('away');
    const eventos = ([['local', e.t.ev_local, L.porDorsal], ['visitante', e.t.ev_visit, V.porDorsal]] as const)
      .flatMap(([equipo, evs, mapa]) => evs.map((ev, i) => ({ equipo, ev, mapa, i })))
      .map(({ equipo, ev, mapa, i }) => ({
        minuto: ev.rel ?? 0,
        periodo: ev.tiempo,
        tipo: ev.tipo,
        equipo,
        jugador: ev.dor != null ? (mapa.get(ev.dor) ?? '') : '',
        ...(ev.tipo === 'substitution' && ev.dor_in != null && mapa.get(ev.dor_in) ? { detalle: `Entra: ${mapa.get(ev.dor_in)}` } : {}),
        ...(ev.tipo !== 'substitution' && ev.obs ? { detalle: ev.obs } : {}),
        _o: `${ev.tiempo}${String(ev.rel ?? 0).padStart(3, '0')}${equipo === 'local' ? 0 : 1}${String(i).padStart(3, '0')}`,
      }))
      .filter((ev) => !(ev.tipo === 'substitution' && !ev.jugador)) // ingreso sin pareja: no se sabe quién salió
      .sort((a, b) => a._o.localeCompare(b._o))
      .map(({ _o, ...resto }) => resto);
    return {
      id: e.matchId,
      rotulo: `${e.t.home} vs ${e.t.away} · ${e.t.ronda ?? ''} · tarjeta ${e.t.tarjeta}`,
      ...(e.t.arbitro ? { arbitro: natural(e.t.arbitro) } : {}),
      local: L.lado,
      visitante: V.lado,
      eventos,
    };
  });

  fs.writeFileSync(path.resolve(REPO, salida), JSON.stringify({
    descripcion: 'Top 10 del Centro 2026 · tarjetas oficiales de la Unión Cordobesa (PDF, OCR validado contra el marcador). Fichas reusadas por nombre plegado; las que no calzan van sin id.',
    torneo: 'Top 10 del Centro',
    partidos: salidaPartidos,
  }, null, 2));

  console.log(`\ntarjetas: ${tarjetas.length} · emparejadas: ${emparejadas.length} · sin partido: ${sinPartido.length}`);
  for (const s of sinPartido) console.log('  ✗', s);
  console.log(`fichas reusadas: ${reusadas} · nuevas: ${nuevas}`);
  console.log(`escrito: ${salida}`);
  if (process.argv.includes('--nuevas')) for (const n of nuevasLista) console.log('  +', n);
}

main().catch((err) => { console.error(err); process.exit(1); });
