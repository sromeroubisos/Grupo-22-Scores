'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Calendar, Trophy, Users, MapPin, ChevronRight, ChevronLeft, Share2, Star, Download } from 'lucide-react';
import Link from 'next/link';
import styles from './page.module.css';
import { useSport } from '@/context/SportContext';
import { getTournamentsBySport, getInternationalTournamentsBySport } from '@/lib/data/tournaments/index';
import { getCountryById } from '@/lib/data/countries';
import { getActiveSports } from '@/lib/data/sports';
import type { Tournament } from '@/lib/types'; // Keep this for existing tournament logic
import { useFavorites } from '@/hooks/useFavorites';
import { useMatchesStore } from '@/hooks/useMatchesStore';
import TournamentLeader from '@/components/TournamentLeader';
import { toLocalMatch, generateLocalDateKeys } from '@/lib/timezone';
import { calculateVirtualMatchTime } from '@/lib/virtualClock';
import { createClient } from '@/lib/supabase/client';

// Individual sports use player faces instead of team shields
const INDIVIDUAL_SPORTS = new Set([
  'tennis', 'boxing', 'mma', 'darts', 'snooker', 'golf',
  'cycling', 'horse-racing', 'table-tennis', 'badminton',
  'motorsport', 'esports'
]);

// Group tournaments by country helper
function groupTournamentsByCountry(tournaments: Tournament[]) {
  const groups: Record<string, { countryName: string; flagEmoji: string; tournaments: Tournament[] }> = {};

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
    group.tournaments.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  });

  return groups;
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
}

interface LeagueMatches {
  league: string;
  leagueId: string;
  country: string;
  flag: string;
  round: string;
  matches: Match[];
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



export default function HomePage() {

  const [selectedDate, setSelectedDate] = useState('');
  const [dates, setDates] = useState<ReturnType<typeof generateDates>>([]);
  const [news, setNews] = useState<any[]>([]);
  const [manualTournamentsList, setManualTournamentsList] = useState<Tournament[]>([]);

  const { selectedSport, setSelectedSport } = useSport();
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set(['international']));
  const [expandedLeagueIds, setExpandedLeagueIds] = useState<Set<string>>(new Set()); // Level 2 Accordion
  const [collapsedLeagues, setCollapsedLeagues] = useState<Set<string>>(new Set()); // Main Content Collapse
  const [searchQuery, setSearchQuery] = useState('');
  const [isSportMenuOpen, setIsSportMenuOpen] = useState(false);
  const dateListRef = useRef<HTMLDivElement>(null);
  const activeDateRef = useRef<HTMLButtonElement>(null);

  // Detect user timezone once (stable across re-renders)
  const userTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  // Favorites hook
  const { toggleLeagueFavorite, isLeagueFavorite } = useFavorites();

  // Get active sports for switcher
  const activeSports = useMemo(() => getActiveSports(), []);

  // Get tournaments for selected sport
  const allTournaments = useMemo(() => getTournamentsBySport(selectedSport.id), [selectedSport.id]);
  const internationalTournaments = useMemo(() => getInternationalTournamentsBySport(selectedSport.id), [selectedSport.id]);

  // Group local tournaments by country
  const localTournaments = useMemo(() => {
    const sportManualTournaments = manualTournamentsList.filter(t => t.sportId === selectedSport.id);
    const combined = [...sportManualTournaments, ...allTournaments];
    return combined.filter(t => t.type === 'local' || t.type === 'cup');
  }, [allTournaments, manualTournamentsList, selectedSport.id]);

  const groupedTournaments = useMemo(() => groupTournamentsByCountry(localTournaments), [localTournaments]);

  // Filter logic
  const filteredInternational = useMemo(() => {
    if (!searchQuery) return internationalTournaments.slice(0, 10);
    return internationalTournaments.filter(t =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [internationalTournaments, searchQuery]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groupedTournaments;

    const filtered: typeof groupedTournaments = {};
    Object.entries(groupedTournaments).forEach(([countryId, group]) => {
      const matchingTournaments = group.tournaments.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        group.countryName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (matchingTournaments.length > 0) {
        filtered[countryId] = { ...group, tournaments: matchingTournaments };
      }
    });
    return filtered;
  }, [groupedTournaments, searchQuery]);

  // Matches via unified hook (cache + prefetch 7 days + live polling)
  const { matches, loading, liveCount: hookLiveCount, error: sourceError } = useMatchesStore(selectedDate, selectedSport.id);

  // Live timer: tick every second so live match minutes update in real-time
  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => {
    const hasLive = matches.some(m => m.status === 'live');
    if (!hasLive) return;
    const id = setInterval(() => setLiveTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [matches]);

  // --- Dynamic Matches Data Implementation ---
  // liveTick is included so live minute displays update every second
  const matchesByLeague = useMemo<LeagueMatches[]>(() => {
    const groups: Record<string, LeagueMatches> = {};
    // Secondary index to deduplicate tournaments by country+name across different IDs
    const dedupByKey = new Map<string, string>();
    const now = Date.now();

    // Strip a redundant country prefix that FlashScore sometimes embeds in tournament names.
    // e.g. countryName="South America", name="SOUTH AMERICA: Super Rugby Americas"
    // → cleaned = "Super Rugby Americas"
    function cleanLeagueName(name: string, country: string): string {
      if (!name || !country) return name || '';
      const prefix = country.toUpperCase() + ':';
      if (name.toUpperCase().trimStart().startsWith(prefix)) {
        return name.slice(name.indexOf(':') + 1).trim();
      }
      return name;
    }

    matches.forEach(match => {
      // API returns enriched data (match.homeTeam, match.tournament, etc.)
      const tournament = match.tournament;

      // Basic validation (API filters, but good to be safe)
      if (!tournament) return;

      const countryName = (tournament as any).country || 'Internacional';
      const cleanedName = cleanLeagueName(tournament.name, countryName);
      const dedupKey = `${countryName.toLowerCase()}::${cleanedName.toLowerCase()}`;

      // Consolidate into an existing group when the same tournament arrives under a different ID
      const existingId = dedupByKey.get(dedupKey);
      const groupKey = existingId ?? tournament.id;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          league: `${countryName}: ${cleanedName}`,
          leagueId: groupKey,
          country: countryName,
          flag: '',
          round: match.roundId?.startsWith('F') ? match.roundId.replace('F', 'Fecha ') : (match.roundId || 'General'),
          matches: []
        };
        dedupByKey.set(dedupKey, groupKey);
      }

      // Convert UTC->local using the centralized timezone utility
      const { localTime: timeStr } = toLocalMatch(match.dateTime, userTimeZone);

      // Map status
      let status: 'live' | 'scheduled' | 'finished' = 'scheduled';
      if (match.status === 'live') status = 'live';
      if (match.status === 'final') status = 'finished';

      // Format minute logic - for live matches, compute from kickoff time
      let minuteDisplay = '';
      if (status === 'live') {
        const period = match.clock?.period || '';
        if (period === 'HT' || period === 'ET' || period === 'Final') {
          minuteDisplay = period;
        } else if (match.clock?.running && match.clock?.seconds > 0) {
          minuteDisplay = `${Math.floor(match.clock.seconds / 60)}'`;
        } else {
          // Compute minute from kickoff timestamp using the new Virtual Clock logic
          // This handles halves, quarters, overtimes, and breaks per sport
          minuteDisplay = calculateVirtualMatchTime(match.dateTime, selectedSport, 'live');
          if (!minuteDisplay) {
            // Fallback if virtual clock returns empty for some reason
            const kickoff = new Date(match.dateTime).getTime();
            const elapsed = Math.max(0, Math.floor((now - kickoff) / 60000));
            minuteDisplay = elapsed > 0 ? `${elapsed}'` : 'En Vivo';
          }
        }
      } else if (match.clock?.period && status === 'finished') {
        minuteDisplay = match.clock.period;
      }

      groups[groupKey].matches.push({
        id: match.id,
        time: timeStr,
        home: match.homeTeam?.name || 'Local',
        homeLogo: match.homeTeam?.logo,
        homeScore: match.score?.home,
        away: match.awayTeam?.name || 'Visita',
        awayLogo: match.awayTeam?.logo,
        awayScore: match.score?.away,
        status: status,
        minute: minuteDisplay
      });
    });

    const leaguesArray = Object.values(groups);

    // Sort: favorited leagues first, then alphabetically by name
    return leaguesArray.sort((a, b) => {
      const aIsFavorite = isLeagueFavorite(a.leagueId);
      const bIsFavorite = isLeagueFavorite(b.leagueId);

      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      return a.league.localeCompare(b.league);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, isLeagueFavorite, userTimeZone, liveTick]);

  const toggleCountry = (countryId: string) => {
    setExpandedCountries(prev => {
      const next = new Set(prev);
      if (next.has(countryId)) {
        next.delete(countryId);
      } else {
        next.add(countryId);
      }
      return next;
    });
  };

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
      const supabase = createClient();
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('status', 'published')
        .eq('is_visible', true);

      if (error) {
        console.error('Error fetching manual tournaments:', error);
        return;
      }

      if (data) {
        const mapped: Tournament[] = data.map((t: any) => ({
          id: t.id,
          name: t.display_name || t.name,
          nameEs: t.display_name || t.name,
          url: `/tournaments/${t.id}`,
          type: 'local',
          sportId: t.sport as any,
          countryId: (t.country || 'Argentina').toLowerCase(),
          priority: 50,
          logoUrl: t.custom_logo_url || t.logo_url,
          categories: t.category ? [t.category.toLowerCase()] : [],
          seasons: t.season_id ? [{ seasonId: String(t.season_id), teamsCount: 0, isActive: true }] : [],
          isVisible: t.is_visible,
          isWomen: t.category?.toLowerCase() === 'women',
          isYouth: !!t.age_grade,
          ageGroup: t.age_grade,
          format: t.format,
        }));
        setManualTournamentsList(mapped);
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

  const liveMatchesCount = hookLiveCount;
  const isIndividualSport = INDIVIDUAL_SPORTS.has(selectedSport.id);

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
                {activeSports.map(sport => (
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



            {/* Search */}
            <div className={styles.sidebarSearchArea}>
              <svg className={styles.sidebarSearchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder={selectedSport.id === 'tennis' ? `Filtrar torneos de ${selectedSport.nameEs}...` : `Filtrar ligas de ${selectedSport.nameEs}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.sidebarSearchInput}
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
                      <span>Internacional</span>
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
                    {filteredInternational.map((tournament) => (
                      <Link
                        key={tournament.id}
                        href={`/tournaments/${tournament.id}`}
                        className={styles.accordionItemLink}
                      >
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

                return (
                  <div key={countryId} className={styles.accordionItem}>
                    <button
                      onClick={() => toggleCountry(countryId)}
                      className={`${styles.accordionHeader} ${isExpanded ? styles.active : ''}`}
                    >
                      <div className={styles.accordionHeaderContent}>
                        <span>{group.flagEmoji}</span>
                        <span>{group.countryName}</span>
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
                      {group.tournaments.map((tournament) => {
                        // Check if tournament has sub-items (Seasons)
                        const hasSubItems = tournament.seasons && tournament.seasons.length > 0;
                        const isLeagueExpanded = expandedLeagueIds.has(tournament.id);

                        if (hasSubItems) {
                          return (
                            <div key={tournament.id} className={styles.accordionItemLinkWrapper}>
                              <div
                                className={`${styles.accordionItemHeader} ${isLeagueExpanded ? styles.active : ''}`}
                                style={{ display: 'flex', alignItems: 'center', padding: 0, width: '100%' }}
                              >
                                <Link
                                  href={`/tournaments/${tournament.id}`}
                                  style={{ flex: 1, padding: '10px 16px', color: 'inherit', textDecoration: 'none', textAlign: 'left' }}
                                >
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
                            >
                              <span>{tournament.name}</span>
                            </Link>
                          );
                        }
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main Content - Matches */}
        <main className={styles.mainContent}>
          {/* Sport Selector (Mobile) */}
          <div className={styles.mobileSportSelector}>
            {activeSports.map(sport => (
              <button
                key={sport.id}
                className={`${styles.sportChip} ${selectedSport.id === sport.id ? styles.active : ''}`}
                onClick={() => setSelectedSport(sport)}
              >
                <span className={styles.sportIcon}>{sport.icon}</span>
                <span className={styles.sportName}>{sport.nameEs}</span>
              </button>
            ))}
          </div>

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

          {/* Matches by League */}
          <div className={styles.matchesSection}>
            {/* Live Banner - Outside Grid for Layout Consistency */}
            {liveMatchesCount > 0 && (
              <div className={styles.liveBanner}>
                <span className={styles.liveDot}></span>
                <span>{liveMatchesCount} partido{liveMatchesCount > 1 ? 's' : ''} en vivo</span>
              </div>
            )}

            <div className={styles.matchesContainer}>
              {/* Source error indicator — shown when FlashScore or Supabase is down */}
              {sourceError && (
                <div style={{
                  display: 'flex', gap: '8px', padding: '8px 12px', marginBottom: '8px',
                  borderRadius: '6px', background: 'rgba(255,160,0,0.08)',
                  border: '1px solid rgba(255,160,0,0.2)',
                  fontSize: '0.75rem', color: 'var(--color-text-dim)',
                  flexWrap: 'wrap', alignItems: 'center'
                }}>
                  <span style={{ opacity: 0.7 }}>Fuente con problemas:</span>
                  {sourceError.flashscore && (
                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,100,100,0.15)', color: '#ff8080' }}>FlashScore</span>
                  )}
                  {sourceError.supabase && (
                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,100,100,0.15)', color: '#ff8080' }}>Base de datos</span>
                  )}
                  <span style={{ opacity: 0.5 }}>— los datos pueden estar incompletos</span>
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

              {!loading && matchesByLeague.length === 0 && !sourceError && (
                <div className={styles.noMatches}>
                  <div className={styles.noMatchesIcon}></div>
                  <h3>No hay partidos programados</h3>
                  <p>No se encontraron encuentros para esta fecha.</p>
                </div>
              )}

              {!loading && matchesByLeague.length === 0 && sourceError && (
                <div className={styles.noMatches}>
                  <div className={styles.noMatchesIcon}></div>
                  <h3>No se pudieron cargar los partidos</h3>
                  <p>Hay un problema de conexión con una o más fuentes de datos.</p>
                </div>
              )}

              {!loading && matchesByLeague.map((league) => {
                const isCollapsed = collapsedLeagues.has(league.leagueId);
                const matchesCount = league.matches.length;
                const liveCount = league.matches.filter(m => m.status === 'live').length;
                const isFavorite = isLeagueFavorite(league.leagueId);

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
                        <button
                          className={styles.leagueFavoriteBtn}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleLeagueFavorite(league.leagueId);
                          }}
                          aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                        >
                          <Star size={18} fill={isFavorite ? "currentColor" : "none"} strokeWidth={isFavorite ? 0 : 2} />
                        </button>

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
                          <Link
                            key={match.id}
                            href={`/matches/${match.id}`}
                            className={`${styles.matchRow} ${match.status === 'live' ? styles.matchRowLive : ''}`}
                          >
                            <div className={styles.matchTime}>
                              {match.status === 'live' ? (
                                <span className={styles.matchLive}>
                                  <span className={styles.matchLiveDot}></span>
                                  {match.minute}
                                </span>
                              ) : match.status === 'finished' ? (
                                <span className={styles.matchFinished}>FT</span>
                              ) : (
                                <span className={styles.matchTimeText}>{match.time}</span>
                              )}
                            </div>

                            <div className={styles.matchTeams}>
                              <div className={`${styles.matchTeam} ${match.homeScore != null && match.awayScore != null && match.homeScore >= match.awayScore ? styles.winner : ''}`}>
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
                                <span className={styles.teamScore}>{match.homeScore ?? '-'}</span>
                              </div>
                              <div className={`${styles.matchTeam} ${match.homeScore != null && match.awayScore != null && match.awayScore >= match.homeScore ? styles.winner : ''}`}>
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
                                <span className={styles.teamScore}>{match.awayScore ?? '-'}</span>
                              </div>
                            </div>
                          </Link>
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
