/**
 * Ligas del mundo del juego. `strength` es el OVR promedio aproximado de la liga
 * y se usa para dar contexto al rating de la temporada y al mercado de pases.
 * Nombres ficticios a propósito (sin marcas reales).
 */

export type CompetitionTier = 'formativo' | 'ascenso' | 'primera' | 'elite';

export interface Competition {
    id: string;
    name: string;
    country: string;
    strength: number;      // OVR promedio aprox. de la liga
    tier: CompetitionTier;
}

export const COMPETITIONS: Competition[] = [
    { id: 'formativo', name: 'Liga Formativa', country: 'Argentina', strength: 44, tier: 'formativo' },
    { id: 'ascenso-nacional', name: 'Ascenso Nacional', country: 'Argentina', strength: 53, tier: 'ascenso' },
    { id: 'urba-primera', name: 'Primera del Sur', country: 'Argentina', strength: 64, tier: 'primera' },
    { id: 'top-sur', name: 'Súper Liga del Sur', country: 'Argentina', strength: 73, tier: 'elite' },
    { id: 'euro-championship', name: 'Championship Europea', country: 'Europa', strength: 76, tier: 'primera' },
    { id: 'euro-premier', name: 'Premier Europea', country: 'Europa', strength: 86, tier: 'elite' },
    { id: 'oceania-pro', name: 'Pro Oceanía', country: 'Oceanía', strength: 88, tier: 'elite' },
];

const BY_ID: Record<string, Competition> = Object.fromEntries(
    COMPETITIONS.map((c) => [c.id, c]),
);

export function getCompetition(id: string): Competition {
    return BY_ID[id] ?? COMPETITIONS[0];
}

export function competitionsByTier(tier: CompetitionTier): Competition[] {
    return COMPETITIONS.filter((c) => c.tier === tier);
}
