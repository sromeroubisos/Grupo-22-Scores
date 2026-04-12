'use client';

import { useState, useEffect, useMemo, useRef, useCallback, memo, type MouseEvent } from 'react';
import { Trophy, ChevronRight, ChevronLeft, Star } from 'lucide-react';
import Link from 'next/link';
import styles from './page.module.css';
import InstallAppButton from '@/components/InstallAppButton';
import { useSport } from '@/context/SportContext';
import { getTournamentsBySport, getInternationalTournamentsBySport, getTournamentById } from '@/lib/data/tournaments/index';
import { getCountryById, resolveCountryId } from '@/lib/data/countries';
import type { Tournament } from '@/lib/types'; // Keep this for existing tournament logic
import { useFavorites } from '@/hooks/useFavorites';
import { useMatchesStore } from '@/hooks/useMatchesStore';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { FAVORITES_ENABLED } from '@/lib/favorites/config';
import { toLocalMatch, generateLocalDateKeys } from '@/lib/timezone';
import { calculateVirtualMatchTime } from '@/lib/virtualClock';
import { resolveTournamentAudience, type TournamentAudience } from '@/lib/utils/tournamentAudience';
import { compareTournamentsByPriority, getTournamentPriority } from '@/lib/utils/tournamentOrdering';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';

// Individual sports use player faces instead of team shields
const INDIVIDUAL_SPORTS = new Set([
  'tennis', 'boxing', 'mma', 'darts', 'snooker', 'golf',
  'cycling', 'horse-racing', 'table-tennis', 'badminton',
  'motorsport', 'esports'
]);

type TournamentCountryGroup = {
  countryName: string;
  flagEmoji: string;
  tournaments: Tournament[];
  externalCountryId?: string | null;
  tournamentCount?: number | null;
  loading?: boolean;
  loaded?: boolean;
  error?: string | null;
};

type RugbyPublicCountrySummary = {
  id: string;
  external_country_id: string;
  name: string;
  flag?: string | null;
  tournament_count?: number | null;
  type: 'country';
};

type RugbyCountryGroupState = {
  externalCountryId: string;
  countryName: string;
  flagEmoji: string;
  tournaments: Tournament[];
  tournamentCount?: number | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
};

// Group tournaments by country helper
function groupTournamentsByCountry(tournaments: Tournament[]) {
  const groups: Record<string, TournamentCountryGroup> = {};

  tournaments.forEach(tournament => {
    const safeCountryId = tournament.countryId || 'international';
    const country = getCountryById(safeCountryId);
    const countryName = country?.name || safeCountryId;
    const flagEmoji = country?.flagEmoji || '';

    if (!groups[safeCountryId]) {
      groups[safeCountryId] = { countryName, flagEmoji, tournaments: [] };
    }
    groups[safeCountryId].tournaments.push(tournament);
  });

  // Sort tournaments within each group by priority
  Object.values(groups).forEach(group => {
    group.tournaments.sort(compareTournamentsByPriority);
  });

  return groups;
}

function cleanLeagueName(name: string, country?: string | null): string {
  if (!name || !country) return name || '';
  const prefix = country.toUpperCase() + ':';
  if (name.toUpperCase().trimStart().startsWith(prefix)) {
    return name.slice(name.indexOf(':') + 1).trim();
  }
  return name;
}

function normalizeTournamentLookupKey(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getTournamentCountryName(tournament: { country?: unknown } | null | undefined): string {
  return typeof tournament?.country === 'string' && tournament.country.trim()
    ? tournament.country
    : 'Internacional';
}

// Type definitions
interface Match {
  id: string | number;
  time: string;
  home: string;
  homeLogo: string;
  homeScore?: number;
  away: string;
  awayLogo: string;
  awayScore?: number;
  status: 'live' | 'scheduled' | 'finished';
  minute?: string;
  homeClubId?: string;
  awayClubId?: string;
  venue?: string;
  eventLabel?: string;
  footerLabel?: string;
}

interface LeagueMatches {
  league: string;
  leagueId: string;
  logoUrl?: string | null;
  favoriteLeagueId?: string;
  favoriteLeagueIds?: string[];
  country: string;
  flag: string;
  round: string;
  priority: number;
  matches: Match[];
}

interface PublicTournamentListItem {
  id: string;
  name: string;
  display_name?: string | null;
  country?: string | null;
  country_id?: string | null;
  sport_id?: string | null;
  logo_url?: string | null;
  priority?: number | null;
  type?: string | null;
  seasons?: Array<{
    seasonId?: string | null;
    season?: string | number | null;
    year?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    teamsCount?: number | null;
    isActive?: boolean | null;
    current?: boolean | null;
  }> | null;
}

interface ManualTournamentApiItem {
  id: string;
  name: string;
  display_name?: string | null;
  sport_id?: string | null;
  country?: string | null;
  country_id?: string | null;
  priority?: number | null;
  logo_url?: string | null;
  category?: string | null;
  season_id?: string | number | null;
  is_visible?: boolean | null;
  age_grade?: string | null;
  format?: Tournament['format'] | null;
}

function isFlashScoreTournamentId(value: string): boolean {
  return /^fs-/i.test(value);
}

function mapPublicTournamentToTournament(item: PublicTournamentListItem): Tournament {
  const countryId = String(item.country_id || 'international').trim().toLowerCase() || 'international';
  const type: Tournament['type'] = item.type === 'cup'
    ? 'cup'
    : countryId === 'international'
      ? 'international'
      : 'local';

  const seasons = Array.isArray(item.seasons)
    ? item.seasons
      .map((season) => {
        const seasonId = season?.seasonId ?? season?.season;
        if (seasonId === null || seasonId === undefined || seasonId === '') return null;

        return {
          seasonId: String(seasonId),
          year: typeof season?.year === 'number' ? season.year : undefined,
          startDate: season?.startDate || undefined,
          endDate: season?.endDate || undefined,
          teamsCount: typeof season?.teamsCount === 'number' ? season.teamsCount : 0,
          isActive: season?.isActive === true || season?.current === true,
        };
      })
      .filter((season): season is Exclude<typeof season, null> => season !== null)
    : [];

  return {
    id: item.id,
    name: item.display_name || item.name,
    displayName: item.display_name || item.name,
    originalName: item.name,
    nameEs: item.display_name || item.name,
    url: `/tournaments/${item.id}`,
    type,
    sportId: (item.sport_id || 'rugby') as Tournament['sportId'],
    countryId,
    priority: typeof item.priority === 'number' ? item.priority : 0,
    logoUrl: item.logo_url || null,
    categories: [],
    seasons,
    isApiManaged: true,
    dataSource: isFlashScoreTournamentId(item.id) ? 'flashscore' : 'local-db',
  };
}

// Types moved inside or imported if needed

// Generate dates for the date picker (timezone-aware)
function generateDates(timeZone: string) {
  const entries = generateLocalDateKeys(timeZone, -7, 7);
  const today = new Date();

  return entries.map(({ dateKey, offset }) => {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);

    let label = '';
    if (offset === -1) label = 'Ayer';
    else if (offset === 0) label = 'Hoy';
    else if (offset === 1) label = 'Mañana';
    else {
      label = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', timeZone });
    }

    return {
      date: dateKey,
      label,
      dayName: d.toLocaleDateString('es-AR', { weekday: 'long', timeZone }),
      fullDate: d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone }),
      isToday: offset === 0,
    };
  });
}



// --- Memoized Sub-components for Performance ---

const LiveMinute = ({ dateTime, sport }: { dateTime: string, sport: any }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return <>{calculateVirtualMatchTime(dateTime, sport, 'live') || 'En Vivo'}</>;
};

const MatchRow = memo(({ match, selectedSport, styles, isIndividualSport, showClubFavorites, isClubFavorite, onToggleClubFavorite }: { 
  match: Match & { _dateTime: string }, 
  selectedSport: any, 
  styles: any,
  isIndividualSport: boolean,
  showClubFavorites?: boolean,
  isClubFavorite?: (clubId: string) => boolean,
  onToggleClubFavorite?: (clubId: string, clubName: string, logoUrl?: string) => void,
}) => {
  const homeClubId = typeof match.homeClubId === 'string' ? match.homeClubId.trim() : '';
  const awayClubId = typeof match.awayClubId === 'string' ? match.awayClubId.trim() : '';
  const canToggleHomeClub = Boolean(showClubFavorites && homeClubId);
  const canToggleAwayClub = Boolean(showClubFavorites && awayClubId);
  const isHomeClubFavorite = canToggleHomeClub && isClubFavorite ? isClubFavorite(homeClubId) : false;
  const isAwayClubFavorite = canToggleAwayClub && isClubFavorite ? isClubFavorite(awayClubId) : false;

  const handleClubFavoriteClick = (
    event: MouseEvent<HTMLButtonElement>,
    clubId: string,
    clubName: string,
    logoUrl?: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleClubFavorite?.(clubId, clubName, logoUrl);
  };

  return (
    <Link
      href={`/matches/${match.id}`}
      className={`${styles.matchRow} ${match.status === 'live' ? styles.matchRowLive : ''}`}
    >
      <div className={styles.matchTime}>
        {match.status === 'live' ? (
          <span className={styles.matchLive}>
            <span className={styles.matchLiveDot}></span>
            {match.minute || <LiveMinute dateTime={match._dateTime} sport={selectedSport} />}
          </span>
        ) : match.status === 'finished' ? (
          <span className={styles.matchFinished}>FT</span>
        ) : (
          <span className={styles.matchTimeText}>{match.time}</span>
        )}
      </div>

      <div className={styles.matchTeams}>
        <div className={`${styles.matchTeam} ${match.homeScore != null && match.awayScore != null && match.homeScore >= match.awayScore ? styles.winner : ''}`}>
          <div className={styles.matchTeamIdentity}>
            <span className={`${styles.teamLogo} ${isIndividualSport ? styles.teamLogoRound : ''}`}>
              {match.homeLogo ? (
                <img
                  src={match.homeLogo}
                  alt={match.home}
                  className={isIndividualSport ? styles.logoImgRound : styles.logoImgSquare}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.style.display = 'none';
                    (e.currentTarget.nextElementSibling as HTMLElement)?.style.removeProperty('display');
                  }}
                />
              ) : null}
              <span className={styles.logoFallback} style={match.homeLogo ? { display: 'none' } : {}}>
                {isIndividualSport ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                )}
              </span>
            </span>
            <span className={styles.teamName}>{match.home}</span>
            {canToggleHomeClub ? (
              <button
                type="button"
                className={`${styles.clubFavoriteBtn} ${isHomeClubFavorite ? styles.clubFavoriteBtnActive : ''}`}
                onClick={(event) => handleClubFavoriteClick(event, homeClubId, match.home, match.homeLogo)}
                aria-label={isHomeClubFavorite ? `Dejar de seguir a ${match.home}` : `Seguir a ${match.home}`}
                title={isHomeClubFavorite ? 'Dejar de seguir' : 'Seguir'}
              >
                <Star size={13} fill={isHomeClubFavorite ? 'currentColor' : 'none'} />
              </button>
            ) : null}
          </div>
          <span className={styles.teamScore}>{match.homeScore ?? '-'}</span>
        </div>
        <div className={`${styles.matchTeam} ${match.homeScore != null && match.awayScore != null && match.awayScore >= match.homeScore ? styles.winner : ''}`}>
          <div className={styles.matchTeamIdentity}>
            <span className={`${styles.teamLogo} ${isIndividualSport ? styles.teamLogoRound : ''}`}>
              {match.awayLogo ? (
                <img
                  src={match.awayLogo}
                  alt={match.away}
                  className={isIndividualSport ? styles.logoImgRound : styles.logoImgSquare}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.style.display = 'none';
                    (e.currentTarget.nextElementSibling as HTMLElement)?.style.removeProperty('display');
                  }}
                />
              ) : null}
              <span className={styles.logoFallback} style={match.awayLogo ? { display: 'none' } : {}}>
                {isIndividualSport ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                )}
              </span>
            </span>
            <span className={styles.teamName}>{match.away}</span>
            {canToggleAwayClub ? (
              <button
                type="button"
                className={`${styles.clubFavoriteBtn} ${isAwayClubFavorite ? styles.clubFavoriteBtnActive : ''}`}
                onClick={(event) => handleClubFavoriteClick(event, awayClubId, match.away, match.awayLogo)}
                aria-label={isAwayClubFavorite ? `Dejar de seguir a ${match.away}` : `Seguir a ${match.away}`}
                title={isAwayClubFavorite ? 'Dejar de seguir' : 'Seguir'}
              >
                <Star size={13} fill={isAwayClubFavorite ? 'currentColor' : 'none'} />
              </button>
            ) : null}
          </div>
          <span className={styles.teamScore}>{match.awayScore ?? '-'}</span>
        </div>
      </div>
    </Link>
  );
  });

const MotorsportMatchRow = memo(({ match, styles }: {
  match: Match & { _dateTime: string },
  styles: any,
}) => {
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';
  const statusLabel = isLive ? 'Live' : isFinished ? 'Final' : 'Scheduled';
  const footerLabel = match.footerLabel || (isLive ? 'Telemetry' : isFinished ? 'Race data' : 'Event details');

  return (
    <Link
      href={`/matches/${match.id}`}
      className={`${styles.motorsportHomeRow} ${isLive ? styles.motorsportHomeRowLive : ''}`}
    >
      <div className={styles.motorsportHomeRowTop}>
        <div className={styles.motorsportHomeRowHeader}>
          <span className={styles.motorsportHomeRowSeries}>{match.away}</span>
          <h3 className={styles.motorsportHomeRowTitle}>{match.home}</h3>
          <div className={styles.motorsportHomeRowMeta}>
            {match.time && <span>{isFinished ? 'Finished' : match.time}</span>}
            {match.venue && <span>{match.venue}</span>}
          </div>
        </div>
        <span className={`${styles.motorsportHomeRowStatus} ${isLive ? styles.motorsportHomeRowStatusLive : ''}`}>
          {statusLabel}
        </span>
      </div>
      <div className={styles.motorsportHomeRowFooter}>
        <span className={styles.motorsportHomeRowFooterLabel}>{footerLabel}</span>
        <span className={styles.motorsportHomeRowFooterAction}>Open</span>
      </div>
    </Link>
  );
});

MotorsportMatchRow.displayName = 'MotorsportMatchRow';

// Update the display name for dev tools
MatchRow.displayName = 'MatchRow';

export default function HomePage() {

  const [selectedDate, setSelectedDate] = useState('');
  const [dates, setDates] = useState<ReturnType<typeof generateDates>>([]);
  const [news, setNews] = useState<any[]>([]);
  const [manualTournamentsList, setManualTournamentsList] = useState<Tournament[]>([]);
  const [rugbyCountrySummaries, setRugbyCountrySummaries] = useState<RugbyPublicCountrySummary[]>([]);
  const [rugbyCountryGroups, setRugbyCountryGroups] = useState<Record<string, RugbyCountryGroupState>>({});
  const [rugbyPublicCatalogReady, setRugbyPublicCatalogReady] = useState(false);
  const [showLiveOnly, setShowLiveOnly] = useState(false);
  const [selectedAudience, setSelectedAudience] = useState<TournamentAudience>('mayores');

  const { selectedSport, setSelectedSport, activeSports } = useSport();
  const { favoriteSportIds } = useUserPreferences();

  // Sort active sports: favorites first, then rest in original order
  const sortedActiveSports = useMemo(() => {
    if (favoriteSportIds.length === 0) return activeSports;
    return [...activeSports].sort((a, b) => {
      const aFav = favoriteSportIds.includes(a.id);
      const bFav = favoriteSportIds.includes(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return 0;
    });
  }, [activeSports, favoriteSportIds]);

  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set(['international']));
  const [expandedLeagueIds, setExpandedLeagueIds] = useState<Set<string>>(new Set()); // Level 2 Accordion
  const [collapsedLeagues, setCollapsedLeagues] = useState<Set<string>>(new Set()); // Main Content Collapse
  const [mobileTournamentsOpen, setMobileTournamentsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSportMenuOpen, setIsSportMenuOpen] = useState(false);
  const dateListRef = useRef<HTMLDivElement>(null);
  const activeDateRef = useRef<HTMLButtonElement>(null);

  // Detect user timezone once (stable across re-renders)
  const userTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  // Favorites hook
  const { toggleFavorite, toggleLeagueFavorite, isLeagueFavorite, isFavorite } = useFavorites();

  const isClubFavorite = useCallback(
    (clubId: string) => isFavorite(clubId, 'club'),
    [isFavorite],
  );

  const toggleClubFavorite = useCallback((clubId: string, clubName: string, logoUrl?: string) => {
    void toggleFavorite({
      id: clubId,
      entity_type: 'club',
      name: clubName,
      logo_url: logoUrl || null,
      type_label: 'Club',
    });
  }, [toggleFavorite]);

  const getLeagueFavoriteIds = useCallback((league: LeagueMatches) => {
    const rawIds = league.favoriteLeagueIds?.length
      ? league.favoriteLeagueIds
      : [league.favoriteLeagueId || league.leagueId];

    return Array.from(new Set(rawIds.map((value) => String(value || '').trim()).filter(Boolean)));
  }, []);

  const isLeagueGroupFavorite = useCallback((league: LeagueMatches) => (
    getLeagueFavoriteIds(league).some((leagueId) => isLeagueFavorite(leagueId))
  ), [getLeagueFavoriteIds, isLeagueFavorite]);

  const toggleLeagueGroupFavorite = useCallback(async (league: LeagueMatches) => {
    const leagueIds = getLeagueFavoriteIds(league);
    const followedIds = leagueIds.filter((leagueId) => isLeagueFavorite(leagueId));

    if (followedIds.length > 0) {
      await Promise.all(
        followedIds.map((leagueId) => toggleLeagueFavorite(leagueId, {
          name: league.league,
          logo_url: league.logoUrl || null,
          sportId: selectedSport.id,
          forceIsFavorite: false,
        })),
      );
      return;
    }

    const primaryLeagueId = leagueIds[0] || league.leagueId;
    await toggleLeagueFavorite(primaryLeagueId, {
      name: league.league,
      logo_url: league.logoUrl || null,
      sportId: selectedSport.id,
      forceIsFavorite: true,
    });
  }, [getLeagueFavoriteIds, isLeagueFavorite, selectedSport.id, toggleLeagueFavorite]);

  // Sports list handled by context (to respect global configuration)

  // Get tournaments for selected sport
  const allTournaments = useMemo(() => getTournamentsBySport(selectedSport.id), [selectedSport.id]);
  const internationalTournaments = useMemo(() => getInternationalTournamentsBySport(selectedSport.id), [selectedSport.id]);
  const loadedRugbyPublicTournaments = useMemo(
    () => Object.values(rugbyCountryGroups).flatMap((group) => group.tournaments),
    [rugbyCountryGroups],
  );
  const hasRugbyPublicCatalog = selectedSport.id === 'rugby' && rugbyPublicCatalogReady;

  // Group local tournaments by country
  const localTournaments = useMemo(() => {
    const sportManualTournaments = manualTournamentsList.filter(t => t.sportId === selectedSport.id);
    const externalRugbyTournaments = selectedSport.id === 'rugby' ? loadedRugbyPublicTournaments : [];
    const combined = [...sportManualTournaments, ...allTournaments, ...externalRugbyTournaments];
    return combined.filter((tournament) => {
      if (tournament.type !== 'local' && tournament.type !== 'cup') {
        return false;
      }

      return resolveTournamentAudience({
        ageGroup: tournament.ageGroup,
        categories: tournament.categories,
        isYouth: tournament.isYouth,
        name: tournament.name,
        displayName: tournament.displayName || tournament.nameEs,
        originalName: tournament.originalName,
      }) === selectedAudience;
    });
  }, [allTournaments, loadedRugbyPublicTournaments, manualTournamentsList, selectedAudience, selectedSport.id]);

  const groupedTournaments = useMemo(() => {
    const grouped = groupTournamentsByCountry(localTournaments);

    if (!hasRugbyPublicCatalog) {
      return grouped;
    }

    const merged: Record<string, TournamentCountryGroup> = { ...grouped };

    rugbyCountrySummaries.forEach((summary) => {
      const existing = merged[summary.id];
      const state = rugbyCountryGroups[summary.id];

      merged[summary.id] = {
        countryName: summary.name,
        flagEmoji: summary.flag || existing?.flagEmoji || '',
        tournaments: existing?.tournaments || state?.tournaments || [],
        externalCountryId: summary.external_country_id,
        tournamentCount: state?.tournamentCount ?? summary.tournament_count ?? existing?.tournamentCount ?? null,
        loading: state?.loading ?? false,
        loaded: state?.loaded ?? false,
        error: state?.error ?? null,
      };
    });

    return merged;
  }, [hasRugbyPublicCatalog, localTournaments, rugbyCountryGroups, rugbyCountrySummaries]);

  const tournamentAudienceById = useMemo(() => {
    const map = new Map<string, TournamentAudience>();
    const catalog = [...manualTournamentsList, ...allTournaments, ...internationalTournaments, ...loadedRugbyPublicTournaments];

    catalog.forEach((tournament) => {
      map.set(tournament.id, resolveTournamentAudience({
        ageGroup: tournament.ageGroup,
        categories: tournament.categories,
        isYouth: tournament.isYouth,
        name: tournament.name,
        displayName: tournament.displayName || tournament.nameEs,
        originalName: tournament.originalName,
      }));
    });

    return map;
  }, [allTournaments, internationalTournaments, loadedRugbyPublicTournaments, manualTournamentsList]);

  const tournamentAudienceByName = useMemo(() => {
    const map = new Map<string, TournamentAudience>();
    const catalog = [...manualTournamentsList, ...allTournaments, ...internationalTournaments, ...loadedRugbyPublicTournaments];

    const registerName = (value: string | null | undefined, audience: TournamentAudience) => {
      const key = normalizeTournamentLookupKey(value);
      if (!key || map.has(key)) return;
      map.set(key, audience);
    };

    catalog.forEach((tournament) => {
      const audience = resolveTournamentAudience({
        ageGroup: tournament.ageGroup,
        categories: tournament.categories,
        isYouth: tournament.isYouth,
        name: tournament.name,
        displayName: tournament.displayName || tournament.nameEs,
        originalName: tournament.originalName,
      });

      registerName(tournament.name, audience);
      registerName(tournament.displayName, audience);
      registerName(tournament.nameEs, audience);
      registerName(tournament.originalName, audience);
    });

    return map;
  }, [allTournaments, internationalTournaments, loadedRugbyPublicTournaments, manualTournamentsList]);

  const resolveMatchAudience = useCallback((tournament: { id?: string | null; name?: string | null; country?: string | null }) => {
    if (tournament.id) {
      const storedAudience = tournamentAudienceById.get(tournament.id);
      if (storedAudience) return storedAudience;

      const staticTournament = getTournamentById(tournament.id);
      if (staticTournament) {
        return resolveTournamentAudience({
          ageGroup: staticTournament.ageGroup,
          categories: staticTournament.categories,
          isYouth: staticTournament.isYouth,
          name: staticTournament.name,
          displayName: staticTournament.displayName || staticTournament.nameEs,
          originalName: staticTournament.originalName,
        });
      }
    }

    const cleanedName = cleanLeagueName(tournament.name || '', tournament.country || null);
    const byCleanName = tournamentAudienceByName.get(normalizeTournamentLookupKey(cleanedName));
    if (byCleanName) return byCleanName;

    const byRawName = tournamentAudienceByName.get(normalizeTournamentLookupKey(tournament.name));
    if (byRawName) return byRawName;

    return resolveTournamentAudience({ name: cleanedName || tournament.name });
  }, [tournamentAudienceById, tournamentAudienceByName]);

  // Filter logic
  const filteredInternational = useMemo(() => {
    const baseInternationalTournaments = internationalTournaments;

    const audienceFiltered = baseInternationalTournaments.filter((tournament) => (
      resolveTournamentAudience({
        ageGroup: tournament.ageGroup,
        categories: tournament.categories,
        isYouth: tournament.isYouth,
        name: tournament.name,
        displayName: tournament.displayName || tournament.nameEs,
        originalName: tournament.originalName,
      }) === selectedAudience
    ));

    if (!searchQuery) return audienceFiltered.slice(0, 10);
    return audienceFiltered.filter(t =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [internationalTournaments, searchQuery, selectedAudience]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groupedTournaments;

    const filtered: typeof groupedTournaments = {};
    Object.entries(groupedTournaments).forEach(([countryId, group]) => {
      const matchingTournaments = group.tournaments.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        group.countryName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      const matchesCountry = group.countryName.toLowerCase().includes(searchQuery.toLowerCase());
      if (matchingTournaments.length > 0 || matchesCountry) {
        filtered[countryId] = { ...group, tournaments: matchesCountry ? group.tournaments : matchingTournaments };
      }
    });
    return filtered;
  }, [groupedTournaments, searchQuery]);

  // Matches via unified hook (cache + prefetch 7 days + live polling)
  const { matches, loading, error: sourceError } = useMatchesStore(selectedDate, selectedSport.id);

  const loadedRugbyTournamentMap = useMemo(() => (
    new Map(loadedRugbyPublicTournaments.map((tournament) => [tournament.id, tournament]))
  ), [loadedRugbyPublicTournaments]);

  // --- Dynamic Matches Data Implementation ---
  const matchesByLeague = useMemo<LeagueMatches[]>(() => {
    const groups: Record<string, LeagueMatches> = {};
    // Secondary index to deduplicate tournaments by country+name across different IDs
    const dedupByKey = new Map<string, string>();
    // Strip a redundant country prefix that FlashScore sometimes embeds in tournament names.
    // e.g. countryName="South America", name="SOUTH AMERICA: Super Rugby Americas"
    // → cleaned = "Super Rugby Americas"
    matches.forEach(match => {
      const tournament = match.tournament;
      if (!tournament) return;
      if (resolveMatchAudience(tournament) !== selectedAudience) return;

      const overriddenTournament = tournament.id ? loadedRugbyTournamentMap.get(String(tournament.id)) : undefined;
      const rawCountryName = overriddenTournament
        ? (getCountryById(overriddenTournament.countryId || '')?.name || overriddenTournament.countryId || getTournamentCountryName(tournament))
        : getTournamentCountryName(tournament);
      const countryName = rawCountryName.replace(/\b\w/g, (c: string) => c.toUpperCase());
      const tournamentName = overriddenTournament?.displayName || overriddenTournament?.name || tournament.name;
      const tournamentPriority = Math.max(
        getTournamentPriority(tournament),
        overriddenTournament ? getTournamentPriority(overriddenTournament) : 0,
      );
      const cleanedName = cleanLeagueName(tournamentName, countryName);
      const isMotorsportGroup = selectedSport.id === 'motorsport';
      const dedupKey = `${countryName.toLowerCase()}::${cleanedName.toLowerCase()}`;

      const existingId = dedupByKey.get(dedupKey);
      const groupKey = isMotorsportGroup
        ? `${String(tournament.id || 'motorsport')}::${String(match.id)}`
        : (existingId ?? tournament.id);
      const favoriteLeagueId = String(tournament.id || groupKey);

      if (!groups[groupKey]) {
        groups[groupKey] = {
          league: `${countryName}: ${cleanedName}`,
          leagueId: groupKey,
          logoUrl: overriddenTournament?.logoUrl || (tournament as any)?.logoUrl || (tournament as any)?.logo_url || null,
          favoriteLeagueId,
          favoriteLeagueIds: favoriteLeagueId ? [favoriteLeagueId] : [],
          country: countryName,
          flag: '',
          round: match.roundId?.startsWith('F') ? match.roundId.replace('F', 'Fecha ') : (match.roundId || 'General'),
          priority: tournamentPriority,
          matches: []
        };
        if (!isMotorsportGroup) {
          dedupByKey.set(dedupKey, groupKey);
        }
      } else if (tournamentPriority > groups[groupKey].priority) {
        groups[groupKey].priority = tournamentPriority;
      }

      if (favoriteLeagueId) {
        const currentFavoriteIds = groups[groupKey].favoriteLeagueIds || [];
        if (!currentFavoriteIds.includes(favoriteLeagueId)) {
          currentFavoriteIds.push(favoriteLeagueId);
        }
        groups[groupKey].favoriteLeagueIds = currentFavoriteIds;
      }

      const { localTime: timeStr } = toLocalMatch(match.dateTime, userTimeZone);

      let status: 'live' | 'scheduled' | 'finished' = 'scheduled';
      if (match.status === 'live') status = 'live';
      if (match.status === 'final') status = 'finished';

      groups[groupKey].matches.push({
        id: match.id,
        time: timeStr,
        home: match.homeTeam?.name || 'Local',
        homeLogo: resolveTeamLogo(match.homeTeam),
        homeScore: typeof match.score?.home === 'number' ? match.score.home : (status === 'scheduled' ? null : 0),
        away: match.awayTeam?.name || 'Visita',
        awayLogo: resolveTeamLogo(match.awayTeam),
        awayScore: typeof match.score?.away === 'number' ? match.score.away : (status === 'scheduled' ? null : 0),
        status: status,
        // minutes will be calculated by the MatchRow component using the original dateTime
        minute: (match.clock?.period === 'HT' || match.clock?.period === 'ET' || match.clock?.period === 'Final') ? match.clock.period : undefined,
        _dateTime: match.dateTime, // Preserve for real-time calculation
        homeClubId: match.homeClubId,
        awayClubId: match.awayClubId,
        venue: match.venue || undefined,
        eventLabel: (match as any).eventName || undefined,
        footerLabel: match.status === 'live' ? 'Telemetry' : match.status === 'final' ? 'Race data' : 'Event details',
      } as any);
    });

    const leaguesArray = Object.values(groups);

    // Sort: favorited leagues first, then tournament priority, then alphabetically by name
    return leaguesArray.sort((a, b) => {
      const aIsFavorite = isLeagueGroupFavorite(a);
      const bIsFavorite = isLeagueGroupFavorite(b);

      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.league.localeCompare(b.league);
    });
  }, [isLeagueGroupFavorite, loadedRugbyTournamentMap, matches, resolveMatchAudience, selectedAudience, selectedSport.id, userTimeZone]);

  const favoriteClubMatches = useMemo(() => {
    const result: (Match & { leagueName: string })[] = [];
    const seenMatchIds = new Set<string>();
    for (const leagueGroup of matchesByLeague) {
      for (const m of leagueGroup.matches) {
        const hId = (m as any).homeClubId;
        const aId = (m as any).awayClubId;
        const isFavoriteClubMatch = (hId && isFavorite(hId, 'club')) || (aId && isFavorite(aId, 'club'));
        const matchKey = String(m.id);

        if (isFavoriteClubMatch && !seenMatchIds.has(matchKey)) {
          seenMatchIds.add(matchKey);
          result.push({ ...m, leagueName: leagueGroup.league });
        }
      }
    }
    return result;
  }, [matchesByLeague, isFavorite]);

  const favoriteClubMatchIds = useMemo(() => (
    new Set(favoriteClubMatches.map((match) => String(match.id)))
  ), [favoriteClubMatches]);

  const displayedMatchesByLeague = useMemo<LeagueMatches[]>(() => {
    const withoutFavoriteClubMatches = matchesByLeague
      .map((league) => ({
        ...league,
        matches: league.matches.filter((match) => !favoriteClubMatchIds.has(String(match.id))),
      }))
      .filter((league) => league.matches.length > 0);

    if (!showLiveOnly) return withoutFavoriteClubMatches;

    return withoutFavoriteClubMatches
      .map((league) => ({
        ...league,
        matches: league.matches.filter((match) => match.status === 'live'),
      }))
      .filter((league) => league.matches.length > 0);
  }, [favoriteClubMatchIds, matchesByLeague, showLiveOnly]);

  const displayedFavoriteClubMatches = useMemo(() =>
    showLiveOnly ? favoriteClubMatches.filter(m => m.status === 'live') : favoriteClubMatches,
    [favoriteClubMatches, showLiveOnly]
  );

  const liveMatchesCount = useMemo(() => (
    matchesByLeague.reduce((total, league) => (
      total + league.matches.filter((match) => match.status === 'live').length
    ), 0)
  ), [matchesByLeague]);

  const compareSidebarTournaments = useCallback((left: Tournament, right: Tournament) => {
    const leftFavorite = isLeagueFavorite(left.id);
    const rightFavorite = isLeagueFavorite(right.id);

    if (leftFavorite && !rightFavorite) return -1;
    if (!leftFavorite && rightFavorite) return 1;

    if (hasRugbyPublicCatalog) {
      const leftIsLocal = left.dataSource !== 'flashscore';
      const rightIsLocal = right.dataSource !== 'flashscore';

      if (leftIsLocal && !rightIsLocal) return -1;
      if (!leftIsLocal && rightIsLocal) return 1;
    }

    return compareTournamentsByPriority(left, right);
  }, [hasRugbyPublicCatalog, isLeagueFavorite]);

  const loadRugbyCountryTournaments = useCallback(async (countryId: string) => {
    if (!hasRugbyPublicCatalog || countryId === 'international') {
      return;
    }

    const group = groupedTournaments[countryId];
    if (!group?.externalCountryId || group.loading || group.loaded) {
      return;
    }

    setRugbyCountryGroups((prev) => ({
      ...prev,
      [countryId]: {
        externalCountryId: group.externalCountryId || '',
        countryName: group.countryName,
        flagEmoji: group.flagEmoji,
        tournaments: prev[countryId]?.tournaments || [],
        tournamentCount: prev[countryId]?.tournamentCount ?? group.tournamentCount ?? null,
        loading: true,
        loaded: false,
        error: null,
      },
    }));

    try {
      const searchParams = new URLSearchParams({
        sport: 'rugby',
        scope: 'country',
        audience: selectedAudience,
        external_country_id: group.externalCountryId,
        country_name: group.countryName,
      });

      if (group.flagEmoji) {
        searchParams.set('country_flag', group.flagEmoji);
      }

      const response = await fetch(`/api/public/tournaments?${searchParams.toString()}`, {
        cache: 'force-cache',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      const data = Array.isArray(payload.data) ? payload.data : [];
      const tournaments = data.map((item: PublicTournamentListItem) => mapPublicTournamentToTournament(item));

      setRugbyCountryGroups((prev) => ({
        ...prev,
        [countryId]: {
          externalCountryId: group.externalCountryId || '',
          countryName: group.countryName,
          flagEmoji: group.flagEmoji,
          tournaments,
          tournamentCount: tournaments.length,
          loading: false,
          loaded: true,
          error: null,
        },
      }));
    } catch (error) {
      console.error('Error fetching rugby country tournaments:', error instanceof Error ? error.message : 'Unknown error');
      setRugbyCountryGroups((prev) => ({
        ...prev,
        [countryId]: {
          externalCountryId: group.externalCountryId || '',
          countryName: group.countryName,
          flagEmoji: group.flagEmoji,
          tournaments: prev[countryId]?.tournaments || [],
          tournamentCount: prev[countryId]?.tournamentCount ?? group.tournamentCount ?? null,
          loading: false,
          loaded: false,
          error: 'No se pudieron cargar las ligas.',
        },
      }));
    }
  }, [groupedTournaments, hasRugbyPublicCatalog, selectedAudience]);

  const toggleCountry = useCallback((countryId: string) => {
    setExpandedCountries(prev => {
      const next = new Set(prev);
      if (next.has(countryId)) {
        next.delete(countryId);
      } else {
        next.add(countryId);
      }
      return next;
    });
  }, []);

  const toggleLeague = (leagueId: string) => {
    setExpandedLeagueIds(prev => {
      const next = new Set(prev);
      if (next.has(leagueId)) next.delete(leagueId);
      else next.add(leagueId);
      return next;
    });
  };

  const toggleCompetitionCollapse = (leagueId: string) => {
    setCollapsedLeagues(prev => {
      const next = new Set(prev);
      if (next.has(leagueId)) next.delete(leagueId);
      else next.add(leagueId);
      return next;
    });
  };

  const sortedCountryIds = Object.keys(filteredGroups).sort((a, b) =>
    filteredGroups[a].countryName.localeCompare(filteredGroups[b].countryName)
  );

  const getCountryTournamentCount = useCallback((group: TournamentCountryGroup) => {
    if (typeof group.tournamentCount === 'number') {
      return group.tournamentCount;
    }

    if (group.loaded || !group.externalCountryId) {
      return group.tournaments.length;
    }

    return null;
  }, []);

  const visibleTournamentCount = useMemo(() => (
    filteredInternational.length +
    sortedCountryIds.reduce((acc, id) => {
      const count = getCountryTournamentCount(filteredGroups[id]);
      return acc + (typeof count === 'number' ? count : filteredGroups[id].tournaments.length);
    }, 0)
  ), [filteredGroups, filteredInternational.length, getCountryTournamentCount, sortedCountryIds]);

  useEffect(() => {
    if (selectedSport.id !== 'rugby') {
      setRugbyCountrySummaries([]);
      setRugbyCountryGroups({});
      setRugbyPublicCatalogReady(false);
      return;
    }

    const controller = new AbortController();

    async function fetchRugbyCountrySummaries() {
      try {
        const searchParams = new URLSearchParams({
          sport: 'rugby',
          scope: 'summary',
        });

        const response = await fetch(`/api/public/tournaments?${searchParams.toString()}`, {
          cache: 'force-cache',
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          console.error('Error fetching rugby country summaries:', payload.error || `HTTP ${response.status}`);
          setRugbyCountrySummaries([]);
          setRugbyCountryGroups({});
          setRugbyPublicCatalogReady(false);
          return;
        }

        const countries = Array.isArray(payload.data?.countries) ? payload.data.countries : [];
        setRugbyCountrySummaries(countries);
        setRugbyPublicCatalogReady(true);
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }

        console.error('Error fetching rugby country summaries:', error instanceof Error ? error.message : 'Unknown error');
        setRugbyCountrySummaries([]);
        setRugbyCountryGroups({});
        setRugbyPublicCatalogReady(false);
      }
    }

    setRugbyPublicCatalogReady(false);
    fetchRugbyCountrySummaries();

    return () => controller.abort();
  }, [selectedSport.id]);

  useEffect(() => {
    if (selectedSport.id === 'rugby') {
      setRugbyCountryGroups({});
    }
  }, [selectedAudience, selectedSport.id]);

  useEffect(() => {
    if (!hasRugbyPublicCatalog) {
      return;
    }

    expandedCountries.forEach((countryId) => {
      if (countryId !== 'international') {
        void loadRugbyCountryTournaments(countryId);
      }
    });
  }, [expandedCountries, hasRugbyPublicCatalog, loadRugbyCountryTournaments]);

  useEffect(() => {
    const generatedDates = generateDates(userTimeZone);
    setDates(generatedDates);
    const today = generatedDates.find(d => d.isToday)?.date || '';
    setSelectedDate(today);

    // Fetch real news
    fetch('/api/news')
      .then(res => res.json())
      .then(json => {
        if (json.data) setNews(json.data);
      })
      .catch(err => console.error('Error fetching news:', err));

    // Fetch manual tournaments
    async function fetchManualTournaments() {
      try {
        const response = await fetch('/api/home/manual-tournaments', { cache: 'default' });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          console.error('Error fetching manual tournaments:', payload.error || `HTTP ${response.status}`);
          return;
        }

        const data = Array.isArray(payload.data) ? payload.data as ManualTournamentApiItem[] : [];
        const mapped: Tournament[] = data.map((t) => ({
          id: t.id,
          name: t.display_name || t.name,
          nameEs: t.display_name || t.name,
          url: `/tournaments/${t.id}`,
          type: 'local',
          sportId: t.sport_id as Tournament['sportId'],
          countryId: resolveCountryId(t.country_id, t.country),
          priority: typeof t.priority === 'number' ? t.priority : 0,
          logoUrl: t.logo_url,
          categories: t.category ? [t.category.toLowerCase()] : [],
          seasons: t.season_id ? [{ seasonId: String(t.season_id), teamsCount: 0, isActive: true }] : [],
          isVisible: t.is_visible,
          isWomen: t.category?.toLowerCase() === 'women',
          isYouth: resolveTournamentAudience({ ageGrade: t.age_grade, category: t.category }) === 'juveniles',
          ageGroup: t.age_grade,
          format: t.format,
        }));
        setManualTournamentsList(mapped);
      } catch (error) {
        console.error('Error fetching manual tournaments:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    fetchManualTournaments();
  }, [userTimeZone]);

  // Precise scroll centering logic
  const centerActiveDate = () => {
    if (activeDateRef.current && dateListRef.current) {
      const container = dateListRef.current;
      const target = activeDateRef.current;

      const targetCenter = target.offsetLeft + (target.offsetWidth / 2);
      const containerCenter = container.offsetWidth / 2;

      container.scrollTo({
        left: targetCenter - containerCenter,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    // Initial scroll
    const timer = setTimeout(centerActiveDate, 150);

    // Centering on resize
    const observer = new ResizeObserver(() => {
      centerActiveDate();
    });

    if (dateListRef.current) {
      observer.observe(dateListRef.current);
    }

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [selectedDate, dates]);

  const selectedDateInfo = dates.find(d => d.date === selectedDate);

  const isIndividualSport = INDIVIDUAL_SPORTS.has(selectedSport.id);
  const isMotorsportSport = selectedSport.id === 'motorsport';

  useEffect(() => {
    setShowLiveOnly(false);
  }, [selectedDate, selectedSport.id]);

  useEffect(() => {
    if (liveMatchesCount === 0) {
      setShowLiveOnly(false);
    }
  }, [liveMatchesCount]);

  useEffect(() => {
    setExpandedCountries(new Set(selectedAudience === 'mayores' ? ['international'] : []));
    setExpandedLeagueIds(new Set());
    setCollapsedLeagues(new Set());
    setMobileTournamentsOpen(false);
  }, [selectedAudience]);

  useEffect(() => {
    setMobileTournamentsOpen(false);
  }, [selectedSport.id]);

  const navigateDate = (direction: 'prev' | 'next') => {
    if (!selectedDate || dates.length === 0) return;
    const currentIndex = dates.findIndex(d => d.date === selectedDate);
    if (currentIndex === -1) return;

    if (direction === 'prev' && currentIndex > 0) {
      setSelectedDate(dates[currentIndex - 1].date);
    } else if (direction === 'next' && currentIndex < dates.length - 1) {
      setSelectedDate(dates[currentIndex + 1].date);
    }
  };

  return (
    <div className={styles.page}>

      <div className={styles.mainLayout}>


        {/* Left Sidebar - Navigation (Restored) */}
        <aside className={styles.sidebarLeft}>
          <div className={styles.sidebarUnifiedCard}>

            {/* Sport Switcher */}
            <div className={styles.sportSwitch}>
              <button
                className={styles.sportSwitchBtn}
                onClick={() => setIsSportMenuOpen(!isSportMenuOpen)}
                aria-expanded={isSportMenuOpen}
              >
                <div className={styles.sportSwitchIcon}>{selectedSport.icon}</div>
                <div className={styles.sportSwitchLabel}>
                  <span className={styles.sportSwitchName}>{selectedSport.nameEs}</span>
                  <span className={styles.sportSwitchHint}>Deporte activo</span>
                </div>
                <svg
                  className={styles.sportSwitchChevron}
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              <div className={`${styles.sportMenu} ${isSportMenuOpen ? styles.sportMenuOpen : ''}`}>
                {sortedActiveSports.map(sport => (
                  <div
                    key={sport.id}
                    className={`${styles.sportMenuItem} ${selectedSport.id === sport.id ? styles.sportMenuItemActive : ''}`}
                    onClick={() => {
                      setSelectedSport(sport);
                      setIsSportMenuOpen(false);
                    }}
                  >
                    <span>{sport.icon}</span>
                    <span>{sport.nameEs}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.audienceSwitch} role="tablist" aria-label="Segmento de torneos">
              {(['mayores', 'juveniles'] as TournamentAudience[]).map((audience) => (
                <button
                  key={audience}
                  type="button"
                  className={`${styles.audienceSwitchBtn} ${selectedAudience === audience ? styles.audienceSwitchBtnActive : ''}`}
                  onClick={() => setSelectedAudience(audience)}
                >
                  {audience === 'mayores' ? 'Mayores' : 'Juveniles'}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className={styles.sidebarSearchArea}>
              <svg className={styles.sidebarSearchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder={selectedAudience === 'juveniles'
                  ? `Filtrar juveniles de ${selectedSport.nameEs}...`
                  : selectedSport.id === 'tennis'
                    ? `Filtrar torneos de ${selectedSport.nameEs}...`
                    : `Filtrar ligas de ${selectedSport.nameEs}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.sidebarSearchInput}
                suppressHydrationWarning
              />
            </div>

            {/* Tournament List with Accordion */}
            <div className={styles.accordionList}>
              {/* International Section */}
              {filteredInternational.length > 0 && (
                <div className={styles.accordionItem}>
                  <button
                    onClick={() => toggleCountry('international')}
                    className={`${styles.accordionHeader} ${expandedCountries.has('international') ? styles.active : ''}`}
                  >
                    <div className={styles.accordionHeaderContent}>
                      <span></span>
                      <span>{`Internacional (${filteredInternational.length})`}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg
                        className={styles.chevron}
                        style={{ transform: expandedCountries.has('international') ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                  </button>

                  <div className={`${styles.accordionContent} ${expandedCountries.has('international') ? styles.open : ''}`}>
                    {filteredInternational
                      .slice()
                      .sort(compareSidebarTournaments)
                      .map((tournament) => (
                      <Link
                        key={tournament.id}
                        href={`/tournaments/${tournament.id}`}
                        className={styles.accordionItemLink}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        {isLeagueFavorite(tournament.id) && <Star size={11} fill="currentColor" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />}
                        <span>{tournament.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Countries */}
              {sortedCountryIds.map((countryId) => {
                const group = filteredGroups[countryId];
                const isExpanded = expandedCountries.has(countryId);
                const countryTournamentCount = getCountryTournamentCount(group);

                return (
                  <div key={countryId} className={styles.accordionItem}>
                    <button
                      onClick={() => toggleCountry(countryId)}
                      className={`${styles.accordionHeader} ${isExpanded ? styles.active : ''}`}
                    >
                      <div className={styles.accordionHeaderContent}>
                        <span>{group.flagEmoji}</span>
                        <span>
                          {countryTournamentCount === null
                            ? group.countryName
                            : `${group.countryName} (${countryTournamentCount})`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg
                          className={styles.chevron}
                          style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
                    </button>

                    <div className={`${styles.accordionContent} ${isExpanded ? styles.open : ''}`}>
                      {group.loading && group.tournaments.length === 0 && (
                        <div className={styles.audienceEmptyState}>Cargando ligas...</div>
                      )}
                      {!group.loading && group.error && group.tournaments.length === 0 && (
                        <div className={styles.audienceEmptyState}>{group.error}</div>
                      )}
                      {!group.loading && group.tournaments
                        .slice()
                        .sort(compareSidebarTournaments)
                        .map((tournament) => {
                        // Check if tournament has sub-items (Seasons)
                        const hasSubItems = tournament.seasons && tournament.seasons.length > 0;
                        const isLeagueExpanded = expandedLeagueIds.has(tournament.id);
                        const isFavLeague = isLeagueFavorite(tournament.id);

                        if (hasSubItems) {
                          return (
                            <div key={tournament.id} className={styles.accordionItemLinkWrapper}>
                              <div
                                className={`${styles.accordionItemHeader} ${isLeagueExpanded ? styles.active : ''}`}
                                style={{ display: 'flex', alignItems: 'center', padding: 0, width: '100%' }}
                              >
                                <Link
                                  href={`/tournaments/${tournament.id}`}
                                  style={{ flex: 1, padding: '10px 16px', color: 'inherit', textDecoration: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                  {isFavLeague && <Star size={11} fill="currentColor" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />}
                                  {tournament.name}
                                </Link>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleLeague(tournament.id);
                                  }}
                                  style={{
                                    padding: '10px 16px',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'inherit',
                                    display: 'flex',
                                    alignItems: 'center'
                                  }}
                                >
                                  <svg
                                    className={styles.chevron}
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    style={{ transform: isLeagueExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                  >
                                    <path d="M9 18l6-6-6-6" />
                                  </svg>
                                </button>
                              </div>
                              <div className={`${styles.accordionItemContent} ${isLeagueExpanded ? styles.open : ''}`}>
                                {tournament.seasons!.map(season => (
                                  <Link
                                    key={season.seasonId}
                                    href={`/tournaments/${tournament.id}?season=${season.seasonId}`}
                                    className={styles.accordionSubItemLink}
                                  >
                                    Temporada {season.seasonId}
                                  </Link>
                                ))}
                              </div>
                            </div>

                          );
                        } else {
                          return (
                            <Link
                              key={tournament.id}
                              href={`/tournaments/${tournament.id}`}
                              className={styles.accordionItemLink}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                              {isFavLeague && <Star size={11} fill="currentColor" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />}
                              <span>{tournament.name}</span>
                            </Link>
                          );
                        }
                      })}
                    </div>
                  </div>
                );
              })}

              {filteredInternational.length === 0 && sortedCountryIds.length === 0 && (
                <div className={styles.audienceEmptyState}>
                  {selectedAudience === 'juveniles'
                    ? 'No hay torneos juveniles cargados para este deporte.'
                    : 'No hay torneos disponibles para este deporte.'}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content - Matches */}
        <main className={styles.mainContent}>
          <div className={styles.mobileTopControls}>
            {/* Sport Selector (Mobile) */}
            <div className={styles.mobileSportSelector}>
              {sortedActiveSports.map(sport => (
                <button
                  key={sport.id}
                  type="button"
                  aria-label={sport.nameEs}
                  className={`${styles.sportChip} ${selectedSport.id === sport.id ? styles.active : ''}`}
                  onClick={() => setSelectedSport(sport)}
                >
                  <span className={styles.sportIcon}>{sport.icon}</span>
                  <span className={styles.sportName}>{sport.nameEs}</span>
                </button>
              ))}
            </div>

            <div className={styles.mobileAudienceSwitch} role="tablist" aria-label="Segmento de torneos">
              {(['mayores', 'juveniles'] as TournamentAudience[]).map((audience) => (
                <button
                  key={audience}
                  type="button"
                  className={`${styles.mobileAudienceSwitchBtn} ${selectedAudience === audience ? styles.mobileAudienceSwitchBtnActive : ''}`}
                  onClick={() => setSelectedAudience(audience)}
                >
                  {audience === 'mayores' ? 'Mayores' : 'Juveniles'}
                </button>
              ))}
            </div>

            <InstallAppButton />

            {/* Date Selector */}
            <section className={styles.dateSelector}>
              <div className={styles.dateSelectorInner}>
                {/* Desktop/Tablet Scrolling List */}
                <div className={styles.dateList} ref={dateListRef}>
                  {dates.map((date) => (
                    <button
                      key={date.date}
                      ref={selectedDate === date.date ? activeDateRef : null}
                      className={`${styles.dateItem} ${selectedDate === date.date ? styles.active : ''} ${date.isToday ? styles.today : ''}`}
                      onClick={() => setSelectedDate(date.date)}
                    >
                      <span className={styles.dateLabel}>{date.label}</span>
                    </button>
                  ))}
                </div>

                {/* Mobile Arrows Navigation */}
                <div className={styles.mobileDateNav}>
                  <button
                    className={styles.mobileNavArrow}
                    onClick={() => navigateDate('prev')}
                    disabled={!selectedDate || dates.findIndex(d => d.date === selectedDate) <= 0}
                  >
                    <ChevronLeft size={20} />
                  </button>

                  <span className={styles.mobileCurrentDate}>
                    {selectedDateInfo?.label || selectedDate}
                  </span>

                  <button
                    className={styles.mobileNavArrow}
                    onClick={() => navigateDate('next')}
                    disabled={!selectedDate || dates.findIndex(d => d.date === selectedDate) >= dates.length - 1}
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            </section>

            {/* Mobile Tournament List */}
            <div className={styles.mobileTournamentList}>
              <button
                type="button"
                className={styles.mobileTournamentToggle}
                onClick={() => setMobileTournamentsOpen(prev => !prev)}
                aria-expanded={mobileTournamentsOpen}
              >
                <Trophy size={14} />
                <span>
                  {hasRugbyPublicCatalog
                    ? 'Torneos de Rugby'
                    : `Torneos de ${selectedSport.nameEs}`}
                </span>
                <span className={styles.mobileTournamentCount}>
                  {visibleTournamentCount}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{
                    transform: mobileTournamentsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    marginLeft: 'auto',
                  }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              <div className={`${styles.mobileTournamentPanel} ${mobileTournamentsOpen ? styles.mobileTournamentPanelOpen : ''}`}>
                <div className={styles.accordionList}>
                  {/* International section */}
                  {filteredInternational.length > 0 && (
                    <div className={styles.accordionItem}>
                      <button
                        type="button"
                        onClick={() => toggleCountry('international')}
                        className={`${styles.accordionHeader} ${expandedCountries.has('international') ? styles.active : ''}`}
                      >
                        <div className={styles.accordionHeaderContent}>
                          <span>🌐</span>
                          <span>{`Internacional (${filteredInternational.length})`}</span>
                        </div>
                        <svg
                          className={styles.chevron}
                          style={{ transform: expandedCountries.has('international') ? 'rotate(180deg)' : 'rotate(0deg)' }}
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                      <div className={`${styles.accordionContent} ${expandedCountries.has('international') ? styles.open : ''}`}>
                        {filteredInternational.slice().sort(compareSidebarTournaments).map((tournament) => (
                          <Link
                            key={tournament.id}
                            href={`/tournaments/${tournament.id}`}
                            className={styles.accordionItemLink}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            onClick={() => setMobileTournamentsOpen(false)}
                          >
                            {isLeagueFavorite(tournament.id) && (
                              <Star size={11} fill="currentColor" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                            )}
                            <span>{tournament.name}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Country sections */}
                  {sortedCountryIds.map((countryId) => {
                    const group = filteredGroups[countryId];
                    const isExpanded = expandedCountries.has(countryId);
                    const countryTournamentCount = getCountryTournamentCount(group);

                    return (
                      <div key={countryId} className={styles.accordionItem}>
                        <button
                          type="button"
                          onClick={() => toggleCountry(countryId)}
                          className={`${styles.accordionHeader} ${isExpanded ? styles.active : ''}`}
                        >
                          <div className={styles.accordionHeaderContent}>
                            <span>{group.flagEmoji}</span>
                            <span>
                              {countryTournamentCount === null
                                ? group.countryName
                                : `${group.countryName} (${countryTournamentCount})`}
                            </span>
                          </div>
                          <svg
                            className={styles.chevron}
                            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                        <div className={`${styles.accordionContent} ${isExpanded ? styles.open : ''}`}>
                          {group.loading && group.tournaments.length === 0 && (
                            <div className={styles.audienceEmptyState}>Cargando ligas...</div>
                          )}
                          {!group.loading && group.error && group.tournaments.length === 0 && (
                            <div className={styles.audienceEmptyState}>{group.error}</div>
                          )}
                          {!group.loading && group.tournaments.slice().sort(compareSidebarTournaments).map((tournament) => (
                            <Link
                              key={tournament.id}
                              href={`/tournaments/${tournament.id}`}
                              className={styles.accordionItemLink}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                              onClick={() => setMobileTournamentsOpen(false)}
                            >
                              {isLeagueFavorite(tournament.id) && (
                                <Star size={11} fill="currentColor" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                              )}
                              <span>{tournament.name}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {filteredInternational.length === 0 && sortedCountryIds.length === 0 && (
                    <div className={styles.audienceEmptyState}>
                      {selectedAudience === 'juveniles'
                        ? 'No hay torneos juveniles cargados para este deporte.'
                        : 'No hay torneos disponibles para este deporte.'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Matches by League */}
          <div className={styles.matchesSection}>
            {/* Live Banner - Outside Grid for Layout Consistency */}
            {liveMatchesCount > 0 && (
              <button
                type="button"
                className={`${styles.liveBanner} ${showLiveOnly ? styles.liveBannerActive : ''}`}
                onClick={() => setShowLiveOnly((prev) => !prev)}
                aria-pressed={showLiveOnly}
              >
                <span className={styles.liveDot}></span>
                <span>{liveMatchesCount} partido{liveMatchesCount > 1 ? 's' : ''} en vivo</span>
                <span className={styles.liveBannerAction}>
                  {showLiveOnly ? 'Ver todos' : 'Ver en vivo'}
                </span>
              </button>
            )}

            <div className={styles.matchesContainer}>
              {sourceError?.message && (
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '8px 12px',
                  marginBottom: '8px',
                  borderRadius: '6px',
                  background: sourceError.flashscore && sourceError.supabase
                    ? 'rgba(255,60,60,0.08)'
                    : sourceError.flashscoreFromCache
                      ? 'rgba(100,180,255,0.07)'
                      : 'rgba(255,160,0,0.08)',
                  border: sourceError.flashscore && sourceError.supabase
                    ? '1px solid rgba(255,80,80,0.2)'
                    : sourceError.flashscoreFromCache
                      ? '1px solid rgba(100,180,255,0.15)'
                      : '1px solid rgba(255,160,0,0.2)',
                  fontSize: '0.75rem',
                  color: sourceError.flashscore && sourceError.supabase
                    ? '#ff8080'
                    : sourceError.flashscoreFromCache
                      ? '#80b8ff'
                      : 'var(--color-text-dim)',
                  alignItems: 'center'
                }}>
                  <span style={{ opacity: 0.8 }}>{sourceError.message}</span>
                </div>
              )}
              {/* Source error indicator — shown when FlashScore or Supabase is down */}
              {sourceError?.scenario === 'fs_cache' && (
                <div style={{
                  display: 'flex', gap: '8px', padding: '8px 12px', marginBottom: '8px',
                  borderRadius: '6px', background: 'rgba(100,180,255,0.07)',
                  border: '1px solid rgba(100,180,255,0.15)',
                  fontSize: '0.75rem', color: '#80b8ff',
                  alignItems: 'center'
                }}>
                  <span style={{ opacity: 0.8 }}>Datos de FlashScore desde caché — puede haber un leve retraso.</span>
                </div>
              )}
              {sourceError?.scenario === 'fs_down_db_ok' && (
                <div style={{
                  display: 'flex', gap: '8px', padding: '8px 12px', marginBottom: '8px',
                  borderRadius: '6px', background: 'rgba(255,160,0,0.08)',
                  border: '1px solid rgba(255,160,0,0.2)',
                  fontSize: '0.75rem', color: 'var(--color-text-dim)',
                  alignItems: 'center'
                }}>
                  <span style={{ opacity: 0.8 }}>FlashScore no disponible — mostrando solo partidos locales.</span>
                </div>
              )}
              {sourceError?.scenario === 'db_down_fs_ok' && (
                <div style={{
                  display: 'flex', gap: '8px', padding: '8px 12px', marginBottom: '8px',
                  borderRadius: '6px', background: 'rgba(255,160,0,0.08)',
                  border: '1px solid rgba(255,160,0,0.2)',
                  fontSize: '0.75rem', color: 'var(--color-text-dim)',
                  alignItems: 'center'
                }}>
                  <span style={{ opacity: 0.8 }}>Partidos de la base de datos no disponibles — solo datos de FlashScore.</span>
                </div>
              )}
              {sourceError?.scenario === 'both_down' && (
                <div style={{
                  display: 'flex', gap: '8px', padding: '8px 12px', marginBottom: '8px',
                  borderRadius: '6px', background: 'rgba(255,60,60,0.08)',
                  border: '1px solid rgba(255,80,80,0.2)',
                  fontSize: '0.75rem', color: '#ff8080',
                  alignItems: 'center'
                }}>
                  <span>Sin conexión a las fuentes de datos — los datos pueden estar incompletos o ausentes.</span>
                </div>
              )}

              {loading && (
                <div className={styles.noMatches}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      border: '3px solid rgba(255,255,255,0.1)',
                      borderTopColor: 'var(--color-accent)',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      marginBottom: '16px'
                    }}
                  />
                  <style jsx>{`
                    @keyframes spin {
                      to { transform: rotate(360deg); }
                    }
                  `}</style>
                  <p>Cargando partidos...</p>
                </div>
              )}

              {!loading && displayedMatchesByLeague.length === 0 && displayedFavoriteClubMatches.length === 0 && !sourceError && (
                <div className={styles.noMatches}>
                  <div className={styles.noMatchesIcon}></div>
                  <h3>
                    {showLiveOnly
                      ? 'No hay partidos en vivo'
                      : selectedAudience === 'juveniles'
                        ? 'No hay partidos juveniles programados'
                        : 'No hay partidos programados'}
                  </h3>
                  <p>
                    {showLiveOnly
                      ? `No se encontraron encuentros en vivo para ${selectedAudience}.`
                      : selectedAudience === 'juveniles'
                        ? 'No se encontraron encuentros juveniles para esta fecha.'
                        : 'No se encontraron encuentros para esta fecha.'}
                  </p>
                </div>
              )}

              {!loading && displayedMatchesByLeague.length === 0 && displayedFavoriteClubMatches.length === 0 && sourceError && (
                <div className={styles.noMatches}>
                  <div className={styles.noMatchesIcon}></div>
                  <h3>No se pudieron cargar los partidos</h3>
                  {sourceError.message ? <p>{sourceError.message}</p> : null}
                  <p>Hay un problema de conexión con una o más fuentes de datos.</p>
                </div>
              )}

              {!loading && displayedFavoriteClubMatches.length > 0 && (
                <div className={styles.leagueSection}>
                  <div className={styles.leagueSectionHeader}>
                    <div className={styles.leagueInfo}>
                      <Star size={16} fill="currentColor" style={{ color: 'var(--accent, #f59e0b)' }} />
                      <div className={styles.leagueMeta}>
                        <span className={styles.leagueSectionName} style={{ marginLeft: 8 }}>Mis Equipos</span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.matchesListWrapper}>
                    <div className={styles.matchesList}>
                      {displayedFavoriteClubMatches.map((match) => (
                        <div key={match.id}>
                          <MatchRow
                            match={match as any}
                            selectedSport={selectedSport}
                            styles={styles}
                            isIndividualSport={isIndividualSport}
                            showClubFavorites={FAVORITES_ENABLED}
                            isClubFavorite={isClubFavorite}
                            onToggleClubFavorite={toggleClubFavorite}
                          />
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary, #888)', padding: '0 12px 6px', marginTop: '-4px' }}>
                            {match.leagueName}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!loading && displayedMatchesByLeague.map((league) => {
                const isCollapsed = collapsedLeagues.has(league.leagueId);
                const isFavoriteLeague = isLeagueGroupFavorite(league);

                if (isMotorsportSport) {
                  const eventMatch = league.matches[0];
                  if (!eventMatch) return null;

                  return (
                    <div key={league.leagueId} className={styles.motorsportStandaloneCard}>
                      {FAVORITES_ENABLED && (
                        <div className={styles.motorsportStandaloneActions}>
                          <button
                            className={`${styles.leagueFavoriteBtn} ${styles.motorsportLeagueFavoriteBtn}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void toggleLeagueGroupFavorite(league);
                            }}
                            aria-label={isFavoriteLeague ? "Quitar de favoritos" : "Agregar a favoritos"}
                          >
                            <Star size={18} fill={isFavoriteLeague ? "currentColor" : "none"} strokeWidth={isFavoriteLeague ? 0 : 2} />
                          </button>
                        </div>
                      )}
                      <MotorsportMatchRow
                        match={eventMatch as any}
                        styles={styles}
                      />
                    </div>
                  );
                }

                return (
                  <div key={league.leagueId} className={styles.leagueSection}>
                    <div className={`${styles.leagueSectionHeader} ${isCollapsed ? styles.collapsed : ''}`}
                      onClick={() => toggleCompetitionCollapse(league.leagueId)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Link
                        href={`/tournaments/${league.leagueId}?sport=${selectedSport.id}`}
                        className={styles.leagueHeaderLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className={styles.leagueInfo}>
                          <span className={styles.leagueFlag}>{league.flag}</span>
                          <div className={styles.leagueMeta}>
                            <span className={styles.leagueSectionName}>{league.league}</span>
                            {/* <span className={styles.leagueRound}>{league.round}</span> */}
                          </div>
                        </div>
                      </Link>

                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {FAVORITES_ENABLED && (
                          <button
                            className={styles.leagueFavoriteBtn}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void toggleLeagueGroupFavorite(league);
                            }}
                            aria-label={isFavoriteLeague ? "Quitar de favoritos" : "Agregar a favoritos"}
                          >
                            <Star size={18} fill={isFavoriteLeague ? "currentColor" : "none"} strokeWidth={isFavoriteLeague ? 0 : 2} />
                          </button>
                        )}

                        <svg
                          className={styles.chevronHeader}
                          width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
                    </div>

                    <div className={`${styles.matchesListWrapper} ${isCollapsed ? styles.collapsed : ''}`}>
                      <div className={styles.matchesList}>
                        {league.matches.map((match) => (
                          <MatchRow 
                            key={match.id} 
                            match={match as any} 
                            selectedSport={selectedSport} 
                            styles={styles} 
                            isIndividualSport={isIndividualSport}
                            showClubFavorites={FAVORITES_ENABLED}
                            isClubFavorite={isClubFavorite}
                            onToggleClubFavorite={toggleClubFavorite}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        {/* Right Sidebar - News Only */}
        <aside className={styles.sidebarRight}>
          <div className={styles.sidebarSection}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div className={styles.sidebarSectionTitle} style={{ marginBottom: 0 }}>Noticias Recientes</div>
              <Link href="/noticias" style={{ fontSize: '0.8rem', color: 'var(--color-accent)', textDecoration: 'none', fontWeight: 500 }}>
                Ver noticias →
              </Link>
            </div>
            <div className={styles.newsList}>
              {news.slice(0, 5).map((item) => (
                <Link key={item.id} href={`/noticias/${item.id}`} className={styles.newsCard}>
                  <div
                    className={styles.newsImage}
                    style={{ backgroundImage: item.image_url ? `url(${item.image_url})` : 'none', backgroundSize: 'cover' }}
                  >
                    {!item.image_url && <Trophy size={16} style={{ opacity: 0.2 }} />}
                  </div>
                  <div className={styles.newsContent}>
                    <span className={styles.newsCategory}>Rugby</span>
                    <h3 className={styles.newsTitle}>{item.title}</h3>
                    <span className={styles.newsTime}>
                      {item.published_at ? new Date(item.published_at).toLocaleDateString() : 'Reciente'}
                    </span>
                  </div>
                </Link>
              ))}
              {news.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '0.8rem' }}>
                  No hay noticias.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div >
    </div >
  );
}
