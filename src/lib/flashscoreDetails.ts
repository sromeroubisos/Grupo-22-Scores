// src/lib/flashscoreDetails.ts
import { z } from "zod";

const TeamDetailsSchema = z.object({
    team_id: z.union([z.string(), z.number()]).transform(String),
    name: z.string().min(1),
    short_name: z.string().optional().nullable(),
    image_path: z.string().url().optional().nullable().or(z.literal('')),
    small_image_path: z.string().url().optional().nullable().or(z.literal('')),
    logo: z.string().optional().nullable(), // Allow non-standard logo field just in case
});

const MatchDetailsSchema = z.object({
    match_id: z.string().min(1),
    timestamp: z.number(), // unix seconds
    match_status: z.object({
        stage: z.string().optional().nullable(),
        is_started: z.boolean().optional(),
        is_in_progress: z.boolean().optional(),
        is_finished: z.boolean().optional(),
        is_cancelled: z.boolean().optional(),
        is_postponed: z.boolean().optional(),
    }),
    sport: z.object({
        sport_id: z.number().optional(),
        name: z.string().optional().nullable(),
    }).optional(),
    tournament: z.object({
        tournament_id: z.string().optional().nullable(),
        tournament_stage_id: z.string().optional().nullable(),
        name: z.string().optional().nullable(),
    }).optional(),
    home_team: TeamDetailsSchema,
    away_team: TeamDetailsSchema,
    // Scores can be either an array (football/rugby) or an object (basketball, etc.)
    scores: z.union([
        z.array(z.any()),
        z.object({
            home: z.number().optional().nullable(),
            away: z.number().optional().nullable(),
        }).passthrough() // Allow additional fields like quarters, periods, etc.
    ]).optional().default([]),
});

export type MatchDetails = z.infer<typeof MatchDetailsSchema>;

export function safeParseMatchDetails(payload: unknown) {
    // Try to find the event object if it's wrapped
    const raw = (payload as any)?.DATA?.EVENT || (payload as any)?.DATA || payload;

    const parsed = MatchDetailsSchema.safeParse(raw);
    if (!parsed.success) {
        return { match: null, issues: parsed.error.flatten() };
    }
    return { match: parsed.data, issues: null };
}
