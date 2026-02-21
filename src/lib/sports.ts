import type { Database } from './database.types';

export type ExternalSportId = string;
// Since tournaments.sport is string | null in DB, we extract the non-nullable string type.
export type InternalSport = NonNullable<Database['public']['Tables']['tournaments']['Row']['sport']>;

// Deduplicated and canonical list of external sports and their IDs
export const SPORTS_CANONICAL = [
    { sport_id: "1", sport_url: "/football/", name: "Football" },
    { sport_id: "2", sport_url: "/tennis/", name: "Tennis" },
    { sport_id: "3", sport_url: "/basketball/", name: "Basketball" },
    { sport_id: "4", sport_url: "/hockey/", name: "Hockey" },
    { sport_id: "5", sport_url: "/american-football/", name: "Am. football" },
    { sport_id: "6", sport_url: "/baseball/", name: "Baseball" },
    { sport_id: "7", sport_url: "/handball/", name: "Handball" },
    { sport_id: "8", sport_url: "/rugby-union/", name: "Rugby Union" },
    { sport_id: "9", sport_url: "/floorball/", name: "Floorball" },
    { sport_id: "10", sport_url: "/bandy/", name: "Bandy" },
    { sport_id: "11", sport_url: "/futsal/", name: "Futsal" },
    { sport_id: "12", sport_url: "/volleyball/", name: "Volleyball" },
    { sport_id: "13", sport_url: "/cricket/", name: "Cricket" },
    { sport_id: "14", sport_url: "/darts/", name: "Darts" },
    { sport_id: "15", sport_url: "/snooker/", name: "Snooker" },
    { sport_id: "16", sport_url: "/boxing/", name: "Boxing" },
    { sport_id: "17", sport_url: "/beach-volleyball/", name: "Beach volleyball" },
    { sport_id: "18", sport_url: "/aussie-rules/", name: "Aussie rules" },
    { sport_id: "19", sport_url: "/rugby-league/", name: "Rugby League" },
    { sport_id: "21", sport_url: "/badminton/", name: "Badminton" },
    { sport_id: "22", sport_url: "/water-polo/", name: "Water polo" },
    { sport_id: "23", sport_url: "/golf/", name: "Golf" },
    { sport_id: "24", sport_url: "/field-hockey/", name: "Field hockey" },
    { sport_id: "25", sport_url: "/table-tennis/", name: "Table tennis" },
    { sport_id: "26", sport_url: "/beach-soccer/", name: "Beach soccer" },
    { sport_id: "28", sport_url: "/mma/", name: "MMA" },
    { sport_id: "29", sport_url: "/netball/", name: "Netball" },
    { sport_id: "30", sport_url: "/pesapallo/", name: "Pesäpallo" },
    { sport_id: "31", sport_url: "/motorsport/", name: "Motorsport" },
    { sport_id: "34", sport_url: "/cycling/", name: "Cycling" },
    { sport_id: "35", sport_url: "/horse-racing/", name: "Horse racing" },
    { sport_id: "36", sport_url: "/esports/", name: "eSports" },
    { sport_id: "37", sport_url: "/winter-sports/", name: "Winter Sports" },
    { sport_id: "42", sport_url: "/kabaddi/", name: "Kabaddi" },
];

export const SPORTS_BY_ID = Object.fromEntries(
    SPORTS_CANONICAL.map((s) => [s.sport_id, s])
);

export const SPORTS_BY_URL = Object.fromEntries(
    SPORTS_CANONICAL.map((s) => [s.sport_url, s])
);

/**
 * Maps an external sport ID or URL to a normalized internal sport identifier.
 * Since tournaments.sport is just `string` in the DB, we define a set of known
 * common sports and fallback to 'rugby' for unmapped ones.
 */
export function mapExternalSportToInternalSport(externalSportOrId: string | null): InternalSport {
    if (!externalSportOrId) return "rugby";

    const lowerVal = externalSportOrId.toLowerCase();

    // Explicit string / ID mapping
    switch (lowerVal) {
        case "1": case "/football/": case "football": case "soccer":
            return "football";
        case "2": case "/tennis/": case "tennis":
            return "tennis";
        case "3": case "/basketball/": case "basketball":
            return "basketball";
        case "4": case "/hockey/": case "24": case "/field-hockey/": case "hockey": case "field-hockey":
            return "hockey";
        case "8": case "/rugby-union/": case "19": case "/rugby-league/": case "rugby": case "rugby-union": case "rugby-league":
            return "rugby";
        case "12": case "/volleyball/": case "volleyball":
            return "volleyball";
        case "5": case "/american-football/": case "american-football":
            return "american-football";
        case "6": case "/baseball/": case "baseball":
            return "baseball";
        case "7": case "/handball/": case "handball":
            return "handball";
        case "11": case "/futsal/": case "futsal":
            return "futsal";
        // For anything else, we default to rugby per business rules (since we don't officially support them yet)
        // Alternatively, if we wanted to dynamically support more, we could return a sanitized name here,
        // but the rule says "No devolver strings limpiadas desde nombres externos (eso rompe el tipo y el negocio)."
        // So we safely fallback:
        default:
            return "rugby";
    }
}
