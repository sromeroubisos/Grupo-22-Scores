/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { createAdminClient } from '@/lib/supabase/admin';
import { FixtureService } from '@/lib/services/fixtureService';
import { syncClubRankingsForMatches } from '@/lib/server/clubRankings';
import { APP_TIMEZONE, combineLocalDateTimeToUtcIso } from '@/lib/timezone';
import { isMissingRelationError } from '@/lib/utils/fixtureImportErrors';
import type {
  FixtureColumnMapping,
  FixtureColumnSuggestion,
  FixtureDuplicateAction,
  FixtureImportAction,
  FixtureImportCandidate,
  FixtureImportConfidence,
  FixtureImportConfirmDecision,
  FixtureImportConfirmResult,
  FixtureImportDocumentType,
  FixtureImportIssue,
  FixtureImportNormalizedRow,
  FixtureImportPreviewResult,
  FixtureImportPreviewRow,
  FixtureImportReferenceData,
  FixtureImportRowStatus,
  FixtureImportSourceType,
} from '@/lib/types/fixture-import';

type PreviewParams = {
  tournamentId: string;
  phaseId: string;
  actorUserId: string;
  file?: File | null;
  pastedText?: string | null;
  mapping?: FixtureColumnMapping | null;
};

type ConfirmParams = {
  tournamentId: string;
  phaseId: string;
  actorUserId: string;
  jobId: string;
  decisions: FixtureImportConfirmDecision[];
};

type TournamentContext = {
  tournament: any;
  phase: any;
  rounds: any[];
  groups: any[];
  participants: Array<{
    id: string;
    club_id: string | null;
    name: string | null;
    short_code: string | null;
    group_id: string | null;
    club: any;
    aliases: string[];
  }>;
  competitionAliases: Array<{ alias: string }>;
  venueAliases: Array<{ alias: string; canonical_name: string | null }>;
  clubVenues: any[];
  existingMatches: any[];
};

type ParsedSource = {
  sourceType: FixtureImportSourceType;
  headers: string[];
  rows: Record<string, unknown>[];
  extractedText: string | null;
  issues: FixtureImportIssue[];
  mapping: FixtureColumnMapping;
  suggestions: FixtureColumnSuggestion[];
  needsManualMapping: boolean;
  fileName: string | null;
  mimeType: string | null;
  extension: string | null;
  size: number | null;
  buffer: Buffer | null;
};

type MatchableEntry = {
  id: string;
  label: string;
  normalized: string;
  aliases: string[];
};

type CachedPreviewRecord = {
  id: string;
  preview_payload: {
    raw: Record<string, unknown>;
    normalized: FixtureImportNormalizedRow;
    matched: FixtureImportPreviewRow['matched'];
    issues: FixtureImportIssue[];
    sourceLabel: string;
    duplicateAction: FixtureDuplicateAction;
    action: FixtureImportAction;
  };
  duplicate_action: FixtureDuplicateAction;
  duplicate_match_id: string | null;
  approval_status?: string;
  inserted_match_id?: string | null;
};

const IMPORT_PREVIEW_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const importPreviewCache = new Map<string, { createdAt: number; previews: CachedPreviewRecord[] }>();

const HEADER_ALIASES: Record<keyof FixtureColumnMapping, string[]> = {
  home_team: ['Local', 'Equipo Local', 'Home', 'Club A', 'Equipo A'],
  away_team: ['Visitante', 'Equipo Visitante', 'Away', 'Club B', 'Equipo B'],
  match_date: ['Fecha', 'Date', 'Dia', 'Día'],
  match_time: ['Hora', 'Time', 'Kickoff'],
  venue: ['Cancha', 'Sede', 'Venue', 'Field'],
  round: ['Fecha N°', 'Round', 'Jornada', 'Fecha', 'Matchday'],
  group: ['Zona', 'Grupo', 'Pool'],
  phase: ['Fase', 'Stage', 'Etapa'],
  competition_name: ['Torneo', 'Competencia', 'Competition'],
  category: ['Categoría', 'Categoria', 'Division', 'División', 'Category'],
  status: ['Estado', 'Status'],
  score: ['Resultado', 'Score', 'Marcador'],
  score_home: ['Goles Local', 'Puntos Local', 'Local Score'],
  score_away: ['Goles Visitante', 'Puntos Visitante', 'Away Score'],
};

const REQUIRED_FIELDS: Array<keyof FixtureColumnMapping> = ['home_team', 'away_team'];

export class FixtureImportService {
  static async createPreview(params: PreviewParams): Promise<FixtureImportPreviewResult> {
    const supabase = createAdminClient() as any;
    const context = await this.getContext(supabase, params.tournamentId, params.phaseId);
    const parsed = await this.parseSource(params.file ?? null, params.pastedText ?? null, params.mapping ?? null);
    const rows = parsed.rows.map((row, index) => this.buildPreviewRow(row, index + 1, parsed.mapping, context));
    const documentType = this.classifyDocument(parsed.headers, rows);
    const confidence = this.deriveConfidence(parsed.sourceType, rows, parsed.issues, documentType);
    const summary = this.buildSummary('', rows, parsed.sourceType, documentType, confidence, parsed.fileName, rows.length ? 'preview_ready' : 'needs_review');
    const issues = [...parsed.issues];

    if (documentType === 'standings_sheet') {
      issues.push(this.issue('error', 'document_not_fixture', 'El documento parece una tabla de posiciones y no un fixture.', 'document'));
    }
    if (['pdf_text', 'pdf_scanned', 'image'].includes(parsed.sourceType) && rows.length === 0) {
      issues.push(this.issue('warning', 'review_required', 'La fuente requiere OCR o revisión manual antes de importar.', 'document'));
    }

    const job = await this.createImportJob(supabase, params, parsed, summary, documentType, confidence);

    await this.storeImportFile(supabase, job.id, parsed);

    if (rows.length > 0) {
      await this.storePreviewRows(supabase, job.id, rows, confidence);
    }

    this.cachePreviewRows(job.id, rows);

    await this.safeInsertImportLog(supabase, {
      job_id: job.id,
      actor_user_id: params.actorUserId,
      event_type: 'preview_generated',
      payload: {
        sourceType: parsed.sourceType,
        documentType,
        rowCount: rows.length,
      },
    });

    return {
      ok: true,
      summary: { ...summary, jobId: job.id },
      mapping: {
        headers: parsed.headers,
        suggestions: parsed.suggestions,
        selected: parsed.mapping,
        needsManualMapping: parsed.needsManualMapping,
      },
      referenceData: this.referenceData(context),
      issues,
      rows,
    };
  }

  static async confirmImport(params: ConfirmParams): Promise<FixtureImportConfirmResult> {
    const supabase = createAdminClient() as any;
    const context = await this.getContext(supabase, params.tournamentId, params.phaseId);
    const decisions = new Map(params.decisions.map((decision) => [decision.previewId, decision]));
    const previews = await this.loadStoredPreviews(supabase, params.jobId);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let rejected = 0;
    const issues: FixtureImportIssue[] = [];
    const touchedMatchIds: string[] = [];

    for (const preview of previews as any[]) {
      const decision = decisions.get(preview.id);
      const payload = preview.preview_payload || {};
      const normalized = { ...(payload.normalized || {}), ...(decision?.overrides || {}) } as FixtureImportNormalizedRow & Record<string, unknown>;
      const matched = payload.matched || {};
      const action: FixtureImportAction = decision?.action || 'omit';
      const duplicateAction: FixtureDuplicateAction = decision?.duplicateAction || preview.duplicate_action || 'skip_row';

      if (action === 'omit') {
        skipped += 1;
        await this.markPreview(supabase, preview.id, 'omitted', null);
        continue;
      }

      const homeClubId = (normalized.homeClubId as string | null) || matched.homeClub?.id || null;
      const awayClubId = (normalized.awayClubId as string | null) || matched.awayClub?.id || null;
      if (!homeClubId || !awayClubId) {
        rejected += 1;
        issues.push(this.issue('error', 'clubs_unresolved', `La fila ${payload.sourceLabel || preview.id} requiere resolver clubes antes de importar.`, 'row'));
        await this.markPreview(supabase, preview.id, 'rejected', null);
        continue;
      }
      if (homeClubId === awayClubId) {
        rejected += 1;
        issues.push(this.issue('error', 'same_home_and_away', `La fila ${payload.sourceLabel || preview.id} tiene el mismo club en ambos lados.`, 'row'));
        await this.markPreview(supabase, preview.id, 'rejected', null);
        continue;
      }

      const roundId =
        (normalized.roundId as string | null) ||
        matched.round?.id ||
        (normalized.round ? await FixtureService.findOrCreateRound(params.phaseId, String(normalized.round)) : null);
      const groupId = (normalized.groupId as string | null) || matched.group?.id || null;
      const existingMatchId =
        (normalized.existingMatchId as string | null) || matched.duplicateMatchId || preview.duplicate_match_id || null;

      if (existingMatchId && duplicateAction === 'flag_for_manual_review') {
        rejected += 1;
        issues.push(this.issue('warning', 'manual_review_required', `La fila ${payload.sourceLabel || preview.id} quedó marcada para revisión manual por duplicado.`, 'duplicate'));
        await this.markPreview(supabase, preview.id, 'manual_review', null);
        continue;
      }
      if (existingMatchId && duplicateAction === 'skip_row') {
        skipped += 1;
        await this.markPreview(supabase, preview.id, 'skipped_duplicate', existingMatchId);
        continue;
      }

      const status = this.normalizeStatus(normalized.status as string | null, normalized.scoreHome as number | null, normalized.scoreAway as number | null);
      const matchPayload = {
        tournament_id: params.tournamentId,
        phase_id: params.phaseId,
        // Mirror FixtureService.createMatch: scope the match to the phase's
        // season so it surfaces in the season-filtered fixture/tournament
        // views. Without this, imported matches land with season_id = NULL
        // and only show in the unscoped global feed (`/`).
        ...(context.phase?.season_id ? { season_id: context.phase.season_id } : {}),
        round_uuid: roundId,
        group_id: groupId,
        home_club_id: homeClubId,
        away_club_id: awayClubId,
        date_time: this.combineDateTime(normalized.matchDate as string | null, normalized.matchTime as string | null),
        venue: (normalized.venue as string | null) || null,
        status,
        score:
          normalized.scoreHome !== null || normalized.scoreAway !== null
            ? { home: Number(normalized.scoreHome || 0), away: Number(normalized.scoreAway || 0) }
            : { home: 0, away: 0 },
        notes: null,
      };

      if (existingMatchId && duplicateAction === 'update_existing_match') {
        const { error: updateError } = await supabase.from('matches').update(matchPayload).eq('id', existingMatchId);
        if (updateError) {
          rejected += 1;
          issues.push(this.issue('error', 'match_update_failed', updateError.message, 'row'));
          await this.markPreview(supabase, preview.id, 'rejected', null);
          continue;
        }
        updated += 1;
        touchedMatchIds.push(existingMatchId);
        await this.learnAliases(supabase, params.tournamentId, normalized, matched, context);
        await this.markPreview(supabase, preview.id, 'updated', existingMatchId);
        continue;
      }

      const { data: inserted, error: insertError } = await supabase.from('matches').insert(matchPayload).select('id').single();
      if (insertError || !inserted) {
        rejected += 1;
        issues.push(this.issue('error', 'match_insert_failed', insertError?.message || 'No se pudo crear el partido.', 'row'));
        await this.markPreview(supabase, preview.id, 'rejected', null);
        continue;
      }

      created += 1;
      touchedMatchIds.push(inserted.id);
      await this.learnAliases(supabase, params.tournamentId, normalized, matched, context);
      await this.markPreview(supabase, preview.id, 'imported', inserted.id);
    }

    await this.finalizeImportJob(supabase, params.jobId, { created, updated, skipped, rejected });

    await this.safeInsertImportLog(supabase, {
      job_id: params.jobId,
      actor_user_id: params.actorUserId,
      event_type: 'import_confirmed',
      payload: { created, updated, skipped, rejected },
    });

    if (touchedMatchIds.length > 0) {
      syncClubRankingsForMatches(touchedMatchIds).catch((error) => {
        console.error('[FixtureImportService] Club ranking sync failed:', error);
      });
    }

    return { ok: rejected === 0, jobId: params.jobId, created, updated, skipped, rejected, issues };
  }

  private static async createImportJob(
    supabase: any,
    params: PreviewParams,
    parsed: ParsedSource,
    summary: FixtureImportPreviewResult['summary'],
    documentType: FixtureImportDocumentType,
    confidence: FixtureImportConfidence
  ) {
    const primaryInsert = await supabase
      .from('import_jobs')
      .insert({
        tournament_id: params.tournamentId,
        phase_id: params.phaseId,
        source_type: parsed.sourceType,
        document_type: documentType,
        confidence_level: confidence,
        status: summary.status,
        created_by: params.actorUserId,
        metadata: {
          fileName: parsed.fileName,
          mimeType: parsed.mimeType,
          extension: parsed.extension,
          size: parsed.size,
          headers: parsed.headers,
          mapping: parsed.mapping,
        },
        preview_stats: {
          totalRows: summary.totalRows,
          validRows: summary.validRows,
          warningRows: summary.warningRows,
          errorRows: summary.errorRows,
          duplicateRows: summary.duplicateRows,
          unmatchedEntities: summary.unmatchedEntities,
        },
      })
      .select('id')
      .single();

    if (!primaryInsert.error && primaryInsert.data) {
      return primaryInsert.data;
    }

    if (!this.isCompatRetryableError(primaryInsert.error)) {
      throw new Error(primaryInsert.error?.message || 'No se pudo crear el trabajo de importación.');
    }

    const fallbackInsert = await supabase
      .from('import_jobs')
      .insert({
        tournament_id: params.tournamentId,
        phase_id: params.phaseId,
        source_type: parsed.sourceType === 'pasted_text' ? 'text' : 'file',
        status: 'preview',
        created_by: params.actorUserId,
      })
      .select('id')
      .single();

    if (fallbackInsert.error || !fallbackInsert.data) {
      if (this.isCompatRetryableError(fallbackInsert.error)) {
        return { id: this.createEphemeralJobId() };
      }
      throw new Error(fallbackInsert.error?.message || 'No se pudo crear el trabajo de importación.');
    }

    return fallbackInsert.data;
  }

  private static async storeImportFile(supabase: any, jobId: string, parsed: ParsedSource) {
    if (this.isEphemeralJobId(jobId)) {
      return;
    }

    const primaryInsert = await supabase.from('import_files').insert({
      job_id: jobId,
      original_name: parsed.fileName || 'pasted-text.txt',
      mime_type: parsed.mimeType || 'text/plain',
      extension: parsed.extension,
      file_size: parsed.size,
      file_hash: parsed.buffer ? createHash('sha256').update(parsed.buffer).digest('hex') : null,
      extracted_text: parsed.extractedText,
      metadata: { sourceType: parsed.sourceType },
    });

    if (!primaryInsert.error) {
      return;
    }

    if (!this.isCompatRetryableError(primaryInsert.error)) {
      throw new Error(primaryInsert.error.message || 'No se pudo guardar el archivo importado.');
    }

    const fallbackInsert = await supabase.from('import_files').insert({
      job_id: jobId,
      file_name: parsed.fileName || 'pasted-text.txt',
      file_type: parsed.mimeType || 'text/plain',
      file_size: parsed.size,
      storage_path: null,
    });

    if (fallbackInsert.error) {
      if (this.isCompatRetryableError(fallbackInsert.error)) {
        return;
      }
      throw new Error(fallbackInsert.error.message || 'No se pudo guardar el archivo importado.');
    }
  }

  private static async storePreviewRows(supabase: any, jobId: string, rows: FixtureImportPreviewRow[], confidence: FixtureImportConfidence) {
    if (this.isEphemeralJobId(jobId)) {
      return;
    }

    const primaryRowsInsert = await supabase
      .from('import_rows')
      .insert(
        rows.map((row) => ({
          job_id: jobId,
          row_index: row.rowIndex,
          source_label: row.sourceLabel,
          raw_payload: row.raw,
          extracted_payload: this.buildStoredPreviewPayload(row, confidence),
          normalized_payload: row.normalized,
          validation_status: row.status,
          confidence_level: row.matched.homeClub?.confidence || row.matched.awayClub?.confidence || confidence,
          issues: row.issues,
        }))
      )
      .select('id, row_index');

    if (!primaryRowsInsert.error && primaryRowsInsert.data) {
      const rowIds = new Map<number, string>(primaryRowsInsert.data.map((item: any) => [item.row_index, item.id]));
      rows.forEach((row) => {
        row.previewId = rowIds.get(row.rowIndex) || row.previewId;
      });
      const primaryPreviewInsert = await supabase
        .from('import_match_previews')
        .insert(
          rows.map((row) => ({
            job_id: jobId,
            row_id: rowIds.get(row.rowIndex),
            approval_status: row.action === 'approve' ? 'pending' : 'omitted',
            duplicate_action: row.duplicateAction,
            row_status: row.status,
            error_count: row.issues.filter((issue) => issue.severity === 'error').length,
            warning_count: row.issues.filter((issue) => issue.severity === 'warning').length,
            duplicate_match_id: row.matched.duplicateMatchId,
            preview_payload: {
              raw: row.raw,
              normalized: row.normalized,
              matched: row.matched,
              issues: row.issues,
              sourceLabel: row.sourceLabel,
              duplicateAction: row.duplicateAction,
            },
            resolution_payload: { action: row.action },
          }))
        )
        .select('id, row_id');

      if (primaryPreviewInsert.error || !primaryPreviewInsert.data) {
        if (!this.isCompatRetryableError(primaryPreviewInsert.error)) {
          throw new Error(primaryPreviewInsert.error?.message || 'No se pudo crear la previsualización.');
        }
        return;
      } else {
        const previewIds = new Map<string, string>(primaryPreviewInsert.data.map((item: any) => [item.row_id, item.id]));
        rows.forEach((row) => {
          const rowId = rowIds.get(row.rowIndex);
          if (rowId) row.previewId = previewIds.get(rowId) || row.previewId;
        });
        return;
      }
    } else if (!this.isCompatRetryableError(primaryRowsInsert.error)) {
      throw new Error(primaryRowsInsert.error?.message || 'No se pudieron guardar las filas importadas.');
    }

    const legacyRowsInsert = await supabase
      .from('import_rows')
      .insert(
        rows.map((row) => ({
          job_id: jobId,
          row_index: row.rowIndex,
          raw_data: {
            raw: row.raw,
            normalized: row.normalized,
            matched: row.matched,
            issues: row.issues,
            confidence: row.matched.homeClub?.confidence || row.matched.awayClub?.confidence || confidence,
            sourceLabel: row.sourceLabel,
            duplicateAction: row.duplicateAction,
            action: row.action,
          },
        }))
      )
      .select('id, row_index');

    if (legacyRowsInsert.error || !legacyRowsInsert.data) {
      if (this.isCompatRetryableError(legacyRowsInsert.error)) {
        return;
      }
      throw new Error(legacyRowsInsert.error?.message || 'No se pudieron guardar las filas importadas.');
    }

    const legacyPreviewInsert = await supabase
      .from('import_match_previews')
      .insert(
        rows.map((row) => ({
          job_id: jobId,
          match_date: row.normalized.matchDate,
          match_time: row.normalized.matchTime,
          home_team: row.normalized.homeTeam,
          away_team: row.normalized.awayTeam,
          venue: row.normalized.venue,
          validation_status: this.toLegacyValidationStatus(row.status),
        }))
      )
      .select('id');

    if (legacyPreviewInsert.error || !legacyPreviewInsert.data) {
      if (this.isCompatRetryableError(legacyPreviewInsert.error)) {
        return;
      }
      throw new Error(legacyPreviewInsert.error?.message || 'No se pudo crear la previsualización.');
    }

    rows.forEach((row, index) => {
      row.previewId = legacyPreviewInsert.data[index]?.id || row.previewId;
    });
  }

  private static async loadStoredPreviews(supabase: any, jobId: string) {
    const cachedPreviews = this.getCachedPreviews(jobId);
    if (cachedPreviews) {
      return cachedPreviews;
    }

    const primaryQuery = await supabase
      .from('import_match_previews')
      .select('id, preview_payload, duplicate_action, duplicate_match_id')
      .eq('job_id', jobId);

    if (!primaryQuery.error && primaryQuery.data) {
      return primaryQuery.data as any[];
    }

    if (!this.isCompatRetryableError(primaryQuery.error)) {
      throw new Error(primaryQuery.error?.message || 'No se pudo cargar la previsualización.');
    }

    const modernRows = await supabase
      .from('import_rows')
      .select('id, row_index, source_label, raw_payload, extracted_payload, normalized_payload, issues, validation_status')
      .eq('job_id', jobId)
      .order('row_index');

    if (!modernRows.error && modernRows.data) {
      return modernRows.data.map((row: any) => this.restorePreviewFromModernRow(row));
    }

    if (modernRows.error && !this.isCompatRetryableError(modernRows.error)) {
      throw new Error(modernRows.error.message || 'No se pudo cargar la previsualizaciÃ³n.');
    }

    const fallbackQuery = await supabase
      .from('import_match_previews')
      .select('id, created_at')
      .eq('job_id', jobId)
      .order('created_at');

    const fallbackRows = await supabase
      .from('import_rows')
      .select('id, row_index, raw_data')
      .eq('job_id', jobId)
      .order('row_index');

    if (fallbackQuery.error || !fallbackQuery.data || fallbackRows.error || !fallbackRows.data) {
      throw new Error(fallbackQuery.error?.message || fallbackRows.error?.message || 'No se pudo cargar la previsualización.');
    }

    return fallbackQuery.data.map((preview: any, index: number) => {
      const row = fallbackRows.data[index];
      return this.restorePreviewFromLegacyRow(preview.id, row?.row_index || null, row?.raw_data || {});
    });
  }

  private static async finalizeImportJob(supabase: any, jobId: string, stats: { created: number; updated: number; skipped: number; rejected: number }) {
    if (this.isEphemeralJobId(jobId)) {
      return;
    }

    const primaryUpdate = await supabase
      .from('import_jobs')
      .update({
        status: 'confirmed',
        completed_at: new Date().toISOString(),
        result_stats: stats,
      })
      .eq('id', jobId);

    if (!primaryUpdate.error) {
      return;
    }

    if (!this.isCompatRetryableError(primaryUpdate.error)) {
      throw primaryUpdate.error;
    }

    const fallbackUpdate = await supabase
      .from('import_jobs')
      .update({
        status: 'confirmed',
      })
      .eq('id', jobId);

    if (fallbackUpdate.error) {
      if (this.isCompatRetryableError(fallbackUpdate.error)) {
        return;
      }
      throw fallbackUpdate.error;
    }
  }

  private static async safeInsertImportLog(supabase: any, payload: Record<string, unknown>) {
    if (this.isEphemeralJobId(String(payload.job_id || ''))) {
      return;
    }

    const primaryInsert = await supabase.from('import_logs').insert(payload);
    if (!primaryInsert.error) {
      return;
    }

    if (isMissingRelationError(primaryInsert.error)) {
      return;
    }

    if (!this.isCompatRetryableError(primaryInsert.error)) {
      throw primaryInsert.error;
    }

    const fallbackInsert = await supabase.from('import_logs').insert({
      job_id: payload.job_id,
      level: 'info',
      message: String(payload.event_type || 'fixture_import_event'),
      details: payload.payload || {},
    });

    if (fallbackInsert.error && !isMissingRelationError(fallbackInsert.error)) {
      throw fallbackInsert.error;
    }
  }

  private static async getContext(supabase: any, tournamentId: string, phaseId: string): Promise<TournamentContext> {
    const [tournamentRes, phaseRes, roundsRes, groupsRes, participantsRes, competitionAliasesRes, venueAliasesRes, existingMatchesRes] =
      await Promise.all([
        supabase.from('tournaments').select('*').eq('id', tournamentId).single(),
        supabase.from('tournament_phases').select('*').eq('id', phaseId).single(),
        supabase.from('tournament_rounds').select('*').eq('phase_id', phaseId).order('order_index'),
        this.safeSelect(supabase, 'tournament_groups', '*', (query: any) => query.eq('phase_id', phaseId).order('order_index')),
        supabase
          .from('tournament_participants')
          .select('id, club_id, name, short_code, group_id, clubs:club_id(id, name, short_name)')
          .eq('tournament_id', tournamentId)
          .eq('status', 'active'),
        this.safeSelect(supabase, 'competition_aliases', 'alias', (query: any) => query.eq('tournament_id', tournamentId)),
        this.safeSelect(supabase, 'venue_aliases', 'alias, canonical_name', (query: any) => query.eq('tournament_id', tournamentId)),
        supabase
          .from('matches')
          .select('id, round_uuid, group_id, home_club_id, away_club_id, date_time')
          .eq('tournament_id', tournamentId)
          .eq('phase_id', phaseId),
      ]);

    if (tournamentRes.error || !tournamentRes.data) throw new Error(tournamentRes.error?.message || 'No se encontró el torneo.');
    if (phaseRes.error || !phaseRes.data) throw new Error(phaseRes.error?.message || 'No se encontró la fase.');

    const clubIds = (participantsRes.data || []).map((participant: any) => participant.club_id).filter(Boolean);
    const [clubAliasesRes, clubVenuesRes] = await Promise.all([
      this.safeSelect(supabase, 'club_aliases', 'club_id, alias'),
      clubIds.length > 0 ? this.safeSelect(supabase, 'club_venues', '*', (query: any) => query.in('club_id', clubIds)) : { data: [], error: null },
    ]);

    return {
      tournament: tournamentRes.data,
      phase: phaseRes.data,
      rounds: roundsRes.data || [],
      groups: groupsRes.data || [],
      participants: (participantsRes.data || []).map((participant: any) => ({
        id: participant.id,
        club_id: participant.club_id,
        name: participant.name,
        short_code: participant.short_code,
        group_id: participant.group_id,
        club: participant.clubs,
        aliases: (clubAliasesRes.data || [])
          .filter((alias: any) => alias.club_id === participant.club_id)
          .map((alias: any) => alias.alias),
      })),
      competitionAliases: competitionAliasesRes.data || [],
      venueAliases: venueAliasesRes.data || [],
      clubVenues: clubVenuesRes.data || [],
      existingMatches: existingMatchesRes.data || [],
    };
  }

  private static async parseSource(file: File | null, pastedText: string | null, mapping: FixtureColumnMapping | null): Promise<ParsedSource> {
    if (pastedText?.trim()) {
      const rows = pastedText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
          const parsed = this.parseTextLine(line);
          return {
            _line: line,
            line_number: index + 1,
            home_team: parsed.homeTeam,
            away_team: parsed.awayTeam,
            match_date: parsed.matchDate,
            match_time: parsed.matchTime,
            venue: parsed.venue,
            round: parsed.round,
            status: parsed.status,
          };
        });

      return {
        sourceType: 'pasted_text',
        headers: ['home_team', 'away_team', 'match_date', 'match_time', 'venue', 'round', 'status'],
        rows,
        extractedText: pastedText,
        issues: rows.length ? [] : [this.issue('error', 'empty_text', 'No se detectaron líneas con partidos.', 'document')],
        mapping: {
          home_team: 'home_team',
          away_team: 'away_team',
          match_date: 'match_date',
          match_time: 'match_time',
          venue: 'venue',
          round: 'round',
          status: 'status',
        },
        suggestions: [],
        needsManualMapping: false,
        fileName: null,
        mimeType: 'text/plain',
        extension: null,
        size: Buffer.byteLength(pastedText, 'utf8'),
        buffer: Buffer.from(pastedText, 'utf8'),
      };
    }

    if (!file) {
      return {
        sourceType: 'unknown',
        headers: [],
        rows: [],
        extractedText: null,
        issues: [this.issue('error', 'missing_source', 'Debes subir un archivo o pegar texto.', 'document')],
        mapping: {},
        suggestions: [],
        needsManualMapping: false,
        fileName: null,
        mimeType: null,
        extension: null,
        size: null,
        buffer: null,
      };
    }

    const extension = file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : null;
    const sourceType = this.detectSourceType(extension, file.type);
    const buffer = Buffer.from(await file.arrayBuffer());

    if (sourceType === 'excel' || sourceType === 'csv') {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
      const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
      const suggestions = this.suggestMapping(headers);
      const selectedMapping = { ...this.mappingFromSuggestions(suggestions), ...(mapping || {}) };
      const needsManualMapping = REQUIRED_FIELDS.some((field) => !selectedMapping[field]);
      return {
        sourceType,
        headers,
        rows,
        extractedText: rows.map((row) => Object.values(row).filter(Boolean).join(' | ')).join('\n'),
        issues: [
          ...(rows.length ? [] : [this.issue('error', 'no_rows_detected', 'El archivo no contiene filas.', 'document')]),
          ...(needsManualMapping ? [this.issue('warning', 'manual_mapping_required', 'Completa el mapeo de columnas antes de confirmar.', 'mapping')] : []),
        ],
        mapping: selectedMapping,
        suggestions,
        needsManualMapping,
        fileName: file.name,
        mimeType: file.type || null,
        extension,
        size: file.size,
        buffer,
      };
    }

    return {
      sourceType,
      headers: [],
      rows: [],
      extractedText: null,
      issues: [this.issue('warning', 'ocr_required', 'PDF e imágenes quedan en revisión obligatoria hasta integrar OCR.', 'document')],
      mapping: {},
      suggestions: [],
      needsManualMapping: false,
      fileName: file.name,
      mimeType: file.type || null,
      extension,
      size: file.size,
      buffer,
    };
  }

  private static buildPreviewRow(rawRow: Record<string, unknown>, rowIndex: number, mapping: FixtureColumnMapping, context: TournamentContext): FixtureImportPreviewRow {
    const normalized = this.normalizeRow(rawRow, mapping, context);
    const clubs: MatchableEntry[] = context.participants
      .filter((participant) => participant.club_id && participant.club)
      .map((participant) => ({
        id: participant.club_id as string,
        label: participant.club.name || participant.name || '',
        normalized: this.normalizeKey(participant.club.name || participant.name || ''),
        aliases: [participant.name, participant.short_code, participant.club?.short_name, ...participant.aliases]
          .filter(Boolean)
          .map((value: string) => this.normalizeKey(value)),
      }));
    const rounds: MatchableEntry[] = context.rounds.map((round) => ({
      id: round.id,
      label: round.name,
      normalized: this.normalizeKey(round.name),
      aliases: this.buildRoundAliases(round.name),
    }));
    const groups: MatchableEntry[] = context.groups.map((group) => ({
      id: group.id,
      label: group.name,
      normalized: this.normalizeKey(group.name),
      aliases: [],
    }));
    const venues: MatchableEntry[] = context.clubVenues.map((venue) => ({
      id: venue.id,
      label: venue.name,
      normalized: this.normalizeKey(venue.name),
      aliases: context.venueAliases
        .filter((alias) => this.normalizeKey(alias.canonical_name || '') === this.normalizeKey(venue.name))
        .map((alias) => this.normalizeKey(alias.alias)),
    }));
    const competition: MatchableEntry = {
      id: context.tournament.id,
      label: context.tournament.display_name || context.tournament.name,
      normalized: this.normalizeKey(context.tournament.display_name || context.tournament.name),
      aliases: context.competitionAliases.map((alias) => this.normalizeKey(alias.alias)),
    };

    const homeClub = normalized.homeTeam ? this.matchEntity(normalized.homeTeam, clubs) : null;
    const awayClub = normalized.awayTeam ? this.matchEntity(normalized.awayTeam, clubs) : null;
    const round = normalized.round ? this.matchEntity(normalized.round, rounds) : null;
    const group = normalized.group ? this.matchEntity(normalized.group, groups) : null;
    const venue = normalized.venue ? this.matchEntity(normalized.venue, venues) : null;
    const competitionMatch = normalized.competitionName ? this.matchEntity(normalized.competitionName, [competition]) : this.toCandidate(competition, 'exact_match', 'alta');
    const duplicateMatchId =
      homeClub?.id && awayClub?.id
        ? this.findDuplicate(context.existingMatches, homeClub.id, awayClub.id, normalized.matchDate, round?.id || null, group?.id || null)
        : null;

    const issues: FixtureImportIssue[] = [];
    if (!normalized.homeTeam) issues.push(this.issue('error', 'home_team_missing', 'Falta el club local.', 'home_team'));
    if (!normalized.awayTeam) issues.push(this.issue('error', 'away_team_missing', 'Falta el club visitante.', 'away_team'));
    if (normalized.homeTeam && normalized.awayTeam && this.normalizeKey(normalized.homeTeam) === this.normalizeKey(normalized.awayTeam)) {
      issues.push(this.issue('error', 'same_home_and_away', 'Local y visitante no pueden ser el mismo club.', 'row'));
    }
    if ((rawRow[mapping.match_date || ''] || rawRow.match_date) && !normalized.matchDate) {
      issues.push(this.issue('error', 'invalid_date_format', 'La fecha no pudo normalizarse.', 'match_date'));
    }
    if (normalized.competitionName && !competitionMatch) {
      issues.push(this.issue('error', 'unresolved_competition', 'La competencia no coincide con el torneo actual.', 'competition_name'));
    }
    if (normalized.homeTeam && !homeClub) issues.push(this.issue('warning', 'ambiguous_team_match', `No se pudo vincular "${normalized.homeTeam}".`, 'home_team'));
    if (normalized.awayTeam && !awayClub) issues.push(this.issue('warning', 'ambiguous_team_match', `No se pudo vincular "${normalized.awayTeam}".`, 'away_team'));
    if (!normalized.matchTime) issues.push(this.issue('warning', 'missing_time', 'La hora está ausente.', 'match_time'));
    if (!normalized.venue) issues.push(this.issue('warning', 'missing_venue', 'La sede está ausente.', 'venue'));
    if (duplicateMatchId) issues.push(this.issue('warning', 'possible_duplicate', 'Se detectó un posible duplicado.', 'duplicate'));

    const status = this.rowStatus(issues, Boolean(duplicateMatchId));
    return {
      previewId: randomUUID(),
      rowIndex,
      sourceLabel: `${normalized.homeTeam || 'Sin local'} vs ${normalized.awayTeam || 'Sin visitante'}`,
      status,
      action: status === 'error' ? 'omit' : 'approve',
      duplicateAction: duplicateMatchId ? 'skip_row' : 'skip_row',
      raw: rawRow,
      normalized,
      matched: {
        homeClub,
        awayClub,
        round,
        group,
        venue,
        competition: competitionMatch,
        duplicateMatchId,
      },
      issues,
    };
  }

  private static normalizeRow(rawRow: Record<string, unknown>, mapping: FixtureColumnMapping, context: TournamentContext): FixtureImportNormalizedRow {
    const pick = (field: keyof FixtureColumnMapping) => {
      const header = mapping[field];
      return header ? rawRow[header] : null;
    };
    const scoreText = this.readString(pick('score'));
    const parsedScore = scoreText ? this.parseScore(scoreText) : null;
    const matchDate = this.normalizeDate(pick('match_date'));
    return {
      sport: context.tournament.sport || null,
      competitionName: this.readString(pick('competition_name')) || context.tournament.display_name || context.tournament.name,
      season: matchDate ? Number(matchDate.slice(0, 4)) : new Date().getFullYear(),
      phase: this.readString(pick('phase')) || context.phase.name || null,
      group: this.readString(pick('group')),
      round: this.readString(pick('round')),
      matchDate,
      matchTime: this.normalizeTime(pick('match_time')),
      homeTeam: this.readString(pick('home_team')),
      awayTeam: this.readString(pick('away_team')),
      venue: this.readString(pick('venue')),
      status: this.readString(pick('status')),
      category: this.readString(pick('category')),
      gender: null,
      country: context.tournament.country || null,
      region: context.tournament.region || null,
      scoreHome: this.toNumber(pick('score_home')) ?? parsedScore?.home ?? null,
      scoreAway: this.toNumber(pick('score_away')) ?? parsedScore?.away ?? null,
    };
  }

  private static referenceData(context: TournamentContext): FixtureImportReferenceData {
    return {
      clubs: context.participants
        .filter((participant) => participant.club_id && participant.club)
        .map((participant) => ({ id: participant.club_id as string, label: participant.club.name || participant.name || 'Club' })),
      rounds: context.rounds.map((round) => ({ id: round.id, label: round.name })),
      groups: context.groups.map((group) => ({ id: group.id, label: group.name })),
      venues: context.clubVenues.map((venue) => ({ id: venue.id, label: venue.name })),
    };
  }

  private static buildSummary(
    jobId: string,
    rows: FixtureImportPreviewRow[],
    sourceType: FixtureImportSourceType,
    documentType: FixtureImportDocumentType,
    confidence: FixtureImportConfidence,
    fileName: string | null,
    status: 'draft' | 'preview_ready' | 'confirmed' | 'needs_review' | 'failed'
  ) {
    return {
      jobId,
      status,
      sourceType,
      documentType,
      confidence,
      fileName,
      totalRows: rows.length,
      validRows: rows.filter((row) => row.status === 'valid').length,
      warningRows: rows.filter((row) => row.status === 'warning').length,
      errorRows: rows.filter((row) => row.status === 'error').length,
      duplicateRows: rows.filter((row) => row.status === 'duplicate').length,
      unmatchedEntities: rows.filter((row) => !row.matched.homeClub || !row.matched.awayClub).length,
    };
  }

  private static classifyDocument(headers: string[], rows: FixtureImportPreviewRow[]): FixtureImportDocumentType {
    const normalizedHeaders = headers.map((header) => this.normalizeKey(header));
    if (normalizedHeaders.some((header) => ['posicion', 'pos', 'pj', 'pts', 'puntos'].includes(header))) return 'standings_sheet';
    if (rows.length > 0 && rows.filter((row) => row.normalized.scoreHome !== null || row.normalized.scoreAway !== null).length >= Math.ceil(rows.length * 0.4)) {
      return 'results_sheet';
    }
    if (new Set(rows.map((row) => row.normalized.round).filter(Boolean)).size > 1) return 'full_fixture';
    if (new Set(rows.map((row) => row.normalized.venue).filter(Boolean)).size > 1 || new Set(rows.map((row) => row.normalized.category).filter(Boolean)).size > 1) {
      return 'mixed_schedule';
    }
    return rows.length ? 'single_round_fixture' : 'unknown';
  }

  private static deriveConfidence(
    sourceType: FixtureImportSourceType,
    rows: FixtureImportPreviewRow[],
    issues: FixtureImportIssue[],
    documentType: FixtureImportDocumentType
  ): FixtureImportConfidence {
    if (sourceType === 'image' || sourceType === 'pdf_scanned') return 'baja';
    if (documentType === 'standings_sheet') return 'baja';
    const errorCount = rows.reduce((count, row) => count + row.issues.filter((issue) => issue.severity === 'error').length, 0);
    const warningCount = rows.reduce((count, row) => count + row.issues.filter((issue) => issue.severity === 'warning').length, 0) + issues.length;
    if (errorCount === 0 && warningCount <= Math.max(2, Math.floor(rows.length / 2))) return 'alta';
    if (errorCount <= Math.max(1, Math.floor(rows.length / 4))) return 'media';
    return 'baja';
  }

  private static suggestMapping(headers: string[]): FixtureColumnSuggestion[] {
    return Object.entries(HEADER_ALIASES).map(([field, aliases]) => {
      const match = headers.find((header) => aliases.some((alias) => this.normalizeKey(alias) === this.normalizeKey(header)));
      return { field: field as keyof FixtureColumnMapping, header: match || null, confidence: match ? 'alta' : 'baja' };
    });
  }

  private static mappingFromSuggestions(suggestions: FixtureColumnSuggestion[]): FixtureColumnMapping {
    return suggestions.reduce<FixtureColumnMapping>((accumulator, item) => {
      accumulator[item.field] = item.header;
      return accumulator;
    }, {});
  }

  private static parseTextLine(line: string) {
    const pipeSegments = line.split(/\s+\|\s+/).map((item) => item.trim()).filter(Boolean);
    const dashSegments = line.split(/\s+-\s+/).map((item) => item.trim()).filter(Boolean);
    const segments = dashSegments.length >= 3 ? dashSegments : pipeSegments;
    const teamSegmentIndex = segments.findIndex((segment) => /\b(?:vs|v)\b/i.test(segment));
    const metadataSegments = teamSegmentIndex >= 0 ? segments.slice(0, teamSegmentIndex) : [];
    const trailingSegments = teamSegmentIndex >= 0 ? segments.slice(teamSegmentIndex + 1) : [];

    let round: string | null = this.extractNumericRoundLabel(line);
    const hasCanonicalRound = Boolean(round);
    let matchDate: string | null = null;
    let matchTime: string | null = null;
    let venue: string | null = null;

    metadataSegments.forEach((segment) => {
      const dateMatch = segment.match(/\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/);
      if (dateMatch) {
        matchDate = dateMatch[1];
        const roundCandidate = segment.replace(dateMatch[0], '').replace(/^[\s-]+|[\s-]+$/g, '').trim();
        if (roundCandidate && !round) {
          round = roundCandidate;
        }
        return;
      }

      if (segment && !hasCanonicalRound) {
        round = round ? `${round} ${segment}`.trim() : segment;
      }
    });

    if (!matchDate) {
      const inlineDateMatch = line.match(/\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/);
      matchDate = inlineDateMatch?.[1] || null;
      if (matchDate && !round && segments[0]) {
        const roundCandidate = segments[0].replace(matchDate, '').replace(/^[\s-]+|[\s-]+$/g, '').trim();
        round = roundCandidate || null;
      }
    }

    trailingSegments.forEach((segment) => {
      if (!matchTime) {
        const timeMatch = segment.match(/\b(\d{1,2}:\d{2})\b/);
        if (timeMatch) {
          matchTime = timeMatch[1];
          const venueCandidate = segment.replace(timeMatch[0], '').replace(/^[\s-]+|[\s-]+$/g, '').trim();
          if (venueCandidate) {
            venue = venue ? `${venue} | ${venueCandidate}` : venueCandidate;
          }
          return;
        }
      }

      if (segment) {
        venue = venue ? `${venue} | ${segment}` : segment;
      }
    });

    const teamSegment = teamSegmentIndex >= 0 ? segments[teamSegmentIndex] : line;
    const cleanedTeamSegment = teamSegment
      .replace(/\b(?:round|jornada|fecha|matchday)\s*(?:n[°ºo]\s*)?\d+\b/gi, '')
      .replace(matchDate || '', '')
      .replace(matchTime || '', '')
      .replace(/^[\s-]+|[\s-]+$/g, '')
      .trim();
    const vsMatch = cleanedTeamSegment.match(/(.+?)\s+(?:vs|v)\s+(.+)/i);

    if (vsMatch) {
      return {
        homeTeam: vsMatch[1].trim(),
        awayTeam: vsMatch[2].trim(),
        matchDate,
        matchTime,
        venue,
        round,
        status: 'scheduled',
      };
    }

    const fallbackSegments = cleanedTeamSegment.split(/\s+-\s+/).map((item) => item.trim()).filter(Boolean);
    return {
      homeTeam: fallbackSegments[0] || null,
      awayTeam: fallbackSegments[1] || null,
      matchDate,
      matchTime,
      venue: venue || fallbackSegments.slice(2).join(' | ') || null,
      round,
      status: 'scheduled',
    };
  }

  private static detectSourceType(extension: string | null, mimeType: string | null): FixtureImportSourceType {
    if (extension === '.xlsx' || extension === '.xls') return 'excel';
    if (extension === '.csv') return 'csv';
    if (extension === '.pdf') return mimeType === 'application/pdf' ? 'pdf_text' : 'pdf_scanned';
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension || '')) return 'image';
    return 'unknown';
  }

  private static normalizeDate(value: unknown): string | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && Number.isFinite(value)) {
      const parsed = XLSX.SSF.parse_date_code(value);
      return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}` : null;
    }
    const raw = this.readString(value);
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const latin = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
    if (latin) {
      const year = latin[3] ? Number(latin[3].length === 2 ? `20${latin[3]}` : latin[3]) : new Date().getFullYear();
      return `${year}-${String(Number(latin[2])).padStart(2, '0')}-${String(Number(latin[1])).padStart(2, '0')}`;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }

  private static normalizeTime(value: unknown): string | null {
    const raw = this.readString(value);
    const match = raw?.match(/^(\d{1,2}):(\d{2})/);
    return match ? `${String(Number(match[1])).padStart(2, '0')}:${match[2]}` : null;
  }

  private static parseScore(value: string): { home: number; away: number } | null {
    const match = value.match(/(\d+)\s*[-:]\s*(\d+)/);
    return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
  }

  private static readString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const stringValue = String(value).trim();
    return stringValue || null;
  }

  private static toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private static matchEntity(value: string, entries: MatchableEntry[]): FixtureImportCandidate | null {
    const normalized = this.normalizeKey(value);
    if (!normalized) return null;
    const ranked = entries
      .map((entry) => {
        const exact = entry.normalized === normalized;
        const aliasExact = entry.aliases.includes(normalized);
        const score = exact || aliasExact ? 1 : Math.max(this.similarity(normalized, entry.normalized), ...entry.aliases.map((alias) => this.similarity(normalized, alias)), 0);
        return {
          entry,
          score,
          matchType: exact ? 'exact_match' : aliasExact ? 'alias_match' : score >= 0.9 ? 'normalized_string_match' : score >= 0.75 ? 'fuzzy_match' : 'manual_resolution',
        };
      })
      .filter((item) => item.score >= 0.75)
      .sort((left, right) => right.score - left.score);

    if (!ranked.length) return null;
    const best = ranked[0];
    return this.toCandidate(
      best.entry,
      best.matchType as FixtureImportCandidate['matchType'],
      best.score >= 0.95 ? 'alta' : best.score >= 0.85 ? 'media' : 'baja'
    );
  }

  private static toCandidate(entry: MatchableEntry, matchType: FixtureImportCandidate['matchType'], confidence: FixtureImportConfidence): FixtureImportCandidate {
    return {
      id: entry.id,
      label: entry.label,
      normalizedLabel: entry.normalized,
      confidence,
      matchType,
      aliases: entry.aliases,
    };
  }

  private static similarity(left: string, right: string): number {
    if (left === right) return 1;
    if (!left || !right) return 0;
    const pairs = (value: string) => Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2));
    const leftPairs = pairs(left);
    const rightPairs = pairs(right);
    const bag = new Map<string, number>();
    rightPairs.forEach((pair) => bag.set(pair, (bag.get(pair) || 0) + 1));
    let overlap = 0;
    leftPairs.forEach((pair) => {
      const count = bag.get(pair) || 0;
      if (count > 0) {
        overlap += 1;
        bag.set(pair, count - 1);
      }
    });
    return (2 * overlap) / (leftPairs.length + rightPairs.length);
  }

  private static findDuplicate(existingMatches: any[], homeClubId: string, awayClubId: string, matchDate: string | null, roundId: string | null, groupId: string | null): string | null {
    const duplicate = existingMatches.find((match) => {
      const storedDate = match.date_time ? String(match.date_time).slice(0, 10) : null;
      return (
        match.home_club_id === homeClubId &&
        match.away_club_id === awayClubId &&
        storedDate === matchDate &&
        (!roundId || match.round_uuid === roundId) &&
        (!groupId || match.group_id === groupId)
      );
    });
    return duplicate?.id || null;
  }

  private static rowStatus(issues: FixtureImportIssue[], duplicate: boolean): FixtureImportRowStatus {
    if (issues.some((issue) => issue.severity === 'error')) return 'error';
    if (duplicate) return 'duplicate';
    if (issues.some((issue) => issue.severity === 'warning')) return 'warning';
    return 'valid';
  }

  private static normalizeKey(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private static normalizeStatus(status: string | null, scoreHome: number | null, scoreAway: number | null): string {
    const normalized = this.normalizeKey(status || '');
    if (normalized === 'live' || normalized === 'en vivo') return 'live';
    if (normalized === 'cancelled' || normalized === 'cancelado') return 'cancelled';
    if (normalized === 'postponed' || normalized === 'postergado') return 'postponed';
    if (normalized === 'suspended' || normalized === 'suspendido') return 'suspended';
    if (normalized === 'final' || normalized === 'finalizado' || scoreHome !== null || scoreAway !== null) return 'final';
    return 'scheduled';
  }

  private static combineDateTime(date: string | null, time: string | null): string | null {
    if (!date) return null;
    return combineLocalDateTimeToUtcIso(date, time || '00:00', APP_TIMEZONE);
  }

  private static buildStoredPreviewPayload(row: FixtureImportPreviewRow, confidence: FixtureImportConfidence) {
    return {
      raw: row.raw,
      normalized: row.normalized,
      matched: row.matched,
      issues: row.issues,
      sourceLabel: row.sourceLabel,
      duplicateAction: row.duplicateAction,
      action: row.action,
      confidence: row.matched.homeClub?.confidence || row.matched.awayClub?.confidence || confidence,
    };
  }

  private static extractNumericRoundLabel(value: string): string | null {
    const normalized = this.normalizeKey(value);
    const match = normalized.match(/\b(?:round|jornada|fecha|matchday)\s*(?:n|no|numero)?\s*(\d+)\b/);
    return match ? `Fecha ${match[1]}` : null;
  }

  private static buildRoundAliases(roundName: string): string[] {
    const aliases = new Set<string>();
    const normalizedName = this.normalizeKey(roundName);
    const strippedName = this.normalizeKey(roundName.replace(/^(?:fecha|jornada|round|matchday)\s*/i, '').trim());
    const numericRound = this.extractNumericRoundLabel(roundName)?.match(/(\d+)/)?.[1] || strippedName.match(/^\d+$/)?.[0] || null;

    if (strippedName && strippedName !== normalizedName) aliases.add(strippedName);
    if (numericRound) {
      aliases.add(numericRound);
      aliases.add(`fecha ${numericRound}`);
      aliases.add(`jornada ${numericRound}`);
      aliases.add(`round ${numericRound}`);
      aliases.add(`matchday ${numericRound}`);
    }

    return Array.from(aliases);
  }

  private static issue(
    severity: FixtureImportIssue['severity'],
    code: string,
    message: string,
    field?: FixtureImportIssue['field']
  ): FixtureImportIssue {
    return { severity, code, message, field };
  }

  private static async markPreview(supabase: any, previewId: string, approvalStatus: string, matchId: string | null) {
    if (this.updateCachedPreview(previewId, approvalStatus, matchId)) {
      return;
    }

    const primaryUpdate = await supabase.from('import_match_previews').update({ approval_status: approvalStatus, inserted_match_id: matchId }).eq('id', previewId);
    if (!primaryUpdate.error) {
      return;
    }

    if (!this.isCompatRetryableError(primaryUpdate.error)) {
      throw primaryUpdate.error;
    }

    const fallbackUpdate = await supabase
      .from('import_match_previews')
      .update({ validation_status: this.toLegacyApprovalStatus(approvalStatus) })
      .eq('id', previewId);

    if (fallbackUpdate.error) {
      if (this.isCompatRetryableError(fallbackUpdate.error)) {
        return;
      }
      throw fallbackUpdate.error;
    }
  }

  // M11: only trust exact/alias resolutions (score >= 0.95 maps to confidence
  // 'alta'). Persisting an alias learned from a fuzzy match would poison the
  // alias table and silently re-route future imports to the wrong entity.
  private static isTrustedAliasSource(candidate: any): boolean {
    if (!candidate?.id) return false;
    return candidate.matchType === 'exact_match'
      || candidate.matchType === 'alias_match'
      || candidate.confidence === 'alta';
  }

  private static async learnAliases(supabase: any, tournamentId: string, normalized: Record<string, unknown>, matched: any, context: TournamentContext) {
    if (normalized.homeTeam && this.isTrustedAliasSource(matched.homeClub)) {
      await this.safeUpsert(
        supabase,
        'club_aliases',
        { club_id: matched.homeClub.id, alias: this.normalizeKey(String(normalized.homeTeam)) },
        'club_id,alias'
      );
    }
    if (normalized.awayTeam && this.isTrustedAliasSource(matched.awayClub)) {
      await this.safeUpsert(
        supabase,
        'club_aliases',
        { club_id: matched.awayClub.id, alias: this.normalizeKey(String(normalized.awayTeam)) },
        'club_id,alias'
      );
    }
    if (normalized.competitionName && this.normalizeKey(String(normalized.competitionName)) !== this.normalizeKey(context.tournament.display_name || context.tournament.name)) {
      await this.safeUpsert(supabase, 'competition_aliases', { tournament_id: tournamentId, alias: this.normalizeKey(String(normalized.competitionName)) }, 'tournament_id,alias');
    }
    if (normalized.venue && matched.venue?.label && this.isTrustedAliasSource(matched.venue)) {
      await this.safeUpsert(supabase, 'venue_aliases', {
        tournament_id: tournamentId,
        canonical_name: matched.venue.label,
        alias: this.normalizeKey(String(normalized.venue)),
      }, 'tournament_id,alias');
    }
  }

  private static async safeUpsert(supabase: any, table: string, payload: Record<string, unknown>, onConflict: string) {
    try {
      const { error } = await supabase.from(table).upsert(payload, { onConflict, ignoreDuplicates: true });
      if (error && !isMissingRelationError(error)) {
        throw error;
      }
    } catch (error) {
      if (!isMissingRelationError(error)) {
        throw error;
      }
    }
  }

  private static async safeSelect(supabase: any, table: string, selectClause: string, mutate?: (query: any) => any) {
    try {
      let query = supabase.from(table).select(selectClause);
      if (mutate) query = mutate(query);
      const result = await query;
      if (result.error && !this.isMissingRelation(result.error)) return { data: [], error: result.error };
      return { data: result.data || [], error: null };
    } catch (error) {
      return { data: [], error: this.isMissingRelation(error) ? null : error };
    }
  }

  private static isMissingRelation(error: unknown): boolean {
    return isMissingRelationError(error);
  }

  private static isCompatRetryableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const code = 'code' in error ? String((error as { code?: string }).code || '') : '';
    const message = 'message' in error ? String((error as { message?: string }).message || '') : '';

    return code === '42703' || code === '23514' || isMissingRelationError(error) || message.includes('column');
  }

  private static toLegacyValidationStatus(status: FixtureImportRowStatus): 'pending' | 'valid' | 'warning' | 'invalid' {
    if (status === 'valid' || status === 'approved') return 'valid';
    if (status === 'warning' || status === 'duplicate') return 'warning';
    return 'invalid';
  }

  private static toLegacyApprovalStatus(approvalStatus: string): 'pending' | 'valid' | 'warning' | 'invalid' {
    if (['updated', 'imported'].includes(approvalStatus)) return 'valid';
    if (['manual_review', 'skipped_duplicate', 'omitted'].includes(approvalStatus)) return 'warning';
    if (['rejected'].includes(approvalStatus)) return 'invalid';
    return 'pending';
  }

  private static restorePreviewFromModernRow(row: any) {
    const extracted = this.asRecord(row?.extracted_payload);
    const rawPayload = this.asRecord(row?.raw_payload);
    const normalizedPayload = this.asRecord(row?.normalized_payload);
    const storedNormalized = this.asRecord(extracted.normalized);
    const matched = this.asRecord(extracted.matched);
    const duplicateAction = typeof extracted.duplicateAction === 'string' ? extracted.duplicateAction : 'skip_row';
    const action = typeof extracted.action === 'string'
      ? extracted.action
      : row?.validation_status === 'error'
        ? 'omit'
        : 'approve';
    const normalized = Object.keys(storedNormalized).length
      ? storedNormalized
      : (Object.keys(normalizedPayload).length ? normalizedPayload : extracted);

    return {
      id: String(row?.id || randomUUID()),
      preview_payload: {
        raw: Object.keys(rawPayload).length ? rawPayload : this.asRecord(extracted.raw),
        normalized,
        matched: {
          homeClub: matched.homeClub || null,
          awayClub: matched.awayClub || null,
          round: matched.round || null,
          group: matched.group || null,
          venue: matched.venue || null,
          competition: matched.competition || null,
          duplicateMatchId: matched.duplicateMatchId || null,
        },
        issues: Array.isArray(extracted.issues)
          ? extracted.issues
          : Array.isArray(row?.issues)
            ? row.issues
            : [],
        sourceLabel: typeof extracted.sourceLabel === 'string' ? extracted.sourceLabel : String(row?.source_label || row?.id || 'Fila importada'),
        duplicateAction,
        action,
      },
      duplicate_action: duplicateAction,
      duplicate_match_id: matched.duplicateMatchId || null,
      row_index: row?.row_index || null,
    };
  }

  private static restorePreviewFromLegacyRow(previewId: string, rowIndex: number | null, payload: any) {
    const record = this.asRecord(payload);
    const matched = this.asRecord(record.matched);
    const duplicateAction = typeof record.duplicateAction === 'string' ? record.duplicateAction : 'skip_row';
    const action = typeof record.action === 'string' ? record.action : 'approve';

    return {
      id: previewId,
      preview_payload: {
        raw: this.asRecord(record.raw),
        normalized: this.asRecord(record.normalized),
        matched: {
          homeClub: matched.homeClub || null,
          awayClub: matched.awayClub || null,
          round: matched.round || null,
          group: matched.group || null,
          venue: matched.venue || null,
          competition: matched.competition || null,
          duplicateMatchId: matched.duplicateMatchId || null,
        },
        issues: Array.isArray(record.issues) ? record.issues : [],
        sourceLabel: typeof record.sourceLabel === 'string' ? record.sourceLabel : previewId,
        duplicateAction,
        action,
      },
      duplicate_action: duplicateAction,
      duplicate_match_id: matched.duplicateMatchId || null,
      row_index: rowIndex,
    };
  }

  private static asRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private static createEphemeralJobId() {
    return `mem-fixture-${randomUUID()}`;
  }

  private static isEphemeralJobId(jobId: string | null | undefined) {
    return typeof jobId === 'string' && jobId.startsWith('mem-fixture-');
  }

  private static cachePreviewRows(jobId: string, rows: FixtureImportPreviewRow[]) {
    this.cleanupPreviewCache();
    importPreviewCache.set(jobId, {
      createdAt: Date.now(),
      previews: rows.map((row) => ({
        id: row.previewId,
        preview_payload: {
          raw: row.raw,
          normalized: row.normalized,
          matched: row.matched,
          issues: row.issues,
          sourceLabel: row.sourceLabel,
          duplicateAction: row.duplicateAction,
          action: row.action,
        },
        duplicate_action: row.duplicateAction,
        duplicate_match_id: row.matched.duplicateMatchId,
        approval_status: row.action === 'approve' ? 'pending' : 'omitted',
        inserted_match_id: null,
      })),
    });
  }

  private static getCachedPreviews(jobId: string) {
    this.cleanupPreviewCache();
    return importPreviewCache.get(jobId)?.previews || null;
  }

  private static updateCachedPreview(previewId: string, approvalStatus: string, matchId: string | null) {
    this.cleanupPreviewCache();

    for (const cached of importPreviewCache.values()) {
      const preview = cached.previews.find((item) => item.id === previewId);
      if (!preview) {
        continue;
      }

      preview.approval_status = approvalStatus;
      preview.inserted_match_id = matchId;
      return true;
    }

    return false;
  }

  private static cleanupPreviewCache() {
    const now = Date.now();
    for (const [jobId, cached] of importPreviewCache.entries()) {
      if (now - cached.createdAt > IMPORT_PREVIEW_CACHE_TTL_MS) {
        importPreviewCache.delete(jobId);
      }
    }
  }
}
