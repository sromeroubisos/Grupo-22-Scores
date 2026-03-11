'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import type {
  TournamentFixture,
  MatchWithClubs,
  FixtureViewMode,
  MatchStatus,
  FixtureGenerationParams,
} from '@/lib/types/fixture';

interface FixtureContextValue {
  // Data
  fixture: TournamentFixture | null;
  selectedPhaseId: string | null;
  selectedRoundId: string | null;

  // View state
  viewMode: FixtureViewMode;
  filterStatus: MatchStatus | 'all';
  sortBy: 'date' | 'venue' | 'status';

  // Editor state
  editorOpen: boolean;
  editingMatch: MatchWithClubs | null;

  // Actions
  setFixture: (fixture: TournamentFixture | null) => void;
  selectPhase: (phaseId: string) => void;
  selectRound: (roundId: string) => void;
  setViewMode: (mode: FixtureViewMode) => void;
  setFilterStatus: (status: MatchStatus | 'all') => void;
  setSortBy: (sortBy: 'date' | 'venue' | 'status') => void;
  openEditor: (match?: MatchWithClubs) => void;
  closeEditor: () => void;
  refreshFixture: () => Promise<void>;

  // Operational actions
  generateFixture: (params: { numRounds: number, namePattern: string }) => Promise<boolean>;
  generateMatches: (params: FixtureGenerationParams) => Promise<boolean>;
  importMatches: (phaseId: string, matches: any[]) => Promise<{ success: boolean; imported: number; errors?: string[] }>;
  resetRound: (roundId: string) => Promise<boolean>;
  validateFixture: () => Promise<any>;
  saveMatch: (match: any) => Promise<void>;
  deleteMatch: (matchId: string) => Promise<void>;
}

const FixtureContext = createContext<FixtureContextValue | undefined>(undefined);

export function useFixture() {
  const context = useContext(FixtureContext);
  if (!context) {
    throw new Error('useFixture must be used within a FixtureProvider');
  }
  return context;
}

interface FixtureProviderProps {
  children: React.ReactNode;
  initialFixture: TournamentFixture | null;
  tournamentId: string;
}

export function FixtureProvider({ children, initialFixture, tournamentId }: FixtureProviderProps) {
  // Data state
  const [fixture, setFixture] = useState<TournamentFixture | null>(initialFixture);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(
    initialFixture?.currentPhaseId || null
  );
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(
    initialFixture?.currentRoundId || null
  );

  // View state
  const [viewMode, setViewMode] = useState<FixtureViewMode>('rounds');
  const [filterStatus, setFilterStatus] = useState<MatchStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'venue' | 'status'>('date');

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<MatchWithClubs | null>(null);

  // Actions
  const selectPhase = useCallback((phaseId: string) => {
    setSelectedPhaseId(phaseId);
  }, []);

  const selectRound = useCallback((roundId: string) => {
    setSelectedRoundId(roundId);
  }, []);

  const openEditor = useCallback((match?: MatchWithClubs) => {
    setEditingMatch(match || null);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingMatch(null);
  }, []);

  const refreshFixture = useCallback(async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/fixture`, {
        cache: 'no-store'
      });
      if (response.ok) {
        const newFixture = await response.json();
        setFixture(newFixture);
      }
    } catch (error) {
      console.error('Error refreshing fixture:', error);
    }
  }, [tournamentId]);

  const generateFixture = useCallback(async (params: { numRounds: number, namePattern: string }) => {
    if (!selectedPhaseId) return false;
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/fixture/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phaseId: selectedPhaseId, ...params }),
      });
      if (response.ok) {
        await refreshFixture();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error generating fixture rounds:', error);
      return false;
    }
  }, [tournamentId, selectedPhaseId, refreshFixture]);

  const generateMatches = useCallback(async (params: FixtureGenerationParams) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/fixture/generate-matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (response.ok) {
        await refreshFixture();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error generating matches:', error);
      return false;
    }
  }, [tournamentId, refreshFixture]);

  const importMatches = useCallback(async (phaseId: string, matches: any[]) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/fixture/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phaseId, matches }),
      });
      const result = await response.json();
      if (response.ok) {
        await refreshFixture();
      }
      return result;
    } catch (error) {
      console.error('Error importing matches:', error);
      return { success: false, imported: 0, error: 'Failed to import matches' };
    }
  }, [tournamentId, refreshFixture]);

  const resetRound = useCallback(async (roundId: string) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/fixture/rounds/${roundId}/reset`, {
        method: 'POST',
      });
      if (response.ok) {
        await refreshFixture();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error resetting round:', error);
      return false;
    }
  }, [tournamentId, refreshFixture]);

  const validateFixture = useCallback(async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/fixture/validate`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error validating fixture:', error);
    }
    return null;
  }, [tournamentId]);

  const saveMatch = useCallback(async (match: any) => {
    try {
      const isUpdate = !!match.id;
      const url = isUpdate
        ? `/api/tournaments/${tournamentId}/matches/${match.id}`
        : `/api/tournaments/${tournamentId}/matches`;

      const response = await fetch(url, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(match),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to save match');
      }

      await refreshFixture();
    } catch (error) {
      console.error('Error saving match:', error);
      throw error;
    }
  }, [tournamentId, refreshFixture]);

  // Side effect: select first phase if none selected
  React.useEffect(() => {
    if (fixture && !selectedPhaseId && fixture.phases.length > 0) {
      setSelectedPhaseId(fixture.phases[0].id);
    }
  }, [fixture, selectedPhaseId]);

  // Side effect: select first round of selected phase
  React.useEffect(() => {
    if (fixture && selectedPhaseId) {
      const phase = fixture.phases.find(p => p.id === selectedPhaseId);
      if (phase && phase.rounds.length > 0) {
        // Only reset round if it's currently null or doesn't belong to this phase
        const currentRoundBelongs = phase.rounds.some(r => r.id === selectedRoundId);
        if (!currentRoundBelongs) {
          setSelectedRoundId(phase.rounds[0].id);
        }
      } else {
        setSelectedRoundId(null);
      }
    }
  }, [fixture, selectedPhaseId, selectedRoundId]);

  const deleteMatch = useCallback(async (matchId: string) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/matches/${matchId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete match');
      }

      await refreshFixture();
    } catch (error) {
      console.error('Error deleting match:', error);
      throw error;
    }
  }, [tournamentId, refreshFixture]);

  const value: FixtureContextValue = {
    fixture,
    selectedPhaseId,
    selectedRoundId,
    viewMode,
    filterStatus,
    sortBy,
    editorOpen,
    editingMatch,
    setFixture,
    selectPhase,
    selectRound,
    setViewMode,
    setFilterStatus,
    setSortBy,
    openEditor,
    closeEditor,
    refreshFixture,
    generateFixture,
    generateMatches,
    importMatches,
    resetRound,
    validateFixture,
    saveMatch,
    deleteMatch,
  };

  return <FixtureContext.Provider value={value}>{children}</FixtureContext.Provider>;
}
