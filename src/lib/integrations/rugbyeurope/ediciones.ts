/**
 * Catálogo de Rugby Europe: qué ediciones sincroniza el cron y cómo se llaman sus
 * equipos en la base. Puro dato, sin dependencias: lo leen el parser, la ruta y el
 * script de alta.
 *
 * Sumar una competición es sumar una fila a `EDICIONES` (y correr el alta); el
 * parser, la ruta y el cron no se tocan.
 *
 * Quedan afuera, a propósito:
 *  - Men's Rugby Europe Championship 2027: arranca el 6/2/2027 con pools y cuadro
 *    (formato mixto) y todavía no tiene un resultado con qué probar el modelo.
 *  - Los Sevens 2026 (series, Conference, U18, Beach): terminaron en agosto y el
 *    sitio no publicó la temporada nueva. Usan las mismas tablas, así que cada
 *    torneo que aparezca es una fila más.
 */

/** "TÜRKIYE " → `turkiye`. La clave de alias y de cruce. */
export function normalizarNombre(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Cómo se juega: cuadro de eliminación, tabla única o zonas (pools). */
export type FormatoRe = 'eliminatoria' | 'liga' | 'zonas';

/**
 * Espacio de nombres de los equipos. El sitio escribe "ANDORRA" tanto para la
 * selección masculina como para la femenina: el alias lleva el grupo
 * (`w:andorra`) para que cada competición resuelva a su propio club.
 */
export type GrupoRe = 'm' | 'w' | 'u18' | 'u20' | 'sc';

export interface EdicionRe {
  /** el último tramo de la dirección en el sitio: identifica la edición */
  clave: string;
  /** ruta de la página de la competición, sin dominio */
  ruta: string;
  nombre: string;
  slug: string;
  /** cómo la llama el sitio */
  original: string;
  temporada: string;
  categoria: 'Mayores' | 'U18' | 'U20';
  genero: 'masculino' | 'femenino';
  formato: FormatoRe;
  grupo: GrupoRe;
  /** ventana en la que el cron la sincroniza (YYYY-MM-DD, con unos días de margen) */
  desde: string;
  hasta: string;
}

const XV = '/competitions/season-2627/xv-competitions';

export const EDICIONES: readonly EdicionRe[] = [
  {
    clave: 'u20-championship-2026', ruta: `${XV}/mens-xv-competitions/u20-championship-2026`,
    nombre: 'Rugby Europe U20 Championship', slug: 'rugby-europe-u20-championship-2026', original: 'U20 Championship 2026',
    temporada: '2026', categoria: 'U20', genero: 'masculino', formato: 'eliminatoria', grupo: 'u20', desde: '2026-11-08', hasta: '2026-11-15',
  },
  {
    clave: 'u18-championship-2026', ruta: `${XV}/mens-xv-competitions/u18-championship-2026`,
    nombre: 'Rugby Europe U18 Championship', slug: 'rugby-europe-u18-championship-2026', original: 'U18 Championship 2026',
    temporada: '2026', categoria: 'U18', genero: 'masculino', formato: 'eliminatoria', grupo: 'u18', desde: '2026-11-07', hasta: '2026-11-14',
  },
  {
    clave: 'rugby-europe-super-cup-2026', ruta: `${XV}/mens-xv-competitions/rugby-europe-super-cup-2026`,
    nombre: 'Rugby Europe Super Cup', slug: 'rugby-europe-super-cup-2026', original: 'Rugby Europe Super Cup 2026',
    temporada: '2026', categoria: 'Mayores', genero: 'masculino', formato: 'liga', grupo: 'sc', desde: '2026-10-10', hasta: '2026-12-13',
  },
  {
    clave: 'mens-trophy-2627', ruta: `${XV}/mens-xv-competitions/mens-trophy-2627`,
    nombre: "Rugby Europe Men's Trophy", slug: 'rugby-europe-mens-trophy-2026-27', original: "Men's Trophy 26/27",
    temporada: '2026', categoria: 'Mayores', genero: 'masculino', formato: 'liga', grupo: 'm', desde: '2026-10-31', hasta: '2027-03-27',
  },
  {
    clave: 'mens-conference-202627', ruta: `${XV}/mens-xv-competitions/mens-conference-202627`,
    nombre: "Rugby Europe Men's Conference", slug: 'rugby-europe-mens-conference-2026-27', original: "Men's Conference 2026/27",
    temporada: '2026', categoria: 'Mayores', genero: 'masculino', formato: 'zonas', grupo: 'm', desde: '2026-09-26', hasta: '2027-05-01',
  },
  {
    clave: 'womens-trophy-202627', ruta: `${XV}/womens-xv-competitions/womens-trophy-202627`,
    nombre: "Rugby Europe Women's Trophy", slug: 'rugby-europe-womens-trophy-2026-27', original: "Women's Trophy 2026/27",
    temporada: '2026', categoria: 'Mayores', genero: 'femenino', formato: 'liga', grupo: 'w', desde: '2026-10-24', hasta: '2027-06-30',
  },
  {
    clave: 'womens-conference-2026-27', ruta: `${XV}/womens-xv-competitions/womens-conference-2026-27`,
    nombre: "Rugby Europe Women's Conference", slug: 'rugby-europe-womens-conference-2026-27', original: "Women's Conference 2026-27",
    temporada: '2026', categoria: 'Mayores', genero: 'femenino', formato: 'liga', grupo: 'w', desde: '2026-11-07', hasta: '2027-06-30',
  },
];

export const edicionPorClave = (clave: string) => EDICIONES.find((e) => e.clave === clave) ?? null;

const dia = (d: Date) => d.toISOString().slice(0, 10);

/** Las ediciones que corresponde mirar hoy: dentro de su ventana, con margen. */
export function edicionesActivas(ahora: Date, margenDias = 3): EdicionRe[] {
  const ms = margenDias * 86_400_000;
  const desde = dia(new Date(ahora.getTime() + ms));
  const hasta = dia(new Date(ahora.getTime() - ms));
  return EDICIONES.filter((e) => e.desde <= desde && e.hasta >= hasta);
}

// ── Equipos ──────────────────────────────────────────────────────────────────

export interface ClubDef {
  id: string;
  name: string;
  country: string;
  union: string | null;
}

interface Pais { es: string; slug: string; pais: string; union: string | null }

/** Nombre del sitio, normalizado → país en español. Las uniones son las que ya existen en la base. */
const PAISES: Record<string, Pais> = {
  andorra: { es: 'Andorra', slug: 'andorra', pais: 'Andorra', union: null },
  austria: { es: 'Austria', slug: 'austria', pais: 'Austria', union: null },
  belgium: { es: 'Bélgica', slug: 'belgica', pais: 'Bélgica', union: 'belgium-rugby' },
  bulgaria: { es: 'Bulgaria', slug: 'bulgaria', pais: 'Bulgaria', union: null },
  croatia: { es: 'Croacia', slug: 'croacia', pais: 'Croacia', union: null },
  cyprus: { es: 'Chipre', slug: 'chipre', pais: 'Chipre', union: null },
  czechia: { es: 'Chequia', slug: 'chequia', pais: 'República Checa', union: 'ceske-rugby' },
  denmark: { es: 'Dinamarca', slug: 'dinamarca', pais: 'Dinamarca', union: null },
  estonia: { es: 'Estonia', slug: 'estonia', pais: 'Estonia', union: null },
  finland: { es: 'Finlandia', slug: 'finlandia', pais: 'Finlandia', union: null },
  georgia: { es: 'Georgia', slug: 'georgia', pais: 'Georgia', union: 'georgia-rugby-union' },
  germany: { es: 'Alemania', slug: 'alemania', pais: 'Alemania', union: 'deutchland-rugby' },
  gibraltar: { es: 'Gibraltar', slug: 'gibraltar', pais: 'Gibraltar', union: null },
  greece: { es: 'Grecia', slug: 'grecia', pais: 'Grecia', union: null },
  israel: { es: 'Israel', slug: 'israel', pais: 'Israel', union: null },
  kosovo: { es: 'Kosovo', slug: 'kosovo', pais: 'Kosovo', union: null },
  lithuania: { es: 'Lituania', slug: 'lituania', pais: 'Lituania', union: null },
  luxembourg: { es: 'Luxemburgo', slug: 'luxemburgo', pais: 'Luxemburgo', union: null },
  malta: { es: 'Malta', slug: 'malta', pais: 'Malta', union: null },
  moldova: { es: 'Moldavia', slug: 'moldavia', pais: 'Moldavia', union: null },
  montenegro: { es: 'Montenegro', slug: 'montenegro', pais: 'Montenegro', union: null },
  netherlands: { es: 'Países Bajos', slug: 'paises-bajos', pais: 'Países Bajos', union: 'rugby-nederlands' },
  norway: { es: 'Noruega', slug: 'noruega', pais: 'Noruega', union: null },
  poland: { es: 'Polonia', slug: 'polonia', pais: 'Polonia', union: null },
  portugal: { es: 'Portugal', slug: 'portugal', pais: 'Portugal', union: 'portugal-rugby-union' },
  romania: { es: 'Rumania', slug: 'rumania', pais: 'Rumania', union: 'rugby-romania' },
  serbia: { es: 'Serbia', slug: 'serbia', pais: 'Serbia', union: null },
  slovenia: { es: 'Eslovenia', slug: 'eslovenia', pais: 'Eslovenia', union: null },
  spain: { es: 'España', slug: 'espana', pais: 'España', union: 'federacion-espanola-de-rugby' },
  sweden: { es: 'Suecia', slug: 'suecia', pais: 'Suecia', union: null },
  switzerland: { es: 'Suiza', slug: 'suiza', pais: 'Suiza', union: 'switzerland-rugby' },
  turkiye: { es: 'Turquía', slug: 'turquia', pais: 'Turquía', union: null },
  ukraine: { es: 'Ucrania', slug: 'ucrania', pais: 'Ucrania', union: null },
};

/** Los seis clubes de la Super Cup. Dos ya estaban en la base con otro nombre. */
const SUPER_CUP: Record<string, ClubDef> = {
  'bohemia-rugby-warriors': { id: 'bohemia-rugby-warriors', name: 'Bohemia Rugby Warriors', country: 'República Checa', union: 'ceske-rugby' },
  'brussels-devils': { id: 'brussels-devils', name: 'Brussels Devils', country: 'Bélgica', union: 'belgium-rugby' },
  'castilla-y-leon-iberians': { id: 'castilla-y-leon-iberians', name: 'Castilla y León Iberians', country: 'España', union: null },
  // `delta-r-c` es el Delta argentino (URBA): este es el neerlandés.
  delta: { id: 'delta-rugby-nl', name: 'Delta', country: 'Países Bajos', union: 'rugby-nederlands' },
  lusitanos: { id: 'lusitanos-xv', name: 'Lusitanos XV', country: 'Portugal', union: null },
  'romanian-wolves': { id: 'romanian-wolves', name: 'Romanian Wolves', country: 'Rumania', union: 'rugby-romania' },
};

const SUFIJO: Record<Exclude<GrupoRe, 'sc'>, { id: string; name: string }> = {
  m: { id: '', name: '' },
  w: { id: '-w', name: ' W' },
  u18: { id: '-u18', name: ' U18' },
  u20: { id: '-u20', name: ' U20' },
};

/**
 * El club de la base para un equipo del sitio. La selección mayor de Chequia ya
 * estaba como `republica-checa`; el resto de las categorías llevan sufijo
 * (`portugal-u20`, `espana-w`), igual que las que ya existían.
 */
export function clubDe(grupo: GrupoRe, nombreSitio: string): ClubDef | null {
  const clave = normalizarNombre(nombreSitio);
  if (grupo === 'sc') return SUPER_CUP[clave] ?? null;
  const p = PAISES[clave];
  if (!p) return null;
  if (grupo === 'm' && clave === 'czechia') return { id: 'republica-checa', name: 'República Checa', country: p.pais, union: p.union };
  return { id: p.slug + SUFIJO[grupo].id, name: p.es + SUFIJO[grupo].name, country: p.pais, union: p.union };
}

/** La clave de alias en `club_external_ids`: `w:andorra`. */
export const claveAlias = (grupo: GrupoRe, nombreSitio: string) => `${grupo}:${normalizarNombre(nombreSitio)}`;
