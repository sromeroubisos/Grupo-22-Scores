/**
 * Visita de la Academia Nacional Italiana M19 (septiembre 2026): los datos, sin
 * código de escritura. Los consume `seed.mjs`.
 *
 * Fuente: UAR, "Se confirmó el plantel M19 que se medirá ante la Academia de
 * Italia" (https://uar.com.ar/se-confirmo-el-plantel-m19-que-se-medira-ante-la-academia-de-italia/).
 *
 * El plantel argentino se partió en dos bloques. El Bloque 1 (estos 27) entrenó
 * con Italia el viernes 11 y jugó el domingo 13 a las 16 en Hindú. El Bloque 2
 * entrena el martes 15 y juega el viernes 18 a las 11:30; su lista la UAR la
 * comunica más adelante, así que ese partido entra sin plantel y sin cancha.
 */

export const ARGENTINA = {
  id: 'argentina-m19',
  name: 'Argentina M19',
  union_id: 'union-argentina-de-rugby',
  country: 'Argentina',
};

export const ITALIA = {
  id: 'italia-m19',
  name: 'Italia M19',
  union_id: 'ital-rugby',
  country: 'Italia',
  // El azzurro de `italia-u18` e `italia-u20`, no el verde que sale del escudo:
  // el color de club de Italia es el de la camiseta, no el de la bandera.
  primary_color: '#0051a2',
};

/**
 * La lista viene ALFABÉTICA, no por puesto: el orden no es la camiseta, así que
 * `jersey_number` y `position` quedan en null (ver planteles del ARC 2026).
 *
 * `club` es el `clubs.id` del club de origen cuando existe en la base; ahí vive
 * la ficha del jugador, y la convocatoria es una membresía de `argentina-m19`.
 * Añatuya RC no está cargado: la ficha de Salas cuelga de la selección.
 */
export const BLOQUE_1 = [
  { apellido: 'Aguilar', nombre: 'Felipe', clubTexto: 'Tala RC', union: 'Cordobesa', club: 'tala-rugby-club' },
  { apellido: 'Allende', nombre: 'Nicolás', clubTexto: 'Universitario', union: 'Cordobesa', club: 'club-universitario-de-cordoba' },
  { apellido: 'Arrieta', nombre: 'Lucas', clubTexto: 'Universitario', union: 'Tucumán', club: 'universitario-de-tucuman' },
  { apellido: 'Binda', nombre: 'Tomás', clubTexto: 'Jockey Club Córdoba', union: 'Cordobesa', club: 'jockey-club-cordoba' },
  { apellido: 'Brunetti', nombre: 'Santino', clubTexto: 'Liceo RC', union: 'Cuyo', club: 'liceo-rugby-club' },
  { apellido: 'Cabello', nombre: 'Santiago', clubTexto: 'Urú Curé RC', union: 'Cordobesa', club: 'uru-cure-rugby-club' },
  { apellido: 'Cocomarola', nombre: 'Joaquín', clubTexto: 'Aranduroga RC', union: 'Nordeste', club: 'aranduroga-r-c' },
  { apellido: 'Dapas', nombre: 'Santiago', clubTexto: 'Mendoza RC', union: 'Cuyo', club: 'mendoza-rugby-club' },
  { apellido: 'Dománico', nombre: 'Bautista', clubTexto: 'San Juan RC', union: 'Sanjuanina', club: 'san-juan-rugby-club' },
  { apellido: 'Egea', nombre: 'Lorenzo', clubTexto: 'Santiago Lawn Tennis Club', union: 'Santiagueña', club: 'santiago-lawn-tennis-club' },
  { apellido: 'Ferreyra', nombre: 'Cristóbal', clubTexto: 'Córdoba Athletic Club', union: 'Cordobesa', club: 'cordoba-athletic-club' },
  { apellido: 'García', nombre: 'Agustín', clubTexto: 'Logaritmo RC', union: 'Rosario', club: 'logaritmo-rugby-club' },
  { apellido: 'Gómez', nombre: 'Ignacio', clubTexto: 'Santa Fe RC', union: 'Santafesina', club: 'santa-fe-r-c' },
  { apellido: 'Haschisch', nombre: 'León', clubTexto: 'Palermo Bajo', union: 'Cordobesa', club: 'club-palermo-bajo' },
  { apellido: 'Magliano', nombre: 'Alejo', clubTexto: 'C.P.B.M.', union: 'Cuyo', club: 'c-p-b-m' },
  { apellido: 'Martos', nombre: 'Santiago', clubTexto: 'Jockey Club de Salta', union: 'Salta', club: 'jockey-club-salta' },
  { apellido: 'Morea', nombre: 'Baltazar', clubTexto: 'Belgrano Athletic Club', union: 'URBA', club: 'belgrano-athletic' },
  { apellido: 'Ojeda', nombre: 'Walter', clubTexto: 'Tucumán RC', union: 'Tucumán', club: 'tucuman-rugby-club' },
  { apellido: 'Onorato', nombre: 'Jorge', clubTexto: 'Universitario de Santa Fe', union: 'Santafesina', club: 'universitario-de-santa-fe' },
  { apellido: 'Otero', nombre: 'Bautista', clubTexto: 'La Tablada', union: 'Cordobesa', club: 'club-la-tablada' },
  { apellido: 'Pelourson', nombre: 'Bautista', clubTexto: 'Jockey Club Venado Tuerto', union: 'Rosario', club: 'jockey-club-de-venado-tuerto' },
  { apellido: 'Salas', nombre: 'Rafael', clubTexto: 'Añatuya RC', union: 'Santiagueña', club: null },
  { apellido: 'Schiavi', nombre: 'Lucas', clubTexto: 'Taraguy RC', union: 'Nordeste', club: 'taraguy-r-c' },
  { apellido: 'Severine Luna', nombre: 'Samuel', clubTexto: 'La Tablada', union: 'Cordobesa', club: 'club-la-tablada' },
  { apellido: 'Sosa', nombre: 'Thiago', clubTexto: 'Los Tordos RC', union: 'Cuyo', club: 'los-tordos-rugby-club' },
  { apellido: 'Vázquez Calcaterra', nombre: 'Benjamín', clubTexto: 'San Martín RC', union: 'Cordobesa', club: 'san-martin-de-villa-maria' },
  { apellido: 'Zurita', nombre: 'Juan Pablo', clubTexto: 'Jockey Club de Tucumán', union: 'Tucumán', club: 'jockey-club-de-tucuman' },
];

/** Plazo de la convocatoria del Bloque 1: del entrenamiento compartido al partido. */
export const PLAZO_BLOQUE_1 = { desde: '2026-09-11', hasta: '2026-09-13' };

/**
 * El feed usa el rótulo como nombre del "torneo" del amistoso, y "amistoso de
 * seleccionados" es la forma que `BOTH_AUDIENCES_PATTERNS` pone en las dos
 * pestañas de la portada: el partido figura en Mayores Y en Juveniles.
 */
const ROTULO = 'Amistoso de seleccionados M19 · Academia Italiana 2026';

/**
 * Horas de Argentina con el offset EXPLÍCITO (-03:00): "las 16" son las 16 de
 * Buenos Aires desde cualquier huso.
 */
export const PARTIDOS = [
  {
    externalId: 'uar:2026-09-13-argentina-m19-italia-m19-bloque-1',
    local: ARGENTINA.id,
    visitante: ITALIA.id,
    dateTime: '2026-09-13T16:00:00-03:00',
    venue: 'Hindú Club',
    status: 'final',
    // Italia ganó 38-21 (dato del usuario, 14/09/2026). Sin crónica todavía:
    // ni anotadores ni formaciones.
    score: { home: 21, away: 38 },
    roundLabel: ROTULO,
    notes: 'Bloque 1 del plantel M19. Abierto al público. Entrenamiento compartido el viernes 11/09 en Hindú.',
  },
  {
    externalId: 'uar:2026-09-18-argentina-m19-italia-m19-bloque-2',
    local: ARGENTINA.id,
    visitante: ITALIA.id,
    dateTime: '2026-09-18T11:30:00-03:00',
    // La nota solo ubica en Hindú los encuentros del Bloque 1.
    venue: null,
    status: 'scheduled',
    score: null,
    roundLabel: ROTULO,
    notes: 'Bloque 2 del plantel M19 (lista a confirmar por la UAR). Entrenamiento compartido el martes 15/09.',
  },
];
