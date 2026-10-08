/**
 * Canon del alta del rugby universitario de Estados Unidos que sincroniza
 * `/api/cron/craa-sync` desde la CRAA (College Rugby Association of America,
 * craa.rugby). Lo leen `scripts/craa/escudos.mjs` y `scripts/craa/alta.mts`.
 * Las planillas y las divisiones viven en `src/lib/integrations/craa/fuentes.ts`,
 * que es la única copia (el cron no lee este archivo: lee la base).
 *
 * La CRAA NO es la NCAA: el masculino universitario se reparte entre la CRAA y
 * la NCR, y el femenino de mayor nivel es NCAA (NIRA). Esto es solo la CRAA:
 * cinco divisiones, el fixture de cada una en una planilla pública de Google.
 *
 * ## Un club por universidad y por rama
 *
 * La planilla nombra al equipo por la universidad ("Penn State", "Cal"): el
 * masculino y el femenino se llaman igual. Acá cada uno es su ficha —convención
 * de la casa, `-femenino`— y comparten el archivo de escudo. Los nombres de la
 * planilla de cada rama van en `m` y `f`: son los alias que lee el cron, y un
 * nombre nuevo sale en `omitidos` hasta que se agrega acá y se corre el alta.
 *
 * ## Escudos
 *
 * La CRAA publica los escudos a 50×50 (medido el 2026-10-08: los 98). Los
 * equipos usan el de su universidad, así que va primero el de ESPN a 500 px
 * (`espn`, id de equipo de la NCAA en ESPN) y el de la CRAA (`craa`, ruta bajo
 * wp-content/uploads) queda de respaldo. `espn: null` a propósito donde el de
 * ESPN es de OTRA universidad con el mismo nombre (St. Thomas de Minnesota,
 * Wayne State de Michigan, Life Pacific).
 */

export const TEMPORADA_CODIGO = '2026-27';
export const TEMPORADA_NOMBRE = '2026-27';
export const UNION = 'usa-rugby';
export const ORIGEN = 'craa-alta';
export const PAIS = 'Estados Unidos';
export const CARPETA_ESCUDOS = 'ESTADOS UNIDOS/UNIVERSITARIO';

export const ESCUDO_ESPN = (id) => `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`;
export const ESCUDO_CRAA = (ruta) => `https://craa.rugby/wp-content/uploads/${ruta}`;

const PT = 'America/Los_Angeles';
const MT = 'America/Denver';
const AZ = 'America/Phoenix';
const CT = 'America/Chicago';
const ET = 'America/New_York';
const IN = 'America/Indiana/Indianapolis';
const MI = 'America/Detroit';
const VAN = 'America/Vancouver';
const TOR = 'America/Toronto';

/**
 * `key` → club `us-{key}` (y `us-{key}-femenino`). `zona` es la del campus: la
 * planilla da la hora sin huso y el partido se juega en la cancha del local.
 */
export const UNIVERSIDADES = [
  { key: 'air-force', name: 'Air Force', ciudad: 'Colorado Springs', estado: 'Colorado', zona: MT, espn: 2005, craa: '2026/05/AirForce.png', m: ['Air Force'], f: ['Air Force'] },
  { key: 'american-river', name: 'American River', ciudad: 'Sacramento', estado: 'California', zona: PT, espn: null, craa: '2026/05/ARC.png', m: ['American River College'] },
  { key: 'app-state', name: 'App State', ciudad: 'Boone', estado: 'North Carolina', zona: ET, espn: 2026, craa: null, m: ['App State'] },
  { key: 'arizona-state', name: 'Arizona State', ciudad: 'Tempe', estado: 'Arizona', zona: AZ, espn: 9, craa: '2026/05/ASU.png', m: ['Arizona State'], f: ['Arizona State'] },
  { key: 'arizona', name: 'Arizona', ciudad: 'Tucson', estado: 'Arizona', zona: AZ, espn: 12, craa: '2026/05/Arizona.png', m: ['Arizona'], f: ['Arizona'] },
  { key: 'arkansas-state', name: 'Arkansas State', ciudad: 'Jonesboro', estado: 'Arkansas', zona: CT, espn: 2032, craa: '2026/05/ArkState.png', m: ['Arkansas State'] },
  { key: 'army', name: 'Army', ciudad: 'West Point', estado: 'New York', zona: ET, espn: 349, craa: '2026/05/Army.png', m: ['Army'] },
  { key: 'ave-maria', name: 'Ave Maria', ciudad: 'Ave Maria', estado: 'Florida', zona: ET, espn: 3178, craa: '2026/05/AvaMaria.png', m: ['Ave Maria'] },
  { key: 'byu', name: 'BYU', ciudad: 'Provo', estado: 'Utah', zona: MT, espn: 252, craa: '2026/05/BYU.png', m: ['BYU'], f: ['BYU'] },
  { key: 'ball-state', name: 'Ball State', ciudad: 'Muncie', estado: 'Indiana', zona: IN, espn: 2050, craa: null, m: ['Ball State'] },
  { key: 'cal-poly-humboldt', name: 'Cal Poly Humboldt', ciudad: 'Arcata', estado: 'California', zona: PT, espn: null, craa: '2026/05/Humboldt.png', m: ['Cal Poly Humboldt'], f: ['Cal Poly Humboldt'] },
  { key: 'cal-poly-maritime', name: 'Cal Poly Maritime', ciudad: 'Vallejo', estado: 'California', zona: PT, espn: null, craa: '2026/06/csum.png', m: ['Cal Poly Maritime'], f: ['Cal Poly Maritime'] },
  { key: 'cal-poly', name: 'Cal Poly', ciudad: 'San Luis Obispo', estado: 'California', zona: PT, espn: 13, craa: '2026/05/CalPoly.png', m: ['Cal Poly'], f: ['Cal Poly'] },
  { key: 'long-beach-state', name: 'Long Beach State', ciudad: 'Long Beach', estado: 'California', zona: PT, espn: 299, craa: '2026/05/LongBeach.png', m: ['Cal State Long Beach'], f: ['Cal State Long Beach'] },
  { key: 'cal-state-monterey-bay', name: 'Cal State Monterey Bay', ciudad: 'Seaside', estado: 'California', zona: PT, espn: null, craa: '2026/06/csumb.png', m: ['Cal State Monterey Bay'], f: ['Cal State Monterey Bay'] },
  { key: 'cal', name: 'Cal', ciudad: 'Berkeley', estado: 'California', zona: PT, espn: 25, craa: '2026/05/Cal.png', m: ['Cal', 'California'], f: ['Cal', 'California'] },
  { key: 'ucf', name: 'UCF', ciudad: 'Orlando', estado: 'Florida', zona: ET, espn: 2116, craa: '2026/05/UCF.png', m: ['Central Florida', 'UCF'] },
  { key: 'central-washington', name: 'Central Washington', ciudad: 'Ellensburg', estado: 'Washington', zona: PT, espn: 2120, craa: '2026/05/CWU.png', m: ['Central Washington'], f: ['Central Washington'] },
  { key: 'charlotte', name: 'Charlotte', ciudad: 'Charlotte', estado: 'North Carolina', zona: ET, espn: 2429, craa: null, m: ['Charlotte'] },
  { key: 'chico-state', name: 'Chico State', ciudad: 'Chico', estado: 'California', zona: PT, espn: null, craa: '2026/05/Chico.png', m: ['Chico State'], f: ['Chico State'] },
  { key: 'claremont', name: 'Claremont Colleges', ciudad: 'Claremont', estado: 'California', zona: PT, espn: null, craa: '2026/05/Claremont.png', m: ['Claremont Colleges'], f: ['Claremont Colleges'] },
  { key: 'colorado-state', name: 'Colorado State', ciudad: 'Fort Collins', estado: 'Colorado', zona: MT, espn: 36, craa: '2026/05/CSU.png', m: ['Colorado State'] },
  { key: 'colorado', name: 'Colorado', ciudad: 'Boulder', estado: 'Colorado', zona: MT, espn: 38, craa: '2026/05/Colorado.png', m: ['Colorado'] },
  { key: 'davenport', name: 'Davenport', ciudad: 'Grand Rapids', estado: 'Michigan', zona: MI, espn: null, craa: '2026/05/Davenport.png', m: ['Davenport'] },
  { key: 'duke', name: 'Duke', ciudad: 'Durham', estado: 'North Carolina', zona: ET, espn: 150, craa: null, m: ['Duke'] },
  { key: 'eckerd', name: 'Eckerd', ciudad: 'St. Petersburg', estado: 'Florida', zona: ET, espn: null, craa: '2026/05/Eckerd.png', m: ['Eckerd'] },
  { key: 'embry-riddle', name: 'Embry-Riddle', ciudad: 'Daytona Beach', estado: 'Florida', zona: ET, espn: null, craa: '2026/05/EmbryRiddle.png', m: ['Embry Riddle', 'Embry-Riddle'] },
  { key: 'ferris-state', name: 'Ferris State', ciudad: 'Big Rapids', estado: 'Michigan', zona: MI, espn: 2222, craa: null, m: ['Ferris State'] },
  { key: 'florida-atlantic', name: 'Florida Atlantic', ciudad: 'Boca Raton', estado: 'Florida', zona: ET, espn: 2226, craa: '2026/05/FAu.png', m: ['Florida Atlantic'] },
  { key: 'fiu', name: 'FIU', ciudad: 'Miami', estado: 'Florida', zona: ET, espn: 2229, craa: '2026/05/FIU.png', m: ['FIU', 'Florida International'] },
  { key: 'florida-state', name: 'Florida State', ciudad: 'Tallahassee', estado: 'Florida', zona: ET, espn: 52, craa: '2026/05/FSU.png', m: ['Florida State'] },
  { key: 'florida', name: 'Florida', ciudad: 'Gainesville', estado: 'Florida', zona: ET, espn: 57, craa: '2026/05/UFgators.png', m: ['Florida'] },
  { key: 'fresno-state', name: 'Fresno State', ciudad: 'Fresno', estado: 'California', zona: PT, espn: 278, craa: '2026/05/Fresno.png', m: ['Fresno State'], f: ['Fresno State'] },
  { key: 'gonzaga', name: 'Gonzaga', ciudad: 'Spokane', estado: 'Washington', zona: PT, espn: 2250, craa: '2026/06/gonzaga.png', f: ['Gonzaga'] },
  { key: 'grand-canyon', name: 'Grand Canyon', ciudad: 'Phoenix', estado: 'Arizona', zona: AZ, espn: 2253, craa: '2026/05/GCU.png', m: ['Grand Canyon'], f: ['Grand Canyon'] },
  { key: 'guelph', name: 'Guelph', ciudad: 'Guelph', estado: 'Ontario', pais: 'Canadá', zona: TOR, espn: null, craa: null, m: ['Guelph (Can.)'] },
  { key: 'illinois', name: 'Illinois', ciudad: 'Champaign', estado: 'Illinois', zona: CT, espn: 356, craa: '2026/05/Illini.png', m: ['Illinois'] },
  // El segundo XV de Indiana juega la D1AA: ficha propia, escudo de la universidad.
  { key: 'indiana-ii', name: 'Indiana II', ciudad: 'Bloomington', estado: 'Indiana', zona: IN, escudoDe: 'indiana', m: ['Indiana II'] },
  { key: 'indiana-tech', name: 'Indiana Tech', ciudad: 'Fort Wayne', estado: 'Indiana', zona: IN, espn: null, craa: null, m: ['Indiana Tech'] },
  { key: 'indiana', name: 'Indiana', ciudad: 'Bloomington', estado: 'Indiana', zona: IN, espn: 84, craa: '2026/08/indiana.png', m: ['Indiana'] },
  { key: 'iowa-state', name: 'Iowa State', ciudad: 'Ames', estado: 'Iowa', zona: CT, espn: 66, craa: '2026/05/IowaState.png', m: ['Iowa State'] },
  { key: 'iowa', name: 'Iowa', ciudad: 'Iowa City', estado: 'Iowa', zona: CT, espn: 2294, craa: '2026/05/Iowa.png', m: ['Iowa'] },
  { key: 'lsu', name: 'LSU', ciudad: 'Baton Rouge', estado: 'Louisiana', zona: CT, espn: 99, craa: null, m: ['LSU'] },
  { key: 'life', name: 'Life', ciudad: 'Marietta', estado: 'Georgia', zona: ET, espn: null, craa: '2026/05/Life.png', m: ['Life'], f: ['Life'] },
  { key: 'lindenwood', name: 'Lindenwood', ciudad: 'St. Charles', estado: 'Missouri', zona: CT, espn: 2815, craa: '2026/05/Lindenwood.png', m: ['Lindenwood'] },
  { key: 'loyola-marymount', name: 'Loyola Marymount', ciudad: 'Los Angeles', estado: 'California', zona: PT, espn: 2351, craa: '2026/05/LMU.png', m: ['Loyola Marymount'], f: ['Loyola Marymount'] },
  { key: 'loyola-new-orleans', name: 'Loyola New Orleans', ciudad: 'New Orleans', estado: 'Louisiana', zona: CT, espn: null, craa: '2026/06/LUNO.png', m: ['Loyola New Orleans'] },
  { key: 'mary-washington', name: 'Mary Washington', ciudad: 'Fredericksburg', estado: 'Virginia', zona: ET, espn: null, craa: '2026/05/UMW.png', m: ['Mary Washington'] },
  { key: 'mckendree', name: 'McKendree', ciudad: 'Lebanon', estado: 'Illinois', zona: CT, espn: 2816, craa: '2026/05/Mckendree.png', m: ['McKendree'], f: ['McKendree'] },
  { key: 'miami', name: 'Miami', ciudad: 'Coral Gables', estado: 'Florida', zona: ET, espn: 2390, craa: '2026/05/Miami.png', m: ['Miami'] },
  { key: 'michigan-state', name: 'Michigan State', ciudad: 'East Lansing', estado: 'Michigan', zona: MI, espn: 127, craa: '2026/05/MSU.png', m: ['Michigan State'] },
  { key: 'michigan', name: 'Michigan', ciudad: 'Ann Arbor', estado: 'Michigan', zona: MI, espn: 130, craa: null, m: ['Michigan'] },
  { key: 'millennia-atlantic', name: 'Millennia Atlantic', ciudad: 'Doral', estado: 'Florida', zona: ET, espn: null, craa: '2026/05/MAU.png', m: ['Millennia Atlantic', 'Millenia Atlantic'] },
  { key: 'minnesota', name: 'Minnesota', ciudad: 'Minneapolis', estado: 'Minnesota', zona: CT, espn: 135, craa: '2026/05/Minnesota.png', m: ['Minnesota'] },
  { key: 'miracosta', name: 'MiraCosta', ciudad: 'Oceanside', estado: 'California', zona: PT, espn: null, craa: '2026/05/MiraCosta.png', m: ['MiraCosta'], f: ['MiraCosta'] },
  { key: 'mount-st-marys', name: "Mount St. Mary's", ciudad: 'Emmitsburg', estado: 'Maryland', zona: ET, espn: 116, craa: '2026/05/Mount.png', m: ["Mount St. Mary's"] },
  { key: 'nc-state', name: 'NC State', ciudad: 'Raleigh', estado: 'North Carolina', zona: ET, espn: 152, craa: null, m: ['NC State'] },
  { key: 'navy', name: 'Navy', ciudad: 'Annapolis', estado: 'Maryland', zona: ET, espn: 2426, craa: '2026/05/Navy.png', m: ['Navy'] },
  { key: 'nevada', name: 'Nevada', ciudad: 'Reno', estado: 'Nevada', zona: PT, espn: 2440, craa: '2026/05/UNR.png', m: ['Nevada'], f: ['Nevada'] },
  { key: 'norco', name: 'Norco', ciudad: 'Norco', estado: 'California', zona: PT, espn: null, craa: '2026/05/Norco.png', m: ['Norco'] },
  { key: 'north-carolina', name: 'North Carolina', ciudad: 'Chapel Hill', estado: 'North Carolina', zona: ET, espn: 153, craa: '2026/05/UNC.png', m: ['North Carolina'] },
  { key: 'north-florida', name: 'North Florida', ciudad: 'Jacksonville', estado: 'Florida', zona: ET, espn: 2454, craa: '2026/05/UNF.png', m: ['North Florida'] },
  { key: 'northern-arizona', name: 'Northern Arizona', ciudad: 'Flagstaff', estado: 'Arizona', zona: AZ, espn: 2464, craa: '2026/05/NAU.png', m: ['Northern Arizona'] },
  { key: 'occidental', name: 'Occidental', ciudad: 'Los Angeles', estado: 'California', zona: PT, espn: null, craa: '2026/05/oxy.png', m: ['Occidental'], f: ['Occidental'] },
  { key: 'ohio-state', name: 'Ohio State', ciudad: 'Columbus', estado: 'Ohio', zona: ET, espn: 194, craa: '2026/05/OSU.png', m: ['Ohio State'] },
  { key: 'oregon-state', name: 'Oregon State', ciudad: 'Corvallis', estado: 'Oregon', zona: PT, espn: 204, craa: '2026/05/OregonState.png', m: ['Oregon State'], f: ['Oregon State'] },
  { key: 'oregon', name: 'Oregon', ciudad: 'Eugene', estado: 'Oregon', zona: PT, espn: 2483, craa: '2026/05/Oregon.png', m: ['Oregon'], f: ['Oregon'] },
  { key: 'penn-state', name: 'Penn State', ciudad: 'State College', estado: 'Pennsylvania', zona: ET, espn: 213, craa: '2026/05/PennState.png', m: ['Penn State'], f: ['Penn State'] },
  { key: 'pepperdine', name: 'Pepperdine', ciudad: 'Malibu', estado: 'California', zona: PT, espn: 2492, craa: '2026/05/Pepperdine.png', m: ['Pepperdine'] },
  { key: 'point-loma', name: 'Point Loma', ciudad: 'San Diego', estado: 'California', zona: PT, espn: null, craa: '2026/05/PointLoma.png', m: ['Point Loma'] },
  { key: 'principia', name: 'Principia', ciudad: 'Elsah', estado: 'Illinois', zona: CT, espn: null, craa: '2026/05/Principia.png', m: ['Principia'] },
  { key: 'purdue', name: 'Purdue', ciudad: 'West Lafayette', estado: 'Indiana', zona: IN, espn: 2509, craa: null, m: ['Purdue'] },
  { key: 'queens', name: 'Queens', ciudad: 'Charlotte', estado: 'North Carolina', zona: ET, espn: 2511, craa: null, m: ['Queens U. of Charlotte', 'Queens'] },
  { key: 'sacramento-state', name: 'Sacramento State', ciudad: 'Sacramento', estado: 'California', zona: PT, espn: 16, craa: '2026/05/SacState.png', m: ['Sacramento State'], f: ['Sacramento State'] },
  { key: 'saint-marys', name: "Saint Mary's", ciudad: 'Moraga', estado: 'California', zona: PT, espn: 2608, craa: '2026/05/SMC.png', m: ["Saint Mary's"], f: ["Saint Mary's", "St. Mary's"] },
  { key: 'san-diego-state', name: 'San Diego State', ciudad: 'San Diego', estado: 'California', zona: PT, espn: 21, craa: '2026/05/SDSU.png', m: ['San Diego State'], f: ['San Diego State'] },
  { key: 'san-diego', name: 'San Diego', ciudad: 'San Diego', estado: 'California', zona: PT, espn: 301, craa: '2026/05/USD.png', m: ['San Diego'] },
  { key: 'san-francisco-state', name: 'San Francisco State', ciudad: 'San Francisco', estado: 'California', zona: PT, espn: null, craa: '2026/05/SFgators.png', m: ['San Francisco State'] },
  { key: 'san-francisco', name: 'San Francisco', ciudad: 'San Francisco', estado: 'California', zona: PT, espn: 2539, craa: '2026/06/usf.png', m: ['San Francisco'], f: ['San Francisco'] },
  { key: 'san-jose-state', name: 'San José State', ciudad: 'San José', estado: 'California', zona: PT, espn: 23, craa: '2026/05/SJSU.png', m: ['San Jose State', 'San José State'], f: ['San Jose State', 'San José State'] },
  // "San Clara" en la planilla femenina es Santa Clara mal escrito.
  { key: 'santa-clara', name: 'Santa Clara', ciudad: 'Santa Clara', estado: 'California', zona: PT, espn: 2541, craa: '2026/05/SCU.png', m: ['Santa Clara'], f: ['Santa Clara', 'San Clara'] },
  { key: 'sonoma-state', name: 'Sonoma State', ciudad: 'Rohnert Park', estado: 'California', zona: PT, espn: null, craa: '2026/06/SonomaState.png', m: ['Sonoma State'] },
  { key: 'south-florida', name: 'South Florida', ciudad: 'Tampa', estado: 'Florida', zona: ET, espn: 58, craa: '2026/05/USF.png', m: ['South Florida'] },
  { key: 'usc', name: 'USC', ciudad: 'Los Angeles', estado: 'California', zona: PT, espn: 30, craa: '2026/05/USC.png', m: ['Southern California', 'USC'], f: ['Southern California', 'USC'] },
  { key: 'southern-virginia', name: 'Southern Virginia', ciudad: 'Buena Vista', estado: 'Virginia', zona: ET, espn: 2896, craa: '2026/05/SVU.png', m: ['Southern Virginia'] },
  { key: 'st-bonaventure', name: 'St. Bonaventure', ciudad: 'St. Bonaventure', estado: 'New York', zona: ET, espn: 179, craa: null, m: ['St. Bonaventure'] },
  // St. Thomas University de Miami Gardens; el "St. Thomas" de ESPN es el de Minnesota.
  { key: 'st-thomas', name: 'St. Thomas', ciudad: 'Miami Gardens', estado: 'Florida', zona: ET, espn: null, craa: '2026/05/STU.png', m: ['St. Thomas'] },
  { key: 'stanford', name: 'Stanford', ciudad: 'Stanford', estado: 'California', zona: PT, espn: 24, craa: '2026/05/Stanford.png', m: ['Stanford'], f: ['Stanford'] },
  { key: 'texas-am', name: 'Texas A&M', ciudad: 'College Station', estado: 'Texas', zona: CT, espn: 245, craa: null, m: ['Texas A&M'] },
  { key: 'trine', name: 'Trine', ciudad: 'Angola', estado: 'Indiana', zona: IN, espn: 2651, craa: '2026/05/Trine.png', m: ['Trine'] },
  { key: 'trinity-western', name: 'Trinity Western', ciudad: 'Langley', estado: 'British Columbia', pais: 'Canadá', zona: VAN, espn: null, craa: null, m: ['Trinity Western (Can.)'] },
  { key: 'truman-state', name: 'Truman State', ciudad: 'Kirksville', estado: 'Missouri', zona: CT, espn: 2654, craa: '2026/05/TrumanState.png', m: ['Truman State'] },
  { key: 'tulane', name: 'Tulane', ciudad: 'New Orleans', estado: 'Louisiana', zona: CT, espn: 2655, craa: null, m: ['Tulane'] },
  { key: 'victoria', name: 'Victoria', ciudad: 'Victoria', estado: 'British Columbia', pais: 'Canadá', zona: VAN, espn: null, craa: null, m: ['U. of Victoria (Can.)'] },
  { key: 'uc-davis', name: 'UC Davis', ciudad: 'Davis', estado: 'California', zona: PT, espn: 302, craa: '2026/05/Davis.png', m: ['UC Davis'], f: ['UC Davis'] },
  { key: 'uc-irvine', name: 'UC Irvine', ciudad: 'Irvine', estado: 'California', zona: PT, espn: 300, craa: '2026/06/uci.png', f: ['UC Irvine'] },
  { key: 'uc-riverside', name: 'UC Riverside', ciudad: 'Riverside', estado: 'California', zona: PT, espn: 27, craa: '2026/05/UCRiverside.png', m: ['UC Riverside'], f: ['UC Riverside'] },
  { key: 'uc-san-diego', name: 'UC San Diego', ciudad: 'La Jolla', estado: 'California', zona: PT, espn: 28, craa: '2026/05/UCSD.png', m: ['UC San Diego'], f: ['UC San Diego'] },
  { key: 'uc-santa-barbara', name: 'UC Santa Barbara', ciudad: 'Santa Barbara', estado: 'California', zona: PT, espn: 2540, craa: '2026/05/UCSB.png', m: ['UC Santa Barbara'], f: ['UC Santa Barbara'] },
  { key: 'uc-santa-cruz', name: 'UC Santa Cruz', ciudad: 'Santa Cruz', estado: 'California', zona: PT, espn: null, craa: '2026/05/UCSC.png', m: ['UC Santa Cruz'], f: ['UC Santa Cruz'] },
  { key: 'ucla', name: 'UCLA', ciudad: 'Los Angeles', estado: 'California', zona: PT, espn: 26, craa: '2026/06/ucla.png', m: ['UCLA'], f: ['UCLA'] },
  { key: 'unlv', name: 'UNLV', ciudad: 'Las Vegas', estado: 'Nevada', zona: PT, espn: 2439, craa: '2026/06/unlv.png', f: ['UNLV'] },
  { key: 'utep', name: 'UTEP', ciudad: 'El Paso', estado: 'Texas', zona: MT, espn: 2638, craa: '2026/05/UTEP.png', m: ['UTEP'] },
  { key: 'utah-state', name: 'Utah State', ciudad: 'Logan', estado: 'Utah', zona: MT, espn: 328, craa: '2026/05/USU.png', m: ['Utah State'] },
  { key: 'utah-valley', name: 'Utah Valley', ciudad: 'Orem', estado: 'Utah', zona: MT, espn: 3084, craa: '2026/05/UVU.png', m: ['Utah Valley'] },
  { key: 'utah', name: 'Utah', ciudad: 'Salt Lake City', estado: 'Utah', zona: MT, espn: 254, craa: '2026/05/Utah.png', m: ['Utah'] },
  { key: 'virginia-tech', name: 'Virginia Tech', ciudad: 'Blacksburg', estado: 'Virginia', zona: ET, espn: 259, craa: null, m: ['Virginia Tech'] },
  { key: 'washington-state', name: 'Washington State', ciudad: 'Pullman', estado: 'Washington', zona: PT, espn: 265, craa: '2026/07/WashingtonState.png', m: ['Washington State'], f: ['Washington State'] },
  { key: 'washington', name: 'Washington', ciudad: 'Seattle', estado: 'Washington', zona: PT, espn: 264, craa: '2026/05/Washington.png', m: ['Washington'], f: ['Washington'] },
  // Wayne State College, de Nebraska; el "Wayne State" de ESPN es el de Michigan.
  { key: 'wayne-state', name: 'Wayne State', ciudad: 'Wayne', estado: 'Nebraska', zona: CT, espn: null, craa: '2026/05/WayneState.png', m: ['Wayne State'] },
  { key: 'weber-state', name: 'Weber State', ciudad: 'Ogden', estado: 'Utah', zona: MT, espn: 2692, craa: null, m: ['Weber State'] },
  { key: 'western-oregon', name: 'Western Oregon', ciudad: 'Monmouth', estado: 'Oregon', zona: PT, espn: 2848, craa: null, m: ['Western Oregon'] },
  { key: 'western-washington', name: 'Western Washington', ciudad: 'Bellingham', estado: 'Washington', zona: PT, espn: null, craa: '2026/05/WWU.png', m: ['Western Washington'], f: ['Western Washington'] },
  { key: 'wingate', name: 'Wingate', ciudad: 'Wingate', estado: 'North Carolina', zona: ET, espn: 351, craa: null, m: ['Wingate'] },
  { key: 'wisconsin', name: 'Wisconsin', ciudad: 'Madison', estado: 'Wisconsin', zona: CT, espn: 275, craa: null, m: ['Wisconsin'] },
  { key: 'wyoming', name: 'Wyoming', ciudad: 'Laramie', estado: 'Wyoming', zona: MT, espn: 2751, craa: '2026/05/Wyo.png', m: ['Wyoming'] },
  { key: 'cal-lutheran', name: 'Cal Lutheran', ciudad: 'Thousand Oaks', estado: 'California', zona: PT, espn: 2094, craa: '2026/05/CLU.png', m: ['Cal Lutheran'] },
  { key: 'cal-state-fullerton', name: 'Cal State Fullerton', ciudad: 'Fullerton', estado: 'California', zona: PT, espn: 2239, craa: '2026/05/CSUFullerton.png', m: ['Cal State Fullerton'] },
  { key: 'cal-state-northridge', name: 'Cal State Northridge', ciudad: 'Northridge', estado: 'California', zona: PT, espn: 2463, craa: '2026/06/csun.png', f: ['Cal State Northridge'] },
];

/**
 * Integrantes de cada división según la página de equipos de la CRAA
 * (medido el 2026-10-08). Son los participantes del torneo: la tabla cuenta
 * los partidos ENTRE ellos; los cruces con otras divisiones y los amistosos se
 * ven en el fixture pero no suman (el motor saltea un partido con un lado que
 * no es participante).
 */
export const INTEGRANTES = {
  'd1a-men': [
    'air-force', 'arkansas-state', 'army', 'byu', 'cal-poly', 'long-beach-state', 'sacramento-state', 'colorado-state',
    'davenport', 'grand-canyon', 'indiana', 'life', 'lindenwood', 'mckendree', 'michigan-state', 'mount-st-marys', 'navy',
    'penn-state', 'saint-marys', 'san-diego-state', 'santa-clara', 'southern-virginia', 'st-thomas', 'ohio-state', 'arizona',
    'cal', 'uc-davis', 'uc-santa-barbara', 'uc-santa-cruz', 'colorado', 'illinois', 'mary-washington', 'san-diego', 'utah',
    'wyoming', 'utah-state', 'utah-valley', 'western-washington',
  ],
  'd1aa-men': [
    'american-river', 'arizona-state', 'cal-poly-humboldt', 'chico-state', 'fresno-state', 'central-washington', 'claremont',
    'florida-atlantic', 'florida-state', 'iowa-state', 'loyola-marymount', 'loyola-new-orleans', 'millennia-atlantic',
    'northern-arizona', 'oregon-state', 'principia', 'san-francisco-state', 'san-jose-state', 'stanford', 'trine',
    'truman-state', 'iowa', 'florida', 'ucf', 'minnesota', 'nevada', 'north-carolina', 'oregon', 'south-florida', 'usc',
    'utep', 'washington', 'washington-state', 'wayne-state',
  ],
  'd2-men': [
    'ave-maria', 'cal-lutheran', 'cal-poly-maritime', 'cal-state-fullerton', 'cal-state-monterey-bay', 'eckerd', 'embry-riddle',
    'fiu', 'miracosta', 'norco', 'occidental', 'pepperdine', 'point-loma', 'sonoma-state', 'stanford', 'st-thomas',
    'uc-san-diego', 'uc-riverside', 'miami', 'north-florida', 'san-francisco',
  ],
  'd1-women': [
    'arizona-state', 'byu', 'cal-poly', 'chico-state', 'fresno-state', 'sacramento-state', 'central-washington', 'claremont',
    'gonzaga', 'grand-canyon', 'life', 'mckendree', 'oregon-state', 'penn-state', 'stanford', 'arizona', 'cal', 'uc-davis',
    'ucla', 'uc-san-diego', 'uc-santa-barbara', 'uc-santa-cruz', 'oregon', 'washington', 'air-force', 'washington-state',
    'western-washington',
  ],
  'd2-women': [
    'cal-poly-maritime', 'cal-poly-humboldt', 'long-beach-state', 'cal-state-monterey-bay', 'cal-state-northridge',
    'loyola-marymount', 'miracosta', 'occidental', 'saint-marys', 'san-diego-state', 'san-jose-state', 'santa-clara',
    'uc-irvine', 'uc-riverside', 'unlv', 'nevada', 'san-francisco', 'usc',
  ],
};

/**
 * La CRAA no publica puntos: ordena por porcentaje de victorias. Acá la tabla
 * va 2/1/0 sin bonus —la planilla no da tries— para que los puntos digan lo
 * mismo que el récord. La D1A muestra la tabla OFICIAL (la escribe el cron).
 */
export const PUNTOS = { win: 2, draw: 1, loss: 0 };

export const TIEBREAKERS = [
  { metric: 'points', label: 'Puntos obtenidos', priority: 1, enabled: true },
  { metric: 'head_to_head', label: 'Resultado entre sí', priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'won', label: 'Partidos ganados', priority: 4, enabled: true },
];

export const RULESET = {
  pointsWin: PUNTOS.win,
  pointsDraw: PUNTOS.draw,
  pointsLoss: PUNTOS.loss,
  pointsBonusTry: 0,
  pointsBonusLoss: 0,
  points: { ...PUNTOS },
  pointsSystem: { ...PUNTOS, bonusTry: 0, bonusLoss: 0, allowBonusPoints: false },
  standings: { points_base: { ...PUNTOS }, bonus_rules: [] },
  competition: { format_type: 'league', parameters: { season_model: 'season' } },
  tiebreakers: TIEBREAKERS,
  organizers: [{ name: 'CRAA', union_id: UNION, is_primary: true }],
};
