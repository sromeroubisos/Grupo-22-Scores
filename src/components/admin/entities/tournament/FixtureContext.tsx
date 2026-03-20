'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import type {
  TournamentFixture,
  MatchWithClubs,
  FixtureViewMode,
  MatchStatus,
  FixtureGenerationParams,
} from '@/lib/types/fixture';
import type {
  FixtureColumnMapping,
  FixtureImportConfirmDecision,
  FixtureImportConfirmResult,
  FixtureImportPreviewResult,
} from '@/lib/types/fixture-import';

type JsonRecord = Record<string, unknown>;
const FIXTURE_REQUEST_TIMEOUT_MS = 20_000;

function isAbortLikeError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'))
  );
}

interface FixtureContextValue {
  // Data
  fixture: TournamentFixture | null;
  isLoadingFixture: boolean;
  fixtureError: string | null;
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
  importMatches: (phaseId: string, matches: JsonRecord[]) => Promise<{ success: boolean; imported: number; errors?: string[] }>;
  previewFixtureImport: (params: { phaseId: string; file?: File | null; pastedText?: string | null; mapping?: FixtureColumnMapping | null }) => Promise<FixtureImportPreviewResult>;
  confirmFixtureImport: (params: { phaseId: string; jobId: string; decisions: FixtureImportConfirmDecision[] }) => Promise<FixtureImportConfirmResult>;
  resetRound: (roundId: string) => Promise<boolean>;
  saveRound: (roundId: string, round: JsonRecord) => Promise<void>;
  validateFixture: () => Promise<unknown>;
  saveMatch: (match: JsonRecord) => Promise<void>;
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
  const [isLoadingFixture, setIsLoadingFixture] = useState(false);
  const [fixtureError, setFixtureError] = useState<string | null>(null);
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
    const abortController = new AbortController();
    const timeoutReason = new DOMException('Fixture request timed out', 'AbortError');
    const timeoutId = window.setTimeout(() => {
      if (!abortController.signal.aborted) {
        abortController.abort(timeoutReason);
      }
    }, FIXTURE_REQUEST_TIMEOUT_MS);

    setIsLoadingFixture(true);
    setFixtureError(null);

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/fixture`, {
        cache: 'no-store',
        signal: abortController.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      const payload: unknown = contentType.includes('application/json')
        ? await response.json()
        : null;

      if (!response.ok) {
        throw new Error(
          (payload as { error?: string } | null)?.error ||
          `No se pudo cargar el fixture del torneo (HTTP ${response.status}).`,
        );
      }

      if (!payload) {
        throw new Error('El endpoint devolvio una respuesta invalida al cargar el fixture.');
      }

      setFixture(payload as TournamentFixture);
    } catch (error) {
      const isTimeoutAbort =
        abortController.signal.aborted && abortController.signal.reason === timeoutReason;

      if (isTimeoutAbort) {
        setFixtureError(
          'La carga del workspace excedio los 20 segundos. Esto suele indicar una consulta pesada o un problema de RLS en la base.'
        );
        return;
      }

      if (isAbortLikeError(error)) {
        return;
      }

      console.error('Error refreshing fixture:', error);
      setFixtureError(
        error instanceof Error ? error.message : 'No se pudo cargar el fixture.'
      );
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoadingFixture(false);
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

  const importMatches = useCallback(async (phaseId: string, matches: JsonRecord[]) => {
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

  const previewFixtureImport = useCallback(async (params: {
    phaseId: string;
    file?: File | null;
    pastedText?: string | null;
    mapping?: FixtureColumnMapping | null;
  }) => {
    try {
      const formData = new FormData();
      formData.set('phaseId', params.phaseId);
      if (params.file) formData.set('file', params.file);
      if (params.pastedText) formData.set('pastedText', params.pastedText);
      if (params.mapping) formData.set('mapping', JSON.stringify(params.mapping));

      const response = await fetch(`/api/tournaments/${tournamentId}/fixture/import`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.error || 'Failed to preview fixture import');
        (error as Error & { code?: string }).code = result.code || null;
        throw error;
      }

      return result as FixtureImportPreviewResult;
    } catch (error) {
      console.error('Error previewing fixture import:', error);
      const fallback: FixtureImportPreviewResult = {
        ok: false,
        summary: {
          jobId: '',
          status: 'failed',
          sourceType: 'unknown',
          documentType: 'unknown',
          confidence: 'baja',
          fileName: null,
          totalRows: 0,
          validRows: 0,
          warningRows: 0,
          errorRows: 0,
          duplicateRows: 0,
          unmatchedEntities: 0,
        },
        mapping: {
          headers: [],
          suggestions: [],
          selected: {},
          needsManualMapping: false,
        },
        referenceData: {
          clubs: [],
          rounds: [],
          groups: [],
          venues: [],
        },
        issues: [
          {
            severity: 'error',
            code: 'preview_failed',
            message: error instanceof Error ? error.message : 'Failed to preview fixture import',
            field: 'document',
          },
        ],
        rows: [],
      };
      return fallback;
    }
  }, [tournamentId]);

  const confirmFixtureImport = useCallback(async (params: {
    phaseId: string;
    jobId: string;
    decisions: FixtureImportConfirmDecision[];
  }) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/fixture/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          phaseId: params.phaseId,
          jobId: params.jobId,
          decisions: params.decisions,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.error || 'Failed to confirm fixture import');
        (error as Error & { code?: string }).code = result.code || null;
        throw error;
      }

      await refreshFixture();
      return result as FixtureImportConfirmResult;
    } catch (error) {
      console.error('Error confirming fixture import:', error);
      const fallback: FixtureImportConfirmResult = {
        ok: false,
        jobId: params.jobId,
        created: 0,
        updated: 0,
        skipped: 0,
        rejected: params.decisions.length,
        issues: [
          {
            severity: 'error',
            code: 'confirm_failed',
            message: error instanceof Error ? error.message : 'Failed to confirm fixture import',
            field: 'document',
          },
        ],
      };
      return fallback;
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

  const saveRound = useCallback(async (roundId: string, round: JsonRecord) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/fixture/rounds/${roundId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(round),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to save round');
      }

      await refreshFixture();
    } catch (error) {
      console.error('Error saving round:', error);
      throw error;
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

  const saveMatch = useCallback(async (match: JsonRecord) => {
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
    isLoadingFixture,
    fixtureError,
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
    previewFixtureImport,
    confirmFixtureImport,
    resetRound,
    saveRound,
    validateFixture,
    saveMatch,
    deleteMatch,
  };

  return <FixtureContext.Provider value={value}>{children}</FixtureContext.Provider>;
}
