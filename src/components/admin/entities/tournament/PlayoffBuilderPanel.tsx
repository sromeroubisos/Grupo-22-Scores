'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Wand2,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Plus,
  Check,
  Trophy,
  Swords,
  Award,
  SlidersHorizontal,
  ListOrdered,
  Shuffle,
  CalendarClock,
  PencilLine,
} from 'lucide-react';
import PlayoffBracketBoard, { type PlayoffBracketBoardData } from './PlayoffBracketBoard';
import { buildBracketTemplate, resolveCupName } from '@/lib/playoff/templates';

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
    <div className="flex gap-1.5 items-center">
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
        className="bg-[#1b232c] border border-white/15 px-1.5 py-1 text-[11px] text-white"
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
          className="w-14 bg-[#1b232c] border border-white/15 px-1.5 py-1 text-[11px] text-white"
        />
      ) : (
        <select
          value={String(value.ref)}
          onChange={(e) => onChange({ type: value.type, ref: e.target.value })}
          className="bg-[#1b232c] border border-white/15 px-1.5 py-1 text-[11px] text-white max-w-[160px]"
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

/** A selectable card with a clear checked state. */
function OptionCard({
  selected,
  disabled,
  title,
  desc,
  icon,
  onClick,
}: {
  selected: boolean;
  disabled?: boolean;
  title: string;
  desc?: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={`group flex items-start gap-3.5 px-4 py-4 text-left transition-colors duration-150 ${
        selected
          ? 'border border-[#38BDF8] bg-[#13304a]'
          : 'border border-transparent bg-white/[0.03] hover:bg-white/[0.06]'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      {/* Radio indicator — at the left, next to the title */}
      <span
        className={`mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          selected ? 'border-[#38BDF8] bg-[#38BDF8] text-[#06222e]' : 'border-white/35 text-transparent'
        }`}
        aria-hidden
      >
        <Check size={11} strokeWidth={3.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {icon && (
            <span className={selected ? 'text-[#7fd4f8]' : 'text-white/40'} aria-hidden>
              {React.isValidElement(icon)
                ? React.cloneElement(icon as React.ReactElement<{ size?: number }>, { size: 15 })
                : icon}
            </span>
          )}
          <span className="text-[14px] font-bold leading-tight text-white">{title}</span>
        </span>
        {desc && (
          <span className="mt-1.5 block text-[12px] leading-relaxed text-white/55">{desc}</span>
        )}
      </span>
    </button>
  );
}

const TEMPLATE_ICON: Record<string, React.ReactNode> = {
  single_elimination: <Swords size={18} />,
  oro_plata: <Trophy size={18} />,
  oro_plata_bronce_estimulo: <Award size={18} />,
  custom: <SlidersHorizontal size={18} />,
};

const TEMPLATE_SHORT: Record<string, string> = {
  single_elimination: 'Eliminación simple',
  oro_plata: 'Oro / Plata',
  oro_plata_bronce_estimulo: 'Oro / Plata / Bronce / Estímulo',
  custom: 'Personalizada',
};

/** A numbered step block — gives the panel a structured, guided rhythm. */
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
    <section className="border border-white/12 border-l-[3px] border-l-[#38BDF8] bg-[#161d27]">
      <div className="flex items-center gap-3.5 border-b border-white/10 bg-white/[0.03] px-6 py-4">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center bg-[#38BDF8] text-[14px] font-extrabold text-[#06222e]">
          {n}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-bold uppercase tracking-[0.1em] text-white">
            {title}
          </span>
          {hint && <span className="text-[12px] leading-snug text-white/55">{hint}</span>}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </section>
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

  return (
    <div className="overflow-hidden border border-white/12 bg-[#10151c]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 border-b border-white/10 bg-[#131922] px-5 py-4 text-left transition-colors hover:bg-[#1a212c]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center bg-[#38BDF8] text-[#06222e]">
            <Wand2 size={17} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-bold text-white">Constructor de Playoff</span>
            <span className="truncate text-xs text-white/55">{phaseName}</span>
          </span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-3">
          <span
            className={`border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
              board.hasBracket
                ? 'border-[#22C55E]/50 bg-[#22C55E]/15 text-[#4ade80]'
                : 'border-white/25 bg-white/5 text-white/65'
            }`}
          >
            {board.hasBracket ? 'Cuadro generado' : 'Sin generar'}
          </span>
          <ChevronDown
            size={16}
            className={`text-white/55 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-8 bg-[#0e131a] px-7 pb-7 pt-7">
          <p className="border-l-[3px] border-[#38BDF8] bg-[#38BDF8]/[0.10] px-4 py-3.5 text-[13px] leading-relaxed text-white/90">
            Elegí una plantilla y el sistema crea todas las rondas, copas y reglas de avance.
            Al cargar resultados, los equipos avanzan solos a la copa que corresponde.
          </p>

          {/* Template selector */}
          <StepBlock n={1} title="Plantilla" hint="Estructura del cuadro. Podés regenerarla cuando quieras.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  icon={TEMPLATE_ICON[t.id]}
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

          {/* Crossings: by seed or random draw */}
          <StepBlock n={2} title="Cruces de la primera ronda" hint="Cómo se arman los enfrentamientos de la ronda inicial.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <OptionCard
                selected={seedMode === 'seed'}
                icon={<ListOrdered size={18} />}
                title="Por seed"
                desc="1 vs 16, 2 vs 15, 3 vs 14…"
                onClick={() => setSeedMode('seed')}
              />
              <OptionCard
                selected={seedMode === 'random'}
                icon={<Shuffle size={18} />}
                title="Aleatorios"
                desc="Sorteo al azar (se re-sortea al regenerar)"
                onClick={() => setSeedMode('random')}
              />
            </div>
          </StepBlock>

          {/* Config: teams, 3rd place, cup names — not for the custom builder */}
          {templateId !== 'custom' && (
            <StepBlock n={3} title="Configuración" hint="Equipos, definición de puestos y nombres de las copas.">
              <div className="flex flex-col gap-7">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
                <label className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Equipos</span>
                  <select
                    value={teamCount}
                    disabled={teamCountLocked}
                    onChange={(e) => setTeamCount(Number(e.target.value))}
                    className="border border-white/15 bg-[#1b232c] px-3 py-2 text-sm font-medium text-white disabled:opacity-70"
                  >
                    {(teamCountLocked ? [16] : teamCountOptions).map((n) => (
                      <option key={n} value={n}>
                        {n} equipos
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex cursor-pointer items-center gap-2 pb-1.5 text-[13px] text-white/85">
                  <input
                    type="checkbox"
                    checked={thirdPlace}
                    onChange={(e) => setThirdPlace(e.target.checked)}
                    className="h-4 w-4 accent-[#38BDF8]"
                  />
                  Incluir partido por el 3.º y 4.º puesto
                </label>
              </div>
              {cupFields.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                    Nombres de las copas
                  </span>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {cupFields.map((cup) => (
                      <label key={cup.key} className="flex flex-col gap-1.5">
                        <span className="text-[12px] text-white/55">{cup.label}</span>
                        <input
                          type="text"
                          value={cupNames[cup.key] ?? ''}
                          placeholder={cup.label}
                          onChange={(e) =>
                            setCupNames((prev) => ({ ...prev, [cup.key]: e.target.value }))
                          }
                          className="border border-white/15 bg-[#1b232c] px-3 py-2.5 text-sm font-medium text-white placeholder:text-white/40 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </StepBlock>
          )}

          {/* Custom builder */}
          {templateId === 'custom' && (
            <div className="flex flex-col gap-4 border border-white/12 border-l-[3px] border-l-[#38BDF8] bg-[#161d27] p-5">
              <p className="text-[12px] text-white/70">
                Definí copas, rondas y partidos. En cada slot elegí un sembrado o el
                ganador/perdedor de un partido de una <strong>ronda anterior</strong>; las reglas de
                avance se crean solas.
              </p>

              {/* Cups */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">
                  Copas
                </span>
                {customCups.map((c, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      value={c.name}
                      onChange={(e) => updateCupName(i, e.target.value)}
                      placeholder={`Copa ${i + 1}`}
                      className="flex-1 bg-[#1b232c] border border-white/15 px-2 py-1 text-sm text-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeCup(i)}
                      className="text-dim hover:text-red-400 p-1"
                      aria-label="Quitar copa"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addCup}
                  className="self-start text-[11px] text-[var(--accent-primary)] inline-flex items-center gap-1"
                >
                  <Plus size={12} />
                  Agregar copa
                </button>
              </div>

              {/* Rounds */}
              <div className="flex flex-col gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">
                  Rondas
                </span>
                {customRounds.map((r, rIdx) => (
                  <div
                    key={rIdx}
                    className="border border-white/12 p-3 flex flex-col gap-2"
                  >
                    <div className="flex gap-2 items-center flex-wrap">
                      <input
                        value={r.name}
                        onChange={(e) => patchRound(rIdx, { name: e.target.value })}
                        placeholder="Nombre de la ronda"
                        className="bg-[#1b232c] border border-white/15 px-2 py-1 text-sm text-white"
                      />
                      <select
                        value={r.cupKey ?? ''}
                        onChange={(e) => patchRound(rIdx, { cupKey: e.target.value || null })}
                        className="bg-[#1b232c] border border-white/15 px-2 py-1 text-xs text-white"
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
                        className="ml-auto text-dim hover:text-red-400 p-1"
                        aria-label="Quitar ronda"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {r.matches.map((m, mIdx) => (
                        <div
                          key={mIdx}
                          className="flex gap-2 items-center flex-wrap bg-white/[0.04] p-2"
                        >
                          <input
                            value={m.code}
                            onChange={(e) => patchMatch(rIdx, mIdx, { code: e.target.value })}
                            className="w-20 bg-[#1b232c] border border-white/15 px-1.5 py-1 text-[11px] text-white"
                          />
                          <SlotEditor
                            value={m.home}
                            sources={earlierMatches(rIdx)}
                            onChange={(s) => patchMatch(rIdx, mIdx, { home: s })}
                          />
                          <span className="text-[10px] text-dim">vs</span>
                          <SlotEditor
                            value={m.away}
                            sources={earlierMatches(rIdx)}
                            onChange={(s) => patchMatch(rIdx, mIdx, { away: s })}
                          />
                          <button
                            type="button"
                            onClick={() => removeMatch(rIdx, mIdx)}
                            className="text-dim hover:text-red-400 p-1"
                            aria-label="Quitar partido"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addMatch(rIdx)}
                        className="self-start text-[11px] text-[var(--accent-primary)] inline-flex items-center gap-1"
                      >
                        <Plus size={12} />
                        Agregar partido
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addRound}
                  className="self-start text-xs text-[var(--accent-primary)] inline-flex items-center gap-1"
                >
                  <Plus size={13} />
                  Agregar ronda
                </button>
              </div>
            </div>
          )}

          {/* Scheduling */}
          <StepBlock n={4} title="Programación de horarios" hint="Manual o automática para todas las rondas.">
            <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <OptionCard
                selected={schedMode === 'manual'}
                icon={<PencilLine size={18} />}
                title="Manual"
                desc="Cargás vos fecha, hora y cancha"
                onClick={() => setSchedMode('manual')}
              />
              <OptionCard
                selected={schedMode === 'auto'}
                icon={<CalendarClock size={18} />}
                title="Automática"
                desc="Todas las rondas con horario asignado"
                onClick={() => setSchedMode('auto')}
              />
            </div>

            {schedMode === 'auto' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-2 text-[11px] font-medium text-white/65">
                  Inicio de la primera ronda
                  <input
                    type="datetime-local"
                    value={firstRoundStart}
                    onChange={(e) => setFirstRoundStart(e.target.value)}
                    className="border border-white/15 bg-[#1b232c] px-2.5 py-1.5 text-sm font-medium text-white focus:border-[#38BDF8] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-[11px] font-medium text-white/65">
                  Días entre rondas
                  <input
                    type="number"
                    min={0}
                    value={daysBetweenRounds}
                    onChange={(e) => setDaysBetweenRounds(Number(e.target.value))}
                    className="border border-white/15 bg-[#1b232c] px-2.5 py-1.5 text-sm font-medium text-white focus:border-[#38BDF8] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-[11px] font-medium text-white/65">
                  Duración del partido (min)
                  <input
                    type="number"
                    min={1}
                    value={matchDuration}
                    onChange={(e) => setMatchDuration(Number(e.target.value))}
                    className="border border-white/15 bg-[#1b232c] px-2.5 py-1.5 text-sm font-medium text-white focus:border-[#38BDF8] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-[11px] font-medium text-white/65">
                  Descanso entre partidos (min)
                  <input
                    type="number"
                    min={0}
                    value={breakBetween}
                    onChange={(e) => setBreakBetween(Number(e.target.value))}
                    className="border border-white/15 bg-[#1b232c] px-2.5 py-1.5 text-sm font-medium text-white focus:border-[#38BDF8] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-medium text-white/65 sm:col-span-2">
                  Canchas / sedes (separadas por coma, opcional)
                  <input
                    type="text"
                    value={venuesText}
                    placeholder="Cancha 1, Cancha 2"
                    onChange={(e) => setVenuesText(e.target.value)}
                    className="border border-white/15 bg-[#1b232c] px-2.5 py-1.5 text-sm font-medium text-white focus:border-[#38BDF8] focus:outline-none"
                  />
                </label>
                <p className="text-[10.5px] text-white/55 sm:col-span-2">
                  Los partidos editados manualmente no se sobrescriben al reprogramar la fase.
                </p>
              </div>
            )}

            {board.hasBracket && (
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction('reschedule')}
                className="basalt-btn !rounded-none text-xs inline-flex items-center gap-1.5 self-start"
              >
                <RefreshCw size={13} />
                Reprogramar fase
              </button>
            )}
            </div>
          </StepBlock>

          {/* Live preview of what will be generated */}
          <section className="border border-white/12 bg-[#161d27]">
            <div className="border-b border-white/10 bg-white/[0.03] px-6 py-4">
              <span className="block text-[13px] font-bold uppercase tracking-[0.1em] text-white">
                Vista previa
              </span>
              <span className="block text-[12px] leading-snug text-white/55">
                Qué se genera con esta configuración (antes de crear el cuadro).
              </span>
            </div>
            <div className="p-6">
              {preview.ok ? (
                <div className="flex flex-col gap-7 lg:flex-row lg:gap-10">
                  <div className="flex-1">
                    <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-wide text-white/55">
                      Copas generadas
                    </span>
                    <ul className="flex flex-col gap-2">
                      {preview.cups.length === 0 && (
                        <li className="text-[13px] text-white/55">Una sola copa.</li>
                      )}
                      {preview.cups.map((c) => (
                        <li key={c.name} className="flex items-center gap-2.5 text-[13px] text-white/90">
                          <span
                            className="h-2.5 w-2.5 flex-shrink-0"
                            style={{ background: c.color }}
                            aria-hidden
                          />
                          {c.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex-1">
                    <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-wide text-white/55">
                      {preview.stage} · primeros cruces
                    </span>
                    {preview.random ? (
                      <p className="text-[13px] leading-relaxed text-white/70">
                        Los enfrentamientos se sortean al azar al generar el cuadro.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5 font-mono text-[12.5px] text-white/85">
                        {preview.pairs.slice(0, 8).map((p, i) => (
                          <span key={i}>{p}</span>
                        ))}
                        {preview.pairs.length > 8 && (
                          <span className="text-white/45">
                            +{preview.pairs.length - 8} cruces más…
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="lg:w-44">
                    <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-wide text-white/55">
                      Total
                    </span>
                    <p className="text-[13px] text-white/90">
                      <span className="text-2xl font-bold text-white">{preview.total}</span>
                      <span className="ml-1.5 text-white/60">partidos en el cuadro</span>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-amber-300/90">{preview.error}</p>
              )}
            </div>
          </section>

          {error && (
            <div className="flex items-start gap-2 border-l-2 border-amber-500/60 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Action bar with live config summary */}
          <div className="mt-1 border border-white/12 border-t-2 border-t-[#38BDF8] bg-[#131922] p-6">
            <div className="mb-5 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[12px]">
              <span className="font-bold uppercase tracking-wider text-white/65">Resumen</span>
              <span className="bg-[#1b232c] px-2 py-1 font-medium text-white/90">
                {TEMPLATE_SHORT[templateId] ?? templateId}
              </span>
              <span className="text-white/40">·</span>
              <span className="bg-[#1b232c] px-2 py-1 font-medium text-white/90">
                Cruces: {seedMode === 'random' ? 'Aleatorios' : 'Por seed'}
              </span>
              {templateId !== 'custom' && (
                <>
                  <span className="text-white/40">·</span>
                  <span className="bg-[#1b232c] px-2 py-1 font-medium text-white/90">
                    {teamCount} equipos
                  </span>
                </>
              )}
              {cupFields.length > 0 && (
                <>
                  <span className="text-white/40">·</span>
                  <span className="bg-[#1b232c] px-2 py-1 font-medium text-white/90">
                    {cupFields.length} copas
                  </span>
                </>
              )}
              <span className="text-white/40">·</span>
              <span className="bg-[#1b232c] px-2 py-1 font-medium text-white/90">
                Horarios: {schedMode === 'auto' ? 'Automáticos' : 'Manuales'}
              </span>
            </div>
            {confirmForce === 'generate' ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction('regenerate', true)}
                  className="basalt-btn !rounded-none basalt-btn-primary text-xs"
                >
                  Sí, regenerar y borrar resultados
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setConfirmForce(null); setError(null); }}
                  className="basalt-btn !rounded-none text-xs"
                >
                  Cancelar
                </button>
              </div>
            ) : confirmForce === 'clear' ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction('clear', true)}
                  className="basalt-btn !rounded-none text-xs text-red-400 border-red-500/40"
                >
                  Sí, borrar el cuadro
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setConfirmForce(null); setError(null); }}
                  className="basalt-btn !rounded-none text-xs"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-2.5 w-2.5 flex-shrink-0 ${
                      board.hasBracket ? 'bg-[#22C55E]' : 'bg-white/30'
                    }`}
                    aria-hidden
                  />
                  <span className="text-[13px] text-white/75">
                    {board.hasBracket ? (
                      <>
                        <span className="font-semibold text-white">Cuadro generado.</span>{' '}
                        Podés regenerarlo o borrarlo.
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-white">Sin generar.</span>{' '}
                        Revisá la configuración y generá el cuadro.
                      </>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {board.hasBracket && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmForce('clear')}
                      className="basalt-btn !rounded-none inline-flex items-center gap-1.5 border-red-500/40 px-3 py-2.5 text-xs text-red-400"
                    >
                      <Trash2 size={14} />
                      Borrar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => runAction(board.hasBracket ? 'regenerate' : 'generate')}
                    className="basalt-btn !rounded-none basalt-btn-primary inline-flex items-center justify-center gap-2.5 px-7 py-3.5 text-[15px] font-bold"
                  >
                    {board.hasBracket ? <RefreshCw size={17} /> : <Wand2 size={17} />}
                    {busy
                      ? 'Procesando…'
                      : board.hasBracket
                        ? 'Regenerar cuadro'
                        : 'Generar playoff'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bracket visual */}
          <div className="border-t border-white/10 pt-6">
            <PlayoffBracketBoard data={board} />
          </div>
        </div>
      )}
    </div>
  );
}
