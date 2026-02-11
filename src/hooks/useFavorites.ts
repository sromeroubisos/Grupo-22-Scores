import { useState, useEffect } from 'react';

const STORAGE_KEY = 'g22-favorites';

export interface TeamInfo {
  name: string;
  logo?: string;
}

export interface PlayerInfo {
  name: string;
  team?: string;
  position?: string;
}

interface Favorites {
  leagues: Set<string>;
  teams: Map<string, TeamInfo>;
  players: Map<string, PlayerInfo>;
  matches: Set<string>;
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorites>({
    leagues: new Set<string>(),
    teams: new Map<string, TeamInfo>(),
    players: new Map<string, PlayerInfo>(),
    matches: new Set<string>()
  });

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);

        // Backward compat: teams can be an array of strings (old) or array of [id, info] entries (new)
        let teamsMap = new Map<string, TeamInfo>();
        if (Array.isArray(parsed.teams)) {
          parsed.teams.forEach((entry: string | [string, TeamInfo]) => {
            if (typeof entry === 'string') {
              teamsMap.set(entry, { name: entry });
            } else if (Array.isArray(entry) && entry.length === 2) {
              teamsMap.set(entry[0], entry[1]);
            }
          });
        }

        // Backward compat: players can be absent or array of [id, info] entries
        let playersMap = new Map<string, PlayerInfo>();
        if (Array.isArray(parsed.players)) {
          parsed.players.forEach((entry: string | [string, PlayerInfo]) => {
            if (typeof entry === 'string') {
              playersMap.set(entry, { name: entry });
            } else if (Array.isArray(entry) && entry.length === 2) {
              playersMap.set(entry[0], entry[1]);
            }
          });
        }

        setFavorites({
          leagues: new Set(parsed.leagues || []),
          teams: teamsMap,
          players: playersMap,
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
        teams: Array.from(newFavorites.teams.entries()),
        players: Array.from(newFavorites.players.entries()),
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
  const toggleTeamFavorite = (teamId: string, info?: TeamInfo) => {
    const newTeams = new Map(favorites.teams);
    if (newTeams.has(teamId)) {
      newTeams.delete(teamId);
    } else {
      newTeams.set(teamId, info || { name: teamId });
    }
    saveFavorites({ ...favorites, teams: newTeams });
  };

  // Toggle player favorite
  const togglePlayerFavorite = (playerId: string, info?: PlayerInfo) => {
    const newPlayers = new Map(favorites.players);
    if (newPlayers.has(playerId)) {
      newPlayers.delete(playerId);
    } else {
      newPlayers.set(playerId, info || { name: playerId });
    }
    saveFavorites({ ...favorites, players: newPlayers });
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
  const isPlayerFavorite = (playerId: string) => favorites.players.has(playerId);
  const isMatchFavorite = (matchId: string) => favorites.matches.has(matchId);

  return {
    favorites,
    toggleLeagueFavorite,
    toggleTeamFavorite,
    togglePlayerFavorite,
    toggleMatchFavorite,
    isLeagueFavorite,
    isTeamFavorite,
    isPlayerFavorite,
    isMatchFavorite
  };
}
