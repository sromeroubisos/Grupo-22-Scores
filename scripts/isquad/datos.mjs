/**
 * Canon del alta de las competiciones de la FER 2026/27 que se sincronizan
 * desde iSquad. Lo leen `scripts/isquad/escudos.mjs` y `scripts/isquad/alta.mts`.
 *
 * Los ids de equipo y de grupo salen de iSquad (medidos el 2026-10-01 en las
 * tablas de cada grupo). El escudo de iSquad trae el número de AFILIACIÓN del
 * club (`images/afiliacion_clubs/{n}/…`), y eso es lo que permite decir que
 * el `2049` de la DH B femenina es Complutense Cisneros igual que el `188`
 * de la DH: misma afiliación, otro equipo.
 *
 * Cada equipo es su propia ficha (convención de la casa: `-femenino`, `-m23`,
 * `-b`), y las filiales comparten el ARCHIVO de escudo del club madre.
 *
 * Afuera a propósito: la DH masculina (416), que sigue saliendo de FlashScore
 * —meterla también en la base duplicaría sus partidos en el feed—, y la
 * "Cobertura de plaza" (429), que es una final suelta de promoción.
 */

export const TEMPORADA = '2627';
export const TEMPORADA_CODIGO = '2026-27';
export const TEMPORADA_NOMBRE = '2026/27';
export const UNION_FER = 'federacion-espanola-de-rugby';
export const ORIGEN = 'isquad-alta';

const RECURSOS = 'C:/Users/srome/OneDrive/Documentos/________S22/Recursos/ESPAÑA';
const DH = `${RECURSOS}/LOGOS WEB`;
const DHE = `${RECURSOS}/LOGOS WEB DHELITE`;
/** 800×800, JPG con fondo blanco: `variantes.mjs` se lo saca. */
const ISQUAD = (afil, archivo) => `https://rugby.isquad.es/images/afiliacion_clubs/${afil}/square_${archivo}.jpg`;

/**
 * Torneos. `grupos[].id` es el "torneo" de iSquad (el de
 * `resultados_completos.php?id=`); con más de un grupo la fase se arma por
 * zonas (`group_stage` + `tournament_groups`).
 */
export const TORNEOS = [
  {
    campeonato: '419', slug: 'es-liga-iberdrola', nombre: 'Liga Iberdrola de Rugby',
    categoria: 'Femenino', genero: 'femenino', edad: 'mayores',
    fases: [{ nombre: '1ª Fase', grupos: [{ id: '1298', nombre: null }] }],
  },
  {
    campeonato: '417', slug: 'es-division-de-honor-elite', nombre: 'División de Honor Élite',
    categoria: 'División de Honor Élite', genero: 'masculino', edad: 'mayores',
    fases: [{ nombre: '1ª Fase', grupos: [{ id: '1297', nombre: null }] }],
  },
  {
    campeonato: '420', slug: 'es-division-de-honor-b-femenina', nombre: 'División de Honor B Femenina',
    categoria: 'Femenino', genero: 'femenino', edad: 'mayores',
    fases: [{ nombre: '1ª Fase', grupos: [{ id: '1299', nombre: null }] }],
  },
  {
    campeonato: '418', slug: 'es-division-de-honor-b', nombre: 'División de Honor B',
    categoria: 'División de Honor B', genero: 'masculino', edad: 'mayores',
    fases: [{
      nombre: '1ª Fase',
      grupos: [
        { id: '1300', nombre: 'Grupo A' },
        { id: '1301', nombre: 'Grupo B' },
        { id: '1302', nombre: 'Grupo C' },
        { id: '1303', nombre: 'Grupo D' },
      ],
    }],
  },
  {
    campeonato: '421', slug: 'es-nacional-m23', nombre: 'Competición Nacional M23',
    categoria: 'M23', genero: 'masculino', edad: 'M23',
    fases: [{
      nombre: '1ª Fase',
      grupos: [
        { id: '1304', nombre: 'Grupo A' },
        { id: '1305', nombre: 'Grupo B' },
      ],
    }],
  },
];

/**
 * Clubes. `existe: true` = ya está en la base (la DH vino de FlashScore) y no
 * se toca; si trae `escudo` es solo para que sus filiales tengan archivo.
 * `escudo` es la fuente para `variantes.mjs`: la biblioteca de Recursos cuando
 * lo tiene, iSquad cuando no. `escudoDe` = comparte el archivo de otro club.
 */
export const CLUBES = [
  // ── Clubes de la DH que ya están (FlashScore) ───────────────────────────────
  { id: 'complutense-cisneros', existe: true },
  { id: 'el-salvador', existe: true },
  { id: 'alcobendas', existe: true },
  { id: 'liceo-frances', existe: true },
  { id: 'pozuelo', existe: true },
  { id: 'ue-santboiana', existe: true, escudo: `${DH}/santboiana.png` },
  { id: 'ampo-ordizia', existe: true, escudo: `${DH}/ordizia.png` },
  { id: 'burgos', existe: true, escudo: `${DH}/aparejadores-burgos.png` },
  { id: 'valladolid-rac', existe: true, escudo: `${DH}/vrac-valladolid.png` },
  { id: 'cr-la-vila', existe: true, escudo: `${DHE}/la-vila.png` },
  // Ficha huérfana con el nombre viejo de Gernika: se reusa, no se duplica.
  { id: 'bizkaia-gernika', existe: true, escudo: `${DHE}/gernika.png`, completar: { country: 'España', union_id: UNION_FER, city: 'Gernika', region: 'País Vasco' } },

  // ── DH Élite ────────────────────────────────────────────────────────────────
  { id: 'getxo-rugby', name: 'Getxo Rugby', city: 'Getxo', region: 'País Vasco', escudo: `${DHE}/getxo.png` },
  { id: 'barca-rugbi', name: 'Barça Rugbi', city: 'Barcelona', region: 'Cataluña', escudo: `${DH}/barca-rugby.png` },
  { id: 'fenix-rugby', name: 'Fénix Rugby', city: 'Zaragoza', region: 'Aragón', escudo: `${DHE}/fenix-zaragoza.png` },
  { id: 'ingenieros-industriales-las-rozas', name: 'Ingenieros Industriales Las Rozas', city: 'Las Rozas', region: 'Madrid', escudo: `${DHE}/industriales.png` },
  { id: 'valencia-rc', name: 'Valencia RC', city: 'Valencia', region: 'Comunidad Valenciana', escudo: `${DHE}/rc-valencia.png` },
  { id: 'real-ciencias-sevilla', name: 'Real Ciencias Sevilla', city: 'Sevilla', region: 'Andalucía', escudo: `${DH}/real-ciencias-sevilla.png` },
  { id: 'cp-les-abelles', name: 'CP Les Abelles', city: 'Valencia', region: 'Comunidad Valenciana', escudo: `${DH}/les-abelles.png` },
  { id: 'cr-sant-cugat', name: 'CR Sant Cugat', city: 'Sant Cugat del Vallès', region: 'Cataluña', escudo: `${DHE}/sant-cugat.png` },
  { id: 'hernani-cre', name: 'Hernani CRE', city: 'Hernani', region: 'País Vasco', escudo: `${DHE}/hernani.png` },

  // ── Liga Iberdrola y DH B femenina ──────────────────────────────────────────
  { id: 'crat-coruna', name: 'CRAT Coruña', city: 'A Coruña', region: 'Galicia', escudo: ISQUAD(64, '336b6473333976396a36') },
  { id: 'rugby-majadahonda', name: 'Rugby Majadahonda', city: 'Majadahonda', region: 'Madrid', escudo: `${DHE}/majadahonda.png` },
  { id: 'buc-barcelona', name: 'BUC Barcelona', city: 'Barcelona', region: 'Cataluña', escudo: `${DHE}/barcelona-universitari.png` },
  { id: 'universitario-bilbao', name: 'Universitario Bilbao Rugby', city: 'Bilbao', region: 'País Vasco', escudo: `${DHE}/universitario-bilbao.png` },
  { id: 'gaztedi-rt', name: 'Gaztedi RT', city: 'Vitoria-Gasteiz', region: 'País Vasco', escudo: `${DHE}/gaztedi.png` },
  // Solo el equipo femenino compite en la FER: la ficha femenina lleva el escudo.
  { id: 'universitario-sevilla-femenino', name: 'Universitario Sevilla Femenino', city: 'Sevilla', region: 'Andalucía', escudo: ISQUAD(82, '78687075693378306e6c') },
  { id: 'turia-rugby-femenino', name: 'Turia Rugby Femenino', city: 'Valencia', region: 'Comunidad Valenciana', escudo: ISQUAD(67, '3563376f66686f673933') },
  { id: 'atletico-portuense-femenino', name: 'CR Atlético Portuense Femenino', city: 'El Puerto de Santa María', region: 'Andalucía', escudo: ISQUAD(66, '6f696b3262316c6a7938') },
  { id: 'eibar-rt-femenino', name: 'Eibar RT Femenino', city: 'Eibar', region: 'País Vasco', escudo: ISQUAD(72, '3276366b6e756677656b') },
  { id: 'olimpico-de-pozuelo-femenino', name: 'Olímpico de Pozuelo Femenino', city: 'Pozuelo de Alarcón', region: 'Madrid', escudo: ISQUAD(70, '6f3974716c7130626f39') },

  // ── DH B masculina ──────────────────────────────────────────────────────────
  { id: 'cormoran-santander', name: 'Cormorán Rugby Santander', city: 'Santander', region: 'Cantabria', escudo: `${DHE}/cormoran-santander.png` },
  { id: 'donostia-rugby', name: 'Donostia Rugby', city: 'San Sebastián', region: 'País Vasco', escudo: ISQUAD(249, '33373637333363626266363465346535') },
  { id: 'belenos-rc', name: 'Belenos RC', city: 'Avilés', region: 'Asturias', escudo: `${DH}/belenos.png` },
  { id: 'elorrio-rt', name: 'Elorrio RT', city: 'Elorrio', region: 'País Vasco', escudo: ISQUAD(248, '3632696a79636f757672') },
  { id: 'rugby-aranda', name: 'Rugby Aranda', city: 'Aranda de Duero', region: 'Castilla y León', escudo: `${DHE}/aranda.png` },
  { id: 'la-unica-rt', name: 'La Única RT', city: 'Pamplona', region: 'Navarra', escudo: `${DHE}/la-unica.png` },
  { id: 'cau-valencia', name: 'CAU Rugby Valencia', city: 'Valencia', region: 'Comunidad Valenciana', escudo: `${DHE}/cau-valencia.png` },
  { id: 'vpc-andorra', name: 'VPC Andorra', city: 'Andorra la Vella', region: 'Andorra', escudo: `${DHE}/vpc-andorra.png` },
  { id: 'cn-poble-nou', name: 'CN Poble Nou', city: 'Barcelona', region: 'Cataluña', escudo: `${DHE}/natacio-poble-nou.png` },
  { id: 'akra-barbara', name: 'Akra Bárbara', city: 'Murcia', region: 'Región de Murcia', escudo: `${DHE}/akra-barbara.png` },
  { id: 'rc-sitges', name: 'RC Sitges', city: 'Sitges', region: 'Cataluña', escudo: `${DHE}/sitges.png` },
  { id: 'el-toro-rc', name: 'El Toro RC', city: 'Calvià', region: 'Islas Baleares', escudo: `${DHE}/el-toro.png` },
  { id: 'rc-ponent', name: 'Ponent Mallorca RC', city: 'Mallorca', region: 'Islas Baleares', escudo: ISQUAD(184, '66373234356465383631366462313833') },
  { id: 'car-sevilla', name: 'CAR Sevilla', city: 'Sevilla', region: 'Andalucía', escudo: `${DHE}/car-sevilla.png` },
  { id: 'cr-alcala', name: 'CR Alcalá', city: 'Alcalá de Henares', region: 'Madrid', escudo: `${DHE}/alcala.png` },
  { id: 'jaen-rugby', name: 'Jaén Rugby', city: 'Jaén', region: 'Andalucía', escudo: `${DHE}/jaen.png` },
  { id: 'car-caceres', name: 'CAR Cáceres', city: 'Cáceres', region: 'Extremadura', escudo: `${DHE}/car-caceres.png` },
  { id: 'soto-del-real', name: 'Soto del Real', city: 'Soto del Real', region: 'Madrid', escudo: `${DHE}/soto-del-real.png` },
  { id: 'real-oviedo-rugby', name: 'Real Oviedo Rugby', city: 'Oviedo', region: 'Asturias', escudo: ISQUAD(11, '38396e6b6b6b77673431') },
  { id: 'os-ingleses', name: 'Os Ingleses RC', city: 'Vigo', region: 'Galicia', escudo: ISQUAD(79, '72356834716462353777') },
  // Está en el fixture del Grupo D (la J1 figura "Aplazado") pero la tabla
  // oficial no lo lista: el 2026-10-01 eran 5 filas para 6 inscritos.
  { id: 'gijon-rc', name: 'Gijón Rugby Club', city: 'Gijón', region: 'Asturias', escudo: ISQUAD(71, '78747576656468373463') },
  { id: 'universidade-de-vigo', name: 'Universidade de Vigo', city: 'Vigo', region: 'Galicia', escudo: ISQUAD(95, '6168396c626c78393269') },

  // ── Filiales: otro equipo del mismo club ────────────────────────────────────
  { id: 'complutense-cisneros-zeta', name: 'Complutense Cisneros Zeta', padre: 'complutense-cisneros', escudo: `${DHE}/cisneros-zeta.png` },
  { id: 'alcobendas-b', name: 'Alcobendas B', padre: 'alcobendas', escudo: `${DHE}/alcobendas-b.png` },
  { id: 'el-salvador-b', name: 'El Salvador B', padre: 'el-salvador', escudoDe: 'el-salvador' },
  { id: 'crat-coruna-femenino', name: 'CRAT Coruña Femenino', padre: 'crat-coruna', escudoDe: 'crat-coruna' },
  { id: 'el-salvador-femenino', name: 'El Salvador Femenino', padre: 'el-salvador', escudoDe: 'el-salvador' },
  { id: 'rugby-majadahonda-femenino', name: 'Rugby Majadahonda Femenino', padre: 'rugby-majadahonda', escudoDe: 'rugby-majadahonda' },
  { id: 'cr-sant-cugat-femenino', name: 'CR Sant Cugat Femenino', padre: 'cr-sant-cugat', escudoDe: 'cr-sant-cugat' },
  { id: 'getxo-rugby-femenino', name: 'Getxo Rugby Femenino', padre: 'getxo-rugby', escudoDe: 'getxo-rugby' },
  { id: 'buc-barcelona-femenino', name: 'BUC Barcelona Femenino', padre: 'buc-barcelona', escudoDe: 'buc-barcelona' },
  { id: 'ue-santboiana-femenino', name: 'UE Santboiana Femenino', padre: 'ue-santboiana', escudoDe: 'ue-santboiana' },
  { id: 'universitario-bilbao-femenino', name: 'Universitario Bilbao Femenino', padre: 'universitario-bilbao', escudoDe: 'universitario-bilbao' },
  { id: 'complutense-cisneros-femenino', name: 'Complutense Cisneros Femenino', padre: 'complutense-cisneros', escudoDe: 'complutense-cisneros' },
  { id: 'gaztedi-rt-femenino', name: 'Gaztedi RT Femenino', padre: 'gaztedi-rt', escudoDe: 'gaztedi-rt' },
  { id: 'complutense-cisneros-m23', name: 'Complutense Cisneros M23', padre: 'complutense-cisneros', escudoDe: 'complutense-cisneros' },
  { id: 'ampo-ordizia-m23', name: 'Ordizia M23', padre: 'ampo-ordizia', escudoDe: 'ampo-ordizia' },
  { id: 'getxo-rugby-m23', name: 'Getxo Rugby M23', padre: 'getxo-rugby', escudoDe: 'getxo-rugby' },
  { id: 'alcobendas-m23', name: 'Alcobendas M23', padre: 'alcobendas', escudoDe: 'alcobendas' },
  { id: 'burgos-m23', name: 'Aparejadores Burgos M23', padre: 'burgos', escudoDe: 'burgos' },
  { id: 'valladolid-rac-m23', name: 'VRAC M23', padre: 'valladolid-rac', escudoDe: 'valladolid-rac' },
  { id: 'el-salvador-m23', name: 'El Salvador M23', padre: 'el-salvador', escudoDe: 'el-salvador' },
  { id: 'hernani-cre-m23', name: 'Hernani CRE M23', padre: 'hernani-cre', escudoDe: 'hernani-cre' },
  { id: 'bizkaia-gernika-m23', name: 'Gernika M23', padre: 'bizkaia-gernika', escudoDe: 'bizkaia-gernika' },
  { id: 'liceo-frances-m23', name: 'Liceo Francés M23', padre: 'liceo-frances', escudoDe: 'liceo-frances' },
  { id: 'valencia-rc-m23', name: 'Valencia RC M23', padre: 'valencia-rc', escudoDe: 'valencia-rc' },
  { id: 'real-ciencias-sevilla-m23', name: 'Real Ciencias Sevilla M23', padre: 'real-ciencias-sevilla', escudoDe: 'real-ciencias-sevilla' },
  { id: 'pozuelo-m23', name: 'CRC Pozuelo M23', padre: 'pozuelo', escudoDe: 'pozuelo' },
  { id: 'ue-santboiana-m23', name: 'UE Santboiana M23', padre: 'ue-santboiana', escudoDe: 'ue-santboiana' },
  { id: 'cr-la-vila-m23', name: 'CR La Vila M23', padre: 'cr-la-vila', escudoDe: 'cr-la-vila' },
  { id: 'barca-rugbi-m23', name: 'Barça Rugbi M23', padre: 'barca-rugbi', escudoDe: 'barca-rugbi' },
  { id: 'cr-sant-cugat-m23', name: 'CR Sant Cugat M23', padre: 'cr-sant-cugat', escudoDe: 'cr-sant-cugat' },
  { id: 'fenix-rugby-m23', name: 'Fénix Rugby M23', padre: 'fenix-rugby', escudoDe: 'fenix-rugby' },
  { id: 'ingenieros-industriales-las-rozas-m23', name: 'Ingenieros Industriales M23', padre: 'ingenieros-industriales-las-rozas', escudoDe: 'ingenieros-industriales-las-rozas' },
  { id: 'cp-les-abelles-m23', name: 'CP Les Abelles M23', padre: 'cp-les-abelles', escudoDe: 'cp-les-abelles' },
];

/** `id_equipo` de iSquad → club. Medido en las tablas de cada grupo el 2026-10-01. */
export const EQUIPOS = {
  // DH Élite (1297)
  2064: 'getxo-rugby', 2057: 'barca-rugbi', 1736: 'fenix-rugby', 1717: 'ingenieros-industriales-las-rozas',
  1724: 'bizkaia-gernika', 1709: 'valencia-rc', 2048: 'real-ciencias-sevilla', 1722: 'cp-les-abelles',
  1721: 'cr-sant-cugat', 1719: 'hernani-cre',
  // Liga Iberdrola (1298)
  226: 'crat-coruna-femenino', 254: 'el-salvador-femenino', 278: 'rugby-majadahonda-femenino',
  285: 'cr-sant-cugat-femenino', 336: 'universitario-sevilla-femenino', 1417: 'getxo-rugby-femenino', 2065: 'turia-rugby-femenino',
  // DH B femenina (1299)
  257: 'buc-barcelona-femenino', 341: 'atletico-portuense-femenino', 1100: 'ue-santboiana-femenino',
  1414: 'eibar-rt-femenino', 1723: 'universitario-bilbao-femenino', 2049: 'complutense-cisneros-femenino',
  2056: 'gaztedi-rt-femenino', 2058: 'olimpico-de-pozuelo-femenino',
  // DH B · Grupo A (1300)
  284: 'gaztedi-rt', 1425: 'cormoran-santander', 2088: 'donostia-rugby', 247: 'universitario-bilbao',
  2045: 'belenos-rc', 2086: 'elorrio-rt', 1716: 'rugby-aranda', 261: 'la-unica-rt',
  // DH B · Grupo B (1301)
  342: 'cau-valencia', 1416: 'vpc-andorra', 209: 'cn-poble-nou', 215: 'buc-barcelona',
  2046: 'akra-barbara', 1728: 'rc-sitges', 216: 'el-toro-rc', 1730: 'rc-ponent',
  // DH B · Grupo C (1302)
  264: 'car-sevilla', 276: 'rugby-majadahonda', 202: 'cr-alcala', 2047: 'complutense-cisneros-zeta',
  200: 'jaen-rugby', 1713: 'alcobendas-b', 2062: 'car-caceres', 2063: 'soto-del-real',
  // DH B · Grupo D (1303)
  2050: 'el-salvador-b', 232: 'real-oviedo-rugby', 2059: 'os-ingleses', 2051: 'universidade-de-vigo', 2055: 'crat-coruna', 272: 'gijon-rc',
  // M23 · Grupo A (1304)
  267: 'complutense-cisneros-m23', 345: 'ampo-ordizia-m23', 2066: 'getxo-rugby-m23', 256: 'alcobendas-m23',
  2061: 'burgos-m23', 252: 'valladolid-rac-m23', 255: 'el-salvador-m23', 1720: 'hernani-cre-m23',
  1725: 'bizkaia-gernika-m23', 1429: 'liceo-frances-m23',
  // M23 · Grupo B (1305)
  1411: 'valencia-rc-m23', 269: 'real-ciencias-sevilla-m23', 1727: 'pozuelo-m23', 275: 'ue-santboiana-m23',
  1406: 'cr-la-vila-m23', 212: 'barca-rugbi-m23', 287: 'cr-sant-cugat-m23', 1737: 'fenix-rugby-m23',
  1718: 'ingenieros-industriales-las-rozas-m23', 1729: 'cp-les-abelles-m23',
};

export const PUNTOS = { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1 };

export const TIEBREAKERS = [
  { metric: 'points', label: 'Puntos obtenidos', priority: 1, enabled: true },
  { metric: 'head_to_head', label: 'Resultado entre sí', priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'tries_for', label: 'Tries a favor', priority: 4, enabled: true },
  { metric: 'won', label: 'Partidos ganados', priority: 5, enabled: true },
];

/**
 * Las TRES formas del puntaje (canónica del gestor, legacy del motor y
 * `standings` del reglamento), como en el resto de los seeds. El bonus lo
 * calcula el CONECTOR (los partidos van con `points_autocalculated: false`):
 * el `offensive` de acá es el rótulo, el motor no lo aplica.
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
    offensive: { tries: 3, mode: 'difference', points: PUNTOS.bonusTry },
    defensive: { margin: 7, points: PUNTOS.bonusLoss },
  },
  standings: {
    points_base: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
    bonus_rules: [
      { id: 'try_bonus', label: '3 tries más que el rival', points_awarded: PUNTOS.bonusTry },
      { id: 'close_loss', label: 'Derrota por 7 o menos', points_awarded: PUNTOS.bonusLoss },
    ],
  },
  competition: { format_type: 'league', parameters: { season_model: 'season' } },
  tiebreakers: TIEBREAKERS,
  organizers: [{ name: 'FER', union_id: UNION_FER, is_primary: true }],
};
