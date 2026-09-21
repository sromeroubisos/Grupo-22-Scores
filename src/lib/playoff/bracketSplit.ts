/**
 * Una fase de playoff puede tener VARIOS cuadros adentro: la fase final del
 * Uruguayo juega Oro, Plata y Bronce en paralelo, y el constructor de playoff
 * cuelga cada copa de un `tournament_groups`. Si todas las rondas de la fase se
 * dibujan en una sola llave, salen ocho columnas mezcladas y el "campeón" es el
 * ganador de la última columna (el de Bronce, o el de Plata).
 *
 * A qué cuadro pertenece una ronda:
 *   1. `tournament_rounds.group_id` → el nombre del grupo (constructor).
 *   2. Si no hay grupo, el prefijo del nombre de la ronda, pero SOLO cuando lo
 *      que queda después del separador es una instancia reconocible:
 *      "Oro · Semifinales", "Bronce - Final". Así "Final - Ida" o un nombre
 *      libre no se parten por accidente.
 *   3. Sin ninguna de las dos, el cuadro principal de la fase.
 *
 * Todo es puro: la página lo usa para armar el draw y los tests lo prueban
 * sin base.
 */

export type BracketRoundTag = {
    /** Clave estable del cuadro dentro de la fase ('' = cuadro principal). */
    bracketKey: string;
    /** Nombre del cuadro para el título ("Oro", "Copa de Plata"). */
    bracketLabel: string | null;
    /** Nombre de la ronda sin el prefijo del cuadro ("Semifinales"). */
    stageName: string;
};

// La instancia que queda a la derecha del separador. Si no matchea, el nombre
// entero es el de la ronda y no se infiere ningún cuadro.
const STAGE_RE = /^(gran\s+)?final(es)?\b|^semi|^cuartos|^octavos|^dieciseisavos|^(primera|segunda|tercera)\s+ronda|^ronda\b|^repechaje|^play-?in|^reclasificaci|^\d+\S*\s+(y\s+\d+\S*\s+)?puesto|^(tercer|quinto|s[eé]ptimo)\s+puesto|^por\s+el\b|^quarter|^round\s+of|^third|^3rd/i;

const SEPARATOR_RE = /\s+[·\-–—|:]\s+/;

function normalizeKey(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Parte "Oro · Semifinales" en cuadro "Oro" + ronda "Semifinales". Devuelve
 * null si el nombre no tiene la forma `<cuadro> <sep> <instancia>`.
 */
export function splitRoundNamePrefix(name: string): { prefix: string; stage: string } | null {
    const raw = String(name || '').trim();
    const match = SEPARATOR_RE.exec(raw);
    if (!match) return null;
    const prefix = raw.slice(0, match.index).trim();
    const stage = raw.slice(match.index + match[0].length).trim();
    if (!prefix || !stage) return null;
    // El prefijo tiene que ser el cuadro, no otra instancia ("Final - Ida").
    if (STAGE_RE.test(prefix)) return null;
    if (!STAGE_RE.test(stage)) return null;
    return { prefix, stage };
}

/** Quita el nombre del cuadro del nombre de la ronda, adelante o atrás. */
function stripGroupName(roundName: string, groupName: string): string {
    const raw = String(roundName || '').trim();
    const group = groupName.trim();
    if (!group) return raw;
    const escaped = group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sep = '\\s*[·\\-–—|:]\\s*';
    const stripped = raw
        .replace(new RegExp(`^${escaped}${sep}`, 'i'), '')
        .replace(new RegExp(`${sep}${escaped}$`, 'i'), '')
        .trim();
    return stripped || raw;
}

export function tagBracketRound(roundName: string, groupName?: string | null): BracketRoundTag {
    const name = String(roundName || '').trim();
    const group = String(groupName || '').trim();
    if (group) {
        return { bracketKey: normalizeKey(group), bracketLabel: group, stageName: stripGroupName(name, group) };
    }
    const split = splitRoundNamePrefix(name);
    if (split) {
        return { bracketKey: normalizeKey(split.prefix), bracketLabel: split.prefix, stageName: split.stage };
    }
    return { bracketKey: '', bracketLabel: null, stageName: name };
}

// Orden de las copas cuando la fase tiene varias: la del título primero. Lo que
// no está en la lista va después, en el orden en que se juega.
const BRACKET_RANK: Array<[RegExp, number]> = [
    [/^$/, 0],
    [/\b(oro|gold|principal|campeonato|championship)\b/, 1],
    [/\b(plata|silver)\b/, 2],
    [/\b(bronce|bronze)\b/, 3],
    [/\b(estimulo|cobre|copper)\b/, 4],
];

function bracketRank(key: string): number {
    for (const [re, rank] of BRACKET_RANK) {
        if (re.test(key)) return rank;
    }
    return 10;
}

export type SplittableRound = {
    round_id: string | number;
    name: string;
    matches: Array<{ home_team?: unknown; away_team?: unknown; home_participant?: unknown; away_participant?: unknown }>;
    bracket_key?: string;
    bracket_label?: string | null;
};

export type SplitBracket<R extends SplittableRound> = {
    key: string;
    label: string | null;
    rounds: R[];
};

function hasRealMatch(round: SplittableRound): boolean {
    return (round.matches || []).some((match) =>
        Boolean(match?.home_team || match?.away_team || match?.home_participant || match?.away_participant),
    );
}

/**
 * Agrupa las rondas de un draw por cuadro, respetando el orden de las rondas
 * dentro de cada uno. Un draw sin `bracket_key` (proveedores externos, fases de
 * un solo cuadro) vuelve como un único cuadro, idéntico al de antes.
 *
 * Un cuadro que no tiene NI UN equipo cargado se descarta si otro cuadro de la
 * misma fase sí tiene: es el esqueleto que dejó el constructor al lado de las
 * copas que se cargaron a mano, y dibujarlo solo muestra TBD.
 */
export function splitPlayoffDraw<R extends SplittableRound>(draw: R[]): Array<SplitBracket<R>> {
    if (!Array.isArray(draw) || draw.length === 0) return [];

    const byKey = new Map<string, SplitBracket<R> & { firstIndex: number }>();
    draw.forEach((round, index) => {
        const key = String(round?.bracket_key ?? '');
        const entry = byKey.get(key);
        if (entry) {
            entry.rounds.push(round);
            if (!entry.label && round.bracket_label) entry.label = round.bracket_label;
        } else {
            byKey.set(key, { key, label: round?.bracket_label ?? null, rounds: [round], firstIndex: index });
        }
    });

    let brackets = [...byKey.values()];
    if (brackets.length > 1) {
        const withTeams = brackets.filter((bracket) => bracket.rounds.some(hasRealMatch));
        if (withTeams.length > 0) brackets = withTeams;
    }

    return brackets
        .sort((left, right) => {
            const rankDiff = bracketRank(left.key) - bracketRank(right.key);
            if (rankDiff !== 0) return rankDiff;
            return left.firstIndex - right.firstIndex;
        })
        .map(({ key, label, rounds }) => ({ key, label, rounds }));
}
