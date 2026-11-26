/*
 * Rugby de clubes argentino en el Seven.
 *
 * Clubes, divisiones, fuerza y cupos salen del canon de la Carrera (vía
 * `arClubs.generated.ts`, que además trae el color principal de cada club de
 * la base). Acá se arma lo jugable: el equipo de cada club y los torneos de
 * la temporada 2026, cada uno con su formato.
 *
 * Las dos ramas no se mezclan (URBA e interior). Se cruzan una sola vez, en el
 * Nacional de Clubes: campeón del Top 14 de la URBA contra campeón del TDI A.
 * Los cupos del Torneo del Interior son de la REGIÓN: salen de su regional, en
 * orden de fuerza.
 */

import { AR_SEVEN_CLUBS as GEN_CLUBS, AR_SEVEN_CUPOS, AR_SEVEN_DIVISIONS as GEN_DIVISIONS, type ArSevenClub, type ArSevenDivision } from './arClubs.generated';
import { AR_SEVEN_ROSTERS } from './arRosters.generated';
import { squadFor } from './nations';
import { femLook, isFemClub, type Kit } from './sprites';
import type { SevenTeam } from './teams';
import type { TourDef } from './tours';

/*
 * Lo que el juego le agrega al canon (sin tocar el archivo generado):
 *
 *   · El Desarrollo de Córdoba: las dos ligas de la UCR (Capital-Este y
 *     Sur-Centro, de la base de G22). Su campeón juega el repechaje contra el
 *     último del Súper 9 por un lugar en el Súper 9.
 *   · El Torneo Andino ya no asciende al NOA B: sus cuatro mejores juegan el
 *     Regional A de Córdoba con los cuatro mejores del Súper 9, y los cuatro
 *     que siguen, el Regional B.
 *   · Tierra del Fuego y Santa Cruz alimentan el Regional Patagónico, no el
 *     Austral.
 */
const CBA_ZONE_NAMES: string[][] = [
    ['Ajedrez Cosquín', 'Asociación Cordobesa Volantes', 'Chelcos de Villa del Rosario', 'Conas', 'Cuises Porteña', 'Los Toros de Brinkmann', 'Mañke', 'Rosedal', 'Salsipuedes', 'Universidad Siglo 21', 'Villa Libertador'],
    ['Águilas de General Deheza', 'Universitario de Villa María', 'Jockey Club Río Cuarto', 'Las Iguanas', 'Los Patriotas de Ucacha', 'Los Tordos de Hernando', 'Mackenna', 'Mirage', 'Náutico Fitz Simon', 'Oliva', 'Ranqueles', 'Unión Oncativo', 'Villa General Belgrano'],
];
export const CBA_DESARROLLO_ZONES: string[][] = CBA_ZONE_NAMES.map((zone) => zone.map((name) => `ar-cba-${name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`));

const CBA_NAMES = CBA_ZONE_NAMES.flat();
// Los que tienen más estructura (ciudades grandes) un poco arriba; el resto, de desarrollo.
const CBA_STRONGER = new Set(['Jockey Club Río Cuarto', 'Universitario de Villa María', 'Universidad Siglo 21', 'Villa General Belgrano', 'Oliva']);
const CBA_CLUBS: ArSevenClub[] = CBA_DESARROLLO_ZONES.flat().map((id, i) => ({
    id,
    name: CBA_NAMES[i],
    short: CBA_NAMES[i].replace(/^(Los|Las|Club|Asociación)\s+/, '').slice(0, 3).toUpperCase(),
    color: null,
    rating: CBA_STRONGER.has(CBA_NAMES[i]) ? 31 : 26 + (i % 4),
    division: 'ar-centro-desarrollo',
    ranking: null,
}));

/** Las ramas de la carrera: las dos argentinas y, aparte (no se cruzan con las argentinas), Chile, Uruguay y Brasil. */
export type ArBranch = 'urba' | 'interior' | 'chile' | 'uruguay' | 'brasil' | 'espana' | 'espanaFem' | 'fem' | 'francia' | 'inglaterra' | 'sudafrica' | 'portugal' | 'franciaFem' | 'inglaterraFem' | 'alemania' | 'polonia' | 'georgia' | 'rusia' | 'australia' | 'chequia' | 'bolivia' | 'peru' | 'mexico' | 'colombia' | 'gales' | 'escocia' | 'irlanda' | 'rumania' | 'italia' | 'belgica' | 'holanda';
/** Ramas con liga simple (el campeón sube, baja el último) y sin Sudamericano: se arman todas igual. */
export const isLeagueBranch = (b: ArBranch) => ['chile', 'espana', 'espanaFem', 'fem', 'francia', 'inglaterra', 'sudafrica', 'portugal', 'franciaFem', 'inglaterraFem', 'alemania', 'polonia', 'georgia', 'rusia', 'australia', 'chequia', 'bolivia', 'peru', 'mexico', 'colombia', 'gales', 'escocia', 'irlanda', 'rumania', 'italia', 'belgica', 'holanda'].includes(b);
/** Las ramas de mujeres: no se mezclan con las de varones en los torneos en paralelo. */
export const isFemBranch = (b: ArBranch) => b === 'fem' || b === 'espanaFem' || b === 'franciaFem' || b === 'inglaterraFem';
export interface GameDivision extends Omit<ArSevenDivision, 'branch'> {
    branch: ArBranch;
}
/** Un club del juego: los extranjeros traen su lista de nombres y su nivel fijo (no están en el ranking argentino). */
export interface GameClub extends ArSevenClub {
    pool?: string;
    fixed?: number;
}
export const isArgBranch = (b: ArBranch) => b === 'urba' || b === 'interior';
/** Cómo se llama cada rama en un listado. */
export const branchLabel = (b: ArBranch) =>
    ({ urba: 'Argentina · URBA', interior: 'Argentina · interior', chile: 'Chile', uruguay: 'Uruguay', brasil: 'Brasil', espana: 'España', espanaFem: 'España · femenino', fem: 'Argentina · femenino', francia: 'Francia', inglaterra: 'Inglaterra', sudafrica: 'Sudáfrica', portugal: 'Portugal', franciaFem: 'Francia · femenino', inglaterraFem: 'Inglaterra · femenino', alemania: 'Alemania', polonia: 'Polonia', georgia: 'Georgia', rusia: 'Rusia', australia: 'Australia', chequia: 'Chequia', bolivia: 'Bolivia', peru: 'Perú', mexico: 'México', gales: 'Gales', escocia: 'Escocia', irlanda: 'Irlanda', rumania: 'Rumania', italia: 'Italia', belgica: 'Bélgica', holanda: 'Países Bajos' } as Record<string, string>)[b] ?? b;

/** El color de un club femenino: el del club de varones del mismo nombre, si está. */
const colorLike = (name: string) => GEN_CLUBS.find((c) => c.name === name)?.color ?? null;
const slug = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Ligas de afuera, de la base de G22 (temporada 2026). Su nivel queda debajo
 * del argentino (el campeón argentino suele ganar el Sudamericano). Sin los equipos B ni
 * los repetidos (el segundo equipo de un club que ya juega más arriba). El
 * nivel va de mayor a menor según el orden de cada lista.
 */
const FOREIGN: { div: Omit<GameDivision, 'clubs'>; pool: string; top: number; clubs: [string, string | null][] }[] = [
    {
        div: { id: 'cl-top10', label: 'Top 10 de ARUSA', branch: 'chile', region: 'chile', level: 1, promotesTo: null, relegatesTo: 'cl-segunda' },
        pool: 'latam', top: 62,
        clubs: [['Old Boys', '#495270'], ['Universidad Católica', '#1f5bab'], ['COBS', '#322952'], ['Old Mackayans', '#000776'], ['Sporting', '#000000'], ['Stade Français', '#eb2a2e'], ['Old Reds', '#ed1c24'], ['PWCC', '#cfa976'], ['Old Georgians', '#f9bd18'], ['CD Alumni', '#efdd1f'], ['Old Johns', '#e10019'], ['Santo Tomás', null], ['Los Troncos', null], ['Viña Rugby Club', null]],
    },
    {
        div: { id: 'cl-segunda', label: 'Segunda de ARUSA', branch: 'chile', region: 'chile', level: 2, promotesTo: 'cl-top10', relegatesTo: 'cl-tercera' },
        pool: 'latam', top: 47,
        clubs: [['Old Gabs', '#801740'], ['Tabancura', '#65c3f3'], ['Gauchos', '#e2332b'], ['Old Locks', '#ffac01'], ['Old Newlanders', '#0e4b12'], ['All Brads', '#215a3f'], ['Lagartos', '#20351f']],
    },
    {
        div: { id: 'cl-tercera', label: 'Tercera de ARUSA', branch: 'chile', region: 'chile', level: 3, promotesTo: 'cl-segunda', relegatesTo: 'cl-cuarta' },
        pool: 'latam', top: 40,
        clubs: [['Costa del Sol', null], ['Halcones', null], ['IRC', null], ['Lions', null], ['Mano Rugby', null], ['Old Navy', null], ['Trapiales', null]],
    },
    {
        div: { id: 'cl-cuarta', label: 'Cuarta de ARUSA', branch: 'chile', region: 'chile', level: 4, promotesTo: 'cl-tercera', relegatesTo: null },
        pool: 'latam', top: 34,
        clubs: [['Universidad de Chile', null], ['Escuela Militar', null], ['Old Green', null], ['RC Francés', null], ['Toros de Quillota', null], ['URMA', null]],
    },
    {
        div: { id: 'uy-uruguayo', label: 'Uruguayo de Clubes', branch: 'uruguay', region: 'uruguay', level: 1, promotesTo: null, relegatesTo: null },
        pool: 'rio', top: 64,
        clubs: [['Old Christians', '#002c50'], ['Carrasco Polo', '#006ab4'], ['Montevideo Cricket', '#e60000'], ['Champagnat', '#052d4c'], ['Old Boys & Girls', '#d42d00'], ['Trébol de Paysandú', '#009138'], ['Círculo de Tenis', '#2e2a28'], ['Seminario', '#871828'], ['Los Cuervos', '#000000'], ['Lobos de Punta del Este', '#2d3b6a'], ['PSG', '#e33028'], ['Ceibos', '#2a462c']],
    },
    {
        div: { id: 'br-super12', label: 'Super 12 · Primeira Divisão', branch: 'brasil', region: 'brasil', level: 1, promotesTo: null, relegatesTo: 'br-segunda' },
        pool: 'luso', top: 55,
        clubs: [['SPAC', null], ['Pasteur', null], ['São José', null], ['Poli', null], ['Jacareí', null], ['Charrua', null], ['Farrapos', null], ['Desterro', null], ['Rio Branco', null], ['Tornados Indaiatuba', null], ['Nova Lima', null], ['Joaca', null]],
    },
    {
        div: { id: 'br-segunda', label: 'Super 12 · Segunda Divisão', branch: 'brasil', region: 'brasil', level: 2, promotesTo: 'br-super12', relegatesTo: null },
        pool: 'luso', top: 46,
        clubs: [['Niterói', null], ['Rio Rugby', null], ['Brummers', null], ['Serra Gaúcha', null], ['Pé Vermelho', null], ['Leões de Paraisópolis', null], ['Colonos', null], ['Joinville', null], ['Carioca', null], ['Urutu', null], ['Iguanas SJC', null], ['Vitória', null]],
    },
    // España (FER, temporada 2026/27). Sin los equipos B.
    {
        div: { id: 'es-dh', label: 'División de Honor', branch: 'espana', region: 'espana', level: 1, promotesTo: null, relegatesTo: 'es-elite' },
        pool: 'iber', top: 66,
        clubs: [['VRAC Valladolid', null], ['El Salvador', null], ['Alcobendas', null], ['AMPO Ordizia', null], ['Complutense Cisneros', null], ['UE Santboiana', null], ['Liceo Francés', null], ['CR La Vila', null], ['Burgos', null], ['Pozuelo', null]],
    },
    {
        div: { id: 'es-elite', label: 'División de Honor Élite', branch: 'espana', region: 'espana', level: 2, promotesTo: 'es-dh', relegatesTo: 'es-dhb' },
        pool: 'iber', top: 57,
        clubs: [['Getxo Rugby', null], ['CR Sant Cugat', null], ['Valencia RC', null], ['Les Abelles', null], ['Hernani', null], ['Ingenieros Industriales', null], ['Real Ciencias Sevilla', null], ['Barça Rugbi', null], ['Bizkaia Gernika', null], ['Fénix Rugby', null]],
    },
    {
        div: { id: 'es-dhb', label: 'División de Honor B', branch: 'espana', region: 'espana', level: 3, promotesTo: 'es-elite', relegatesTo: 'es-pn-norte' },
        pool: 'iber', top: 50,
        clubs: [['Universitario Bilbao', null], ['CRAT Coruña', null], ['BUC Barcelona', null], ['Belenos', null], ['CAU Valencia', null], ['Rugby Majadahonda', null], ['Cormorán Santander', null], ['Real Oviedo Rugby', null], ['CR Alcalá', null], ['Gaztedi', null], ['Akra Bárbara', null], ['Gijón Rugby Club', null], ['Donostia Rugby', null], ['CN Poble Nou', null], ['Elorrio', null], ['CAR Sevilla', null], ['La Única', null], ['RC Sitges', null], ['Universidade de Vigo', null], ['Rugby Aranda', null], ['El Toro', null], ['CAR Cáceres', null], ['Ponent Mallorca', null], ['Jaén Rugby', null], ['Os Ingleses', null], ['Soto del Real', null], ['VPC Andorra', null]],
    },
    {
        div: { id: 'ef-iberdrola', label: 'Liga Iberdrola', branch: 'espanaFem', region: 'espana', level: 1, promotesTo: null, relegatesTo: 'ef-dhb' },
        pool: 'iberF', top: 60,
        clubs: [['Majadahonda', null], ['CRAT Coruña', null], ['El Salvador', null], ['Getxo', null], ['Sant Cugat', null], ['Universitario Sevilla', null], ['Turia', null]],
    },
    {
        div: { id: 'ef-dhb', label: 'División de Honor B femenina', branch: 'espanaFem', region: 'espana', level: 2, promotesTo: 'ef-iberdrola', relegatesTo: null },
        pool: 'iberF', top: 51,
        clubs: [['Olímpico de Pozuelo', null], ['Complutense Cisneros', null], ['Universitario Bilbao', null], ['UE Santboiana', null], ['BUC Barcelona', null], ['Gaztedi', null], ['Eibar', null], ['Atlético Portuense', null]],
    },
    // Francia, Inglaterra, Sudáfrica y Portugal. Los torneos llevan un nombre propio (parecido al real, no igual): los clubes son los de siempre.
    {
        div: { id: 'fr-elite14', label: 'Élite 14', branch: 'francia', region: 'francia', level: 1, promotesTo: null, relegatesTo: 'fr-pro-segunda' },
        pool: 'franco', top: 70,
        clubs: [['Stade Toulousain', '#c8102e'], ['Union Bordeaux-Bègles', '#5a0f2a'], ['Stade Rochelais', '#111111'], ['Racing 92', '#8ec5e8'], ['Stade Français', '#f472b6'], ['ASM Clermont', '#ffd700'], ['Section Paloise', '#004231'], ['Montpellier', '#0b1838'], ['RC Toulon', '#d7262f'], ['Castres Olympique', '#1f5fbf'], ['LOU Rugby', '#c00418'], ['Aviron Bayonnais', '#81bbe9'], ['USA Perpignan', '#94d4ef'], ['RC Vannes', '#1f3fbf']],
    },
    {
        div: { id: 'fr-pro-segunda', label: 'Pro Segunda', branch: 'francia', region: 'francia', level: 2, promotesTo: 'fr-elite14', relegatesTo: 'fr-nacional' },
        pool: 'franco', top: 58,
        clubs: [['Colomiers Rugby', '#00137f'], ['Provence Rugby', '#1e1e1e'], ['Oyonnax', '#111111'], ['Valence Romans', '#ffffff'], ['CA Brive', '#111111'], ['SU Agen', '#1e2952'], ['FC Grenoble', '#0033a0'], ['Soyaux-Angoulême XV', '#59084e'], ['Biarritz Olympique', '#e30613'], ['US Dax', '#e2001a'], ['AS Béziers', '#000080'], ['USON Nevers', '#ffdb00'], ['Stade Aurillacois', '#be082e'], ['Nissa Rugby', '#e30613'], ['RC Narbonnais', '#ff6900'], ['US Montauban', '#1f5c3a']],
    },
    // Alemania, Polonia, Georgia y Rusia: dos divisiones cada una, con nombres propios. Las listas son aproximadas: se retocan con Editar clubes.
    {
        div: { id: 'de-liga-federal', label: 'Liga Federal Alemana · Primera', branch: 'alemania', region: 'alemania', level: 1, promotesTo: null, relegatesTo: 'de-liga-federal-2' },
        pool: 'germ', top: 54,
        clubs: [['Heidelberger RK', '#c8102e'], ['RK 03 Berlin', '#111111'], ['SC Neuenheim', '#0b6b3a'], ['SC 1880 Frankfurt', '#c8102e'], ['TSV Handschuhsheim', '#1f4fa0'], ['DRC Hannover', '#0b6b3a'], ['Hamburger RC', '#1f3fbf'], ['TV Pforzheim', '#ffd100'], ['RG Heidelberg', '#c8102e'], ['Berliner RC', '#111111']],
    },
    {
        div: { id: 'de-liga-federal-2', label: 'Liga Federal Alemana · Segunda', branch: 'alemania', region: 'alemania', level: 2, promotesTo: 'de-liga-federal', relegatesTo: 'de-regionalliga' },
        pool: 'germ', top: 44,
        clubs: [['Heusenstamm', '#c8102e'], ['Stuttgarter RC', '#111111'], ['RC Aachen', '#1f4fa0'], ['Düsseldorfer RK', '#c8102e'], ['Münchner RC', '#1f3fbf'], ['Offenbach', '#0b6b3a'], ['Rostock', '#1f4fa0'], ['Hohen Neuendorf', '#ffd100'], ['Rheinbrüder Karlsruhe', '#c8102e'], ['Köln', '#c8102e']],
    },
    {
        div: { id: 'pl-liga-extra', label: 'Liga Extra de Polonia', branch: 'polonia', region: 'polonia', level: 1, promotesTo: null, relegatesTo: 'pl-liga-uno' },
        pool: 'eslavo', top: 50,
        clubs: [['Arka Gdynia', '#1f4fa0'], ['Lechia Gdańsk', '#0b6b3a'], ['Budowlani Łódź', '#1f3fbf'], ['Ogniwo Sopot', '#c8102e'], ['Juvenia Kraków', '#c8102e'], ['Pogoń Siedlce', '#0b6b3a'], ['Orkan Sochaczew', '#ffd100'], ['Master Pharm Łódź', '#1f4fa0']],
    },
    {
        div: { id: 'pl-liga-uno', label: 'Liga Uno de Polonia', branch: 'polonia', region: 'polonia', level: 2, promotesTo: 'pl-liga-extra', relegatesTo: null },
        pool: 'eslavo', top: 40,
        clubs: [['Posnania Poznań', '#1f4fa0'], ['Skra Warszawa', '#c8102e'], ['Legia Warszawa', '#0b6b3a'], ['Rugby Białystok', '#c8102e'], ['Rzeszów', '#1f3fbf'], ['Kaszubia', '#111111'], ['Tatra Zakopane', '#0b6b3a'], ['Lublin', '#ffd100'], ['AZS AWF Warszawa', '#1f4fa0'], ['Śląsk Wrocław', '#0b6b3a']],
    },
    {
        div: { id: 'ge-liga-gran10', label: 'Liga Gran 10 de Georgia', branch: 'georgia', region: 'georgia', level: 1, promotesTo: null, relegatesTo: 'ge-liga-primera' },
        pool: 'georgia', top: 58,
        clubs: [['Lelo Tbilisi', '#c8102e'], ['Armazi', '#1f4fa0'], ['Locomotive Tbilisi', '#c8102e'], ['Batumi', '#1f3fbf'], ['Aia Kutaisi', '#ffd100'], ['Khvamli', '#0b6b3a'], ['Kochebi Bolnisi', '#111111'], ['Rustavi', '#1f4fa0'], ['Telavi', '#c8102e'], ['Tbilisi Academy', '#ffffff']],
    },
    {
        div: { id: 'ge-liga-primera', label: 'Liga Primera de Georgia', branch: 'georgia', region: 'georgia', level: 2, promotesTo: 'ge-liga-gran10', relegatesTo: null },
        pool: 'georgia', top: 46,
        clubs: [['Gori', '#c8102e'], ['Akhaltsikhe', '#1f4fa0'], ['Marneuli', '#0b6b3a'], ['Zugdidi', '#ffd100'], ['Poti', '#1f3fbf'], ['Samtredia', '#c8102e'], ['Kobuleti', '#111111'], ['Mtskheta', '#0b6b3a']],
    },
    {
        div: { id: 'ru-liga-pro', label: 'Liga Pro de Rusia', branch: 'rusia', region: 'rusia', level: 1, promotesTo: null, relegatesTo: 'ru-liga-mayor' },
        pool: 'eslavo', top: 52,
        clubs: [['Enisey-STM', '#c8102e'], ['Krasny Yar', '#c8102e'], ['VVA Podmoskovye', '#1f4fa0'], ['Slava Moscú', '#1f3fbf'], ['Lokomotiv Penza', '#0b6b3a'], ['Dinamo Moscú', '#1f4fa0'], ['CSKA Moscú', '#c8102e'], ['Spartak Moscú', '#c8102e']],
    },
    {
        div: { id: 'ru-liga-mayor', label: 'Liga Mayor de Rusia', branch: 'rusia', region: 'rusia', level: 2, promotesTo: 'ru-liga-pro', relegatesTo: null },
        pool: 'eslavo', top: 42,
        clubs: [['Imperia Kazán', '#111111'], ['Fili Moscú', '#0b6b3a'], ['Novokuznetsk', '#1f4fa0'], ['Dinamo Sverdlovsk', '#1f3fbf'], ['Strela Kazán', '#c8102e'], ['Ladoga San Petersburgo', '#1f4fa0'], ['Olimp Krasnodar', '#ffd100'], ['Sibir Novosibirsk', '#c8102e']],
    },
    // Australia, Chequia, Bolivia, Perú y México. Listas aproximadas (se retocan con Editar clubes); las ligas chicas de América son de una sola división.
    {
        div: { id: 'au-liga-escudo', label: 'Liga Escudo de Sídney', branch: 'australia', region: 'australia', level: 1, promotesTo: null, relegatesTo: 'au-liga-queensland' },
        pool: 'anglo', top: 56,
        clubs: [['Sydney University', '#c8102e'], ['Randwick', '#1f4fa0'], ['Eastwood', '#0b6b3a'], ['Warringah', '#c8102e'], ['Northern Suburbs', '#111111'], ['Manly', '#1f3fbf'], ['Southern Districts', '#c8102e'], ['Penrith Emus', '#0b6b3a'], ['Gordon', '#1f4fa0'], ['Western Sydney Two Blues', '#ffd100']],
    },
    {
        div: { id: 'au-liga-queensland', label: 'Liga Premier de Queensland', branch: 'australia', region: 'australia', level: 2, promotesTo: 'au-liga-escudo', relegatesTo: null },
        pool: 'anglo', top: 48,
        clubs: [['Brothers Brisbane', '#c8102e'], ['GPS Brisbane', '#1f4fa0'], ['Souths Brisbane', '#0b6b3a'], ['Easts Brisbane', '#c8102e'], ['University of Queensland', '#6e1a2c'], ['Bond University', '#1f3fbf'], ['Sunnybank', '#ffd100'], ['Wests Brisbane', '#111111']],
    },
    // Chequia: las cuatro ligas de la Unión Checa (rugbyunion.cz, temporada 2026), en el orden de su tabla.
    // Sin los equipos B ni los U23. La 3.ª y la 4.ª liga van juntas (sueltas eran de a cinco). Donau Viena es
    // austríaco y juega la Extraliga checa.
    {
        div: { id: 'cz-liga-extra', label: 'Extraliga Checa', branch: 'chequia', region: 'chequia', level: 1, promotesTo: null, relegatesTo: 'cz-liga-primera' },
        pool: 'eslavo', top: 50,
        clubs: [['Říčany', '#ffd100'], ['Tatra Smíchov', '#1f4fa0'], ['Slavia Praga', '#c8102e'], ['Donau Viena', '#c8102e'], ['Dragon Brno', '#0b6b3a'], ['Vyškov', '#111111']],
    },
    {
        div: { id: 'cz-liga-primera', label: 'Primera Liga Checa', branch: 'chequia', region: 'chequia', level: 2, promotesTo: 'cz-liga-extra', relegatesTo: 'cz-liga-segunda' },
        pool: 'eslavo', top: 43,
        clubs: [['Praga', '#1f3fbf'], ['Zlín', '#ffd100'], ['Petrovice', '#1f3fbf'], ['Sparta Praga', '#c8102e'], ['Bystrc', '#0b6b3a']],
    },
    {
        div: { id: 'cz-liga-segunda', label: 'Segunda Liga Checa', branch: 'chequia', region: 'chequia', level: 3, promotesTo: 'cz-liga-primera', relegatesTo: 'cz-liga-tercera' },
        pool: 'eslavo', top: 37,
        clubs: [['Přelouč', '#1f4fa0'], ['Olomouc', '#1f4fa0'], ['Mariánské Hory', '#0b6b3a'], ['Havířov', '#c8102e']],
    },
    {
        div: { id: 'cz-liga-tercera', label: 'Tercera Liga Checa', branch: 'chequia', region: 'chequia', level: 4, promotesTo: 'cz-liga-segunda', relegatesTo: null },
        pool: 'eslavo', top: 32,
        clubs: [['Vrchlabí', '#0b6b3a'], ['Pilsen', '#111111'], ['České Budějovice', '#1f4fa0'], ['Kralupy', '#c8102e'], ['Olymp', '#1f3fbf'], ['Babice', '#ffd100']],
    },
    {
        div: { id: 'bo-liga-altiplano', label: 'Liga Altiplano de Bolivia', branch: 'bolivia', region: 'bolivia', level: 1, promotesTo: null, relegatesTo: null },
        pool: 'latam', top: 44,
        clubs: [['Tigres Santa Cruz', '#f47920'], ['Cóndores de La Paz', '#c8102e'], ['Cochabamba Rugby Club', '#0b6b3a'], ['Warriors Santa Cruz', '#1f3fbf'], ['Mastodontes Cochabamba', '#111111'], ['Pumas de Tarija', '#ffd100'], ['Sucre Rugby', '#c8102e'], ['Bull Sharks Santa Cruz', '#1f4fa0']],
    },
    {
        div: { id: 'pe-liga-andina', label: 'Liga Andina del Perú', branch: 'peru', region: 'peru', level: 1, promotesTo: null, relegatesTo: null },
        pool: 'latam', top: 44,
        clubs: [['Lince Rugby', '#c8102e'], ['Cóndores de Lima', '#111111'], ['San Isidro Rugby', '#1f4fa0'], ['Lima Rugby Club', '#0b6b3a'], ['Cusco Rugby', '#c8102e'], ['Arequipa Rugby', '#ffd100'], ['Miraflores Rugby', '#1f3fbf'], ['Trujillo Rugby', '#6e1a2c']],
    },
    {
        div: { id: 'mx-liga-azteca', label: 'Liga Azteca de México', branch: 'mexico', region: 'mexico', level: 1, promotesTo: null, relegatesTo: null },
        pool: 'latam', top: 46,
        clubs: [['Diablos Rojos', '#c8102e'], ['Mayas Rugby', '#0b6b3a'], ['Pumas CU', '#1f3fbf'], ['Búhos de Monterrey', '#111111'], ['Cuervos de Guadalajara', '#1f4fa0'], ['Toluca Rugby', '#c8102e'], ['Tigres de Puebla', '#f47920'], ['Querétaro Rugby', '#ffd100']],
    },
    // Colombia: los clubes de la Liga de Rugby de Bogotá (ligarugbybogota.com.co, 2025). Los colores no
    // están publicados: son elegidos para el juego y se retocan con Editar clubes.
    {
        div: { id: 'co-liga-bogota', label: 'Liga de Rugby de Bogotá', branch: 'colombia', region: 'colombia', level: 1, promotesTo: null, relegatesTo: null },
        pool: 'latam', top: 44,
        clubs: [['Magníficos', '#1f3fbf'], ['Alianza', '#c8102e'], ['Barbarians', '#111111'], ['Cachacas', '#ffd100'], ['Carneros', '#6e1a2c'], ['Coyotes', '#f47920'], ['Jaguares', '#0b6b3a'], ['Manoba', '#1f4fa0'], ['Minotauros', '#5a0f2a'], ['Salamandras', '#3fbf5a'], ['Zeppelin', '#ffffff']],
    },
    // Las divisiones de abajo de Francia (nombres propios, clubes de verdad; las listas son aproximadas y se pueden retocar con Editar clubes).
    {
        div: { id: 'fr-nacional', label: 'Liga Nacional', branch: 'francia', region: 'francia', level: 3, promotesTo: 'fr-pro-segunda', relegatesTo: 'fr-nacional-2' },
        pool: 'franco', top: 46,
        clubs: [['Albi', '#c8102e'], ['Rouen Normandie', '#ffffff'], ['Suresnes', '#1f3fbf'], ['Tarbes', '#0b6b3a'], ['Blagnac', '#c8102e'], ['Massy', '#0b1f5c'], ['Dijon', '#8a1c2b'], ['Mont-de-Marsan', '#ffd100'], ['Bourg-en-Bresse', '#1f4fa0'], ['Rennes', '#c8102e'], ['Vienne', '#111111'], ['Chambéry', '#1f4fa0']],
    },
    {
        div: { id: 'fr-nacional-2', label: 'Liga Nacional 2', branch: 'francia', region: 'francia', level: 4, promotesTo: 'fr-nacional', relegatesTo: 'fr-federal-uno' },
        pool: 'franco', top: 40,
        clubs: [['Auch', '#c8102e'], ['Cognac', '#ffd100'], ['Bobigny', '#1f3fbf'], ['Strasbourg', '#c8102e'], ['Limoges', '#0b6b3a'], ['Villeurbanne', '#1f4fa0'], ['Saint-Étienne', '#0b6b3a'], ['Lourdes', '#1f4fa0'], ['Tulle', '#c8102e'], ['Bagnères', '#ffffff'], ['Lyon Villeurbanne', '#111111'], ['Nantes', '#ffd100']],
    },
    {
        div: { id: 'fr-federal-uno', label: 'Federal Uno', branch: 'francia', region: 'francia', level: 5, promotesTo: 'fr-nacional-2', relegatesTo: null },
        pool: 'franco', top: 34,
        clubs: [['Saint-Médard', '#c8102e'], ['Hyères-Carqueiranne', '#1f3fbf'], ['Périgueux', '#111111'], ['Marmande', '#c8102e'], ['Saint-Girons', '#0b6b3a'], ['Cahors', '#1f4fa0'], ['Lannemezan', '#ffd100'], ['Tournon', '#c8102e'], ['Mâcon', '#0b1f5c'], ['Orsay', '#1f3fbf'], ['Pamiers', '#c8102e'], ['Rodez', '#ffd100']],
    },
    // Femenino: la Élite 14 y la Premier Union femeninas, cada una con su escalón de abajo para ascensos y descensos.
    {
        div: { id: 'ffr-elite14', label: 'Élite 14 Femenina', branch: 'franciaFem', region: 'francia', level: 1, promotesTo: null, relegatesTo: 'ffr-federal' },
        pool: 'franco', top: 66,
        clubs: [['Stade Toulousain', '#c8102e'], ['Blagnac', '#c8102e'], ['Stade Bordelais', '#5a0f2a'], ['Montpellier', '#0b1838'], ['Stade Rennais', '#c8102e'], ['Romagnat', '#1f4fa0'], ['Villeneuve-d’Ascq', '#c8102e'], ['Lons', '#0b6b3a'], ['Lyon', '#c00418'], ['Chambéry', '#1f4fa0']],
    },
    {
        div: { id: 'ffr-federal', label: 'Federal Uno Femenina', branch: 'franciaFem', region: 'francia', level: 2, promotesTo: 'ffr-elite14', relegatesTo: null },
        pool: 'franco', top: 52,
        clubs: [['Bayonne', '#81bbe9'], ['Tarbes', '#0b6b3a'], ['Nice', '#e30613'], ['Brive', '#111111'], ['Grenoble', '#0033a0'], ['Clermont', '#ffd700'], ['Saint-Orens', '#c8102e'], ['Toulon', '#d7262f']],
    },
    {
        div: { id: 'fen-premier-union', label: 'Premier Union Femenina', branch: 'inglaterraFem', region: 'inglaterra', level: 1, promotesTo: null, relegatesTo: 'fen-challenger' },
        pool: 'anglo', top: 66,
        clubs: [['Gloucester-Hartpury', '#a6192e'], ['Saracens', '#111111'], ['Exeter Chiefs', '#111111'], ['Bristol Bears', '#0b1f5c'], ['Harlequins', '#cd273d'], ['Leicester Tigers', '#044231'], ['Ealing Trailfinders', '#c8102e'], ['Loughborough Lightning', '#1f4fa0'], ['Sale Sharks', '#000099'], ['Bath', '#0033cc']],
    },
    {
        div: { id: 'fen-challenger', label: 'Challenger Union Femenina', branch: 'inglaterraFem', region: 'inglaterra', level: 2, promotesTo: 'fen-premier-union', relegatesTo: null },
        pool: 'anglo', top: 52,
        clubs: [['Worcester Warriors', '#0b3a8c'], ['Darlington Mowden Park', '#1f4fa0'], ['Firwood Waterloo', '#c8102e'], ['Cheltenham Tigers', '#ffd100'], ['Barnes', '#1f3fbf'], ['Richmond', '#111111'], ['Wasps FC', '#111111'], ['Lichfield', '#c8102e']],
    },
    {
        div: { id: 'en-premier-union', label: 'Premier Union', branch: 'inglaterra', region: 'inglaterra', level: 1, promotesTo: null, relegatesTo: 'en-challenger-union' },
        pool: 'anglo', top: 68,
        clubs: [['Bath', '#0033cc'], ['Bristol Bears', '#0b1f5c'], ['Exeter Chiefs', '#111111'], ['Gloucester', '#a6192e'], ['Harlequins', '#cd273d'], ['Leicester Tigers', '#044231'], ['Newcastle Red Bulls', '#111111'], ['Northampton Saints', '#008469'], ['Sale Sharks', '#000099'], ['Saracens', '#111111']],
    },
    {
        div: { id: 'en-challenger-union', label: 'Challenger Union', branch: 'inglaterra', region: 'inglaterra', level: 2, promotesTo: 'en-premier-union', relegatesTo: null },
        pool: 'anglo', top: 56,
        clubs: [['Ealing Trailfinders', '#c8102e'], ['Cornish Pirates', '#111111'], ['Doncaster Knights', '#1f3fbf'], ['Jersey Reds', '#c8102e'], ['Caldy', '#ffd100'], ['Chinnor', '#1f5fbf'], ['Coventry', '#111111'], ['Hartpury', '#0b1f5c'], ['Nottingham', '#111111'], ['Ampthill', '#c8102e']],
    },
    {
        div: { id: 'za-copa-curry', label: 'Copa Curry · Élite', branch: 'sudafrica', region: 'sudafrica', level: 1, promotesTo: null, relegatesTo: 'za-curry-ascenso' },
        pool: 'sudafrica', top: 64,
        clubs: [['Blue Bulls', '#75c2ee'], ['Free State Cheetahs', '#f47920'], ['Griquas', '#007a87'], ['Golden Lions', '#e30613'], ['Pumas', '#d0d3d4'], ['Natal Sharks', '#1a1a1a'], ['Western Province', '#0033a0'], ['Boland Kavaliers', '#d4af37']],
    },
    {
        div: { id: 'za-curry-ascenso', label: 'Copa Curry · Ascenso', branch: 'sudafrica', region: 'sudafrica', level: 2, promotesTo: 'za-copa-curry', relegatesTo: null },
        pool: 'sudafrica', top: 52,
        clubs: [['Eastern Province Elephants', '#8a1c2b'], ['Border Bulldogs', '#0b3a8c'], ['Falcons', '#f2a900'], ['Leopards', '#111111'], ['Griffons', '#c8102e'], ['SWD Eagles', '#00492c'], ['Valke', '#1f4fa0'], ['Kings de Port Elizabeth', '#7a1f4a']],
    },
    {
        div: { id: 'pt-honra', label: 'Campeonato Lusitano · Divisão de Honra', branch: 'portugal', region: 'portugal', level: 1, promotesTo: null, relegatesTo: 'pt-primeira' },
        pool: 'luso', top: 54,
        clubs: [['Direito', '#1f4fa0'], ['Belenenses', '#0b3a8c'], ['Agronomia', '#0b6b3a'], ['Benfica', '#c8102e'], ['Técnico', '#1f3fbf'], ['Cascais', '#ffd100'], ['CDUP', '#14234a'], ['Lousã', '#f47920'], ['Académica de Coimbra', '#111111'], ['Évora', '#6e1a2c']],
    },
    {
        div: { id: 'pt-primeira', label: 'Campeonato Lusitano · Primeira Divisão', branch: 'portugal', region: 'portugal', level: 2, promotesTo: 'pt-honra', relegatesTo: 'pt-segunda' },
        pool: 'luso', top: 44,
        clubs: [['Montemor', '#c8102e'], ['Santarém', '#0b6b3a'], ['Vila Real', '#1f4fa0'], ['Algarve', '#ffd100'], ['Caldas', '#6e1a2c'], ['Dragon Force', '#111111'], ['Sporting', '#0b6b3a'], ['Marítimo', '#c8102e']],
    },
    // Europa de clubes no profesional: Gales, Escocia e Irlanda (las ligas de clubes, no las franquicias del URC),
    // Rumania, Italia, Bélgica (con los dos clubes de Luxemburgo, que juegan las ligas de los vecinos) y
    // Países Bajos. Listas aproximadas, con los clubes de verdad: se retocan con Editar clubes.
    {
        div: { id: 'wa-premier', label: 'Liga Premier de Gales', branch: 'gales', region: 'gales', level: 1, promotesTo: null, relegatesTo: 'wa-campeonato' },
        pool: 'celta', top: 60,
        clubs: [['Llandovery', '#ffd100'], ['Ebbw Vale', '#c8102e'], ['Aberavon', '#c8102e'], ['Cardiff RFC', '#0b3a8c'], ['Pontypridd', '#111111'], ['Newport RFC', '#111111'], ['Swansea', '#ffffff'], ['Bridgend Ravens', '#1f4fa0'], ['Carmarthen Quins', '#1f3fbf'], ['Cross Keys', '#111111'], ['Neath', '#111111'], ['Llanelli RFC', '#c8102e']],
    },
    {
        div: { id: 'wa-campeonato', label: 'Campeonato de Gales', branch: 'gales', region: 'gales', level: 2, promotesTo: 'wa-premier', relegatesTo: 'wa-division1' },
        pool: 'celta', top: 50,
        clubs: [['Merthyr', '#111111'], ['Pontypool', '#c8102e'], ['Bargoed', '#1f4fa0'], ['Newbridge', '#c8102e'], ['Narberth', '#1f3fbf'], ['Beddau', '#ffd100'], ['Trebanos', '#0b6b3a'], ['Ystrad Rhondda', '#c8102e'], ['Bedwas', '#111111'], ['Glynneath', '#1f4fa0']],
    },
    {
        div: { id: 'sc-premier', label: 'Liga Premier de Escocia', branch: 'escocia', region: 'escocia', level: 1, promotesTo: null, relegatesTo: 'sc-nacional' },
        pool: 'celta', top: 56,
        clubs: [['Heriot’s', '#1f3fbf'], ['Currie Chieftains', '#ffd100'], ['Edinburgh Academicals', '#1f4fa0'], ['Watsonians', '#c8102e'], ['Marr', '#0b3a8c'], ['Hawick', '#0b6b3a'], ['Selkirk', '#1f4fa0'], ['Jed-Forest', '#1f3fbf'], ['Musselburgh', '#111111'], ['Kelso', '#111111']],
    },
    {
        div: { id: 'sc-nacional', label: 'Nacional Uno de Escocia', branch: 'escocia', region: 'escocia', level: 2, promotesTo: 'sc-premier', relegatesTo: 'sc-nacional-2' },
        pool: 'celta', top: 47,
        clubs: [['Gala', '#1f3fbf'], ['Melrose', '#ffd100'], ['Glasgow Hawks', '#111111'], ['Ayr', '#c8102e'], ['Biggar', '#111111'], ['Stirling County', '#c8102e'], ['Dundee', '#1f4fa0'], ['Boroughmuir', '#0b6b3a'], ['Glasgow High Kelvinside', '#1f3fbf'], ['Aberdeen Grammar', '#111111']],
    },
    {
        div: { id: 'ie-1a', label: 'Liga de Irlanda · Primera A', branch: 'irlanda', region: 'irlanda', level: 1, promotesTo: null, relegatesTo: 'ie-1b' },
        pool: 'celta', top: 62,
        clubs: [['Clontarf', '#c8102e'], ['Terenure College', '#1f3fbf'], ['Lansdowne', '#c8102e'], ['Cork Constitution', '#ffffff'], ['Young Munster', '#111111'], ['St Mary’s College', '#1f4fa0'], ['UCD', '#1f4fa0'], ['Garryowen', '#1f3fbf'], ['Shannon', '#111111'], ['Ballynahinch', '#c8102e']],
    },
    {
        div: { id: 'ie-1b', label: 'Liga de Irlanda · Primera B', branch: 'irlanda', region: 'irlanda', level: 2, promotesTo: 'ie-1a', relegatesTo: 'ie-2a' },
        pool: 'celta', top: 52,
        clubs: [['Dublin University', '#1f4fa0'], ['Old Wesley', '#0b3a8c'], ['Naas', '#111111'], ['Malone', '#ffd100'], ['Buccaneers', '#c8102e'], ['Banbridge', '#c8102e'], ['City of Armagh', '#0b6b3a'], ['Old Belvedere', '#111111'], ['Queen’s University', '#0b6b3a'], ['Highfield', '#1f3fbf']],
    },
    {
        div: { id: 'ro-superliga', label: 'Superliga de Rumania', branch: 'rumania', region: 'rumania', level: 1, promotesTo: null, relegatesTo: 'ro-divizia-1' },
        pool: 'rumano', top: 56,
        clubs: [['Steaua București', '#c8102e'], ['Dinamo București', '#c8102e'], ['CSM Știința Baia Mare', '#ffd100'], ['SCM Timișoara', '#111111'], ['Universitatea Cluj', '#111111'], ['Rapid București', '#7a1f2c'], ['CSM București', '#1f4fa0'], ['Gloria Buzău', '#0b6b3a']],
    },
    {
        div: { id: 'it-serie-a-elite', label: 'Serie A Élite de Italia', branch: 'italia', region: 'italia', level: 1, promotesTo: null, relegatesTo: 'it-serie-a' },
        pool: 'italo', top: 62,
        clubs: [['Petrarca Padova', '#111111'], ['Rovigo', '#1f4fa0'], ['Viadana', '#ffd100'], ['Valorugby Emilia', '#c8102e'], ['Fiamme Oro', '#1f3fbf'], ['Colorno', '#c8102e'], ['Mogliano', '#1f4fa0'], ['Lyons Piacenza', '#0b6b3a'], ['Vicenza', '#c8102e'], ['Lazio', '#8ec5e8']],
    },
    {
        div: { id: 'be-elite', label: 'Liga Élite de Bélgica', branch: 'belgica', region: 'belgica', level: 1, promotesTo: null, relegatesTo: 'be-nacional' },
        pool: 'franco', top: 48,
        clubs: [['Boitsfort', '#c8102e'], ['Kituro', '#1f4fa0'], ['ASUB Waterloo', '#0b6b3a'], ['Dendermonde', '#111111'], ['La Hulpe', '#1f3fbf'], ['Soignies', '#c8102e'], ['Frameries', '#ffd100'], ['Coq Mosan', '#c8102e']],
    },
    {
        div: { id: 'be-nacional', label: 'Nacional de Bélgica y Luxemburgo', branch: 'belgica', region: 'belgica', level: 2, promotesTo: 'be-elite', relegatesTo: 'be-division-2' },
        pool: 'franco', top: 40,
        clubs: [['RC Luxembourg', '#c8102e'], ['RC Walferdange', '#1f4fa0'], ['Antwerp RC', '#c8102e'], ['Brussels Celtic', '#0b6b3a'], ['Gent', '#1f4fa0'], ['Leuven', '#111111'], ['Visé', '#ffd100'], ['Mons', '#c8102e']],
    },
    // Países Bajos: las ligas de la Rugby Nederland (temporada 2026), en el orden de su tabla. Sin los segundos
    // equipos (la Future klasse es casi toda de reservas). RC Aachen, alemán, juega la 2e klasse Zuid: queda en
    // la liga alemana para que no haya dos.
    {
        div: { id: 'nl-ereklasse', label: 'Ereklasse de Países Bajos', branch: 'holanda', region: 'holanda', level: 1, promotesTo: null, relegatesTo: 'nl-primera' },
        pool: 'germ', top: 47,
        clubs: [['The Dukes', '#c8102e'], ['Haagsche RC', '#111111'], ['’t Gooi', '#f47920'], ['Haarlem', '#c8102e'], ['Hoek van Holland', '#1f4fa0'], ['Eemland', '#0b6b3a'], ['Castricum', '#ffd100'], ['Rotterdamse RC', '#1f3fbf'], ['Diok', '#0b6b3a'], ['AAC Amsterdam', '#c8102e'], ['Oisterwijk Oysters', '#111111'], ['Ascrum', '#1f4fa0']],
    },
    {
        div: { id: 'nl-primera', label: 'Primera Clase de Países Bajos', branch: 'holanda', region: 'holanda', level: 2, promotesTo: 'nl-ereklasse', relegatesTo: 'nl-segunda-norte' },
        pool: 'germ', top: 38,
        clubs: [['BRC', '#1f3fbf'], ['Spakenburg', '#c8102e'], ['Amstelveen', '#0b6b3a'], ['Groningen', '#111111'], ['Hilversum', '#1f4fa0'], ['The Wasps', '#ffd100'], ['URC Utrecht', '#c8102e'], ['The Bassets', '#1f4fa0'], ['USRS', '#111111'], ['Gouda', '#ffd100'], ['Waterland', '#1f3fbf'], ['The Rams', '#0b6b3a']],
    },
    {
        div: { id: 'nl-segunda-norte', label: 'Segunda Clase Norte de Países Bajos', branch: 'holanda', region: 'holanda', level: 3, promotesTo: 'nl-primera', relegatesTo: null },
        pool: 'germ', top: 30,
        clubs: [['Bulldogs', '#c8102e'], ['Feanster', '#1f4fa0'], ['The Wild Rovers', '#0b6b3a'], ['Pickwick Players', '#111111'], ['Zwolle', '#1f3fbf'], ['Zaanse RC', '#ffd100'], ['The Pigs', '#f47920'], ['Alkmaar', '#c8102e'], ['GSRC', '#1f4fa0']],
    },
    {
        div: { id: 'nl-segunda-sur', label: 'Segunda Clase Sur de Países Bajos', branch: 'holanda', region: 'holanda', level: 3, promotesTo: 'nl-primera', relegatesTo: null },
        pool: 'germ', top: 30,
        clubs: [['The Elephants', '#111111'], ['RCT', '#c8102e'], ['Oemoemenoe', '#ffd100'], ['Maastricht', '#c8102e'], ['RCC', '#1f4fa0'], ['Eindhoven', '#1f3fbf'], ['LSRG', '#0b6b3a'], ['Octopus', '#1f4fa0'], ['The Pink Panthers', '#f472b6']],
    },
    // Más clubes de Europa (divisiones de abajo, con clubes de verdad; listas aproximadas que se retocan con
    // Editar clubes): así Mi Club en Europa tiene seis divisiones, como la Argentina.
    {
        div: { id: 'es-pn-norte', label: 'Primera Nacional · Norte', branch: 'espana', region: 'espana', level: 4, promotesTo: 'es-dhb', relegatesTo: null },
        pool: 'iber', top: 46,
        clubs: [['Zarautz', '#c8102e'], ['Bera Bera', '#1f4fa0'], ['Durango', '#0b6b3a'], ['Uribealdea', '#111111'], ['Ourense', '#ffd100'], ['Lugo', '#1f3fbf'], ['Canoe', '#6e1a2c'], ['Arquitectura', '#f47920'], ['Tres Cantos', '#c8102e'], ['GEiEG Girona', '#1f4fa0'], ['Sant Andreu', '#0b6b3a']],
    },
    {
        div: { id: 'es-pn-sur', label: 'Primera Nacional · Sur', branch: 'espana', region: 'espana', level: 4, promotesTo: 'es-dhb', relegatesTo: null },
        pool: 'iber', top: 46,
        clubs: [['Tatami', '#c8102e'], ['Atlético Portuense', '#1f4fa0'], ['Marbella', '#0b6b3a'], ['Málaga', '#111111'], ['Granada', '#ffd100'], ['Murcia', '#1f3fbf'], ['Tenerife', '#6e1a2c'], ['Tarragona', '#f47920'], ['L’Hospitalet', '#c8102e'], ['Gòtics', '#1f4fa0'], ['Badalona', '#0b6b3a']],
    },
    {
        div: { id: 'pt-segunda', label: 'Campeonato Lusitano · Segunda Divisão', branch: 'portugal', region: 'portugal', level: 3, promotesTo: 'pt-primeira', relegatesTo: null },
        pool: 'luso', top: 40,
        clubs: [['CDUL', '#c8102e'], ['São Miguel', '#1f4fa0'], ['Loulé', '#0b6b3a'], ['Arcos de Valdevez', '#111111'], ['Bairrada', '#ffd100'], ['Moita', '#1f3fbf'], ['Setúbal', '#6e1a2c'], ['Guimarães', '#f47920']],
    },
    {
        div: { id: 'it-serie-a', label: 'Serie A de Italia', branch: 'italia', region: 'italia', level: 2, promotesTo: 'it-serie-a-elite', relegatesTo: 'it-serie-b' },
        pool: 'italo', top: 54,
        clubs: [['Calvisano', '#c8102e'], ['Rugby Parma', '#1f4fa0'], ['L’Aquila', '#0b6b3a'], ['Noceto', '#111111'], ['Valsugana', '#ffd100'], ['San Donà', '#1f3fbf'], ['Verona', '#6e1a2c'], ['Capitolina', '#f47920'], ['Rugby Paese', '#c8102e'], ['Reggio', '#1f4fa0'], ['CUS Torino', '#0b6b3a'], ['Amatori Milano', '#111111']],
    },
    {
        div: { id: 'it-serie-b', label: 'Serie B de Italia', branch: 'italia', region: 'italia', level: 3, promotesTo: 'it-serie-a', relegatesTo: null },
        pool: 'italo', top: 45,
        clubs: [['Firenze', '#c8102e'], ['Livorno', '#1f4fa0'], ['Brescia', '#0b6b3a'], ['Alghero', '#111111'], ['Amatori Napoli', '#ffd100'], ['Amatori Catania', '#1f3fbf'], ['Pesaro', '#6e1a2c'], ['Benevento', '#f47920']],
    },
    {
        div: { id: 'de-regionalliga', label: 'Liga Regional Alemana', branch: 'alemania', region: 'alemania', level: 3, promotesTo: 'de-liga-federal-2', relegatesTo: null },
        pool: 'germ', top: 36,
        clubs: [['Germania List', '#c8102e'], ['Victoria Linden', '#1f4fa0'], ['Ricklingen', '#0b6b3a'], ['Hannover 78', '#111111'], ['Berliner SV 92', '#ffd100'], ['St. Pauli', '#1f3fbf'], ['Eintracht Frankfurt', '#6e1a2c'], ['Heidelberger TV', '#f47920'], ['RC Leipzig', '#c8102e'], ['Dresdner RC', '#1f4fa0']],
    },
    {
        div: { id: 'ie-2a', label: 'Liga de Irlanda · Segunda A', branch: 'irlanda', region: 'irlanda', level: 3, promotesTo: 'ie-1b', relegatesTo: 'ie-2b' },
        pool: 'celta', top: 48,
        clubs: [['Blackrock College', '#c8102e'], ['Greystones', '#1f4fa0'], ['Ballymena', '#0b6b3a'], ['Dungannon', '#111111'], ['Instonians', '#ffd100'], ['Galwegians', '#1f3fbf'], ['Corinthians', '#6e1a2c'], ['Cashel', '#f47920'], ['Sligo', '#c8102e'], ['Nenagh Ormond', '#1f4fa0'], ['Bruff', '#0b6b3a'], ['Navan', '#111111']],
    },
    {
        div: { id: 'ie-2b', label: 'Liga de Irlanda · Segunda B', branch: 'irlanda', region: 'irlanda', level: 4, promotesTo: 'ie-2a', relegatesTo: null },
        pool: 'celta', top: 41,
        clubs: [['Skerries', '#c8102e'], ['Dolphin', '#1f4fa0'], ['MU Barnhall', '#0b6b3a'], ['Wanderers', '#111111'], ['Seapoint', '#ffd100'], ['Monkstown', '#1f3fbf'], ['Belfast Harlequins', '#6e1a2c'], ['Rainey Old Boys', '#f47920'], ['Clonmel', '#c8102e'], ['Tullamore', '#1f4fa0'], ['Enniscorthy', '#0b6b3a'], ['Midleton', '#111111'], ['Bective Rangers', '#ffd100'], ['Old Crescent', '#1f3fbf'], ['UL Bohemian', '#6e1a2c'], ['Thomond', '#f47920']],
    },
    {
        div: { id: 'wa-division1', label: 'Primera División de Gales', branch: 'gales', region: 'gales', level: 3, promotesTo: 'wa-campeonato', relegatesTo: null },
        pool: 'celta', top: 42,
        clubs: [['Cardiff Met', '#c8102e'], ['Cwmbran', '#1f4fa0'], ['Tata Steel', '#0b6b3a'], ['Bridgend Athletic', '#111111'], ['Maesteg Quins', '#ffd100'], ['Aberavon Quins', '#1f3fbf'], ['Penallta', '#6e1a2c'], ['Ystradgynlais', '#f47920'], ['Llanharan', '#c8102e'], ['Rumney', '#1f4fa0'], ['Brynmawr', '#0b6b3a'], ['Abercarn', '#111111'], ['Treorchy', '#ffd100'], ['Tondu', '#1f3fbf'], ['Kenfig Hill', '#6e1a2c'], ['Whitland', '#f47920'], ['Newcastle Emlyn', '#c8102e'], ['Tenby United', '#1f4fa0']],
    },
    {
        div: { id: 'sc-nacional-2', label: 'Nacional Dos de Escocia', branch: 'escocia', region: 'escocia', level: 3, promotesTo: 'sc-nacional', relegatesTo: null },
        pool: 'celta', top: 40,
        clubs: [['Hamilton', '#c8102e'], ['Edinburgh Northern', '#1f4fa0'], ['Peebles', '#0b6b3a'], ['Kirkcaldy', '#111111'], ['Howe of Fife', '#ffd100'], ['Dumfries Saints', '#1f3fbf'], ['Preston Lodge', '#6e1a2c'], ['Lasswade', '#f47920'], ['Cambuslang', '#c8102e'], ['Livingston', '#1f4fa0'], ['Highland', '#0b6b3a'], ['Stewart’s Melville', '#111111'], ['Gordonians', '#ffd100'], ['Haddington', '#1f3fbf'], ['Berwick', '#6e1a2c'], ['Linlithgow', '#f47920']],
    },
    {
        div: { id: 'ro-divizia-1', label: 'Divizia Națională de Rumania', branch: 'rumania', region: 'rumania', level: 2, promotesTo: 'ro-superliga', relegatesTo: null },
        pool: 'rumano', top: 44,
        clubs: [['Știința Petroșani', '#c8102e'], ['Politehnica Iași', '#1f4fa0'], ['Sportul Studențesc', '#0b6b3a'], ['Farul Constanța', '#111111'], ['Olimpia București', '#ffd100']],
    },
    {
        div: { id: 'be-division-2', label: 'Segunda División de Bélgica', branch: 'belgica', region: 'belgica', level: 3, promotesTo: 'be-nacional', relegatesTo: null },
        pool: 'franco', top: 32,
        clubs: [['Brussels Barbarians', '#c8102e'], ['Ottignies', '#1f4fa0'], ['Tournai', '#0b6b3a'], ['Namur', '#111111'], ['Charleroi', '#ffd100'], ['Brugge', '#1f3fbf'], ['Kortrijk', '#6e1a2c'], ['Mechelen', '#f47920']],
    },
    // Argentina femenino: URBA (Top 9, Primera y Segunda) y el Centro (Córdoba y Andina).
    {
        div: { id: 'af-urba-top9', label: 'Top 9 femenino de la URBA', branch: 'fem', region: 'femenino', level: 1, promotesTo: null, relegatesTo: 'af-urba-primera' },
        pool: 'rioF', top: 62,
        clubs: [['Ciudad', colorLike('Ciudad')], ['La Plata', colorLike('La Plata')], ['CUQ', '#009fe0'], ['Centro Naval', colorLike('Centro Naval')], ['La Salle', colorLike('La Salle')], ['Lanús', colorLike('Lanús')], ['Beromama', null], ['CASA de Padua', colorLike('CASA de Padua')], ['Del Oeste', null]],
    },
    {
        div: { id: 'af-urba-primera', label: 'Primera femenina de la URBA', branch: 'fem', region: 'femenino', level: 2, promotesTo: 'af-urba-top9', relegatesTo: 'af-urba-segunda' },
        pool: 'rioF', top: 52,
        clubs: [['San Marcos', null], ['Tigre', null], ['SITAS', colorLike('SITAS')], ['Don Bosco', colorLike('Don Bosco')], ['Univ. de La Matanza', null], ['Municipalidad de Avellaneda', null], ['Municipalidad de Berazategui', null], ['Marcos Paz', null], ['Ciudad de Campana', null]],
    },
    {
        div: { id: 'af-urba-segunda', label: 'Segunda femenina de la URBA', branch: 'fem', region: 'femenino', level: 3, promotesTo: 'af-urba-primera', relegatesTo: null },
        pool: 'rioF', top: 45,
        clubs: [['Los Tilos', colorLike('Los Tilos')], ['Universitario de La Plata', colorLike('Universitario de La Plata')], ['San Miguel', null], ['Vicente López', colorLike('Vicente López')], ['Atlético y Progreso', colorLike('Atlético y Progreso')], ['Banco Hipotecario', colorLike('Banco Hipotecario')], ['Defensores de Glew', null], ['GyE de Ituzaingó', null], ['PAC General Rodríguez', null]],
    },
    {
        div: { id: 'af-centro', label: 'Femenino del Centro (Córdoba y Andina)', branch: 'fem', region: 'femenino', level: 1, promotesTo: null, relegatesTo: null },
        pool: 'rioF', top: 60,
        clubs: [['Universitario de Córdoba', colorLike('Universitario de Córdoba')], ['Taborín', null], ['Córdoba Athletic', colorLike('Córdoba Athletic')], ['Córdoba RC / La Tablada', colorLike('La Tablada')], ['Palermo Bajo / Carlos Paz', colorLike('Palermo Bajo')], ['Aero Club Río Cuarto', colorLike('Aero Club Río Cuarto')], ['Catamarca Rugby Club', colorLike('Catamarca Rugby Club')], ['Mañke', null], ['Los Chelcos', colorLike('Los Chelcos')]],
    },
];
/**
 * Los que juegan el Nacional de Clubes Femenino por sus regiones (no tienen
 * liga en la carrera): entran fijos, como en la edición 2026.
 */
export const FEM_GUESTS: [string, string | null][] = [['Cardenales', colorLike('Cardenales')], ['Cha Roga', colorLike('Cha Roga')], ['Universitario de Mendoza', colorLike('Universitario de Mendoza')], ['Aguará Guazú', colorLike('Aguará Guazú')], ['Águilas de Resistencia', null], ['Palihue', null], ['Marabunta', colorLike('Marabunta')], ['Regatas de Resistencia', colorLike('Regatas Resistencia')]];
export const FEM_GUEST_IDS = FEM_GUESTS.map(([name]) => `af-${slug(name)}`);
const prefixOf = (b: ArBranch) => ({ chile: 'cl', uruguay: 'uy', brasil: 'br', espana: 'es', espanaFem: 'ef', fem: 'af', francia: 'fr', inglaterra: 'en', sudafrica: 'za', portugal: 'pt', franciaFem: 'ffr', inglaterraFem: 'fen', alemania: 'de', polonia: 'pl', georgia: 'ge', rusia: 'ru', australia: 'au', chequia: 'cz', bolivia: 'bo', peru: 'pe', mexico: 'mx', colombia: 'co', gales: 'wa', escocia: 'sc', irlanda: 'ie', rumania: 'ro', italia: 'it', belgica: 'be', holanda: 'nl' } as Record<string, string>)[b] ?? 'xx';
const FOREIGN_CLUBS: GameClub[] = FOREIGN.flatMap((f) =>
    f.clubs.map(([name, color], i) => ({
        id: `${prefixOf(f.div.branch)}-${slug(name)}`,
        name,
        short: name.replace(/^(Old|Los|Las|Club|CD|RC)\s+/, '').slice(0, 3).toUpperCase(),
        color,
        rating: 40,
        division: f.div.id,
        ranking: null,
        pool: f.pool,
        fixed: f.top - i,
    })),
);
const GUEST_CLUBS: GameClub[] = FEM_GUESTS.map(([name, color], i) => ({ id: FEM_GUEST_IDS[i], name, short: name.slice(0, 3).toUpperCase(), color, rating: 40, division: 'af-invitados', ranking: null, pool: 'rioF', fixed: 56 - i }));
const FOREIGN_DIVISIONS: GameDivision[] = FOREIGN.map((f) => ({ ...f.div, clubs: f.clubs.map(([name]) => `${prefixOf(f.div.branch)}-${slug(name)}`) }));

const DIV_OVERRIDE: Record<string, Partial<ArSevenDivision>> = {
    'ar-centro-super9b': { relegatesTo: 'ar-centro-desarrollo' },
    'ar-noa-andina': { promotesTo: null },
    'ar-patagonia-tdf': { promotesTo: 'ar-patagonia-regional' },
    'ar-patagonia-santacruz': { promotesTo: 'ar-patagonia-regional' },
};

/** Clubes del juego: los del canon, el Desarrollo de Córdoba y las ligas de afuera. */
export const AR_SEVEN_CLUBS: GameClub[] = [...GEN_CLUBS, ...CBA_CLUBS, ...FOREIGN_CLUBS, ...GUEST_CLUBS];
/** Divisiones del juego: las del canon (con los cruces de arriba), el Desarrollo de Córdoba y las ligas de afuera. */
export const AR_SEVEN_DIVISIONS: GameDivision[] = [
    ...GEN_DIVISIONS.map((d) => ({ ...d, ...(DIV_OVERRIDE[d.id] ?? {}) })),
    { id: 'ar-centro-desarrollo', label: 'Desarrollo de Córdoba', branch: 'interior', region: 'centro', level: 6, promotesTo: 'ar-centro-super9b', relegatesTo: null, clubs: CBA_DESARROLLO_ZONES.flat() },
    ...FOREIGN_DIVISIONS,
];
export { AR_SEVEN_CUPOS };

const NAVY = '#14234a';
const W = '#f4f4f4';
/** Para los clubes que la base todavía no tiene con color: uno fijo por nombre, nunca al azar. */
const FALLBACK = ['#1f4fa0', '#c8102e', '#0b6b3a', '#14234a', '#6e1a2c', '#ef7d1a', '#18181c', '#2c8fd0'];
const PATTERNS: Kit['pattern'][] = ['aros', 'liso', 'banda'];

function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

function luminance(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/**
 * Camisetas titulares relevadas a mano (fuente: sitios de los clubes y prensa).
 * Mandan sobre el color de la base, que solo trae el principal. Clave = nombre
 * del canon.
 */
const AR_KITS: Record<string, Kit> = {
    // Azul y rojo, a aros (dato confirmado por el proyecto).
    "La Tablada": { shirt: '#1b2f7a', shirt2: '#c8102e', shorts: '#1b2f7a', socks: '#1b2f7a', pattern: 'aros' },
    "Jockey Club Villa María": { shirt: '#0a7a3c', shirt2: '#ffffff', shorts: '#ffffff', socks: '#c8102e', pattern: 'liso' },
    "San Martín de Villa María": { shirt: '#c8102e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#c8102e', pattern: 'liso' },
    "Córdoba Rugby Club": { shirt: '#1f3a93', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "Alta Gracia": { shirt: '#f47920', shirt2: '#000000', shorts: '#000000', socks: '#f47920', pattern: 'aros' },
    "Los Cuervos": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "San Francisco": { shirt: '#ffffff', shirt2: '#0a7a3c', shorts: '#1f3a93', socks: '#0a7a3c', pattern: 'liso' },
    "Aero Club Río Cuarto": { shirt: '#1f3a93', shirt2: '#c8102e', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "Universitario de Rosario": { shirt: '#0099ff', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'aros' },
    "Jockey Club de Venado Tuerto": { shirt: '#1f3a93', shirt2: '#c8102e', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "CRAR": { shirt: '#0a7a3c', shirt2: '#ffffff', shorts: '#ffffff', socks: '#0a7a3c', pattern: 'liso' },
    "Logaritmo": { shirt: '#7a1f2b', shirt2: '#1f3a93', shorts: '#1f3a93', socks: '#7a1f2b', pattern: 'aros' },
    "Alma Juniors": { shirt: '#6cace4', shirt2: '#ffffff', shorts: '#ffffff', socks: '#6cace4', pattern: 'liso' },
    "Los Caranchos": { shirt: '#ffffff', shirt2: '#111111', shorts: '#111111', socks: '#ffffff', pattern: 'liso' },
    "Universitario de Santa Fe": { shirt: '#000000', shirt2: '#ffffff', shorts: '#000000', socks: '#000000', pattern: 'liso' },
    "Provincial": { shirt: '#ffffff', shirt2: '#e4002b', shorts: '#ffffff', socks: '#e4002b', pattern: 'liso' },
    "Tilcara": { shirt: '#096b44', shirt2: '#ffffff', shorts: '#ffffff', socks: '#096b44', pattern: 'liso' },
    "Cha Roga": { shirt: '#c8102e', shirt2: '#1f3a93', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "La Salle Jobson": { shirt: '#1f3a93', shirt2: '#ffffff', shorts: '#1f3a93', socks: '#1f3a93', pattern: 'aros' },
    "San Nicolás Rugby": { shirt: '#ffffff', shirt2: '#c8102e', shorts: '#ffffff', socks: '#40c4d0', pattern: 'liso' },
    "Gimnasia y Esgrima de Pergamino": { shirt: '#1f3a93', shirt2: '#f2b705', shorts: '#1f3a93', socks: '#1f3a93', pattern: 'liso' },
    "Los Pampas de Rufino": { shirt: '#ffffff', shirt2: '#1f3a93', shorts: '#ffffff', socks: '#ffffff', pattern: 'liso' },
    "Mendoza Rugby Club": { shirt: '#1f3a9e', shirt2: '#d62828', shorts: '#ffffff', socks: '#d62828', pattern: 'liso' },
    "Universitario de San Juan": { shirt: '#7a1f2e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#7a1f2e', pattern: 'liso' },
    "Teqüe Rugby Club": { shirt: '#0000cc', shirt2: '#d0102e', shorts: '#ffffff', socks: '#0000cc', pattern: 'liso' },
    "Peumayén": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'aros' },
    "Huazihul": { shirt: '#d0101e', shirt2: '#111111', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "Universitario de Mendoza": { shirt: '#1a8a3a', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1a8a3a', pattern: 'aros' },
    "Banco Rugby Club": { shirt: '#ffffff', shirt2: '#00325c', shorts: '#00325c', socks: '#00325c', pattern: 'banda' },
    "Tacurú": { shirt: '#1e3a9a', shirt2: '#f2d000', shorts: '#1e3a9a', socks: '#1e3a9a', pattern: 'liso' },
    "Alfiles": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'aros' },
    "Jockey Club de San Juan": { shirt: '#1c2a6b', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1c2a6b', pattern: 'liso' },
    "Belgrano Rugby Club": { shirt: '#d62828', shirt2: '#1c2a6b', shorts: '#1c2a6b', socks: '#d62828', pattern: 'liso' },
    "Universitario de Salta": { shirt: '#228b22', shirt2: '#ffffff', shorts: '#ffffff', socks: '#ffffff', pattern: 'aros' },
    "Jockey Club de Salta": { shirt: '#e00000', shirt2: '#ffffff', shorts: '#ffffff', socks: '#e00000', pattern: 'liso' },
    "Lince": { shirt: '#8a8d91', shirt2: '#e03a2a', shorts: '#8a8d91', socks: '#8a8d91', pattern: 'liso' },
    "Tigres": { shirt: '#000000', shirt2: '#d0101e', shorts: '#ffffff', socks: '#000000', pattern: 'aros' },
    "Gimnasia y Tiro": { shirt: '#ffffff', shirt2: '#5bb6e6', shorts: '#ffffff', socks: '#ffffff', pattern: 'liso' },
    "Santiago Lawn Tennis": { shirt: '#c8102e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#c8102e', pattern: 'liso' },
    "Jockey Club de Tucumán": { shirt: '#7a1f24', shirt2: '#87ceeb', shorts: '#ffffff', socks: '#7a1f24', pattern: 'liso' },
    "Old Lions": { shirt: '#c8102e', shirt2: '#1c3f94', shorts: '#ffffff', socks: '#1c3f94', pattern: 'aros' },
    "Tiro Federal de Salta": { shirt: '#ffffff', shirt2: '#3fa9f5', shorts: '#111111', socks: '#111111', pattern: 'banda' },
    "Aguará Guazú": { shirt: '#1c2a6b', shirt2: '#d62828', shorts: '#1c2a6b', socks: '#d62828', pattern: 'liso' },
    "Santiago Rugby": { shirt: '#111111', shirt2: '#1f9a3a', shorts: '#111111', socks: '#f08a1c', pattern: 'liso' },
    "La Querencia": { shirt: '#1f4fbf', shirt2: '#2e9a3a', shorts: '#ffffff', socks: '#1f4fbf', pattern: 'liso' },
    "Los Teros": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "Los Hurones": { shirt: '#111111', shirt2: '#c9a227', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "Los Chelcos": { shirt: '#1f9a3a', shirt2: '#f2d000', shorts: '#ffffff', socks: '#1f9a3a', pattern: 'aros' },
    "Catamarca Rugby Club": { shirt: '#111111', shirt2: '#f0a020', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "Club Social Rugby": { shirt: '#d62828', shirt2: '#1c3f94', shorts: '#1c3f94', socks: '#1c3f94', pattern: 'liso' },
    "Aranduroga": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'aros' },
    "CURNE": { shirt: '#f5c400', shirt2: '#c8102e', shorts: '#111111', socks: '#f5c400', pattern: 'liso' },
    "San Patricio de Corrientes": { shirt: '#1e7b3a', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1e7b3a', pattern: 'liso' },
    "CAPRI": { shirt: '#1f4fa3', shirt2: '#ffffff', shorts: '#1f4fa3', socks: '#1f4fa3', pattern: 'liso' },
    "Regatas Resistencia": { shirt: '#c8102e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#c8102e', pattern: 'liso' },
    "Sixty": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "Aguará": { shirt: '#1f3f8f', shirt2: '#6cace4', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'aros' },
    "San José de Paraguay": { shirt: '#6cace4', shirt2: '#ffffff', shorts: '#ffffff', socks: '#6cace4', pattern: 'liso' },
    "CURDA": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "Pay Ubre": { shirt: '#c8102e', shirt2: '#1f3f8f', shorts: '#1f3f8f', socks: '#c8102e', pattern: 'liso' },
    "Italiana de Charata": { shirt: '#1f4fa3', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1f4fa3', pattern: 'liso' },
    "Chajá": { shirt: '#1e7b3a', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1e7b3a', pattern: 'liso' },
    "Centro Cazadores": { shirt: '#1f3f8f', shirt2: '#c8102e', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'aros' },
    "Carayá": { shirt: '#1e7b3a', shirt2: '#f5c400', shorts: '#1e7b3a', socks: '#1e7b3a', pattern: 'liso' },
    "Caza y Pesca": { shirt: '#c8102e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#c8102e', pattern: 'liso' },
    "Argentino de Bahía Blanca": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "IPR Sporting": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "Comercial Rugby Club": { shirt: '#1e7b3a', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1e7b3a', pattern: 'liso' },
    "Los Cardos": { shirt: '#1e7b3a', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1e7b3a', pattern: 'liso' },
    "San Ignacio": { shirt: '#1e7b3a', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1e7b3a', pattern: 'liso' },
    "Universitario de Bahía Blanca": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "Estudiantes de Olavarría": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "Los 50": { shirt: '#111111', shirt2: '#5b2a86', shorts: '#1f2a5a', socks: '#111111', pattern: 'aros' },
    "Biguá": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#c8102e', pattern: 'aros' },
    "Unión del Sur": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'banda' },
    "Pueyrredón de Mar del Plata": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "Uncas": { shirt: '#f5c400', shirt2: '#111111', shorts: '#111111', socks: '#111111', pattern: 'aros' },
    "Los Miuras": { shirt: '#c8102e', shirt2: '#111111', shorts: '#111111', socks: '#c8102e', pattern: 'liso' },
    "El Nacional": { shirt: '#6cace4', shirt2: '#ffffff', shorts: '#ffffff', socks: '#6cace4', pattern: 'liso' },
    "Santa Rosa de La Pampa": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "Punta Alta Rugby Club": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "Pico Rugby Club": { shirt: '#111111', shirt2: '#c8102e', shorts: '#111111', socks: '#111111', pattern: 'aros' },
    "Trelew": { shirt: '#1d4fa0', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1d4fa0', pattern: 'liso' },
    "Bigornia Club": { shirt: '#ff8800', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'aros' },
    "Chenque": { shirt: '#6cace4', shirt2: '#ffffff', shorts: '#ffffff', socks: '#6cace4', pattern: 'liso' },
    "Neuquén": { shirt: '#1f3a93', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "Roca": { shirt: '#c8102e', shirt2: '#1f3a93', shorts: '#1f3a93', socks: '#c8102e', pattern: 'liso' },
    "Deportivo Portugués": { shirt: '#c8102e', shirt2: '#00843d', shorts: '#00843d', socks: '#c8102e', pattern: 'liso' },
    "Marabunta": { shirt: '#00843d', shirt2: '#ffffff', shorts: '#ffffff', socks: '#00843d', pattern: 'aros' },
    "Las Águilas": { shirt: '#d6168b', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'liso' },
    "Puerto Madryn": { shirt: '#1f24b4', shirt2: '#c8102e', shorts: '#ffffff', socks: '#1f24b4', pattern: 'aros' },
    "Calafate": { shirt: '#1f3a93', shirt2: '#000000', shorts: '#000000', socks: '#1f3a93', pattern: 'aros' },
    "Comodoro": { shirt: '#1f3a93', shirt2: '#c8102e', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "Patoruzú": { shirt: '#f5c400', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'aros' },
    "Universitario de Comodoro": { shirt: '#1f3a93', shirt2: '#c8102e', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "Draig Goch": { shirt: '#c8102e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#c8102e', pattern: 'liso' },
    "San Jorge de la Austral": { shirt: '#ffffff', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'aros' },
    "Allen": { shirt: '#000000', shirt2: '#ffffff', shorts: '#000000', socks: '#000000', pattern: 'aros' },
    "Cipolletti": { shirt: '#000000', shirt2: '#ffffff', shorts: '#000000', socks: '#000000', pattern: 'liso' },
    "Ushuaia Rugby Club": { shirt: '#1f3a93', shirt2: '#ffffff', shorts: '#1f3a93', socks: '#1f3a93', pattern: 'liso' },
    "Macá Tobiano": { shirt: '#00843d', shirt2: '#000000', shorts: '#000000', socks: '#00843d', pattern: 'liso' },
    "CASI": { shirt: '#000000', shirt2: '#ffffff', shorts: '#ffffff', socks: '#ffffff', pattern: 'aros' },
    "Newman": { shirt: '#7d1222', shirt2: '#f06030', shorts: '#7d1222', socks: '#008000', pattern: 'liso' },
    "Alumni": { shirt: '#f80000', shirt2: '#ffffff', shorts: '#ffffff', socks: '#f80000', pattern: 'aros' },
    "Hindú Club": { shirt: '#0199e4', shirt2: '#f8c800', shorts: '#ffffff', socks: '#0199e4', pattern: 'aros' },
    "SIC": { shirt: '#ffffff', shirt2: '#28a8e0', shorts: '#ffffff', socks: '#0000cc', pattern: 'aros' },
    "Belgrano Athletic": { shirt: '#601b27', shirt2: '#ffcc00', shorts: '#ffffff', socks: '#601b27', pattern: 'aros' },
    "CUBA": { shirt: '#0099ff', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'liso' },
    "Los Tilos": { shirt: '#009900', shirt2: '#ffcc00', shorts: '#ffffff', socks: '#009900', pattern: 'liso' },
    "Regatas Bella Vista": { shirt: '#f8c800', shirt2: '#000080', shorts: '#ffffff', socks: '#000080', pattern: 'aros' },
    "Buenos Aires": { shirt: '#1a2d69', shirt2: '#ffffff', shorts: '#1a2d69', socks: '#ff0000', pattern: 'liso' },
    "La Plata": { shirt: '#ffdd00', shirt2: '#000066', shorts: '#000066', socks: '#000066', pattern: 'liso' },
    "Los Matreros": { shirt: '#ffffff', shirt2: '#ff0000', shorts: '#ffffff', socks: '#ffffff', pattern: 'liso' },
    "Atlético del Rosario": { shirt: '#af003d', shirt2: '#87ceeb', shorts: '#ffffff', socks: '#af003d', pattern: 'aros' },
    "Champagnat": { shirt: '#003060', shirt2: '#ffffff', shorts: '#ffffff', socks: '#043464', pattern: 'banda' },
    "Jockey Club Córdoba": { shirt: '#ffffff', shirt2: '#ff0000', shorts: '#ffffff', socks: '#ff0000', pattern: 'aros' },
    "Tala": { shirt: '#ffffff', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'aros' },
    "Córdoba Athletic": { shirt: '#ff0000', shirt2: '#000000', shorts: '#000000', socks: '#ff0000', pattern: 'liso' },
    "Universitario de Córdoba": { shirt: '#ffffff', shirt2: '#f81010', shorts: '#ffffff', socks: '#ffffff', pattern: 'banda' },
    "Duendes": { shirt: '#339900', shirt2: '#000000', shorts: '#000000', socks: '#339900', pattern: 'liso' },
    "Jockey Club de Rosario": { shirt: '#337700', shirt2: '#ffffff', shorts: '#ffffff', socks: '#ff0000', pattern: 'aros' },
    "Gimnasia y Esgrima de Rosario": { shirt: '#1a2a6c', shirt2: '#ffd700', shorts: '#1a2a6c', socks: '#1a2a6c', pattern: 'liso' },
    "Old Resian": { shirt: '#ffffff', shirt2: '#c8102e', shorts: '#ffffff', socks: '#1a2d69', pattern: 'aros' },
    "Santa Fe Rugby Club": { shirt: '#ffffff', shirt2: '#ff0000', shorts: '#063871', socks: '#ff0000', pattern: 'aros' },
    "CRAI": { shirt: '#4493de', shirt2: '#ffffff', shorts: '#000044', socks: '#000044', pattern: 'aros' },
    "Los Tordos": { shirt: '#a50c14', shirt2: '#132142', shorts: '#ffffff', socks: '#a50c14', pattern: 'aros' },
    "Marista": { shirt: '#ffffff', shirt2: '#f80000', shorts: '#ffffff', socks: '#ff0000', pattern: 'banda' },
    "Natación y Gimnasia": { shirt: '#ffffff', shirt2: '#003070', shorts: '#ffffff', socks: '#000000', pattern: 'banda' },
    "Palermo Bajo": { shirt: '#980000', shirt2: '#f8a000', shorts: '#ffffff', socks: '#990000', pattern: 'aros' },
    "Urú Curé": { shirt: '#a8a8a8', shirt2: '#000098', shorts: '#000080', socks: '#a9a9a9', pattern: 'liso' },
    "Estudiantes de Paraná": { shirt: '#ffffff', shirt2: '#000000', shorts: '#ffffff', socks: '#000000', pattern: 'liso' },
    "Tucumán Rugby": { shirt: '#009900', shirt2: '#000000', shorts: '#ffffff', socks: '#009900', pattern: 'liso' },
    "Huirapuca": { shirt: '#007700', shirt2: '#ff0000', shorts: '#ffffff', socks: '#007700', pattern: 'aros' },
    "Tucumán Lawn Tennis": { shirt: '#000080', shirt2: '#f8e000', shorts: '#ffffff', socks: '#000066', pattern: 'aros' },
    "Los Tarcos": { shirt: '#ee0000', shirt2: '#ffffff', shorts: '#ffffff', socks: '#ee0000', pattern: 'liso' },
    "Cardenales": { shirt: '#e00000', shirt2: '#000000', shorts: '#000000', socks: '#ffcc00', pattern: 'liso' },
    "Mar del Plata Club": { shirt: '#2e7d32', shirt2: '#ffffff', shorts: '#2e7d32', socks: '#2e7d32', pattern: 'liso' },
};

function kitOf(c: ArSevenClub): Kit {
    const known = AR_KITS[c.name];
    if (known) return known;
    const h = hash(c.name);
    const shirt = c.color && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color.toLowerCase() : FALLBACK[h % FALLBACK.length];
    const lum = luminance(shirt);
    return {
        shirt,
        shirt2: lum > 0.62 ? NAVY : W,
        shorts: lum > 0.62 ? NAVY : lum < 0.12 ? W : NAVY,
        socks: shirt,
        pattern: PATTERNS[(h >> 3) % PATTERNS.length],
    };
}

/** Palabras que no distinguen a un club de otro para armar su sigla. */
const STOP = new Set(['club', 'rugby', 'r', 'c', 'rc', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'asoc', 'asociacion', 'sociedad', 'hockey']);

/**
 * Sigla de tres letras para el marcador: las siglas propias se respetan (CASI,
 * CUBA, SIC), si no las iniciales de las palabras que cuentan, y si no las
 * primeras letras. Si dos clubes chocan, el segundo suma una letra más.
 */
function makeShorts(names: string[]): Map<string, string> {
    const used = new Set<string>();
    const out = new Map<string, string>();
    for (const name of names) {
        const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
        const words = plain.split(/[^A-Za-z0-9]+/).filter((w) => w && !STOP.has(w.toLowerCase()));
        let base: string;
        if (/^[A-Z]{3,4}$/.test(plain.trim())) base = plain.trim();
        else if (words.length >= 2) base = words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
        else base = (words[0] ?? plain).slice(0, 3).toUpperCase();
        if (base.length < 3) base = (words.join('') || plain).slice(0, 3).toUpperCase();
        let short = base;
        const pool = (words.join('') || plain).toUpperCase();
        for (let i = 3; used.has(short) && i <= pool.length; i++) short = base.slice(0, 2) + pool[i - 1];
        for (let n = 2; used.has(short); n++) short = `${base.slice(0, 2)}${n}`;
        used.add(short);
        out.set(name, short);
    }
    return out;
}
const SHORTS = makeShorts([...AR_SEVEN_CLUBS].sort((a, b) => (b.ranking ?? 0) - (a.ranking ?? 0) || b.rating - a.rating).map((c) => c.name));

/**
 * Fuerza en la escala del juego. Manda el ranking de clubes de Salida de 22,
 * que es de escala ARGENTINA (Newman ~99 por ser el mejor del país, no del
 * mundo): va casi derecho, 30 + ranking × 0,55 (Newman 84, Jockey de Rosario
 * 76, un ranking 50 da 57). Así el mejor argentino queda debajo de la élite
 * profesional (Toulouse 95, Leinster 93) y la distancia entre un club de
 * arriba y uno del montón se siente en la cancha. Los clubes sin ranking toman
 * la fuerza del canon (banda 24-52), llevada a 38-58.
 */
function gameRating(c: GameClub): number {
    if (c.fixed !== undefined) return c.fixed;
    // La URBA tiene más nivel de punta a punta que el interior: sin esto el Nacional lo ganaba casi siempre el interior.
    const urba = AR_SEVEN_DIVISIONS.find((d) => d.id === c.division)?.branch === 'urba' ? URBA_LIFT : 0;
    if (c.ranking !== null) return Math.round(30 + c.ranking * 0.55 + urba);
    return Math.round(38 + Math.max(0, c.rating - 24) * 0.72 + urba);
}
const URBA_LIFT = 5;

export const AR_CLUBS: SevenTeam[] = AR_SEVEN_CLUBS.map((c) => ({
    id: c.id,
    name: c.name,
    short: SHORTS.get(c.name) ?? c.short,
    kit: kitOf(c),
    players: isFemClub(c.id) ? squadFor(c.id, 'sudamerica').map(femLook) : squadFor(c.id, 'sudamerica'),
    fem: isFemClub(c.id) || undefined,
    rating: gameRating(c),
    flag: (() => {
        const k = kitOf(c);
        // Banderita con los colores del club (no el escudo): la dibuja FlagIcon a partir de este código.
        return `kit:${k.shirt}:${k.shirt2}:${k.pattern}`;
    })(),
    namePool: c.pool ?? 'rio',
    // Los 7 con más puntos del club (apellido recortado); sin datos, los de fábrica.
    names: AR_SEVEN_ROSTERS[c.id]?.map((short) => {
        const [first, ...rest] = short.split(' ');
        return { first, last: rest.join(' '), short };
    }),
    league: AR_SEVEN_DIVISIONS.find((d) => d.id === c.division)?.label,
}));

const AR_BY_ID: Record<string, SevenTeam> = Object.fromEntries(AR_CLUBS.map((c) => [c.id, c]));
export const arClubById = (id: string): SevenTeam | undefined => AR_BY_ID[id];

/** Divisiones jugables (con al menos cuatro clubes), en el orden del canon: URBA arriba, después el interior. */
/*
 * Nombres como los dice la gente: en Córdoba la segunda categoría es el Súper 9
 * (sus 4 mejores y los del Andino juegan el Regional A, que da el ascenso).
 */
export const AR_LABEL_OVERRIDE: Record<string, string> = {
    'ar-centro-super9b': 'Súper 9 de Córdoba',
};

export const AR_DIVISIONS_PLAYABLE = AR_SEVEN_DIVISIONS.filter((d) => d.clubs.length >= 4).map((d) => ({ ...d, label: AR_LABEL_OVERRIDE[d.id] ?? d.label }));

const byName = (name: string) => AR_SEVEN_CLUBS.find((c) => c.name === name)?.id;

/** Los clasificados al TDI A y al B 2026: los primeros de cada regional, según los cupos de su región. */
function tdiField(which: 'A' | 'B'): string[] {
    const out: string[] = [];
    for (const cupo of AR_SEVEN_CUPOS) {
        const div = AR_SEVEN_DIVISIONS.find((d) => d.id === cupo.sourceCompetitionId);
        if (!div) continue;
        const from = which === 'A' ? 0 : cupo.tdiA;
        const n = which === 'A' ? cupo.tdiA : cupo.tdiB;
        // En orden de fuerza (la del ranking de Salida de 22 cuando el club está rankeado).
        const ordered = [...div.clubs].sort((x, y) => (AR_BY_ID[y]?.rating ?? 0) - (AR_BY_ID[x]?.rating ?? 0));
        out.push(...ordered.slice(from, from + n));
    }
    return out;
}

function divisionTour(d: GameDivision): TourDef {
    const n = d.clubs.length;
    const top: 4 | 2 = n >= 6 ? 4 : 2;
    return {
        id: `ar-tour-${d.id}`,
        name: d.label,
        sub: ({ urba: 'Rama URBA.', interior: 'Regional del interior.', chile: 'Chile · ARUSA.', uruguay: 'Uruguay.', brasil: 'Brasil · CBRu.', espana: 'España · FER.', espanaFem: 'España · FER, femenino.', fem: 'Argentina, femenino.', francia: 'Francia · liga de clubes.', inglaterra: 'Inglaterra · liga de clubes.', sudafrica: 'Sudáfrica · copa de uniones.', portugal: 'Portugal · campeonato de clubes.', franciaFem: 'Francia · liga de clubes, femenino.', inglaterraFem: 'Inglaterra · liga de clubes, femenino.', alemania: 'Alemania · liga de clubes.', polonia: 'Polonia · liga de clubes.', georgia: 'Georgia · liga de clubes.', rusia: 'Rusia · liga de clubes.', australia: 'Australia · liga de clubes.', chequia: 'Chequia · liga de clubes.', bolivia: 'Bolivia · liga de clubes.', peru: 'Perú · liga de clubes.', mexico: 'México · liga de clubes.', gales: 'Gales · liga de clubes.', escocia: 'Escocia · liga de clubes.', irlanda: 'Irlanda · liga de clubes.', rumania: 'Rumania · liga de clubes.', italia: 'Italia · liga de clubes.', belgica: 'Bélgica · liga de clubes.', holanda: 'Países Bajos · liga de clubes.' } as Record<string, string>)[d.branch] ?? '',
        source: 'real',
        clubs: true,
        cat: isArgBranch(d.branch) || d.branch === 'fem' ? 'Argentina' : d.branch === 'chile' ? 'Chile' : d.branch === 'uruguay' ? 'Uruguay' : d.branch === 'brasil' ? 'Brasil' : d.branch === 'francia' || d.branch === 'franciaFem' ? 'Francia' : d.branch === 'inglaterra' || d.branch === 'inglaterraFem' ? 'Inglaterra' : d.branch === 'sudafrica' ? 'Sudáfrica' : d.branch === 'portugal' ? 'Portugal' : d.branch === 'alemania' ? 'Alemania' : d.branch === 'polonia' ? 'Polonia' : d.branch === 'georgia' ? 'Georgia' : d.branch === 'rusia' ? 'Rusia' : d.branch === 'australia' ? 'Australia' : d.branch === 'chequia' ? 'Chequia' : d.branch === 'bolivia' ? 'Bolivia' : d.branch === 'peru' ? 'Perú' : d.branch === 'mexico' ? 'México' : d.branch === 'colombia' ? 'Colombia' : d.branch === 'gales' ? 'Gales' : d.branch === 'escocia' ? 'Escocia' : d.branch === 'irlanda' ? 'Irlanda' : d.branch === 'rumania' ? 'Rumania' : d.branch === 'italia' ? 'Italia' : d.branch === 'belgica' ? 'Bélgica' : d.branch === 'holanda' ? 'Países Bajos' : 'España',
        teams: [...d.clubs],
        formatLabel: `${n} clubes · fase regular a una vuelta · ${top === 4 ? 'semifinales' : 'final'} con los ${top} primeros`,
        stage: { kind: 'grupos', groups: 1, advance: top },
    };
}

const newman = byName('Newman');
const tala = byName('Tala');

// Los de más nivel de cada lado, para los otros formatos del Nacional.
const byStrength = (ids: string[]) => [...ids].sort((x, y) => (AR_BY_ID[y]?.rating ?? 0) - (AR_BY_ID[x]?.rating ?? 0));
const U = byStrength(AR_SEVEN_DIVISIONS.find((d) => d.id === 'ar-urba-top14')?.clubs ?? []);
const I = byStrength(AR_SEVEN_CUPOS.flatMap((c) => AR_SEVEN_DIVISIONS.find((d) => d.id === c.sourceCompetitionId)?.clubs ?? []));
const NAC = { source: 'real' as const, clubs: true, cat: 'Argentina' };

/** Torneos argentinos 2026: el Nacional, el Torneo del Interior y cada división (el Top 14 de la URBA primero). */
export const AR_TOURS: TourDef[] = [
    {
        id: 'ddc8bd89-50cc-48c0-be02-3bda4fc437a9', name: 'Nacional de Clubes', sub: 'Campeón del Top 14 de la URBA contra campeón del TDI A.', source: 'real',
        formatLabel: 'Final única · se pueden cambiar los dos equipos', clubs: true, cat: 'Argentina',
        teams: [newman, tala].filter((x): x is string => !!x),
        stage: { kind: 'ko' },
    },
    {
        ...NAC, id: 'ar-nacional-semis', name: 'Nacional de Clubes · semifinales', sub: 'Los dos mejores de la URBA y del interior: campeón contra subcampeón del otro lado.',
        formatLabel: 'Semifinales cruzadas y final',
        teams: [U[0], I[1], I[0], U[1]].filter(Boolean),
        stage: { kind: 'ko', fixed: true },
    },
    {
        ...NAC, id: 'ar-nacional-zonas', name: 'Nacional de Clubes · dos zonas', sub: 'Los cuatro mejores de cada lado, en dos zonas mezcladas.',
        formatLabel: '2 zonas de 4 · semifinales y final',
        teams: [...U.slice(0, 4), ...I.slice(0, 4)],
        stage: { kind: 'grupos', groups: [[U[0], U[3], I[1], I[2]], [I[0], I[3], U[1], U[2]]].map((g) => g.filter(Boolean)), advance: 2 },
    },
    {
        ...NAC, id: 'ar-nacional-a', name: 'Nacional de Clubes A', sub: 'Los 8 mejores de la URBA contra los 8 mejores del interior.',
        formatLabel: '4 zonas de 4 a dos ruedas · cuartos, semifinales y final',
        teams: [...U.slice(0, 8), ...I.slice(0, 8)],
        stage: { kind: 'grupos', groups: 4, advance: 2, legs: 2 },
    },
    {
        ...NAC, id: 'ar-nacional-b', name: 'Nacional de Clubes B', sub: 'Los 6 de abajo del Top 14 y los 10 que siguen del interior.',
        formatLabel: '4 zonas de 4 a dos ruedas · cuartos, semifinales y final',
        teams: [...U.slice(8, 14), ...I.slice(8, 18)],
        stage: { kind: 'grupos', groups: 4, advance: 2, legs: 2 },
    },
    {
        id: 'ed986d61-7389-48e5-b478-c1703b0e8379', name: 'Torneo del Interior A', sub: 'Las 16 plazas del interior, repartidas por región.', source: 'real',
        formatLabel: '4 zonas de 4 a dos ruedas · 1.º y 2.º a cuartos · semifinales y final', clubs: true, cat: 'Argentina',
        teams: tdiField('A'),
        stage: { kind: 'grupos', groups: 4, advance: 2, legs: 2 },
    },
    {
        id: 'e2712855-36f4-4363-978e-5036af5c5449', name: 'Torneo del Interior B', sub: 'El segundo nivel federal: otras 16 plazas regionales.', source: 'real',
        formatLabel: '4 zonas de 4 a dos ruedas · 1.º y 2.º a cuartos · semifinales y final', clubs: true, cat: 'Argentina',
        teams: tdiField('B'),
        stage: { kind: 'grupos', groups: 4, advance: 2, legs: 2 },
    },
    ...AR_DIVISIONS_PLAYABLE.map(divisionTour),
];
