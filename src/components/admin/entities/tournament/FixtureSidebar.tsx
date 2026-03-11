'use client';

import { useFixture } from './FixtureContext';

export function FixtureSidebar() {
  const { fixture, selectedPhaseId, selectedRoundId, selectPhase, selectRound } = useFixture();

  if (!fixture || fixture.phases.length === 0) {
    return (
      <aside className="fixture-poly-panel fixture-sidebar-nav">
        <div className="fixture-empty-state">
          <div className="fixture-empty-state-icon">📅</div>
          <div className="fixture-empty-state-title">No hay fases configuradas</div>
          <div className="fixture-empty-state-text">
            Crea fases y jornadas para organizar el torneo
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="fixture-poly-panel fixture-sidebar-nav">
      {fixture.phases.map((phase) => (
        <div key={phase.id} className="fixture-nav-group">
          <span className="fixture-nav-section-title">{phase.name}</span>
          <ul style={{ margin: 0, padding: 0 }}>
            {phase.rounds.length === 0 ? (
              <li className="fixture-nav-item" style={{ cursor: 'default', opacity: 0.5 }}>
                Sin jornadas
              </li>
            ) : (
              phase.rounds.map((round) => (
                <li
                  key={round.id}
                  className={`fixture-nav-item ${selectedRoundId === round.id ? 'active' : ''}`}
                  onClick={() => {
                    selectPhase(phase.id);
                    selectRound(round.id);
                  }}
                >
                  {round.name}
                  <span className="count">{round.matchCount}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      ))}
    </aside>
  );
}
