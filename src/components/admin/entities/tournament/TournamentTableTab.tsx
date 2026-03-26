'use client';
import TournamentStandingsTab from './standings/TournamentStandingsTab';

export function TournamentTableTab({ id, phaseId }: { data?: unknown; id?: string; phaseId?: string }) {
  if (!id) return null;
  return <TournamentStandingsTab tournamentId={id} preferredPhaseId={phaseId ?? null} />;
}
