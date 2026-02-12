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
    const country = getCountryById(tournament.countryId);
    const countryName = country?.name || tournament.countryId;
    const flagEmoji = country?.flagEmoji || '';

    if (!groups[tournament.countryId]) {
      groups[tournament.countryId] = { countryName, flagEmoji, tournaments: [] };
    }
    groups[tournament.countryId].tournaments.push(tournament);
  });

  // Sort tournaments within each group by priority
  Object.values(groups).forEach(group => {
    group.tournaments.sort((a, b) => b.priority - a.priority);
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

// Mock data - News (Unchanged)
const news = [
  {
    id: 1,
    title: 'Los Pumas anuncian convocatoria para el Rugby Championship',
    excerpt: 'El entrenador Felipe Contepomi dio a conocer la lista de 35 jugadores que comenzarán la preparación...',
    image: '',
    time: 'Hace 2 horas',
    category: 'Selección',
  },
  {
    id: 2,
    title: 'Club Atlético sigue líder invicto en el UAR Top 12',
    excerpt: 'Con la victoria de hoy, el equipo capitalino suma 32 puntos y mantiene el primer puesto...',
    image: '',
    time: 'Hace 4 horas',
    category: 'UAR Top 12',
  },
  {
    id: 3,
    title: 'Martín García, goleador del torneo con 12 tries',
    excerpt: 'El wing de Club Atlético sigue imparable y amplía su ventaja como máximo anotador...',
    image: '',
    time: 'Hace 6 horas',
    category: 'Estadísticas',
  },
  {
    id: 4,
    title: 'URBA confirma fechas de playoffs',
    excerpt: 'Los cuartos de final se jugarán el 15 de marzo en cancha del mejor ubicado...',
    image: '',
    time: 'Ayer',
    category: 'URBA',
  },
];

// Generate dates for the date picker (timezone-aware)
function generateDates(timeZone: string) {
  const entries = generateLocalDateKeys(timeZone, -3, 7);
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
    return allTournaments.filter(t => t.type === 'local' || t.type === 'cup');
  }, [allTournaments]);

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
  const { matches, loading, liveCount: hookLiveCount } = useMatchesStore(selectedDate, selectedSport.id);

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
    const now = Date.now();

    matches.forEach(match => {
      // API returns enriched data (match.homeTeam, match.tournament, etc.)
      const tournament = match.tournament;

      // Basic validation (API filters, but good to be safe)
      if (!tournament) return;

      if (!groups[tournament.id]) {
        groups[tournament.id] = {
          league: tournament.name,
          leagueId: tournament.id,
          country: 'Argentina',
          flag: '',
          round: match.roundId?.startsWith('F') ? match.roundId.replace('F', 'Fecha ') : (match.roundId || 'General'),
          matches: []
        };
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
          // Compute minute from kickoff timestamp
          const kickoff = new Date(match.dateTime).getTime();
          const elapsed = Math.max(0, Math.floor((now - kickoff) / 60000));
          minuteDisplay = elapsed > 0 ? `${elapsed}'` : (period || 'En Vivo');
        }
      } else if (match.clock?.period && status === 'finished') {
        minuteDisplay = match.clock.period;
      }

      groups[tournament.id].matches.push({
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

              {isSportMenuOpen && (
                <div className={styles.sportMenu}>
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
              )}
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
              <button
                className={styles.dateNavBtn}
                onClick={() => navigateDate('prev')}
                aria-label="Día anterior"
              >
                <ChevronLeft size={20} />
              </button>

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

              <button
                className={styles.dateNavBtn}
                onClick={() => navigateDate('next')}
                aria-label="Día siguiente"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </section>

          {/* Live Banner */}
          {liveMatchesCount > 0 && (
            <div className={styles.liveBanner}>
              <span className={styles.liveDot}></span>
              <span>{liveMatchesCount} partido{liveMatchesCount > 1 ? 's' : ''} en vivo</span>
            </div>
          )}

          {/* Matches by League */}
          <div className={styles.matchesContainer}>
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

            {!loading && matchesByLeague.length === 0 && (
              <div className={styles.noMatches}>
                <div className={styles.noMatchesIcon}></div>
                <h3>No hay partidos programados</h3>
                <p>No se encontraron encuentros para esta fecha.</p>
              </div>
            )}

            {!loading && matchesByLeague.map((league) => {
              const isCollapsed = collapsedLeagues.has(league.leagueId);
              const matchesCount = league.matches.length;
              const liveCount = league.matches.filter(m => m.status === 'live').length;
              const isFavorite = isLeagueFavorite(league.leagueId);

              return (
                <div key={league.leagueId} className={styles.leagueSection}>
                  <div className={`${styles.leagueSectionHeader} ${isCollapsed ? styles.collapsed : ''}`}>
                    <Link href={`/tournaments/${league.leagueId}`} className={styles.leagueHeaderLink}>
                      <div className={styles.leagueInfo}>
                        <span className={styles.leagueFlag}>{league.flag}</span>
                        <div className={styles.leagueMeta}>
                          <span className={styles.leagueSectionName}>{league.league}</span>
                          <span className={styles.leagueRound}>{league.round}</span>
                          <TournamentLeader leagueId={league.leagueId} />
                        </div>
                      </div>

                      {isCollapsed && (
                        <div className={styles.leagueHeaderSummary} style={{ marginLeft: 'auto' }}>
                          <span>{matchesCount} partidos</span>
                          {liveCount > 0 && <span className={styles.summaryLive}> {liveCount} en vivo</span>}
                        </div>
                      )}
                    </Link>

                    <button
                      className={styles.leagueFavoriteBtn}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleLeagueFavorite(league.leagueId);
                      }}
                      aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                      title={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>

                    <button
                      className={styles.leagueHeaderToggle}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleCompetitionCollapse(league.leagueId);
                      }}
                      aria-label={isCollapsed ? "Ver partidos" : "Ocultar partidos"}
                      aria-expanded={!isCollapsed}
                    >
                      <svg
                        className={styles.chevronHeader}
                        width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  </div>

                  {!isCollapsed && (
                    <div className={styles.matchesList}>
                      {league.matches.map((match) => (
                        <Link
                          key={match.id}
                          href={`/partidos/${match.id}`}
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
                  )}
                </div>
              );
            })}
          </div>

          {!loading && matchesByLeague.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-tertiary)', opacity: 0.7 }}>
              No hay partidos programados para esta fecha.
            </div>
          )}
        </main>

        {/* Right Sidebar - News Only */}
        <aside className={styles.sidebarRight}>
          <div className={styles.sidebarSection}>
            <div className={styles.sidebarSectionTitle}>Noticias Recientes</div>
            <div className={styles.newsList}>
              {news.slice(0, 3).map((item) => (
                <Link key={item.id} href={`/noticias/${item.id}`} className={styles.newsCard}>
                  <div className={styles.newsImage}>{item.image}</div>
                  <div className={styles.newsContent}>
                    <span className={styles.newsCategory}>{item.category}</span>
                    <h3 className={styles.newsTitle}>{item.title}</h3>
                    <span className={styles.newsTime}>{item.time}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
