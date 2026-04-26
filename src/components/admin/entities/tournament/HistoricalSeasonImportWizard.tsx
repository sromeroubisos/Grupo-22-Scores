'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArchiveRestore, CheckCircle2, RefreshCw, Upload, X } from 'lucide-react';
import type {
  HistoricalImportClubResolution,
  HistoricalImportPhasePreview,
  HistoricalImportPreviewResult,
} from '@/lib/types/historical-tournament-import';
import './basalt.css';
import './historical-season-import.css';

type FormState = {
  tournamentName: string;
  displayName: string;
  slug: string;
  publish: boolean;
};

type PhaseEditorState = {
  name: string;
  phaseType: HistoricalImportPhasePreview['phaseType'];
};

const EMPTY_PREVIEW: HistoricalImportPreviewResult | null = null;

function createForm(preview: HistoricalImportPreviewResult | null): FormState {
  return {
    tournamentName: preview?.summary.suggestedName || '',
    displayName: preview?.summary.suggestedDisplayName || '',
    slug: preview?.summary.suggestedSlug || '',
    publish: false,
  };
}

function createPhaseEditorState(phases: HistoricalImportPhasePreview[] = []): Record<string, PhaseEditorState> {
  return phases.reduce<Record<string, PhaseEditorState>>((state, phase) => {
    state[phase.key] = {
      name: phase.name,
      phaseType: phase.phaseType,
    };
    return state;
  }, {});
}

function needsAttention(club: HistoricalImportClubResolution) {
  return !club.matchedClubId || club.confidence !== 'alta' || club.matchType === 'manual';
}

function hasClubOverride(overrides: Record<string, string | null>, normalizedName: string) {
  return Object.prototype.hasOwnProperty.call(overrides, normalizedName);
}

export function HistoricalSeasonImportWizard({
  tournamentId,
  onBack,
  onComplete,
  onPreviewChange,
  showStandaloneHeader = true,
  redirectTab = 'resumen',
}: {
  tournamentId: string;
  onBack: () => void;
  onComplete?: (newTournamentId: string) => void;
  onPreviewChange?: (preview: HistoricalImportPreviewResult | null) => void;
  showStandaloneHeader?: boolean;
  redirectTab?: string;
}) {
  const router = useRouter();
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<HistoricalImportPreviewResult | null>(EMPTY_PREVIEW);
  const [form, setForm] = useState<FormState>(() => createForm(null));
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [phaseOverrides, setPhaseOverrides] = useState<Record<string, PhaseEditorState>>({});
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);

  const attentionClubs = useMemo(
    () => (preview?.clubs || []).filter((club) => needsAttention(club)),
    [preview?.clubs]
  );

  const editablePhases = useMemo(
    () =>
      (preview?.phases || []).map((phase) => ({
        ...phase,
        name: phaseOverrides[phase.key]?.name ?? phase.name,
        phaseType: phaseOverrides[phase.key]?.phaseType ?? phase.phaseType,
      })),
    [phaseOverrides, preview?.phases]
  );

  const hasInvalidPhaseStructure = editablePhases.some((phase) => !phase.name.trim());
  const unresolvedAfterOverrides = useMemo(
    () =>
      (preview?.clubs || []).filter((club) => {
        const selectedClubId = hasClubOverride(overrides, club.normalizedName)
          ? overrides[club.normalizedName]
          : club.matchedClubId;
        return !selectedClubId;
      }).length,
    [overrides, preview?.clubs]
  );
  const creationBlockReason = useMemo(() => {
    if (!form.tournamentName.trim()) return 'Completa el nombre del torneo antes de crear la temporada.';
    if (!form.slug.trim()) return 'Completa el slug antes de crear la temporada.';
    if (hasInvalidPhaseStructure) return 'Hay una fase detectada sin nombre.';
    if (unresolvedAfterOverrides > 0) {
      return `Falta resolver ${unresolvedAfterOverrides} ${unresolvedAfterOverrides === 1 ? 'club' : 'clubes'} antes de crear.`;
    }
    return null;
  }, [form.slug, form.tournamentName, hasInvalidPhaseStructure, unresolvedAfterOverrides]);

  const updatePhaseOverride = (phaseKey: string, changes: Partial<PhaseEditorState>) => {
    const source = preview?.phases.find((phase) => phase.key === phaseKey);
    if (!source) return;

    setPhaseOverrides((current) => ({
      ...current,
      [phaseKey]: {
        name: changes.name ?? current[phaseKey]?.name ?? source.name,
        phaseType: changes.phaseType ?? current[phaseKey]?.phaseType ?? source.phaseType,
      },
    }));
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/historical-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          rawText,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'No se pudo analizar la temporada historica.');
      }

      setPreview(json);
      setForm(createForm(json));
      setOverrides({});
      setPhaseOverrides(createPhaseEditorState(json.phases || []));
      onPreviewChange?.(json);
    } catch (error) {
      setPreview(null);
      setPhaseOverrides({});
      onPreviewChange?.(null);
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'No se pudo analizar la temporada historica.',
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleImport = async () => {
    setFeedback(null);

    if (creationBlockReason) {
      setFeedback({
        tone: 'error',
        message: creationBlockReason,
      });
      return;
    }

    setIsImporting(true);

    try {
      const phaseOverridePayload = editablePhases.reduce<Record<string, PhaseEditorState>>((state, phase) => {
        state[phase.key] = {
          name: phase.name.trim(),
          phaseType: phase.phaseType,
        };
        return state;
      }, {});

      const response = await fetch(`/api/admin/tournaments/${tournamentId}/historical-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          rawText,
          overrides,
          phaseOverrides: phaseOverridePayload,
          tournamentName: form.tournamentName,
          displayName: form.displayName,
          slug: form.slug,
          publish: form.publish,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(
          json.warnings?.[0] ||
          json.error ||
          'No se pudo crear la temporada historica.'
        );
      }

      setFeedback({
        tone: 'ok',
        message: `Temporada creada. ${json.created?.matches || 0} partidos y ${json.created?.standings || 0} filas de tabla importadas.`,
      });
      onPreviewChange?.(null);

      if (json.tournamentId) {
        onComplete?.(json.tournamentId);
        router.push(`/admin/entities/${json.tournamentId}/manage?type=tournament&tab=${redirectTab}`);
      }
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'No se pudo crear la temporada historica.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const clubsToShow = preview ? (attentionClubs.length > 0 ? attentionClubs : preview.clubs) : [];

  return (
    <section className={`historical-import-wizard${showStandaloneHeader ? '' : ' is-drawer'}`}>
      {showStandaloneHeader ? (
        <div className="hi-section">
          <div className="hi-section-head" style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <span className="hi-section-kicker">Temporadas archivadas</span>
              <h4 className="hi-section-title">Importar temporada historica desde texto</h4>
              <p className="hi-section-help">
                Este flujo crea un torneo nuevo de temporada usando el torneo actual como plantilla de identidad y
                relaciones. No mezcla datos dentro de la temporada activa.
              </p>
            </div>
            <button type="button" className="basalt-btn" onClick={onBack}>
              <X size={15} />
              Volver
            </button>
          </div>
        </div>
      ) : null}

      <div className="hi-section">
        <div className="hi-section-head">
          <span className="hi-section-kicker">1. Texto fuente</span>
          <h4 className="hi-section-title">Pega el calendario y la tabla</h4>
          <p className="hi-section-help">
            Se espera el formato Match Schedule + tabla Pos./Team/Pts/Pld/W/D/L/F/A/Diff/TB/LB.
          </p>
        </div>

        <label className="hi-source-field">
          <span className="hi-source-label">Texto fuente</span>
          <textarea
            className="basalt-input hi-source-textarea"
            rows={12}
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder={'Match Schedule\n15/11/2025 - Final\nEquipo A -  Equipo B\t25-16\n\nPos.\tTeam\tPts\tPld\tW\tD\tL\tF\tA\tDiff\tTB\tLB'}
          />
        </label>

        <div className="hi-note">
          <ArchiveRestore size={16} />
          <span>
            El parser espera el formato Match Schedule + tabla Pos./Team/Pts/Pld/W/D/L/F/A/Diff/TB/LB como en tu ejemplo.
          </span>
        </div>

        <div className="hi-actions">
          <button type="button" className="basalt-btn" onClick={onBack}>
            Cancelar
          </button>
          <button
            type="button"
            className="basalt-btn basalt-btn-primary"
            onClick={() => void handlePreview()}
            disabled={isPreviewing || !rawText.trim()}
          >
            {isPreviewing ? <RefreshCw size={15} className="spin" /> : <Upload size={15} />}
            Analizar temporada
          </button>
        </div>
      </div>

      {feedback ? (
        <div className={`hi-feedback tone-${feedback.tone === 'error' ? 'error' : 'ok'}`}>
          {feedback.tone === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      {preview ? (
        <>
          <div className="hi-section">
            <div className="hi-section-head">
              <span className="hi-section-kicker">2. Resumen detectado</span>
              <h4 className="hi-section-title">Datos extraidos del texto</h4>
            </div>
            <div className="hi-summary-grid">
              <div className="hi-summary-card">
                <span className="hi-summary-card-label">Temporada</span>
                <strong className="hi-summary-card-value">{preview.summary.seasonId}</strong>
              </div>
              <div className="hi-summary-card">
                <span className="hi-summary-card-label">Partidos</span>
                <strong className="hi-summary-card-value">{preview.summary.matchesCount}</strong>
              </div>
              <div className="hi-summary-card">
                <span className="hi-summary-card-label">Equipos</span>
                <strong className="hi-summary-card-value">{preview.summary.teamsCount}</strong>
              </div>
              <div className="hi-summary-card">
                <span className="hi-summary-card-label">Sin resolver</span>
                <strong className="hi-summary-card-value">{preview.summary.unresolvedTeams}</strong>
              </div>
              <div className="hi-summary-card">
                <span className="hi-summary-card-label">Campeon</span>
                <strong className="hi-summary-card-value">{preview.summary.champion || '--'}</strong>
              </div>
              <div className="hi-summary-card">
                <span className="hi-summary-card-label">Subcampeon</span>
                <strong className="hi-summary-card-value">{preview.summary.runnerUp || '--'}</strong>
              </div>
            </div>

            {preview.issues.length > 0 ? (
              <div className="hi-issue-list">
                {preview.issues.map((issue) => (
                  <div
                    key={`${issue.code}-${issue.message}`}
                    className={`hi-issue tone-${issue.severity === 'error' ? 'error' : 'ok'}`}
                  >
                    <span className="hi-issue-icon">
                      {issue.severity === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                    </span>
                    <div className="hi-issue-body">
                      <strong>{issue.code}</strong>
                      <p>{issue.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="hi-section">
            <div className="hi-section-head">
              <span className="hi-section-kicker">3. Identidad del torneo</span>
              <h4 className="hi-section-title">Como va a aparecer publicado</h4>
            </div>
            <div className="hi-form-grid">
              <label className="hi-field">
                <span className="hi-field-label">Nombre del torneo</span>
                <input
                  className="basalt-input"
                  value={form.tournamentName}
                  onChange={(event) => setForm((current) => ({ ...current, tournamentName: event.target.value }))}
                />
              </label>
              <label className="hi-field">
                <span className="hi-field-label">Nombre publico</span>
                <input
                  className="basalt-input"
                  value={form.displayName}
                  onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                />
              </label>
              <label className="hi-field hi-field-span-2">
                <span className="hi-field-label">Slug</span>
                <input
                  className="basalt-input"
                  value={form.slug}
                  onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                />
              </label>
            </div>

            <label className="hi-toggle">
              <input
                type="checkbox"
                checked={form.publish}
                onChange={(event) => setForm((current) => ({ ...current, publish: event.target.checked }))}
              />
              <span>Publicar y dejar visible al terminar</span>
            </label>
          </div>

          <div className="hi-section">
            <div className="hi-section-head">
              <span className="hi-section-kicker">4. Fases detectadas</span>
              <h4 className="hi-section-title">Estructura inferida</h4>
            </div>
            <div className="hi-phase-list">
              {editablePhases.map((phase, index) => (
                <div key={phase.key} className="hi-phase-row">
                  <span className="hi-phase-index">{index + 1}</span>
                  <label className="hi-field">
                    <span className="hi-field-label">Nombre de fase</span>
                    <input
                      className="basalt-input"
                      value={phase.name}
                      onChange={(event) => updatePhaseOverride(phase.key, { name: event.target.value })}
                    />
                  </label>
                  <label className="hi-field">
                    <span className="hi-field-label">Tipo</span>
                    <select
                      className="basalt-input"
                      value={phase.phaseType}
                      onChange={(event) =>
                        updatePhaseOverride(phase.key, {
                          phaseType: event.target.value as PhaseEditorState['phaseType'],
                        })
                      }
                    >
                      <option value="league">Liga / tabla</option>
                      <option value="playoff">Playoffs</option>
                    </select>
                  </label>
                  <div className="hi-phase-meta">
                    <strong>{phase.roundCount}</strong>
                    <span>rondas</span>
                    <strong>{phase.matchCount}</strong>
                    <span>partidos</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="hi-section">
            <div className="hi-section-head">
              <span className="hi-section-kicker">5. Mapeo de clubes</span>
              <h4 className="hi-section-title">
                {attentionClubs.length > 0
                  ? `Resolver ${attentionClubs.length} club${attentionClubs.length === 1 ? '' : 'es'} con baja confianza`
                  : 'Todos los clubes detectados estan vinculados'}
              </h4>
              <p className="hi-section-help">
                Verificá los nombres detectados y asignalos al club correcto del directorio.
              </p>
            </div>

            {clubsToShow.length === 0 ? (
              <div className="hi-empty">No se detectaron clubes para mapear.</div>
            ) : (
              <div className="hi-club-list">
                {clubsToShow.map((club) => (
                  <div key={club.normalizedName} className="hi-club-row">
                    <label className="hi-field">
                      <span className="hi-field-label">Texto detectado</span>
                      <input className="basalt-input" value={club.sourceName} readOnly />
                    </label>
                    <label className="hi-field">
                      <span className="hi-field-label">Club vinculado</span>
                      <select
                        className="basalt-input"
                        value={
                          hasClubOverride(overrides, club.normalizedName)
                            ? overrides[club.normalizedName] || ''
                            : club.matchedClubId || ''
                        }
                        onChange={(event) =>
                          setOverrides((current) => ({
                            ...current,
                            [club.normalizedName]: event.target.value || null,
                          }))
                        }
                      >
                        <option value="">Sin asignar</option>
                        {club.options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}{option.shortName ? ` - ${option.shortName}` : ''}
                          </option>
                        ))}
                      </select>
                      <small className="hi-field-hint">
                        Match actual: {club.matchedClubName || 'sin resolver'} - confianza {club.confidence}
                      </small>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="hi-confirm-bar">
            <div className={`hi-confirm-status${creationBlockReason ? ' is-warning' : ''}`}>
              {creationBlockReason || 'Listo para crear la temporada historica.'}
            </div>
            <div className="hi-confirm-buttons">
              <button type="button" className="basalt-btn" onClick={onBack}>
                Cancelar
              </button>
              <button
                type="button"
                className="basalt-btn basalt-btn-primary"
                disabled={isImporting}
                onClick={() => void handleImport()}
              >
                {isImporting ? <RefreshCw size={15} className="spin" /> : <ArchiveRestore size={15} />}
                Crear temporada historica
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
