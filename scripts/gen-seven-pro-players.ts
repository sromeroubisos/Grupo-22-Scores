/**
 * Genera `src/app/juegos/minijuegos/rugby-seven/proPlayers.generated.ts`: los jugadores de las ligas
 * profesionales que tiene el juego, agrupados por la selección que pueden representar. Lo usa la
 * Carrera internacional para completar los elegibles de cada selección con jugadores reales.
 *
 * Correr: `npx tsx scripts/gen-seven-pro-players.ts`
 *
 * De dónde sale la nacionalidad: RugbyPass no la trae en el listado de planteles (solo en la ficha de
 * cada jugador, ~370 KB por jugador, inviable para miles). Pero el listado sí trae los equipos por los
 * que pasó cada uno, selecciones incluidas: el que jugó para Argentina, Argentina XV o Argentina U20 es
 * elegible para Argentina. Si pasó por dos selecciones, cuenta la primera que publica RugbyPass.
 *
 * Los nombres van recortados como en el resto del juego: inicial y apellido, y el apellido de 7 letras
 * o más pierde la última (Albornoz → T. Alborno, Cordero → S. Corder). Se reconoce de quién se habla
 * sin usar el nombre tal cual.
 *
 * Los torneos se piden en serie (lo hace `getRugbyPassPlayers`): el proveedor no publica rate limit.
 */
import { writeFileSync } from 'node:fs';
import { getRugbyPassPlayers } from '../src/lib/services/rugbyPass';

/** Ligas de clubes que tiene el juego, por su id de RugbyPass. */
const LEAGUES: { id: number; name: string }[] = [
    { id: 203, name: 'Top 14' },
    { id: 211, name: 'Pro D2' },
    { id: 201, name: 'Premiership' },
    { id: 204, name: 'URC' },
    { id: 205, name: 'Super Rugby' },
    { id: 421, name: 'Japan League One' },
    { id: 151, name: 'Major League Rugby' },
    { id: 207, name: 'Currie Cup' },
    { id: 208, name: 'NPC' },
];

/** Nombre de la selección en RugbyPass → código del juego (`nations.ts`). */
const NATION: Record<string, string> = {
    Argentina: 'ARG', 'New Zealand': 'NZL', Australia: 'AUS', 'South Africa': 'RSA', England: 'ENG', France: 'FRA',
    Ireland: 'IRL', Italy: 'ITA', Scotland: 'SCO', Wales: 'WAL', Fiji: 'FIJ', Japan: 'JPN', Samoa: 'SAM', Tonga: 'TGA',
    'Hong Kong': 'HKG', 'Hong Kong China': 'HKG', USA: 'USA', 'United States': 'USA', Canada: 'CAN', Uruguay: 'URU',
    Chile: 'CHI', Brazil: 'BRA', Paraguay: 'PAR', Colombia: 'COL', Peru: 'PER', Georgia: 'GEO', Spain: 'ESP',
    Portugal: 'POR', Romania: 'ROU', Germany: 'GER', Belgium: 'BEL', Netherlands: 'NED', Switzerland: 'SUI',
    Namibia: 'NAM', Zimbabwe: 'ZIM', Kenya: 'KEN', Uganda: 'UGA', Poland: 'POL', 'Czech Republic': 'CZE', Czechia: 'CZE',
    Sweden: 'SWE', Malta: 'MLT', Lithuania: 'LTU', Denmark: 'DEN', Korea: 'KOR', 'South Korea': 'KOR', Mexico: 'MEX',
    Kazakhstan: 'KAZ', Ukraine: 'UKR', Croatia: 'CRO', 'Ivory Coast': 'CIV', Senegal: 'SEN', Zambia: 'ZAM', Algeria: 'ALG',
};
/** Variantes de la selección: mayor, segunda, juveniles y seven (el número ordena: primero la mayor). */
const VARIANTS: [RegExp, number][] = [
    [/^$/, 0],
    [/^(XV|A|Emerging|Selection)$/i, 1],
    [/^(U-?20|Under 20|U-?21)$/i, 2],
    [/^(Sevens|7s)$/i, 3],
];

function nationOf(team: string): { code: string; tier: number } | null {
    if (/women/i.test(team)) return null;
    for (const [name, code] of Object.entries(NATION)) {
        if (team !== name && !team.startsWith(`${name} `)) continue;
        const rest = team.slice(name.length).trim();
        const v = VARIANTS.find(([re]) => re.test(rest));
        if (v) return { code, tier: v[1] };
    }
    return null;
}

/** El recorte de nombre del juego: inicial + apellido; el de 7 letras o más pierde la última. */
function shortName(full: string): string | null {
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return null;
    const [first, ...rest] = parts;
    let last = rest.join(' ');
    if (last.replace(/\s/g, '').length >= 7) last = last.slice(0, -1);
    return `${first[0].toUpperCase()}. ${last}`;
}

/** Equipos que no son un club (giras e invitaciones): no cuentan como el club actual. */
const NOT_CLUB = /^(Barbarians|British .*Lions|Pacific Islanders|World XV|.* Barbarians)$/i;

/** Tope por selección (el plantel de la carrera tiene 32). */
const MAX_PER_NATION = 40;

interface Row {
    short: string;
    club: string;
    pos: 'fw' | 'bk';
    tier: number;
}

async function main() {
    const players = await getRugbyPassPlayers(LEAGUES.map((l) => l.id));
    const out: Record<string, Row[]> = {};
    const seen = new Set<string>();
    for (const p of players) {
        if (!p.currentSquad) continue;
        const nat = p.teams.map((t) => nationOf(t.name)).find((x): x is { code: string; tier: number } => !!x);
        if (!nat) continue;
        const short = shortName(p.name);
        if (!short) continue;
        const key = `${nat.code}:${short}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const clubs = p.teams.map((t) => t.name).filter((n) => !nationOf(n) && !NOT_CLUB.test(n));
        const pos: 'fw' | 'bk' = p.jerseyNumber !== null && p.jerseyNumber <= 8 ? 'fw' : 'bk';
        (out[nat.code] ??= []).push({ short, club: clubs[clubs.length - 1] ?? '', pos, tier: nat.tier });
    }
    // Orden estable: primero los que jugaron en la mayor, después la segunda, los juveniles y el seven.
    // Hasta 40 por selección: el plantel tiene 32 lugares y el archivo viaja con el juego.
    for (const code of Object.keys(out)) out[code] = out[code].sort((a, b) => a.tier - b.tier || a.short.localeCompare(b.short)).slice(0, MAX_PER_NATION);

    const codes = Object.keys(out).sort();
    const lines = codes.map((c) => `    ${c}: [\n${out[c].map((r) => `        ${JSON.stringify(r)},`).join('\n')}\n    ],`);
    const total = codes.reduce((n, c) => n + out[c].length, 0);
    const body = `/* Generado por scripts/gen-seven-pro-players.ts — no editar a mano. ${new Date().toISOString().slice(0, 10)}. */
/**
 * Jugadores de las ligas profesionales (${LEAGUES.map((l) => l.name).join(', ')}) por la selección que
 * pueden representar, según su historial en RugbyPass. Nombres recortados (inicial + apellido; el de 7
 * letras o más pierde la última). \`tier\`: 0 jugó en la mayor, 1 en la segunda (XV, A), 2 en juveniles
 * (U20), 3 en el seven. ${total} jugadores de ${codes.length} selecciones.
 */
export interface ProPlayer {
    short: string;
    club: string;
    pos: 'fw' | 'bk';
    tier: number;
}

export const PRO_PLAYERS: Record<string, ProPlayer[]> = {
${lines.join('\n')}
};
`;
    writeFileSync('src/app/juegos/minijuegos/rugby-seven/proPlayers.generated.ts', body, 'utf8');
    console.log(`${total} jugadores de ${codes.length} selecciones:`, codes.map((c) => `${c} ${out[c].length}`).join(', '));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
