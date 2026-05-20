'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Plus,
  Check,
  Rocket,
} from 'lucide-react';
import PlayoffBracketBoard, { type PlayoffBracketBoardData } from './PlayoffBracketBoard';
import { buildBracketTemplate, resolveCupName } from '@/lib/playoff/templates';
import styles from './PlayoffBuilderPanel.module.css';

const CUP_DOT: Record<number, string> = {
  0: '#f5c542',
  1: '#c0c5ce',
  2: '#c8803c',
  3: '#7fb3d5',
};

type TemplateId = 'single_elimination' | 'oro_plata' | 'oro_plata_bronce_estimulo' | 'custom';

interface TemplateMeta {
  id: TemplateId;
  label: string;
  description: string;
  teamCounts: number[];
  defaultTeamCount: number;
  available: boolean;
}

interface Props {
  tournamentId: string;
  phaseId: string;
  phaseName: string;
  settings: any;
  onChanged: () => void;
}

type Slot = { type: 'seed' | 'winner' | 'loser'; ref: number | string };
interface CMatch {
  code: string;
  home: Slot;
  away: Slot;
}
interface CRound {
  key: string;
  cupKey: string | null;
  name: string;
  matches: CMatch[];
}
interface CCup {
  key: string;
  name: string;
}
interface CustomSpec {
  cups: CCup[];
  rounds: CRound[];
}

// Mirrors the default cup names/keys from lib/playoff/templates.ts.
const CUP_KEYS: Record<Exclude<TemplateId, 'custom'>, Array<{ key: string; label: string }>> = {
  single_elimination: [{ key: 'main', label: 'Copa' }],
  oro_plata: [
    { key: 'oro', label: 'Copa Oro' },
    { key: 'plata', label: 'Copa Plata' },
  ],
  oro_plata_bronce_estimulo: [
    { key: 'oro', label: 'Copa Oro' },
    { key: 'plata', label: 'Copa Plata' },
    { key: 'bronce', label: 'Copa Bronce' },
    { key: 'estimulo', label: 'Copa Estímulo' },
  ],
};

function SlotEditor({
  value,
  sources,
  onChange,
}: {
  value: Slot;
  sources: Array<{ code: string; label: string }>;
  onChange: (s: Slot) => void;
}) {
  return (
    <div className={styles.customRow}>
      <select
        value={value.type}
        onChange={(e) => {
          const type = e.target.value as Slot['type'];
          onChange(
            type === 'seed'
              ? { type, ref: Number(value.ref) || 1 }
              : { type, ref: sources[0]?.code ?? '' },
          );
        }}
        className={styles.miniSelect}
      >
        <option value="seed">Sembrado</option>
        <option value="winner">Ganador de</option>
        <option value="loser">Perdedor de</option>
      </select>
      {value.type === 'seed' ? (
        <input
          type="number"
          min={1}
          value={Number(value.ref) || 1}
          onChange={(e) => onChange({ type: 'seed', ref: Number(e.target.value) || 1 })}
          className={`${styles.miniInput} ${styles.codeInput}`}
        />
      ) : (
        <select
          value={String(value.ref)}
          onChange={(e) => onChange({ type: value.type, ref: e.target.value })}
          className={styles.miniSelect}
        >
          {sources.length === 0 && <option value="">(sin rondas previas)</option>}
          {sources.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** ISO -> value for <input type="datetime-local"> in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A selectable card with a top-right check + animated active border. */
function OptionCard({
  selected,
  disabled,
  title,
  desc,
  onClick,
}: {
  selected: boolean;
  disabled?: boolean;
  title: string;
  desc?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={`${styles.optionCard} ${selected ? styles.active : ''} ${
        disabled ? styles.disabled : ''
      }`}
    >
      <span className={styles.checkIcon} aria-hidden>
        <Check size={11} strokeWidth={3.5} />
      </span>
      <span className={styles.cardText}>
        <span className={styles.cardLabel}>{title}</span>
        {desc && <span className={styles.cardDesc}>{desc}</span>}
      </span>
    </button>
  );
}

const TEMPLATE_SHORT: Record<string, string> = {
  single_elimination: 'Eliminación simple',
  oro_plata: 'Oro / Plata',
  oro_plata_bronce_estimulo: 'Oro / Plata / Bronce / Estímulo',
  custom: 'Personalizada',
};

/** A numbered step on the connector line. */
function StepBlock({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.step}>
      <div className={styles.stepNumber}>{n}</div>
      <div className={styles.stepTitle}>
        <h3>{title}</h3>
        {hint && <span>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function PlayoffBuilderPanel({
  tournamentId,
  phaseId,
  phaseName,
  settings,
  onChanged,
}: Props) {
  const saved = settings?.bracketBuilder as
    | {
        templateId?: TemplateId;
        teamCount?: number;
        cupNames?: Record<string, string>;
        thirdPlace?: boolean;
        seedMode?: 'seed' | 'random';
        customSpec?: CustomSpec;
      }
    | undefined;
  const savedSchedule = settings?.bracketSchedule as
    | {
        mode?: 'manual' | 'auto';
        firstRoundStart?: string | null;
        matchDurationMin?: number;
        breakBetweenMatchesMin?: number;
        daysBetweenRounds?: number;
        venues?: string[];
      }
    | undefined;

  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmForce, setConfirmForce] = useState<null | 'generate' | 'clear'>(null);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [board, setBoard] = useState<PlayoffBracketBoardData>({ hasBracket: false, cups: [] });

  const [templateId, setTemplateId] = useState<TemplateId>(saved?.templateId ?? 'oro_plata_bronce_estimulo');
  const [teamCount, setTeamCount] = useState<number>(saved?.teamCount ?? 16);
  const [thirdPlace, setThirdPlace] = useState<boolean>(saved?.thirdPlace ?? true);
  const [seedMode, setSeedMode] = useState<'seed' | 'random'>(saved?.seedMode ?? 'seed');
  const [cupNames, setCupNames] = useState<Record<string, string>>(saved?.cupNames ?? {});

  // ── Clasificación desde zonas (seeding from group-stage standings) ────
  type SeedingCfg = { sourcePhaseId: string; format: 'overall' | 'zone_rank'; locked: boolean };
  const [sourcePhases, setSourcePhases] = useState<{ id: string; name: string }[]>([]);
  const [seeding, setSeeding] = useState<SeedingCfg | null>(null);
  const [seedSourceId, setSeedSourceId] = useState<string>('');
  const [seedFormat, setSeedFormat] = useState<'overall' | 'zone_rank'>('overall');

  // ── Custom builder state ──────────────────────────────────────────────
  const [customCups, setCustomCups] = useState<CCup[]>(
    saved?.customSpec?.cups ?? [{ key: 'oro', name: 'Copa Oro' }],
  );
  const [customRounds, setCustomRounds] = useState<CRound[]>(
    saved?.customSpec?.rounds ?? [],
  );

  const slugKey = (name: string, fallback: string) => {
    const cleaned = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 24);
    return cleaned || fallback;
  };

  const addCup = () =>
    setCustomCups((prev) => [
      ...prev,
      { key: slugKey(`copa ${prev.length + 1}`, `copa${prev.length + 1}`), name: `Copa ${prev.length + 1}` },
    ]);
  const removeCup = (idx: number) =>
    setCustomCups((prev) => prev.filter((_, i) => i !== idx));
  const updateCupName = (idx: number, name: string) =>
    setCustomCups((prev) => prev.map((c, i) => (i === idx ? { ...c, name } : c)));

  const addRound = () =>
    setCustomRounds((prev) => {
      const n = prev.length + 1;
      return [
        ...prev,
        {
          key: `r${n}`,
          cupKey: null,
          name: `Ronda ${n}`,
          matches: [
            { code: `R${n}-1`, home: { type: 'seed', ref: 1 }, away: { type: 'seed', ref: 2 } },
          ],
        },
      ];
    });
  const removeRound = (idx: number) =>
    setCustomRounds((prev) => prev.filter((_, i) => i !== idx));
  const patchRound = (idx: number, patch: Partial<CRound>) =>
    setCustomRounds((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const addMatch = (rIdx: number) =>
    setCustomRounds((prev) =>
      prev.map((r, i) =>
        i === rIdx
          ? {
              ...r,
              matches: [
                ...r.matches,
                {
                  code: `R${rIdx + 1}-${r.matches.length + 1}`,
                  home: { type: 'seed', ref: 1 },
                  away: { type: 'seed', ref: 2 },
                },
              ],
            }
          : r,
      ),
    );
  const removeMatch = (rIdx: number, mIdx: number) =>
    setCustomRounds((prev) =>
      prev.map((r, i) =>
        i === rIdx ? { ...r, matches: r.matches.filter((_, j) => j !== mIdx) } : r,
      ),
    );
  const patchMatch = (rIdx: number, mIdx: number, patch: Partial<CMatch>) =>
    setCustomRounds((prev) =>
      prev.map((r, i) =>
        i === rIdx
          ? { ...r, matches: r.matches.map((m, j) => (j === mIdx ? { ...m, ...patch } : m)) }
          : r,
      ),
    );

  /** Match codes available as winner/loser sources for round `rIdx`. */
  const earlierMatches = (rIdx: number) =>
    customRounds
      .slice(0, rIdx)
      .flatMap((r) => r.matches.map((m) => ({ code: m.code, label: `${r.name} · ${m.code}` })));

  const buildCustomSpec = (): CustomSpec => ({
    cups: customCups.map((c) => ({ key: c.key, name: c.name })),
    rounds: customRounds.map((r) => ({
      key: r.key,
      cupKey: r.cupKey,
      name: r.name,
      matches: r.matches.map((m) => ({ code: m.code, home: m.home, away: m.away })),
    })),
  });

  // Live preview of what the chosen config will generate (no backend call).
  const preview = useMemo(() => {
    try {
      const tpl = buildBracketTemplate({
        templateId,
        teamCount,
        cupNames,
        thirdPlace,
        seedMode,
        customSpec: templateId === 'custom' ? buildCustomSpec() : undefined,
      });
      const cups = [...tpl.cups]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((c) => ({
          name: resolveCupName(tpl, c.key, cupNames),
          color: CUP_DOT[c.orderIndex] ?? '#8e9aa7',
        }));
      const firstRound = [...tpl.rounds].sort((a, b) => a.orderIndex - b.orderIndex)[0];
      const fm = firstRound
        ? tpl.matches
            .filter((m) => m.roundKey === firstRound.key)
            .sort((a, b) => a.orderInRound - b.orderInRound)
        : [];
      const slot = (s: { type: string; ref: number | string }) =>
        s.type === 'seed' ? `#${s.ref}` : s.type === 'winner' ? `Gan. ${s.ref}` : `Per. ${s.ref}`;
      const pairs = fm.map((m) => `${slot(m.home)} vs ${slot(m.away)}`);
      return {
        ok: true as const,
        cups,
        stage: firstRound?.stageName ?? 'Primera ronda',
        pairs,
        random: seedMode === 'random' && fm.every((m) => m.home.type === 'seed'),
        total: tpl.matches.length,
      };
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Configuración incompleta.' };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, teamCount, cupNames, thirdPlace, seedMode, customCups, customRounds]);

  const [schedMode, setSchedMode] = useState<'manual' | 'auto'>(savedSchedule?.mode ?? 'manual');
  const [firstRoundStart, setFirstRoundStart] = useState<string>(
    savedSchedule?.firstRoundStart ? toLocalInput(savedSchedule.firstRoundStart) : '',
  );
  const [matchDuration, setMatchDuration] = useState<number>(savedSchedule?.matchDurationMin ?? 90);
  const [breakBetween, setBreakBetween] = useState<number>(
    savedSchedule?.breakBetweenMatchesMin ?? 30,
  );
  const [daysBetweenRounds, setDaysBetweenRounds] = useState<number>(
    savedSchedule?.daysBetweenRounds ?? 7,
  );
  const [venuesText, setVenuesText] = useState<string>((savedSchedule?.venues ?? []).join(', '));

  function buildSchedule() {
    return {
      mode: schedMode,
      firstRoundStart:
        schedMode === 'auto' && firstRoundStart ? new Date(firstRoundStart).toISOString() : null,
      matchDurationMin: matchDuration,
      breakBetweenMatchesMin: breakBetween,
      daysBetweenRounds,
      venues: venuesText
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    };
  }

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/playoff?phaseId=${phaseId}`);
      const json = await res.json();
      if (json.templates) setTemplates(json.templates);
      if (json.board) setBoard(json.board);
      if (Array.isArray(json.sourcePhases)) setSourcePhases(json.sourcePhases);
      if ('seeding' in json) {
        setSeeding(json.seeding ?? null);
        if (json.seeding) {
          setSeedSourceId(json.seeding.sourcePhaseId);
          setSeedFormat(json.seeding.format);
        }
      }
    } catch {
      /* non-fatal: panel still usable to (re)generate */
    } finally {
      setLoaded(true);
    }
  }, [tournamentId, phaseId]);

  useEffect(() => {
    if (open && !loaded) fetchState();
  }, [open, loaded, fetchState]);

  const cupFields = templateId === 'custom' ? [] : CUP_KEYS[templateId];
  const teamCountOptions =
    templates.find((t) => t.id === templateId)?.teamCounts ?? [16];
  const teamCountLocked = templateId === 'oro_plata_bronce_estimulo';

  async function runAction(
    action: 'generate' | 'regenerate' | 'clear' | 'reschedule',
    force = false,
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/playoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          phaseId,
          templateId,
          teamCount,
          thirdPlace,
          cupNames,
          seedMode,
          customSpec: templateId === 'custom' ? buildCustomSpec() : undefined,
          schedule: buildSchedule(),
          force,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (json.code === 'has_results' && action !== 'clear') {
          setConfirmForce('generate');
          setError(json.error || 'El cuadro ya tiene resultados cargados.');
          return;
        }
        if (json.code === 'has_results' && action === 'clear') {
          setConfirmForce('clear');
          setError(json.error || 'El cuadro ya tiene resultados cargados.');
          return;
        }
        setError(json.error || 'No se pudo completar la acción.');
        return;
      }
      setConfirmForce(null);
      if (json.board) setBoard(json.board);
      else await fetchState();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Error de red.');
    } finally {
      setBusy(false);
    }
  }

  async function seedingPost(
    payload: Record<string, unknown>,
  ): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/playoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phaseId, ...payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || 'No se pudo actualizar la clasificación.');
        return;
      }
      if ('seeding' in json) {
        setSeeding(json.seeding ?? null);
        if (json.seeding) {
          setSeedSourceId(json.seeding.sourcePhaseId);
          setSeedFormat(json.seeding.format);
        }
      }
      if (json.board) setBoard(json.board);
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Error de red.');
    } finally {
      setBusy(false);
    }
  }

  const cupsCount = templateId === 'custom' ? customCups.length : cupFields.length || 1;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${styles.header} ${open ? styles.headerOpen : ''}`}
      >
        <span className={styles.titleGroup}>
          <span className={styles.titleText}>
            <span className={styles.title}>Constructor de Playoff</span>
            <span className={styles.sub}>{phaseName}</span>
          </span>
        </span>
        <span className={styles.headerRight}>
          <span
            className={`${styles.badge} ${board.hasBracket ? styles.badgeGenerated : ''}`}
          >
            {board.hasBracket ? 'Cuadro generado' : 'Sin generar'}
          </span>
          <ChevronDown
            size={18}
            className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          />
        </span>
      </button>

      {open && (
        <div className={styles.body}>
          {/* Top summary bar */}
          <div className={styles.summaryBar}>
            <div className={styles.summaryItem}>
              <strong>{templateId === 'custom' ? customCups.length : teamCount}</strong>{' '}
              {templateId === 'custom' ? 'COPAS' : 'EQUIPOS'}
            </div>
            <div className={styles.dot} />
            <div className={styles.summaryItem}>PARTIDO ÚNICO</div>
            <div className={styles.dot} />
            <div className={styles.summaryItem}>
              CRUCES: {seedMode === 'random' ? 'ALEATORIOS' : 'POR SEED'}
            </div>
            <div className={styles.dot} />
            <div className={styles.summaryItem}>
              <strong>{cupsCount}</strong> {cupsCount === 1 ? 'COPA' : 'COPAS'}
            </div>
            <div className={styles.dot} />
            <div className={styles.summaryItem}>
              HORARIOS: {schedMode === 'auto' ? 'AUTOMÁTICOS' : 'MANUALES'}
            </div>
            {preview.ok && (
              <>
                <div className={styles.dot} />
                <div className={styles.summaryItem}>
                  <strong>{preview.total}</strong> PARTIDOS DE CUADRO
                </div>
              </>
            )}
          </div>

          {/* Clasificación automática desde zonas */}
          <div className={styles.builderCard}>
            <p className={styles.introText}>
              <strong>Clasificación desde zonas.</strong> Si elegís una fase de grupos como origen,
              el cuadro se siembra automáticamente con la tabla de posiciones de esas zonas. Al
              corregir un resultado de zona, los cruces se recalculan solos hasta que cierres la fase.
            </p>
            {sourcePhases.length === 0 ? (
              <p className={styles.introText} style={{ opacity: 0.7 }}>
                No hay fases de grupos en este torneo. Sembrá el cuadro por seed manual o aleatorio.
              </p>
            ) : (
              <div className={styles.customRow} style={{ flexWrap: 'wrap', gap: 10 }}>
                <select
                  className={styles.miniSelect}
                  value={seedSourceId}
                  disabled={busy || seeding?.locked}
                  onChange={(e) => setSeedSourceId(e.target.value)}
                >
                  <option value="">— Sin clasificación automática —</option>
                  {sourcePhases.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  className={styles.miniSelect}
                  value={seedFormat}
                  disabled={busy || seeding?.locked || !seedSourceId}
                  onChange={(e) => setSeedFormat(e.target.value as 'overall' | 'zone_rank')}
                >
                  <option value="overall">Tabla general (puesto 1..N)</option>
                  <option value="zone_rank">Cruce entre zonas (1.º A vs 2.º B…)</option>
                </select>
                <button
                  type="button"
                  className={`${styles.secondaryBtn} ${busy ? styles.btnDisabled : ''}`}
                  disabled={busy || seeding?.locked}
                  onClick={() =>
                    seedingPost({
                      action: 'setSeeding',
                      sourcePhaseId: seedSourceId,
                      format: seedFormat,
                    })
                  }
                >
                  Guardar clasificación
                </button>
                {seeding && !seeding.locked && (
                  <button
                    type="button"
                    className={`${styles.secondaryBtn} ${busy ? styles.btnDisabled : ''}`}
                    disabled={busy}
                    onClick={() => seedingPost({ action: 'reseed' })}
                  >
                    Recalcular cruces ahora
                  </button>
                )}
                {seeding && (
                  <button
                    type="button"
                    className={`${styles.secondaryBtn} ${seeding.locked ? '' : styles.dangerBtn} ${busy ? styles.btnDisabled : ''}`}
                    disabled={busy}
                    onClick={() =>
                      seedingPost({ action: seeding.locked ? 'reopenZones' : 'closeZones' })
                    }
                  >
                    {seeding.locked ? 'Reabrir fase de zonas' : 'Cerrar fase de zonas'}
                  </button>
                )}
                {seeding?.locked && (
                  <span className={styles.summaryItem} style={{ color: 'var(--status-active)' }}>
                    Zonas cerradas · cuadro congelado
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Main builder card */}
          <div className={styles.builderCard}>
            <p className={styles.introText}>
              Elegí una plantilla y el sistema crea todas las rondas, copas y reglas de avance.
              Al cargar resultados, los equipos avanzan solos a la copa que corresponde.
            </p>

            <div className={styles.steps}>
              {/* Step 1 — template selector */}
              <StepBlock n={1} title="Plantilla" hint="Estructura del cuadro. Podés regenerarla cuando quieras.">
                <div className={styles.cardGrid}>
                  {(templates.length
                    ? templates
                    : ([
                        { id: 'oro_plata_bronce_estimulo', label: 'Oro / Plata / Bronce / Estímulo', description: '16 equipos, 4 copas.', teamCounts: [16], defaultTeamCount: 16, available: true },
                      ] as TemplateMeta[])
                  ).map((t) => (
                    <OptionCard
                      key={t.id}
                      selected={templateId === t.id}
                      disabled={!t.available}
                      title={t.label}
                      desc={t.description}
                      onClick={() => {
                        setTemplateId(t.id);
                        if (t.id === 'oro_plata_bronce_estimulo') setTeamCount(16);
                        else if (t.defaultTeamCount) setTeamCount(t.defaultTeamCount);
                      }}
                    />
                  ))}
                </div>
              </StepBlock>

              {/* Step 2 — crossings */}
              <StepBlock n={2} title="Cruces de la primera ronda" hint="Cómo se arman los enfrentamientos de la ronda inicial.">
                <div className={styles.cardGrid}>
                  <OptionCard
                    selected={seedMode === 'seed'}
                    title="Por seed"
                    desc="1 vs 16, 2 vs 15, 3 vs 14…"
                    onClick={() => setSeedMode('seed')}
                  />
                  <OptionCard
                    selected={seedMode === 'random'}
                    title="Aleatorios"
                    desc="Sorteo al azar (se re-sortea al regenerar)"
                    onClick={() => setSeedMode('random')}
                  />
                </div>
              </StepBlock>

              {/* Step 3 — config or custom builder */}
              <StepBlock n={3} title="Configuración" hint="Equipos, definición de puestos y nombres de las copas.">
                {templateId !== 'custom' ? (
                  <div className={styles.configRow}>
                    <div>
                      <span className={styles.inputGroupLabel}>Equipos</span>
                      <div className={styles.teamsBlock}>
                        {teamCountLocked ? (
                          <span className={styles.chip}>{teamCount} equipos</span>
                        ) : (
                          <select
                            value={teamCount}
                            onChange={(e) => setTeamCount(Number(e.target.value))}
                            className={styles.selectInput}
                            style={{ width: 'auto' }}
                          >
                            {teamCountOptions.map((n) => (
                              <option key={n} value={n}>
                                {n} equipos
                              </option>
                            ))}
                          </select>
                        )}
                        <label className={styles.checkboxWrapper}>
                          <input
                            type="checkbox"
                            className={styles.nativeCheckbox}
                            checked={thirdPlace}
                            onChange={(e) => setThirdPlace(e.target.checked)}
                          />
                          <span className={styles.checkboxCustom} aria-hidden>
                            <Check size={11} strokeWidth={3.5} />
                          </span>
                          Incluir partido por el 3.º y 4.º puesto
                        </label>
                      </div>
                    </div>
                    {cupFields.length > 0 && (
                      <div>
                        <span className={styles.inputGroupLabel}>Nombres de las copas</span>
                        <div className={styles.cupsGrid}>
                          {cupFields.map((cup) => (
                            <label key={cup.key} className={styles.fieldLabel}>
                              {cup.label}
                              <input
                                type="text"
                                value={cupNames[cup.key] ?? ''}
                                placeholder={cup.label}
                                onChange={(e) =>
                                  setCupNames((prev) => ({ ...prev, [cup.key]: e.target.value }))
                                }
                                className={styles.cupInput}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.customBox}>
                    <p className={styles.customNote}>
                      Definí copas, rondas y partidos. En cada slot elegí un sembrado o el
                      ganador/perdedor de un partido de una <strong>ronda anterior</strong>; las
                      reglas de avance se crean solas.
                    </p>

                    {/* Cups */}
                    <div className={styles.customGroup}>
                      <span className={styles.inputGroupLabel}>Copas</span>
                      {customCups.map((c, i) => (
                        <div key={i} className={styles.customRow}>
                          <input
                            value={c.name}
                            onChange={(e) => updateCupName(i, e.target.value)}
                            placeholder={`Copa ${i + 1}`}
                            className={styles.cupInput}
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            onClick={() => removeCup(i)}
                            className={styles.iconBtn}
                            aria-label="Quitar copa"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={addCup} className={styles.addBtn}>
                        <Plus size={13} />
                        Agregar copa
                      </button>
                    </div>

                    {/* Rounds */}
                    <div className={styles.customGroup}>
                      <span className={styles.inputGroupLabel}>Rondas</span>
                      {customRounds.map((r, rIdx) => (
                        <div key={rIdx} className={styles.roundBox}>
                          <div className={styles.customRow}>
                            <input
                              value={r.name}
                              onChange={(e) => patchRound(rIdx, { name: e.target.value })}
                              placeholder="Nombre de la ronda"
                              className={styles.miniInput}
                            />
                            <select
                              value={r.cupKey ?? ''}
                              onChange={(e) => patchRound(rIdx, { cupKey: e.target.value || null })}
                              className={styles.miniSelect}
                            >
                              <option value="">Sin copa (clasificación)</option>
                              {customCups.map((c) => (
                                <option key={c.key} value={c.key}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => removeRound(rIdx)}
                              className={styles.iconBtn}
                              style={{ marginLeft: 'auto' }}
                              aria-label="Quitar ronda"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className={styles.customGroup}>
                            {r.matches.map((m, mIdx) => (
                              <div key={mIdx} className={styles.matchRow}>
                                <input
                                  value={m.code}
                                  onChange={(e) => patchMatch(rIdx, mIdx, { code: e.target.value })}
                                  className={`${styles.miniInput} ${styles.codeInput}`}
                                />
                                <SlotEditor
                                  value={m.home}
                                  sources={earlierMatches(rIdx)}
                                  onChange={(s) => patchMatch(rIdx, mIdx, { home: s })}
                                />
                                <span className={styles.vs}>vs</span>
                                <SlotEditor
                                  value={m.away}
                                  sources={earlierMatches(rIdx)}
                                  onChange={(s) => patchMatch(rIdx, mIdx, { away: s })}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeMatch(rIdx, mIdx)}
                                  className={styles.iconBtn}
                                  aria-label="Quitar partido"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addMatch(rIdx)}
                              className={styles.addBtn}
                            >
                              <Plus size={12} />
                              Agregar partido
                            </button>
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={addRound} className={styles.addBtn}>
                        <Plus size={13} />
                        Agregar ronda
                      </button>
                    </div>
                  </div>
                )}
              </StepBlock>

              {/* Step 4 — scheduling */}
              <StepBlock n={4} title="Programación de horarios" hint="Manual o automática para todas las rondas.">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div className={styles.cardGrid}>
                    <OptionCard
                      selected={schedMode === 'manual'}
                      title="Manual"
                      desc="Cargás vos fecha, hora y cancha"
                      onClick={() => setSchedMode('manual')}
                    />
                    <OptionCard
                      selected={schedMode === 'auto'}
                      title="Automática"
                      desc="Todas las rondas con horario asignado"
                      onClick={() => setSchedMode('auto')}
                    />
                  </div>

                  {schedMode === 'auto' && (
                    <div className={styles.cupsGrid}>
                      <label className={styles.fieldLabel}>
                        Inicio de la primera ronda
                        <input
                          type="datetime-local"
                          value={firstRoundStart}
                          onChange={(e) => setFirstRoundStart(e.target.value)}
                          className={styles.cupInput}
                        />
                      </label>
                      <label className={styles.fieldLabel}>
                        Días entre rondas
                        <input
                          type="number"
                          min={0}
                          value={daysBetweenRounds}
                          onChange={(e) => setDaysBetweenRounds(Number(e.target.value))}
                          className={styles.cupInput}
                        />
                      </label>
                      <label className={styles.fieldLabel}>
                        Duración del partido (min)
                        <input
                          type="number"
                          min={1}
                          value={matchDuration}
                          onChange={(e) => setMatchDuration(Number(e.target.value))}
                          className={styles.cupInput}
                        />
                      </label>
                      <label className={styles.fieldLabel}>
                        Descanso entre partidos (min)
                        <input
                          type="number"
                          min={0}
                          value={breakBetween}
                          onChange={(e) => setBreakBetween(Number(e.target.value))}
                          className={styles.cupInput}
                        />
                      </label>
                      <label
                        className={styles.fieldLabel}
                        style={{ gridColumn: '1 / -1' }}
                      >
                        Canchas / sedes (separadas por coma, opcional)
                        <input
                          type="text"
                          value={venuesText}
                          placeholder="Cancha 1, Cancha 2"
                          onChange={(e) => setVenuesText(e.target.value)}
                          className={styles.cupInput}
                        />
                      </label>
                      <p
                        className={styles.customNote}
                        style={{ gridColumn: '1 / -1' }}
                      >
                        Los partidos editados manualmente no se sobrescriben al reprogramar la fase.
                      </p>
                    </div>
                  )}

                  {board.hasBracket && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runAction('reschedule')}
                      className={`${styles.secondaryBtn} ${busy ? styles.btnDisabled : ''}`}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      <RefreshCw size={13} />
                      Reprogramar fase
                    </button>
                  )}
                </div>
              </StepBlock>
            </div>

            {/* Live preview */}
            <div className={styles.previewPanel} style={{ marginTop: 48 }}>
              <div className={styles.previewHead}>
                <span className={styles.previewTitle}>Vista previa</span>
                <span className={styles.previewSub}>
                  Qué se genera con esta configuración (antes de crear el cuadro).
                </span>
              </div>
              {preview.ok ? (
                <div className={styles.previewBody}>
                  <div className={styles.previewCol}>
                    <span className={styles.previewColLabel}>Copas generadas</span>
                    {preview.cups.length === 0 && (
                      <div className={styles.cupRow}>Una sola copa.</div>
                    )}
                    {preview.cups.map((c) => (
                      <div key={c.name} className={styles.cupRow}>
                        <span
                          className={styles.cupDot}
                          style={{ background: c.color }}
                          aria-hidden
                        />
                        {c.name}
                      </div>
                    ))}
                  </div>
                  <div className={styles.previewCol}>
                    <span className={styles.previewColLabel}>
                      {preview.stage} · primeros cruces
                    </span>
                    {preview.random ? (
                      <p className={styles.cardDesc}>
                        Los enfrentamientos se sortean al azar al generar el cuadro.
                      </p>
                    ) : (
                      <div className={styles.pairList}>
                        {preview.pairs.slice(0, 8).map((p, i) => (
                          <span key={i}>{p}</span>
                        ))}
                        {preview.pairs.length > 8 && (
                          <span className={styles.pairMore}>
                            +{preview.pairs.length - 8} cruces más…
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={styles.previewColNarrow}>
                    <span className={styles.previewColLabel}>Total</span>
                    <p>
                      <span className={styles.totalNum}>{preview.total}</span>
                      <span className={styles.totalLabel}>partidos en el cuadro</span>
                    </p>
                  </div>
                </div>
              ) : (
                <p className={styles.previewError}>{preview.error}</p>
              )}
            </div>

            {error && (
              <div className={styles.errorBanner} style={{ marginTop: 24 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Footer action bar */}
          <div className={styles.footer}>
            {confirmForce === 'generate' ? (
              <div className={styles.confirmRow}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction('regenerate', true)}
                  className={`${styles.generateBtn} ${busy ? styles.btnDisabled : ''}`}
                >
                  Sí, regenerar y borrar resultados
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConfirmForce(null);
                    setError(null);
                  }}
                  className={styles.secondaryBtn}
                >
                  Cancelar
                </button>
              </div>
            ) : confirmForce === 'clear' ? (
              <div className={styles.confirmRow}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction('clear', true)}
                  className={`${styles.secondaryBtn} ${styles.dangerBtn} ${busy ? styles.btnDisabled : ''}`}
                >
                  Sí, borrar el cuadro
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConfirmForce(null);
                    setError(null);
                  }}
                  className={styles.secondaryBtn}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <div className={styles.footerInfo}>
                  <span
                    className={`${styles.footerStatusDot} ${
                      board.hasBracket ? styles.footerStatusDotOn : ''
                    }`}
                    aria-hidden
                  />
                  <span className={styles.footerLabel}>
                    {board.hasBracket ? (
                      <>
                        <strong>Cuadro generado</strong> · {TEMPLATE_SHORT[templateId] ?? templateId}
                      </>
                    ) : (
                      <>
                        <strong>Vista previa del cuadro</strong> · Etapa de diseño
                      </>
                    )}
                  </span>
                </div>
                <div className={styles.footerActions}>
                  {board.hasBracket && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmForce('clear')}
                      className={`${styles.secondaryBtn} ${styles.dangerBtn} ${busy ? styles.btnDisabled : ''}`}
                    >
                      <Trash2 size={14} />
                      Borrar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => runAction(board.hasBracket ? 'regenerate' : 'generate')}
                    className={`${styles.generateBtn} ${busy ? styles.btnDisabled : ''}`}
                  >
                    {board.hasBracket ? (
                      <RefreshCw size={15} />
                    ) : (
                      <span className={styles.rocketIcon} aria-hidden>
                        <Rocket size={18} />
                      </span>
                    )}
                    {busy
                      ? 'Procesando…'
                      : board.hasBracket
                        ? 'Regenerar cuadro'
                        : 'Generar cuadro'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Bracket visual */}
          <div className={styles.boardWrap}>
            <PlayoffBracketBoard data={board} />
          </div>
        </div>
      )}
    </div>
  );
}
