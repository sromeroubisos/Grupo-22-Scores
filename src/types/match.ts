/**
 * Match Model - Modelo de datos para partidos
 * 
 * Arquitectura:
 * - Fase genera estructura -------- crea matches con createdFrom="generator"
 * - Torneo > Fixture administra matches -------- edita lo operativo
 * - Resultados es una vista -------- filtra matches con status="final"
 */

export type MatchStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled';
export type MatchCreatedFrom = 'generator' | 'manual';

export interface MatchScore {
    home: number | null;
    away: number | null;
    homeTries?: number | null;
    awayTries?: number | null;
    homeBonus?: number;
    awayBonus?: number;
    notes?: string;
}

export interface MatchResult {
    isComplete: boolean;          // true cuando status=final y score set
    updatedAt: Date | null;
    updatedBy: string | null;
    version: number;              // para auditor----a/rollback
}

export interface MatchReferee {
    id?: string;
    name?: string;
}

export interface Match {
    id: string;
    tournamentId: string;
    phaseId: string;
    stageId?: string;             // opcional si ten----s sub-etapas
    groupId?: string;             // para grupos
    round: number;                // jornada / fecha / etapa
    orderInRound?: number;

    homeTeamId: string;
    homeTeamName: string;         // denormalized for display
    awayTeamId: string;
    awayTeamName: string;         // denormalized for display

    homeTeamLogo?: string;        // Optional for external matches
    awayTeamLogo?: string;        // Optional for external matches

    scheduledAt: Date | null;
    venueId?: string;
    venueName?: string;           // denormalized for display
    field?: string;
    referee?: MatchReferee;

    status: MatchStatus;
    score: MatchScore;
    result: MatchResult;

    createdFrom: MatchCreatedFrom;
    lockedByPhase?: boolean;      // si quer----s bloquear equipos/estructura
    currentMinute?: string;       // For live matches (e.g. "45'", "HT")

    createdAt: Date;
    updatedAt: Date;
}

// Helper type for creating new matches
export type NewMatch = Omit<Match, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string;
};

// Match filters for queries
export interface MatchFilters {
    phaseId?: string;
    groupId?: string;
    round?: number;
    status?: MatchStatus | MatchStatus[];
    teamId?: string;
    dateFrom?: Date;
    dateTo?: Date;
}

// Match update payload (for editing operational data)
export interface MatchUpdate {
    scheduledAt?: Date | null;
    venueId?: string;
    venueName?: string;
    field?: string;
    referee?: MatchReferee;
    status?: MatchStatus;
    homeTeamId?: string;
    homeTeamName?: string;
    awayTeamId?: string;
    awayTeamName?: string;
}

// Score update payload
export interface ScoreUpdate {
    home: number;
    away: number;
    homeTries?: number;
    awayTries?: number;
    homeBonus?: number;
    awayBonus?: number;
    notes?: string;
}
