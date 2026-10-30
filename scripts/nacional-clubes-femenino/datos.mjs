/**
 * CANON del Nacional de Clubes Femenino 2026 en G22: clubes, zonas, fixture,
 * cruces de la segunda jornada y cuadro de honor. Datos puros, sin
 * dependencias — el que escribe en la base es `seed.mjs`.
 *
 * Fuentes:
 * - uar.com.ar, "Vuelve el Nacional de Clubes Femenino" (2/10/2026): el
 *   FIXTURE OFICIAL de las dos ramas, con horarios, cruces del domingo y
 *   duración (Mayores 12s a 2x20', Juveniles seven a 2x7'). Cuadro de honor.
 * - Afiche oficial de la UAR (Instagram @unionargentina, 30/9/2026): zonas.
 * - Wikipedia, "Torneo Nacional de Clubes Femenino": finales y subcampeones.
 *
 * Hasta el 2/10 la carga usaba horarios PROVISORIOS (la grilla de 2025) y
 * cruces de Juveniles inferidos. Con el fixture oficial se reemplazó todo y se
 * bajó a la base con `seed.mjs --fixture --execute`, que corrige horarios,
 * cruces, etiquetas y reglas de avance sin recrear los torneos.
 */

export const TEMPORADA = '2026';
export const SEDE = 'Carlos Paz Rugby Club, Villa Carlos Paz';
export const LOGO_TORNEO = '/competiciones/ar-nacional-clubes-femenino.png';

export const DIAS = {
  viernes: '2026-10-02',
  sabado: '2026-10-03',
  domingo: '2026-10-04',
};

/** Argentina no mueve el reloj; el offset va escrito para que se pueda auditar. */
export function instanteDe(dia, hora) {
  return new Date(`${DIAS[dia]}T${hora}:00-03:00`).toISOString();
}

/**
 * Clubes que hay que DAR DE ALTA. El resto ya está en `clubs` con escudo.
 * Los escudos salieron de la biblioteca de Recursos con
 * `scripts/escudos/variantes.mjs --carpeta FEMENINO` y ya están en
 * `public/clubs/<id>.png`.
 */
export const CLUBES_NUEVOS = [
  { id: 'palihue-rc', name: 'Palihue RC', city: 'Bahía Blanca', region: 'Buenos Aires', union_id: 'union-de-rugby-del-sur' },
  { id: 'taborin-rc', name: 'Taborín RC', city: 'Córdoba', region: 'Córdoba', union_id: '0c515ac1-af49-4699-b3c5-7273bc424357' },
  // No confundir con `club-las-aguilas`, que es de Tierra del Fuego. Éste es el
  // de Presidencia Roque Sáenz Peña, campeón del Regional NEA femenino 2026.
  { id: 'aguilas-rc-saenz-pena', name: 'Águilas RC', city: 'Presidencia Roque Sáenz Peña', region: 'Chaco', union_id: 'urne' },
  { id: 'indios-de-bolivar', name: 'Indios de Bolívar', city: 'Bolívar', region: 'Buenos Aires', union_id: 'uroba' },
  // Campeón juvenil 2022. No es `aguara` (Formosa) ni `aguara-guazu` (Tucumán).
  { id: 'aguara-rc-jardin-america', name: 'Aguará RC', city: 'Jardín América', region: 'Misiones', union_id: 'union-de-rugby-de-misiones' },
];

/** Clubes que ya existían y sólo necesitan el escudo que les faltaba. */
export const ESCUDOS_A_COMPLETAR = ['bajo-hondo'];

/**
 * Cómo se leyó cada nombre del afiche. Los ambiguos, anotados:
 * - "U. de Mendoza" es Universitario de Mendoza (Cuyo), no la Universidad.
 * - "U. de Córdoba" es el Club Universitario de Córdoba, campeón 2022.
 * - "Regatas RC" es Regatas de Resistencia, subcampeón del Regional NEA 2026
 *   (perdió la final 10-0 con Águilas; clasificaban los dos).
 * - "Tiro Federal Rugby" es Tiro Federal de Salta, como en 2025.
 * - Los de URBA van con el club MADRE (`la-plata`, `ciudad-de-buenos-aires`),
 *   no con sus fichas `-femenino` de los torneos de URBA: los del interior no
 *   tienen esa ficha y el torneo ya dice que es femenino.
 */
export const NOMBRES = {
  'cardenales-r-c': 'Cardenales RC',
  'universitario-de-mendoza': 'Universitario de Mendoza',
  'cha-roga-r-c': 'Cha Roga',
  'aguilas-rc-saenz-pena': 'Águilas RC',
  'aguara-guazu': 'Aguará Guazú',
  'palihue-rc': 'Palihue RC',
  'club-universitario-de-cordoba': 'Universitario de Córdoba',
  'taborin-rc': 'Taborín RC',
  'marabunta-r-c': 'Marabunta RC',
  'la-plata': 'La Plata RC',
  'ciudad-de-buenos-aires': 'Ciudad de Buenos Aires',
  'regatas-de-resistencia': 'Regatas de Resistencia',
  'indios-de-bolivar': 'Indios de Bolívar',
  capri: 'CAPRI',
  'bajo-hondo': 'Bajo Hondo RC',
  'tiro-federal-salta': 'Tiro Federal',
  'trelew-r-c': 'Trelew RC',
  'cordoba-athletic-club': 'Córdoba Athletic',
};

/**
 * Los dos torneos. En `final`, un cruce sale de la TABLA de una zona
 * (`{ pos, zona }`) o de OTRO PARTIDO (`{ de, resultado }`); lo segundo lo
 * resuelve solo el motor de avance.
 */
export const TORNEOS = [
  {
    clave: 'mayores',
    nombre: 'Nacional de Clubes Femenino',
    slug: 'nacional-de-clubes-femenino',
    edad: 'Mayores',
    modalidad: 'Rugby de 12 jugadoras',
    edicion: 'XV',
    desde: DIAS.viernes,
    hasta: DIAS.domingo,
    zonas: [
      { nombre: 'Zona 1', clubes: ['cardenales-r-c', 'universitario-de-mendoza', 'cha-roga-r-c'] },
      { nombre: 'Zona 2', clubes: ['aguilas-rc-saenz-pena', 'aguara-guazu', 'palihue-rc'] },
      { nombre: 'Zona 3', clubes: ['club-universitario-de-cordoba', 'taborin-rc', 'marabunta-r-c'] },
      { nombre: 'Zona 4', clubes: ['la-plata', 'ciudad-de-buenos-aires', 'regatas-de-resistencia'] },
    ],
    // Zonas de tres, todas contra todas el viernes. Grilla oficial de la UAR:
    // un partido cada 50 minutos desde las 10:00.
    fechas: [
      { n: 1, nombre: 'Fase clasificatoria', dia: 'viernes' },
      { n: 2, nombre: 'Definiciones', dia: 'domingo' },
    ],
    grupos: [
      { n: 1, fecha: 1, hora: '10:00', zona: 'Zona 4', local: 'la-plata', visitante: 'regatas-de-resistencia' },
      { n: 2, fecha: 1, hora: '10:50', zona: 'Zona 3', local: 'club-universitario-de-cordoba', visitante: 'marabunta-r-c' },
      { n: 3, fecha: 1, hora: '11:40', zona: 'Zona 2', local: 'aguilas-rc-saenz-pena', visitante: 'palihue-rc' },
      { n: 4, fecha: 1, hora: '12:30', zona: 'Zona 1', local: 'cardenales-r-c', visitante: 'universitario-de-mendoza' },
      { n: 5, fecha: 1, hora: '13:20', zona: 'Zona 4', local: 'ciudad-de-buenos-aires', visitante: 'regatas-de-resistencia' },
      { n: 6, fecha: 1, hora: '14:10', zona: 'Zona 3', local: 'taborin-rc', visitante: 'marabunta-r-c' },
      { n: 7, fecha: 1, hora: '15:00', zona: 'Zona 2', local: 'aguara-guazu', visitante: 'palihue-rc' },
      { n: 8, fecha: 1, hora: '15:50', zona: 'Zona 1', local: 'cha-roga-r-c', visitante: 'universitario-de-mendoza' },
      { n: 9, fecha: 1, hora: '16:40', zona: 'Zona 4', local: 'la-plata', visitante: 'ciudad-de-buenos-aires' },
      { n: 10, fecha: 1, hora: '17:30', zona: 'Zona 3', local: 'club-universitario-de-cordoba', visitante: 'taborin-rc' },
      { n: 11, fecha: 1, hora: '18:20', zona: 'Zona 2', local: 'aguilas-rc-saenz-pena', visitante: 'aguara-guazu' },
      { n: 12, fecha: 1, hora: '19:30', zona: 'Zona 1', local: 'cardenales-r-c', visitante: 'cha-roga-r-c' },
    ],
    // El domingo se define TODA la tabla: los primeros juegan del 1º al 4º,
    // los segundos del 5º al 8º y los terceros del 9º al 12º.
    faseFinalNombre: 'Definiciones por puesto',
    fechaFinal: 2,
    final: [
      { n: 13, hora: '09:00', definicion: 'Semifinal 9º puesto', local: { pos: 3, zona: 'Zona 1' }, visitante: { pos: 3, zona: 'Zona 4' } },
      { n: 14, hora: '09:50', definicion: 'Semifinal 9º puesto', local: { pos: 3, zona: 'Zona 2' }, visitante: { pos: 3, zona: 'Zona 3' } },
      { n: 15, hora: '10:40', definicion: 'Semifinal 5º puesto', local: { pos: 2, zona: 'Zona 1' }, visitante: { pos: 2, zona: 'Zona 4' } },
      { n: 16, hora: '11:30', definicion: 'Semifinal 5º puesto', local: { pos: 2, zona: 'Zona 2' }, visitante: { pos: 2, zona: 'Zona 3' } },
      { n: 17, hora: '12:20', definicion: 'Semifinal', local: { pos: 1, zona: 'Zona 2' }, visitante: { pos: 1, zona: 'Zona 3' } },
      { n: 18, hora: '13:10', definicion: 'Semifinal', local: { pos: 1, zona: 'Zona 1' }, visitante: { pos: 1, zona: 'Zona 4' } },
      { n: 19, hora: '14:00', definicion: '11º puesto', local: { de: 13, resultado: 'loser' }, visitante: { de: 14, resultado: 'loser' } },
      { n: 20, hora: '14:50', definicion: '9º puesto', local: { de: 13, resultado: 'winner' }, visitante: { de: 14, resultado: 'winner' } },
      { n: 21, hora: '15:40', definicion: '7º puesto', local: { de: 15, resultado: 'loser' }, visitante: { de: 16, resultado: 'loser' } },
      { n: 22, hora: '16:30', definicion: '5º puesto', local: { de: 15, resultado: 'winner' }, visitante: { de: 16, resultado: 'winner' } },
      { n: 23, hora: '17:20', definicion: '3º puesto', local: { de: 17, resultado: 'loser' }, visitante: { de: 18, resultado: 'loser' } },
      // La UAR la publicó como un segundo "P23": es el P24.
      { n: 24, hora: '18:10', definicion: 'Final', local: { de: 17, resultado: 'winner' }, visitante: { de: 18, resultado: 'winner' } },
    ],
    // Cuadro de honor. 2020 no se jugó. `nota` va a la temporada.
    palmares: [
      { anio: '2011', campeon: 'sixty-r-c', nota: 'Final: Sixty 21-19 Cardenales' },
      { anio: '2012', campeon: 'cardenales-r-c', nota: 'Final: Cardenales 17-5 Sixty' },
      { anio: '2013', campeon: 'cardenales-r-c', nota: 'Final: Cardenales 17-7 CAPRI' },
      { anio: '2014', campeon: 'cardenales-r-c', nota: 'Final: Cardenales 21-0 Centro Naval' },
      { anio: '2015', campeon: 'cardenales-r-c', nota: 'Final: Cardenales 19-14 La Plata' },
      { anio: '2016', campeon: 'capri', nota: 'Final: CAPRI 10-5 Cardenales' },
      { anio: '2017', campeon: 'la-plata', nota: 'Final: La Plata 12-0 Cha Roga' },
      { anio: '2018', campeon: 'universidad-nacional-de-cordoba', nota: 'Final: UNC 31-10 La Plata' },
      { anio: '2019', campeon: 'centro-naval', nota: 'Final: Centro Naval 5-0 UNC' },
      { anio: '2021', campeon: 'aguara-guazu', nota: 'Final: Aguará Guazú 10-0 CAPRI' },
      { anio: '2022', campeon: 'club-universitario-de-cordoba', nota: 'Final: Universitario de Córdoba 17-0 Cardenales' },
      { anio: '2023', campeon: 'cardenales-r-c', nota: 'Final: Cardenales 24-15 Universitario de Córdoba' },
      { anio: '2024', campeon: 'taborin-rc', nota: 'Final: Taborín 17-7 La Plata' },
      { anio: '2025', campeon: 'cardenales-r-c', nota: 'Final: Cardenales 22-5 Águilas RC. Plata: La Plata; Bronce: Universitario' },
    ],
  },
  {
    clave: 'juveniles',
    nombre: 'Nacional de Clubes Femenino Juveniles',
    slug: 'nacional-de-clubes-femenino-juveniles',
    edad: 'Juveniles',
    modalidad: 'Seven',
    edicion: 'VII',
    desde: DIAS.viernes,
    hasta: DIAS.domingo,
    zonas: [
      { nombre: 'Zona 1', clubes: ['indios-de-bolivar', 'capri', 'bajo-hondo', 'tiro-federal-salta'] },
      { nombre: 'Zona 2', clubes: ['trelew-r-c', 'ciudad-de-buenos-aires', 'cordoba-athletic-club', 'taborin-rc'] },
    ],
    // Zonas de cuatro, todas contra todas: dos fechas el viernes (mañana y
    // tarde) y la tercera el domingo a la mañana. Grilla oficial de la UAR.
    fechas: [
      { n: 1, nombre: 'Fecha 1', dia: 'viernes' },
      { n: 2, nombre: 'Fecha 2', dia: 'viernes' },
      { n: 3, nombre: 'Fecha 3', dia: 'domingo' },
      { n: 4, nombre: 'Finales', dia: 'domingo' },
    ],
    grupos: [
      { n: 1, fecha: 1, hora: '10:00', zona: 'Zona 2', local: 'trelew-r-c', visitante: 'ciudad-de-buenos-aires' },
      { n: 2, fecha: 1, hora: '10:20', zona: 'Zona 1', local: 'indios-de-bolivar', visitante: 'capri' },
      { n: 3, fecha: 1, hora: '10:40', zona: 'Zona 2', local: 'cordoba-athletic-club', visitante: 'taborin-rc' },
      { n: 4, fecha: 1, hora: '11:00', zona: 'Zona 1', local: 'bajo-hondo', visitante: 'tiro-federal-salta' },
      { n: 5, fecha: 2, hora: '16:00', zona: 'Zona 2', local: 'trelew-r-c', visitante: 'taborin-rc' },
      { n: 6, fecha: 2, hora: '16:20', zona: 'Zona 1', local: 'indios-de-bolivar', visitante: 'tiro-federal-salta' },
      { n: 7, fecha: 2, hora: '16:40', zona: 'Zona 2', local: 'cordoba-athletic-club', visitante: 'ciudad-de-buenos-aires' },
      { n: 8, fecha: 2, hora: '17:00', zona: 'Zona 1', local: 'bajo-hondo', visitante: 'capri' },
      { n: 9, fecha: 3, hora: '09:00', zona: 'Zona 2', local: 'ciudad-de-buenos-aires', visitante: 'taborin-rc' },
      { n: 10, fecha: 3, hora: '09:20', zona: 'Zona 1', local: 'capri', visitante: 'tiro-federal-salta' },
      { n: 11, fecha: 3, hora: '09:50', zona: 'Zona 2', local: 'cordoba-athletic-club', visitante: 'trelew-r-c' },
      { n: 12, fecha: 3, hora: '10:10', zona: 'Zona 1', local: 'bajo-hondo', visitante: 'indios-de-bolivar' },
    ],
    // Semis cruzadas entre zonas y después los cuatro partidos por puesto.
    faseFinalNombre: 'Definiciones por puesto',
    fechaFinal: 4,
    final: [
      { n: 13, hora: '12:10', definicion: 'Semifinal 5º puesto', local: { pos: 3, zona: 'Zona 1' }, visitante: { pos: 4, zona: 'Zona 2' } },
      { n: 14, hora: '12:30', definicion: 'Semifinal 5º puesto', local: { pos: 3, zona: 'Zona 2' }, visitante: { pos: 4, zona: 'Zona 1' } },
      { n: 15, hora: '12:50', definicion: 'Semifinal', local: { pos: 1, zona: 'Zona 1' }, visitante: { pos: 2, zona: 'Zona 2' } },
      { n: 16, hora: '13:10', definicion: 'Semifinal', local: { pos: 1, zona: 'Zona 2' }, visitante: { pos: 2, zona: 'Zona 1' } },
      { n: 17, hora: '16:00', definicion: '7º puesto', local: { de: 13, resultado: 'loser' }, visitante: { de: 14, resultado: 'loser' } },
      { n: 18, hora: '16:20', definicion: '5º puesto', local: { de: 13, resultado: 'winner' }, visitante: { de: 14, resultado: 'winner' } },
      { n: 19, hora: '16:40', definicion: '3º puesto', local: { de: 15, resultado: 'loser' }, visitante: { de: 16, resultado: 'loser' } },
      { n: 20, hora: '17:00', definicion: 'Final', local: { de: 15, resultado: 'winner' }, visitante: { de: 16, resultado: 'winner' } },
    ],
    // La categoría existe desde 2019; 2020 no se jugó.
    palmares: [
      { anio: '2019', campeon: 'club-social-la-rioja' },
      { anio: '2021', campeon: 'baguales-r-c' },
      { anio: '2022', campeon: 'aguara-rc-jardin-america' },
      { anio: '2023', campeon: 'cordoba-athletic-club' },
      { anio: '2024', campeon: 'cardenales-r-c' },
      { anio: '2025', campeon: 'rivadavia-rugby-club', nota: 'Final: Rivadavia 20-5 Tiro Federal. Plata: Marabunta' },
    ],
  },
];

export const PUNTOS = { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1 };

/** Como ARRAY: el `{ order: [...] }` viejo falla el `Array.isArray` del motor. */
export const TIEBREAKERS = [
  { metric: 'points', label: 'Puntos obtenidos', priority: 1, enabled: true },
  { metric: 'head_to_head', label: 'Resultado entre sí', priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'tries_for', label: 'Tries a favor', priority: 4, enabled: true },
  { metric: 'won', label: 'Partidos ganados', priority: 5, enabled: true },
];

/**
 * Las TRES formas del puntaje a propósito (canónica del gestor, legacy del
 * motor y `standings` del reglamento): cada consumidor lee una distinta y el
 * que no encuentra la suya cae a los defaults sin avisar.
 */
export const RULESET = {
  pointsWin: PUNTOS.win,
  pointsDraw: PUNTOS.draw,
  pointsLoss: PUNTOS.loss,
  pointsBonusTry: PUNTOS.bonusTry,
  pointsBonusLoss: PUNTOS.bonusLoss,
  points: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
  pointsSystem: { ...PUNTOS, allowBonusPoints: true },
  bonus: {
    offensive: { tries: 4, points: PUNTOS.bonusTry },
    defensive: { margin: 7, points: PUNTOS.bonusLoss },
  },
  standings: {
    points_base: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
    bonus_rules: [
      { id: 'try_bonus', label: '4+ Tries', points_awarded: PUNTOS.bonusTry },
      { id: 'close_loss', label: 'Derrota por 7 o menos', points_awarded: PUNTOS.bonusLoss },
    ],
  },
  competition: { format_type: 'groups', parameters: { season_model: 'single_event' } },
  tiebreakers: TIEBREAKERS,
  organizers: [{ name: 'UAR', union_id: 'union-argentina-de-rugby', is_primary: true }],
};
