import { clubTier, clubLeague, LEAGUES } from './clubs.ts';

// Trofeos que se pueden ganar. La chance real la calcula simulate-season según
// el nivel del club, el rating de la temporada y algo de azar.
export interface CompetitionDef {
    id: string;
    labelEs: string;
    kind: 'liga' | 'copa' | 'continental' | 'seleccion';
    tiers: number[]; // niveles de club que pueden ganarla
    prestige: number; // 0..100
    baseChance: number; // chance base por temporada para un titular top de ese nivel
}

export const COMPETITIONS: CompetitionDef[] = [
    { id: 'titulo-liga-elite', labelEs: 'Título de Liga de Elite', kind: 'liga', tiers: [1], prestige: 95, baseChance: 0.16 },
    { id: 'copa-continental', labelEs: 'Copa Continental', kind: 'continental', tiers: [1, 2], prestige: 90, baseChance: 0.10 },
    { id: 'titulo-super-liga', labelEs: 'Título de Súper Liga', kind: 'liga', tiers: [2], prestige: 72, baseChance: 0.18 },
    { id: 'copa-nacional', labelEs: 'Copa Nacional', kind: 'copa', tiers: [1, 2, 3], prestige: 60, baseChance: 0.14 },
    { id: 'titulo-primera', labelEs: 'Título de Primera Nacional', kind: 'liga', tiers: [3], prestige: 46, baseChance: 0.20 },
    { id: 'ascenso', labelEs: 'Ascenso', kind: 'liga', tiers: [4], prestige: 34, baseChance: 0.24 },
];

export function possibleTitles(club: string): CompetitionDef[] {
    const tier = clubTier(club);
    const continentalOk = clubLeague(club).continental;
    return COMPETITIONS.filter((c) => c.tiers.includes(tier) && (c.kind !== 'continental' || continentalOk));
}

// Trofeos de selección / hitos internacionales (los dispara national-team + milestones).
export const NATIONAL_TROPHIES = {
    regional: { id: 'campeonato-regional', labelEs: 'Campeonato Regional', prestige: 78 },
    worldCupFinal: { id: 'final-mundial', labelEs: 'Final del Mundial', prestige: 99 },
    worldCupTitle: { id: 'campeon-del-mundo', labelEs: 'Campeón del Mundo', prestige: 100 },
} as const;

export function leagueLabel(id: string): string {
    return LEAGUES[id]?.labelEs ?? id;
}
