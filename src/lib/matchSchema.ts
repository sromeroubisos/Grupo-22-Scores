// src/lib/matchSchema.ts
import { z } from "zod";
import { safeParseMatchDetails } from "./flashscoreDetails";
import { toUIMatchFromDetails } from "./toUIMatchFromDetails";

// Schema for Team/Participant
export const TeamSchema = z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    name: z.string().min(1).default("Equipo L"),
    logo: z.string().url().optional().nullable().default(null),
    shortName: z.string().optional().nullable(),
});

// Schema for a Match match
export const MatchSchema = z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    status: z.string().optional().default("scheduled"),
    utcDate: z.string().optional().nullable(),
    date: z.string().optional().nullable(),
    tournament: z.string().optional().default("Torneo"),
    category: z.string().optional().default("Internacional"),
    home: TeamSchema,
    away: TeamSchema,
    scoreHome: z.number().optional().nullable().default(null),
    scoreAway: z.number().optional().nullable().default(null),
    time: z.string().optional().nullable(),
});

export type UIMatch = z.infer<typeof MatchSchema>;

// Utility to count enter/exit items
export function withStats<TIn, TOut>(
    input: TIn[],
    mapFn: (x: TIn) => TOut | null,
    label = "normalize"
) {
    const out: TOut[] = [];
    let dropped = 0;

    for (const item of input) {
        const mapped = mapFn(item);
        if (mapped) out.push(mapped);
        else dropped++;
    }

    const stats = { label, in: input.length, out: out.length, dropped };
    console.log(`[Stats] ${label}:`, stats);
    return { out, stats };
}

// Safe parser for matches list (old safeParseMatches)
export function safeParseMatchesList(payload: unknown): { matches: UIMatch[]; issues: any[] } {
    // Adapt to potential API paths
    const raw = (payload as any)?.matches ?? (payload as any)?.DATA?.EVENT ?? (payload as any)?.data?.matches ?? payload;
    const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);

    const matches: UIMatch[] = [];
    const issues: any[] = [];

    for (const [i, item] of arr.entries()) {
        const parsed = MatchSchema.safeParse(item);
        if (parsed.success) {
            matches.push(parsed.data);
        } else {
            issues.push({ index: i, errors: parsed.error.flatten(), raw: item });
        }
    }

    return { matches, issues };
}

// ROUTER: parser that supports both list and details
export function parseAnyMatches(payload: unknown) {
    // Caso 1: lista
    const list = safeParseMatchesList(payload);
    if (list.matches.length > 0) return { matches: list.matches, issues: list.issues };

    // Caso 2: details (objeto)
    const details = safeParseMatchDetails(payload);
    if (details.match) {
        const mapped = toUIMatchFromDetails(details.match);
        // We convert UI types to be compatible with MatchSchema if needed, or just return as is
        return {
            matches: [{
                id: mapped.id,
                status: mapped.status,
                utcDate: mapped.kickoffISO,
                date: mapped.kickoffISO,
                tournament: mapped.tournamentName || "Torneo",
                category: details.match.sport?.name || details.match.tournament?.name || "Evento",
                home: { id: mapped.home.id, name: mapped.home.name, logo: mapped.home.logo, shortName: mapped.home.shortName },
                away: { id: mapped.away.id, name: mapped.away.name, logo: mapped.away.logo, shortName: mapped.away.shortName },
                scoreHome: mapped.scoreHome,
                scoreAway: mapped.scoreAway,
                time: mapped.kickoffISO ? new Date(mapped.kickoffISO).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : null
            }] as UIMatch[],
            issues: []
        };
    }

    return { matches: [], issues: [{ reason: "Unknown shape / Parsing failed", raw: payload }] };
}
