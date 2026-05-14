/**
 * Maps internal tournament names → Sofascore league names used by the scraper.
 * Returned strings must match ScraperFC.Sofascore valid league names exactly.
 *
 * Add new entries here whenever you scrape a new league in
 * `.github/workflows/sofascore-scrape.yml` (matrix.league).
 */

type LeaguePattern = {
    /** Regex tested against the (lower-cased) tournament name. */
    test: RegExp;
    /** Sofascore league name fed to /api/sofascore/stats?league=... */
    league: string;
};

const PATTERNS: LeaguePattern[] = [
    { test: /\bliga\s+profesional\b/i, league: 'Argentina Liga Profesional' },
    { test: /\bcopa\s+de\s+la\s+liga\b/i, league: 'Argentina Copa de la Liga Profesional' },
    { test: /\bla\s*liga\b/i, league: 'Spain La Liga' },
    { test: /\bpremier\s+league\b/i, league: 'England Premier League' },
    { test: /\bchampionship\b/i, league: 'England EFL Championship' },
    { test: /\bbundesliga\b/i, league: 'Germany Bundesliga' },
    { test: /\bserie\s*a\b/i, league: 'Italy Serie A' },
    { test: /\bligue\s*1\b/i, league: 'France Ligue 1' },
    { test: /\beredivisie\b/i, league: 'Netherlands Eredivisie' },
    { test: /\bprimeira\s*liga\b/i, league: 'Portugal Primeira Liga' },
    { test: /\bchampions\s+league\b/i, league: 'UEFA Champions League' },
    { test: /\beuropa\s+league\b/i, league: 'UEFA Europa League' },
    { test: /\bconference\s+league\b/i, league: 'UEFA Conference League' },
    { test: /\b(libertadores)\b/i, league: 'CONMEBOL Copa Libertadores' },
    { test: /\bmls\b/i, league: 'USA MLS' },
];

export function resolveSofascoreLeague(
    tournamentName: string | null | undefined,
    sportId: string | null | undefined,
): string | null {
    if (!tournamentName) return null;
    if (sportId && sportId !== 'football') return null;
    const trimmed = tournamentName.trim();
    if (!trimmed) return null;
    for (const { test, league } of PATTERNS) {
        if (test.test(trimmed)) return league;
    }
    return null;
}
