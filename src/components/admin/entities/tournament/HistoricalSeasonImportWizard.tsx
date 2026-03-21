'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArchiveRestore, CheckCircle2, RefreshCw, Upload, X } from 'lucide-react';
import type {
  HistoricalImportClubResolution,
  HistoricalImportPreviewResult,
} from '@/lib/types/historical-tournament-import';
import './basalt.css';
import './fixture-management.css';

type FormState = {
  tournamentName: string;
  displayName: string;
  slug: string;
  publish: boolean;
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

function needsAttention(club: HistoricalImportClubResolution) {
  return !club.matchedClubId || club.confidence !== 'alta' || club.matchType === 'manual';
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
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);

  const attentionClubs = useMemo(
    () => (preview?.clubs || []).filter((club) => needsAttention(club)),
    [preview?.clubs]
  );

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
      onPreviewChange?.(json);
    } catch (error) {
      setPreview(null);
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
    setIsImporting(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/historical-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          rawText,
          overrides,
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

  return (
    <section className="operation-fixture-panel basalt-card">
      {showStandaloneHeader ? (
        <div className="operation-fixture-panel-head">
          <div>
            <span className="operation-fixture-kicker">Temporadas archivadas</span>
            <h4>Importar temporada historica desde texto</h4>
            <p>
              Este flujo crea un torneo nuevo de temporada usando el torneo actual como plantilla de identidad y
              relaciones. No mezcla datos dentro de la temporada activa.
            </p>
          </div>
          <button type="button" className="basalt-btn" onClick={onBack}>
            <X size={15} />
            Volver
          </button>
        </div>
      ) : null}

      <div className="operation-form-grid">
        <label className="operation-form-field operation-form-field-span-2">
          <span>Texto fuente</span>
          <textarea
            className="basalt-input"
            rows={16}
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder={'Match Schedule\n15/11/2025 - Final\nEquipo A -  Equipo B\t25-16\n\nPos.\tTeam\tPts\tPld\tW\tD\tL\tF\tA\tDiff\tTB\tLB'}
            style={{ minHeight: 280, resize: 'vertical' }}
          />
        </label>
      </div>

      <div className="operation-inline-note">
        <ArchiveRestore size={16} />
        <span>
          El parser espera el formato Match Schedule + tabla Pos./Team/Pts/Pld/W/D/L/F/A/Diff/TB/LB como en tu ejemplo.
        </span>
      </div>

      <div className="operation-inline-actions">
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

      {feedback ? (
        <div className={`operation-feedback operation-feedback-${feedback.tone === 'error' ? 'error' : 'ok'}`}>
          {feedback.tone === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      {preview ? (
        <>
          <div className="operation-summary-grid" style={{ marginTop: 12 }}>
            <div className="operation-summary-card"><span>Temporada</span><strong>{preview.summary.seasonId}</strong></div>
            <div className="operation-summary-card"><span>Partidos</span><strong>{preview.summary.matchesCount}</strong></div>
            <div className="operation-summary-card"><span>Equipos</span><strong>{preview.summary.teamsCount}</strong></div>
            <div className="operation-summary-card"><span>Sin resolver</span><strong>{preview.summary.unresolvedTeams}</strong></div>
            <div className="operation-summary-card"><span>Campeon</span><strong>{preview.summary.champion || '--'}</strong></div>
            <div className="operation-summary-card"><span>Subcampeon</span><strong>{preview.summary.runnerUp || '--'}</strong></div>
          </div>

          {preview.issues.length > 0 ? (
            <div className="operation-validation-list" style={{ marginTop: 16 }}>
              {preview.issues.map((issue) => (
                <div key={`${issue.code}-${issue.message}`} className={`operation-validation-item ${issue.severity === 'error' ? 'tone-warn' : 'tone-ok'}`}>
                  <span className="operation-validation-icon">
                    {issue.severity === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                  </span>
                  <div>
                    <strong>{issue.code}</strong>
                    <p>{issue.message}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="operation-form-grid" style={{ marginTop: 16 }}>
            <label className="operation-form-field">
              <span>Nombre del torneo</span>
              <input
                className="basalt-input"
                value={form.tournamentName}
                onChange={(event) => setForm((current) => ({ ...current, tournamentName: event.target.value }))}
              />
            </label>
            <label className="operation-form-field">
              <span>Nombre publico</span>
              <input
                className="basalt-input"
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
              />
            </label>
            <label className="operation-form-field operation-form-field-span-2">
              <span>Slug</span>
              <input
                className="basalt-input"
                value={form.slug}
                onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              />
            </label>
          </div>

          <label className="operation-toggle">
            <input
              type="checkbox"
              checked={form.publish}
              onChange={(event) => setForm((current) => ({ ...current, publish: event.target.checked }))}
            />
            <span>Publicar y dejar visible al terminar</span>
          </label>

          <section className="operation-side-panel basalt-card" style={{ marginTop: 16 }}>
            <div className="operation-fixture-panel-head">
              <div>
                <span className="operation-fixture-kicker">Fases detectadas</span>
                <h4>Estructura inferida</h4>
              </div>
            </div>
            <div className="operation-context-list">
              {preview.phases.map((phase) => (
                <div key={phase.key} className="operation-context-row">
                  <span>{phase.name}</span>
                  <small>{phase.roundCount} rondas · {phase.matchCount} partidos</small>
                </div>
              ))}
            </div>
          </section>

          <section className="operation-side-panel basalt-card" style={{ marginTop: 16 }}>
            <div className="operation-fixture-panel-head">
              <div>
                <span className="operation-fixture-kicker">Mapeo de clubes</span>
                <h4>Resolver o ajustar nombres</h4>
              </div>
            </div>

            {(attentionClubs.length > 0 ? attentionClubs : preview.clubs).map((club) => (
              <div key={club.normalizedName} className="operation-form-grid" style={{ marginBottom: 12 }}>
                <label className="operation-form-field">
                  <span>Texto detectado</span>
                  <input className="basalt-input" value={club.sourceName} readOnly />
                </label>
                <label className="operation-form-field">
                  <span>Club vinculado</span>
                  <select
                    className="basalt-input"
                    value={overrides[club.normalizedName] || club.matchedClubId || ''}
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
                        {option.name}{option.shortName ? ` · ${option.shortName}` : ''}
                      </option>
                    ))}
                  </select>
                  <small className="operation-field-hint">
                    Match actual: {club.matchedClubName || 'sin resolver'} · confianza {club.confidence}
                  </small>
                </label>
              </div>
            ))}
          </section>

          <div className="operation-inline-actions" style={{ marginTop: 16 }}>
            <button type="button" className="basalt-btn" onClick={onBack}>
              Cancelar
            </button>
            <button
              type="button"
              className="basalt-btn basalt-btn-primary"
              disabled={isImporting || !form.tournamentName.trim() || !form.slug.trim()}
              onClick={() => void handleImport()}
            >
              {isImporting ? <RefreshCw size={15} className="spin" /> : <ArchiveRestore size={15} />}
              Crear temporada historica
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
