/**
 * CANON del M16 Desarrollo Norte 2026 en G22: los doce seleccionados, las
 * cuatro zonas con los doce partidos de la jornada 1 y los doce cruces de la
 * jornada 2 repartidos en tres copas. Datos puros, sin dependencias — el que
 * escribe en la base es `norte-2026-seed.mjs`.
 *
 * El torneo `m16-desarrollo-norte` ya existe (lo creó `seed.mjs` con el cuadro
 * de honor 2023-2025): esta carga le agrega la temporada 2026 y nada más.
 *
 * Fuente: parte oficial de la UAR (Club Los Miuras, Junín, 11 al 13 de
 * septiembre de 2026) y el parte de resultados de la jornada 1.
 */

export const TORNEO_SLUG = 'm16-desarrollo-norte';
export const TEMPORADA = '2026';
export const NOMBRE = 'M16 Desarrollo Norte';

export const SEDE = 'Club Los Miuras, Junín, Buenos Aires';

/** Jornada 1 el viernes, jornada 2 el domingo. El sábado es la charla del Plan Nacional de conmoción. */
export const DIAS = { 1: '2026-09-11', 2: '2026-09-13' };

/**
 * El instante en UTC, que es como lo guarda la base. El offset va escrito
 * (`-03:00`) en vez de sumarle tres horas a mano.
 */
export function instanteDe(jornada, hora) {
  return new Date(`${DIAS[jornada]}T${hora}:00-03:00`).toISOString();
}

/**
 * Los siete seleccionados M16 que todavía no existen. Los otros cinco
 * (Buenos Aires, Oeste, Entrerriana, Mar del Plata, Andina) ya están desde la
 * carga del palmarés.
 *
 * `escudo.m17`: el escudo es el mismo archivo que ya usa el Argentino Juvenil
 * M17, ya redimensionado en `public/clubs/`. `escudo.recursos`: no juegan el
 * M17 y el escudo sale de la carpeta de Recursos.
 *
 * Las siete uniones SÍ están en `unions` —cinco con id UUID y `sport` en null,
 * que es por lo que el seed del M17 no las encontró y dejó esos clubes sin
 * vínculo—. Acá van vinculadas.
 */
export const CLUBES_NUEVOS = [
  { id: 'cordobesa-m16',   name: 'Cordobesa M16',   union_id: '0c515ac1-af49-4699-b3c5-7273bc424357', region: 'Córdoba',             escudo: { m17: 'cordobesa-m17' } },
  { id: 'cuyo-m16',        name: 'Cuyo M16',        union_id: '40159cd1-5876-4720-b953-d639b09d5f5b', region: 'Cuyo',                escudo: { m17: 'cuyo-m17' } },
  { id: 'rosario-m16',     name: 'Rosario M16',     union_id: 'a37639f8-197c-44c6-a095-2f16f40d7b04', region: 'Rosario',             escudo: { m17: 'rosario-m17' } },
  { id: 'salta-m16',       name: 'Salta M16',       union_id: '4263f793-04d6-4dd9-9b43-b7e9823bf721', region: 'Salta',               escudo: { m17: 'salta-m17' } },
  { id: 'tucuman-m16',     name: 'Tucumán M16',     union_id: 'e558d0d9-c01b-40ce-a1c7-e533cb81f97c', region: 'Tucumán',             escudo: { m17: 'tucuman-m17' } },
  // La versión de 1080 px es un reescalado del de 105 px, pero cuadrado como el
  // resto del set: a 256 px se ve igual y no queda achatado.
  { id: 'misiones-m16',    name: 'Misiones M16',    union_id: 'union-de-rugby-de-misiones',           region: 'Misiones',            escudo: { recursos: '1080x1080/SELECCIONADOS UNIONES/MISIONES.png' } },
  { id: 'santiaguena-m16', name: 'Santiagueña M16', union_id: 'union-santiaguena-de-rugby',           region: 'Santiago del Estero', escudo: { recursos: 'SELECCIONADOS UNIONES/WEB/Santiago del Estero.png' } },
];

/**
 * Las cuatro zonas en dos niveles. El nivel va en el nombre de la zona porque
 * es lo que explica el cruce: el 1º de una zona de Desarrollo juega la Copa de
 * Plata contra un 3º de Campeonato.
 */
export const ZONAS = [
  { clave: 'Zona 1', nombre: 'Zona 1 · Campeonato', clubes: ['buenos-aires-m16', 'rosario-m16', 'entrerriana-m16'] },
  { clave: 'Zona 2', nombre: 'Zona 2 · Campeonato', clubes: ['mar-del-plata-m16', 'oeste-m16', 'cordobesa-m16'] },
  { clave: 'Zona 3', nombre: 'Zona 3 · Desarrollo', clubes: ['tucuman-m16', 'andina-m16', 'salta-m16'] },
  { clave: 'Zona 4', nombre: 'Zona 4 · Desarrollo', clubes: ['misiones-m16', 'cuyo-m16', 'santiaguena-m16'] },
];

/**
 * La jornada 1, en el orden y con los horarios del parte.
 *
 * `bonusLocal` / `bonusVisitante`: el parte no publicó tries, así que el bonus
 * ofensivo se DESPEJA de la tabla publicada sobre el reglamento 4/2/0 más bonus
 * (ofensivo por 4 tries, defensivo por perder por 7 o menos). Cierra de una
 * sola forma, porque cuatro tries son como mínimo 20 puntos:
 *
 * - Zona 1: Buenos Aires 10 = dos triunfos + un bonus en cada uno. Rosario 5 =
 *   triunfo + bonus, y sólo puede estar en el 34-10 (en el 44-0 no anotó).
 * - Zona 2: Mar del Plata 6 = triunfo 24-0 + defensivo por el 14-12 + un
 *   ofensivo, que sólo entra en el 24-0 (12 puntos no son cuatro tries).
 *   Cordobesa 5 = triunfo + defensivo por el 12-6. Oeste 4 = el 12-6 a secas.
 * - Zona 3: Andina 8 = dos triunfos sin bonus. Tucumán 5 = el 29-10 con bonus.
 * - Zona 4: Cuyo 10 = dos triunfos con bonus. Misiones 5 = el 31-7 con bonus.
 *
 * Los dos defensivos (P2 y P6) los habría dado el motor solo; los ofensivos no,
 * y por eso los partidos van con `points_autocalculated: false`.
 */
export const JORNADA_1 = [
  { n: 1,  hora: '09:30', zona: 'Zona 4', local: 'santiaguena-m16',   visitante: 'misiones-m16',      ptsLocal:  7, ptsVisitante: 31, bonusLocal: 0, bonusVisitante: 1 },
  { n: 2,  hora: '09:30', zona: 'Zona 2', local: 'cordobesa-m16',     visitante: 'mar-del-plata-m16', ptsLocal: 14, ptsVisitante: 12, bonusLocal: 0, bonusVisitante: 1 },
  { n: 3,  hora: '10:20', zona: 'Zona 3', local: 'salta-m16',         visitante: 'tucuman-m16',       ptsLocal: 10, ptsVisitante: 29, bonusLocal: 0, bonusVisitante: 1 },
  { n: 4,  hora: '10:20', zona: 'Zona 1', local: 'entrerriana-m16',   visitante: 'buenos-aires-m16',  ptsLocal:  0, ptsVisitante: 72, bonusLocal: 0, bonusVisitante: 1 },
  { n: 5,  hora: '12:00', zona: 'Zona 4', local: 'cuyo-m16',          visitante: 'santiaguena-m16',   ptsLocal: 31, ptsVisitante:  0, bonusLocal: 1, bonusVisitante: 0 },
  { n: 6,  hora: '12:00', zona: 'Zona 2', local: 'oeste-m16',         visitante: 'cordobesa-m16',     ptsLocal: 12, ptsVisitante:  6, bonusLocal: 0, bonusVisitante: 1 },
  { n: 7,  hora: '12:50', zona: 'Zona 3', local: 'andina-m16',        visitante: 'salta-m16',         ptsLocal: 21, ptsVisitante: 11, bonusLocal: 0, bonusVisitante: 0 },
  { n: 8,  hora: '12:50', zona: 'Zona 1', local: 'rosario-m16',       visitante: 'entrerriana-m16',   ptsLocal: 34, ptsVisitante: 10, bonusLocal: 1, bonusVisitante: 0 },
  { n: 9,  hora: '16:00', zona: 'Zona 4', local: 'misiones-m16',      visitante: 'cuyo-m16',          ptsLocal: 10, ptsVisitante: 29, bonusLocal: 0, bonusVisitante: 1 },
  { n: 10, hora: '16:00', zona: 'Zona 2', local: 'mar-del-plata-m16', visitante: 'oeste-m16',         ptsLocal: 24, ptsVisitante:  0, bonusLocal: 1, bonusVisitante: 0 },
  { n: 11, hora: '16:50', zona: 'Zona 3', local: 'tucuman-m16',       visitante: 'andina-m16',        ptsLocal:  3, ptsVisitante: 17, bonusLocal: 0, bonusVisitante: 0 },
  { n: 12, hora: '16:50', zona: 'Zona 1', local: 'buenos-aires-m16',  visitante: 'rosario-m16',       ptsLocal: 44, ptsVisitante:  0, bonusLocal: 1, bonusVisitante: 0 },
];

/** Las zonas al cierre de la jornada 1, como las publicó el parte. `norte-2026-verificar.mjs` las compara. */
export const TABLA_J1 = {
  'Zona 1': [{ club: 'buenos-aires-m16', pts: 10 }, { club: 'rosario-m16', pts: 5 }, { club: 'entrerriana-m16', pts: 0 }],
  'Zona 2': [{ club: 'mar-del-plata-m16', pts: 6 }, { club: 'cordobesa-m16', pts: 5 }, { club: 'oeste-m16', pts: 4 }],
  'Zona 3': [{ club: 'andina-m16', pts: 8 }, { club: 'tucuman-m16', pts: 5 }, { club: 'salta-m16', pts: 0 }],
  'Zona 4': [{ club: 'cuyo-m16', pts: 10 }, { club: 'misiones-m16', pts: 5 }, { club: 'santiaguena-m16', pts: 0 }],
};

/**
 * La jornada 2: tres copas de cuatro, cada una con sus semis, su final y su
 * partido por el puesto de abajo. Cada copa es una FASE playoff aparte: la
 * página del torneo arma un cuadro por fase y ofrece un selector entre ellas,
 * mientras que tres copas dentro de una sola fase salen como seis columnas
 * en fila.
 *
 * Una semi sale de la TABLA (`{ pos, zona }`) y ya tiene rivales, porque la
 * jornada 1 terminó. La final y el partido por el puesto salen de OTRO PARTIDO
 * (`{ de, resultado }`) y los completa solo el motor de avance.
 *
 * `ronda` es el nombre que lee el cuadro público: "Final" es la columna héroe
 * con la tira de campeón —la Copa de Plata y la de Bronce tienen campeón—, y
 * "3.er puesto" va compacto debajo de ella. "7.º puesto" y "11.º puesto" no
 * son un 3.er puesto para el cuadro y salen como columna propia.
 */
export const COPAS = [
  {
    nombre: 'Copa de Oro',
    posiciones: '1º a 4º',
    partidos: [
      { n: 17, hora: '10:40', ronda: 'Semifinal',   definicion: 'Semifinal Copa de Oro',          local: { pos: 1, zona: 'Zona 2' },       visitante: { pos: 2, zona: 'Zona 1' } },
      { n: 18, hora: '11:30', ronda: 'Semifinal',   definicion: 'Semifinal Copa de Oro',          local: { pos: 1, zona: 'Zona 1' },       visitante: { pos: 2, zona: 'Zona 2' } },
      { n: 24, hora: '16:40', ronda: 'Final',       definicion: 'Final Copa de Oro · 1º puesto',  local: { de: 17, resultado: 'winner' },  visitante: { de: 18, resultado: 'winner' } },
      { n: 21, hora: '15:00', ronda: '3.er puesto', definicion: '3º puesto',                      local: { de: 17, resultado: 'loser' },   visitante: { de: 18, resultado: 'loser' } },
    ],
  },
  {
    nombre: 'Copa de Plata',
    posiciones: '5º a 8º',
    partidos: [
      { n: 15, hora: '09:50', ronda: 'Semifinal',   definicion: 'Semifinal Copa de Plata',         local: { pos: 3, zona: 'Zona 2' },       visitante: { pos: 1, zona: 'Zona 3' } },
      { n: 16, hora: '09:50', ronda: 'Semifinal',   definicion: 'Semifinal Copa de Plata',         local: { pos: 3, zona: 'Zona 1' },       visitante: { pos: 1, zona: 'Zona 4' } },
      { n: 23, hora: '15:50', ronda: 'Final',       definicion: 'Final Copa de Plata · 5º puesto', local: { de: 15, resultado: 'winner' },  visitante: { de: 16, resultado: 'winner' } },
      { n: 20, hora: '12:20', ronda: '7.º puesto',  definicion: '7º puesto',                       local: { de: 15, resultado: 'loser' },   visitante: { de: 16, resultado: 'loser' } },
    ],
  },
  {
    nombre: 'Copa de Bronce',
    posiciones: '9º a 12º',
    partidos: [
      { n: 13, hora: '09:00', ronda: 'Semifinal',   definicion: 'Semifinal Copa de Bronce',         local: { pos: 2, zona: 'Zona 3' },       visitante: { pos: 3, zona: 'Zona 4' } },
      { n: 14, hora: '09:00', ronda: 'Semifinal',   definicion: 'Semifinal Copa de Bronce',         local: { pos: 2, zona: 'Zona 4' },       visitante: { pos: 3, zona: 'Zona 3' } },
      { n: 22, hora: '15:00', ronda: 'Final',       definicion: 'Final Copa de Bronce · 9º puesto', local: { de: 13, resultado: 'winner' },  visitante: { de: 14, resultado: 'winner' } },
      { n: 19, hora: '12:20', ronda: '11.º puesto', definicion: '11º puesto',                       local: { de: 13, resultado: 'loser' },   visitante: { de: 14, resultado: 'loser' } },
    ],
  },
];

/**
 * Quién quedó en cada puesto de cada zona tras la jornada 1: sale de
 * `TABLA_J1`, que es el dato publicado. El seed lo usa para poner los rivales
 * de las semis.
 */
export function clubEnPosicion(pos, zona) {
  const fila = TABLA_J1[zona]?.[pos - 1];
  if (!fila) throw new Error(`no hay ${pos}º en ${zona}`);
  return fila.club;
}

/** Las seis semis tal como las publicó el parte de la jornada 2. El seed se niega a correr si la tabla da otra cosa. */
export const SEMIS_PUBLICADAS = {
  13: ['tucuman-m16', 'santiaguena-m16'],
  14: ['misiones-m16', 'salta-m16'],
  15: ['oeste-m16', 'andina-m16'],
  16: ['entrerriana-m16', 'cuyo-m16'],
  17: ['mar-del-plata-m16', 'rosario-m16'],
  18: ['buenos-aires-m16', 'cordobesa-m16'],
};

/**
 * Resultados de la jornada 2 a medida que llegan, por número de partido y en
 * el orden local-visitante del fixture. Los carga `norte-2026-resultados.mjs`.
 *
 * Fuente: la pizarra de la sede el 13/9 (foto de @despuesdeltry). Los nombres
 * de la pizarra son los de la unión: UROBA es `oeste-m16`, URBA es
 * `buenos-aires-m16`. El 22 de Mar del Plata tiene una marca encima pero las
 * dos cifras cierran abajo planas: es 22, no 23.
 */
export const RESULTADOS_J2 = {
  13: [35, 0],
  14: [5, 24],
  15: [17, 7],
  16: [10, 12],
  17: [22, 19],
  18: [36, 0],
  19: [7, 14],
};

/**
 * Las definiciones como las escribió la pizarra. No son un dato que se cargue:
 * el avance automático las tiene que DAR, y el script se frena si da otra cosa.
 */
export const DEFINICIONES_PUBLICADAS = {
  19: ['santiaguena-m16', 'misiones-m16'],
  20: ['andina-m16', 'entrerriana-m16'],
  21: ['rosario-m16', 'cordobesa-m16'],
  22: ['tucuman-m16', 'salta-m16'],
  23: ['oeste-m16', 'cuyo-m16'],
  24: ['mar-del-plata-m16', 'buenos-aires-m16'],
};

/** Los referees designados. El parte no los asigna por partido: van en la temporada. */
export const ARBITROS = [
  { nombre: 'Simón Leavi Preux', union: 'URBA' },
  { nombre: 'Ignacio Olmedo', union: 'Cordobesa' },
  { nombre: 'Juan Rosello', union: 'Sur' },
  { nombre: 'Joaquín Romero', union: 'Nordeste' },
  { nombre: 'Julián Caviglia', union: 'Entrerriana' },
  { nombre: 'Ciro Diciano', union: 'Cuyo' },
];

/** Partidos de 40 minutos: dos tiempos de 20 con cinco de descanso. */
export const DURACION = { tiempos: 2, minutosPorTiempo: 20, descanso: 5 };
