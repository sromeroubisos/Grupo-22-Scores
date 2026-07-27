// Identidad REAL de la competición que disputa un club. Puro y determinístico.
//
// El problema que resuelve: `sa-ar` / `sa-uy` / `sa-cl` son SISTEMAS PARAGUAS
// (una liga simbólica que agrupa ~180 clubes de decenas de uniones y cuatro
// categorías). No son campeonatos. El torneo real que disputa un club argentino
// es su DIVISIÓN (ej. "Top 14 de la URBA"), no "Liga Argentina".
//
// Sin esto, un jugador de Primera "C" salía "campeón de Liga Argentina", y un
// club sin división cargada quedaba solo en un campo #t{tier} y se coronaba
// campeón todas las temporadas. Acá se separa:
//   · competición IDENTIFICADA  → puede acreditar título (liga o división real);
//   · competición NO IDENTIFICADA → el club no tiene torneo resoluble: se
//     registra en auditoría y NO acredita título (Reg. §7 del pedido).

import type { ClubDef } from '../data/clubs.ts';
import { competitionLabelOf, levelProfileOf } from '../data/competition-levels2026.ts';

/** Contrato de identidad de competición + ledger de participación (Fase 1.5). */
export const CAREER_COMPETITION_VERSION = '2026-27.1';

export interface CompetitionIdentity {
    /** Id estable de la competición real (para títulos y participaciones). */
    id: string;
    /** Nombre para mostrar: la división real, no el paraguas. */
    name: string;
    /**
     * `false` solo cuando un club de un sistema paraguas (AR/UY/CL) no tiene una
     * división resoluble. En ese caso no hay torneo real: no se acredita título.
     */
    identified: boolean;
    /** Sistema doméstico paraguas del que cuelga (sa-ar/uy/cl) o null. */
    umbrellaId: string | null;
}

/** ¿La competición del club es un sistema paraguas AR/UY/CL? */
export function isUmbrellaSystem(competitionId: string): boolean {
    return !!levelProfileOf(competitionId)?.bandByDivisionTier;
}

/**
 * Identidad de la LIGA PRIMARIA del club (una por temporada). Para el catálogo
 * internacional es su propia competición; para AR/UY/CL es la división real.
 */
export function clubLeagueIdentity(club: ClubDef): CompetitionIdentity {
    const competitionId = club.competitionId;
    if (isUmbrellaSystem(competitionId)) {
        if (club.divisionName) {
            return {
                id: `${competitionId}#${club.divisionName}`,
                name: club.divisionName,
                identified: true,
                umbrellaId: competitionId,
            };
        }
        // Sin división cargada: no hay torneo real que ganar.
        return {
            id: competitionId,
            name: competitionLabelOf(competitionId),
            identified: false,
            umbrellaId: competitionId,
        };
    }
    return {
        id: competitionId,
        name: competitionLabelOf(competitionId),
        identified: true,
        umbrellaId: null,
    };
}
