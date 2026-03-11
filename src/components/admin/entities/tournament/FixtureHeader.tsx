'use client';

import { useFixture } from './FixtureContext';

export function FixtureHeader() {
  const { fixture, openEditor } = useFixture();

  if (!fixture) return null;

  const currentPhase = fixture.phases.find((p) => p.id === fixture.currentPhaseId);
  const currentRound = currentPhase?.rounds.find((r) => r.id === fixture.currentRoundId);

  return (
    <header className="fixture-poly-panel fixture-top-bar">
      <div className="fixture-tournament-info">
        <h1>
          {fixture.tournamentName}
          {fixture.tournamentSeason && <span> · {fixture.tournamentSeason}</span>}
          <span className="fixture-badge-status">Activo</span>
        </h1>
        {currentPhase && currentRound && (
          <p>
            Fase Actual: {currentPhase.name} · {currentRound.name}
          </p>
        )}
      </div>

      <div className="fixture-global-actions">
        <button className="fixture-btn fixture-btn-ghost" title="Vista de calendario">
          <svg
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          Calendario
        </button>

        <button className="fixture-btn fixture-btn-ghost" title="Generar fixture automáticamente">
          <svg
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Generar Fixture
        </button>

        <button
          className="fixture-btn fixture-btn-primary"
          onClick={() => openEditor()}
          title="Crear nuevo partido"
        >
          <svg
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Crear Partido
        </button>
      </div>
    </header>
  );
}
