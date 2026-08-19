/**
 * Clubes del mundo del juego, agrupados por liga. `prestige` (0-100) modula la
 * probabilidad de títulos y el atractivo de una oferta. Todos ficticios.
 */

import type { CompetitionTier } from './competitions.ts';
import { COMPETITIONS, getCompetition } from './competitions.ts';

export interface Club {
    id: string;
    name: string;
    competitionId: string;
    prestige: number;      // 0-100
}

export const CLUBS: Club[] = [
    // Formativo
    { id: 'sauces', name: 'Los Sauces RC', competitionId: 'formativo', prestige: 30 },
    { id: 'potros', name: 'Potros del Oeste', competitionId: 'formativo', prestige: 34 },
    { id: 'ribera', name: 'Ribera Rugby', competitionId: 'formativo', prestige: 28 },
    // Ascenso
    { id: 'tordos', name: 'Los Tordos del Norte', competitionId: 'ascenso-nacional', prestige: 45 },
    { id: 'lobos', name: 'Lobos de la Sierra', competitionId: 'ascenso-nacional', prestige: 48 },
    { id: 'delta', name: 'Delta RC', competitionId: 'ascenso-nacional', prestige: 42 },
    // Primera del Sur
    { id: 'cardenales', name: 'Cardenales RC', competitionId: 'urba-primera', prestige: 62 },
    { id: 'halcones', name: 'Halcones de la Bahía', competitionId: 'urba-primera', prestige: 66 },
    { id: 'monarcas', name: 'Monarcas del Plata', competitionId: 'urba-primera', prestige: 58 },
    { id: 'centauros', name: 'Centauros RC', competitionId: 'urba-primera', prestige: 60 },
    // Súper Liga del Sur
    { id: 'jaguares-sur', name: 'Jaguares del Sur', competitionId: 'top-sur', prestige: 82 },
    { id: 'condores', name: 'Cóndores Andinos', competitionId: 'top-sur', prestige: 78 },
    { id: 'pumas-costa', name: 'Pumas de la Costa', competitionId: 'top-sur', prestige: 80 },
    // Championship Europea
    { id: 'leones-rin', name: 'Leones del Rin', competitionId: 'euro-championship', prestige: 72 },
    { id: 'druidas', name: 'Druidas RC', competitionId: 'euro-championship', prestige: 70 },
    { id: 'vientos', name: 'Vientos del Norte', competitionId: 'euro-championship', prestige: 74 },
    // Premier Europea
    { id: 'imperiales', name: 'Imperiales RFC', competitionId: 'euro-premier', prestige: 92 },
    { id: 'catedral', name: 'Catedral Rugby', competitionId: 'euro-premier', prestige: 90 },
    { id: 'senadores', name: 'Senadores RC', competitionId: 'euro-premier', prestige: 88 },
    // Pro Oceanía
    { id: 'tiburones', name: 'Tiburones del Pacífico', competitionId: 'oceania-pro', prestige: 91 },
    { id: 'olas', name: 'Olas Rugby', competitionId: 'oceania-pro', prestige: 89 },
    { id: 'ancestros', name: 'Ancestros RC', competitionId: 'oceania-pro', prestige: 93 },
];

const BY_ID: Record<string, Club> = Object.fromEntries(CLUBS.map((c) => [c.id, c]));

export function getClub(id: string): Club | null {
    return BY_ID[id] ?? null;
}

export function clubsByCompetition(competitionId: string): Club[] {
    return CLUBS.filter((c) => c.competitionId === competitionId);
}

export function clubsByTier(tier: CompetitionTier): Club[] {
    const ids = new Set(COMPETITIONS.filter((c) => c.tier === tier).map((c) => c.id));
    return CLUBS.filter((c) => ids.has(c.competitionId));
}

export function tierOfClub(club: Club): CompetitionTier {
    return getCompetition(club.competitionId).tier;
}
