'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Plus,
  Check,
  Link2,
  Rocket,
} from 'lucide-react';
import PlayoffBracketBoard, { type PlayoffBracketBoardData } from './PlayoffBracketBoard';
import { buildBracketTemplate, resolveCupName } from '@/lib/playoff/templates';
import styles from './PlayoffBuilderPanel.module.css';

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
  /** Abrir desplegado (una fase automática que todavía no generó su cuadro). */
  defaultOpen?: boolean;
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

/** Quiénes entran al cuadro: de dónde salen los sembrados de la primera ronda. */
type ParticipantsMode = 'seed' | 'random' | 'zones';

/**
 * Paneles que el gestor dejó abiertos, por fase. Vive fuera del componente
 * porque la lista de fases se desmonta entera mientras recarga: después de
 * generar o sincronizar, el panel volvía plegado y con el aviso perdido.
 */
const OPEN_PANELS = new Set<string>();
const LAST_NOTICE = new Map<string, string>();

export default function PlayoffBuilderPanel({
  tournamentId,
  phaseId,
  phaseName,
  settings,
  defaultOpen = false,
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
  const savedSeeding = settings?.playoffSeeding as
    | { sourcePhaseId?: string; format?: 'overall' | 'zone_rank'; locked?: boolean }
    | undefined;

  const [open, setOpenState] = useState(defaultOpen || OPEN_PANELS.has(phaseId));
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) =>
    setOpenState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (value) OPEN_PANELS.add(phaseId);
      else OPEN_PANELS.delete(phaseId);
      return value;
    });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNoticeState] = useState<string | null>(() => LAST_NOTICE.get(phaseId) ?? null);
  const setNotice = (value: string | null) => {
    if (value) LAST_NOTICE.set(phaseId, value);
    else LAST_NOTICE.delete(phaseId);
    setNoticeState(value);
  };
  const [confirmForce, setConfirmForce] = useState<null | 'generate' | 'clear'>(null);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [board, setBoard] = useState<PlayoffBracketBoardData>({ hasBracket: false, cups: [] });

  const [templateId, setTemplateId] = useState<TemplateId>(saved?.templateId ?? 'single_elimination');
  const [teamCount, setTeamCount] = useState<number>(saved?.teamCount ?? 8);
  const [thirdPlace, setThirdPlace] = useState<boolean>(saved?.thirdPlace ?? true);
  const [cupNames, setCupNames] = useState<Record<string, string>>(saved?.cupNames ?? {});

  // ── Quiénes juegan ────────────────────────────────────────────────────
  // Antes eran dos bloques separados: "cruces por seed / aleatorios" acá y
  // "clasificación desde zonas" arriba, con su propio botón de guardar. Si
  // el gestor elegía la zona y generaba sin guardar, el cuadro salía sembrado
  // por la lista de participantes sin avisar. Ahora es una sola pregunta y
  // viaja con el generate.
  type SeedingCfg = { sourcePhaseId: string; format: 'overall' | 'zone_rank'; locked: boolean };
  const [participants, setParticipants] = useState<ParticipantsMode>(
    savedSeeding?.sourcePhaseId ? 'zones' : saved?.seedMode === 'random' ? 'random' : 'seed',
  );
  const [sourcePhases, setSourcePhases] = useState<{ id: string; name: string }[]>([]);
  const [seeding, setSeeding] = useState<SeedingCfg | null>(null);
  const [seedSourceId, setSeedSourceId] = useState<string>(savedSeeding?.sourcePhaseId ?? '');
  const [seedFormat, setSeedFormat] = useState<'overall' | 'zone_rank'>(
    savedSeeding?.format === 'zone_rank' ? 'zone_rank' : 'overall',
  );

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

  const seedMode: 'seed' | 'random' = participants === 'random' ? 'random' : 'seed';

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
        .map((c) => resolveCupName(tpl, c.key, cupNames));
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
        rounds: tpl.rounds.length,
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

  const applySeeding = useCallback((next: SeedingCfg | null) => {
    setSeeding(next);
    if (next) {
      setSeedSourceId(next.sourcePhaseId);
      setSeedFormat(next.format);
      setParticipants('zones');
    }
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/playoff?phaseId=${phaseId}`);
      const json = await res.json();
      if (json.templates) setTemplates(json.templates);
      if (json.board) setBoard(json.board);
      if (Array.isArray(json.sourcePhases)) setSourcePhases(json.sourcePhases);
      if ('seeding' in json) applySeeding(json.seeding ?? null);
    } catch {
      /* non-fatal: panel still usable to (re)generate */
    } finally {
      setLoaded(true);
    }
  }, [tournamentId, phaseId, applySeeding]);

  useEffect(() => {
    if (open && !loaded) fetchState();
  }, [open, loaded, fetchState]);

  const cupFields = templateId === 'custom' ? [] : CUP_KEYS[templateId];
  const teamCountOptions =
    templates.find((t) => t.id === templateId)?.teamCounts ?? [2, 4, 8, 16, 32, 64];
  const teamCountLocked = templateId === 'oro_plata_bronce_estimulo';

  async function runAction(
    action: 'generate' | 'regenerate' | 'clear' | 'reschedule' | 'syncAdvancement',
    force = false,
  ) {
    if ((action === 'generate' || action === 'regenerate') && participants === 'zones' && !seedSourceId) {
      setError('Elegí de qué fase de grupos salen los clasificados.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
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
          seeding:
            participants === 'zones'
              ? { sourcePhaseId: seedSourceId, format: seedFormat }
              : null,
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
      if ('seeding' in json) applySeeding(json.seeding ?? null);
      if (action === 'syncAdvancement') {
        const synced = Number(json.synced ?? 0);
        const warn = Array.isArray(json.warnings) && json.warnings.length > 0
          ? ` ${json.warnings[0]}`
          : '';
        setNotice(
          synced === 0
            ? `Las llaves ya estaban al día.${warn}`
            : `Se actualizaron ${synced} llave${synced === 1 ? '' : 's'}.${warn}`,
        );
      }
      if (action === 'clear') setNotice('Cuadro borrado.');
      // La lista de fases sólo cambia cuando cambia el cuadro en sí (modo,
      // plantilla): sincronizar o reprogramar no la toca, y recargarla
      // desmonta este panel.
      if (action === 'generate' || action === 'regenerate' || action === 'clear') onChanged();
    } catch (e: any) {
      setError(e?.message || 'Error de red.');
    } finally {
      setBusy(false);
    }
  }

  async function seedingPost(payload: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
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
      if ('seeding' in json) applySeeding(json.seeding ?? null);
      if (json.board) setBoard(json.board);
      if (payload.action === 'reseed') {
        const n = Number(json.reseeded ?? 0);
        setNotice(n === 0 ? 'Los cruces ya reflejaban la tabla.' : `Se recalcularon ${n} cruce${n === 1 ? '' : 's'}.`);
      }
      if (payload.action === 'closeZones') setNotice('Fase de zonas cerrada: el cuadro queda congelado.');
      if (payload.action === 'reopenZones') setNotice('Fase de zonas reabierta: los cruces vuelven a seguir la tabla.');
    } catch (e: any) {
      setError(e?.message || 'Error de red.');
    } finally {
      setBusy(false);
    }
  }

  const cupsCount = templateId === 'custom' ? customCups.length : cupFields.length || 1;
  const zonesAvailable = sourcePhases.length > 0;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${styles.header} ${open ? styles.headerOpen : ''}`}
        aria-expanded={open}
      >
        <span className={styles.titleGroup}>
          <span className={styles.titleText}>
            <span className={styles.title}>Cuadro de llaves</span>
            <span className={styles.sub}>{phaseName} · automático</span>
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
          <div className={styles.builderCard}>
            <p className={styles.introText}>
              Tres decisiones: el formato del cuadro, quiénes entran y cuándo se juega. Al
              generar, cada resultado que cierres empuja solo al ganador (y al perdedor, si hay
              copa de consuelo) a la llave siguiente.
            </p>

            <div className={styles.steps}>
              {/* Paso 1 — Formato */}
              <StepBlock n={1} title="Formato" hint="Cuántas copas y cuántos equipos.">
                <div className={styles.cardGrid}>
                  {(templates.length
                    ? templates
                    : ([
                        { id: 'single_elimination', label: 'Eliminación simple', description: 'Una sola copa. El que pierde queda afuera.', teamCounts: [2, 4, 8, 16, 32, 64], defaultTeamCount: 8, available: true },
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

                {templateId !== 'custom' ? (
                  <div className={styles.configRow} style={{ marginTop: 20 }}>
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
                            aria-label="Cantidad de equipos del cuadro"
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
                          Partido por el tercer puesto
                        </label>
                      </div>
                    </div>
                    {cupFields.length > 1 && (
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
                  <div className={styles.customBox} style={{ marginTop: 20 }}>
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

              {/* Paso 2 — Quiénes juegan */}
              <StepBlock n={2} title="Quiénes juegan" hint="De dónde salen los cruces de la primera ronda.">
                <div className={styles.cardGrid}>
                  <OptionCard
                    selected={participants === 'seed'}
                    disabled={seeding?.locked}
                    title="Por seed"
                    desc="El orden de la lista de participantes: 1 vs último, 2 vs anteúltimo…"
                    onClick={() => setParticipants('seed')}
                  />
                  <OptionCard
                    selected={participants === 'random'}
                    disabled={seeding?.locked}
                    title="Sorteo"
                    desc="Cruces al azar. Se vuelve a sortear al regenerar."
                    onClick={() => setParticipants('random')}
                  />
                  <OptionCard
                    selected={participants === 'zones'}
                    disabled={!zonesAvailable || seeding?.locked}
                    title="Desde una fase de grupos"
                    desc={
                      zonesAvailable
                        ? 'Los clasificados salen de la tabla de las zonas y se actualizan solos hasta que cierres la fase.'
                        : 'Este torneo no tiene fases de grupos.'
                    }
                    onClick={() => setParticipants('zones')}
                  />
                </div>

                {participants === 'zones' && zonesAvailable && (
                  <div className={styles.customRow} style={{ flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
                    <select
                      className={styles.miniSelect}
                      value={seedSourceId}
                      disabled={busy || seeding?.locked}
                      onChange={(e) => setSeedSourceId(e.target.value)}
                      aria-label="Fase de grupos de origen"
                    >
                      <option value="">— Elegí la fase de grupos —</option>
                      {sourcePhases.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <select
                      className={styles.miniSelect}
                      value={seedFormat}
                      disabled={busy || seeding?.locked || !seedSourceId}
                      onChange={(e) => setSeedFormat(e.target.value as 'overall' | 'zone_rank')}
                      aria-label="Cómo se ordenan los clasificados"
                    >
                      <option value="overall">Tabla general (puesto 1 al N)</option>
                      <option value="zone_rank">Cruce entre zonas (1.º A vs 2.º B…)</option>
                    </select>
                    {seeding?.locked && (
                      <span className={styles.summaryItem} style={{ color: 'var(--status-active)' }}>
                        Zonas cerradas · cuadro congelado
                      </span>
                    )}
                  </div>
                )}
              </StepBlock>

              {/* Paso 3 — Horarios */}
              <StepBlock n={3} title="Horarios" hint="Opcional. Sin fecha, los partidos quedan a programar desde Fixture.">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div className={styles.cardGrid}>
                    <OptionCard
                      selected={schedMode === 'manual'}
                      title="Los cargo yo"
                      desc="Fecha, hora y cancha de cada partido desde Fixture."
                      onClick={() => setSchedMode('manual')}
                    />
                    <OptionCard
                      selected={schedMode === 'auto'}
                      title="Automáticos"
                      desc="Todas las rondas con fecha y cancha asignadas."
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
                        Los partidos editados a mano no se pisan al reprogramar la fase.
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

            {/* Resumen de lo que se genera */}
            <div className={styles.previewLine} style={{ marginTop: 40 }}>
              {preview.ok ? (
                <>
                  <span>
                    <strong>{preview.total}</strong> partidos · <strong>{preview.rounds}</strong>{' '}
                    ronda{preview.rounds === 1 ? '' : 's'} · <strong>{cupsCount}</strong>{' '}
                    {cupsCount === 1 ? 'copa' : 'copas'}
                    {preview.cups.length > 1 ? ` (${preview.cups.join(', ')})` : ''}
                  </span>
                  <span className={styles.previewPairs}>
                    {preview.stage}:{' '}
                    {preview.random
                      ? 'cruces sorteados al generar'
                      : participants === 'zones'
                        ? 'según la tabla de la fase de grupos'
                        : preview.pairs.slice(0, 4).join(' · ') +
                          (preview.pairs.length > 4 ? ` · +${preview.pairs.length - 4}` : '')}
                  </span>
                </>
              ) : (
                <span className={styles.previewError}>{preview.error}</span>
              )}
            </div>

            {error && (
              <div className={styles.errorBanner} style={{ marginTop: 24 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}
            {notice && !error && (
              <div className={styles.noticeBanner} style={{ marginTop: 24 }} role="status">
                <Check size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{notice}</span>
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
                  Sí, regenerar y borrar lo cargado
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
                        {seeding ? (seeding.locked ? ' · zonas cerradas' : ' · sigue la tabla de zonas') : ''}
                      </>
                    ) : (
                      <>
                        <strong>Sin generar</strong> · los partidos aparecen al generar
                      </>
                    )}
                  </span>
                </div>
                <div className={styles.footerActions}>
                  {board.hasBracket && seeding && !seeding.locked && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => seedingPost({ action: 'reseed' })}
                      className={`${styles.secondaryBtn} ${busy ? styles.btnDisabled : ''}`}
                      title="Vuelve a leer la tabla de la fase de grupos y acomoda los cruces que todavía no se jugaron"
                    >
                      Recalcular cruces
                    </button>
                  )}
                  {board.hasBracket && seeding && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        seedingPost({ action: seeding.locked ? 'reopenZones' : 'closeZones' })
                      }
                      className={`${styles.secondaryBtn} ${busy ? styles.btnDisabled : ''}`}
                    >
                      {seeding.locked ? 'Reabrir zonas' : 'Cerrar zonas'}
                    </button>
                  )}
                  {board.hasBracket && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runAction('syncAdvancement')}
                      className={`${styles.secondaryBtn} ${busy ? styles.btnDisabled : ''}`}
                      title="Vuelve a empujar ganadores y perdedores de todos los partidos terminados. Para resultados que entraron por fuera del gestor."
                    >
                      <Link2 size={14} />
                      Sincronizar llaves
                    </button>
                  )}
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
