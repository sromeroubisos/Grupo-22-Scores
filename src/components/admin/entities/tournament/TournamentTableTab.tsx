'use client';
import TournamentStandingsTab from './standings/TournamentStandingsTab';

export function TournamentTableTab({ id }: { data?: any; id?: string; phaseId?: string }) {
  if (!id) return null;
  return <TournamentStandingsTab tournamentId={id} />;
}
