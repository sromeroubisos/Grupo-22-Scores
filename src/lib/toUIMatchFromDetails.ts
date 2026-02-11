// src/lib/toUIMatchFromDetails.ts
import type { MatchDetails } from "./flashscoreDetails";

export type DetailsUIMatch = {
    id: string;
    status: "scheduled" | "live" | "final" | "postponed" | "cancelled";
    kickoffISO: string | null;
    tournamentName: string | null;
    home: { id: string; name: string; shortName?: string | null; logo?: string | null; logoSmall?: string | null };
    away: { id: string; name: string; shortName?: string | null; logo?: string | null; logoSmall?: string | null };
    scoreHome: number | null;
    scoreAway: number | null;
};

function mapStatus(d: MatchDetails["match_status"]): DetailsUIMatch["status"] {
    if (d.is_cancelled) return "cancelled";
    if (d.is_postponed) return "postponed";
    if (d.is_in_progress) return "live";
    if (d.is_finished) return "final";
    return "scheduled";
}

export function toUIMatchFromDetails(d: MatchDetails): DetailsUIMatch {
    const kickoffISO = d.timestamp ? new Date(d.timestamp * 1000).toISOString() : null;

    // Logic from Guide: Default to 0 ONLY if match is actually live or finished.
    let scoreHome: number | null = null;
    let scoreAway: number | null = null;

    const status = mapStatus(d.match_status);

    if (status === 'live' || status === 'final') {
        // Handle scores as object (basketball, etc.)
        if (d.scores && typeof d.scores === 'object' && !Array.isArray(d.scores)) {
            const scoresObj = d.scores as { home?: number | null; away?: number | null };
            scoreHome = scoresObj.home ?? 0;
            scoreAway = scoresObj.away ?? 0;
        }
        // Handle scores as array (football, rugby, etc.)
        else if (d.scores && Array.isArray(d.scores) && d.scores.length > 0) {
            // Future: parse scores from array if needed
            scoreHome = 0;
            scoreAway = 0;
        }
        // If no scores provided but it's live/finished, default to 0
        else {
            scoreHome = 0;
            scoreAway = 0;
        }
    }

    return {
        id: d.match_id,
        status,
        kickoffISO,
        tournamentName: d.tournament?.name ?? null,
        home: {
            id: d.home_team.team_id,
            name: d.home_team.name,
            shortName: d.home_team.short_name ?? null,
            logo: d.home_team.image_path || d.home_team.small_image_path || d.home_team.logo || null,
            logoSmall: d.home_team.small_image_path || null,
        },
        away: {
            id: d.away_team.team_id,
            name: d.away_team.name,
            shortName: d.away_team.short_name ?? null,
            logo: d.away_team.image_path || d.away_team.small_image_path || d.away_team.logo || null,
            logoSmall: d.away_team.small_image_path || null,
        },
        scoreHome,
        scoreAway,
    };
}
