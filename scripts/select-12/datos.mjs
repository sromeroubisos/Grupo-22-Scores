/**
 * CANON del Select 12 en G22: los once seleccionados M17 de la edición 2026
 * (Norte y Sur), el fixture completo del viernes 23 y el domingo 25 de octubre,
 * y el cuadro de honor 2018-2025. Datos puros, sin dependencias — el que
 * escribe en la base es `seed.mjs`.
 *
 * El Select 12 es la Zona Desarrollo del Campeonato Argentino Juvenil M17: dos
 * sedes, Norte (Old Lions, Santiago del Estero) y Sur (Sociedad Sportiva, Bahía
 * Blanca). Los ganadores de cada una juegan una final en noviembre y el que
 * gana asciende al Argentino Juvenil M17 del año siguiente.
 *
 * Fuente: nota previa de la UAR del 22/10/2026 ("Comienza el Select 12",
 * uar.com.ar/comienza-el-select-12). Es una previa: todavía no hay resultados.
 * Los dos grupos del Norte NO vienen rotulados en la nota: se infieren de los
 * cruces de la fecha 1, que arman dos triangulares cerrados.
 */

export const TORNEO_SLUG = 'select-12';
export const NOMBRE = 'Select 12';
export const TEMPORADA = '2026';

export const SEDES = {
  norte: 'Old Lions Rugby Club, Santiago del Estero',
  sur: 'Sociedad Sportiva Bahía Blanca, Bahía Blanca',
};

export const DIAS = { 1: '2026-10-23', 2: '2026-10-25' };

/** El instante en UTC, que es como lo guarda la base. El offset va escrito (`-03:00`). */
export function instanteDe(jornada, hora) {
  return new Date(`${DIAS[jornada]}T${hora}:00-03:00`).toISOString();
}

/**
 * Los once seleccionados M17 que todavía no existen. Los cinco del palmarés que
 * no juegan 2026 ya están por el Argentino Juvenil (`CLUBES_PALMARES_EXISTENTES`).
 *
 * `escudo.m16`: el mismo archivo que ya usa el M16 Desarrollo, ya redimensionado
 * en `public/clubs/`. `escudo.recursos`: sale de la carpeta de Recursos.
 * `escudo.url`: ya está en Storage (Paraguay, por el M18).
 *
 * Unión sin vínculo: Jujeña y San Luis no están en `unions` y esos clubes
 * quedan con `union_id` null, como los seis del Argentino Juvenil.
 */
export const CLUBES_NUEVOS = [
  { id: 'paraguay-m17',         name: 'Paraguay M17',         union_id: 'union-de-rugby-de-paraguay',          region: 'Paraguay',            country: 'PRY', escudo: { url: 'https://vxsolicapdcpemfsahbk.supabase.co/storage/v1/object/public/club-assets/logos/paraguay-m18/a26b73af4a1a4b83.png' } },
  { id: 'formosa-m17',          name: 'Formosa M17',          union_id: 'union-de-rugby-de-formosa',           region: 'Formosa',             country: 'ARG', escudo: { recursos: 'SELECCIONADOS UNIONES/WEB/Formosa.png' } },
  { id: 'misiones-m17',         name: 'Misiones M17',         union_id: 'union-de-rugby-de-misiones',          region: 'Misiones',            country: 'ARG', escudo: { m16: 'misiones-m16' } },
  { id: 'santiaguena-m17',      name: 'Santiagueña M17',      union_id: 'union-santiaguena-de-rugby',          region: 'Santiago del Estero', country: 'ARG', escudo: { m16: 'santiaguena-m16' } },
  { id: 'andina-m17',           name: 'Andina M17',           union_id: 'union-andina-de-rugby',               region: 'Andina',              country: 'ARG', escudo: { m16: 'andina-m16' } },
  { id: 'jujena-m17',           name: 'Jujeña M17',           union_id: null,                                  region: 'Jujuy',               country: 'ARG', escudo: { recursos: 'SELECCIONADOS UNIONES/WEB/Jujuy.png' } },
  { id: 'chubut-m17',           name: 'Chubut M17',           union_id: 'union-de-rugby-del-valle-del-chubut', region: 'Chubut',              country: 'ARG', escudo: { m16: 'chubut-m16' } },
  { id: 'lagos-del-sur-m17',    name: 'Lagos del Sur M17',    union_id: null,                                  region: 'Lagos del Sur',       country: 'ARG', escudo: { m16: 'lagos-del-sur-m16' } },
  { id: 'sur-m17',              name: 'Sur M17',              union_id: 'union-de-rugby-del-sur',              region: 'Sur',                 country: 'ARG', escudo: { recursos: 'SELECCIONADOS UNIONES/WEB/Sur.png' } },
  { id: 'san-luis-m17',         name: 'San Luis M17',         union_id: null,                                  region: 'San Luis',            country: 'ARG', escudo: { recursos: 'SELECCIONADOS UNIONES/WEB/San Luis.png' } },
  { id: 'tierra-del-fuego-m17', name: 'Tierra del Fuego M17', union_id: 'union-de-rugby-de-tierra-del-fuego',  region: 'Tierra del Fuego',    country: 'ARG', escudo: { recursos: 'SELECCIONADOS UNIONES/WEB/Tierra del Fuego.png' } },
];

/**
 * Los tres grupos de la fase inicial. El Sur es todos contra todos (una sola
 * tabla de cinco); el Norte son dos triangulares. Los nombres llevan la sede
 * porque es lo que los distingue: Norte y Sur son dos torneos en uno.
 */
export const ZONAS = [
  { clave: 'N1', nombre: 'Norte · Zona 1', clubes: ['paraguay-m17', 'formosa-m17', 'misiones-m17'] },
  { clave: 'N2', nombre: 'Norte · Zona 2', clubes: ['santiaguena-m17', 'andina-m17', 'jujena-m17'] },
  { clave: 'S',  nombre: 'Sur',            clubes: ['chubut-m17', 'lagos-del-sur-m17', 'sur-m17', 'san-luis-m17', 'tierra-del-fuego-m17'] },
];

/** Los 16 partidos de zona, en el orden y con los horarios de la nota. `sede` es la clave de SEDES. */
export const PARTIDOS_ZONA = [
  // Norte · viernes 23
  { n: 1,  jornada: 1, hora: '09:00', sede: 'norte', zona: 'N1', local: 'paraguay-m17',    visitante: 'formosa-m17' },
  { n: 2,  jornada: 1, hora: '09:50', sede: 'norte', zona: 'N2', local: 'santiaguena-m17', visitante: 'andina-m17' },
  { n: 3,  jornada: 1, hora: '11:50', sede: 'norte', zona: 'N1', local: 'misiones-m17',    visitante: 'formosa-m17' },
  { n: 4,  jornada: 1, hora: '16:00', sede: 'norte', zona: 'N2', local: 'jujena-m17',      visitante: 'andina-m17' },
  { n: 5,  jornada: 1, hora: '17:00', sede: 'norte', zona: 'N1', local: 'paraguay-m17',    visitante: 'misiones-m17' },
  { n: 6,  jornada: 1, hora: '18:30', sede: 'norte', zona: 'N2', local: 'santiaguena-m17', visitante: 'jujena-m17' },
  // Sur · viernes 23
  { n: 7,  jornada: 1, hora: '09:40', sede: 'sur', zona: 'S', local: 'tierra-del-fuego-m17', visitante: 'san-luis-m17' },
  { n: 8,  jornada: 1, hora: '10:30', sede: 'sur', zona: 'S', local: 'sur-m17',              visitante: 'lagos-del-sur-m17' },
  { n: 9,  jornada: 1, hora: '12:30', sede: 'sur', zona: 'S', local: 'chubut-m17',           visitante: 'san-luis-m17' },
  { n: 10, jornada: 1, hora: '16:00', sede: 'sur', zona: 'S', local: 'sur-m17',              visitante: 'tierra-del-fuego-m17' },
  { n: 11, jornada: 1, hora: '16:50', sede: 'sur', zona: 'S', local: 'chubut-m17',           visitante: 'lagos-del-sur-m17' },
  // Sur · domingo 25
  { n: 12, jornada: 2, hora: '09:40', sede: 'sur', zona: 'S', local: 'lagos-del-sur-m17', visitante: 'tierra-del-fuego-m17' },
  { n: 13, jornada: 2, hora: '10:30', sede: 'sur', zona: 'S', local: 'sur-m17',           visitante: 'san-luis-m17' },
  { n: 14, jornada: 2, hora: '12:30', sede: 'sur', zona: 'S', local: 'chubut-m17',        visitante: 'tierra-del-fuego-m17' },
  { n: 15, jornada: 2, hora: '16:00', sede: 'sur', zona: 'S', local: 'lagos-del-sur-m17', visitante: 'san-luis-m17' },
  { n: 16, jornada: 2, hora: '16:50', sede: 'sur', zona: 'S', local: 'chubut-m17',        visitante: 'sur-m17' },
];

/**
 * La fase final del Norte, el domingo 25. Los cruces salen de la TABLA de cada
 * zona (`{ pos, zona }`) y se cargan a mano cuando terminan las zonas; la final
 * y el 3.er puesto salen de OTRO PARTIDO (`{ de, resultado }`) y los completa
 * solo el motor de avance. Todos van sin equipos y ocultos hasta entonces.
 *
 * `ronda` es el nombre que lee el cuadro público.
 */
export const PLAYOFF_NORTE = [
  { codigo: 'N-5P',    hora: '09:00', ronda: '5.º puesto',  definicion: 'Definición del 5.º puesto',  local: { pos: 3, zona: 'N1' },                 visitante: { pos: 3, zona: 'N2' } },
  { codigo: 'N-SF1',   hora: '10:00', ronda: 'Semifinal',   definicion: 'Semifinal 1',                local: { pos: 1, zona: 'N1' },                 visitante: { pos: 2, zona: 'N2' } },
  { codigo: 'N-SF2',   hora: '11:00', ronda: 'Semifinal',   definicion: 'Semifinal 2',                local: { pos: 1, zona: 'N2' },                 visitante: { pos: 2, zona: 'N1' } },
  { codigo: 'N-3P',    hora: '17:00', ronda: '3.er puesto', definicion: 'Definición del 3.er puesto', local: { de: 'N-SF1', resultado: 'loser' },  visitante: { de: 'N-SF2', resultado: 'loser' } },
  { codigo: 'N-FINAL', hora: '17:50', ronda: 'Final',       definicion: 'Final del Norte',            local: { de: 'N-SF1', resultado: 'winner' }, visitante: { de: 'N-SF2', resultado: 'winner' } },
];

/** Orden de las columnas del cuadro del Norte. */
export const RONDAS_PLAYOFF = ['Semifinal', '5.º puesto', '3.er puesto', 'Final'];

/**
 * La final de ascenso (campeón Norte vs campeón Sur) es "en noviembre": la
 * nota no da fecha, sede ni hora, y `matches.date_time` es obligatorio. No se
 * inventa un partido: queda en `settings` de la temporada hasta que la UAR
 * publique el día.
 */
export const ASCENSO = {
  texto: 'Los campeones de Norte y Sur juegan una final en noviembre; el ganador asciende al Campeonato Argentino Juvenil M17 del año siguiente.',
  fecha: null,
};

/**
 * Cuadro de honor. 2020 no se disputó y no lleva temporada: una temporada
 * vacía se lee como "se jugó y no sabemos quién ganó".
 *
 * Desde 2023 hay dos sedes y una final entre los campeones; el campeón del
 * torneo es el que gana esa final. En 2021 hubo dos zonas (Azul y Blanca) con
 * dos campeones y la nota no menciona final: `champion_club_id` lleva a Sur
 * —el primero que cita la UAR— y Córdoba va en `settings.coCampeon`.
 */
export const PALMARES = [
  { anio: '2018', campeon: 'misiones-m17' },
  { anio: '2019', campeon: 'andina-m17' },
  { anio: '2021', campeon: 'sur-m17', coCampeon: 'cordobesa-m17', nota: 'Zona Azul: Sur. Zona Blanca: Córdoba. La nota no menciona una final entre ambos.' },
  { anio: '2022', campeon: 'alto-valle-m17' },
  { anio: '2023', campeon: 'chile-m17',   subcampeon: 'andina-m17',   nota: 'Andina campeón del Norte, Chile del Sur. Chile ganó la final entre ambos.' },
  { anio: '2024', campeon: 'oeste-m17',   subcampeon: 'misiones-m17', nota: 'Misiones campeón del Norte, Oeste del Sur. Oeste ganó la final entre ambos.' },
  { anio: '2025', campeon: 'austral-m17', subcampeon: 'paraguay-m17', final: { campeon: 51, subcampeon: 27 }, nota: 'Paraguay campeón del Norte, Austral del Sur. Austral ganó la final 51-27 y clasificó a la Zona Ascenso del Argentino Juvenil 2026.' },
];

/** Clubes del palmarés que no juegan 2026 y ya existen por el Argentino Juvenil. */
export const CLUBES_PALMARES_EXISTENTES = ['alto-valle-m17', 'austral-m17', 'chile-m17', 'cordobesa-m17', 'oeste-m17'];

export const LOGO_TORNEO = '/competiciones/ar-select-12.png';

export const PUNTOS = { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1 };

/**
 * Desempates en el orden del reglamento. Va como ARRAY: de la otra forma que
 * usan los torneos viejos —objeto `{ order: [...] }`— falla el `Array.isArray`
 * del motor y la tabla se desempata sólo por diferencia de tantos.
 */
export const TIEBREAKERS = [
  { metric: 'points',            label: 'Puntos obtenidos',     priority: 1, enabled: true },
  { metric: 'head_to_head',      label: 'Resultado entre sí',   priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'tries_for',         label: 'Tries a favor',        priority: 4, enabled: true },
  { metric: 'won',               label: 'Partidos ganados',     priority: 5, enabled: true },
];

/**
 * Reglamento: 4/2/0 con bonus ofensivo (4 tries) y defensivo (derrota por 7 o
 * menos), el mismo del M16 Desarrollo y del Argentino Juvenil. La nota de la UAR
 * no lo detalla: es el reglamento de las competencias juveniles de la UAR y hay
 * que corregirlo acá si el Select 12 usa otro. Se emiten LAS TRES formas a
 * propósito (canónica, legacy y `standings.points_base`) porque cada consumidor
 * mira una distinta.
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
};
