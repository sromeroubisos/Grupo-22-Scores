/**
 * Canon de los torneos de la Unión Cordobesa 2026 que se cargan desde las
 * planillas que exporta su sistema de gestión (Partidos + Posiciones):
 * M16 A y B, M17 A y B, M19 B, Intermedia y Preintermedia A y B.
 * (El M19 "A" se cargó antes con scripts/cordoba-m19, que usa el mismo molde.)
 *
 * Este archivo NO toca la base: sólo lee las planillas y las traduce a clubes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const X = require('xlsx');
export const DIR = path.join(process.cwd(), 'scripts', 'cordoba-torneos', 'fuente');

export const UNION_CORDOBESA = '0c515ac1-af49-4699-b3c5-7273bc424357';
export const TEMPORADA = '2026';

/**
 * Un torneo por entrada. `letra` es la que se le pone a un club que la planilla
 * nombra sin letra (en un "B" es la B, en un "A" la A). `ficha` dice cómo se
 * arma la ficha de club de cada categoría.
 */
export const TORNEOS = [
  { clave: 'm16-a', nombre: 'Torneo Cordobés M16 "A"', slug: 'torneo-cordobes-m16-a', original: 'TORNEO BLOQUE JUV. M16 "A"', category: 'Juvenil', ageGrade: 'M16', ficha: { tipo: 'juvenil', edad: 'M16' }, letra: 'A' },
  { clave: 'm16-b', nombre: 'Torneo Cordobés M16 "B"', slug: 'torneo-cordobes-m16-b', original: 'TORNEO BLOQUE JUV. M16 "B"', category: 'Juvenil', ageGrade: 'M16', ficha: { tipo: 'juvenil', edad: 'M16' }, letra: 'B' },
  { clave: 'm17-a', nombre: 'Torneo Cordobés M17 "A"', slug: 'torneo-cordobes-m17-a', original: 'TORNEO BLOQUE JUV. M17 "A"', category: 'Juvenil', ageGrade: 'M17', ficha: { tipo: 'juvenil', edad: 'M17' }, letra: 'A' },
  { clave: 'm17-b', nombre: 'Torneo Cordobés M17 "B"', slug: 'torneo-cordobes-m17-b', original: 'TORNEO BLOQUE JUV. M17 "B"', category: 'Juvenil', ageGrade: 'M17', ficha: { tipo: 'juvenil', edad: 'M17' }, letra: 'B' },
  { clave: 'm19-b', nombre: 'Torneo Cordobés M19 "B"', slug: 'torneo-cordobes-m19-b', original: 'TORNEO MENORES DE 19 "B"', category: 'Juvenil', ageGrade: 'M19', ficha: { tipo: 'juvenil', edad: 'M19' }, letra: 'B' },
  { clave: 'inter', nombre: 'Torneo Cordobés - Intermedia', slug: 'torneo-cordobes-intermedia', original: 'T. REGION CENTRO (INTERMEDIA) - TOP 10 A', category: 'Intermedia', ageGrade: 'Mayores', ficha: { tipo: 'inter' }, letra: null },
  { clave: 'pre-a', nombre: 'Torneo Cordobés - Preintermedia "A"', slug: 'torneo-cordobes-preintermedia-a', original: 'T. REGION CENTRO (PRE-INTER½ "A") - TOP 10 A', category: 'Preintermedia', ageGrade: 'Mayores', ficha: { tipo: 'pre' }, letra: 'A' },
  { clave: 'pre-b', nombre: 'Torneo Cordobés - Preintermedia "B"', slug: 'torneo-cordobes-preintermedia-b', original: 'T. REGION CENTRO (PRE-INTER½ "B") - TOP 10 A', category: 'Preintermedia', ageGrade: 'Mayores', ficha: { tipo: 'pre' }, letra: 'B' },
  { clave: 'm15-a', nombre: 'Torneo Cordobés M15 "A"', slug: 'torneo-cordobes-m15-a', original: 'TORNEO BLOQUE JUV. M15 "A"', category: 'Juvenil', ageGrade: 'M15', ficha: { tipo: 'juvenil', edad: 'M15' }, letra: 'A' },
  { clave: 'm15-b', nombre: 'Torneo Cordobés M15 "B"', slug: 'torneo-cordobes-m15-b', original: 'TORNEO BLOQUE JUV. M15 "B"', category: 'Juvenil', ageGrade: 'M15', ficha: { tipo: 'juvenil', edad: 'M15' }, letra: 'B' },
  { clave: 's9b-inter', nombre: 'Súper 9 "B" - Intermedia', slug: 'super-9-b-intermedia', original: 'TORNEO SUPER 9 "B" - INTERMEDIA', category: 'Intermedia', ageGrade: 'Mayores', ficha: { tipo: 'inter' }, letra: null },
  { clave: 'regional-b', nombre: 'Regional Centro "B" - Intermedia', slug: 'regional-centro-b-intermedia', original: 'T. REGIONAL "B" - CBESA./ANDINA - INTER½', category: 'Intermedia', ageGrade: 'Mayores', ficha: { tipo: 'inter' }, letra: null },
  // Liga Desarrollo: cada instancia es una fase de liga con SU tabla (zonas y copas). `activa` es la fase que muestra la web.
  {
    clave: 'des-ce', nombre: 'Liga Desarrollo Capital - Este', slug: 'liga-desarrollo-capital-este', original: 'TORNEO LIGA DESARROLLO CAPITAL - ESTE',
    category: 'Desarrollo', ageGrade: 'Mayores', ficha: { tipo: 'madre' }, letra: null, activa: 'Copa de Oro',
    fases: [
      { instancia: '1ª Fase - ZONA CAPITAL - ESTE', nombre: '1ª Fase - Zona Capital - Este', tabla: 'des-ce.fase1.xlsx' },
      { instancia: 'Copa de ORO', nombre: 'Copa de Oro', tabla: 'des-ce.oro.xlsx' },
      { instancia: 'COPA de PLATA', nombre: 'Copa de Plata', tabla: 'des-ce.plata.xlsx' },
    ],
  },
  {
    clave: 'des-sc', nombre: 'Liga Desarrollo Sur - Centro', slug: 'liga-desarrollo-sur-centro', original: 'TORNEO LIGA DESARROLLO SUR - CENTRO',
    category: 'Desarrollo', ageGrade: 'Mayores', ficha: { tipo: 'madre' }, letra: null, activa: 'Copa de Oro',
    fases: [
      { instancia: '1ª Fase - ZONA SUR', nombre: '1ª Fase - Zona Sur', tabla: 'des-sc.sur.xlsx' },
      { instancia: '1ª Fase - ZONA CENTRO', nombre: '1ª Fase - Zona Centro', tabla: 'des-sc.centro.xlsx' },
      { instancia: 'COPA ORO', nombre: 'Copa de Oro', tabla: 'des-sc.oro.xlsx' },
      { instancia: 'COPA PLATA', nombre: 'Copa de Plata', tabla: 'des-sc.plata.xlsx' },
    ],
  },
  // Taborín "Verde" y Mañke juegan todos los partidos pero la tabla oficial no los ordena.
  // Juveniles Desarrollo M2 (M18 y M17): equipos combinados de varios clubes. La Fase I son dos zonas en una misma planilla
  // (la ronda arranca con "CENTRO - " / "SUR - "). Los partidos sin resultado (suspendidos, sin jugar) no se cargan.
  {
    clave: 'des-m2', nombre: 'UCR Juveniles Desarrollo M2', slug: 'ucr-juveniles-desarrollo-m2', original: 'UCR 2026 - JUVENILES DESARROLLO - M2',
    category: 'Juvenil', ageGrade: 'M17', ficha: { tipo: 'madre' }, letra: null, activa: 'Final Four Oro', enCurso: true, omitirSinResultado: true,
    fases: [
      { instancia: 'Fase I', prefijo: /^CENTRO - /i, nombre: 'Fase I - Zona Centro', tabla: 'des-m2.fase1.xlsx' },
      { instancia: 'Fase I', prefijo: /^SUR - /i, nombre: 'Fase I - Zona Sur', tabla: 'des-m2.fase1.xlsx' },
      { instancia: 'FINAL FOUR ORO', nombre: 'Final Four Oro', tabla: 'des-m2.oro.xlsx' },
      { instancia: 'FINAL FIVE PLATA', nombre: 'Final Five Plata', tabla: 'des-m2.plata.xlsx' },
    ],
  },
  { clave: 'fem-top8', nombre: 'Torneo Femenino Top 8', slug: 'torneo-femenino-top-8', original: 'TORNEO FEMENINO TOP 8 - MAYORES', category: 'Femenino', ageGrade: 'Mayores', gender: 'femenino', ficha: { tipo: 'fem' }, letra: null, fueraDeTabla: ['taborin-rc|VERDE', 'manke-la-calera|'] },
  { clave: 'fem-reg', nombre: 'Torneo Regional del Centro Femenino', slug: 'torneo-regional-del-centro-femenino', original: 'TORNEO REGIONAL DEL CENTRO - FEM - MAYORES', category: 'Femenino', ageGrade: 'Mayores', gender: 'femenino', ficha: { tipo: 'fem' }, letra: null },
];

/** Torneos que YA estaban en la base: sólo se corrigen (ver corregir.mjs). */
export const EXISTENTES = [
  { clave: 'regional-a', slug: 'regional-centro-a', ficha: { tipo: 'madre' }, letra: null },
  { clave: 's9b-primera', slug: 'super-9-b', ficha: { tipo: 'madre' }, letra: null },
];

// ── Clubes ───────────────────────────────────────────────────────────────────

/** Patrón del nombre de la planilla → club madre de la base. El orden importa: lo específico va antes. */
const MADRES = [
  // Combinados de Juveniles Desarrollo M2. "ONCATIVO" y "M2 - ONCATIVO" son el mismo equipo que "CUISES PORTEÑA / LAGARTOS (ONCATIVO)".
  [/^COMBINADO CAPITAL\b/, 'combinado-capital'],
  [/^COMBINADO PUNILLA\b/, 'combinado-punilla'],
  [/^COMBINADO CENTRO\b/, 'combinado-centro'],
  [/^BUITRES\b/, 'buitres-san-basilio-mackenna-mirage'],
  [/^JOCKEY RIO IV ?\/ ?AGUILAS/, 'jockey-rio-iv-aguilas-adelia-maria'],
  [/^HURONES ?\/ ?PORTE[ÑN]A/, 'hurones-portena-oncativo'],
  [/^(M2 - )?ONCATIVO$/, 'cuises-portena-rugby'],
  // Combinados femeninos (dos clubes, un equipo) y los clubes de la Liga Desarrollo.
  [/^PALERMO BAJO ?\/ ?CARLOS PAZ/, 'palermo-bajo-carlos-paz'],
  [/^CORDOBA R\.C\. ?\/ ?LA TABLADA/, 'cordoba-rc-la-tablada'],
  [/^ROSEDAL\b/, 'rosedal-r-c'],
  [/^CUISES\b/, 'cuises-portena-rugby'],
  [/^UNIVERSIDAD SIGLO 21\b/, 'universidad-siglo-21-rugby'],
  [/^ASOC\. CORDOBESA VOLANTES\b/, 'asociacion-cordobesa-volantes'],
  [/^CONAS\b/, 'conas-r-c'],
  [/^LOS TOROS DE BRINKMANN\b/, 'los-toros-de-brinkmann'],
  [/^AJEDREZ\b/, 'ajedrez-cosquin-r-c'],
  [/^SALSIPUEDES\b/, 'salsipuedes-r-c'],
  [/^VILLA LIBERTADOR\b/, 'villa-libertador-r-c'],
  [/^CHELCOS DE VILLA DEL ROSARIO\b/, 'chelcos-de-villa-del-rosario'],
  [/^SAN NICOLAS\b/, 'san-nicolas-rugby'],
  [/^MA[ÑN]KE\b/, 'manke-la-calera'],
  [/^JOCKEY RIO IV\b/, 'jockey-club-rio-cuarto'],
  [/^AGUILAS \(GRAL\. DEHEZA\)/, 'aguilas-general-deheza'],
  [/^RANQUELES\b/, 'ranqueles-rugby'],
  [/^MACKENNA\b/, 'mackenna-r-c'],
  [/^LAS IGUANAS\b/, 'las-iguanas-independiente-dolores'],
  [/^MIRAGE\b/, 'mirage-rugby-club'],
  [/^LOS PATRIOTAS\b/, 'los-patriotas-ucacha'],
  [/^CLUB DEP\. Y CULT\. UNION/, 'union-oncativo-rugby'],
  [/^CLUB UNIVERSITARIO DE VILLA MARIA\b/, 'universitario-villa-maria-rugby'],
  [/^LOS TORDOS\b/, 'los-tordos-hernando'],
  [/^NAUTICO FITZ SIMON\b/, 'nautico-fitz-simon'],
  [/^OLIVA RUGBY\b/, 'oliva-rugby-club'],
  [/^VILLA GENERAL BELGRANO\b/, 'villa-general-belgrano-r-c'],
  [/^ANDINA CATAMARCA\b/, 'catamarca-r-c'],
  [/^TALA\b/, 'tala-rugby-club'],
  [/^PALERMO BAJO\b/, 'club-palermo-bajo'],
  [/^JOCKEY (CLUB |C\. )?CORDOBA\b/, 'jockey-club-cordoba'],
  [/^JOCKEY (CLUB |C\. )?VILLA MARIA\b/, 'jockey-club-de-villa-maria'],
  [/^LA TABLADA\b/, 'club-la-tablada'],
  [/^(CORDOBA|CBA\.) ATHLETIC\b/, 'cordoba-athletic-club'],
  [/^URU[- ]CURE\b/, 'uru-cure-rugby-club'],
  [/^UNIV\. NAC\. DE CORDOBA\b/, 'universidad-nacional-de-cordoba'],
  [/^(CLUB )?UNIVERSITARIO( CBA)?\b/, 'club-universitario-de-cordoba'],
  [/^SAN MARTIN\b/, 'san-martin-de-villa-maria'],
  [/^CARLOS PAZ\b/, 'carlos-paz-rugby-club'],
  [/^CORDOBA (R\.C\.|RUGBY CLUB)/, 'cordoba-rugby-club'],
  [/^SAN FRANCISCO\b/, 'san-francisco-r-c'],
  [/^ALTA GRACIA\b/, 'alta-gracia-r-c'],
  [/^LOS CUERVOS\b/, 'los-cuervos-r-c'],
  [/^(A\.C\. )?BAGUALES\b/, 'baguales-r-c'],
  [/^LOS TEROS\b/, 'los-teros-r-c'],
  [/^CATAMARCA\b/, 'catamarca-r-c'],
  [/^LOS CHELCOS\b/, 'los-chelcos'],
  [/^(CLUB )?SOCIAL ?-? ?LA RIOJA\b/, 'club-social-la-rioja'],
  [/^(CLUB )?SOCIAL CARLOTA\b/, 'c-s-la-carlota'],
  [/^SANTA ROSA\b/, 'santa-rosa-r-c-c'],
  [/^RIO TERCERO\b/, 'rio-tercero-r-c'],
  [/^HURONES\b/, 'los-hurones'],
  [/^AERO CLUB\b/, 'aero-club-rio-iv'],
  [/^HURONES\b/, 'los-hurones'],
  [/^CLUB TABORIN\b/, 'taborin-rc'],
];

const limpio = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const esDescanso = (s) => /^(LIBRE|\.)?$/i.test(limpio(s));

/** "TALA R.C. "B"" → { madre: 'tala-rugby-club', letra: 'B' }. */
export function resolverClub(nombre, letraPorDefecto) {
  // "M15 A - PALERMO BAJO": la planilla a veces antepone la categoría y la letra.
  const prefijo = /^M\d+ ([A-Z]) - /.exec(limpio(nombre).toUpperCase());
  const n = limpio(nombre).toUpperCase().replace(/^M\d+ [A-Z] - /, '').replace(/^M2 - /, '');
  const hit = MADRES.find(([re]) => re.test(n));
  if (!hit) throw new Error(`club sin madre: "${nombre}"`);
  // La letra es la del equipo: "B", pero también "BLANCO" / "VERDE" (los dos equipos de Taborín).
  const letra = /"([A-Z]+)"\s*$/.exec(n)?.[1] ?? prefijo?.[1] ?? letraPorDefecto ?? null;
  return { madre: hit[1], letra };
}

/** Fichas que ya existen en la base con otro molde de nombre: se reusan. */
const FICHAS_EXISTENTES = {
  'club-la-tablada|inter|': 'la-tablada-intermedia',
  'club-la-tablada|pre|A': 'la-tablada-a-pre-intermedia',
  'club-la-tablada|pre|B': 'la-tablada-b-pre-intermedia',
  'tala-rugby-club|inter|': 'tala-rugby-club-intermedia',
  'tala-rugby-club|pre|A': 'tala-rugby-club-preintermedia-a',
  'tala-rugby-club|pre|B': 'tala-rugby-club-preintermedia-b',
};

/** Id y nombre de la ficha de un club en un torneo. */
const FEMENINAS = {
  'club-universitario-de-cordoba|': 'club-universitario-de-cordoba-femenino',
  'taborin-rc|': 'taborin-rc-femenino',
  'taborin-rc|BLANCO': 'taborin-rc-femenino',
  'cordoba-athletic-club|': 'cordoba-athletic-club-femenino',
  'catamarca-r-c|': 'catamarca-r-c-femenino',
};

export function fichaDe(torneo, club, nombreMadre) {
  const { tipo, edad } = torneo.ficha;
  // Liga Desarrollo: los equipos son los clubes mismos, no hay ficha de categoría.
  if (tipo === 'madre') return { id: club.madre, nombre: nombreMadre, categoria: null, existente: true };
  // Femenino: la ficha femenina del club (o la del combinado / segundo equipo, que se crea aparte).
  if (tipo === 'fem') {
    const id = FEMENINAS[`${club.madre}|${club.letra ?? ''}`] ?? `${club.madre}-femenino${club.letra ? `-${club.letra.toLowerCase()}` : ''}`;
    return { id, nombre: `${nombreMadre} Femenino${club.letra && !FEMENINAS[`${club.madre}|${club.letra}`] ? ` "${club.letra[0] + club.letra.slice(1).toLowerCase()}"` : ''}`, categoria: 'femenino', existente: true };
  }
  if (tipo === 'juvenil') {
    return { id: `${club.madre}-${edad.toLowerCase()}-${club.letra.toLowerCase()}`, nombre: `${nombreMadre} ${edad} "${club.letra}"`, categoria: edad };
  }
  const key = `${club.madre}|${tipo}|${club.letra ?? ''}`;
  if (tipo === 'inter') return { id: FICHAS_EXISTENTES[key] ?? `${club.madre}-intermedia`, nombre: `${nombreMadre} Intermedia`, categoria: 'Intermedia', existente: Boolean(FICHAS_EXISTENTES[key]) };
  return { id: FICHAS_EXISTENTES[key] ?? `${club.madre}-preintermedia-${club.letra.toLowerCase()}`, nombre: `${nombreMadre} Preintermedia "${club.letra}"`, categoria: 'Preintermedia', existente: Boolean(FICHAS_EXISTENTES[key]) };
}

// ── Planillas ────────────────────────────────────────────────────────────────

const hoja = (f) => {
  const wb = X.readFile(path.join(DIR, f));
  return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: false });
};

/** "Fecha 01" → "Fecha 1": mismo nombre de ronda que usa el resto de G22. */
const normalizarRonda = (r) => limpio(r).replace(/\bFecha ?0?(\d)\b/, 'Fecha $1');

export function leerPartidos(torneo) {
  const file = `${torneo.clave}.partidos.xlsx`;
  if (!fs.existsSync(path.join(DIR, file))) return null;
  // "LIBRE" y "." son el descanso de la fecha (equipo que no juega), no un partido.
  const filas = hoja(file).slice(1).filter((r) => r[0] && !esDescanso(r[6]) && !esDescanso(r[10]));
  // Un W.O. puede venir sin fecha: se le pone la de su ronda (la más temprana de esa ronda).
  const fechaDe = (r) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(limpio(r[4]));
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  };
  const deRonda = new Map();
  for (const r of filas) {
    const f = fechaDe(r); const k = `${limpio(r[2])}|${normalizarRonda(r[3])}`;
    if (f && (!deRonda.has(k) || f < deRonda.get(k))) deRonda.set(k, f);
  }
  return filas.map((r) => {
    const [, h] = limpio(r[4]).split(' ');
    const [a, b] = limpio(r[9]).split('-').map(Number);
    const estado = limpio(r[15]);
    const propia = fechaDe(r);
    const fecha = propia ?? deRonda.get(`${limpio(r[2])}|${normalizarRonda(r[3])}`);
    if (!fecha) throw new Error(`partido ${limpio(r[5])} sin fecha y sin otra de su ronda`);
    return {
      id: limpio(r[5]), instancia: limpio(r[2]), ronda: normalizarRonda(r[3]), fecha, hora: propia ? (h ?? null) : null, sinFecha: !propia,
      local: resolverClub(r[6], torneo.letra), visitante: resolverClub(r[10], torneo.letra), hs: a, as: b,
      // "Pendiente" con marcador distinto de 0-0 es un partido jugado cuya acta todavía no se cerró.
      estado: estado === 'Pendiente' ? (Number.isFinite(a) && Number.isFinite(b) && (a || b) ? 'final' : 'scheduled') : estado === 'Suspendido' ? 'suspended' : /walkover/i.test(estado) ? 'walkover' : 'final',
      arbitro: r[13] ? limpio(r[13]) : null,
    };
  });
}

export function leerTabla(torneo, archivo) {
  return hoja(archivo ?? `${torneo.clave}.posiciones.xlsx`).slice(2).filter((r) => r[0] && !esDescanso(r[0]) && !/^GRUPO\b/i.test(limpio(r[0]))).map((r) => ({
    club: resolverClub(r[0], torneo.letra),
    pts: Number(r[1] ?? 0), bTry: Number(r[2] ?? 0), bTantos: Number(r[3] ?? 0), bDestrezas: Number(r[4] ?? 0),
    pj: Number(r[5] ?? 0), pg: Number(r[6] ?? 0), pe: Number(r[7] ?? 0), pp: Number(r[8] ?? 0),
    tf: Number(r[9] ?? 0), tc: Number(r[10] ?? 0), tryF: Number(r[12] ?? 0), tryC: Number(r[13] ?? 0),
  }));
}

/** Clave estable de un club dentro de un torneo (madre + letra). */
export const claveDe = (c) => `${c.madre}|${c.letra ?? ''}`;
