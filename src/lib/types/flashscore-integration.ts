// FlashScore external integration types

export interface FlashScoreConfig {
    tournament_url: string;
    tournament_id?: string;
    tournament_stage_id?: string;
    tournament_template_id?: string;
    season_id?: number;
    last_sync?: string;   // ISO string
    linked_at?: string;   // ISO string
}

export type FlashScoreLinkStatus =
    | 'unlinked'      // no config at all
    | 'url_only'      // has tournament_url but no resolved IDs
    | 'ids_resolved'  // has all IDs but never synced
    | 'synced';       // has last_sync timestamp

export function getLinkStatus(config: FlashScoreConfig | null | undefined): FlashScoreLinkStatus {
    if (!config?.tournament_url) return 'unlinked';
    if (!config.tournament_id) return 'url_only';
    if (config.last_sync) return 'synced';
    return 'ids_resolved';
}

// Response from /resolve
export interface ResolveIdsResponse {
    config: FlashScoreConfig;
}

// One external match normalized from FlashScore API
export interface ExternalMatch {
    flashscore_match_id: string;
    home_team_name: string;
    away_team_name: string;
    timestamp: number;       // Unix seconds
    date_time: string;       // ISO UTC
    venue?: string;
    status: 'scheduled' | 'final' | 'live' | 'postponed' | 'cancelled';
    score?: { home: number | null; away: number | null };
}

export type MatchConfidence = 'exact' | 'partial' | 'none';

// External match enriched with club-matching result
export interface ExternalMatchWithMapping extends ExternalMatch {
    home_club_id: string | null;
    away_club_id: string | null;
    home_match_confidence: MatchConfidence;
    away_match_confidence: MatchConfidence;
}

// Request body for POST /sync
export interface SyncRequest {
    phase_id: string;
    round_id?: string | null;
    matches: Array<{
        flashscore_match_id: string;
        home_club_id: string;
        away_club_id: string;
        date_time: string;
        venue?: string | null;
        status?: string;
    }>;
}

// Response from POST /sync
export interface SyncResponse {
    success: boolean;
    imported: number;
    errors: string[];
}

// Normalized standings row
export interface ExternalStandingsRow {
    position: number;
    team_name: string;
    team_id?: string | null;
    team_logo?: string | null;
    team_url?: string | null;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points: number;
    scored?: number;
    conceded?: number;
}
