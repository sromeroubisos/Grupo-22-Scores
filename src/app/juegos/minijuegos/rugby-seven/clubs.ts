/*
 * Clubes profesionales del Seven.
 *
 * Los nombres y la fuerza salen del catálogo de la Carrera de Rugby
 * (`features/career/data/clubs2026`): una sola fuente, así los dos juegos ven
 * los mismos clubes en la misma liga. Acá se agrega lo que el Seven necesita:
 * camiseta en píxeles (colores de referencia del club, sin escudo ni
 * sponsors), sigla de tres letras, país (bandera y nombres ficticios) y los
 * torneos con su formato.
 */

import { CLUB_STRENGTH } from '@/features/career/data/clubs2026/clubStrength';
import { ROSTERS_2026_27 } from '@/features/career/data/clubs2026/rosters2026';
import { arClubById } from './arClubs';
import { NATION_BY_CODE, squadFor, type Region } from './nations';
import type { Kit } from './sprites';
import type { SevenTeam } from './teams';
import type { TourDef } from './tours';

type P = Kit['pattern'];
const W = '#f4f4f4';
const ROYAL = '#1f4fa0';

/** [sigla, camiseta, segundo color, short, medias, diseño] — colores de referencia, sin escudos ni sponsors. */
type Look = [string, string, string, string, string, P];

const LOOKS: Record<string, Look> = {
    // ── Top 14 ──
    'Stade Toulousain': ['TOU', '#111111', '#c8102e', '#111111', '#c8102e', 'aros'],
    'Union Bordeaux-Bègles': ['UBB', '#5a0f2a', '#1b2a4a', '#ffffff', '#5a0f2a', 'liso'],
    'Stade Rochelais': ['LRO', '#111111', '#ffd400', '#111111', '#111111', 'liso'],
    'Racing 92': ['R92', '#8ec5e8', '#ffffff', '#ffffff', '#8ec5e8', 'aros'],
    'Stade Français': ['SFP', '#f472b6', '#0b1f4b', '#f472b6', '#f472b6', 'liso'],
    'ASM Clermont': ['ASM', '#ffd700', '#0a2a8a', '#0a2a8a', '#ffd700', 'liso'],
    'Section Paloise': ['PAU', '#004231', '#ffffff', '#ffffff', '#004231', 'banda'],
    Montpellier: ['MHR', '#0b1838', '#ffffff', '#0b1838', '#0b1838', 'liso'],
    'RC Toulon': ['RCT', '#d7262f', '#111111', '#111111', '#d7262f', 'aros'],
    'Castres Olympique': ['CAS', '#1f5fbf', '#0b1f4b', '#1f5fbf', '#1f5fbf', 'liso'],
    'LOU Rugby': ['LOU', '#c00418', '#2b2b2b', '#1f1b1c', '#1f1b1c', 'liso'],
    'Aviron Bayonnais': ['BAY', '#81bbe9', '#ffffff', '#ffffff', '#81bbe9', 'liso'],
    'USA Perpignan': ['USP', '#94d4ef', '#c8102e', '#ffffff', '#94d4ef', 'liso'],
    'RC Vannes': ['VAN', '#1f3fbf', '#ffffff', '#18116e', '#18116e', 'liso'],
    // ── Pro D2 ──
    'Colomiers Rugby': ['COL', '#00137f', '#ffffff', '#00137f', '#00137f', 'liso'],
    'Provence Rugby': ['PRO', '#1e1e1e', '#ffffff', '#1e1e1e', '#1e1e1e', 'liso'],
    Oyonnax: ['OYO', '#111111', '#c8102e', '#111111', '#111111', 'liso'],
    'Valence Romans': ['VRD', '#ffffff', '#c8102e', '#111111', '#111111', 'liso'],
    'CA Brive': ['CAB', '#111111', '#ffffff', '#111111', '#ffffff', 'aros'],
    'SU Agen': ['AGE', '#1e2952', '#ffffff', '#1e2952', '#1e2952', 'liso'],
    'FC Grenoble': ['FCG', '#0033a0', '#d7262f', '#0033a0', '#d7262f', 'liso'],
    'Soyaux-Angoulême XV': ['SAX', '#59084e', '#c9a0dc', '#59084e', '#59084e', 'liso'],
    'Biarritz Olympique': ['BOP', '#e30613', '#ffffff', '#e30613', '#e30613', 'liso'],
    'US Dax': ['DAX', '#e2001a', '#ffffff', '#ffffff', '#e2001a', 'liso'],
    'AS Béziers': ['ASB', '#000080', '#e30613', '#e30613', '#000080', 'liso'],
    'USON Nevers': ['NEV', '#ffdb00', '#1b2d52', '#1b2d52', '#21007f', 'liso'],
    'Stade Aurillacois': ['AUR', '#be082e', '#1b2d6b', '#ff2626', '#ff2626', 'liso'],
    'Nissa Rugby': ['NIS', '#e30613', '#111111', '#111111', '#111111', 'liso'],
    'RC Narbonnais': ['NAR', '#ff6900', '#111111', '#111111', '#ff6900', 'aros'],
    'US Montauban': ['MTB', '#1f5c3a', '#f2c200', '#111111', '#111111', 'liso'],
    // ── Premiership ──
    Bath: ['BAT', '#0033cc', '#ffffff', '#0033cc', '#0033cc', 'aros'],
    'Bristol Bears': ['BRI', '#0b1f5c', '#3a7bd5', '#0b1f5c', '#ffffff', 'liso'],
    'Exeter Chiefs': ['EXE', '#111111', '#ffffff', '#111111', '#111111', 'liso'],
    Gloucester: ['GLO', '#a6192e', '#ffffff', '#111111', '#a6192e', 'aros'],
    Harlequins: ['HAR', '#cd273d', '#6ec3e8', '#111111', '#32c046', 'liso'],
    'Leicester Tigers': ['LEI', '#044231', '#cc0000', '#044231', '#044231', 'liso'],
    'Newcastle Red Bulls': ['NEW', '#111111', '#ffffff', '#111111', '#111111', 'banda'],
    'Northampton Saints': ['NOR', '#008469', '#f2c200', '#111111', '#008469', 'aros'],
    'Sale Sharks': ['SAL', '#000099', '#ffffff', '#000099', '#000099', 'liso'],
    Saracens: ['SAR', '#111111', '#cc0000', '#111111', '#cc0000', 'liso'],
    // ── URC ──
    Leinster: ['LNS', '#0b3a8c', '#d4af37', '#0b3a8c', '#0b3a8c', 'liso'],
    Munster: ['MUN', '#d50032', '#001f3f', '#001f3f', '#001f3f', 'liso'],
    Ulster: ['ULS', '#fcfcfc', '#c8102e', '#fcfcfc', '#fcfcfc', 'liso'],
    Connacht: ['CON', '#00492c', '#00be2d', '#00492c', '#00492c', 'liso'],
    'Glasgow Warriors': ['GLA', '#111111', '#1f4e9c', '#111111', '#111111', 'liso'],
    'Edinburgh Rugby': ['EDI', '#000055', '#e87722', '#000055', '#000055', 'liso'],
    Ospreys: ['OSP', '#000000', '#007fff', '#000000', '#000000', 'liso'],
    Scarlets: ['SCA', '#cb1b1b', '#ffffff', '#cb1b1b', '#cb1b1b', 'liso'],
    'Cardiff Rugby': ['CAR', '#71c8f3', '#000000', '#000000', '#000000', 'liso'],
    Dragons: ['DRA', '#ffb81c', '#000000', '#000000', '#000000', 'liso'],
    'Benetton Treviso': ['BEN', '#01915c', '#ffffff', '#ffffff', '#ffffff', 'aros'],
    'Zebre Parma': ['ZEB', '#ffd700', '#000099', '#ffd700', '#ffd700', 'liso'],
    Bulls: ['BUL', '#75c2ee', '#0a3a79', '#0a3a79', '#75c2ee', 'liso'],
    Stormers: ['STO', '#ffffff', '#0033a0', '#0a1a3a', '#0a1a3a', 'aros'],
    Sharks: ['SHA', '#1a1a1a', '#ffffff', '#000000', '#000000', 'liso'],
    Lions: ['LIO', '#e30613', '#000000', '#000000', '#000000', 'liso'],
    // ── Super Rugby Pacific ──
    Hurricanes: ['HUR', '#ffd100', '#000000', '#000000', '#ffd100', 'liso'],
    Chiefs: ['CHI', '#000000', '#c8102e', '#000000', '#000000', 'liso'],
    Crusaders: ['CRU', '#d50000', '#000000', '#000000', '#000000', 'banda'],
    Blues: ['BLU', '#0033a0', '#000000', '#000000', '#000000', 'liso'],
    Reds: ['RED', '#a6192e', '#ffffff', '#0f1e40', '#a6192e', 'liso'],
    Brumbies: ['BRU', '#132232', '#ffffff', '#132232', '#222442', 'liso'],
    'Western Force': ['WFO', '#0033cc', '#000000', '#000000', '#0033cc', 'banda'],
    Waratahs: ['WAR', '#86d1fd', '#002551', '#002551', '#86d1fd', 'liso'],
    Highlanders: ['HIG', '#003060', '#f2a900', '#003060', '#003060', 'liso'],
    'Fijian Drua': ['DRU', '#0a14be', '#e4002b', '#0a14be', '#0a14be', 'liso'],
    'Moana Pasifika': ['MOA', '#29d0dd', '#1a5cb2', '#1a5cb2', '#1a5cb2', 'liso'],
    // ── Currie Cup ──
    'Free State Cheetahs': ['CHE', '#f47920', '#ffffff', '#ffffff', '#f47920', 'liso'],
    'Natal Sharks': ['NSH', '#1a1a1a', '#ffffff', '#000000', '#000000', 'liso'],
    'Boland Kavaliers': ['BOL', '#000000', '#d4af37', '#000000', '#000000', 'banda'],
    'Western Province': ['WPR', '#ffffff', '#0033a0', '#0a1a3a', '#0a1a3a', 'aros'],
    'Golden Lions': ['GLI', '#e30613', '#000000', '#000000', '#000000', 'liso'],
    Pumas: ['PUM', '#d0d3d4', '#e4002b', '#000000', '#000000', 'liso'],
    Griquas: ['GRI', '#007a87', '#ffffff', '#000000', '#007a87', 'aros'],
    'Blue Bulls': ['BBU', '#75c2ee', '#0a3a79', '#0a3a79', '#75c2ee', 'liso'],
    // ── Super Rugby Americas ──
    'Dogos XV': ['DOG', '#cc0000', '#000000', '#ffffff', '#cc0000', 'banda'],
    'Peñarol Rugby': ['PEN', '#ffe700', '#000000', '#000000', '#ffe700', 'liso'],
    Pampas: ['PAM', '#000066', '#75aadb', '#000066', '#cc0000', 'liso'],
    Selknam: ['SEL', '#2f2e34', '#c8102e', '#2f2e34', '#2f2e34', 'liso'],
    'Cobras Brasil Rugby': ['COB', '#00269b', '#ffcc00', '#00269b', '#00269b', 'liso'],
    Tarucas: ['TAR', '#fb8b14', '#000000', '#000000', '#fd6d27', 'banda'],
    'Yacaré XV': ['YAC', '#ffffff', '#0000cc', '#0000cc', '#0000cc', 'liso'],
    'Capibaras XV': ['CAP', '#0e192d', '#ffffff', '#ffffff', '#0e192d', 'liso'],
    // ── Japan League One D1 ──
    'Saitama Wild Knights': ['SWK', '#0040a0', '#ffffff', '#0038a0', '#0158a8', 'liso'],
    'Toshiba Brave Lupus Tokyo': ['BLT', '#f01830', '#000000', '#ffffff', '#f01c32', 'liso'],
    'Kubota Spears': ['KUB', '#f05828', '#ffffff', '#f05828', '#f25b2c', 'liso'],
    'Yokohama Canon Eagles': ['YCE', '#e01000', '#000000', '#000000', '#e21700', 'liso'],
    'Tokyo Sungoliath': ['SUN', '#f8c000', '#000000', '#000000', '#000000', 'liso'],
    'Kobelco Kobe Steelers': ['KOB', '#c01828', '#ffffff', '#c82028', '#cc262d', 'liso'],
    'Toyota Verblitz': ['TVB', '#004018', '#006830', '#004018', '#034218', 'liso'],
    'Shizuoka BlueRevs': ['SBR', '#0048b0', '#ffffff', '#004090', '#024297', 'liso'],
    'Urayasu D-Rocks': ['URD', '#101030', '#102050', '#100828', '#110f2f', 'liso'],
    'Mie Honda Heat': ['MHH', '#000000', '#b00010', '#000000', '#000000', 'liso'],
    'Mitsubishi Sagamihara Dynaboars': ['MSD', '#004008', '#005820', '#000800', '#004f10', 'liso'],
    'BlackRams Tokyo': ['BRT', '#000000', '#ffffff', '#000000', '#000000', 'liso'],
    // ── Japan League One D2 ──
    'Green Rockets Tokatsu': ['GRT', '#508848', '#407030', '#508848', '#598d4d', 'liso'],
    'Kyuden Voltex': ['KYV', '#902840', '#ffffff', '#882038', '#8c243c', 'liso'],
    'Shimizu Koto Blue Sharks': ['SKB', '#002868', '#084090', '#083068', '#0c306b', 'liso'],
    'Toyota Industries Shuttles Aichi': ['TIS', '#00a0e0', '#0070c0', '#08a8e0', '#006aba', 'liso'],
    'Kamaishi Seawaves': ['KAS', '#d00008', '#780810', '#780810', '#7f0a13', 'liso'],
    'Hanazono Kintetsu Liners': ['HKL', '#a01848', '#003078', '#a80848', '#a02939', 'aros'],
    'Hino Red Dolphins': ['HRD', '#b80028', '#ffffff', '#c00030', '#c30130', 'liso'],
    'RedHurricanes Osaka': ['RHO', '#f82830', '#000000', '#f82830', '#ff2f36', 'banda'],
    // ── Major League Rugby ──
    'Chicago Hounds': ['CHH', '#00653c', '#ffffff', '#ffffff', '#00653c', 'aros'],
    'New England Free Jacks': ['NEF', '#ffffff', '#c8102e', '#ffffff', '#0a2240', 'aros'],
    'Old Glory DC': ['OGD', '#092051', '#c8102e', '#092051', '#092051', 'liso'],
    'Seattle Seawolves': ['SEA', '#000000', '#00a3e0', '#000000', '#000000', 'liso'],
    'Anthem RC': ['ANT', '#3399ff', '#000000', '#000000', '#ffcc00', 'liso'],
    'California Legion': ['CAL', '#e4002b', '#ffffff', '#e4002b', '#e4002b', 'liso'],
    // ── Invitado a la Challenge Cup ──
    'Black Lion': ['BLI', '#1c191c', '#c8102e', '#1c191c', '#1c191c', 'liso'],
};

/** País de cada franquicia de las ligas que cruzan fronteras. */
const COUNTRY_OF: Record<string, string> = {
    Leinster: 'ie', Munster: 'ie', Ulster: 'ie', Connacht: 'ie',
    'Glasgow Warriors': 'gb-sct', 'Edinburgh Rugby': 'gb-sct',
    Ospreys: 'gb-wls', Scarlets: 'gb-wls', 'Cardiff Rugby': 'gb-wls', Dragons: 'gb-wls',
    'Benetton Treviso': 'it', 'Zebre Parma': 'it',
    Bulls: 'za', Stormers: 'za', Sharks: 'za', Lions: 'za',
    Hurricanes: 'nz', Chiefs: 'nz', Crusaders: 'nz', Blues: 'nz', Highlanders: 'nz',
    Reds: 'au', Brumbies: 'au', 'Western Force': 'au', Waratahs: 'au',
    'Fijian Drua': 'fj', 'Moana Pasifika': 'ws',
    'Dogos XV': 'ar', Pampas: 'ar', Tarucas: 'ar', 'Capibaras XV': 'ar',
    'Peñarol Rugby': 'uy', Selknam: 'cl', 'Cobras Brasil Rugby': 'br', 'Yacaré XV': 'py',
    'Black Lion': 'ge',
};

/** País → región de planteles (nations.ts) y lista de nombres ficticios (names.ts). */
const BY_COUNTRY: Record<string, { region: Region; pool: string }> = {
    fr: { region: 'europa-sur', pool: 'franco' },
    'gb-eng': { region: 'europa-norte', pool: 'anglo' },
    ie: { region: 'europa-norte', pool: 'celta' },
    'gb-sct': { region: 'europa-norte', pool: 'celta' },
    'gb-wls': { region: 'europa-norte', pool: 'celta' },
    it: { region: 'europa-sur', pool: 'italo' },
    za: { region: 'africa-sur', pool: 'sudafrica' },
    nz: { region: 'oceania', pool: 'anglo' },
    au: { region: 'oceania', pool: 'anglo' },
    fj: { region: 'pacifico', pool: 'pacifico' },
    ws: { region: 'pacifico', pool: 'pacifico' },
    ar: { region: 'sudamerica', pool: 'rio' },
    uy: { region: 'sudamerica', pool: 'rio' },
    py: { region: 'sudamerica', pool: 'rio' },
    cl: { region: 'sudamerica', pool: 'latam' },
    br: { region: 'sudamerica', pool: 'luso' },
    us: { region: 'norteamerica', pool: 'anglo' },
    jp: { region: 'asia', pool: 'japon' },
    ge: { region: 'europa-este', pool: 'georgia' },
};

/** Las ligas del modo clubes, en el orden en que se recorren con las flechas. */
const LEAGUES: { id: string; name: string }[] = [
    { id: 'top14', name: 'Top 14' },
    { id: 'prod2', name: 'Pro D2' },
    { id: 'prem', name: 'Premiership' },
    { id: 'urc', name: 'URC' },
    { id: 'super-rugby', name: 'Super Rugby Pacific' },
    { id: 'currie-premier', name: 'Currie Cup' },
    { id: 'sra', name: 'Super Rugby Americas' },
    { id: 'us-mlr', name: 'Major League Rugby' },
    { id: 'jpn-d1', name: 'Japan League One D1' },
    { id: 'jpn-d2', name: 'Japan League One D2' },
];

const slug = (s: string) =>
    s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

const clubId = (name: string) => `club-${slug(name)}`;

function makeClub(name: string, country: string, league: string): SevenTeam {
    const look: Look = LOOKS[name] ?? [name.slice(0, 3).toUpperCase(), ROYAL, W, ROYAL, ROYAL, 'liso'];
    const where = BY_COUNTRY[country] ?? { region: 'europa-norte' as Region, pool: 'anglo' };
    const [short, shirt, shirt2, shorts, socks, pattern] = look;
    const id = clubId(name);
    return {
        id,
        name,
        short,
        kit: { shirt, shirt2, shorts, socks, pattern },
        players: squadFor(id, where.region),
        rating: CLUB_STRENGTH[name]?.rating ?? 66,
        // Banderita con los colores del club (no el escudo): la dibuja FlagIcon a partir de este código.
        flag: `kit:${shirt}:${shirt2}:${pattern}`,
        namePool: where.pool,
        league,
    };
}

/** Clubes por liga (de la temporada del catálogo), del más fuerte al más flojo. */
export const CLUB_LEAGUES: { id: string; name: string; teams: SevenTeam[] }[] = LEAGUES.map((lg) => {
    const group = ROSTERS_2026_27.find((g) => g.competitionId === lg.id);
    const teams = (group?.clubs ?? []).map((n) => makeClub(n, COUNTRY_OF[n] ?? group?.countryCode ?? 'multi', lg.name));
    return { id: lg.id, name: lg.name, teams: teams.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)) };
});

const BLACK_LION = makeClub('Black Lion', 'ge', 'Rugby Europe Super Cup');

export const CLUBS: SevenTeam[] = [...CLUB_LEAGUES.flatMap((l) => l.teams), BLACK_LION];
const CLUB_BY_ID: Record<string, SevenTeam> = Object.fromEntries(CLUBS.map((c) => [c.id, c]));

/** Un participante de torneo: código de selección (ARG) o id de club (club-…). */
export function teamOfCode(code: string): SevenTeam | undefined {
    return NATION_BY_CODE[code] ?? CLUB_BY_ID[code] ?? arClubById(code);
}

const leagueIds = (id: string) => CLUB_LEAGUES.find((l) => l.id === id)?.teams.map((t) => t.id) ?? [];
const best = (id: string, n: number) => leagueIds(id).slice(0, n); // ya vienen ordenados por fuerza
const rest = (id: string, n: number) => leagueIds(id).slice(n);

/** Liga con fase regular (todos contra todos) y cuadro con los `top` primeros. */
function league(id: string, leagueId: string, name: string, sub: string, top: 4 | 8, legs: 1 | 2 = 1): TourDef {
    return {
        id, name, sub, source: 'real', clubs: true, teams: leagueIds(leagueId),
        formatLabel: `Fase regular ${legs === 2 ? 'a dos vueltas' : 'a una vuelta'} · ${top === 8 ? 'cuartos' : 'semifinales'} y final con los ${top} primeros`,
        stage: { kind: 'grupos', groups: 1, advance: top, legs },
    };
}

/**
 * Torneos de clubes, con el id de la web. Formato del juego: la fase regular a
 * una vuelta (dos en la MLR, que tiene seis) y el cuadro final con los
 * primeros. Champions y Challenge se arman con las ligas: los 8 más fuertes de
 * Top 14, Premiership y URC van a la Champions; el resto, más dos invitados
 * (Cheetahs y Black Lion), a la Challenge.
 */
const CAT_OF: Record<string, string> = {
    'Champions Cup': 'Europa', 'Challenge Cup': 'Europa', 'United Rugby Championship': 'Europa',
    'Top 14': 'Francia', 'Pro D2': 'Francia', Premiership: 'Inglaterra',
    'Super Rugby Pacific': 'Hemisferio sur', 'Currie Cup': 'Hemisferio sur',
    'Super Rugby Americas': 'América', 'Major League Rugby': 'América',
    'Japan League One D1': 'Japón', 'Japan League One D2': 'Japón',
};

const CLUB_TOURS_RAW: TourDef[] = [
    {
        id: 'ff17e563-d6b9-4148-b95c-0d5644aea14e', name: 'Champions Cup', sub: 'Los 24 mejores de Francia, Inglaterra y el URC.', source: 'real',
        formatLabel: '4 grupos de 6 · pasan los cuatro primeros · octavos', clubs: true,
        teams: [...best('top14', 8), ...best('prem', 8), ...best('urc', 8)],
        stage: { kind: 'grupos', groups: 4, advance: 4 },
    },
    {
        id: '35f4d6cc-114d-4ac5-a9a0-0d6a64f18de8', name: 'Challenge Cup', sub: 'El segundo torneo europeo, con dos invitados.', source: 'real',
        formatLabel: '3 grupos de 6 · pasan dos y los 2 mejores terceros · cuartos', clubs: true,
        teams: [...rest('top14', 8), ...rest('prem', 8), ...rest('urc', 8), clubId('Free State Cheetahs'), BLACK_LION.id],
        stage: { kind: 'grupos', groups: 3, advance: 2, bestThirds: 2 },
    },
    league('294bbd25-e9fb-4dca-ad0b-5c0d722f6493', 'top14', 'Top 14', 'Los catorce de la primera francesa.', 4),
    league('d68ac834-412a-4a6a-ab6c-789c8c21f561', 'prod2', 'Pro D2', 'La segunda división francesa.', 4),
    league('696d6d43-2df3-4d2e-9961-8896d32cb196', 'prem', 'Premiership', 'Los diez de Inglaterra.', 4),
    league('0e56f31c-3d9d-474b-9a90-4bbef1f44333', 'urc', 'United Rugby Championship', 'Irlanda, Escocia, Gales, Italia y Sudáfrica.', 8),
    league('b3d8eab1-71aa-468f-b69d-c220e34ebd79', 'super-rugby', 'Super Rugby Pacific', 'Nueva Zelanda, Australia y el Pacífico.', 4),
    league('1b686da2-e5c8-4ceb-b72b-5450b434646e', 'currie-premier', 'Currie Cup', 'Las uniones de Sudáfrica.', 4),
    league('f76e47e2-5f9c-4f39-8f06-f6137f5a2846', 'sra', 'Super Rugby Americas', 'Las franquicias de Sudamérica.', 4),
    league('219d6f1e-a6d9-4197-9f9a-9913bf548696', 'us-mlr', 'Major League Rugby', 'El profesionalismo de Estados Unidos.', 4, 2),
    league('f5312256-5c9d-434b-8006-11f8c7b5bd27', 'jpn-d1', 'Japan League One D1', 'La primera de Japón.', 4),
    league('jpn-league-one-d2', 'jpn-d2', 'Japan League One D2', 'La segunda de Japón.', 4),
];

export const CLUB_TOURS: TourDef[] = CLUB_TOURS_RAW.map((d) => ({ ...d, cat: CAT_OF[d.name] }));
