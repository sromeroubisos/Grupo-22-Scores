import type { AttributeKey, Position, PositionGroup } from '../types/player.ts';
import type { SeasonStats } from '../types/season.ts';
import { POSITIONS, getPosition } from './positions.ts';
import { getOrigin } from './origins.ts';
import { LEAGUES } from './clubs.ts';
import { attributePeakAge } from '../engine/aging.ts';

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
    power: 'Potencia',
    speed: 'Velocidad',
    technique: 'Técnica',
    tackle: 'Tackle',
    kick: 'Patada',
    vision: 'Visión',
    mental: 'Mental',
    stamina: 'Resistencia',
};

export const STAT_LABELS: Record<keyof SeasonStats, string> = {
    tries: 'Tries',
    tackles: 'Tackles',
    metres: 'Metros',
    assists: 'Asistencias',
    lineBreaks: 'Quiebres',
    turnovers: 'Robos',
    kicksAtGoal: 'Palos (int.)',
    kicksMade: 'Palos',
    lineoutsWon: 'Lines',
    metresKicked: 'Metros pateados',
};

const PHYSICAL_KEYS: AttributeKey[] = ['power', 'speed', 'technique', 'tackle', 'kick', 'stamina'];

// Copy autoral (presentación, no reglas): estilo de carrera por posición.
const CAREER_STYLE: Record<Position, string> = {
    prop: 'Ancla del scrum. Carrera larga, de choque y desgaste, que crece con los años.',
    hooker: 'Motor del pack: lanza los lines y mete en el ruck. Equilibrio entre fuerza y técnica.',
    lock: 'Torre del line y del scrum. Físico puro que rinde hasta veterano.',
    backrow: 'El que aparece en todas: tackle, robo y continuidad. Híbrido físico y móvil.',
    scrumhalf: 'El cerebro veloz cerca del ruck. Distribuye y define; se retira más joven.',
    flyhalf: 'El conductor. Patada, visión y manejo del partido. La carrera vive de los palos.',
    centre: 'Choque y quiebre en el mediocampo. Potente y rápido a la vez.',
    wing: 'El finalizador. Velocidad y tries; pico temprano y carrera más corta.',
    fullback: 'El último hombre: contraataque, patada y aire. Elegante y polivalente.',
};

// Stats destacadas por posición: fuente ÚNICA para lo que se muestra en la
// partida (cabecera/temporada). Derivadas del rol real del puesto.
const PRIMARY_STATS: Record<Position, (keyof SeasonStats)[]> = {
    prop: ['tackles', 'metres', 'turnovers'],
    hooker: ['tackles', 'lineoutsWon', 'metres'],
    lock: ['tackles', 'lineoutsWon', 'metres'],
    backrow: ['tackles', 'turnovers', 'metres'],
    scrumhalf: ['assists', 'metres', 'lineBreaks'],
    flyhalf: ['kicksMade', 'assists', 'metresKicked'],
    centre: ['tries', 'metres', 'lineBreaks'],
    wing: ['tries', 'lineBreaks', 'metres'],
    fullback: ['tries', 'metresKicked', 'lineBreaks'],
};

export interface DominantAttribute {
    key: AttributeKey;
    label: string;
    weight: number;
}

export interface PositionGuide {
    id: Position;
    labelEs: string;
    group: PositionGroup;
    groupLabel: string;
    numbers: number[];
    dominant: DominantAttribute[];
    style: string;
    peakAge: number;
    retirement: { soft: number; hard: number };
    stats: { key: keyof SeasonStats; label: string }[];
    goalKicker: boolean;
}

export function describePosition(id: Position): PositionGuide {
    const pos = getPosition(id);

    const dominant: DominantAttribute[] = (Object.keys(pos.weights) as AttributeKey[])
        .map((key) => ({ key, label: ATTRIBUTE_LABELS[key], weight: pos.weights[key] }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3);

    // Pico representativo = pico del atributo físico de mayor peso del puesto.
    const topPhysical = PHYSICAL_KEYS.reduce((best, key) => (pos.weights[key] > pos.weights[best] ? key : best), PHYSICAL_KEYS[0]);

    return {
        id,
        labelEs: pos.labelEs,
        group: pos.group,
        groupLabel: pos.group === 'forward' ? 'Forward' : 'Back',
        numbers: pos.numbers,
        dominant,
        style: CAREER_STYLE[id],
        peakAge: attributePeakAge(topPhysical, pos.group),
        retirement: pos.retirement,
        stats: PRIMARY_STATS[id].map((key) => ({ key, label: STAT_LABELS[key] })),
        goalKicker: pos.stats.goalKicker,
    };
}

export function describeAllPositions(): PositionGuide[] {
    return (Object.keys(POSITIONS) as Position[]).map(describePosition);
}

export interface OriginPerk {
    label: string;
    tone: 'good' | 'bad';
}

export interface OriginGuide {
    id: string;
    labelEs: string;
    description: string;
    startAge: number;
    startTier: number;
    leagueLabel: string;
    perks: OriginPerk[];
}

function tierLeagueLabel(tier: number): string {
    const league = Object.values(LEAGUES).find((l) => l.tier === tier);
    return league?.labelEs ?? `Nivel ${tier}`;
}

export function describeOrigin(id: string): OriginGuide {
    const origin = getOrigin(id);
    const perks: OriginPerk[] = [];

    for (const key of Object.keys(origin.attributeMods) as AttributeKey[]) {
        const mod = origin.attributeMods[key] ?? 0;
        if (mod > 0) perks.push({ label: `+${mod} ${ATTRIBUTE_LABELS[key]}`, tone: 'good' });
        else if (mod < 0) perks.push({ label: `${mod} ${ATTRIBUTE_LABELS[key]}`, tone: 'bad' });
    }

    if (origin.startTier <= 2) perks.push({ label: 'Primer club de nivel', tone: 'good' });
    if (origin.startTier >= 4) perks.push({ label: 'Arrancás desde el ascenso', tone: 'bad' });
    if (origin.fameStart >= 30) perks.push({ label: 'Llegás con vidriera', tone: 'good' });
    if (origin.fameStart <= 10) perks.push({ label: 'Nadie te conoce todavía', tone: 'bad' });
    if (origin.moraleStart >= 68) perks.push({ label: 'Mucha confianza inicial', tone: 'good' });
    if (origin.startAge >= 21) perks.push({ label: `Debut tardío (${origin.startAge})`, tone: 'bad' });
    else perks.push({ label: `Debut a los ${origin.startAge}`, tone: 'good' });

    return {
        id: origin.id,
        labelEs: origin.labelEs,
        description: origin.description,
        startAge: origin.startAge,
        startTier: origin.startTier,
        leagueLabel: tierLeagueLabel(origin.startTier),
        perks,
    };
}

export function describeAllOrigins(ids: string[]): OriginGuide[] {
    return ids.map(describeOrigin);
}
