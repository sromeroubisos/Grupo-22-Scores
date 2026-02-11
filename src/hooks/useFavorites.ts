import { useState, useEffect } from 'react';

const STORAGE_KEY = 'g22-favorites';

interface Favorites {
  leagues: Set<string>;
  teams: Set<string>;
  matches: Set<string>;
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorites>({
    leagues: new Set<string>(),
    teams: new Set<string>(),
    matches: new Set<string>()
  });

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setFavorites({
          leagues: new Set(parsed.leagues || []),
          teams: new Set(parsed.teams || []),
          matches: new Set(parsed.matches || [])
        });
      }
    } catch (error) {
      console.error('Error loading favorites:', error);
    }
  }, []);

  // Save favorites to localStorage whenever they change
  const saveFavorites = (newFavorites: Favorites) => {
    try {
      const toStore = {
        leagues: Array.from(newFavorites.leagues),
        teams: Array.from(newFavorites.teams),
        matches: Array.from(newFavorites.matches)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      setFavorites(newFavorites);
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  };

  // Toggle league favorite
  const toggleLeagueFavorite = (leagueId: string) => {
    const newLeagues = new Set(favorites.leagues);
    if (newLeagues.has(leagueId)) {
      newLeagues.delete(leagueId);
    } else {
      newLeagues.add(leagueId);
    }
    saveFavorites({ ...favorites, leagues: newLeagues });
  };

  // Toggle team favorite
  const toggleTeamFavorite = (teamId: string) => {
    const newTeams = new Set(favorites.teams);
    if (newTeams.has(teamId)) {
      newTeams.delete(teamId);
    } else {
      newTeams.add(teamId);
    }
    saveFavorites({ ...favorites, teams: newTeams });
  };

  // Toggle match favorite
  const toggleMatchFavorite = (matchId: string) => {
    const newMatches = new Set(favorites.matches);
    if (newMatches.has(matchId)) {
      newMatches.delete(matchId);
    } else {
      newMatches.add(matchId);
    }
    saveFavorites({ ...favorites, matches: newMatches });
  };

  // Check if item is favorite
  const isLeagueFavorite = (leagueId: string) => favorites.leagues.has(leagueId);
  const isTeamFavorite = (teamId: string) => favorites.teams.has(teamId);
  const isMatchFavorite = (matchId: string) => favorites.matches.has(matchId);

  return {
    favorites,
    toggleLeagueFavorite,
    toggleTeamFavorite,
    toggleMatchFavorite,
    isLeagueFavorite,
    isTeamFavorite,
    isMatchFavorite
  };
}
