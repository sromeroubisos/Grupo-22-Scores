import { apiFetch } from '@/lib/apiFetch';
import { memoryCache } from '@/lib/cache';
import type { Match, MatchStatus } from '@/types/match';

export type EspnFootballLeagueSlug = string;

type EspnFootballLeague = {
    slug: EspnFootballLeagueSlug;
    name: string;
    shortName: string;
    countryName: string;
    tournamentUrl: string;
    aliases: string[];
};

type EspnScoreboardEvent = Record<string, any>;
type EspnSummaryPayload = Record<string, any>;
type EspnStandingsPayload = Record<string, any>;

const SCOREBOARD_CACHE_TTL = 90;
const MATCH_CACHE_TTL = 60;
const TEAM_CACHE_TTL = 1800;
const STANDINGS_CACHE_TTL = 1800;
const ESPN_FETCH_CONCURRENCY = 24;
const TEAM_SCHEDULE_RANGE_DAYS = 120;
const SOCCER_PREFIX = 'espn-soccer-';

export const ESPN_SOCCER_MATCH_PREFIX = 'espn-soccer-game-';
export const ESPN_SOCCER_TEAM_PREFIX = 'espn-soccer-team-';
export const ESPN_SOCCER_LEAGUE_PREFIX = 'espn-soccer-league-';
export const ESPN_SOCCER_PLAYER_PREFIX = 'espn-soccer-player-';

const LEAGUES: Record<string, EspnFootballLeague> = {
    'arg.1': { slug: 'arg.1', name: 'Liga Profesional Argentina', shortName: 'LPF', countryName: 'Argentina', tournamentUrl: '/soccer/argentina/lpf/', aliases: ['liga profesional', 'lpf', 'primera division argentina', 'liga argentina'] },
    'arg.2': { slug: 'arg.2', name: 'Primera Nacional', shortName: 'B Nacional', countryName: 'Argentina', tournamentUrl: '/soccer/argentina/primera-nacional/', aliases: ['primera nacional', 'b nacional'] },
    'arg.copa': { slug: 'arg.copa', name: 'Copa Argentina', shortName: 'Copa AR', countryName: 'Argentina', tournamentUrl: '/soccer/argentina/copa-argentina/', aliases: ['copa argentina'] },
    'bra.1': { slug: 'bra.1', name: 'Brasileirão Série A', shortName: 'Brasileirão', countryName: 'Brasil', tournamentUrl: '/soccer/brazil/serie-a/', aliases: ['brasileirao', 'brasileirao serie a', 'brazil serie a'] },
    'bra.2': { slug: 'bra.2', name: 'Brasileirão Série B', shortName: 'Brasileirão B', countryName: 'Brasil', tournamentUrl: '/soccer/brazil/serie-b/', aliases: ['brasileirao serie b', 'brazil serie b'] },
    'bra.copa_do_brazil': { slug: 'bra.copa_do_brazil', name: 'Copa do Brasil', shortName: 'Copa BR', countryName: 'Brasil', tournamentUrl: '/soccer/brazil/copa-do-brazil/', aliases: ['copa do brasil'] },
    'chi.1': { slug: 'chi.1', name: 'Primera División Chile', shortName: 'Chile 1', countryName: 'Chile', tournamentUrl: '/soccer/chile/primera-division/', aliases: ['chile primera division'] },
    'col.1': { slug: 'col.1', name: 'Liga BetPlay Colombia', shortName: 'Liga COL', countryName: 'Colombia', tournamentUrl: '/soccer/colombia/liga-betplay/', aliases: ['liga colombia', 'liga betplay'] },
    'uru.1': { slug: 'uru.1', name: 'Primera División Uruguay', shortName: 'Uruguay 1', countryName: 'Uruguay', tournamentUrl: '/soccer/uruguay/primera-division/', aliases: ['uruguay primera division'] },
    'par.1': { slug: 'par.1', name: 'Primera División Paraguay', shortName: 'Paraguay 1', countryName: 'Paraguay', tournamentUrl: '/soccer/paraguay/primera-division/', aliases: ['paraguay primera division'] },
    'per.1': { slug: 'per.1', name: 'Liga 1 Perú', shortName: 'Liga 1', countryName: 'Perú', tournamentUrl: '/soccer/peru/liga-1/', aliases: ['liga 1 peru', 'peru primera'] },
    'ecu.1': { slug: 'ecu.1', name: 'LigaPro Ecuador', shortName: 'LigaPro', countryName: 'Ecuador', tournamentUrl: '/soccer/ecuador/liga-pro/', aliases: ['ligapro', 'ecuador serie a'] },
    'ven.1': { slug: 'ven.1', name: 'Primera División Venezuela', shortName: 'Venezuela 1', countryName: 'Venezuela', tournamentUrl: '/soccer/venezuela/primera-division/', aliases: ['venezuela primera division'] },
    'bol.1': { slug: 'bol.1', name: 'División Profesional Bolivia', shortName: 'Bolivia 1', countryName: 'Bolivia', tournamentUrl: '/soccer/bolivia/division-profesional/', aliases: ['bolivia primera division'] },
    'eng.1': { slug: 'eng.1', name: 'English Premier League', shortName: 'Premier', countryName: 'Inglaterra', tournamentUrl: '/soccer/england/premier-league/', aliases: ['premier league', 'epl', 'english premier'] },
    'eng.2': { slug: 'eng.2', name: 'EFL Championship', shortName: 'Championship', countryName: 'Inglaterra', tournamentUrl: '/soccer/england/championship/', aliases: ['championship', 'efl championship'] },
    'eng.3': { slug: 'eng.3', name: 'EFL League One', shortName: 'League One', countryName: 'Inglaterra', tournamentUrl: '/soccer/england/league-one/', aliases: ['league one'] },
    'eng.4': { slug: 'eng.4', name: 'EFL League Two', shortName: 'League Two', countryName: 'Inglaterra', tournamentUrl: '/soccer/england/league-two/', aliases: ['league two'] },
    'eng.fa': { slug: 'eng.fa', name: 'FA Cup', shortName: 'FA Cup', countryName: 'Inglaterra', tournamentUrl: '/soccer/england/fa-cup/', aliases: ['fa cup', 'emirates fa cup'] },
    'eng.league_cup': { slug: 'eng.league_cup', name: 'EFL Cup', shortName: 'EFL Cup', countryName: 'Inglaterra', tournamentUrl: '/soccer/england/efl-cup/', aliases: ['efl cup', 'carabao cup', 'league cup'] },
    'esp.1': { slug: 'esp.1', name: 'LaLiga', shortName: 'LaLiga', countryName: 'España', tournamentUrl: '/soccer/spain/laliga/', aliases: ['laliga', 'la liga', 'primera division espana', 'spanish primera'] },
    'esp.2': { slug: 'esp.2', name: 'LaLiga 2', shortName: 'LaLiga 2', countryName: 'España', tournamentUrl: '/soccer/spain/laliga-2/', aliases: ['laliga 2', 'segunda division'] },
    'esp.copa_del_rey': { slug: 'esp.copa_del_rey', name: 'Copa del Rey', shortName: 'Copa Rey', countryName: 'España', tournamentUrl: '/soccer/spain/copa-del-rey/', aliases: ['copa del rey'] },
    'esp.super_cup': { slug: 'esp.super_cup', name: 'Supercopa de España', shortName: 'Supercopa ES', countryName: 'España', tournamentUrl: '/soccer/spain/supercopa/', aliases: ['supercopa espana', 'supercopa de espana'] },
    'ita.1': { slug: 'ita.1', name: 'Serie A Italia', shortName: 'Serie A', countryName: 'Italia', tournamentUrl: '/soccer/italy/serie-a/', aliases: ['serie a', 'italian serie a'] },
    'ita.2': { slug: 'ita.2', name: 'Serie B Italia', shortName: 'Serie B', countryName: 'Italia', tournamentUrl: '/soccer/italy/serie-b/', aliases: ['serie b'] },
    'ita.coppa_italia': { slug: 'ita.coppa_italia', name: 'Coppa Italia', shortName: 'Coppa ITA', countryName: 'Italia', tournamentUrl: '/soccer/italy/coppa-italia/', aliases: ['coppa italia'] },
    'ita.super_cup': { slug: 'ita.super_cup', name: 'Supercoppa Italiana', shortName: 'Supercoppa', countryName: 'Italia', tournamentUrl: '/soccer/italy/supercoppa/', aliases: ['supercoppa italiana'] },
    'ger.1': { slug: 'ger.1', name: 'Bundesliga', shortName: 'Bundesliga', countryName: 'Alemania', tournamentUrl: '/soccer/germany/bundesliga/', aliases: ['bundesliga', 'german bundesliga'] },
    'ger.2': { slug: 'ger.2', name: '2. Bundesliga', shortName: '2. Bundes', countryName: 'Alemania', tournamentUrl: '/soccer/germany/2-bundesliga/', aliases: ['2 bundesliga', 'zweite bundesliga'] },
    'ger.dfb_pokal': { slug: 'ger.dfb_pokal', name: 'DFB Pokal', shortName: 'DFB Pokal', countryName: 'Alemania', tournamentUrl: '/soccer/germany/dfb-pokal/', aliases: ['dfb pokal'] },
    'fra.1': { slug: 'fra.1', name: 'Ligue 1', shortName: 'Ligue 1', countryName: 'Francia', tournamentUrl: '/soccer/france/ligue-1/', aliases: ['ligue 1', 'french ligue 1'] },
    'fra.2': { slug: 'fra.2', name: 'Ligue 2', shortName: 'Ligue 2', countryName: 'Francia', tournamentUrl: '/soccer/france/ligue-2/', aliases: ['ligue 2'] },
    'fra.coupe_de_france': { slug: 'fra.coupe_de_france', name: 'Coupe de France', shortName: 'Coupe FR', countryName: 'Francia', tournamentUrl: '/soccer/france/coupe-de-france/', aliases: ['coupe de france'] },
    'ned.1': { slug: 'ned.1', name: 'Eredivisie', shortName: 'Eredivisie', countryName: 'Países Bajos', tournamentUrl: '/soccer/netherlands/eredivisie/', aliases: ['eredivisie', 'dutch eredivisie'] },
    'ned.2': { slug: 'ned.2', name: 'Eerste Divisie', shortName: 'Eerste Div', countryName: 'Países Bajos', tournamentUrl: '/soccer/netherlands/eerste-divisie/', aliases: ['eerste divisie'] },
    'por.1': { slug: 'por.1', name: 'Primeira Liga', shortName: 'Primeira', countryName: 'Portugal', tournamentUrl: '/soccer/portugal/primeira-liga/', aliases: ['primeira liga', 'liga portugal'] },
    'tur.1': { slug: 'tur.1', name: 'Süper Lig', shortName: 'Süper Lig', countryName: 'Turquía', tournamentUrl: '/soccer/turkey/super-lig/', aliases: ['super lig', 'turkish super lig'] },
    'bel.1': { slug: 'bel.1', name: 'Belgian Pro League', shortName: 'Bel Pro', countryName: 'Bélgica', tournamentUrl: '/soccer/belgium/pro-league/', aliases: ['belgian pro league', 'jupiler pro league'] },
    'sco.1': { slug: 'sco.1', name: 'Scottish Premiership', shortName: 'Scot Prem', countryName: 'Escocia', tournamentUrl: '/soccer/scotland/premiership/', aliases: ['scottish premiership'] },
    'gre.1': { slug: 'gre.1', name: 'Super League Grecia', shortName: 'Super Grecia', countryName: 'Grecia', tournamentUrl: '/soccer/greece/super-league/', aliases: ['greek super league'] },
    'sui.1': { slug: 'sui.1', name: 'Super League Suiza', shortName: 'Super Suiza', countryName: 'Suiza', tournamentUrl: '/soccer/switzerland/super-league/', aliases: ['swiss super league'] },
    'aut.1': { slug: 'aut.1', name: 'Bundesliga Austria', shortName: 'Bundes AT', countryName: 'Austria', tournamentUrl: '/soccer/austria/bundesliga/', aliases: ['austrian bundesliga'] },
    'rus.1': { slug: 'rus.1', name: 'Premier League Rusia', shortName: 'Premier RU', countryName: 'Rusia', tournamentUrl: '/soccer/russia/premier-league/', aliases: ['russian premier league'] },
    'ukr.1': { slug: 'ukr.1', name: 'Premier League Ucrania', shortName: 'Premier UA', countryName: 'Ucrania', tournamentUrl: '/soccer/ukraine/premier-league/', aliases: ['ukrainian premier league'] },
    'usa.1': { slug: 'usa.1', name: 'Major League Soccer', shortName: 'MLS', countryName: 'USA', tournamentUrl: '/soccer/usa/mls/', aliases: ['mls', 'major league soccer'] },
    'usa.usl.1': { slug: 'usa.usl.1', name: 'USL Championship', shortName: 'USL', countryName: 'USA', tournamentUrl: '/soccer/usa/usl/', aliases: ['usl championship', 'usl'] },
    'mex.1': { slug: 'mex.1', name: 'Liga MX', shortName: 'Liga MX', countryName: 'México', tournamentUrl: '/soccer/mexico/liga-mx/', aliases: ['liga mx', 'mexican primera'] },
    'mex.2': { slug: 'mex.2', name: 'Liga Expansión MX', shortName: 'Expansión MX', countryName: 'México', tournamentUrl: '/soccer/mexico/liga-expansion/', aliases: ['liga expansion', 'ascenso mx'] },
    'conmebol.libertadores': { slug: 'conmebol.libertadores', name: 'CONMEBOL Libertadores', shortName: 'Libertadores', countryName: 'Sudamérica', tournamentUrl: '/soccer/conmebol/libertadores/', aliases: ['libertadores', 'copa libertadores'] },
    'conmebol.sudamericana': { slug: 'conmebol.sudamericana', name: 'CONMEBOL Sudamericana', shortName: 'Sudamericana', countryName: 'Sudamérica', tournamentUrl: '/soccer/conmebol/sudamericana/', aliases: ['sudamericana', 'copa sudamericana'] },
    'conmebol.recopa': { slug: 'conmebol.recopa', name: 'CONMEBOL Recopa', shortName: 'Recopa', countryName: 'Sudamérica', tournamentUrl: '/soccer/conmebol/recopa/', aliases: ['recopa sudamericana'] },
    'conmebol.america': { slug: 'conmebol.america', name: 'Copa América', shortName: 'Copa América', countryName: 'Sudamérica', tournamentUrl: '/soccer/conmebol/copa-america/', aliases: ['copa america'] },
    'conmebol.fifa.worldq': { slug: 'conmebol.fifa.worldq', name: 'Eliminatorias CONMEBOL', shortName: 'Eliminatorias', countryName: 'Sudamérica', tournamentUrl: '/soccer/conmebol/world-cup-qualifying/', aliases: ['eliminatorias conmebol', 'world cup qualifying conmebol'] },
    'uefa.champions': { slug: 'uefa.champions', name: 'UEFA Champions League', shortName: 'Champions', countryName: 'Europa', tournamentUrl: '/soccer/uefa/champions-league/', aliases: ['champions league', 'uefa champions'] },
    'uefa.europa': { slug: 'uefa.europa', name: 'UEFA Europa League', shortName: 'Europa', countryName: 'Europa', tournamentUrl: '/soccer/uefa/europa-league/', aliases: ['europa league', 'uefa europa'] },
    'uefa.europa.conf': { slug: 'uefa.europa.conf', name: 'UEFA Conference League', shortName: 'Conference', countryName: 'Europa', tournamentUrl: '/soccer/uefa/conference-league/', aliases: ['conference league', 'uefa conference'] },
    'uefa.nations': { slug: 'uefa.nations', name: 'UEFA Nations League', shortName: 'Nations', countryName: 'Europa', tournamentUrl: '/soccer/uefa/nations-league/', aliases: ['nations league', 'uefa nations'] },
    'uefa.euro': { slug: 'uefa.euro', name: 'UEFA Euro', shortName: 'Euro', countryName: 'Europa', tournamentUrl: '/soccer/uefa/euro/', aliases: ['eurocopa', 'euro', 'uefa euro'] },
    'uefa.euro_q': { slug: 'uefa.euro_q', name: 'Clasificación UEFA Euro', shortName: 'Euro Q', countryName: 'Europa', tournamentUrl: '/soccer/uefa/euro-qualifying/', aliases: ['euro qualifying'] },
    'uefa.super_cup': { slug: 'uefa.super_cup', name: 'UEFA Super Cup', shortName: 'Super Cup', countryName: 'Europa', tournamentUrl: '/soccer/uefa/super-cup/', aliases: ['uefa super cup'] },
    'concacaf.champions': { slug: 'concacaf.champions', name: 'Concacaf Champions Cup', shortName: 'Concacaf Champ', countryName: 'CONCACAF', tournamentUrl: '/soccer/concacaf/champions/', aliases: ['concacaf champions'] },
    'concacaf.gold': { slug: 'concacaf.gold', name: 'Concacaf Gold Cup', shortName: 'Gold Cup', countryName: 'CONCACAF', tournamentUrl: '/soccer/concacaf/gold-cup/', aliases: ['gold cup', 'concacaf gold cup'] },
    'concacaf.nations.league': { slug: 'concacaf.nations.league', name: 'Concacaf Nations League', shortName: 'Concacaf Nations', countryName: 'CONCACAF', tournamentUrl: '/soccer/concacaf/nations-league/', aliases: ['concacaf nations league'] },
    'caf.champions': { slug: 'caf.champions', name: 'CAF Champions League', shortName: 'CAF Champ', countryName: 'África', tournamentUrl: '/soccer/caf/champions/', aliases: ['caf champions league'] },
    'caf.confederation': { slug: 'caf.confederation', name: 'CAF Confederation Cup', shortName: 'CAF Conf', countryName: 'África', tournamentUrl: '/soccer/caf/confederation/', aliases: ['caf confederation cup'] },
    'caf.nations': { slug: 'caf.nations', name: 'Copa Africana de Naciones', shortName: 'AFCON', countryName: 'África', tournamentUrl: '/soccer/caf/nations/', aliases: ['afcon', 'africa cup of nations'] },
    'afc.champions': { slug: 'afc.champions', name: 'AFC Champions League', shortName: 'AFC Champ', countryName: 'Asia', tournamentUrl: '/soccer/afc/champions/', aliases: ['afc champions league'] },
    'afc.asian': { slug: 'afc.asian', name: 'Copa Asiática', shortName: 'Asian Cup', countryName: 'Asia', tournamentUrl: '/soccer/afc/asian-cup/', aliases: ['asian cup', 'afc asian cup'] },
    'fifa.world': { slug: 'fifa.world', name: 'FIFA World Cup', shortName: 'Mundial', countryName: 'FIFA', tournamentUrl: '/soccer/fifa/world-cup/', aliases: ['mundial', 'world cup', 'copa del mundo'] },
    'fifa.cwc': { slug: 'fifa.cwc', name: 'FIFA Club World Cup', shortName: 'Mundial Clubes', countryName: 'FIFA', tournamentUrl: '/soccer/fifa/club-world-cup/', aliases: ['mundial de clubes', 'club world cup'] },
    'fifa.confederations': { slug: 'fifa.confederations', name: 'FIFA Confederations Cup', shortName: 'Confeds', countryName: 'FIFA', tournamentUrl: '/soccer/fifa/confederations/', aliases: ['confederations cup'] },
    'fifa.friendly': { slug: 'fifa.friendly', name: 'Amistosos Internacionales', shortName: 'Amistosos', countryName: 'FIFA', tournamentUrl: '/soccer/fifa/friendly/', aliases: ['international friendly', 'amistoso internacional'] },
    'fifa.olympics': { slug: 'fifa.olympics', name: 'Fútbol Olímpico', shortName: 'Olímpicos', countryName: 'FIFA', tournamentUrl: '/soccer/fifa/olympics/', aliases: ['olympics soccer', 'olimpicos futbol'] },
};

export const SUPPORTED_ESPN_FOOTBALL_LEAGUES = Object.values(LEAGUES);
export const SUPPORTED_ESPN_FOOTBALL_LEAGUE_SLUGS = Object.keys(LEAGUES);

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function normalizeKey(value: unknown): string | null {
    const normalized = normalizeString(value);
    return normalized ? normalized.toLowerCase() : null;
}

function toDateOnly(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function formatEspnDate(date: Date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function parseDate(value: unknown): Date | null {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getCompetitors(event: Record<string, any>) {
    const competition = Array.isArray(event.competitions) ? event.competitions[0] : null;
    const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
    const home = competitors.find((c: any) => c?.homeAway === 'home') || competitors[0] || null;
    const away = competitors.find((c: any) => c?.homeAway === 'away') || competitors[1] || null;
    return { competition, competitors, home, away };
}

function getEspnLogo(entity: any): string {
    const logos = Array.isArray(entity?.logos) ? entity.logos : [];
    for (const logo of logos) {
        if (typeof logo?.href === 'string' && logo.href.trim()) return logo.href.trim();
    }
    if (typeof entity?.logo === 'string' && entity.logo.trim()) return entity.logo.trim();
    if (typeof entity?.href === 'string' && entity.href.trim()) return entity.href.trim();
    return '';
}

function getEspnTeamDisplayName(competitor: any) {
    return (
        competitor?.team?.displayName ||
        competitor?.team?.shortDisplayName ||
        competitor?.team?.name ||
        competitor?.displayName ||
        competitor?.name ||
        'Equipo'
    );
}

function getEspnTeamAbbreviation(competitor: any) {
    return (
        competitor?.team?.abbreviation ||
        competitor?.abbreviation ||
        competitor?.team?.shortDisplayName ||
        null
    );
}

function parseScore(value: unknown) {
    if (isRecord(value)) {
        // ESPN's team schedule endpoint returns scores as { value, displayValue }
        // while the scoreboard endpoint returns them as strings.
        if (typeof value.value === 'number' && Number.isFinite(value.value)) return value.value;
        const inner = normalizeString(value.displayValue);
        if (inner) {
            const numeric = Number(inner);
            if (Number.isFinite(numeric)) return numeric;
        }
        return null;
    }
    const raw = normalizeString(value);
    if (!raw) return null;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
}

function mapEspnStatus(statusType: any): MatchStatus {
    const state = normalizeKey(statusType?.state);
    const description = normalizeKey(statusType?.description);
    const detail = normalizeKey(statusType?.detail);
    const shortDetail = normalizeKey(statusType?.shortDetail);

    if (state === 'post' || statusType?.completed) return 'final';
    if (state === 'in') return 'live';
    if (description?.includes('postponed') || detail?.includes('postponed') || shortDetail?.includes('postponed')) return 'postponed';
    if (description?.includes('canceled') || description?.includes('cancelled')) return 'cancelled';
    return 'scheduled';
}

function getMatchMinute(statusType: any): string | undefined {
    const detail = normalizeString(statusType?.shortDetail) || normalizeString(statusType?.detail);
    if (!detail) return undefined;
    if (detail.toLowerCase().includes('half')) return 'HT';
    if (/\d+'/.test(detail)) return detail;
    return undefined;
}

function getLeagueLogo(payload: Record<string, any> | null | undefined) {
    return (
        getEspnLogo(payload) ||
        getEspnLogo(payload?.league) ||
        getEspnLogo(Array.isArray(payload?.leagues) ? payload.leagues[0] : null)
    );
}

function getLeagueSeason(payload: Record<string, any> | null | undefined) {
    const season =
        payload?.season?.year ??
        payload?.requestedSeason?.year ??
        payload?.header?.season?.year ??
        (Array.isArray(payload?.leagues) ? payload.leagues[0]?.season?.year : null) ??
        null;
    return typeof season === 'number' ? season : null;
}

function getLeagueStandingEntries(payload: EspnStandingsPayload | null | undefined) {
    const direct = Array.isArray(payload?.standings?.entries) ? payload.standings.entries : [];
    if (direct.length > 0) return direct;

    const children = Array.isArray(payload?.children) ? payload.children : [];
    return children.flatMap((child) => {
        const entries = Array.isArray(child?.standings?.entries) ? child.standings.entries : [];
        return entries.map((entry: any) => ({
            ...entry,
            _groupName: child?.name || child?.abbreviation || null,
        }));
    });
}

function getStatValue(stats: any[], names: string[]) {
    for (const stat of stats) {
        const statName = normalizeKey(stat?.name);
        if (!statName) continue;
        if (names.includes(statName)) {
            const numeric = Number(stat?.value);
            if (Number.isFinite(numeric)) return numeric;
        }
    }
    return null;
}

export function isEspnFootballLeagueSlug(value: unknown): value is EspnFootballLeagueSlug {
    const normalized = normalizeKey(value);
    return Boolean(normalized && normalized in LEAGUES);
}

export function getEspnFootballLeague(slug: EspnFootballLeagueSlug) {
    return LEAGUES[slug] || null;
}

export function toEspnFootballTournamentId(leagueSlug: EspnFootballLeagueSlug) {
    return `${ESPN_SOCCER_LEAGUE_PREFIX}${leagueSlug}`;
}

export function parseEspnFootballTournamentId(value: unknown): EspnFootballLeagueSlug | null {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    const prefix = ESPN_SOCCER_LEAGUE_PREFIX;
    if (!normalized.toLowerCase().startsWith(prefix)) return null;
    const slug = normalized.slice(prefix.length);
    return isEspnFootballLeagueSlug(slug) ? slug : null;
}

export function toEspnFootballTeamId(teamId: string | number, leagueSlug: string) {
    return `${ESPN_SOCCER_TEAM_PREFIX}${leagueSlug}-${String(teamId)}`;
}

export type ParsedEspnFootballTeamId = { leagueSlug: EspnFootballLeagueSlug | null; teamId: string };

export function parseEspnFootballTeamId(value: unknown): ParsedEspnFootballTeamId | null {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    const prefixed = new RegExp(`^${ESPN_SOCCER_TEAM_PREFIX}(.+)-(\\d+)$`, 'i').exec(normalized);
    if (prefixed) {
        const slugRaw = prefixed[1];
        return {
            leagueSlug: isEspnFootballLeagueSlug(slugRaw) ? slugRaw : null,
            teamId: prefixed[2],
        };
    }
    const legacy = new RegExp(`^${ESPN_SOCCER_TEAM_PREFIX}(\\d+)$`, 'i').exec(normalized);
    if (legacy) return { leagueSlug: null, teamId: legacy[1] };
    return null;
}

export function toEspnFootballMatchId(matchId: string | number, leagueSlug: string) {
    return `${ESPN_SOCCER_MATCH_PREFIX}${leagueSlug}-${String(matchId)}`;
}

export type ParsedEspnFootballMatchId = { leagueSlug: EspnFootballLeagueSlug | null; eventId: string };

export function parseEspnFootballMatchId(value: unknown): ParsedEspnFootballMatchId | null {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    const prefixed = new RegExp(`^${ESPN_SOCCER_MATCH_PREFIX}(.+)-(\\d+)$`, 'i').exec(normalized);
    if (prefixed) {
        const slugRaw = prefixed[1];
        return {
            leagueSlug: isEspnFootballLeagueSlug(slugRaw) ? slugRaw : null,
            eventId: prefixed[2],
        };
    }
    const legacy = new RegExp(`^${ESPN_SOCCER_MATCH_PREFIX}(\\d+)$`, 'i').exec(normalized);
    if (legacy) return { leagueSlug: null, eventId: legacy[1] };
    return null;
}

export function toEspnFootballPlayerId(playerId: string | number, leagueSlug: string) {
    return `${ESPN_SOCCER_PLAYER_PREFIX}${leagueSlug}-${String(playerId)}`;
}

export type ParsedEspnFootballPlayerId = { leagueSlug: EspnFootballLeagueSlug | null; playerId: string };

export function parseEspnFootballPlayerId(value: unknown): ParsedEspnFootballPlayerId | null {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    const prefixed = new RegExp(`^${ESPN_SOCCER_PLAYER_PREFIX}(.+)-(\\d+)$`, 'i').exec(normalized);
    if (prefixed) {
        const slugRaw = prefixed[1];
        return {
            leagueSlug: isEspnFootballLeagueSlug(slugRaw) ? slugRaw : null,
            playerId: prefixed[2],
        };
    }
    const legacy = new RegExp(`^${ESPN_SOCCER_PLAYER_PREFIX}(\\d+)$`, 'i').exec(normalized);
    if (legacy) return { leagueSlug: null, playerId: legacy[1] };
    return null;
}

export function isEspnFootballAnyId(value: unknown) {
    const normalized = normalizeString(value);
    if (!normalized) return false;
    return normalized.toLowerCase().startsWith(SOCCER_PREFIX);
}

const inflightEspnRequests = new Map<string, Promise<unknown>>();

async function fetchEspnJson<T>(url: string, debugTag: string, cacheTtl: number) {
    const cacheKey = `espn-soccer:${url}`;
    const cached = memoryCache.get<T>(cacheKey);
    if (cached) return cached;

    const existing = inflightEspnRequests.get(cacheKey) as Promise<T | null> | undefined;
    if (existing) return existing;

    const promise = (async () => {
        try {
            // Freshness is governed solely by the in-process memoryCache below.
            // We must NOT let Next.js persist this response in its fetch Data
            // Cache: during a live tournament that persistent layer keeps serving
            // a pre-match snapshot (matches as scheduled/0-0, knockout slots still
            // labelled "Group A 2nd Place") far longer than our intended TTL via
            // stale-while-revalidate, even after ESPN has the final result.
            const { data } = await apiFetch<T>(url, {
                debugTag,
                silent: true,
                cache: 'no-store',
            });
            if (data) {
                memoryCache.set(cacheKey, data, cacheTtl);
            }
            return data;
        } finally {
            inflightEspnRequests.delete(cacheKey);
        }
    })();

    inflightEspnRequests.set(cacheKey, promise);
    return promise;
}

async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const idx = cursor++;
            if (idx >= items.length) return;
            results[idx] = await worker(items[idx], idx);
        }
    });
    await Promise.all(runners);
    return results;
}

async function fetchScoreboardForDate(leagueSlug: EspnFootballLeagueSlug, date: Date) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/scoreboard?dates=${formatEspnDate(date)}`;
    return fetchEspnJson<Record<string, any>>(url, 'EspnSoccerScoreboard', SCOREBOARD_CACHE_TTL);
}

// Past scoreboard data never changes once a match is final, so we can cache
// it for an order-of-magnitude longer than upcoming events. Today's cutoff
// uses the live-events TTL so live scores stay current.
const SCOREBOARD_HISTORICAL_CACHE_TTL = 24 * 60 * 60; // 24h
const SCOREBOARD_CHUNK_CONCURRENCY = 16;
// During a live tournament, matches that finished today/yesterday — and knockout
// slots that just received their teams — are still settling on ESPN's side. Only
// treat a chunk as long-cacheable "history" once it ended at least this many days
// ago; anything inside the recent window keeps the short, live TTL so the bracket
// and results reflect freshly-played matches instead of a stale pre-match snapshot.
const SCOREBOARD_RECENT_DAYS = 3;

async function fetchScoreboardRangeEvents(leagueSlug: EspnFootballLeagueSlug, startDate: Date, endDate: Date) {
    const safeStart = toDateOnly(startDate);
    const safeEnd = toDateOnly(endDate);
    const todayStart = toDateOnly(new Date());

    // Pre-compute the chunk windows so we can hit them in parallel.
    const chunks: Array<{ start: Date; end: Date }> = [];
    let cursor = safeStart;
    while (cursor <= safeEnd) {
        const chunkEnd = addDays(cursor, 9);
        const boundedEnd = chunkEnd <= safeEnd ? chunkEnd : safeEnd;
        chunks.push({ start: cursor, end: boundedEnd });
        cursor = addDays(boundedEnd, 1);
    }

    const payloads = await mapWithConcurrency(chunks, SCOREBOARD_CHUNK_CONCURRENCY, async (chunk) => {
        const datesParam = `${formatEspnDate(chunk.start)}-${formatEspnDate(chunk.end)}`;
        // ESPN defaults to ~100 events per scoreboard response. High-volume
        // competitions like fifa.friendly easily exceed that in a 10-day window
        // (~50 internationals/day), so events at the end of the chunk get
        // dropped silently. Asking for a larger limit avoids that.
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/scoreboard?dates=${datesParam}&limit=500`;
        const historicalCutoff = addDays(todayStart, -SCOREBOARD_RECENT_DAYS);
        const isHistorical = chunk.end < historicalCutoff;
        const ttl = isHistorical ? SCOREBOARD_HISTORICAL_CACHE_TTL : SCOREBOARD_CACHE_TTL;
        return fetchEspnJson<Record<string, any>>(url, 'EspnSoccerScoreboard', ttl);
    });

    const eventsById = new Map<string, EspnScoreboardEvent>();
    for (const payload of payloads) {
        const events = Array.isArray(payload?.events) ? payload.events : [];
        for (const event of events) {
            const eventId = normalizeString(event?.id);
            if (eventId) eventsById.set(eventId, event);
        }
    }

    return Array.from(eventsById.values()).sort((l, r) => {
        const lDate = parseDate(l?.date)?.getTime() || 0;
        const rDate = parseDate(r?.date)?.getTime() || 0;
        return lDate - rDate;
    });
}

async function fetchLeagueStandingsRaw(leagueSlug: EspnFootballLeagueSlug, season?: number) {
    const seasonParam = season ? `?season=${season}` : '';
    const url = `https://site.api.espn.com/apis/v2/sports/soccer/${leagueSlug}/standings${seasonParam}`;
    return fetchEspnJson<EspnStandingsPayload>(url, 'EspnSoccerStandings', STANDINGS_CACHE_TTL);
}

async function fetchLeagueLeadersRaw(leagueSlug: EspnFootballLeagueSlug, season?: number) {
    const seasonParam = season ? `?season=${season}` : '';
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/leaders${seasonParam}`;
    return fetchEspnJson<Record<string, any>>(url, 'EspnSoccerLeaders', STANDINGS_CACHE_TTL).catch(() => null);
}

const LEADER_GOAL_CATEGORY_KEYS = new Set(['totalgoals', 'goals', 'goalsscored', 'leaguegoals']);

function buildTopScorersFromLeaders(payload: Record<string, any> | null | undefined, leagueSlug: EspnFootballLeagueSlug) {
    if (!payload) return [];
    const categories = Array.isArray(payload?.categories)
        ? payload.categories
        : Array.isArray(payload?.leaders)
            ? payload.leaders
            : [];
    const goalsCategory = categories.find((cat: any) => {
        const name = normalizeKey(cat?.name) || normalizeKey(cat?.abbreviation);
        if (name && LEADER_GOAL_CATEGORY_KEYS.has(name)) return true;
        const display = normalizeKey(cat?.displayName);
        return Boolean(display && (display.includes('goal') || display.includes('gole')));
    }) || categories[0];
    if (!goalsCategory) return [];
    const leaders = Array.isArray(goalsCategory?.leaders) ? goalsCategory.leaders : [];
    return leaders
        .map((leader: any, index: number) => {
            const athlete = leader?.athlete || leader?.player || {};
            const team = leader?.team || athlete?.team || {};
            const goalsRaw = Number(leader?.value ?? leader?.displayValue);
            const goals = Number.isFinite(goalsRaw) ? Math.trunc(goalsRaw) : 0;
            const playerId = normalizeString(athlete?.id);
            const teamId = normalizeString(team?.id);
            const headshot = normalizeString(athlete?.headshot?.href) || normalizeString(athlete?.headshot);
            return {
                position: index + 1,
                player_id: playerId,
                player_name: athlete?.displayName || athlete?.fullName || athlete?.shortName || '',
                name: athlete?.displayName || athlete?.fullName || athlete?.shortName || '',
                player_logo: headshot || '',
                player_image: headshot || '',
                team_id: teamId ? toEspnFootballTeamId(teamId, leagueSlug) : null,
                team_name: team?.displayName || team?.shortDisplayName || team?.name || '',
                team_logo: getEspnLogo(team),
                goals,
            };
        })
        .filter((row: any) => row.player_name);
}

const PLAYOFF_ROUND_LABELS: Record<string, string> = {
    'round-of-128': 'Ronda de 128',
    'round-of-64': 'Ronda de 64',
    'round-of-32': 'Dieciseisavos',
    'round-of-16': 'Octavos de Final',
    'quarterfinals': 'Cuartos de Final',
    'quarter-finals': 'Cuartos de Final',
    'semifinals': 'Semifinales',
    'semi-finals': 'Semifinales',
    'third-place': '3er Puesto',
    'final': 'Final',
    'play-off': 'Repechaje',
    'playoff': 'Repechaje',
    'knockout': 'Eliminatorias',
};

const PLAYOFF_ROUND_ORDER = [
    'round-of-128',
    'round-of-64',
    'round-of-32',
    'round-of-16',
    'quarterfinals',
    'quarter-finals',
    'semifinals',
    'semi-finals',
    'third-place',
    'final',
];

function detectPlayoffRoundKey(slug: string | null | undefined): string | null {
    if (!slug) return null;
    const lower = slug.toLowerCase();
    for (const key of PLAYOFF_ROUND_ORDER) {
        if (lower.includes(key)) return key;
    }
    if (lower.includes('playoff') || lower.includes('knockout')) return 'knockout';
    return null;
}

function detectTournamentStagePrefix(event: EspnScoreboardEvent): string {
    const slug = normalizeString(event?.season?.type?.slug) || '';
    if (slug.includes('---')) {
        return slug.split('---')[0];
    }
    const seasonYear = typeof event?.season?.year === 'number' ? event.season.year : '';
    return `season-${seasonYear}`;
}

function bracketPairingKey(homeRawId: string | null, awayRawId: string | null) {
    if (!homeRawId || !awayRawId) return null;
    return [homeRawId, awayRawId].sort().join('::');
}

function consolidateTwoLegTies(viewEvents: EspnTournamentViewEvent[]) {
    const grouped = new Map<string, EspnTournamentViewEvent[]>();
    for (const event of viewEvents) {
        const homeRaw = parseEspnFootballTeamId(event.home_team?.id)?.teamId || event.home_team?.id || null;
        const awayRaw = parseEspnFootballTeamId(event.away_team?.id)?.teamId || event.away_team?.id || null;
        const pairKey = bracketPairingKey(
            typeof homeRaw === 'string' ? homeRaw : null,
            typeof awayRaw === 'string' ? awayRaw : null,
        );
        if (!pairKey) {
            grouped.set(`single::${event.match_id}`, [event]);
            continue;
        }
        if (!grouped.has(pairKey)) grouped.set(pairKey, []);
        grouped.get(pairKey)!.push(event);
    }

    return Array.from(grouped.values()).map((legs) => {
        if (legs.length === 1) return decorateBracketMatch(legs[0]);
        legs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const firstLeg = legs[0];
        const lastLeg = legs[legs.length - 1];
        const firstHomeRaw = parseEspnFootballTeamId(firstLeg.home_team?.id)?.teamId || firstLeg.home_team?.id;
        const lastHomeRaw = parseEspnFootballTeamId(lastLeg.home_team?.id)?.teamId || lastLeg.home_team?.id;
        const sameOrientation = firstHomeRaw === lastHomeRaw;

        const homeAggregate = (firstLeg.scores?.home ?? 0)
            + (sameOrientation ? (lastLeg.scores?.home ?? 0) : (lastLeg.scores?.away ?? 0));
        const awayAggregate = (firstLeg.scores?.away ?? 0)
            + (sameOrientation ? (lastLeg.scores?.away ?? 0) : (lastLeg.scores?.home ?? 0));
        const allFinal = legs.every((l) => l.status === 'final');
        const aggregateScore = {
            home: homeAggregate,
            away: awayAggregate,
            penalties: lastLeg.scores?.penalties ?? null,
        };
        const merged: EspnTournamentViewEvent = {
            ...lastLeg,
            scores: aggregateScore,
            score: aggregateScore,
            status: allFinal ? 'final' : lastLeg.status,
            match_status: allFinal ? 'final' : lastLeg.status,
            home_team: firstLeg.home_team,
            away_team: firstLeg.away_team,
            home_team_name: firstLeg.home_team_name,
            away_team_name: firstLeg.away_team_name,
            home_team_logo: firstLeg.home_team_logo,
            away_team_logo: firstLeg.away_team_logo,
        };
        return decorateBracketMatch(merged);
    });
}

function decorateBracketMatch(view: EspnTournamentViewEvent) {
    const isFinal = view.status === 'final';
    const homeId = view.home_team?.id ?? null;
    const awayId = view.away_team?.id ?? null;
    const homeScore = view.scores?.home ?? null;
    const awayScore = view.scores?.away ?? null;
    let winnerId: string | null = null;
    if (isFinal && typeof homeScore === 'number' && typeof awayScore === 'number') {
        if (homeScore > awayScore) winnerId = typeof homeId === 'string' ? homeId : null;
        else if (awayScore > homeScore) winnerId = typeof awayId === 'string' ? awayId : null;
    }
    return {
        ...view,
        result: isFinal ? 'finished' : view.status,
        match_status: isFinal ? 'finished' : view.status,
        winner_id: winnerId,
        score_home: homeScore,
        score_away: awayScore,
        match_start_iso: view.date,
    };
}

// ── Real bracket linkage ─────────────────────────────────────────────────────
// ESPN's scoreboard does not expose which match feeds which, but two signals let
// us reconstruct the true crossings: (1) each event's `matchNumber` (only on the
// core API) gives a stable within-round ordering, and (2) undecided slots are
// labelled "Round of 32 N Winner" / "Quarterfinal N Winner", where N is that
// within-round index. We attach both so the predictor can mirror the real bracket
// instead of pairing matches by adjacency.
type BracketFeederRef = { round_key: string; slot: number };

function parseBracketFeederRef(name: string | null | undefined): BracketFeederRef | null {
    const s = String(name || '').trim().toLowerCase();
    if (!s) return null;
    let m = /round of (\d+)\D+(\d+)\s+winner/.exec(s);
    if (m) return { round_key: `round-of-${m[1]}`, slot: Number(m[2]) };
    m = /quarter[\s-]?final\s+(\d+)\s+winner/.exec(s);
    if (m) return { round_key: 'quarterfinals', slot: Number(m[1]) };
    m = /semi[\s-]?final\s+(\d+)\s+winner/.exec(s);
    if (m) return { round_key: 'semifinals', slot: Number(m[1]) };
    return null;
}

const ESPN_CORE_BASE = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues';
const MATCH_NUMBER_CACHE_TTL = 6 * 60 * 60; // bracket numbering is static within a season

async function fetchEspnEventMatchNumber(leagueSlug: EspnFootballLeagueSlug, eventId: string): Promise<number | null> {
    const url = `${ESPN_CORE_BASE}/${leagueSlug}/events/${eventId}/competitions/${eventId}?lang=en`;
    const data = await fetchEspnJson<Record<string, any>>(url, 'EspnSoccerMatchNumber', MATCH_NUMBER_CACHE_TTL).catch(() => null);
    const n = Number(data?.matchNumber);
    return Number.isFinite(n) ? n : null;
}

async function attachBracketLinkage(
    draw: Array<{ round_id: string; matches: any[] }>,
    leagueSlug: EspnFootballLeagueSlug,
): Promise<void> {
    if (!Array.isArray(draw) || draw.length === 0) return;

    const rawIdOf = (m: any): string | null => parseEspnFootballMatchId(m?.match_id)?.eventId ?? null;
    const rawIds = Array.from(new Set(
        draw.flatMap((r) => (r.matches || []).map(rawIdOf)).filter((x): x is string => Boolean(x)),
    ));
    if (rawIds.length === 0) return;

    const numberEntries = await mapWithConcurrency(
        rawIds,
        12,
        async (rid) => [rid, await fetchEspnEventMatchNumber(leagueSlug, rid)] as const,
    );
    const numberById = new Map<string, number | null>(numberEntries);

    // The within-round slot (1-based, ordered by matchNumber) is exactly the N that
    // ESPN's "Round of X N Winner" references point at.
    for (const round of draw) {
        const ranked = (round.matches || [])
            .map((m) => ({ m, num: numberById.get(rawIdOf(m) ?? '') ?? null }))
            .filter((x): x is { m: any; num: number } => x.num != null)
            .sort((a, b) => a.num - b.num);
        ranked.forEach((x, i) => {
            x.m.round_key = round.round_id;
            x.m.match_number = x.num;
            x.m.slot = i + 1;
        });
    }

    for (const round of draw) {
        for (const m of round.matches || []) {
            m.home_source = parseBracketFeederRef(m.home_team_name);
            m.away_source = parseBracketFeederRef(m.away_team_name);
        }
    }
}

function buildPlayoffBracket(events: EspnScoreboardEvent[], league: EspnFootballLeague, referenceDate: Date = new Date()) {
    const playoffEvents = events.filter((event) => {
        const slug = normalizeString(event?.season?.type?.slug)
            || normalizeString(event?.season?.slug)
            || normalizeString(event?.season?.type?.name);
        return detectPlayoffRoundKey(slug) !== null;
    });
    if (playoffEvents.length === 0) return [];

    // Agrupar por torneo (Apertura/Clausura/etc.) y elegir el más cercano a la fecha actual
    const byStage = new Map<string, EspnScoreboardEvent[]>();
    for (const event of playoffEvents) {
        const stage = detectTournamentStagePrefix(event);
        if (!byStage.has(stage)) byStage.set(stage, []);
        byStage.get(stage)!.push(event);
    }

    const refMs = referenceDate.getTime();
    let bestStage: { key: string; events: EspnScoreboardEvent[]; distance: number } | null = null;
    for (const [key, stageEvents] of byStage.entries()) {
        const timestamps = stageEvents
            .map((e) => parseDate(e?.date)?.getTime() || 0)
            .filter((t) => t > 0);
        if (timestamps.length === 0) continue;
        const minTs = Math.min(...timestamps);
        const maxTs = Math.max(...timestamps);
        // Distancia mínima al rango del torneo: 0 si la fecha está dentro
        const distance = refMs < minTs ? minTs - refMs : refMs > maxTs ? refMs - maxTs : 0;
        if (!bestStage || distance < bestStage.distance) {
            bestStage = { key, events: stageEvents, distance };
        }
    }

    if (!bestStage) return [];

    // Reagrupar los eventos del torneo elegido por ronda
    const grouped = new Map<string, EspnScoreboardEvent[]>();
    for (const event of bestStage.events) {
        const slug = normalizeString(event?.season?.type?.slug)
            || normalizeString(event?.season?.slug)
            || normalizeString(event?.season?.type?.name);
        const roundKey = detectPlayoffRoundKey(slug);
        if (!roundKey) continue;
        if (!grouped.has(roundKey)) grouped.set(roundKey, []);
        grouped.get(roundKey)!.push(event);
    }

    const order = [...PLAYOFF_ROUND_ORDER, ...Array.from(grouped.keys()).filter((k) => !PLAYOFF_ROUND_ORDER.includes(k))];
    const seenOrder = new Set<string>();
    const draw: Array<{ round_id: string; name: string; round_name: string; matches: any[] }> = [];

    for (const key of order) {
        if (seenOrder.has(key)) continue;
        seenOrder.add(key);
        const eventsInRound = grouped.get(key);
        if (!eventsInRound || eventsInRound.length === 0) continue;
        const viewEvents = eventsInRound
            .map((e) => normalizeEspnEventForTournamentViews(e, league))
            .filter(isEspnTournamentViewEvent)
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        if (viewEvents.length === 0) continue;
        const matches = consolidateTwoLegTies(viewEvents);
        const label = PLAYOFF_ROUND_LABELS[key] || key.replace(/-/g, ' ');
        draw.push({ round_id: key, name: label, round_name: label, matches });
    }

    return draw;
}

function buildArchivesFromStandings(standingsPayload: EspnStandingsPayload | null | undefined, leagueSlug: EspnFootballLeagueSlug, routeId: string) {
    const seasons = Array.isArray(standingsPayload?.seasons) ? standingsPayload.seasons : [];
    if (seasons.length === 0) return [];
    return seasons.map((season: any) => {
        const year = typeof season?.year === 'number' ? season.year : null;
        const displayName = season?.displayName || (year ? String(year) : 'Temporada');
        return {
            id: routeId,
            season_id: year ? String(year) : null,
            seasonId: year ? String(year) : null,
            year,
            name: displayName,
            display_name: displayName,
            startDate: season?.startDate || null,
            endDate: season?.endDate || null,
            league: leagueSlug,
        };
    });
}

function seasonDateRange(season: number) {
    const start = new Date(Date.UTC(season, 0, 1));
    const end = new Date(Date.UTC(season, 11, 31));
    return { start, end };
}

async function fetchMatchSummaryForLeague(leagueSlug: EspnFootballLeagueSlug, matchId: string) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/summary?event=${matchId}`;
    return fetchEspnJson<EspnSummaryPayload>(url, 'EspnSoccerSummary', MATCH_CACHE_TTL);
}

async function resolveMatchLeagueAndSummary(matchId: string) {
    const results = await Promise.allSettled(
        SUPPORTED_ESPN_FOOTBALL_LEAGUES.map(async (league) => ({
            league,
            summary: await fetchMatchSummaryForLeague(league.slug, matchId),
        })),
    );

    for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const summary = r.value.summary;
        const headerId = normalizeString(summary?.header?.id);
        if (headerId === matchId) return r.value;
    }
    return null;
}

async function resolveTeamLeague(teamId: string, preferredLeague?: string | null) {
    const preferred = isEspnFootballLeagueSlug(preferredLeague) ? preferredLeague : null;
    const ordered = preferred
        ? [LEAGUES[preferred], ...SUPPORTED_ESPN_FOOTBALL_LEAGUES.filter((l) => l.slug !== preferred)]
        : SUPPORTED_ESPN_FOOTBALL_LEAGUES;

    const results = await Promise.allSettled(
        ordered.map(async (league) => ({
            league,
            details: await fetchEspnJson<Record<string, any>>(
                `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.slug}/teams/${teamId}`,
                'EspnSoccerTeam',
                TEAM_CACHE_TTL,
            ),
        })),
    );

    for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const details = r.value.details;
        if (normalizeString(details?.team?.id) === teamId) return r.value;
    }
    return null;
}

function getEventLeague(event: Record<string, any>, fallback: EspnFootballLeague): EspnFootballLeague {
    const slugFromEvent = normalizeKey(event?.league?.slug);
    if (slugFromEvent && slugFromEvent in LEAGUES) return LEAGUES[slugFromEvent];
    return fallback;
}

function normalizeEspnEventCore(event: Record<string, any>, league: EspnFootballLeague) {
    const { competition, home, away } = getCompetitors(event);
    const statusType = competition?.status?.type || event?.status?.type;
    const status = mapEspnStatus(statusType);
    const kickoff = parseDate(competition?.date || event?.date);
    const homeScore = parseScore(home?.score);
    const awayScore = parseScore(away?.score);
    const eventId = normalizeString(event?.id || competition?.id);
    const venue = normalizeString(competition?.venue?.fullName);

    if (!eventId || !kickoff || !home || !away) return null;

    const homeId = normalizeString(home?.team?.id || home?.id);
    const awayId = normalizeString(away?.team?.id || away?.id);
    const leagueId = toEspnFootballTournamentId(league.slug);
    const leagueLogo = getLeagueLogo(event);
    const roundNumber = typeof event?.week?.number === 'number' ? event.week.number : 1;
    const minute = getMatchMinute(statusType);

    const penaltiesHome = parseScore(home?.shootoutScore);
    const penaltiesAway = parseScore(away?.shootoutScore);

    return {
        id: toEspnFootballMatchId(eventId, league.slug),
        rawId: eventId,
        status,
        kickoff,
        round: roundNumber,
        minute,
        venue,
        season: typeof event?.season?.year === 'number' ? event.season.year : null,
        tournament: {
            id: leagueId,
            rawId: league.slug,
            name: league.shortName,
            fullName: league.name,
            countryName: league.countryName,
            logo: leagueLogo,
            league: league.slug,
            url: league.tournamentUrl,
        },
        home: {
            id: homeId ? toEspnFootballTeamId(homeId, league.slug) : null,
            rawId: homeId,
            name: getEspnTeamDisplayName(home),
            shortName: getEspnTeamAbbreviation(home),
            logo: getEspnLogo(home?.team || home),
            league: league.slug,
        },
        away: {
            id: awayId ? toEspnFootballTeamId(awayId, league.slug) : null,
            rawId: awayId,
            name: getEspnTeamDisplayName(away),
            shortName: getEspnTeamAbbreviation(away),
            logo: getEspnLogo(away?.team || away),
            league: league.slug,
        },
        score: {
            home: homeScore,
            away: awayScore,
            penalties: penaltiesHome != null && penaltiesAway != null
                ? { home: penaltiesHome, away: penaltiesAway }
                : null,
        },
    };
}

function normalizeEspnEventForTournamentViews(event: Record<string, any>, league: EspnFootballLeague) {
    const normalized = normalizeEspnEventCore(event, league);
    if (!normalized) return null;

    return {
        match_id: normalized.id,
        event_key: normalized.id,
        timestamp: Math.floor(normalized.kickoff.getTime() / 1000),
        date: normalized.kickoff.toISOString(),
        match_status: normalized.status,
        event_status: normalized.status,
        status: normalized.status,
        round: normalized.round,
        season: normalized.season,
        tournament_id: normalized.tournament.id,
        tournament_name: normalized.tournament.fullName,
        tournament_name_short: normalized.tournament.name,
        tournament_logo: normalized.tournament.logo,
        country_name: normalized.tournament.countryName,
        sport_id: 'football',
        home_team: {
            id: normalized.home.id,
            team_id: normalized.home.id,
            name: normalized.home.name,
            short_name: normalized.home.shortName,
            logo: normalized.home.logo,
            image_path: normalized.home.logo,
            small_image_path: normalized.home.logo,
            team_url: '',
            league: normalized.home.league,
            provider: 'espn',
            source: 'espn',
        },
        away_team: {
            id: normalized.away.id,
            team_id: normalized.away.id,
            name: normalized.away.name,
            short_name: normalized.away.shortName,
            logo: normalized.away.logo,
            image_path: normalized.away.logo,
            small_image_path: normalized.away.logo,
            team_url: '',
            league: normalized.away.league,
            provider: 'espn',
            source: 'espn',
        },
        home_team_name: normalized.home.name,
        away_team_name: normalized.away.name,
        home_team_logo: normalized.home.logo,
        away_team_logo: normalized.away.logo,
        scores: normalized.score,
        score: normalized.score,
        venue: normalized.venue,
        minute: normalized.minute,
        source: 'espn',
        provider: 'espn',
    };
}

type EspnTournamentViewEvent = NonNullable<ReturnType<typeof normalizeEspnEventForTournamentViews>>;
function isEspnTournamentViewEvent(v: ReturnType<typeof normalizeEspnEventForTournamentViews>): v is EspnTournamentViewEvent {
    return Boolean(v);
}

function buildMatchFromNormalized(n: NonNullable<ReturnType<typeof normalizeEspnEventCore>>): Match {
    return {
        id: n.id,
        tournamentId: n.tournament.id,
        leagueName: n.tournament.fullName,
        countryName: n.tournament.countryName,
        phaseId: 'group',
        round: n.round,
        homeTeamId: n.home.id || `${ESPN_SOCCER_TEAM_PREFIX}${n.tournament.league}-home`,
        homeTeamName: n.home.name,
        awayTeamId: n.away.id || `${ESPN_SOCCER_TEAM_PREFIX}${n.tournament.league}-away`,
        awayTeamName: n.away.name,
        homeTeamLogo: n.home.logo,
        awayTeamLogo: n.away.logo,
        homeTeamImagePath: n.home.logo,
        awayTeamImagePath: n.away.logo,
        scheduledAt: n.kickoff,
        venueName: n.venue || undefined,
        status: n.status,
        score: n.score,
        currentMinute: n.minute,
        result: {
            isComplete: n.status === 'final',
            updatedAt: new Date(),
            updatedBy: 'espn',
            version: 1,
        },
        createdFrom: 'generator',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

export async function getEspnFootballMatches(
    date: Date,
    _options?: { timeZone?: string; targetDateKey?: string },
): Promise<Match[]> {
    const target = toDateOnly(date);
    const perLeague = await mapWithConcurrency(
        SUPPORTED_ESPN_FOOTBALL_LEAGUES,
        ESPN_FETCH_CONCURRENCY,
        async (league) => {
            try {
                const payload = await fetchScoreboardForDate(league.slug, target);
                const events = Array.isArray(payload?.events) ? payload.events : [];
                return events
                    .map((event) => normalizeEspnEventCore(event, getEventLeague(event, league)))
                    .filter((e): e is NonNullable<ReturnType<typeof normalizeEspnEventCore>> => Boolean(e))
                    .map(buildMatchFromNormalized);
            } catch {
                return [] as Match[];
            }
        },
    );

    const merged = new Map<string, Match>();
    for (const arr of perLeague) {
        for (const m of arr) {
            if (!merged.has(m.id)) merged.set(m.id, m);
        }
    }
    return Array.from(merged.values());
}

export async function getEspnFootballLiveMatches(): Promise<Match[]> {
    const today = toDateOnly(new Date());
    const matches = await getEspnFootballMatches(today);
    return matches.filter((m) => m.status === 'live');
}

export async function getEspnFootballLeagueResults(leagueSlug: EspnFootballLeagueSlug, page: number = 1, season?: number) {
    const today = toDateOnly(new Date());
    const range = season ? seasonDateRange(season) : { start: addDays(today, -TEAM_SCHEDULE_RANGE_DAYS), end: today };
    const events = await fetchScoreboardRangeEvents(leagueSlug, range.start, range.end);
    const normalized = events
        .map((e) => normalizeEspnEventForTournamentViews(e, LEAGUES[leagueSlug]))
        .filter(isEspnTournamentViewEvent)
        .filter((e) => e.status === 'final')
        .sort((l, r) => (r.timestamp || 0) - (l.timestamp || 0));

    const pageSize = 20;
    const start = (Math.max(1, page) - 1) * pageSize;
    return {
        matches: normalized.slice(start, start + pageSize),
        hasMore: start + pageSize < normalized.length,
        total: normalized.length,
    };
}

export async function getEspnFootballLeagueFixtures(leagueSlug: EspnFootballLeagueSlug, page: number = 1, season?: number) {
    const today = toDateOnly(new Date());
    const range = season ? seasonDateRange(season) : { start: addDays(today, -7), end: addDays(today, TEAM_SCHEDULE_RANGE_DAYS) };
    const events = await fetchScoreboardRangeEvents(leagueSlug, range.start, range.end);
    const normalized = events
        .map((e) => normalizeEspnEventForTournamentViews(e, LEAGUES[leagueSlug]))
        .filter(isEspnTournamentViewEvent)
        .filter((e) => e.status !== 'final')
        .sort((l, r) => (l.timestamp || 0) - (r.timestamp || 0));

    const pageSize = 20;
    const start = (Math.max(1, page) - 1) * pageSize;
    return {
        matches: normalized.slice(start, start + pageSize),
        hasMore: start + pageSize < normalized.length,
        total: normalized.length,
    };
}

async function fetchSeasonEvents(leagueSlug: EspnFootballLeagueSlug, season?: number) {
    const today = toDateOnly(new Date());
    const range = season ? seasonDateRange(season) : { start: addDays(today, -TEAM_SCHEDULE_RANGE_DAYS), end: addDays(today, TEAM_SCHEDULE_RANGE_DAYS) };
    return fetchScoreboardRangeEvents(leagueSlug, range.start, range.end);
}

/**
 * Conjunto completo de partidos (fixtures futuros + resultados ya jugados) de
 * una liga ESPN, normalizado para vistas de torneo. A diferencia de
 * getEspnFootballLeague{Fixtures,Results}, NO pagina a 20: devuelve todos los
 * eventos de la ventana, ordenados por fecha ascendente. Pensado para que el
 * Prode arme su lista de eventos desde la misma fuente que usa la web.
 */
export async function getEspnFootballProdeEvents(
    leagueSlug: EspnFootballLeagueSlug,
    season?: number,
): Promise<EspnTournamentViewEvent[]> {
    const events = await fetchSeasonEvents(leagueSlug, season);
    return events
        .map((event) => normalizeEspnEventForTournamentViews(event, LEAGUES[leagueSlug]))
        .filter(isEspnTournamentViewEvent)
        .sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
}

function extractStandingNotes(entry: any): Array<{ description: string; color: string; rank?: number }> {
    const out: Array<{ description: string; color: string; rank?: number }> = [];
    const seen = new Set<string>();
    const candidates = [entry?.note, ...(Array.isArray(entry?.notes) ? entry.notes : [])];
    for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'object') continue;
        const description = normalizeString(candidate?.description) || normalizeString(candidate?.text) || '';
        const colorRaw = normalizeString(candidate?.color) || '';
        if (!description || !colorRaw) continue;
        const color = colorRaw.startsWith('#') ? colorRaw : `#${colorRaw.replace(/^#/, '')}`;
        const rank = typeof candidate?.rank === 'number' ? candidate.rank : undefined;
        const key = `${description.toLowerCase()}::${color.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ description, color, rank });
    }
    return out;
}

function normalizeStandingsRows(payload: EspnStandingsPayload | null | undefined, leagueSlug: EspnFootballLeagueSlug) {
    const entries = getLeagueStandingEntries(payload);
    const intermediate = entries.map((entry: any, entryIndex: number) => {
        const teamId = normalizeString(entry?.team?.id);
        const stats = Array.isArray(entry?.stats) ? entry.stats : [];
        const played = getStatValue(stats, ['gamesplayed', 'played']) ?? 0;
        const wins = getStatValue(stats, ['wins']) ?? 0;
        const draws = getStatValue(stats, ['ties', 'draws']) ?? 0;
        const losses = getStatValue(stats, ['losses']) ?? 0;
        const goalsFor = getStatValue(stats, ['pointsfor', 'goalsfor']) ?? 0;
        const goalsAgainst = getStatValue(stats, ['pointsagainst', 'goalsagainst']) ?? 0;
        const goalDiff = getStatValue(stats, ['pointdifferential', 'goaldifference']) ?? goalsFor - goalsAgainst;
        const points = getStatValue(stats, ['points']) ?? (wins * 3 + draws);
        const groupName = normalizeString(entry?._groupName) || '';
        const espnRank = getStatValue(stats, ['rank', 'playoffseed']) ?? entryIndex + 1;
        const notes = extractStandingNotes(entry);

        return {
            espnRank,
            entryIndex,
            team_name: entry?.team?.displayName || entry?.team?.shortDisplayName || entry?.team?.name || 'Equipo',
            team_id: teamId ? toEspnFootballTeamId(teamId, leagueSlug) : null,
            team_logo: getEspnLogo(entry?.team),
            team_url: '',
            played,
            won: wins,
            drawn: draws,
            lost: losses,
            points,
            scored: goalsFor,
            conceded: goalsAgainst,
            goal_difference: goalDiff,
            notes,
            groupName,
        };
    });

    intermediate.sort((a, b) => {
        const groupCompare = a.groupName.localeCompare(b.groupName);
        if (groupCompare !== 0) return groupCompare;
        if (a.espnRank !== b.espnRank) return a.espnRank - b.espnRank;
        return a.entryIndex - b.entryIndex;
    });

    const positionByGroup = new Map<string, number>();
    return intermediate.map((row) => {
        const nextPosition = (positionByGroup.get(row.groupName) ?? 0) + 1;
        positionByGroup.set(row.groupName, nextPosition);
        const { espnRank: _e, entryIndex: _i, groupName, ...rest } = row;
        return {
            position: nextPosition,
            ...rest,
            ...(groupName ? { group_name: groupName } : {}),
        };
    });
}

// Distinct fallback palette so visually-identical ESPN colors (e.g. multiple
// shades of green for "Advance to Round of 32" and "Best 8 Advance") become
// readable in the legend.
const STANDINGS_LABEL_FALLBACK_PALETTE = [
    '#16a34a', // emerald
    '#f97316', // orange
    '#3b82f6', // blue
    '#a855f7', // violet
    '#06b6d4', // cyan
    '#facc15', // yellow
    '#ec4899', // pink
];

// Curated colors per qualification category so visually-similar ESPN greens
// (Advance vs Best Advance) become reliably distinguishable.
const STANDINGS_LABEL_CATEGORY_COLORS: Record<string, string> = {
    'eliminated': '#dc2626',     // red
    'relegation': '#dc2626',     // red
    'relegation-playoff': '#f97316', // orange
    'top-cup': '#16a34a',        // green
    'second-cup': '#f97316',     // orange
    'third-cup': '#06b6d4',      // cyan
    'best-loser': '#3b82f6',     // blue — distinct from red (eliminated) and green (advance)
    'advance': '#16a34a',        // green
    'qualified-host': '#a855f7', // violet
};

function categorizeLabelDescription(description: string): string {
    const lower = description.toLowerCase();
    if (lower.includes('eliminat')) return 'eliminated';
    if (lower.includes('relegation playoff') || lower.includes('relegation play-off')) return 'relegation-playoff';
    if (lower.includes('relegat')) return 'relegation';
    if (lower.includes('champions league') || lower.includes('libertadores')) return 'top-cup';
    if (lower.includes('europa') || lower.includes('sudamericana')) return 'second-cup';
    if (lower.includes('conference')) return 'third-cup';
    if (lower.includes('best') && lower.includes('advance')) return 'best-loser';
    if (lower.includes('host')) return 'qualified-host';
    if (lower.includes('advance') || lower.includes('qualif')) return 'advance';
    return `desc:${lower}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
    const clean = hex.replace(/^#/, '').trim();
    if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
    }
    return { h, s, l };
}

function colorsArePerceptuallySimilar(a: string, b: string): boolean {
    const hslA = hexToHsl(a);
    const hslB = hexToHsl(b);
    if (!hslA || !hslB) return a.toLowerCase() === b.toLowerCase();
    let hueDiff = Math.abs(hslA.h - hslB.h);
    if (hueDiff > 180) hueDiff = 360 - hueDiff;
    return hueDiff < 35 && Math.abs(hslA.s - hslB.s) < 0.4 && Math.abs(hslA.l - hslB.l) < 0.25;
}

function disambiguateLabelColors(
    rawLabels: Array<{ id: string; name: string; color: string; scope: 'standings' }>,
) {
    if (rawLabels.length <= 1) return;
    const usedColors: string[] = [rawLabels[0].color];
    let paletteCursor = 0;

    for (let i = 1; i < rawLabels.length; i++) {
        const current = rawLabels[i];
        const collides = usedColors.some((existing) => colorsArePerceptuallySimilar(existing, current.color));
        if (!collides) {
            usedColors.push(current.color);
            continue;
        }
        // Find a palette color that is not perceptually similar to anything used.
        let candidate: string | null = null;
        for (let attempts = 0; attempts < STANDINGS_LABEL_FALLBACK_PALETTE.length; attempts++) {
            const next = STANDINGS_LABEL_FALLBACK_PALETTE[paletteCursor % STANDINGS_LABEL_FALLBACK_PALETTE.length];
            paletteCursor++;
            if (!usedColors.some((existing) => colorsArePerceptuallySimilar(existing, next))) {
                candidate = next;
                break;
            }
        }
        if (candidate) {
            current.color = candidate;
            usedColors.push(candidate);
        } else {
            usedColors.push(current.color);
        }
    }
}

function buildTeamLabelsFromStandings(rows: ReturnType<typeof normalizeStandingsRows>) {
    const labelByKey = new Map<string, { id: string; name: string; color: string; scope: 'standings' }>();
    const assignments: Array<{
        id: string;
        label_id: string;
        position: number;
        tournament_id: null;
        phase_id: null;
        group_id: null;
        created_at: null;
        label: { id: string; name: string; color: string; scope: 'standings' };
    }> = [];

    for (const row of rows) {
        const position = typeof row.position === 'number' ? row.position : Number(row.position);
        if (!Number.isFinite(position) || position <= 0) continue;
        const notes = (row as any).notes as Array<{ description: string; color: string }> | undefined;
        if (!notes?.length) continue;
        for (const note of notes) {
            const category = categorizeLabelDescription(note.description);
            const key = `${category}::${note.description.toLowerCase()}`;
            let label = labelByKey.get(key);
            if (!label) {
                // Prefer the curated category color (so ADVANCE and BEST ADVANCE
                // never collide visually). Fall back to whatever ESPN sent.
                const categoryColor = STANDINGS_LABEL_CATEGORY_COLORS[category];
                label = {
                    id: `espn-label-${labelByKey.size + 1}`,
                    name: note.description,
                    color: categoryColor || note.color,
                    scope: 'standings',
                };
                labelByKey.set(key, label);
            }
            assignments.push({
                id: `${label.id}-pos-${position}`,
                label_id: label.id,
                position,
                tournament_id: null,
                phase_id: null,
                group_id: null,
                created_at: null,
                label,
            });
        }
    }

    disambiguateLabelColors(Array.from(labelByKey.values()));

    return assignments;
}

function enrichStandingsForUi(rows: ReturnType<typeof normalizeStandingsRows>, leagueSlug: EspnFootballLeagueSlug) {
    return rows.map((row) => ({
        rank: row.position,
        position: row.position,
        name: row.team_name,
        team_id: row.team_id,
        team_name: row.team_name,
        team_url: row.team_url,
        team_logo: row.team_logo,
        logo: row.team_logo || '',
        team: {
            id: row.team_id,
            team_id: row.team_id,
            name: row.team_name,
            logo: row.team_logo || '',
            image_path: row.team_logo || '',
            small_image_path: row.team_logo || '',
            team_url: '',
            league: leagueSlug,
            provider: 'espn',
            source: 'espn',
        },
        participant: {
            id: row.team_id,
            name: row.team_name,
            logo: row.team_logo || '',
            image_path: row.team_logo || '',
            small_image_path: row.team_logo || '',
            team_url: '',
            league: leagueSlug,
            provider: 'espn',
            source: 'espn',
        },
        matches_played: row.played,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        points: row.points,
        goal_difference: row.goal_difference,
        scored: row.scored,
        conceded: row.conceded,
        provider: 'espn',
        source: 'espn',
        ...(row.group_name ? { group_name: row.group_name } : {}),
    }));
}

export async function getEspnFootballLeagueStandings(leagueSlug: EspnFootballLeagueSlug) {
    const raw = await fetchLeagueStandingsRaw(leagueSlug);
    const rows = normalizeStandingsRows(raw, leagueSlug);
    return { raw, rows, enrichedRows: enrichStandingsForUi(rows, leagueSlug) };
}

async function fetchEspnLeagueLogo(leagueSlug: EspnFootballLeagueSlug): Promise<string> {
    // The league crest lives in the scoreboard payload's `leagues[]`, which the
    // range fetch discards. One light call (cached) gives us the real logo instead
    // of guessing a `leagues/500/<slug>.png` URL that 404s for some competitions
    // (e.g. fifa.world, whose real crest is .../leaguelogos/soccer/500/4.png).
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/scoreboard?limit=1`;
    const payload = await fetchEspnJson<Record<string, any>>(url, 'EspnSoccerLeagueLogo', STANDINGS_CACHE_TTL).catch(() => null);
    return getLeagueLogo(payload) || '';
}

function buildTournamentDetails(league: EspnFootballLeague, standingsPayload: EspnStandingsPayload | null | undefined) {
    const season = getLeagueSeason(standingsPayload);
    return {
        id: toEspnFootballTournamentId(league.slug),
        tournament_id: toEspnFootballTournamentId(league.slug),
        tournament_stage_id: toEspnFootballTournamentId(league.slug),
        tournament_template_id: toEspnFootballTournamentId(league.slug),
        season_id: season,
        name: league.shortName,
        full_name: league.name,
        country: { name: league.countryName },
        sport: { sport_id: 'football', name: 'Football' },
        logo: getLeagueLogo(standingsPayload),
        url: league.tournamentUrl,
        source: 'espn',
        provider: 'espn',
    };
}

function sortRowsByPosition(rows: any[]): any[] {
    return [...rows].sort((a, b) => {
        const posA = Number(a?.position ?? a?.rank ?? Number.POSITIVE_INFINITY);
        const posB = Number(b?.position ?? b?.rank ?? Number.POSITIVE_INFINITY);
        if (Number.isFinite(posA) && Number.isFinite(posB) && posA !== posB) return posA - posB;
        return 0;
    });
}

function groupStandingsByGroup(rows: any[]): any[] {
    const groupNames = Array.from(new Set(
        rows.map((r) => r.group_name).filter((v) => typeof v === 'string' && v.length > 0),
    )) as string[];

    if (groupNames.length === 0) return sortRowsByPosition(rows);

    return groupNames.map((name) => ({
        group_name: name,
        name,
        rows: sortRowsByPosition(rows.filter((r) => r.group_name === name))
            .map((r, idx) => ({ ...r, rank: r.position ?? r.rank ?? idx + 1 })),
    }));
}

export async function getEspnFootballTournamentBundle(
    leagueSlug: EspnFootballLeagueSlug,
    options?: { season?: number; routeId?: string },
) {
    const season = options?.season;
    const routeId = options?.routeId || toEspnFootballTournamentId(leagueSlug);
    const league = LEAGUES[leagueSlug];

    const [seasonEvents, standingsRaw, leadersRaw] = await Promise.all([
        fetchSeasonEvents(leagueSlug, season),
        fetchLeagueStandingsRaw(leagueSlug, season),
        fetchLeagueLeadersRaw(leagueSlug, season),
    ]);

    const normalizedSeasonEvents = seasonEvents
        .map((e) => ({ raw: e, view: normalizeEspnEventForTournamentViews(e, league) }))
        .filter((entry): entry is { raw: EspnScoreboardEvent; view: EspnTournamentViewEvent } => Boolean(entry.view));

    const results = normalizedSeasonEvents
        .filter((entry) => entry.view.status === 'final')
        .map((entry) => entry.view)
        .sort((l, r) => (r.timestamp || 0) - (l.timestamp || 0));

    const fixtures = normalizedSeasonEvents
        .filter((entry) => entry.view.status !== 'final')
        .map((entry) => entry.view)
        .sort((l, r) => (l.timestamp || 0) - (r.timestamp || 0));

    const standingsRows = sortRowsByPosition(normalizeStandingsRows(standingsRaw, leagueSlug));
    const enrichedStandings = sortRowsByPosition(enrichStandingsForUi(standingsRows, leagueSlug));
    const standingsForTournament = groupStandingsByGroup(enrichedStandings);
    const teamLabels = buildTeamLabelsFromStandings(standingsRows);
    const topScorers = buildTopScorersFromLeaders(leadersRaw, leagueSlug);

    const details = buildTournamentDetails(league, standingsRaw);
    if (!details.logo) {
        for (const event of seasonEvents) {
            const eventLeagueLogo = getEspnLogo(event?.league);
            if (eventLeagueLogo) {
                details.logo = eventLeagueLogo;
                break;
            }
        }
    }
    if (!details.logo) {
        details.logo = await fetchEspnLeagueLogo(leagueSlug);
    }
    if (!details.logo) {
        details.logo = `https://a.espncdn.com/i/teamlogos/leagues/500/${leagueSlug}.png`;
    }
    const seasonIdFromPayload = getLeagueSeason(standingsRaw);
    const archives = buildArchivesFromStandings(standingsRaw, leagueSlug, routeId);
    // Si el usuario eligió una temporada explícita, usamos el medio del año como referencia;
    // si no, usamos "hoy" para que el bracket cargado sea el del torneo en curso o más cercano.
    const referenceDate = season ? new Date(Date.UTC(season, 5, 30)) : new Date();
    const draw = buildPlayoffBracket(seasonEvents, league, referenceDate);
    // Best-effort: attach the real bracket linkage (matchNumber + feeder refs) so the
    // predictor reproduces the actual crossings. If ESPN's core API is unavailable the
    // draw still renders; the predictor just falls back to adjacency pairing.
    try {
        await attachBracketLinkage(draw, leagueSlug);
    } catch {
        /* linkage is optional */
    }

    return {
        ids: {
            tournamentId: toEspnFootballTournamentId(leagueSlug),
            stageId: toEspnFootballTournamentId(leagueSlug),
            templateId: toEspnFootballTournamentId(leagueSlug),
            seasonId: season || seasonIdFromPayload,
        },
        details,
        results,
        fixtures,
        standings: standingsForTournament,
        standingsFlat: enrichedStandings,
        standingsForm: [],
        standingsHtFt: [],
        standingsOverUnder: [],
        teamLabels,
        topScorers,
        draw,
        archives,
    };
}

function parseMinuteSeconds(displayClock: unknown): number {
    const raw = normalizeString(displayClock);
    if (!raw) return 0;
    const match = /^(\d+)/.exec(raw);
    return match ? Number(match[1]) : 0;
}

function buildEventDetailsFromSummary(summary: EspnSummaryPayload) {
    const rosters = Array.isArray(summary?.rosters) ? summary.rosters : [];
    if (rosters.length === 0) {
        const scoringPlays = Array.isArray(summary?.scoringPlays) ? summary.scoringPlays : [];
        return scoringPlays.map((play: any) => ({
            type: play?.type?.text || 'goal',
            minute: play?.clock?.displayValue || '',
            team: play?.team?.id || null,
            scorer: play?.athletesInvolved?.[0]?.displayName || play?.text || '',
            assist: play?.athletesInvolved?.[1]?.displayName || '',
            text: play?.text || '',
        }));
    }

    type TimelineEvent = {
        type: string;
        team: 'home' | 'away';
        player: string;
        playerId: string | null;
        description: string;
        minute: string;
        time: string;
        minuteNumber: number;
        period: number;
        order: number;
    };
    const events: TimelineEvent[] = [];
    let counter = 0;

    for (const roster of rosters) {
        const teamSide: 'home' | 'away' = roster?.homeAway === 'away' ? 'away' : 'home';
        const players = Array.isArray(roster?.roster) ? roster.roster : [];
        for (const player of players) {
            const plays = Array.isArray(player?.plays) ? player.plays : [];
            const playerName = player?.athlete?.displayName || player?.athlete?.fullName || '';
            const playerId = player?.athlete?.id ? String(player.athlete.id) : null;
            for (const play of plays) {
                const isGoal = play?.scoringPlay === true || play?.didScore === true;
                const isOwn = play?.ownGoal === true;
                const isPenalty = play?.penaltyKick === true;
                const isAssist = play?.didAssist === true;
                const minute = normalizeString(play?.clock?.displayValue) || normalizeString(play?.clock) || '';
                const minuteNumber = parseMinuteSeconds(play?.clock?.displayValue || play?.clock);
                const period = minuteNumber > 45 ? 2 : 1;

                if (isGoal && !isAssist) {
                    const type = isOwn ? 'own_goal' : isPenalty ? 'penalty_goal' : 'goal';
                    events.push({
                        type,
                        team: isOwn ? (teamSide === 'home' ? 'away' : 'home') : teamSide,
                        player: playerName,
                        playerId,
                        description: normalizeString(play?.text) || (isOwn ? 'Gol en contra' : isPenalty ? 'Gol de penal' : 'Gol'),
                        minute,
                        time: String(minuteNumber || ''),
                        minuteNumber,
                        period,
                        order: counter++,
                    });
                }

                const yc = Number(play?.yellowCards ?? 0);
                const rc = Number(play?.redCards ?? 0);
                if (yc > 0) {
                    events.push({
                        type: 'yellow_card',
                        team: teamSide,
                        player: playerName,
                        playerId,
                        description: 'Tarjeta amarilla',
                        minute,
                        time: String(minuteNumber || ''),
                        minuteNumber,
                        period,
                        order: counter++,
                    });
                }
                if (rc > 0) {
                    events.push({
                        type: 'red_card',
                        team: teamSide,
                        player: playerName,
                        playerId,
                        description: 'Tarjeta roja',
                        minute,
                        time: String(minuteNumber || ''),
                        minuteNumber,
                        period,
                        order: counter++,
                    });
                }
            }
        }
    }

    return events.sort((a, b) => a.minuteNumber - b.minuteNumber || a.order - b.order);
}

function mapRosterPlayer(p: any) {
    return {
        id: p?.athlete?.id ? String(p.athlete.id) : null,
        name: p?.athlete?.displayName || p?.athlete?.fullName || '',
        number: Number(p?.jersey) || null,
        position: p?.position?.abbreviation || p?.position?.name || '',
        role: p?.starter ? 'starter' : 'substitute',
        rating: null,
        isCaptain: Boolean(p?.captain),
    };
}

function buildLineupsFromSummary(summary: EspnSummaryPayload, leagueSlug: EspnFootballLeagueSlug) {
    const rosters = Array.isArray(summary?.rosters) ? summary.rosters : [];
    if (rosters.length === 0) return null;

    const homeRoster = rosters.find((r: any) => r?.homeAway === 'home') || rosters[0];
    const awayRoster = rosters.find((r: any) => r?.homeAway === 'away') || rosters[1];

    const homePlayers = Array.isArray(homeRoster?.roster) ? homeRoster.roster : [];
    const awayPlayers = Array.isArray(awayRoster?.roster) ? awayRoster.roster : [];

    const homeStarting = homePlayers.filter((p: any) => p?.starter).map(mapRosterPlayer).filter((p: any) => p.name);
    const homeSubs = homePlayers.filter((p: any) => !p?.starter).map(mapRosterPlayer).filter((p: any) => p.name);
    const awayStarting = awayPlayers.filter((p: any) => p?.starter).map(mapRosterPlayer).filter((p: any) => p.name);
    const awaySubs = awayPlayers.filter((p: any) => !p?.starter).map(mapRosterPlayer).filter((p: any) => p.name);

    if (homeStarting.length === 0 && awayStarting.length === 0) return null;

    return {
        HOME_STARTING_LINEUPS: homeStarting,
        AWAY_STARTING_LINEUPS: awayStarting,
        HOME_SUBSTITUTES: homeSubs,
        AWAY_SUBSTITUTES: awaySubs,
        home_team: {
            team_id: homeRoster?.team?.id ? toEspnFootballTeamId(homeRoster.team.id, leagueSlug) : null,
            name: homeRoster?.team?.displayName || homeRoster?.team?.name || '',
            formation: homeRoster?.formation || '',
            starting_lineups: homeStarting,
            substitutes: homeSubs,
        },
        away_team: {
            team_id: awayRoster?.team?.id ? toEspnFootballTeamId(awayRoster.team.id, leagueSlug) : null,
            name: awayRoster?.team?.displayName || awayRoster?.team?.name || '',
            formation: awayRoster?.formation || '',
            starting_lineups: awayStarting,
            substitutes: awaySubs,
        },
    };
}

async function buildRecentH2H(
    leagueSlug: EspnFootballLeagueSlug,
    matchId: string,
    homeTeamId: string | null,
    awayTeamId: string | null,
) {
    if (!homeTeamId || !awayTeamId) return [];

    const [homeSched, awaySched] = await Promise.allSettled([
        fetchEspnJson<Record<string, any>>(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/teams/${homeTeamId}/schedule`,
            'EspnSoccerTeamSchedule',
            TEAM_CACHE_TTL,
        ),
        fetchEspnJson<Record<string, any>>(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/teams/${awayTeamId}/schedule`,
            'EspnSoccerTeamSchedule',
            TEAM_CACHE_TTL,
        ),
    ]);

    const eventsById = new Map<string, Record<string, any>>();
    for (const result of [homeSched, awaySched]) {
        if (result.status !== 'fulfilled') continue;
        const events = Array.isArray(result.value?.events) ? result.value.events : [];
        for (const event of events) {
            const id = normalizeString(event?.id);
            if (id && id !== matchId) eventsById.set(id, event);
        }
    }

    return Array.from(eventsById.values())
        .map((e) => normalizeEspnEventForTournamentViews(e, LEAGUES[leagueSlug]))
        .filter(isEspnTournamentViewEvent)
        .sort((l, r) => (r.timestamp || 0) - (l.timestamp || 0));
}

function findEventInScoreboard(events: EspnScoreboardEvent[], eventId: string) {
    return events.find((e) => normalizeString(e?.id) === eventId) || null;
}

async function findEspnSoccerEvent(leagueSlug: EspnFootballLeagueSlug, eventId: string) {
    // Single parallel scan over a wide window. The chunk fetches inside
    // fetchScoreboardRangeEvents now run with concurrency, so doing one wide
    // scan is faster than the old "close then wider" sequential fallback.
    const today = toDateOnly(new Date());
    const events = await fetchScoreboardRangeEvents(leagueSlug, addDays(today, -200), addDays(today, 90));
    return findEventInScoreboard(events, eventId);
}

function buildH2HFromSummary(summary: EspnSummaryPayload, leagueSlug: EspnFootballLeagueSlug) {
    const games = Array.isArray(summary?.headToHeadGames) ? summary.headToHeadGames : [];
    return games.map((game: any) => {
        const date = parseDate(game?.gameDate);
        const homeScore = parseScore(game?.homeTeamScore);
        const awayScore = parseScore(game?.awayTeamScore);
        return {
            match_id: normalizeString(game?.id) || '',
            event_key: normalizeString(game?.id) || '',
            timestamp: date ? Math.floor(date.getTime() / 1000) : 0,
            date: date ? date.toISOString() : '',
            match_status: 'final',
            status: 'final',
            tournament_name: normalizeString(game?.competitionName) || '',
            tournament_name_short: normalizeString(game?.competitionName) || '',
            round: normalizeString(game?.roundName) || '',
            home_team: {
                id: game?.homeTeamId ? toEspnFootballTeamId(game.homeTeamId, leagueSlug) : null,
                name: game?.homeTeam?.displayName || game?.homeTeam || '',
                logo: game?.homeTeam?.logo || '',
            },
            away_team: {
                id: game?.awayTeamId ? toEspnFootballTeamId(game.awayTeamId, leagueSlug) : null,
                name: game?.awayTeam?.displayName || game?.awayTeam || '',
                logo: game?.awayTeam?.logo || '',
            },
            scores: { home: homeScore, away: awayScore },
            score: { home: homeScore, away: awayScore },
            home_team_name: game?.homeTeam?.displayName || game?.homeTeam || '',
            away_team_name: game?.awayTeam?.displayName || game?.awayTeam || '',
            provider: 'espn',
            source: 'espn',
        };
    });
}

const SOCCER_STAT_LABELS_ES: Record<string, string> = {
    possessionpct: 'Posesión (%)',
    totalshots: 'Tiros totales',
    shotsontarget: 'Tiros al arco',
    shotpct: 'Precisión de tiros (%)',
    blockedshots: 'Tiros bloqueados',
    accuratepasses: 'Pases precisos',
    totalpasses: 'Pases totales',
    passpct: 'Precisión de pases (%)',
    accuratecrosses: 'Centros precisos',
    totalcrosses: 'Centros totales',
    woncorners: 'Tiros de esquina',
    offsides: 'Offsides',
    foulscommitted: 'Faltas',
    yellowcards: 'Tarjetas amarillas',
    redcards: 'Tarjetas rojas',
    saves: 'Atajadas',
    effectivetackles: 'Entradas',
    interceptions: 'Intercepciones',
    penaltykickgoals: 'Goles de penal',
};

const SOCCER_STAT_ORDER = [
    'possessionpct',
    'totalshots',
    'shotsontarget',
    'shotpct',
    'totalpasses',
    'passpct',
    'woncorners',
    'foulscommitted',
    'yellowcards',
    'redcards',
    'offsides',
    'saves',
    'effectivetackles',
    'interceptions',
];

function buildTeamStatsFromSummary(summary: EspnSummaryPayload) {
    const teams = Array.isArray(summary?.boxscore?.teams) ? summary.boxscore.teams : [];
    if (teams.length < 2) return [];

    const home = teams.find((t: any) => t?.homeAway === 'home') || teams[0];
    const away = teams.find((t: any) => t?.homeAway === 'away') || teams[1];
    const homeStats = Array.isArray(home?.statistics) ? home.statistics : [];
    const awayStats = Array.isArray(away?.statistics) ? away.statistics : [];

    const statMap = new Map<string, { key: string; label: string; home: any; away: any }>();
    const ingest = (stat: any, side: 'home' | 'away') => {
        const key = normalizeKey(stat?.name) || normalizeKey(stat?.abbreviation);
        if (!key) return;
        const existing = statMap.get(key) || {
            key,
            label: SOCCER_STAT_LABELS_ES[key] || stat?.label || stat?.name || key,
            home: '',
            away: '',
        };
        existing[side] = stat?.displayValue ?? stat?.value ?? '';
        statMap.set(key, existing);
    };
    for (const stat of homeStats) ingest(stat, 'home');
    for (const stat of awayStats) ingest(stat, 'away');

    const orderedKeys = [...SOCCER_STAT_ORDER, ...Array.from(statMap.keys()).filter((k) => !SOCCER_STAT_ORDER.includes(k))];

    return orderedKeys
        .map((key) => statMap.get(key))
        .filter((entry): entry is { key: string; label: string; home: any; away: any } => Boolean(entry))
        .map((entry) => ({
            type: entry.label,
            label: entry.label,
            home: String(entry.home),
            away: String(entry.away),
            home_value: entry.home,
            away_value: entry.away,
        }));
}

// ESPN's `summary?event={id}` endpoint returns the full event under
// `header.competitions[0]` with the same shape as a scoreboard event. Using
// this as the primary lookup makes the match bundle O(1) HTTP calls instead
// of needing to scan ~20+ scoreboard chunks. The scoreboard scan only fires
// as a last resort.
function extractEventFromSummary(summary: EspnSummaryPayload | null): EspnScoreboardEvent | null {
    const header = isRecord(summary?.header) ? summary.header : null;
    if (!header) return null;
    const competitions = Array.isArray(header.competitions) ? header.competitions : [];
    if (competitions.length === 0) return null;
    return {
        id: normalizeString(header.id) || normalizeString(competitions[0]?.id) || '',
        date: normalizeString(competitions[0]?.date) || normalizeString(header.date),
        name: normalizeString(header.name) || '',
        shortName: normalizeString(header.shortName) || '',
        season: header.season,
        competitions,
        links: header.links,
        league: header.league,
    } as EspnScoreboardEvent;
}

export async function getEspnFootballMatchBundle(eventId: string, leagueHint?: EspnFootballLeagueSlug | null) {
    let league: EspnFootballLeague | null = null;
    let scoreboardEvent: EspnScoreboardEvent | null = null;
    let summary: EspnSummaryPayload | null = null;

    if (leagueHint && isEspnFootballLeagueSlug(leagueHint)) {
        const candidate = LEAGUES[leagueHint];
        const summaryPayload = await fetchMatchSummaryForLeague(candidate.slug, eventId);
        const summaryEvent = extractEventFromSummary(summaryPayload);
        if (summaryEvent) {
            league = candidate;
            scoreboardEvent = summaryEvent;
            summary = summaryPayload;
        }
    }

    if (!league || !scoreboardEvent) {
        // Fan out by summary endpoint (one HTTP call per league) instead of by
        // scoreboard scan (many HTTP calls per league). 70 parallel summary
        // fetches finish in ~1s; the old scoreboard fan-out took ~20s+.
        const fanoutResults = await Promise.allSettled(
            SUPPORTED_ESPN_FOOTBALL_LEAGUES.map(async (candidate) => {
                const summaryPayload = await fetchMatchSummaryForLeague(candidate.slug, eventId);
                const event = extractEventFromSummary(summaryPayload);
                if (!event) throw new Error('not found');
                return { candidate, event, summary: summaryPayload };
            }),
        );
        for (const r of fanoutResults) {
            if (r.status === 'fulfilled') {
                league = r.value.candidate;
                scoreboardEvent = r.value.event;
                summary = r.value.summary;
                break;
            }
        }
        if (!league || !scoreboardEvent) return null;
    }

    const normalized = normalizeEspnEventCore(scoreboardEvent, league);
    if (!normalized) return null;

    const homeRawId = normalized.home.rawId;
    const awayRawId = normalized.away.rawId;

    const [standingsRaw, formMatches] = await Promise.all([
        summary?.standings
            ? Promise.resolve(summary.standings)
            : fetchLeagueStandingsRaw(league.slug).catch(() => null),
        buildRecentH2H(league.slug, eventId, homeRawId, awayRawId).catch(() => []),
    ]);

    const standings = enrichStandingsForUi(normalizeStandingsRows(standingsRaw, league.slug), league.slug);
    const directH2H = summary?.headToHeadGames ? buildH2HFromSummary(summary, league.slug) : [];
    const seenIds = new Set<string>();
    const h2h = [...directH2H, ...formMatches].filter((m) => {
        const id = m?.match_id || m?.event_key;
        if (!id) return true;
        if (seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
    });
    const goals = summary ? buildEventDetailsFromSummary(summary) : [];
    const lineups = summary ? buildLineupsFromSummary(summary, league.slug) : null;
    const teamStats = summary ? buildTeamStatsFromSummary(summary) : [];
    const venue = normalized.venue || normalizeString(summary?.gameInfo?.venue?.fullName) || '';

    return {
        source: 'espn' as const,
        summary,
        match: {
            id: normalized.id,
            externalProvider: 'espn',
            sportId: 'football',
            status: normalized.status,
            currentMinute: normalized.minute,
            date: normalized.kickoff.toISOString(),
            time: normalized.kickoff.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'America/Argentina/Buenos_Aires',
            }),
            tournament: league.shortName,
            tournamentLogo: normalized.tournament.logo,
            tournamentId: normalized.tournament.id,
            tournamentSeason: normalized.season,
            category: league.countryName,
            round: typeof normalized.round === 'number' ? `Fecha ${normalized.round}` : 'General',
            venue,
            referee: null,
            attendance: normalizeString(summary?.gameInfo?.attendance) || null,
            home: {
                id: normalized.home.id,
                name: normalized.home.name,
                logo: normalized.home.logo,
                score: normalized.score.home,
                teamUrl: '',
                league: league.slug,
            },
            away: {
                id: normalized.away.id,
                name: normalized.away.name,
                logo: normalized.away.logo,
                score: normalized.score.away,
                teamUrl: '',
                league: league.slug,
            },
            score: normalized.score,
            scores: normalized.score,
            lineups,
            standings,
            h2h,
            events: goals,
            stats: teamStats,
            draw: [],
            form: [],
            topScorers: [],
        },
        h2h,
        standings,
        events: goals,
        lineups,
        stats: teamStats,
    };
}

function buildRosterPlayers(
    payload: Record<string, any> | null | undefined,
    leagueSlug: EspnFootballLeagueSlug,
    teamId: string,
) {
    const teamPrefixed = toEspnFootballTeamId(teamId, leagueSlug);
    const mapPlayer = (raw: any, fallbackPosition: string) => {
        const espnId = normalizeString(raw?.id);
        const prefixedPlayerId = espnId ? toEspnFootballPlayerId(espnId, leagueSlug) : '';
        return {
            id: prefixedPlayerId,
            player_id: prefixedPlayerId,
            team_id: teamPrefixed,
            name: raw?.displayName || raw?.fullName || 'Jugador',
            number: raw?.jersey || '',
            jersey_number: raw?.jersey || '',
            age: raw?.age || '',
            nationality: raw?.birthPlace?.country || raw?.flag?.alt || '',
            position: raw?.position?.displayName || raw?.position?.name || fallbackPosition,
            position_name: raw?.position?.displayName || raw?.position?.name || fallbackPosition,
            image_path: raw?.headshot?.href || '',
        };
    };

    const groups = Array.isArray(payload?.athletes) ? payload.athletes : [];
    const fromGroups = groups.flatMap((group: any) => {
        const positionName = normalizeString(group?.position) || 'other';
        const items = Array.isArray(group?.items) ? group.items : [];
        return items.map((item: any) => mapPlayer(item, positionName));
    });
    if (fromGroups.length > 0) return fromGroups;

    const flat = Array.isArray(payload?.roster) ? payload.roster : [];
    return flat.map((p: any) => mapPlayer(p, 'other'));
}

// ESPN's site/v2 roster endpoint returns no athletes for national teams.
// The common/v3 endpoint exposes the same data under a different shape:
// { positionGroups: [{ type, displayName, athletes: [...] }] }.
function buildRosterPlayersFromCommonV3(
    payload: Record<string, any> | null | undefined,
    leagueSlug: EspnFootballLeagueSlug,
    teamId: string,
) {
    const teamPrefixed = toEspnFootballTeamId(teamId, leagueSlug);
    const positionGroups = Array.isArray(payload?.positionGroups) ? payload.positionGroups : [];
    return positionGroups.flatMap((group: any) => {
        const fallbackPosition = normalizeString(group?.displayName) || normalizeString(group?.type) || 'other';
        const items = Array.isArray(group?.athletes) ? group.athletes : [];
        return items.map((item: any) => {
            const espnId = normalizeString(item?.id);
            const prefixedPlayerId = espnId ? toEspnFootballPlayerId(espnId, leagueSlug) : '';
            const heightDisplay = normalizeString(item?.displayHeight);
            const weightDisplay = normalizeString(item?.displayWeight);
            const dob = normalizeString(item?.displayDOB);
            return {
                id: prefixedPlayerId,
                player_id: prefixedPlayerId,
                team_id: teamPrefixed,
                name: item?.displayName || item?.fullName || 'Jugador',
                first_name: item?.firstName || '',
                last_name: item?.lastName || '',
                number: normalizeString(item?.jersey) || '',
                jersey_number: normalizeString(item?.jersey) || '',
                age: item?.age || '',
                height: heightDisplay || '',
                weight: weightDisplay || '',
                birth_date: dob ? dob.slice(0, 10) : '',
                nationality: item?.birthPlace?.country || item?.citizenship || '',
                position: item?.position?.displayName || item?.position?.name || fallbackPosition,
                position_name: item?.position?.displayName || item?.position?.name || fallbackPosition,
                image_path: item?.headshot?.href || '',
            };
        });
    });
}

async function fetchTeamDetailsForLeague(leagueSlug: EspnFootballLeagueSlug, teamId: string) {
    return fetchEspnJson<Record<string, any>>(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/teams/${teamId}`,
        'EspnSoccerTeam',
        TEAM_CACHE_TTL,
    );
}

export async function getEspnFootballTeamBundle(
    teamId: string,
    preferredLeague?: string | null,
    extraLeagueSlugs?: readonly string[] | null,
    options?: { skipSquad?: boolean },
) {
    const skipSquad = options?.skipSquad === true;
    let league: EspnFootballLeague | null = null;
    let details: Record<string, any> | null = null;

    if (preferredLeague && isEspnFootballLeagueSlug(preferredLeague)) {
        const candidate = LEAGUES[preferredLeague];
        const payload = await fetchTeamDetailsForLeague(candidate.slug, teamId);
        if (payload && normalizeString(payload?.team?.id) === teamId) {
            league = candidate;
            details = payload;
        }
    }

    if (!details) {
        const resolved = await resolveTeamLeague(teamId, preferredLeague);
        if (!resolved?.details) return null;
        league = resolved.league;
        details = resolved.details;
    }

    if (!league || !details) return null;
    const resolvedLeague = league;

    const scheduleLeagueSlugs: EspnFootballLeagueSlug[] = [resolvedLeague.slug];
    if (Array.isArray(extraLeagueSlugs)) {
        for (const slug of extraLeagueSlugs) {
            if (isEspnFootballLeagueSlug(slug) && !scheduleLeagueSlugs.includes(slug)) {
                scheduleLeagueSlugs.push(slug);
            }
        }
    }

    // ESPN's team-schedule endpoint is sparse for national teams (only returns
    // a narrow window of recent + a few future events; future World Cup games
    // don't appear until very close to the date). For FIFA-affiliated leagues
    // we additionally scan the league scoreboard and keep events involving
    // this team so the user sees upcoming Mundial fixtures.
    const fifaScoreboardScanSlugs = scheduleLeagueSlugs.filter((slug) =>
        slug.startsWith('fifa.') || slug === 'conmebol.fifa.worldq',
    );
    const scoreboardScanWindow = fifaScoreboardScanSlugs.length > 0
        ? (() => {
            const today = new Date();
            return {
                start: addDays(today, -TEAM_SCHEDULE_RANGE_DAYS),
                end: addDays(today, TEAM_SCHEDULE_RANGE_DAYS),
            };
        })()
        : null;

    const [schedulePayloads, rosterPayload, standingsPayload, scoreboardScans] = await Promise.all([
        Promise.all(
            scheduleLeagueSlugs.map((slug) =>
                fetchEspnJson<Record<string, any>>(
                    `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${teamId}/schedule`,
                    'EspnSoccerTeamSchedule',
                    TEAM_CACHE_TTL,
                ),
            ),
        ),
        skipSquad
            ? Promise.resolve(null)
            : fetchEspnJson<Record<string, any>>(
                `https://site.api.espn.com/apis/site/v2/sports/soccer/${resolvedLeague.slug}/teams/${teamId}/roster`,
                'EspnSoccerTeamRoster',
                TEAM_CACHE_TTL,
            ),
        fetchLeagueStandingsRaw(resolvedLeague.slug),
        scoreboardScanWindow
            ? Promise.all(
                fifaScoreboardScanSlugs.map(async (slug) => ({
                    slug,
                    events: await fetchScoreboardRangeEvents(slug, scoreboardScanWindow.start, scoreboardScanWindow.end),
                })),
            )
            : Promise.resolve(null),
    ]);

    const eventMap = new Map<string, Record<string, any>>();
    schedulePayloads.forEach((payload, idx) => {
        const events = Array.isArray(payload?.events) ? payload.events : [];
        const slug = scheduleLeagueSlugs[idx];
        for (const event of events) {
            const eventId = normalizeString(event?.id);
            if (!eventId || eventMap.has(eventId)) continue;
            const tagged = { ...event, __sourceLeagueSlug: slug };
            eventMap.set(eventId, tagged);
        }
    });

    if (Array.isArray(scoreboardScans)) {
        for (const scan of scoreboardScans) {
            for (const event of scan.events) {
                const eventId = normalizeString(event?.id);
                if (!eventId || eventMap.has(eventId)) continue;
                const competitors = Array.isArray(event?.competitions?.[0]?.competitors)
                    ? event.competitions[0].competitors
                    : [];
                const involvesTeam = competitors.some((c: any) => normalizeString(c?.team?.id) === teamId || normalizeString(c?.id) === teamId);
                if (!involvesTeam) continue;
                eventMap.set(eventId, { ...event, __sourceLeagueSlug: scan.slug });
            }
        }
    }
    const events = Array.from(eventMap.values());
    const normalizedEvents = events
        .map((event) => {
            const slug = normalizeString(event?.__sourceLeagueSlug);
            const eventLeague = (slug && isEspnFootballLeagueSlug(slug) ? LEAGUES[slug] : null) || resolvedLeague;
            return normalizeEspnEventForTournamentViews(event, eventLeague);
        })
        .filter(isEspnTournamentViewEvent);
    const standingsRows = normalizeStandingsRows(standingsPayload, resolvedLeague.slug);
    const standingRow = standingsRows.find((row) => row.team_id === toEspnFootballTeamId(teamId, resolvedLeague.slug)) || null;
    const team = details?.team;
    const venue = details?.franchise?.venue;
    const logo = getEspnLogo(team);

    return {
        details: {
            id: toEspnFootballTeamId(teamId, resolvedLeague.slug),
            name: team?.displayName || team?.name || 'Equipo',
            image_path: logo,
            logo,
            logo_url: logo,
            country: league.countryName,
            city: venue?.address?.city || '',
            region: venue?.address?.state || '',
            venue: venue?.fullName || '',
            founded: null,
            provider: 'espn',
            supported_tabs: ['summary', 'results', 'fixtures', 'squad'],
            current_league: league.shortName,
            current_league_logo: getLeagueLogo(standingsPayload),
            current_season: getLeagueSeason(schedulePayloads[0]) || getLeagueSeason(standingsPayload),
            standing: standingRow ? {
                position: standingRow.position,
                points: standingRow.points,
                played: standingRow.played,
                won: standingRow.won,
                drawn: standingRow.drawn,
                lost: standingRow.lost,
            } : null,
            statistics: standingRow ? {
                played: standingRow.played,
                wins: standingRow.won,
                draws: standingRow.drawn,
                losses: standingRow.lost,
                goalsFor: standingRow.scored,
                goalsAgainst: standingRow.conceded,
                goalDifference: standingRow.goal_difference,
            } : null,
            short_code: team?.abbreviation || '',
            description: normalizeString(details?.standingSummary) || '',
        },
        results: normalizedEvents
            .filter((e) => e.status === 'final')
            .sort((l, r) => (r.timestamp || 0) - (l.timestamp || 0)),
        fixtures: normalizedEvents
            .filter((e) => e.status !== 'final')
            .sort((l, r) => (l.timestamp || 0) - (r.timestamp || 0)),
        squad: skipSquad ? [] : await resolveEspnSoccerSquad(rosterPayload, resolvedLeague.slug, teamId),
        transfers: [],
    };
}

// ESPN's site/v2 roster is empty for national teams. Falls back to the
// common/v3 endpoint which exposes positionGroups[].athletes[] with full
// athlete data (name, age, height, weight, headshot, position).
async function resolveEspnSoccerSquad(
    primaryRosterPayload: Record<string, any> | null,
    leagueSlug: EspnFootballLeagueSlug,
    teamId: string,
) {
    const primary = buildRosterPlayers(primaryRosterPayload, leagueSlug, teamId);
    if (primary.length > 0) return primary;

    const fallbackPayload = await fetchEspnJson<Record<string, any>>(
        `https://site.web.api.espn.com/apis/common/v3/sports/soccer/${leagueSlug}/teams/${teamId}/roster`,
        'EspnSoccerTeamRosterCommonV3',
        TEAM_CACHE_TTL,
    );
    return buildRosterPlayersFromCommonV3(fallbackPayload, leagueSlug, teamId);
}

// Fast path: fetch only the roster (and fallback) without the schedule /
// scoreboard / standings work the full bundle does. Used when the user opens
// the "Plantilla" tab and we already have the rest of the team details cached
// from the initial page load.
export async function getEspnFootballTeamSquad(teamId: string, preferredLeague?: string | null) {
    let leagueSlug: EspnFootballLeagueSlug | null = null;

    if (preferredLeague && isEspnFootballLeagueSlug(preferredLeague)) {
        leagueSlug = preferredLeague;
    } else {
        const resolved = await resolveTeamLeague(teamId, preferredLeague);
        if (resolved?.league) leagueSlug = resolved.league.slug;
    }

    if (!leagueSlug) return [];

    const rosterPayload = await fetchEspnJson<Record<string, any>>(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/teams/${teamId}/roster`,
        'EspnSoccerTeamRoster',
        TEAM_CACHE_TTL,
    );
    return resolveEspnSoccerSquad(rosterPayload, leagueSlug, teamId);
}

function inferEspnFootballLeagueFromTeamSlug(teamSlug: string | null): EspnFootballLeagueSlug | null {
    if (!teamSlug) return null;
    const lower = teamSlug.toLowerCase();
    if (isEspnFootballLeagueSlug(lower)) return lower;
    // Team slugs look like "eng.aston_villa" or "esp.barcelona"; the country
    // prefix maps to the top-flight league slug (e.g., "eng" -> "eng.1").
    const rawSlug: string = String(lower);
    const dotIdx = rawSlug.indexOf('.');
    if (dotIdx <= 0) return null;
    const countryPrefix = rawSlug.slice(0, dotIdx);
    const topFlight = `${countryPrefix}.1`;
    if (isEspnFootballLeagueSlug(topFlight)) return topFlight;
    return null;
}

export async function getEspnFootballPlayerBundle(playerId: string, preferredLeague?: string | null) {
    const candidates: EspnFootballLeagueSlug[] = [];
    const seen = new Set<EspnFootballLeagueSlug>();
    const pushCandidate = (slug: string | null | undefined) => {
        if (!slug || !isEspnFootballLeagueSlug(slug)) return;
        if (seen.has(slug)) return;
        seen.add(slug);
        candidates.push(slug);
    };

    pushCandidate(preferredLeague || null);
    for (const slug of SUPPORTED_ESPN_FOOTBALL_LEAGUE_SLUGS) pushCandidate(slug);

    let resolvedLeague: EspnFootballLeague | null = null;
    let athletePayload: Record<string, any> | null = null;

    for (const slug of candidates) {
        // common/v3 is the working endpoint for soccer athletes
        // (site/v2/.../athletes/{id} returns only an error code).
        const payload = await fetchEspnJson<Record<string, any>>(
            `https://site.web.api.espn.com/apis/common/v3/sports/soccer/${slug}/athletes/${playerId}`,
            'EspnSoccerAthleteCommonV3',
            TEAM_CACHE_TTL,
        );
        const athleteId = normalizeString(payload?.athlete?.id) || normalizeString(payload?.id);
        if (payload && athleteId === playerId) {
            resolvedLeague = LEAGUES[slug];
            athletePayload = payload;
            break;
        }
    }

    if (!resolvedLeague || !athletePayload) return null;

    const athlete = isRecord(athletePayload.athlete) ? athletePayload.athlete : athletePayload;
    const teamRef = isRecord(athlete?.team) ? athlete.team : null;
    const teamIdRaw = normalizeString(teamRef?.id);
    // The team object inside the athlete payload includes its own `slug` (e.g.,
    // "eng.aston_villa" for Aston Villa). Use that slug instead of the resolved
    // league so the team link routes to the player's actual club.
    const teamSlugRaw = normalizeString(teamRef?.slug);
    const teamLeagueSlug =
        teamSlugRaw && isEspnFootballLeagueSlug(teamSlugRaw)
            ? teamSlugRaw
            : inferEspnFootballLeagueFromTeamSlug(teamSlugRaw) || resolvedLeague.slug;
    const teamLogo = teamRef ? getEspnLogo(teamRef) : '';
    const teamName =
        normalizeString(teamRef?.displayName) ||
        normalizeString(teamRef?.name) ||
        normalizeString(teamRef?.location) ||
        '';
    const headshot = normalizeString(athlete?.headshot?.href) || normalizeString(athlete?.headshot);
    const flag = normalizeString(athlete?.flag?.href) || normalizeString(athlete?.citizenshipFlag?.href);
    const country =
        normalizeString(athlete?.citizenship) ||
        normalizeString(athlete?.birthPlace?.country) ||
        normalizeString(athlete?.nationality);
    const heightRaw = normalizeString(athlete?.displayHeight) || normalizeString(athlete?.height);
    const weightRaw = normalizeString(athlete?.displayWeight) || normalizeString(athlete?.weight);
    const dateOfBirth = normalizeString(athlete?.dateOfBirth) || normalizeString(athlete?.displayDOB);
    const birthDate = dateOfBirth ? dateOfBirth.slice(0, 10) : '';

    // Fetch bio (teamHistory) + overview (statistics) in parallel so the page
    // can render the full career table.
    const [bioPayload, overviewPayload] = await Promise.all([
        fetchEspnJson<Record<string, any>>(
            `https://site.web.api.espn.com/apis/common/v3/sports/soccer/${resolvedLeague.slug}/athletes/${playerId}/bio`,
            'EspnSoccerAthleteBio',
            TEAM_CACHE_TTL,
        ).catch(() => null),
        fetchEspnJson<Record<string, any>>(
            `https://site.web.api.espn.com/apis/common/v3/sports/soccer/${resolvedLeague.slug}/athletes/${playerId}/overview`,
            'EspnSoccerAthleteOverview',
            TEAM_CACHE_TTL,
        ).catch(() => null),
    ]);

    const career = buildEspnFootballPlayerCareer(bioPayload, overviewPayload);
    const seasonStats = buildEspnFootballPlayerSeasonStats(overviewPayload);

    return {
        details: {
            id: toEspnFootballPlayerId(playerId, resolvedLeague.slug),
            name: normalizeString(athlete?.displayName) || normalizeString(athlete?.fullName) || 'Jugador',
            image_path: headshot || '',
            photo: headshot || '',
            small_image_path: headshot || '',
            country: country ? { name: country, image_path: flag || '', small_image_path: flag || '' } : null,
            nationality: country || '',
            position:
                normalizeString(athlete?.position?.displayName) ||
                normalizeString(athlete?.position?.name) ||
                normalizeString(athlete?.position?.abbreviation) ||
                '',
            age: typeof athlete?.age === 'number' ? athlete.age : normalizeString(athlete?.age) || '',
            height: heightRaw || '',
            weight: weightRaw || '',
            birth_date: birthDate,
            jersey_number: normalizeString(athlete?.jersey) || normalizeString(athlete?.displayJersey) || '',
            preferred_foot: '',
            provider: 'espn',
            team: teamRef && teamIdRaw
                ? {
                    id: toEspnFootballTeamId(teamIdRaw, teamLeagueSlug),
                    team_id: toEspnFootballTeamId(teamIdRaw, teamLeagueSlug),
                    name: teamName || 'Equipo',
                    team_name: teamName || 'Equipo',
                    logo_url: teamLogo,
                    image_path: teamLogo,
                }
                : null,
            league_slug: resolvedLeague.slug,
            league_name: resolvedLeague.name,
            season_stats: seasonStats,
        },
        career,
    };
}

// Builds the per-season/per-competition stats grid the player page shows on
// the Resumen tab. ESPN exposes them as parallel `names` + `splits[i].stats`
// arrays so we zip them together with displayNames as headers.
function buildEspnFootballPlayerSeasonStats(overviewPayload: Record<string, any> | null) {
    if (!overviewPayload) return [];
    const stats = isRecord(overviewPayload.statistics) ? overviewPayload.statistics : null;
    if (!stats) return [];
    const labels: string[] = Array.isArray(stats.labels) ? stats.labels : [];
    const names: string[] = Array.isArray(stats.names) ? stats.names : [];
    const displayNames: string[] = Array.isArray(stats.displayNames) ? stats.displayNames : [];
    const splits = isRecord(stats.splits) ? stats.splits : null;
    if (!splits) return [];

    return Object.values(splits)
        .filter(isRecord)
        .map((split: any) => {
            const numbers: string[] = Array.isArray(split?.stats) ? split.stats : [];
            const items = numbers.map((value, idx) => ({
                key: names[idx] || labels[idx] || `stat_${idx}`,
                label: displayNames[idx] || labels[idx] || names[idx] || '',
                short_label: labels[idx] || names[idx] || '',
                value: value,
            }));
            return {
                display_name: normalizeString(split?.displayName) || '',
                team_id: normalizeString(split?.teamId) || '',
                team_slug: normalizeString(split?.teamSlug) || '',
                league_id: normalizeString(split?.leagueId) || '',
                league_slug: normalizeString(split?.leagueSlug) || '',
                stats: items,
            };
        });
}

// Builds the career trajectory list (one entry per team-season block) for the
// Carrera tab. Merges teamHistory (`/bio`) with aggregated per-competition
// stats from `/overview` so each row shows the team + seasons + stat totals.
function buildEspnFootballPlayerCareer(
    bioPayload: Record<string, any> | null,
    overviewPayload: Record<string, any> | null,
) {
    const teamHistory: any[] = Array.isArray(bioPayload?.teamHistory) ? bioPayload.teamHistory : [];
    if (teamHistory.length === 0) return [];

    const overviewStats = isRecord(overviewPayload?.statistics) ? overviewPayload.statistics : null;
    const splits: any[] = overviewStats && isRecord(overviewStats.splits)
        ? Object.values(overviewStats.splits)
        : [];
    const statNames: string[] = Array.isArray(overviewStats?.names) ? overviewStats.names : [];
    const indexOfStat = (key: string) => statNames.indexOf(key);
    const statsByTeam = new Map<string, { played: number; goals: number; assists: number; yellow: number; red: number }>();
    for (const split of splits) {
        if (!isRecord(split)) continue;
        const teamId = normalizeString(split.teamId);
        if (!teamId) continue;
        const values: string[] = Array.isArray(split.stats) ? split.stats : [];
        const read = (key: string) => {
            const idx = indexOfStat(key);
            const raw = idx >= 0 ? Number(values[idx]) : NaN;
            return Number.isFinite(raw) ? raw : 0;
        };
        const acc = statsByTeam.get(teamId) || { played: 0, goals: 0, assists: 0, yellow: 0, red: 0 };
        acc.played += read('starts');
        acc.goals += read('totalGoals');
        acc.assists += read('goalAssists');
        acc.yellow += read('yellowCards');
        acc.red += read('redCards');
        statsByTeam.set(teamId, acc);
    }

    return teamHistory.map((team: any) => {
        const teamId = normalizeString(team?.id);
        const teamSlug = normalizeString(team?.slug);
        const teamLeagueSlug = (teamSlug && isEspnFootballLeagueSlug(teamSlug))
            ? teamSlug
            : inferEspnFootballLeagueFromTeamSlug(teamSlug) || null;
        const prefixedTeamId = teamId && teamLeagueSlug
            ? toEspnFootballTeamId(teamId, teamLeagueSlug)
            : (teamId || '');
        const totals = teamId ? statsByTeam.get(teamId) : null;
        return {
            team: {
                id: prefixedTeamId,
                team_id: prefixedTeamId,
                name: normalizeString(team?.displayName) || normalizeString(team?.name) || 'Equipo',
                logo_url: normalizeString(team?.logo) || '',
                image_path: normalizeString(team?.logo) || '',
            },
            season: normalizeString(team?.seasons) || '',
            season_name: normalizeString(team?.seasons) || '',
            appearances: totals ? totals.played : null,
            matches_played: totals ? totals.played : null,
            games: totals ? totals.played : null,
            goals: totals ? totals.goals : null,
            assists: totals ? totals.assists : null,
            yellow_cards: totals ? totals.yellow : null,
            red_cards: totals ? totals.red : null,
        };
    });
}

export function inferEspnFootballLeague(input: {
    id?: unknown;
    externalId?: unknown;
    tournamentUrl?: unknown;
    leagueSlug?: unknown;
    name?: unknown;
}) {
    const explicitLeague = normalizeKey(input.leagueSlug);
    if (isEspnFootballLeagueSlug(explicitLeague)) return explicitLeague;

    const prefixed = parseEspnFootballTournamentId(input.id) || parseEspnFootballTournamentId(input.externalId);
    if (prefixed) return prefixed;

    const normalizedUrl = normalizeKey(input.tournamentUrl);
    if (normalizedUrl) {
        for (const league of SUPPORTED_ESPN_FOOTBALL_LEAGUES) {
            if (normalizedUrl.includes(league.tournamentUrl.toLowerCase())) return league.slug;
        }
    }

    const normalizedName = normalizeKey(input.name);
    if (normalizedName) {
        for (const league of SUPPORTED_ESPN_FOOTBALL_LEAGUES) {
            if (league.aliases.some((a) => normalizedName.includes(a))) return league.slug;
            if (normalizedName.includes(league.shortName.toLowerCase()) || normalizedName.includes(league.name.toLowerCase())) return league.slug;
        }
    }

    return null;
}
