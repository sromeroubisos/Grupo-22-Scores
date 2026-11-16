/**
 * Alta de la votación del XV Ideal del Campeonato Argentino Juvenil M17 2026:
 * una votación por zona (Campeonato y Ascenso), 15 camisetas, candidatos por
 * puesto ordenados por Índice S22 y con sus PJ y puntos del torneo.
 *
 *   node scripts/xv-ideal/argentino-juvenil-m17-2026.mjs --plan
 *   node scripts/xv-ideal/argentino-juvenil-m17-2026.mjs --execute
 *   node scripts/xv-ideal/argentino-juvenil-m17-2026.mjs --execute --cerrar   (cierra las dos)
 *
 * Antes hay que correr la migración 20261116120000_create_xv_ideal_polls.sql.
 * Idempotente: si la votación de una zona ya existe (mismo group_key + name) se
 * le actualizan los candidatos SIN tocar los votos — los ids de candidato salen
 * de camiseta + nombre, así que siguen siendo los mismos mientras el nombre no
 * cambie. Cambiar el nombre de alguien invalida los votos que ya tenía.
 *
 * La lista de abajo es el CANON: para sacar o sumar a alguien se edita acá y se
 * vuelve a correr. Pendiente de decidir (nota del 2026-11-16): el tope de 2 por
 * unión se aplica por historia, no al par 4-5; en el Ascenso Mar del Plata tiene
 * 4 de los 6 candidatos de segunda línea. Si el par pasa a contar, salen Aliende
 * Pagano y Lamtzev y entran Buvinic (Chile) y Auchter (Nordeste) — de los dos
 * entrantes no hay PJ ni puntos cargados todavía.
 */
import fs from 'node:fs';
import path from 'node:path';

const GROUP_KEY = 'argentino-juvenil-m17-2026';
const TITLE = 'XV Ideal del Argentino Juvenil M17 2026';

const ZONAS = [
  { header: 'ZONA CAMPEONATO', name: 'Zona Campeonato', slug: 'campeonato-argentino-juvenil-m17-campeonato', position: 0 },
  { header: 'ZONA ASCENSO', name: 'Zona Ascenso', slug: 'campeonato-argentino-juvenil-m17-ascenso', position: 1 },
];

/** Escudo de cada selección (los que dejó scripts/argentino-juvenil/logos.mjs en public/clubs). */
const ESCUDOS = {
  'Buenos Aires': 'buenos-aires-m17', 'Rosario': 'rosario-m17', 'Cuyo': 'cuyo-m17',
  'Santa Fe': 'santafesina-m17', 'Tucumán': 'tucuman-m17', 'Salta': 'salta-m17',
  'Córdoba': 'cordobesa-m17', 'Chile': 'chile-m17', 'Mar del Plata': 'mar-del-plata-m17',
  'Austral': 'austral-m17', 'Entre Ríos': 'entrerriana-m17', 'Nordeste': 'nordeste-m17',
  'Alto Valle': 'alto-valle-m17', 'Oeste': 'oeste-m17',
};

const LISTAS = `
ZONA CAMPEONATO
1 · Pilar izquierdo
* Facundo Azurmendi (Buenos Aires) · 5 PJ · 0 pts
* Bautista Pérez Del Sarto (Rosario) · 4 PJ · 5 pts
* Juan Bautista Arévalo Costanza (Cuyo) · 5 PJ · 5 pts
* Bautista Benítez (Santa Fe) · 5 PJ · 5 pts
2 · Hooker
* Facundo Moreira (Buenos Aires) · 5 PJ · 40 pts
* Mateo Santiago (Cuyo) · 5 PJ · 15 pts
* Joaquín Pulvirenti (Rosario) · 4 PJ · 5 pts
* Eric Jorgensen (Tucumán) · 5 PJ · 5 pts
3 · Pilar derecho
* Fermín Odriozola (Buenos Aires) · 5 PJ · 0 pts
* Francisco Tenaglia (Rosario) · 5 PJ · 5 pts
* Segundo Gil (Cuyo) · 5 PJ · 0 pts
* Juan Ignacio Alaria (Cuyo) · 3 PJ · 5 pts
4 · Segunda línea
* Julián Migra Dec (Buenos Aires) · 4 PJ · 0 pts
* Tadeo Smith Hasner (Salta) · 5 PJ · 5 pts
* Nicolino Cappelletti (Rosario) · 4 PJ · 5 pts
5 · Segunda línea
* Juan Pedro Sirota (Buenos Aires) · 5 PJ · 10 pts
* Mateo Palenzona (Rosario) · 5 PJ · 10 pts
* Felipe Fernández Pont (Santa Fe) · 5 PJ · 10 pts
6 · Ala
* Patricio Baclini (Rosario) · 4 PJ · 20 pts
* Marcos Gorchs (Buenos Aires) · 5 PJ · 5 pts
* Antonio Manrique (Córdoba) · 5 PJ · 5 pts
7 · Ala
* Juan Segundo Fresca (Buenos Aires) · 4 PJ · 10 pts
* Nicolás San Dámaso Mattos (Rosario) · 4 PJ · 5 pts
* Ignacio Fernández Llop (Córdoba) · 5 PJ · 5 pts
8 · Octavo
* Joaquín González Varcelo (Buenos Aires) · 4 PJ · 10 pts
* Bautista Córdoba (Rosario) · 5 PJ · 5 pts
* Salvador Montoya (Salta) · 4 PJ · 5 pts
* Serafín Caggiano (Córdoba) · 5 PJ · 5 pts
9 · Medio scrum
* Cruz Quiroga (Buenos Aires) · 5 PJ · 5 pts
* Manuel Preumayr (Rosario) · 5 PJ · 7 pts
* Ivo Haas (Santa Fe) · 4 PJ · 10 pts
* Gregorio Gutiérrez Castex (Salta) · 4 PJ · 5 pts
10 · Apertura
* José Ticinese (Buenos Aires) · 5 PJ · 36 pts
* Francisco Saravia Toledo (Salta) · 5 PJ · 18 pts
* Santiago Páez De La Torre (Santa Fe) · 4 PJ · 26 pts
* Roque Delloca (Tucumán) · 4 PJ · 19 pts
11 · Wing izquierdo
* Cruz Acuña (Buenos Aires) · 4 PJ · 45 pts
* Joaquín Rodríguez Córdoba (Tucumán) · 3 PJ · 10 pts
* Tomás Pouchou Alemán (Salta) · 4 PJ · 10 pts
12 · Primer centro
* Santiago Meyer (Salta) · 5 PJ · 53 pts
* Francisco Diez (Buenos Aires) · 5 PJ · 10 pts
* Gianluca Carraro (Rosario) · 4 PJ · 10 pts
13 · Segundo centro
* Santiago Abbondati (Buenos Aires) · 4 PJ · 15 pts
* Rafael Butler (Salta) · 5 PJ · 10 pts
* Juan Pedro Porrini (Córdoba) · 5 PJ · 20 pts
14 · Wing derecho
* Felipe Bustamante (Tucumán) · 5 PJ · 35 pts
* Federico Anderson (Buenos Aires) · 4 PJ · 5 pts
* Ignacio Rodríguez (Córdoba) · 5 PJ · 12 pts
15 · Fullback
* Juan Martín Palillo (Rosario) · 4 PJ · 42 pts
* Tomás Galetti (Salta) · 4 PJ · 15 pts
* Gonzalo Cairo (Cuyo) · 4 PJ · 20 pts
* Benjamín Fossati (Buenos Aires) · 4 PJ · 12 pts

ZONA ASCENSO
1 · Pilar izquierdo
* Gonzalo Villegas (Chile) · 5 PJ · 15 pts
* Juan Bautista Cortopasso (Mar del Plata) · 4 PJ · 0 pts
* Máximo Kochirets (Austral) · 5 PJ · 5 pts
* Valentino Rojas (Entre Ríos) · 4 PJ · 10 pts
2 · Hooker
* Fermín Ferreras (Mar del Plata) · 5 PJ · 25 pts
* Gabriel Ramírez (Chile) · 5 PJ · 20 pts
* Hilario Arias (Mar del Plata) · 4 PJ · 10 pts
* Lautaro Vargas Alperin (Nordeste) · 5 PJ · 10 pts
3 · Pilar derecho
* Flavio Meza (Mar del Plata) · 5 PJ · 10 pts
* Joaquín Toledo (Chile) · 5 PJ · 0 pts
* Luciano Gallucci (Alto Valle) · 5 PJ · 5 pts
* Agustín Taborda (Austral) · 4 PJ · 5 pts
4 · Segunda línea
* Marcos Bertuzzi (Mar del Plata) · 5 PJ · 5 pts
* Felipe Aliende Pagano (Mar del Plata) · 4 PJ · 5 pts
* Bruno Almirón Comas (Entre Ríos) · 5 PJ · 10 pts
5 · Segunda línea
* Vicente Caballero (Chile) · 5 PJ · 10 pts
* Bautista Vaquero (Mar del Plata) · 5 PJ · 15 pts
* Boris Lamtzev (Mar del Plata) · 4 PJ · 5 pts
6 · Ala
* Ramiro Carus (Alto Valle) · 5 PJ · 10 pts
* Santos Torrebruno (Mar del Plata) · 5 PJ · 5 pts
* Agustín Holmes (Chile) · 4 PJ · 5 pts
7 · Ala
* Santiago Sánchez Terrero (Mar del Plata) · 5 PJ · 15 pts
* Bautista Alcaide (Chile) · 5 PJ · 0 pts
* Francisco Etcheto (Alto Valle) · 5 PJ · 0 pts
8 · Octavo
* Juan Benjamín Moreyra (Nordeste) · 5 PJ · 10 pts
* Balthazar Soto Poblete (Alto Valle) · 5 PJ · 5 pts
* Jaime Román (Chile) · 4 PJ · 5 pts
* Lautaro Raimondi (Mar del Plata) · 3 PJ · 0 pts
9 · Medio scrum
* Joaquín Zapiola (Mar del Plata) · 5 PJ · 15 pts
* Raimundo Valenzuela (Chile) · 5 PJ · 10 pts
* Jerónimo Maggi (Oeste) · 4 PJ · 15 pts
* Simón Valbuena (Alto Valle) · 5 PJ · 10 pts
10 · Apertura
* Joaquín Cocomarola (Nordeste) · 4 PJ · 33 pts
* Ignacio Flores Migale (Alto Valle) · 4 PJ · 32 pts
* Borja Wood (Chile) · 3 PJ · 28 pts
* Pedro Pujol (Entre Ríos) · 4 PJ · 26 pts
11 · Wing izquierdo
* Bruno Moscuzza (Mar del Plata) · 5 PJ · 25 pts
* Salvador García Machado (Nordeste) · 5 PJ · 25 pts
* Bautista Cid (Alto Valle) · 4 PJ · 20 pts
12 · Primer centro
* Genaro Furlan (Entre Ríos) · 5 PJ · 21 pts
* Juan Ignacio Hollmann (Mar del Plata) · 5 PJ · 7 pts
* Ilario De Belaustegui (Nordeste) · 5 PJ · 10 pts
13 · Segundo centro
* Franco Marchini (Chile) · 5 PJ · 25 pts
* Alfonso Van Houtte (Alto Valle) · 5 PJ · 15 pts
* Mateo Peralta (Austral) · 4 PJ · 5 pts
14 · Wing derecho
* Benjamín Macgregor (Chile) · 4 PJ · 15 pts
* Matías Del Río (Mar del Plata) · 5 PJ · 15 pts
* Nahuel Riquelme (Austral) · 5 PJ · 20 pts
15 · Fullback
* Agustín Contreras Ferro (Mar del Plata) · 5 PJ · 66 pts
* Nicolás Valderrama (Chile) · 4 PJ · 45 pts
* Joaquín Ortiz (Austral) · 5 PJ · 38 pts
* Polo Gingins (Alto Valle) · 5 PJ · 18 pts
`;

const slugify = (v) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** El texto pegado → { [header de zona]: slots[] }. Corta si una línea no se entiende. */
export function parsear(texto) {
  const porZona = {};
  let slots = null;
  let slot = null;
  for (const [i, bruta] of texto.split(/\r?\n/).entries()) {
    const linea = bruta.trim();
    if (!linea) continue;
    if (ZONAS.some((z) => z.header === linea)) { slots = porZona[linea] = []; slot = null; continue; }
    const camiseta = linea.match(/^(\d+) · (.+)$/);
    if (camiseta && slots) { slot = { jersey: Number(camiseta[1]), label: camiseta[2], candidates: [] }; slots.push(slot); continue; }
    const jugador = linea.match(/^\* (.+) \((.+)\) · (\d+) PJ · (\d+) pts$/);
    if (jugador && slot) {
      if (!ESCUDOS[jugador[2]]) throw new Error(`Línea ${i + 1}: no hay escudo para "${jugador[2]}"`);
      slot.candidates.push({ id: `${slot.jersey}-${slugify(jugador[1])}`, name: jugador[1], team: jugador[2], logo: `/clubs/${ESCUDOS[jugador[2]]}.png`, pj: Number(jugador[3]), points: Number(jugador[4]) });
      continue;
    }
    throw new Error(`Línea ${i + 1} no entendida: "${linea}"`);
  }
  return porZona;
}

const modo = process.argv.includes('--execute') ? 'execute' : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }
const cerrar = process.argv.includes('--cerrar');

const porZona = parsear(LISTAS);
for (const zona of ZONAS) {
  const slots = porZona[zona.header] ?? [];
  const jugadores = slots.reduce((n, s) => n + s.candidates.length, 0);
  const sinCamiseta = Array.from({ length: 15 }, (_, k) => k + 1).filter((j) => !slots.some((s) => s.jersey === j));
  console.log(`${zona.name}: ${slots.length} camisetas, ${jugadores} candidatos${sinCamiseta.length ? ` — faltan ${sinCamiseta.join(', ')}` : ''}`);
  const ids = slots.flatMap((s) => s.candidates.map((c) => c.id));
  if (new Set(ids).size !== ids.length) throw new Error(`${zona.name}: ids de candidato repetidos`);
  if (slots.length !== 15) throw new Error(`${zona.name}: tienen que ser 15 camisetas`);
}
if (modo === 'plan') process.exit(0);

const REPO = process.cwd();
const env = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };

async function api(metodo, recurso, cuerpo, extra = {}) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: metodo, headers: { ...H, ...extra }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${metodo} ${recurso}: ${res.status} ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

for (const zona of ZONAS) {
  const slots = porZona[zona.header];
  let tournamentId = null;
  try {
    const torneo = await api('GET', `tournaments?slug=eq.${zona.slug}&select=id`);
    tournamentId = torneo?.[0]?.id ?? null;
  } catch (e) { console.warn(`  (sin vínculo al torneo: ${e.message})`); }
  if (!tournamentId) console.warn(`  ${zona.name}: no encontré el torneo ${zona.slug}; queda sin vínculo.`);

  const existentes = await api('GET', `xv_ideal_polls?group_key=eq.${GROUP_KEY}&name=eq.${zona.name}&select=id`);   // api() ya codifica la URL entera: no codificar dos veces
  const campos = { tournament_id: tournamentId, title: TITLE, position: zona.position, slots, ...(cerrar ? { status: 'closed' } : {}) };
  if (existentes?.length) {
    await api('PATCH', `xv_ideal_polls?id=eq.${existentes[0].id}`, campos);
    console.log(`  ${zona.name}: actualizada (${existentes[0].id})${cerrar ? ' y cerrada' : ''}`);
  } else {
    const [fila] = await api('POST', 'xv_ideal_polls', { group_key: GROUP_KEY, name: zona.name, status: 'open', ...campos }, { prefer: 'return=representation' });
    console.log(`  ${zona.name}: creada (${fila.id})`);
  }
}
console.log(`Listo: /xv-ideal/${GROUP_KEY}`);
