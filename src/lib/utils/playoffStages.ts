export const DEFAULT_PLAYOFF_STAGE_NAMES = [
  'Octavos de final',
  'Cuartos de final',
  'Semifinal',
  'Final',
];

const PLAYOFF_STAGE_NAMES_FROM_FINAL = [
  'Final',
  'Semifinal',
  'Cuartos de final',
  'Octavos de final',
  'Dieciseisavos de final',
  'Treintaidosavos de final',
];

export interface PlayoffStageConfig {
  id?: string;
  name: string;
  orderIndex: number;
  matchCount: number;
}

type PlayoffStageInput = {
  name: string;
  matchCount?: number;
};

function normalizeNameList(values: unknown[]) {
  const seen = new Set<string>();

  return values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function toPositiveInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function readStageMatchCount(stage: Record<string, unknown>) {
  return toPositiveInteger(
    stage.matchCount ?? stage.matchesCount ?? stage.match_count ?? stage.matches,
    0,
  );
}

function normalizeStageInputs(settingsOrStages: unknown): PlayoffStageInput[] {
  const seen = new Set<string>();
  const addStage = (value: unknown, fallbackMatchCount?: unknown): PlayoffStageInput | null => {
    const name = typeof value === 'string'
      ? value.trim()
      : value && typeof value === 'object'
        ? String((value as Record<string, unknown>).name ?? '').trim()
        : '';

    if (!name) return null;
    const key = name.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);

    const matchCount = value && typeof value === 'object'
      ? readStageMatchCount(value as Record<string, unknown>)
      : toPositiveInteger(fallbackMatchCount, 0);

    return {
      name,
      ...(matchCount > 0 ? { matchCount } : {}),
    };
  };

  if (Array.isArray(settingsOrStages)) {
    return settingsOrStages
      .map((stage) => addStage(stage))
      .filter((stage): stage is PlayoffStageInput => Boolean(stage));
  }

  const source = settingsOrStages && typeof settingsOrStages === 'object'
    ? settingsOrStages as Record<string, unknown>
    : {};

  if (Array.isArray(source.playoffStages)) {
    const stages = source.playoffStages
      .map((stage) => addStage(stage))
      .filter((stage): stage is PlayoffStageInput => Boolean(stage));
    if (stages.length > 0) return stages;
  }

  const legacyNames = Array.isArray(source.playoff_stage_names)
    ? source.playoff_stage_names
    : [];
  const legacyCounts = Array.isArray(source.playoffStageMatchCounts)
    ? source.playoffStageMatchCounts
    : Array.isArray(source.playoff_match_counts)
      ? source.playoff_match_counts
      : [];

  return legacyNames
    .map((name, index) => addStage(name, legacyCounts[index]))
    .filter((stage): stage is PlayoffStageInput => Boolean(stage));
}

export function isPlayoffPhaseType(phaseType: string | null | undefined) {
  return phaseType === 'playoff' || phaseType === 'knockout';
}

export function normalizePlayoffStageNames(settingsOrNames: unknown) {
  return normalizeNameList(normalizeStageInputs(settingsOrNames).map((stage) => stage.name));
}

export function buildPlayoffStages(
  stagesOrNames: Array<string | PlayoffStageInput>,
  matchCounts: number[] = [],
): PlayoffStageConfig[] {
  const stageInputs = normalizeStageInputs(stagesOrNames);
  const names = normalizeNameList(stageInputs.map((stage) => stage.name));

  return names.map((name, index) => {
    const sourceStage = stageInputs.find((stage) => stage.name.toLowerCase() === name.toLowerCase());
    const matchCount = sourceStage?.matchCount ?? toPositiveInteger(matchCounts[index], 0);

    return {
    id: `playoff_stage_${index + 1}`,
    name,
    orderIndex: index + 1,
    matchCount: Math.max(1, matchCount || 1),
  };
  });
}

export function getPlayoffTeamsCount(settings: unknown) {
  const source = settings && typeof settings === 'object'
    ? settings as Record<string, unknown>
    : {};
  const teamsCount = Number(source.teamsCount);

  return Number.isFinite(teamsCount) ? Math.max(0, Math.floor(teamsCount)) : 0;
}

export function getExpectedPlayoffStageCount(teamsCount: number) {
  const normalizedTeams = Math.max(0, Math.floor(Number(teamsCount) || 0));
  if (normalizedTeams < 2) return 0;

  return Math.ceil(Math.log2(normalizedTeams));
}

export function getDefaultPlayoffStageNames(teamsCount: number) {
  const stageCount = getExpectedPlayoffStageCount(teamsCount);
  if (stageCount <= 0) return DEFAULT_PLAYOFF_STAGE_NAMES;

  const names = Array.from({ length: stageCount }, (_, index) => {
    const name = PLAYOFF_STAGE_NAMES_FROM_FINAL[index];
    if (name) return name;

    const teamsAtRound = 2 ** (index + 1);
    return `Ronda de ${teamsAtRound}`;
  });

  return names.reverse();
}

export function getDefaultPlayoffStages(teamsCount: number) {
  const names = getDefaultPlayoffStageNames(teamsCount);
  const matchCounts = getPlayoffMatchCounts(teamsCount, names.length);

  return names.map((name, index) => ({
    id: `playoff_stage_${index + 1}`,
    name,
    orderIndex: index + 1,
    matchCount: Math.max(1, matchCounts[index] || 1),
  }));
}

export function resolvePlayoffStagesForTeams(
  settingsOrStages: unknown,
  teamsCount: number,
): PlayoffStageConfig[] {
  const expectedCount = getExpectedPlayoffStageCount(teamsCount);
  const inputs = normalizeStageInputs(settingsOrStages);

  if (expectedCount <= 0) {
    return buildPlayoffStages(inputs);
  }

  const defaults = getDefaultPlayoffStages(teamsCount);
  let resolvedInputs = inputs;

  if (resolvedInputs.length === 0) {
    return defaults;
  }

  if (resolvedInputs.length > expectedCount) {
    resolvedInputs = resolvedInputs.slice(resolvedInputs.length - expectedCount);
  } else if (resolvedInputs.length < expectedCount) {
    const missingCount = expectedCount - resolvedInputs.length;
    resolvedInputs = [
      ...defaults.slice(0, missingCount),
      ...resolvedInputs,
    ];
  }

  return resolvedInputs.map((stage, index) => ({
    id: `playoff_stage_${index + 1}`,
    name: stage.name,
    orderIndex: index + 1,
    matchCount: Math.max(1, stage.matchCount ?? defaults[index]?.matchCount ?? 1),
  }));
}

export function resolvePlayoffStageNamesForTeams(
  settingsOrNames: unknown,
  teamsCount: number,
) {
  return resolvePlayoffStagesForTeams(settingsOrNames, teamsCount).map((stage) => stage.name);
}

export function getPlayoffMatchCounts(teamsCount: number, stagesCount: number) {
  const normalizedTeams = Math.max(0, Math.floor(Number(teamsCount) || 0));
  const normalizedStages = Math.max(0, Math.floor(Number(stagesCount) || 0));
  const expectedStages = getExpectedPlayoffStageCount(normalizedTeams);

  if (normalizedTeams < 2 || normalizedStages === 0 || expectedStages === 0) {
    return Array.from({ length: normalizedStages }, () => 0);
  }

  const activeStages = Math.min(normalizedStages, expectedStages);
  const bracketSize = 2 ** expectedStages;
  const byes = bracketSize - normalizedTeams;
  let teamsInRound = normalizedTeams;

  return Array.from({ length: normalizedStages }, (_, index) => {
    if (index >= activeStages || teamsInRound < 2) return 0;

    if (index === 0) {
      const matches = Math.max(1, Math.floor((normalizedTeams - byes) / 2));
      teamsInRound = matches + byes;
      return matches;
    }

    const matches = Math.floor(teamsInRound / 2);
    teamsInRound = matches;
    return Math.max(0, matches);
  });
}
