import type { PhaseWithRounds } from '@/lib/types/fixture';

/**
 * Las cifras vivas de una fase: lo único que cambia cuando cambiás de fase, y
 * lo que la barra de operación muestra en lugar del nombre del torneo (que el
 * header ya dice) y del texto de ayuda (que no cambia nunca).
 *
 * Todo se DERIVA del fixture que ya está en memoria. No se guarda ningún
 * contador: un contador guardado sería una segunda fuente de verdad y
 * alcanzaría con un partido editado por fuera para que la barra mienta.
 *
 * La ronda huérfana se reconoce por el prefijo `orphaned-` que le pone
 * `/api/tournaments/[id]/fixture` a los partidos sin `round_id`. Es un caso
 * real y frecuente —en Super Rugby Americas los 56 partidos de la fase regular
 * están ahí— y hasta ahora no se veía sin abrir el fixture.
 */
export const ORPHAN_ROUND_PREFIX = 'orphaned-';

export type PhaseFigure = {
    key: string;
    label: string;
    value: string;
    /** Pinta el número en ámbar. Sólo cuando hay algo que atender. */
    attention?: boolean;
};

export function isOrphanRound(roundId: string | null | undefined): boolean {
    return typeof roundId === 'string' && roundId.startsWith(ORPHAN_ROUND_PREFIX);
}

export type PhaseStats = {
    totalMatches: number;
    finalMatches: number;
    pendingMatches: number;
    orphanMatches: number;
    undatedMatches: number;
    emptyRounds: number;
    realRounds: number;
    teams: number;
    advanceCount: number | null;
};

function readAdvanceCount(settings: Record<string, unknown> | null | undefined): number | null {
    if (!settings) return null;
    const direct = Number(settings.advanceCount);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const qualification = settings.qualification;
    if (qualification && typeof qualification === 'object') {
        const promoted = Number((qualification as Record<string, unknown>).promoted);
        if (Number.isFinite(promoted) && promoted > 0) return promoted;
    }
    return null;
}

export function computePhaseStats(phase: PhaseWithRounds | null | undefined): PhaseStats {
    const rounds = phase?.rounds ?? [];
    const clubIds = new Set<string>();
    let totalMatches = 0;
    let finalMatches = 0;
    let orphanMatches = 0;
    let undatedMatches = 0;
    let emptyRounds = 0;
    let realRounds = 0;

    for (const round of rounds) {
        const matches = round.matches ?? [];
        const orphan = isOrphanRound(round.id);
        if (!orphan) {
            realRounds += 1;
            if (matches.length === 0) emptyRounds += 1;
        }

        for (const match of matches) {
            totalMatches += 1;
            if (match.status === 'final') finalMatches += 1;
            if (orphan) orphanMatches += 1;
            if (!match.dateTime) undatedMatches += 1;
            if (match.homeClubId) clubIds.add(match.homeClubId);
            if (match.awayClubId) clubIds.add(match.awayClubId);
        }
    }

    const settings = (phase?.settings ?? null) as Record<string, unknown> | null;
    const declaredTeams = Number(settings?.teamsCount);

    return {
        totalMatches,
        finalMatches,
        pendingMatches: totalMatches - finalMatches,
        orphanMatches,
        undatedMatches,
        emptyRounds,
        realRounds,
        teams: Number.isFinite(declaredTeams) && declaredTeams > 0 ? declaredTeams : clubIds.size,
        advanceCount: readAdvanceCount(settings),
    };
}

/**
 * Las cifras que se muestran, en orden de importancia operativa. Una cifra en
 * cero que no aporta nada no se muestra: la barra tiene que poder leerse en
 * diagonal, y cuatro números vale; ocho, no.
 */
export function buildPhaseFigures(phase: PhaseWithRounds | null | undefined): PhaseFigure[] {
    const stats = computePhaseStats(phase);
    const figures: PhaseFigure[] = [];
    const isPlayoff = phase?.phaseType === 'playoff' || phase?.phaseType === 'knockout';

    figures.push({
        key: 'matches',
        label: 'Partidos',
        value: `${stats.finalMatches}/${stats.totalMatches}`,
    });

    if (stats.pendingMatches > 0) {
        figures.push({
            key: 'pending',
            label: 'Sin cargar',
            value: String(stats.pendingMatches),
            attention: true,
        });
    }

    if (isPlayoff) {
        if (stats.realRounds > 0) {
            figures.push({ key: 'ties', label: 'Llaves', value: String(stats.realRounds) });
        }
        if (stats.emptyRounds > 0) {
            figures.push({
                key: 'empty',
                label: 'Sin cruce',
                value: String(stats.emptyRounds),
                attention: true,
            });
        }
    } else {
        if (stats.orphanMatches > 0) {
            figures.push({
                key: 'orphans',
                label: 'Sin jornada',
                value: String(stats.orphanMatches),
                attention: true,
            });
        }
        if (stats.teams > 0) {
            figures.push({ key: 'teams', label: 'Equipos', value: String(stats.teams) });
        }
        if (stats.advanceCount) {
            figures.push({ key: 'advance', label: 'Clasifican', value: String(stats.advanceCount) });
        }
    }

    if (stats.undatedMatches > 0) {
        figures.push({
            key: 'undated',
            label: 'Sin fecha',
            value: String(stats.undatedMatches),
            attention: true,
        });
    }

    return figures;
}
